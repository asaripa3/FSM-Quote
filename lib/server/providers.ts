import "server-only";
import { createHmac } from "node:crypto";

// Server-only environment. Keys are read from process.env (Vercel project settings, or .env.local
// in development) and never reach the client.
export function secret(name: string) {
  return process.env[name] || "";
}
export function inferenceToken() {
  const key = secret("LIVEKIT_API_KEY"), secretKey = secret("LIVEKIT_API_SECRET");
  if (!key || !secretKey) throw new Error("LiveKit is not configured. Add LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the server.");
  const now = Math.floor(Date.now() / 1000);
  const encode = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: key, sub: "fieldquote", nbf: now - 5, exp: now + 300, inference: { perform: true } })}`;
  return `${body}.${createHmac("sha256", secretKey).update(body).digest("base64url")}`;
}
export async function modelJson(system: string, input: string, signal?: AbortSignal) {
  // JSON mode is rejected unless the word "json" appears in the messages, so guarantee it here rather than in every caller.
  const instruction = /json/i.test(system) || /json/i.test(input) ? system : `${system}\n\nRespond with a single JSON object.`;
  const res = await fetch("https://agent-gateway.livekit.cloud/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${inferenceToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: secret("FIELDQUOTE_MODEL") || "openai/gpt-4.1-mini", messages: [{ role: "system", content: instruction }, { role: "user", content: input }], response_format: { type: "json_object" }, temperature: 0, max_tokens: 2200 }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000), cache: "no-store",
  });
  if (!res.ok) {
    // The gateway explains rejections in the body; log it server-side rather than leaking provider internals to the client.
    console.error("LiveKit inference failed", res.status, await res.text().catch(() => ""));
    throw new Error(`Job analysis provider returned ${res.status}. Check LiveKit inference access and credits.`);
  }
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Job analysis returned no usable response. Please try again.");
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
}
async function exaRequest(endpoint: "search" | "contents", payload: object, signal?: AbortSignal) {
  const key = secret("EXA_API_KEY");
  if (!key) throw new Error("Exa is not configured. Add EXA_API_KEY on the server.");
  const res = await fetch(`https://api.exa.ai/${endpoint}`, { method: "POST", headers: { "x-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000), cache: "no-store" });
  if (!res.ok) {
    // Exa explains rejections in the body; log it server-side rather than leaking provider internals to the client.
    console.error(`Exa ${endpoint} failed`, res.status, await res.text().catch(() => ""));
    throw new Error(`Supplier search returned ${res.status}. Please retry or check your Exa account.`);
  }
  return res.json();
}
export const exaSearch = (payload: object, signal?: AbortSignal) => exaRequest("search", payload, signal);
export const exaContents = (payload: object, signal?: AbortSignal) => exaRequest("contents", payload, signal);
export function safeError(error: unknown) { return error instanceof Error && !/fetch failed|abort|timeout/i.test(error.message) ? error.message : "The provider could not finish the request. Please try again."; }
// Compare the browser-sent Origin against the host the browser actually connected to.
// request.url is normalised by the dev server (127.0.0.1 becomes localhost), so it is not a reliable comparison target.
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  try { return new URL(origin).host === host; } catch { return false; }
}
