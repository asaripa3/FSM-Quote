/** Conservative, deterministic checks on provider output. These prove text presence, not mechanical fit. */
export const normalizeEvidence = (value: string) => value.toLowerCase().normalize("NFKC")
  .replace(/[‐‑–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();

export function containsIdentifier(text: string, identifier: string) {
  const value = normalizeEvidence(identifier).trim();
  if (!value || value.length < 2) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(normalizeEvidence(text));
}

/** Ordered excerpts may skip table columns, but may not invent or reorder the words within an excerpt. */
export function evidenceOnPage(evidence: string, text: string) {
  const segments = normalizeEvidence(evidence).split(/\s*(?:\.{3}|…)\s*/).filter(Boolean);
  if (!segments.length || segments.some(s => s.length < 5)) return false;
  const page = normalizeEvidence(text);
  let cursor = 0;
  for (const segment of segments) {
    const index = page.indexOf(segment, cursor);
    if (index < 0) return false;
    cursor = index + segment.length;
  }
  return true;
}

/** Currency-token boundaries prevent $41.98 from matching $141.98 or a model number. */
export function priceOnPage(price: number, evidence: string, text: string) {
  if (!Number.isFinite(price) || price <= 0 || price > 100000 || !evidenceOnPage(evidence, text)) return false;
  const prices = [...evidence.matchAll(/(?:US\s*\$|USD\s*\$?|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)(?![\d.])/gi),
    ...evidence.matchAll(/(?<![\d.,])(\d+(?:,\d{3})*(?:\.\d{2})?)\s*USD\b/gi)];
  return prices.some(m => Math.round(Number(m[1].replaceAll(",", "")) * 100) === Math.round(price * 100));
}

export function successfulFreshContent(status: { status?: string; source?: string } | undefined) {
  // An explicit cached result cannot establish that this price was just refreshed.
  return status?.status === "success" && status.source !== "cached";
}

/**
 * Whether the page text can be quoted at all. Major retailers (Home Depot, Lowe's, Amazon) refuse live
 * crawling, so demanding a fresh crawl there yields no page and therefore no price, ever. Cached text is
 * still the retailer's own page and is accepted for extraction; the caller must label it as not-live.
 */
export function usableContent(status: { status?: string } | undefined) {
  return status?.status === "success";
}
