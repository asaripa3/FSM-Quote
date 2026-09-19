import type { Constraint, JobPart, PartIntent } from "./job";
import { containsIdentifier } from "./sourcing";

const text = (v: unknown, max = 600) => typeof v === "string" ? v.trim().slice(0, max) : "";
export function normalizeIntent(value: unknown, note: string, part: Pick<JobPart,"description"|"equipment"|"sku">): PartIntent {
  const data = value && typeof value === "object" ? value as Record<string,unknown> : {};
  // Preserve an actual note excerpt, never a reconstructed quotation.
  const context = text(data.rawContext, 2000);
  const rawContext = context && note.includes(context) ? context : part.description;
  const exactModel = text(data.exactModel,100);
  const uncertainty = /\b(?:maybe|might|possibly|suspect|unsure|unknown|not sure|last time|previous|work order says)\b/i.test(rawContext);
  const explicit = exactModel && containsIdentifier(note,exactModel) && containsIdentifier(rawContext,exactModel);
  const confidence = typeof data.confidence === "number" && Number.isFinite(data.confidence) ? Math.min(1,Math.max(0,data.confidence)) : 0;
  const constraints: Constraint[] = Array.isArray(data.constraints) ? data.constraints.slice(0,8).flatMap(c=>c && typeof c === "object" && text(c.field) && text(c.value) && note.toLowerCase().replace(/\s+/g,"").includes(text(c.value).toLowerCase().replace(/\s+/g,"")) ? [{field:text(c.field,60),value:text(c.value,100)}] : []) : [];
  return { rawContext,manufacturer:text(data.manufacturer,100),fixture:text(data.fixture,150)||part.equipment,symptom:text(data.symptom,300),suspectedPart:text(data.suspectedPart,150),possibleFamily:text(data.possibleFamily,100),exactModel:explicit?exactModel:"",confidence,route:(text(data.route).toLowerCase().startsWith("exact") || /\b(?:order|replace with|replacement number is confirmed)\b/i.test(rawContext)) && explicit && !uncertainty && confidence>=0.85 ? "exact" : "ambiguous",constraints };
}

export function exactCandidate(part: JobPart) {
  const model = part.intent?.exactModel || part.sku;
  return {id:`exact-${part.id}`,partIds:[part.id],name:[part.intent?.manufacturer,model,part.intent?.suspectedPart].filter(Boolean).join(" ")||part.description,manufacturer:part.intent?.manufacturer||"",partNumber:model,sku:part.sku,reason:"This part number was explicitly requested in the note. Exa will check supplier pages for the same product; fit still needs your review.",evidence:part.intent?.rawContext||part.description,verified:false,sourceUrl:"",sourceLabel:"Technician note",supporting:[],searchQuery:[part.intent?.manufacturer,model,part.intent?.suspectedPart].filter(Boolean).join(" "),skuStatus:"unknown" as const,skuNote:"",route:"exact" as const,confidence:"high" as const,constraints:part.intent?.constraints||[],conflicts:[],questions:[]};
}
