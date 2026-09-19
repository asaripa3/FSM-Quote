import type { Constraint, JobPart, PartIntent } from "./job";
import { containsIdentifier, normalizeUnits } from "./sourcing";

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
  const exactModel = text(data.exactModel,100);
  const uncertainty = /\b(?:maybe|might|possibly|suspect|unsure|unknown|not sure|last time|previous|work order says)\b/i.test(rawContext);
  const explicit = exactModel && containsIdentifier(note,exactModel) && containsIdentifier(rawContext,exactModel);
  const constraints: Constraint[] = Array.isArray(data.constraints) ? data.constraints.slice(0,8).flatMap(c=>c && typeof c === "object" && text(c.field) && text(c.value) && noteGrounds(note,text(c.value)) ? [{field:text(c.field,60),value:text(c.value,100)}] : []) : [];
  return { rawContext,manufacturer:text(data.manufacturer,100),fixture:text(data.fixture,150)||part.equipment,symptom:text(data.symptom,300),suspectedPart:text(data.suspectedPart,150),possibleFamily:text(data.possibleFamily,100),exactModel:explicit?exactModel:"",route:(text(data.route).toLowerCase().startsWith("exact") || /\b(?:order|replace with|replacement number is confirmed)\b/i.test(rawContext)) && explicit && !uncertainty ? "exact" : "ambiguous",constraints: dedupeConstraints(constraints) };
}

export function exactCandidate(part: JobPart) {
  const model = part.intent?.exactModel || part.sku;
  return {id:`exact-${part.id}`,partIds:[part.id],name:[part.intent?.manufacturer,model,part.intent?.suspectedPart].filter(Boolean).join(" ")||part.description,manufacturer:part.intent?.manufacturer||"",partNumber:model,sku:part.sku,reason:"This part number was explicitly requested in the note. Exa will check supplier pages for the same product; fit still needs your review.",evidence:part.intent?.rawContext||part.description,verified:false,sourceUrl:"",sourceLabel:"Technician note",supporting:[],searchQuery:[part.intent?.manufacturer,model,part.intent?.suspectedPart].filter(Boolean).join(" "),route:"exact" as const,confidence:"high" as const,constraints:part.intent?.constraints||[],conflicts:[],questions:[]};
}
