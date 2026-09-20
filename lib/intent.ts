import type { Constraint, JobPart, PartIntent, Supersession } from "./job";
import { containsIdentifier, normalizeUnits, partIdentifier } from "./sourcing";

/**
 * A constraint means the same thing however many faults state it. Two items on one job that are both
 * half-inch produce the same requirement twice, which reaches the card as a repeated "Confirm size:
 * half-inch" and, because the text is the React key, as a duplicate-key warning. Collapse on meaning.
 */
export function dedupeConstraints(constraints: Constraint[]): Constraint[] {
  const seen = new Map<string, Constraint>();
  for (const c of constraints) {
    // Unit-insensitive, so "120V" stated by one fault and "120 volts" by another are one requirement.
    const key = `${normalizeUnits(c.field)}|${normalizeUnits(c.value)}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

const text = (v: unknown, max = 600) => typeof v === "string" ? v.trim().slice(0, max) : "";
/**
 * A requirement has to come from the note, not from the model's idea of a sensible default, so it is
 * kept only when the note actually says it. The comparison is unit-insensitive: a note reading
 * "coil is marked 120 V" extracts as "120 volts" about as often as not, and a literal check drops
 * that requirement without trace — the voltage check then never appears against any supplier page.
 */
const noteGrounds = (note: string, value: string) => normalizeUnits(note).includes(normalizeUnits(value));
export function normalizeIntent(value: unknown, note: string, part: Pick<JobPart,"description"|"equipment"|"sku">): PartIntent {
  const data = value && typeof value === "object" ? value as Record<string,unknown> : {};
  // Preserve an actual note excerpt, never a reconstructed quotation.
  const context = text(data.rawContext, 2000);
  const rawContext = context && note.includes(context) ? context : part.description;
  const maker = text(data.manufacturer,100);
  // "Moen 1222" and "1222" come back about equally often for the same note. The page prints the maker
  // and the designation apart, so the identifier check has to be the designation alone.
  const stated = text(data.exactModel,100);
  const exactModel = maker && stated.toLowerCase().startsWith(`${maker.toLowerCase()} `) ? stated.slice(maker.length).trim() : stated;
  const uncertainty = /\b(?:maybe|might|possibly|suspect|unsure|unknown|not sure|last time|previous|work order says)\b/i.test(rawContext);
  const explicit = exactModel && containsIdentifier(note,exactModel) && containsIdentifier(rawContext,exactModel);
  const list = (value: unknown, max: number) => Array.isArray(value) ? value.map(v=>text(v,200)).filter(Boolean).slice(0,max) : [];
  // Superseded work is a decision the technician announced, so both halves must be present to record it.
  const supersedes: Supersession[] = Array.isArray(data.supersedes)
    ? data.supersedes.slice(0,6).flatMap(v => {
        const entry = v && typeof v === "object" ? v as Record<string,unknown> : {};
        const subject = text(entry.subject,150), reason = text(entry.reason,300);
        return subject && reason ? [{ subject, reason }] : [];
      })
    : [];
  const constraints: Constraint[] = Array.isArray(data.constraints) ? data.constraints.slice(0,8).flatMap(c=>c && typeof c === "object" && text(c.field) && text(c.value) && noteGrounds(note,text(c.value)) ? [{field:text(c.field,60),value:text(c.value,100)}] : []) : [];
  return { rawContext,manufacturer:maker,fixture:text(data.fixture,150)||part.equipment,suspectedPart:text(data.suspectedPart,150),
    // The subject is what gets searched for, so it falls back to the description rather than to the
    // component that failed: a disposal whose motor has gone is sourced as a disposal.
    subject:text(data.subject,200)||part.description,ruledOut:list(data.ruledOut,8),supersedes,
    exactModel:explicit?exactModel:"",route:(text(data.route).toLowerCase().startsWith("exact") || /\b(?:order|replace with|replacement number is confirmed)\b/i.test(rawContext)) && explicit && !uncertainty ? "exact" : "ambiguous",constraints: dedupeConstraints(constraints) };
}

export function exactCandidate(part: JobPart) {
  const model = part.intent?.exactModel || part.sku;
  const subject = part.intent?.subject || part.description;
  return {id:`exact-${part.id}`,partIds:[part.id],name:subject,manufacturer:part.intent?.manufacturer||"",partNumber:model,sku:part.sku,reason:"This part number was explicitly requested in the note. Exa will check supplier pages for the same product; fit still needs your review.",evidence:part.intent?.rawContext||part.description,verified:false,sourceUrl:"",sourceLabel:"Technician note",supporting:[],searchQuery:searchPhrase(part.intent?.manufacturer,subject),route:"exact" as const,confidence:"high" as const,constraints:part.intent?.constraints||[],conflicts:[],questions:[]};
}

/** Join the maker to the subject without repeating it when the subject already names it. */
function searchPhrase(manufacturer: string | undefined, subject: string) {
  const maker = (manufacturer ?? "").trim();
  if (!maker || subject.toLowerCase().includes(maker.toLowerCase())) return subject.replace(/\s+/g," ").trim();
  return `${maker} ${subject}`.replace(/\s+/g," ").trim();
}

/**
 * Whether this item can go straight to supplier pricing.
 *
 * The price gate accepts nothing it cannot tie to an identifier on the page, so "identifiable enough
 * for direct retrieval" means an identifier exists: the replacement number the technician gave, a
 * cited order number, or a designation inside the procurement subject ("Badger 5" out of
 * "InSinkErator Badger 5 Model 5-87A"). Without one the item needs researching first, which is why a
 * named tool with no model number still goes to discovery.
 */
export function groundedIdentifier(part: JobPart) {
  return part.intent?.exactModel || part.sku || partIdentifier(part.intent?.subject ?? "") || "";
}

/** A line item the technician has already identified: priced directly, never diagnosed. */
export function subjectCandidate(part: JobPart) {
  const identifier = groundedIdentifier(part);
  const subject = part.intent?.subject || part.description;
  const sourcing = part.kind === "tool" ? "The technician asked for this tool by name, so it is priced rather than researched."
    : part.kind === "unit" ? "The technician chose to replace the whole unit, so this is sourced as equipment rather than diagnosed as a fault."
    : "The technician named what to source, so it is priced rather than researched.";
  return {id:`sourced-${part.id}`,partIds:[part.id],name:subject,manufacturer:part.intent?.manufacturer||"",
    partNumber:part.sku||identifier,sku:part.sku,reason:`${sourcing} Exa is checking supplier pages for it now; fit still needs your review.`,
    evidence:part.intent?.rawContext||part.description,verified:false,sourceUrl:"",sourceLabel:"Technician note",supporting:[],
    searchQuery:searchPhrase(part.intent?.manufacturer,subject),
    route:"exact" as const,confidence:"high" as const,
    constraints:part.intent?.constraints||[],conflicts:[],questions:[]};
}

const WORK_NOISE = new Set(["the","a","an","of","for","in","on","inside","its","this","that","new","old","replacement","replace","repair","unit","assembly","whole"]);
const workTokens = (value: string) => new Set(String(value).toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").filter(w => w.length > 2 && !WORK_NOISE.has(w)));
/**
 * Whether two descriptions name the same work.
 *
 * A technician writes the same repair two ways in one note: "motor inside disposal" where they report
 * it, "disposal motor" where they rule it out. Matching has to be loose enough to join those and tight
 * enough not to join "disposal motor" with "disposal unit", so it compares the identifying words and
 * asks that most of the shorter description be present in the longer.
 */
export function describesSameWork(a: string, b: string) {
  const left = workTokens(a), right = workTokens(b);
  if (!left.size || !right.size) return false;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  return [...small].filter(t => large.has(t)).length / small.size >= 0.6;
}

/**
 * Split the reported items into the work that will be sourced and the work another line already covers.
 *
 * A decision the technician announced comes first. "Replace the unit rather than repair the motor"
 * means the motor is not a second thing to buy, and researching or pricing it would put the same
 * repair on the estimate twice under two names. This also decides whether anything still needs
 * researching, so it has to run before that question is asked rather than after.
 */
export function splitSupersededWork(parts: JobPart[]) {
  const supersessions = [
    ...parts.flatMap(p => (p.intent?.supersedes ?? []).map(s => ({ ...s, by: p.id }))),
    // The model states the supersession on some runs and not others. Whole-unit replacement implies
    // it regardless: if the technician is replacing the appliance, the component that failed inside
    // it is not a second thing to buy, whether or not the extraction thought to say so.
    ...parts.filter(p => p.kind === "unit").flatMap(p => {
      const covers = [p.intent?.suspectedPart ?? "", ...(p.intent?.ruledOut ?? [])].filter(Boolean);
      return covers.map(subject => ({ subject,
        reason: `Covered by replacing the ${p.intent?.subject || p.description} rather than repairing it.`,
        by: p.id }));
    }),
  ];
  const superseded: { partId: string; reason: string }[] = [];
  const remaining = parts.filter(part => {
    const replaced = supersessions.find(s => s.by !== part.id
      && (describesSameWork(s.subject, part.description) || describesSameWork(s.subject, part.intent?.subject ?? "")));
    if (!replaced) return true;
    superseded.push({ partId: part.id, reason: replaced.reason });
    return false;
  });
  return { remaining, superseded };
}
