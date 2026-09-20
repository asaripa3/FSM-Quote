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

/** The one repair path under consideration, as much of it as the gate needs. */
export type DecisionPath = { component: string; confirmBy: string };
export type DecisionState = {
  path?: DecisionPath;
  /** Index into the packet's paths: -1 nothing chosen yet, -2 the technician's own finding. */
  selected: number;
  pathCount: number;
  typedComponent: string;
  result: DecisionDraft["result"];
  notes: string;
  quantity: number;
  action: DecisionDraft["action"];
};

/**
 * What the confirmation screen is actually offering, and what is still missing.
 *
 * Kept out of the component because it is the gate on the only irreversible step in the workflow, and
 * because a gate nobody can render is a gate nobody can test. The screen reads every field from here.
 */
export function decisionGate(state: DecisionState) {
  const stated = (state.path?.confirmBy ?? "").trim();
  /**
   * A documented path that states no on-site test for itself.
   *
   * It cannot be confirmed against a check that does not exist, and the gate used to demand one, so
   * the button stayed disabled for good while the screen told the technician to "record an
   * independent finding instead" - which it offered no way to do. It takes the independent route now,
   * carrying the component across so nothing is retyped. The research phase withholds a path with no
   * confirmBy, so this is the guard for a packet that reaches the client another way.
   */
  const unchecked = state.selected >= 0 && !!state.path && !stated;
  const other = state.selected === -2 || unchecked || state.pathCount === 0;
  const component = other ? state.typedComponent : state.path?.component ?? "";
  const check = other
    ? (unchecked ? "Technician's own check; the documentation states none for this path"
                 : "Technician's independent on-site inspection")
    : stated;
  // Quantity only means something for a replacement, and its field is hidden for a repair, so a
  // repair must not be blocked by a number nobody can see.
  const quantity = state.action === "replace" ? state.quantity : 1;
  /**
   * Why the button is unavailable, in the words shown beside it. Empty when it is available.
   *
   * A control that greys out without saying what is missing is the same dead end in a milder form:
   * clearing the quantity field disabled it silently too. `ready` is derived from this rather than
   * written alongside it, so the reason and the gate cannot disagree.
   */
  const blocker = !component.trim() ? "Name the component or work you confirmed."
    : other && state.result !== "different" ? "Tick the box to confirm you verified this on site."
    : other && !state.notes.trim() ? "Describe what your inspection established."
    : !other && !state.result ? "Record what your check established."
    : !other && state.result !== "supports" ? "This result does not confirm a replacement."
    : !check ? "This path states no check to confirm against."
    : !(Number.isInteger(quantity) && quantity > 0 && quantity <= 999) ? "Enter a quantity between 1 and 999."
    : "";
  return { other, unchecked, component, check, quantity, blocker, ready: !blocker };
}

/** Text is an observation attached to an explicit decision, never an inferred diagnosis. */
export function confirmDecision(draft: DecisionDraft, brief: Brief): Confirmation {
  if (draft.result !== "supports" && draft.result !== "different") throw new Error("Record a confirmed finding before continuing.");
  if (!draft.component.trim() || !draft.check.trim()) throw new Error("Identify the component or work and the check you performed.");
  if (draft.result === "different" && !draft.notes.trim()) throw new Error("Describe the finding you confirmed on site.");
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 999) throw new Error("Enter a quantity between 1 and 999.");
  return {
    component: draft.component.trim().slice(0, 200),
    findings: [draft.result === "supports" ? `Check performed: ${draft.check}. Result: supports this repair.` : `Confirmed by the technician's own check: ${draft.check}.`, draft.notes.trim()].filter(Boolean).join(" ").slice(0,1000),
    equipment: brief.equipment, manufacturer: brief.manufacturer, model: brief.model,
    constraints: brief.constraints ?? [], quantity: draft.quantity,
    decision: { action: draft.action, check: draft.check.slice(0,500), result: draft.result, sourceUrls: draft.sourceUrls.filter(url=>/^https?:\/\//i.test(url)).slice(0,8) },
  };
}
