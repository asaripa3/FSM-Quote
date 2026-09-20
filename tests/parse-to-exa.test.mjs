import "./register.mjs";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = join(dirname(import.meta.dirname));
function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(join(root, name), "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq);
        let value = trimmed.slice(eq + 1);
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value;
      }
    } catch { /* optional */ }
  }
}

loadDotEnv();
process.env.LIVEKIT_API_KEY ||= "test-key";
process.env.LIVEKIT_API_SECRET ||= "test-secret";
process.env.EXA_API_KEY ||= "test-exa";

const { POST: parsePost } = await import("../app/api/parse/route.ts");
const { discoverParts } = await import("../lib/server/discovery.ts");

const CORE_NOTE = `Men's restroom, second floor. Sloan Royal 111 water closet keeps running after flush — the diaphragm looks worn and the vacuum breaker sleeve is cracked. The Regal urinal beside it is weeping at the diaphragm too. Replace both. Work order says we ordered 3301150 for the closet last time. About 45 minutes labor.`;

/** Stretch a real inspection into ~1000 words without changing the faults. */
function longFieldNote() {
  const extra = [
    "Building engineer walked the fixture wall with me after breakfast service.",
    "The restroom is on the guest-room corridor, not the lobby bank.",
    "Royal 111 is the exposed chrome closet valve on the left stall.",
    "The handle still returns, so this is not a stuck handle packing.",
    "Bowl refill never stops; water sheet is visible in the bowl after each flush.",
    "Diaphragm face is glazed and the relief path looks scored.",
    "Vacuum breaker cap is original; the sleeve has a longitudinal crack.",
    "No bypass tube, no tank, no fill valve — this is a flushometer closet.",
    "Regal urinal is the exposed valve on the same carrier, one fixture to the right.",
    "Urinal weeps at the diaphragm after a flush, not at the vacuum breaker.",
    "Do not order a closet kit for the urinal; they are different valves.",
    "Customer name, room numbers and the work-order contact must stay off supplier searches.",
    "Labor on site is about forty-five minutes including isolation and wipe-down.",
  ];
  const chunks = [];
  while (chunks.join(" ").split(/\s+/).length < 1000) {
    chunks.push(extra.join(" "));
  }
  return `${CORE_NOTE}\n\n${chunks.join(" ")}`.trim();
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function llmPartsPayload() {
  return {
    summary: "Sloan Royal 111 closet runs after flush; Regal urinal weeps at the diaphragm.",
    equipment: "Sloan Royal 111 water closet flushometer and Sloan Regal urinal",
    laborHours: 0.75,
    questions: ["Confirm the Regal urinal flow rate on the fixture plate."],
    parts: [
      {
        description: "worn closet diaphragm and cracked vacuum breaker sleeve",
        query: "Sloan Royal 111 water closet diaphragm vacuum breaker repair kit 3301150",
        quantity: 1,
        sku: "3301150",
        equipment: "Sloan Royal 111 water closet flushometer",
      },
      {
        description: "weeping urinal diaphragm",
        query: "Sloan Regal urinal diaphragm repair kit",
        quantity: 1,
        sku: "",
        equipment: "Sloan Regal urinal flushometer",
      },
    ],
  };
}

test("a ~1000-word note is sent in full to LiveKit chat completions, not regex-split", async (t) => {
  const note = longFieldNote();
  assert.ok(wordCount(note) >= 1000, `expected >= 1000 words, got ${wordCount(note)}`);

  const livekitCalls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes("agent-gateway.livekit.cloud/v1/chat/completions")) {
      livekitCalls.push({ url: href, body: JSON.parse(init.body) });
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(llmPartsPayload()) } }] });
    }
    throw new Error(`unexpected fetch ${href}`);
  };

  const res = await parsePost(new Request("http://localhost/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trade: "plumbing", note }),
  }));
  const parsed = await res.json();
  assert.equal(res.status, 200, parsed.error);
  assert.equal(livekitCalls.length, 1);
  const call = livekitCalls[0];
  assert.equal(call.body.model, "openai/gpt-4.1-mini");
  assert.equal(call.body.response_format.type, "json_object");
  assert.equal(call.body.temperature, 0);
  assert.equal(call.body.messages[0].role, "system");
  assert.match(call.body.messages[0].content, /extract a plumbing field inspection into JSON/i);
  assert.equal(call.body.messages[1].role, "user");
  assert.equal(call.body.messages[1].content, note, "the entire note is the user message — no regex chunking");
  assert.equal(parsed.knownParts.length, 2);
  assert.equal(parsed.laborHours, 0.75);
  // What the pipeline actually routes on: a description, the equipment it sits on, and the intent.
  assert.ok(parsed.knownParts.every((p) => typeof p.description === "string" && p.description.length > 3));
  assert.ok(parsed.knownParts.every((p) => p.intent && typeof p.intent.rawContext === "string"));
});

test("a structured equipment field is read, not rejected as malformed", async (t) => {
  // A long note naming several fixtures comes back with equipment as an object rather than a sentence.
  // That is a fair reading of the note, and rejecting the whole parse over its shape loses a good one.
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url) => {
    if (String(url).includes("agent-gateway.livekit.cloud/v1/chat/completions")) {
      const payload = llmPartsPayload();
      payload.equipment = { manufacturer: "Sloan", model: "Royal 111", fixture: "exposed water closet" };
      payload.summary = ["Diaphragm worn", "vacuum breaker sleeve cracked"];
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(payload) } }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const res = await parsePost(new Request("http://localhost/api/parse", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trade: "plumbing", note: longFieldNote() }),
  }));
  const parsed = await res.json();
  assert.equal(res.status, 200, parsed.error);
  assert.equal(typeof parsed.equipment, "string");
  assert.match(parsed.equipment, /Sloan/);
  assert.match(parsed.equipment, /Royal 111/);
  assert.equal(typeof parsed.summary, "string");
  assert.match(parsed.summary, /vacuum breaker sleeve cracked/);
  assert.equal(parsed.knownParts.length, 2);
});

test("discover builds one Exa search query from the parsed faults, not from note prose", async (t) => {
  // `payload` here is the raw model response, not a ParsedJob: it carries `parts`, not `knownParts`.
  const payload = llmPartsPayload();
  payload.parts = payload.parts.map((p, i) => ({ id: `part-${i + 1}`, ...p }));

  // Same mapping the pipeline uses: description, the equipment it sits on, and any cited number.
  const incoming = payload.parts.map((p) => ({ id: p.id, description: p.description, equipment: p.equipment, sku: p.sku }));
  const fixtures = [...new Set(incoming.map((p) => p.equipment).filter(Boolean))];
  const expectedQuery = `${fixtures.join(" and ")} repair parts for ${incoming.map((p) => p.description).join(", ")}`;

  const workflow = readFileSync(join(root, "components/workflow.tsx"), "utf8");
  assert.ok(workflow.includes("/api/quote-stream"), "workspace uses the streamed pipeline");
  assert.ok(incoming.every((p) => p.description && typeof p.equipment === "string"));

  const exaCalls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href === "https://api.exa.ai/search") {
      const body = JSON.parse(init.body);
      exaCalls.push(body);
      const page = "Sloan Royal 111 exposed water closet flushometer. A-1101-A Royal Water Closet Diaphragm Performance Kit 1.6 gpf includes dual filtered diaphragm assembly and high back pressure vacuum breaker repair kit. Order number 3301070. 3301150 is a related handle kit.";
      return jsonResponse({
        resolvedSearchType: "auto",
        requestId: "test",
        costDollars: { total: 0.01 },
        results: [{ url: "https://www.sloan.com/products/flushometers/royal/royal-111", title: "Royal 111", text: page }],
        output: { content: { parts: [{
          name: "Royal Water Closet Diaphragm Performance Kit",
          manufacturer: "Sloan",
          partNumber: "A-1101-A",
          sku: "3301070",
          coversFaults: ["part-1"],
          reason: "Kit contents include the diaphragm and vacuum breaker.",
          evidence: "A-1101-A Royal Water Closet Diaphragm Performance Kit 1.6 gpf includes dual filtered diaphragm assembly and high back pressure vacuum breaker repair kit",
          skuStatus: "unknown",
          skuNote: "",
        }] } },
      });
    }
    throw new Error(`unexpected fetch ${href}`);
  };

  // The pipeline is the only caller of discovery, so the contract is asserted against it directly.
  const discovery = await discoverParts(incoming);
  assert.equal(exaCalls.length, 1);
  assert.equal(exaCalls[0].query, expectedQuery);
  assert.equal(exaCalls[0].type, "auto");
  assert.ok(exaCalls[0].systemPrompt.includes("part-1: worn closet diaphragm"));
  assert.ok(!exaCalls[0].query.includes("Marriott"), "customer text is not the Exa search box");
  // The search phrase is composed from the fault descriptions, never written by the model.
  assert.ok(incoming.every((p) => exaCalls[0].query.includes(p.description)), "every fault description reaches the search");
  assert.equal(discovery.trace[0].endpoint, "POST /search");
  assert.equal(discovery.trace[0].query, expectedQuery);
  assert.ok(discovery.parts.length >= 1);
  assert.match(discovery.parts[0].searchQuery, /Sloan A-1101-A 3301070/);
});

test("live LiveKit model decomposes the long note into Exa-ready faults", async (t) => {
  const hasLiveKit = Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
    && process.env.LIVEKIT_API_KEY !== "test-key";
  if (process.env.FIELDQUOTE_LIVE_TEST !== "1" || !hasLiveKit) {
    t.skip("Live provider calls require FIELDQUOTE_LIVE_TEST=1 and configured keys");
    return;
  }

  const note = longFieldNote();
  const res = await parsePost(new Request("http://localhost/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trade: "plumbing", note }),
  }));
  const parsed = await res.json();
  assert.equal(res.status, 200, parsed.error);
  assert.ok(Array.isArray(parsed.knownParts) && parsed.knownParts.length >= 1, JSON.stringify(parsed));
  assert.ok(parsed.knownParts.every((p) => p.description));
  assert.ok(parsed.knownParts.some((p) => /diaphragm|vacuum|breaker|closet/i.test(`${p.description} ${p.equipment}`)));
  assert.ok(parsed.knownParts.every((p) => !/marriott|guest-room corridor contact/i.test(`${p.description} ${p.equipment}`)), "descriptions stay product-only");

  const incoming = payload.parts.map((p) => ({ id: p.id, description: p.description, equipment: p.equipment, sku: p.sku }));
  const fixtures = [...new Set(incoming.map((p) => p.equipment).filter(Boolean))];
  const exaQuery = `${fixtures.join(" and ") || incoming[0].description} repair parts for ${incoming.map((p) => p.description).join(", ")}`;
  console.log("\n--- live parse ---");
  console.log("note words:", wordCount(note));
  console.log("summary:", parsed.summary);
  console.log("equipment:", parsed.equipment);
  console.log("laborHours:", parsed.laborHours);
  console.log("parts:", parsed.knownParts.map((p) => ({ id: p.id, kind: p.kind, description: p.description, equipment: p.equipment, sku: p.sku })));
  console.log("questions:", parsed.questions);
  console.log("Exa identify query that discovery would send:\n ", exaQuery);
});
