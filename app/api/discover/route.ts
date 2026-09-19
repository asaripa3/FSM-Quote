import { exaSearch, safeError, sameOrigin } from "@/lib/server/providers";
import { containsIdentifier, evidenceOnPage } from "@/lib/sourcing";
import { isTradeId } from "@/lib/trades";
import type { Discovery, ExaTrace, ResolvedPart } from "@/lib/job";
export const runtime = "nodejs";

const EXCERPT = 12000;
type Incoming = { id: string; description: string; equipment: string; sku: string };
type Source = { url: string; title: string; domain: string; text: string; tokens: Set<string> };

const flatten = (v: string) => v.toLowerCase().replace(/[‘’“”]/g, "'").replace(/\s+/g, " ").trim();
const tokens = (v: string) => flatten(v).match(/[a-z0-9][a-z0-9./-]{2,}/g) ?? [];
/** Exa returns the quoted words; strip any framing the extraction wraps around them before scoring. */
/**
 * A required identifier field gets filled with a placeholder rather than left empty ("N/A (Generic)",
 * "Various (Generic/Pre-engineered)"). Enumerating every evasion is unwinnable, so require the value to
 * look like a catalogue part number instead: it carries a digit, no parentheses and at most one space.
 * Validated against real numbers (A-1101-A, QS-50-H, 25/5DVR, MAR 12905, S1-02440907000) and refusals.
 */
const VAGUE = /\b(?:n\/?a|none|null|unknown|tbd|various|multiple|generic|assorted|pre-?engineered|placeholder|standard|typical)\b/i;
const identifier = (v: unknown) => {
  const id = String(v ?? "").trim();
  if (id.length < 3 || id.length > 40 || VAGUE.test(id) || id.includes("(") || id.includes(")")) return "";
  if (!/\d/.test(id) || id.split(" ").length > 2) return "";
  return /^[A-Za-z0-9][A-Za-z0-9 ./_-]*$/.test(id) ? id : "";
};
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
    // Use one content view: technical tables need full context for the evidence check.
    const result = await exaSearch({ query, type:"auto", numResults:12, contents:{ text:true }, systemPrompt, outputSchema: SCHEMA }, request.signal);
    const trace: ExaTrace[] = [{ step:"Identify the part", endpoint:"POST /search", query, searchType:String(result.resolvedSearchType || "auto"), results:(result.results ?? []).length, costDollars: typeof result.costDollars?.total === "number" ? result.costDollars.total : null, ms: Date.now()-started, requestId: result.requestId }];

    const sources: Source[] = [];
    const seen = new Set<string>();
    for (const item of result.results ?? []) {
      try {
        const url = new URL(item.url);
        if (!['https:','http:'].includes(url.protocol) || seen.has(url.href)) continue;
        seen.add(url.href);
        const text = String(item.text ?? "").slice(0,EXCERPT);
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
      // Token coverage alone, measured: real fixtures score 0.80-1.00 and invented ones 0.20-0.67. A
      // supplier page sells the kit, not the fixture, so the fixture's own model number ("Royal 111")
      // is frequently absent from every page — demanding it rejects real equipment. Whether the cited
      // part actually fits is settled by the evidence check below, not by token presence here.
      if (t.filter(x=>corpus.has(x)).length / t.length < 0.75) ungrounded.set(part.id, `The retrieved pages never mention ${part.equipment || part.description}, so no part could be confirmed for it. Check the model designation on the equipment plate.`);
    }

    const ids = new Set(parts.map(p=>p.id));
    const unverifiable = new Map<string,string>();
    const resolved: ResolvedPart[] = [];
    for (const [i, raw] of extracted.slice(0,12).entries()) {
      const partIds = (Array.isArray(raw.coversFaults) ? raw.coversFaults : []).map(String).filter((id: string)=>ids.has(id) && !ungrounded.has(id));
      const name = String(raw.name ?? "").slice(0,200);
      if (!partIds.length || !name) continue;
      const evidence = unwrapQuote(String(raw.evidence ?? "")).slice(0,700);
      const partNumber = identifier(raw.partNumber), sku = identifier(raw.sku);
      const identifiers = [partNumber, sku].filter(Boolean);
      // Without a real part number or SKU there is nothing an estimator can order, whatever the pages said.
      if (!identifiers.length) continue;
      const source = sources.find(page=>evidenceOnPage(evidence,page.text)
        && identifiers.some(id=>containsIdentifier(evidence,id) || containsIdentifier(page.text,id))) ?? sources[0];
      // Text presence is weaker than engineering compatibility. The UI must call this evidence, never fit verification.
      // The quote must be verbatim on the cited page, and that same page must carry the part number.
      // Requiring the number inside the excerpt itself fails legitimate contents lists, which do not repeat it.
      const verified = evidenceOnPage(evidence,source.text) && identifiers.some(id=>containsIdentifier(evidence,id) || containsIdentifier(source.text,id));
      const supporting = verified ? [{ url: source.url, label: source.domain }] : [];
      // The premise is that nothing reaches the estimator on the model's word alone. A candidate whose quote
      // cannot be located on a retrieved page is not shown as a part: it becomes an unresolved fault with a
      // reason, so it can never be priced or quoted. Invented fixtures surface here.
      if (!verified) { for (const id of partIds) unverifiable.set(id, `A candidate part was suggested (${[String(raw.manufacturer ?? ""), partNumber].filter(Boolean).join(" ")}) but its supporting quote could not be found on any retrieved page, so it is not offered. Confirm the equipment model, or check the part with the manufacturer.`); continue; }
      const status = verified && ["current","variant","superseded","unknown"].includes(String(raw.skuStatus))
        && (raw.skuStatus !== "superseded" || /replac|supersed|obsolete/i.test(evidence))
        ? String(raw.skuStatus) as ResolvedPart["skuStatus"] : "unknown";
      resolved.push({ id:`resolved-${i+1}`, partIds, name, manufacturer:String(raw.manufacturer ?? "").slice(0,100), partNumber, sku,
        reason:String(raw.reason ?? "").slice(0,600), evidence, verified, sourceUrl:source.url, sourceLabel:source.domain, supporting,
        searchQuery:[String(raw.manufacturer ?? "").trim(), partNumber, sku].filter(Boolean).join(" ").slice(0,600), skuStatus:status, skuNote:status === "unknown" ? "" : String(raw.skuNote ?? "").slice(0,300) });
    }
    const covered = new Set(resolved.flatMap(r=>r.partIds));
    const unresolved = parts.filter(p=>!covered.has(p.id)).map(p=>({ partId:p.id, reason: ungrounded.get(p.id) ?? unverifiable.get(p.id) ?? "No catalogue part could be confirmed. This reads as a materials-and-labour line (pipe, fittings, strapping) rather than an orderable part — price it from your own material list, or add the equipment model if one applies." })).slice(0,12);
    const payload: Discovery = { parts: resolved, unresolved, pagesScanned: sources.length, trace };
    return Response.json(payload);
  } catch(error) { return Response.json({ error: safeError(error) }, { status: 502 }); }
}
