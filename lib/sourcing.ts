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
const GAP = /\s*(?:\.{3}|\u2026|\u22ef|[\u2022\u00b7]{2,}|-{3,})\s*/;

/**
 * How much of a quote is genuinely on the page, weighted by characters.
 *
 * All-or-nothing matching rejects faithful quotes: one paraphrased connective, a trademark glyph the
 * extraction re-typed, or a span taken from a sibling page sinks the whole excerpt. Fabricated evidence
 * behaves differently — none of it is anywhere. Measured on live pages: real quotes score 1.00, a quote
 * carrying one foreign span scores around 0.5, and an invented one scores 0.00.
 */
export function evidenceGrounding(evidence: string, text: string) {
  const segments = normalizeEvidence(evidence).split(GAP).map(v => v.trim()).filter(v => v.length >= 5);
  if (!segments.length) return 0;
  const page = normalizeEvidence(text);
  let found = 0, total = 0;
  for (const segment of segments) {
    total += segment.length;
    if (page.includes(segment)) found += segment.length;
  }
  return total ? found / total : 0;
}

/**
 * Whether a substantial span of the quote is verbatim on the page.
 *
 * A fraction-of-the-whole threshold punishes the wrong thing: an extraction that quotes three real spans
 * and one loose connective scores about 0.5 and is discarded even though its part number is on the page.
 * Fabrication looks different — no span of any length is anywhere. So anchor on the longest real span
 * instead, and let the identifier check carry the question of whether it is the right product.
 */
export function evidenceAnchored(evidence: string, text: string, minimum = 25) {
  const page = normalizeEvidence(text);
  return normalizeEvidence(evidence).split(GAP).map(v => v.trim())
    .some(segment => segment.length >= minimum && page.includes(segment));
}

export function evidenceOnPage(evidence: string, text: string) {
  const segments = normalizeEvidence(evidence).split(GAP).filter(Boolean);
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

/**
 * Trim a validated price excerpt for display. Retail pages interleave the selling price with financing
 * copy ("Pay $41.96 after $25 OFF ... opening a new card"), so showing the raw excerpt puts a second,
 * unrelated amount next to the price. Keep the line carrying the validated amount.
 */
export function priceExcerpt(evidence: string, price: number) {
  const clean = evidence.replace(/\*\*/g, "").replace(/\r/g, "");
  const amount = price.toFixed(2);
  const line = clean.split(/\n+/).map(l => l.trim()).filter(Boolean)
    .find(l => l.includes(amount) || l.includes(Number(price).toLocaleString("en-US", {minimumFractionDigits:2})));
  return (line ?? clean.replace(/\n+/g, " ")).replace(/\s+/g, " ").trim().slice(0, 180);
}

const VAGUE = /\b(?:n\/?a|none|null|unknown|tbd|various|multiple|generic|assorted|pre-?engineered|placeholder|standard|typical)\b/i;
/**
 * Pull a catalogue part number out of an identifier field. Extractions qualify them
 * ("A-1101-A (example for 1.6 gpf)"), and rejecting the whole string over its parenthetical discards a
 * real part number. A part number carries a digit and no vague wording; "Generic/Pre-engineered" has none.
 */
export function partIdentifier(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 120 || VAGUE.test(raw)) return "";
  const candidates = raw.split(/[(),;]/)[0].trim().split(/\s+/);
  for (let size = Math.min(2, candidates.length); size >= 1; size--) {
    for (let i = 0; i + size <= candidates.length; i++) {
      const token = candidates.slice(i, i + size).join(" ");
      if (token.length >= 3 && token.length <= 40 && /\d/.test(token) && /^[A-Za-z0-9][A-Za-z0-9 ./_-]*$/.test(token)) return token;
    }
  }
  return "";
}
