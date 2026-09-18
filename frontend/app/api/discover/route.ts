import { exaSearch, safeError, sameOrigin } from "@/lib/server/providers";
import { isTradeId } from "@/lib/trades";
import type { Discovery, ExaTrace, ResolvedPart } from "@/lib/job";
export const runtime = "nodejs";

const EXCERPT = 2600;
type Incoming = { id: string; description: string; equipment: string; sku: string };
type Source = { url: string; title: string; domain: string; text: string; tokens: Set<string> };

const flatten = (v: string) => v.toLowerCase().replace(/[‘’“”]/g, "'").replace(/\s+/g, " ").trim();
const tokens = (v: string) => flatten(v).match(/[a-z0-9][a-z0-9./-]{2,}/g) ?? [];
/**
 * Share of the quote's words that genuinely appear on the page. Substring matching cannot be used: manufacturer
 * spec sheets are PDFs that arrive as "| cell | cell |" tables, so a faithful quote never matches them literally.
 * Measured against live pages: a real quote scores 1.00, the same wording with invented part codes scores 0.85,
 * and a quote lifted from a different page scores 0.72.
 */
const MIN_COVERAGE = 0.95;
/**
 * The evidence can be real and still describe the wrong fixture: asked about an invented "Sloan Imperial 9000",
 * a model happily returns a genuine, quotable kit for a different valve. So the fixture the technician named
 * must itself appear in the retrieved pages. Measured: real fixtures score 0.80-1.00, invented ones 0.20-0.67.
 */
const MIN_GROUNDING = 0.75;
function coverage(quoteTokens: string[], source: Source) {
  if (quoteTokens.length < 2) return 0;
  return quoteTokens.filter(t=>source.tokens.has(t)).length / quoteTokens.length;
}
/** Exa returns the quoted words; strip any framing the extraction wraps around them before scoring. */
const unwrapQuote = (v: string) => v.trim()
  .replace(/^(?:from\s+)?sources?\s*\[?\d+\]?\s*[:,-]?\s*/i, "")
  .replace(/^["'“‘]+|["'”’]+$/g, "")
  .trim();

const RULES = `You identify the orderable repair part that fixes reported faults on field-service equipment.
CONSOLIDATE: when one kit's documented contents cover several reported faults, return ONE entry whose coversFaults lists every fault id it covers. This matters more than anything else you do — a technician who orders a sub-component that is already inside a kit has wasted an order and a trip.
Never consolidate across different fixtures, different flow rates or different voltages.
evidence must be copied from the page you cite, never paraphrased, and long enough to prove the claim — the contents list or the compatibility statement. Spec sheets arrive as tables: copy the cells that carry the proof, joined by " ... ".
partNumber is the manufacturer's model designation (for example A-1101-A). sku is the distributor's catalogue/order number (for example 3301070). Never swap them.
A page often lists several kits differing only by flow rate or packaging. Pick the one matching the reported equipment and quote that kit's own text. Never describe one kit while quoting another.
skuStatus describes any part number the technician already cited: "current" if that exact number is still sold, "variant" if it is the same kit under different packaging or a regional code, "superseded" only if a page states it was replaced, "unknown" if the pages do not say. Put the one-sentence explanation in skuNote, or "" when nothing needs saying.
If the pages offer several variants that differ by flow rate, size or voltage and the reported fault does not say which applies, do NOT guess: leave that fault out of every coversFaults array so the estimator is asked to confirm the rating on site. Quoting the wrong rating is worse than quoting nothing.
Never invent a part number, SKU, flow rate or kit content. If the pages do not identify a part for a fault, leave that fault out of every coversFaults array.`;

// Exa caps outputSchema at 10 properties across the whole schema. The supplier search phrase is composed below from
// the identifiers, and the source page is the one whose text actually carries the quote, so neither is asked for.
const SCHEMA = { type:"object", required:["parts"], properties:{ parts:{ type:"array", maxItems:8, items:{ type:"object",
  required:["name","manufacturer","partNumber","sku","coversFaults","reason","evidence","skuStatus","skuNote"],
  properties:{ name:{type:"string"}, manufacturer:{type:"string"}, partNumber:{type:"string"}, sku:{type:"string"},
    coversFaults:{type:"array", items:{type:"string"}}, reason:{type:"string"}, evidence:{type:"string"},
    skuStatus:{type:"string", enum:["current","variant","superseded","unknown"]}, skuNote:{type:"string"} } } } } };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.json();
    if (!isTradeId(body.trade) || !Array.isArray(body.parts) || !body.parts.length || body.parts.length > 12) return Response.json({ error: "Nothing to research on this job." }, { status: 400 });
    const parts: Incoming[] = body.parts.slice(0,12).map((p: Record<string,unknown>) => ({ id: String(p.id ?? "").slice(0,60), description: String(p.description ?? "").slice(0,300), equipment: String(p.equipment ?? "").slice(0,300), sku: String(p.sku ?? "").slice(0,100) })).filter((p: Incoming) => p.id && p.description);
    if (!parts.length) return Response.json({ error: "Nothing to research on this job." }, { status: 400 });

    const fixtures = [...new Set(parts.map(p=>p.equipment).filter(Boolean))];
    const cited = parts.filter(p=>p.sku).map(p=>p.sku);
    // Exa reads the query like a search box; the rules and the fault ids belong in systemPrompt.
    const query = `${fixtures.join(" and ") || parts[0].description} repair parts for ${parts.map(p=>p.description).join(", ")}`;
    const systemPrompt = `${RULES}\n\nREPORTED FAULTS (use these exact ids in coversFaults):\n${parts.map(p=>`- ${p.id}: ${p.description}${p.equipment?` (on ${p.equipment})`:""}`).join("\n")}${cited.length?`\n\nPart numbers already on the work order: ${cited.join(", ")}. Say in skuNote whether each is still the number to order.`:""}`;

    const started = Date.now();
    // text as well as highlights: the evidence check below needs broad page context, not just the matched excerpt.
    const result = await exaSearch({ query, type:"auto", numResults:12, contents:{ highlights:true, text:{maxCharacters:EXCERPT} }, systemPrompt, outputSchema: SCHEMA }, request.signal);
    const trace: ExaTrace[] = [{ step:"Identify the part", endpoint:"POST /search", query, searchType:String(result.resolvedSearchType || "auto"), results:(result.results ?? []).length, costDollars: typeof result.costDollars?.total === "number" ? result.costDollars.total : null, ms: Date.now()-started }];

    const sources: Source[] = [];
    const seen = new Set<string>();
    for (const item of result.results ?? []) {
      try {
        const url = new URL(item.url);
        if (!['https:','http:'].includes(url.protocol) || seen.has(url.href)) continue;
        seen.add(url.href);
        const text = [String(item.text ?? ""), ...(item.highlights ?? [])].join(" ").slice(0,EXCERPT*2);
        sources.push({ url: url.href, title: String(item.title || url.hostname), domain: url.hostname.replace(/^www\./,""), text, tokens: new Set(tokens(text)) });
      } catch { /* Unusable result. */ }
    }
    const extracted = (result.output?.content?.parts ?? []) as Record<string,unknown>[];
    if (!sources.length) return Response.json({ error: "No manufacturer or distributor pages could be retrieved for this equipment." }, { status: 502 });

    // Faults whose equipment is never mentioned in anything Exa retrieved cannot be answered honestly.
    const corpus = new Set(sources.flatMap(s=>[...s.tokens]));
    const ungrounded = new Map<string,string>();
    for (const part of parts) {
      const t = tokens(part.equipment || part.description);
      if (t.length < 2) continue;
      if (t.filter(x=>corpus.has(x)).length / t.length < MIN_GROUNDING) ungrounded.set(part.id, `The retrieved pages never mention ${part.equipment || part.description}, so no part could be confirmed for it. Check the model designation on the equipment plate.`);
    }

    const ids = new Set(parts.map(p=>p.id));
    const resolved: ResolvedPart[] = [];
    for (const [i, raw] of extracted.slice(0,12).entries()) {
      const partIds = (Array.isArray(raw.coversFaults) ? raw.coversFaults : []).map(String).filter((id: string)=>ids.has(id) && !ungrounded.has(id));
      const name = String(raw.name ?? "").slice(0,200);
      if (!partIds.length || !name) continue;
      const evidence = unwrapQuote(String(raw.evidence ?? "")).slice(0,700);
      const quoteTokens = tokens(evidence);
      // Attribute the quote to whichever retrieved page actually carries its words.
      const source = sources.reduce((best, next)=> coverage(quoteTokens, next) > coverage(quoteTokens, best) ? next : best, sources[0]);
      const verified = coverage(quoteTokens, source) >= MIN_COVERAGE;
      const supporting = verified ? [{ url: source.url, label: source.domain }] : [];
      const status = ["current","variant","superseded","unknown"].includes(String(raw.skuStatus)) ? String(raw.skuStatus) as ResolvedPart["skuStatus"] : "unknown";
      resolved.push({ id:`resolved-${i+1}`, partIds, name, manufacturer:String(raw.manufacturer ?? "").slice(0,100), partNumber:String(raw.partNumber ?? "").slice(0,100), sku:String(raw.sku ?? "").slice(0,100),
        reason:String(raw.reason ?? "").slice(0,600), evidence, verified, sourceUrl:source.url, sourceLabel:source.domain, supporting,
        searchQuery:[String(raw.manufacturer ?? ""), String(raw.partNumber ?? ""), String(raw.sku ?? "")].map(v=>v.trim()).filter(Boolean).join(" ").slice(0,600) || name, skuStatus:status, skuNote:String(raw.skuNote ?? "").slice(0,300) });
    }
    const covered = new Set(resolved.flatMap(r=>r.partIds));
    const unresolved = parts.filter(p=>!covered.has(p.id)).map(p=>({ partId:p.id, reason: ungrounded.get(p.id) ?? "No single part could be confirmed for this fault. The retrieved pages list variants that differ by rating — confirm the flow rate, size or voltage on the equipment plate." })).slice(0,12);
    const payload: Discovery = { parts: resolved, unresolved, pagesScanned: sources.length, trace };
    return Response.json(payload);
  } catch(error) { return Response.json({ error: safeError(error) }, { status: 502 }); }
}
