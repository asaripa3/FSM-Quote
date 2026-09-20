import type { Brief, Confirmation } from "./job";

export type DecisionDraft = {
  action: "replace" | "repair";
  component: string;
  check: string;
  result: "" | "supports" | "ruled-out" | "unsure" | "different";
  notes: string;
  quantity: number;
  sourceUrls: string[];
};

/** Text is an observation attached to an explicit decision, never an inferred diagnosis. */
export function confirmDecision(draft: DecisionDraft, brief: Brief): Confirmation {
  if (draft.result !== "supports" && draft.result !== "different") throw new Error("Record a confirmed finding before continuing.");
  if (!draft.component.trim() || !draft.check.trim()) throw new Error("Identify the component or work and the check you performed.");
  if (draft.result === "different" && !draft.notes.trim()) throw new Error("Describe the finding you confirmed on site.");
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 999) throw new Error("Enter a quantity between 1 and 999.");
  return {
    component: draft.component.trim().slice(0, 200),
    findings: [draft.result === "supports" ? `Check performed: ${draft.check}. Result: supports this repair.` : `Different finding confirmed: ${draft.check}.`, draft.notes.trim()].filter(Boolean).join(" ").slice(0,1000),
    equipment: brief.equipment, manufacturer: brief.manufacturer, model: brief.model,
    constraints: brief.constraints ?? [], quantity: draft.quantity,
    decision: { action: draft.action, check: draft.check.slice(0,500), result: draft.result, sourceUrls: draft.sourceUrls.filter(url=>/^https?:\/\//i.test(url)).slice(0,8) },
  };
}
