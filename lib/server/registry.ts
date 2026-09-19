import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Constraint, JobPart, ResolvedPart } from "@/lib/job";

/**
 * Resolved Part Registry.
 *
 * This is not a cache of prompt output. Memoising an LLM response keyed on note text would hit almost
 * never — two technicians describe the same fault differently — and would go stale invisibly.
 *
 * What is worth keeping is the *conclusion*: that "older Moen single-handle shower, dripping after
 * shutoff" resolves to a Moen 1222 cartridge, with the evidence that established it and the date it was
 * last confirmed. The second technician with that symptom skips discovery entirely and goes straight to
 * product search, which is the routing rule in the plan:
 *
 *     known part, high confidence  -> Exa product search directly
 *     unknown / ambiguous          -> Exa discovery -> resolve -> save canonical part
 *
 * A record is only ever a starting point. Prices are never stored, because they move; every hit still
 * runs a live product search, and the record carries lastVerifiedAt so a stale conclusion is re-checked
 * rather than trusted forever.
 */
export type RegistryRecord = {
  canonicalPartId: string;
  trade: string;
  manufacturer: string;
  model: string;               // the manufacturer's designation, e.g. A-1101-A
  sku: string;                 // the distributor's order number, e.g. 3301070
  name: string;
  aliases: string[];           // fixture and symptom wordings that have resolved here before
  specifications: Constraint[];
  knownSupplierUrls: string[];
  evidence: string;
  evidenceSource: string;
  lastVerifiedAt: string;
  hits: number;
};

/** How long a resolution stands before it is re-researched rather than reused. */
const STALE_AFTER_DAYS = 90;
const MAX_ALIASES = 12, MAX_SUPPLIER_URLS = 8;

const strip = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
/** Generic trade words carry no identifying weight, so they are not part of the key. */
const NOISE = new Set(["the","and","for","with","a","an","of","in","on","is","its","this","that","replacement","replace","repair","new","old","part","parts","kit","assembly","unit","needs","need","broken","faulty","bad","worn","leaking","cracked"]);
/**
 * The key is built from the technician's own wording, never from the resolved part. A record written
 * under "Sloan Valve Company" could never be read back by a note that says "Sloan", so both sides use
 * the parsed intent and nothing else. Exported so the seed is generated with this exact function.
 */
export function registryKey(trade: string, fixture: string, suspectedPart: string, manufacturer: string) {
  const words = [...new Set(`${manufacturer} ${fixture} ${suspectedPart}`.split(/\s+/).map(strip).filter(w => w && !NOISE.has(w)))].sort();
  return `${strip(trade)}::${words.join("-")}`;
}

/** Records shipped with the app: resolutions already confirmed against manufacturer documentation. */
let seeded: Map<string, RegistryRecord> | undefined;
async function seed() {
  if (seeded) return seeded;
  seeded = new Map();
  try {
    const raw = await readFile(join(process.cwd(), "lib", "server", "registry.seed.json"), "utf8");
    for (const record of JSON.parse(raw) as RegistryRecord[]) seeded.set(record.canonicalPartId, record);
  } catch { /* An absent or unreadable seed simply means an empty registry. */ }
  return seeded;
}

/**
 * Records learned during this deployment's lifetime.
 *
 * A serverless instance is short-lived and there are several of them, so this survives a warm instance
 * and nothing more. Durable learning wants a shared store (Vercel KV, Postgres); the interface below is
 * the only thing that would change, and the seed file is how a confirmed resolution is promoted today.
 */
const learned = new Map<string, RegistryRecord>();

const isStale = (record: RegistryRecord) =>
  Date.now() - Date.parse(record.lastVerifiedAt) > STALE_AFTER_DAYS * 86_400_000;

/** The words a description is identified by, with trade filler removed. */
export function descriptorTokens(fixture: string, suspectedPart: string, manufacturer: string) {
  return new Set(`${manufacturer} ${fixture} ${suspectedPart}`.split(/\s+/).map(strip).filter(w => w && !NOISE.has(w)));
}

/**
 * Exact keys cannot work here. The same note parses to "Sloan Royal 111 flushometer" on one run and
 * "flushometer" on the next, so a key built from that text almost never repeats and the registry would
 * never hit. Match on descriptor overlap instead: most of what this job says must appear in the record,
 * and where a manufacturer is named on both sides it has to be the same one.
 */
const MIN_OVERLAP = 0.6;
function bestMatch(records: Iterable<RegistryRecord>, trade: string, wanted: Set<string>, manufacturer: string) {
  if (wanted.size < 2) return null;
  let best: RegistryRecord | null = null, bestScore = 0;
  for (const record of records) {
    if (strip(record.trade) !== strip(trade)) continue;
    const known = descriptorTokens(record.aliases.join(" "), `${record.name} ${record.model}`, record.manufacturer);
    const maker = strip(manufacturer);
    // A named manufacturer that the record does not share is a different product line, not a variant.
    if (maker && ![...known].some(k => k === maker || k.startsWith(maker) || maker.startsWith(k))) continue;
    const overlap = [...wanted].filter(w => known.has(w)).length / wanted.size;
    if (overlap >= MIN_OVERLAP && overlap > bestScore) { best = record; bestScore = overlap; }
  }
  return best;
}

export async function lookupPart(trade: string, part: JobPart): Promise<RegistryRecord | null> {
  const intent = part.intent;
  const fixture = intent?.fixture || part.equipment, suspected = intent?.suspectedPart || part.description;
  const key = registryKey(trade, fixture, suspected, intent?.manufacturer || "");
  const wanted = descriptorTokens(fixture, suspected, intent?.manufacturer || "");
  const record = learned.get(key) ?? (await seed()).get(key)
    ?? bestMatch(learned.values(), trade, wanted, intent?.manufacturer || "")
    ?? bestMatch((await seed()).values(), trade, wanted, intent?.manufacturer || "");
  if (!record || isStale(record)) return null;
  // A stated constraint the record does not carry cannot be answered from memory; research it instead.
  const required = intent?.constraints ?? [];
  const satisfied = required.every(c => record.specifications.some(s =>
    strip(s.field) === strip(c.field) && strip(s.value) === strip(c.value)));
  return satisfied ? record : null;
}

/** Turn a registry hit into a candidate the product search can price immediately. */
export function candidateFromRecord(record: RegistryRecord, part: JobPart): ResolvedPart {
  return {
    id: `registry-${part.id}`, partIds: [part.id], name: record.name,
    manufacturer: record.manufacturer, partNumber: record.model, sku: record.sku,
    reason: `Resolved before for this equipment and symptom, and confirmed on ${new Date(record.lastVerifiedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}. Exa is pricing it now; fit still needs your review.`,
    evidence: record.evidence, verified: true,
    sourceUrl: record.evidenceSource, sourceLabel: (() => { try { return new URL(record.evidenceSource).hostname.replace(/^www\./, ""); } catch { return "registry"; } })(),
    supporting: record.evidenceSource ? [{ url: record.evidenceSource, label: "previously verified" }] : [],
    searchQuery: [record.manufacturer, record.model, record.sku].filter(Boolean).join(" "),
    skuStatus: "unknown", skuNote: "", route: "exact", confidence: "high",
    constraints: record.specifications, conflicts: [], questions: [],
  };
}

/** Record a resolution that Exa established, so the next identical job skips discovery. */
export function rememberPart(trade: string, part: JobPart, resolved: ResolvedPart) {
  // Only an evidence-backed identifier is worth remembering; a guess would be repeated forever.
  if (!resolved.verified || !resolved.partNumber || resolved.confidence === "low") return;
  const intent = part.intent;
  // The technician's manufacturer wording, not the resolved legal name, or the write cannot be read back.
  const key = registryKey(trade, intent?.fixture || part.equipment, intent?.suspectedPart || part.description, intent?.manufacturer || "");
  const alias = `${intent?.fixture || part.equipment} ${intent?.suspectedPart || part.description}`.trim();
  const existing = learned.get(key);
  learned.set(key, {
    canonicalPartId: key, trade,
    manufacturer: resolved.manufacturer, model: resolved.partNumber, sku: resolved.sku, name: resolved.name,
    aliases: [...new Set([...(existing?.aliases ?? []), alias])].slice(0, MAX_ALIASES),
    specifications: resolved.constraints ?? existing?.specifications ?? [],
    knownSupplierUrls: [...new Set([...(existing?.knownSupplierUrls ?? []), ...resolved.supporting.map(s => s.url)])].slice(0, MAX_SUPPLIER_URLS),
    evidence: resolved.evidence, evidenceSource: resolved.sourceUrl,
    lastVerifiedAt: new Date().toISOString(), hits: existing?.hits ?? 0,
  });
}

/** Note that a remembered record was used, so a promoted seed can be ordered by real usage. */
export function creditHit(record: RegistryRecord) {
  const current = learned.get(record.canonicalPartId) ?? record;
  learned.set(record.canonicalPartId, { ...current, hits: current.hits + 1 });
}
