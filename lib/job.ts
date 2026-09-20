export type JobSettings = { company: string; laborRate: number; markupPercent: number; supplierDomains: string; region: string; preferredDomains?: string };
/**
 * What class of purchase this line item is. The distinction is procurement, not mechanics: a failed
 * motor inside a disposal the technician has decided to replace whole is not a `part` to source, it
 * is a `unit`, and the thing to source is the appliance on the equipment plate.
 */
export type PurchaseKind = "part" | "unit" | "tool";
export type JobPart = { id: string; description: string; quantity: number; sku: string; equipment: string; kind?: PurchaseKind; intent?: PartIntent;
  /**
   * The technician has already settled what this is; what is missing is a model that can be ordered.
   * A repair confirmed on site is decided in exactly the way a named tool is, so it is researched as a
   * buying question rather than diagnosed as a fault, and it is identified by the component itself
   * rather than by whether the retrieved pages happen to name the whole machine.
   */
  decided?: boolean };
/**
 * What the technician is looking at, and what they do not yet know.
 *
 * The note no longer has to contain a repair decision. It can stop at an observation and an
 * uncertainty, which is the ordinary case: the equipment is unfamiliar and the answer is on the open
 * web rather than in the company's own systems.
 */
export type Brief = {
  equipment: string;
  manufacturer: string;
  model: string;            // the designation on the plate, when the note gives one
  serial: string;
  faultCodes: string[];
  symptoms: string[];
  alreadyChecked: string[];
  stillUncertain: string[];
  /** Requirements the note states for the job itself, such as a 120 V coil. Grounded in the note. */
  constraints: Constraint[];
  /** Whether anything needs researching before a part can be named. Decided locally, costs nothing. */
  needsResearch: boolean;
};

/** laborHours is the midpoint used for arithmetic; laborRange is what the technician actually said. */
export type ParsedJob = { summary: string; equipment: string; laborHours: number | null; laborRange?: { min: number; max: number } | null; brief: Brief; knownParts: JobPart[]; questions: string[]; rawNote?: string };

/** How close a retrieved source comes to the machine in front of the technician. */
export type ModelMatch = "exact" | "family" | "manufacturer" | "none";
/** `mirror` is a host whose business is republishing other people's manuals: documentation, not the maker. */
export type SourceKind = "oem" | "mirror" | "distributor" | "practitioner" | "forum" | "unknown";
export type EvidenceStrength = "authoritative" | "corroborating" | "anecdotal";
export type ResearchSource = { url: string; title: string; domain: string; highlight: string; kind: SourceKind; strength: EvidenceStrength; match: ModelMatch };
/**
 * A component the documentation associates with this failure. Not a diagnosis, and not a purchase.
 *
 * `support` is the verbatim excerpt from a retained source that backs it, and `sourceUrls` are the
 * sources that excerpt was found on. A path that cannot produce either is withheld: the evidence
 * level is derived from those sources, never taken from the model's own label.
 */
export type RepairPath = { component: string; rationale: string; confirmBy: string;
  /** Derived from where the support was found. `documented` is a service manual on a host that is not the maker. */
  evidenceLevel: "oem" | "documented" | "corroborated" | "field_only"; support: string; sourceUrls: string[] };
export type ResearchPacket = { question: string; evidenceSummary: string;
  /** The practitioner top-up was attempted and did not return. The OEM packet still stands. */
  fieldSourcesUnavailable?: boolean;
  /**
   * Nothing readable survived retrieval, so there is no documentation to report either way.
   *
   * This is a different outcome from documentation that read the equipment and did not support the
   * report, and it must not be shown as one: a summary and a list of checks with no page behind them
   * is the generated-claim problem the support gate exists to remove, arriving through another field.
   */
  documentationUnavailable?: boolean;
  /** What the documentation does not support about the report itself, such as a code this unit lacks. */
  contradicts: string;
  /** The verbatim excerpt backing the contradiction, and where it was found. Both or neither. */
  contradictsSupport: string;
  contradictsSourceUrls: string[]; checkBeforeReplacing: string[]; repairPaths: RepairPath[]; sources: ResearchSource[]; pagesRead: number; trace: ExaTrace[] };
/** What the technician found when they ran the checks. The gate everything downstream waits on. */
/**
 * What the technician established on site, carried whole into sourcing.
 *
 * The model and the stated requirements travel with it because the sourcing phase makes no model
 * call: without them a model-specific research phase would hand procurement a generic buying
 * question, which is how a 120 V requirement and a 48TCED08A2A6 plate get lost between the two.
 */
export type Confirmation = { component: string; findings: string; equipment?: string;
  manufacturer?: string; model?: string; constraints?: Constraint[]; quantity?: number };
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
 * What a ticked row puts in the estimate.
 *
 * This used to require the page to state a pack size of one, on the reasoning that an unlabelled price
 * might be for a pack. Measured over twelve real supplier rows, one stated it. Supplier pages simply do
 * not write "sold as each", and the extraction is instructed never to infer it, so three of every four
 * priced rows arrived in the estimate as $0.00 and the cart read as broken. The listed price is carried
 * instead, with the pack caution travelling beside it: the estimate line stays editable, states what the
 * page did and did not say, and cannot be printed until the estimator confirms fit, pack size and price.
 */
export const openingPrice = (source: SourceOption) => source.price ?? 0;

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
  return Object.fromEntries(discovery.parts.map(r => [r.id, Math.max(1, ...r.partIds.map(id => job.knownParts.find(p => p.id === id)?.quantity ?? 1))]));
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
export type PipelineStage = "understanding_input" | "retrieving_knowledge" | "reading_documentation" | "awaiting_confirmation" | "resolving_part" | "searching_products" | "validating_results" | "comparing_suppliers" | "complete";
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
export function uncoveredWork(job: ParsedJob | null, discovery: Discovery | null, isPicked: (candidateId: string) => boolean,
  answeredByConfirmation?: (reportedDescription: string) => boolean) {
  if (!job) return [];
  const covered = new Set((discovery?.parts ?? []).filter(r => isPicked(r.id)).flatMap(r => r.partIds));
  // A confirmed repair is sourced under its own id, so nothing it prices can ever match a reported
  // item by id. Without this the estimate lists the very fault it just quoted as "not included": the
  // note reports a pressure switch, the technician confirms the pressure switch, and the customer
  // reads that the pressure switch was excluded. Matched on the work described, and only once
  // something is actually priced.
  const priced = (discovery?.parts ?? []).some(r => isPicked(r.id));
  const answered = (p: JobPart) => Boolean(priced && answeredByConfirmation?.(p.description));
  return job.knownParts.filter(p => !covered.has(p.id) && !answered(p)).map(p => ({
    label: p.description,
    reason: discovery?.superseded?.find(s => s.partId === p.id)?.reason
      ?? discovery?.unresolved.find(u => u.partId === p.id)?.reason
      ?? "No supplier option was selected for this item.",
  }));
}
