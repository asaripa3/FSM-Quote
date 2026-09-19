export type JobSettings = { company: string; laborRate: number; markupPercent: number; supplierDomains: string; region: string; preferredDomains?: string };
/**
 * What class of purchase this line item is. The distinction is procurement, not mechanics: a failed
 * motor inside a disposal the technician has decided to replace whole is not a `part` to source, it
 * is a `unit`, and the thing to source is the appliance on the equipment plate.
 */
export type PurchaseKind = "part" | "unit" | "tool";
export type JobPart = { id: string; description: string; quantity: number; sku: string; equipment: string; kind?: PurchaseKind; intent?: PartIntent };
/** laborHours is the midpoint used for arithmetic; laborRange is what the technician actually said. */
export type ParsedJob = { summary: string; equipment: string; laborHours: number | null; laborRange?: { min: number; max: number } | null; parts: JobPart[]; questions: string[]; rawNote?: string };
export type SourceOption = { title: string; supplier: string; url: string; domain: string; price: number | null; currency: string; priceEvidence: string; sku: string; availability: string; image: string; retrievedAt: string; priceStatus?: "page-extracted" | "cached-page" | "needs-review"; currencyAssumed?: boolean; packQuantity?: number | null; packEvidence?: string; identityEvidence?: string; contentHash?: string; matchStatus?: "exact" | "needs-review" | "rejected"; conflicts?: string[]; missingChecks?: string[]; rankReason?: string; availabilityEvidence?: string };
/** What Exa + the model concluded actually fixes the fault, before any price is looked up. */
export type ResolvedPart = {
  id: string;
  partIds: string[];          // more than one when a single kit covers several reported faults
  name: string;
  manufacturer: string;
  partNumber: string;
  sku: string;
  reason: string;
  evidence: string;
  verified: boolean;          // ordered evidence and identifiers found; NOT a compatibility certification
  sourceUrl: string;
  sourceLabel: string;
  supporting: { url: string; label: string }[];   // every retrieved page that backs part of the quote
  searchQuery: string;
  route?: "exact" | "ambiguous";
  confidence?: "high" | "medium" | "low";
  conflicts?: string[];
  questions?: string[];
  constraints?: Constraint[];
};
/** One Exa call, recorded so the interface can show exactly what was asked of Exa and what it cost. */
export type ExaTrace = { step: string; endpoint: string; query: string; searchType: string; results: number; costDollars: number | null; ms: number; requestId?: string };
export type Discovery = { parts: ResolvedPart[]; unresolved: { partId: string; reason: string }[]; superseded?: { partId: string; reason: string }[]; pagesScanned: number; trace: ExaTrace[] };
export type PickedSource = { source: SourceOption; price: number; confirmed: boolean };
export const validAmount = (value: number, max = 100000) => Number.isFinite(value) && value >= 0 && value <= max;

/**
 * The counts the technician stated, mapped onto the candidates that answer them.
 *
 * "Four cartridges and a puller" is a fact about the job, so the cart opens on those numbers rather
 * than on one of each; without this the parsed quantity is validated and then never read, and a
 * four-cartridge repair prints as a one-cartridge estimate unless someone notices. A candidate
 * covering several faults takes the largest count among them: one kit answering two faults is still
 * one kit, while a fault asking for four is four.
 */
export function statedQuantities(discovery: Discovery, job: ParsedJob | null): Record<string, number> {
  if (!job) return {};
  return Object.fromEntries(discovery.parts.map(r => [r.id, Math.max(1, ...r.partIds.map(id => job.parts.find(p => p.id === id)?.quantity ?? 1))]));
}

export type Constraint = { field: string; value: string };
/** Work this item replaces, so the same repair is not quoted twice under two descriptions. */
export type Supersession = { subject: string; reason: string };
export type PartIntent = {
  rawContext: string;
  manufacturer: string;
  fixture: string;
  /** What the technician concluded had failed. Not necessarily what they intend to buy. */
  suspectedPart: string;
  /**
   * What the technician intends to source. For a whole-unit replacement that is the equipment on the
   * plate, not the component that failed inside it. This single field is what the search is built on.
   */
  subject: string;
  /**
   * What the technician explicitly excluded. Measured as the steadiest judgement the extraction makes,
   * so it decides whether a purchase is a whole unit as well as what not to quote back to them.
   */
  ruledOut: string[];
  supersedes: Supersession[];
  exactModel: string;
  route: "exact" | "ambiguous";
  constraints: Constraint[];
};
/** How many reported items went to each of the pipeline's four destinations. */
export type Routes = { exact: number; registry: number; sourced: number; tools: number; ambiguous: number; superseded: number };
export type PipelineStage = "understanding_input" | "resolving_part" | "searching_products" | "validating_results" | "comparing_suppliers" | "complete";
export type PipelineProgress = { stage: PipelineStage; message: string; partId?: string; query?: string; at: string };
export type ProductSearchResult = { query: string; sources: SourceOption[]; trace: ExaTrace[] };

/**
 * The reported work this estimate does not price, and why.
 *
 * Quoting part of a job is ordinary: a technician may order one repair today and come back for the
 * rest. Blocking the print until every fault is covered would refuse that, so the omission is
 * recorded on the estimate instead, where a customer reading the total can see it. A fault counts as
 * covered when a candidate answering it has been selected, whether or not other candidates for the
 * same fault were left alone.
 */
export function uncoveredWork(job: ParsedJob | null, discovery: Discovery | null, isPicked: (candidateId: string) => boolean) {
  if (!job) return [];
  const covered = new Set((discovery?.parts ?? []).filter(r => isPicked(r.id)).flatMap(r => r.partIds));
  return job.parts.filter(p => !covered.has(p.id)).map(p => ({
    label: p.description,
    reason: discovery?.superseded?.find(s => s.partId === p.id)?.reason
      ?? discovery?.unresolved.find(u => u.partId === p.id)?.reason
      ?? "No supplier option was selected for this item.",
  }));
}
