export type JobSettings = { company: string; laborRate: number; markupPercent: number; supplierDomains: string; region: string };
export type JobPart = { id: string; description: string; query: string; quantity: number; sku: string; equipment: string };
export type ParsedJob = { summary: string; equipment: string; laborHours: number | null; parts: JobPart[]; questions: string[] };
export type SourceOption = { title: string; supplier: string; url: string; domain: string; price: number | null; currency: string; priceEvidence: string; sku: string; availability: string; image: string; retrievedAt: string; priceStatus?: "page-extracted" | "cached-page" | "needs-review"; currencyAssumed?: boolean; packQuantity?: number | null; packEvidence?: string; identityEvidence?: string; contentHash?: string };
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
  skuStatus: "current" | "variant" | "superseded" | "unknown";
  skuNote: string;
};
/** One Exa call, recorded so the interface can show exactly what was asked of Exa and what it cost. */
export type ExaTrace = { step: string; endpoint: string; query: string; searchType: string; results: number; costDollars: number | null; ms: number; requestId?: string };
export type Discovery = { parts: ResolvedPart[]; unresolved: { partId: string; reason: string }[]; pagesScanned: number; trace: ExaTrace[] };
export type PickedSource = { source: SourceOption; price: number; confirmed: boolean };
export const validAmount = (value: number, max = 100000) => Number.isFinite(value) && value >= 0 && value <= max;
