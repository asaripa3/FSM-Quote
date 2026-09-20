import { containsIdentifier } from "./sourcing";
import { nonProductPageReason } from "./product-page";
import type { EvidenceStrength, ModelMatch, SourceKind } from "./job";

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const path = (url: string) => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } };
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Hosts whose business is mirroring other people's manuals. Useful, but not the manufacturer. */
const AGGREGATORS = /^(?:manualslib|manualslib\.tech|manualsdir|manualsdump|easymanua|manual-hub|usersmanualguide|manualzz|manualsonline|scribd|slideshare|studylib|dokumen|c-o-k)\b/;
const FORUMS = /^(?:reddit|quora|stackexchange|stackoverflow|.*\.stackexchange)\b|forum|community/;
const VIDEO = /^(?:youtube|youtu\.be|vimeo|dailymotion|rumble)\b/;
const COMMERCE_PATH = /(?:^|\/)(?:products?|p|dp|pd|item|sku|catalog|shop|store|buy)(?:\/|$)/;

/**
 * Where a retrieved page comes from, which is not the same question as whether it is useful.
 *
 * A `.pdf` path is deliberately not evidence of authority. A manual mirrored on an unrecognised host
 * is exactly the sketchy-manual problem this is meant to surface, and one of the Lennox service
 * manuals Exa returned during testing was served from a Russian file host. Authority comes from the
 * manufacturer's own domain, never from the file extension.
 */
export function sourceKind(url: string, title: string, manufacturer: string, suppliers: string[] = []): SourceKind {
  const domain = host(url);
  if (!domain) return "unknown";
  const maker = slug(manufacturer);
  // The manufacturer's own domain, allowing for the separate document hosts OEMs publish through.
  if (maker.length >= 3 && slug(domain).includes(maker)) return "oem";
  if (AGGREGATORS.test(domain)) return "unknown";
  if (VIDEO.test(domain)) return "practitioner";
  if (FORUMS.test(domain) || /(?:^|\/)(?:forum|thread|topic)s?(?:\/|$)/.test(path(url))) return "forum";
  if (suppliers.some(s => domain === s || domain.endsWith(`.${s}`))) return "distributor";
  // A page that survives the storefront filter and sits on a commerce path is selling something.
  if (!nonProductPageReason(new URL(url)) && COMMERCE_PATH.test(path(url))) return "distributor";
  if (/\b(?:hvac|plumb|electric|tech|repair|service|install)/.test(domain) || /guide|how-to|troubleshoot/.test(`${domain}${path(url)} ${title.toLowerCase()}`)) return "practitioner";
  return "unknown";
}

/** A model designation matched at its start but not its end: "48TC" inside "48TC04-48TC14". */
function startsIdentifier(text: string, stem: string) {
  if (stem.length < 4) return false;
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}`, "i").test(text);
}

/**
 * The family designation a document shares with this machine, or "" when it shares none.
 *
 * Service manuals cover ranges: a document headed "48TC04-48TC14" is the right document for a plate
 * reading 48TCED08A2A6, and the exact designation appears nowhere in it. Progressively shorter
 * prefixes are tried rather than a fixed stem, because where a model stops being specific and starts
 * being a family differs by manufacturer. Four characters is the floor; below that "48" would match
 * anything with a number in it.
 */
export function familyMatch(text: string, model: string): string {
  const clean = model.trim();
  for (let end = clean.length - 1; end >= 4; end--) {
    const stem = clean.slice(0, end).replace(/[^A-Za-z0-9]+$/, "");
    // A family is only a family if it still names something: letters and digits both.
    if (stem.length < 4 || !/[A-Za-z]/.test(stem) || !/\d/.test(stem)) continue;
    if (startsIdentifier(text, stem)) return stem;
  }
  return "";
}

/**
 * How close this source comes to the machine in front of the technician.
 *
 * Graded rather than true/false, because "covers the family" and "names this exact model" are
 * genuinely different answers and showing them as the same badge manufactures confidence.
 */
export function modelMatch(text: string, equipment: { manufacturer: string; model: string }): ModelMatch {
  const model = equipment.model.trim();
  if (model && containsIdentifier(text, model)) return "exact";
  if (model && familyMatch(text, model)) return "family";
  const maker = equipment.manufacturer.trim();
  if (maker.length >= 3 && new RegExp(`(?<![a-z])${maker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text)) return "manufacturer";
  return "none";
}

/**
 * What weight to give a source, from where it came and how closely it matches.
 *
 * Only the manufacturer, talking about this machine or its family, is authoritative. Everything else
 * corroborates at best, and anything that cannot be tied to the equipment at all is anecdotal however
 * official its host looks.
 */
export function evidenceStrength(kind: SourceKind, match: ModelMatch): EvidenceStrength {
  if (match === "none") return "anecdotal";
  if (kind === "oem") return match === "exact" || match === "family" ? "authoritative" : "corroborating";
  if (kind === "forum" || kind === "unknown") return "anecdotal";
  return "corroborating";
}

/**
 * Whether the retrieval came back missing a whole class of source.
 *
 * A first run for a Carrier fault code returned nine manual mirrors and one manufacturer page, and no
 * practitioner source at all. The pitch is that a technician should not have to hunt through manuals
 * and video; a screen showing ten PDFs does not demonstrate that. One narrow second search is cheap
 * insurance at $0.007, and it only runs when a class is actually absent.
 */
export function missingPractitioner(kinds: SourceKind[]) {
  return kinds.length > 0 && !kinds.includes("practitioner") && kinds.some(k => k === "oem" || k === "unknown");
}
