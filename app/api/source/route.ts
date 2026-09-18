import { exaSearch, safeError, sameOrigin } from "@/lib/server/providers";
import type { ExaTrace, SourceOption } from "@/lib/job";
export const runtime = "nodejs";

// Third-party marketplaces are reseller listings, not supplier catalogues, so they are dropped
// unless the estimator explicitly allowed one in their supplier domains.
const MARKETPLACES = ["ebay.com","amazon.com","aliexpress.com","alibaba.com","temu.com","etsy.com","wish.com","dhgate.com","mercadolibre.com"];
// Search, social and reference hosts are never a supplier listing, whatever the estimator typed.
const NOT_A_SUPPLIER = ["google.com","bing.com","duckduckgo.com","yahoo.com","pinterest.com","reddit.com","youtube.com","facebook.com","instagram.com","x.com","twitter.com","quora.com","wikipedia.org"];
// Extractions sometimes return the string "null" or a scraped field label instead of a part number.
const cleanSku = (value: unknown) => { const sku = typeof value === "string" ? value.trim() : ""; return !sku || sku.length > 40 || sku.includes(":") || /^(?:null|none|n\/?a|unknown)$/i.test(sku) ? "" : sku; };
// Exa's image candidates include site furniture (logos, payment badges, an "Email Icon" SVG), never the product.
const NOT_A_PRODUCT_IMAGE = /logo|icon|sprite|placeholder|favicon|badge|banner|carousel|slider|email|social|payment|visa|mastercard|paypal|\.svg(?:$|\?)/i;
const MAX_PER_DOMAIN = 2, MAX_SOURCES = 12;

type ImageCandidate = { url: string; alt: string };
function pickProductImage(item: Record<string, unknown>): string {
  const extras = (item.extras ?? {}) as Record<string, unknown>;
  const rich = (Array.isArray(extras.richImageLinks) ? extras.richImageLinks : []).map((r): ImageCandidate =>
    typeof r === "string" ? { url: r, alt: "" } : { url: String((r as Record<string,unknown>)?.url ?? ""), alt: String((r as Record<string,unknown>)?.alt ?? "") });
  const plain = (Array.isArray(extras.imageLinks) ? extras.imageLinks : []).map((u): ImageCandidate => ({ url: typeof u === "string" ? u : "", alt: "" }));
  // The result's own image is the page's primary product shot; the extras are fallbacks.
  for (const c of [{ url: typeof item.image === "string" ? item.image : "", alt: "" }, ...rich, ...plain]) {
    if (!/^https:\/\//i.test(c.url) || c.url.length > 600) continue;
    if (NOT_A_PRODUCT_IMAGE.test(c.url) || NOT_A_PRODUCT_IMAGE.test(c.alt)) continue;
    return c.url;
  }
  return "";
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.query !== "string" || body.query.length < 4 || body.query.length > 600) return Response.json({ error: "Enter a part description or SKU to search." }, { status:400 });
    const domains: string[] = typeof body.domains === "string" ? body.domains.split(/[\s,]+/).map((d:string)=>d.trim().toLowerCase()).filter(Boolean) : [];
    if (domains.length > 12 || domains.some(d=> !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(d))) return Response.json({ error: "Supplier domains must look like supplyhouse.com, separated by commas." }, { status:400 });
    const region = typeof body.region === "string" ? body.region.slice(0,100) : "United States";
    // A natural-language product-page phrase retrieves listings; stuffed keywords pull in spec sheets and manuals.
    const query = `${body.query} product page in ${region}`;
    const started = Date.now();
    const result = await exaSearch({ query, type:"auto", category:"product", numResults:20, ...(domains.length ? { includeDomains:domains } : {}), contents:{ text:{maxCharacters:5000}, extras:{richImageLinks:5,imageLinks:1}, highlights:{query:`${body.query} current selling price, pack quantity and availability`,maxCharacters:4000}, summary:{ query:"Extract this page's CURRENT selling price for the main product only, not a related item, installment, range, starting-at or crossed-out price. If ambiguous, unavailable or no explicit currency use null price. PriceEvidence must be a verbatim quote of the selling price and pack/unit quantity from the page. Do not infer a price. Return the product SKU only if explicitly on the page.", schema:{ type:"object", properties:{ price:{anyOf:[{type:"number"},{type:"null"}]},currency:{type:"string"},priceEvidence:{type:"string"},sku:{type:"string"},availability:{type:"string"} },required:["price","currency","priceEvidence","sku","availability"] } } } },request.signal);
    const seen = new Set<string>();
    const sources: SourceOption[] = [];
    for (const item of result.results ?? []) {
      try {
        const url = new URL(item.url); if (!['https:','http:'].includes(url.protocol) || seen.has(url.href)) continue;
        const domain = url.hostname.replace(/^www\./,"");
        if (domains.length && !domains.some(d=>domain === d || domain.endsWith(`.${d}`))) continue;
        if (NOT_A_SUPPLIER.some(h=>domain === h || domain.endsWith(`.${h}`))) continue;
        if (!domains.length && MARKETPLACES.some(m=>domain === m || domain.endsWith(`.${m}`))) continue;
        seen.add(url.href);
        const summary = typeof item.summary === "string" ? JSON.parse(item.summary) : item.summary || {};
        const evidence = typeof summary.priceEvidence === "string" ? summary.priceEvidence : "";
        const currency = String(summary.currency || "").toUpperCase();
        const price = typeof summary.price === "number" && Number.isFinite(summary.price) && summary.price > 0 && currency === "USD" && evidence.length > 0 ? summary.price : null;
        // Price needs to be present in both the extraction's quotation and actual retrieved page text.
        const numericPrice = price?.toFixed(2);
        const priceTokens = numericPrice ? [numericPrice, Number(price).toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})] : [];
        const retrieved = [item.text || "", ...(item.highlights || [])].join(" ");
        const supported = priceTokens.some(p=>evidence.includes(p)) && priceTokens.some(p=>retrieved.includes(p));
        sources.push({ title:String(item.title || domain), supplier:domain, domain,url:url.href,price:supported ? price : null,currency:currency || "Unknown",priceEvidence:supported ? evidence : "No unambiguous USD selling price could be confirmed in the retrieved page.",sku:cleanSku(summary.sku),availability:typeof summary.availability === "string" && summary.availability ? summary.availability : "Check supplier page",image:pickProductImage(item),retrievedAt:new Date().toISOString() });
      } catch { /* A malformed extraction is skipped, never converted into a price. */ }
    }
    // Confirmed prices first, then pages carrying a product shot; Exa's relevance order survives inside each group.
    const perDomain = new Map<string,number>();
    const ranked = sources
      .sort((a,b)=> Number(b.price !== null) - Number(a.price !== null) || Number(!!b.image) - Number(!!a.image))
      .filter(s=>{ const used = perDomain.get(s.domain) ?? 0; if (used >= MAX_PER_DOMAIN) return false; perDomain.set(s.domain, used + 1); return true; })
      .slice(0, MAX_SOURCES);
    const trace: ExaTrace[] = [{ step:"Price the part", endpoint:"POST /search", query, searchType:String(result.resolvedSearchType || "auto"), results:(result.results ?? []).length, costDollars: typeof result.costDollars?.total === "number" ? result.costDollars.total : null, ms: Date.now()-started }];
    return Response.json({query,sources:ranked,trace});
  } catch(error) { return Response.json({error:safeError(error)},{status:502}); }
}
