/**
 * The business case, computed — not claimed.
 *
 * Everything here is a pure function of (a) what the run actually did and
 * (b) baseline assumptions the customer can edit in the UI. Nothing in this
 * file is model-generated, and nothing is hard-coded marketing copy: if the
 * pipeline reads fewer sources, the number on screen goes down.
 */
import type { Part, TradePack } from "./trades";
import type { PartState } from "./run-stream";

/** Exa calls per part: discovery/supersession → compatibility → product search. */
const RETRIEVALS_PER_PART = 3;

/**
 * Allowance for the human half of the workflow: reading the compatibility
 * evidence and choosing a supplier per part. Deliberately generous — a value
 * case that assumes review is instant is one a buyer is right to distrust.
 */
export const REVIEW_SECONDS = 150;

/** Nominal duration of a two-part run, for copy that cannot measure one. */
export const TYPICAL_RUN_SECONDS = 12;

export type RunMetrics = {
  sourcesRead: number;
  exaRetrievals: number;
  listingsCompared: number;
  partsVerified: number;
  supersessionsCaught: number;
  elapsedSeconds: number;
};

export function runMetrics(
  parts: Part[],
  states: Record<string, PartState>,
  elapsedMs: number,
): RunMetrics {
  let sourcesRead = 0;
  let listingsCompared = 0;
  let partsVerified = 0;

  for (const part of parts) {
    const st = states[part.id];
    if (!st) continue;
    sourcesRead += st.sources.length;
    listingsCompared += st.listings.length;
    if (st.phase === "verified" || st.phase === "sourcing" || st.phase === "done") partsVerified += 1;
  }

  return {
    sourcesRead,
    // only count retrievals for parts the run actually reached
    exaRetrievals: parts.filter((p) => states[p.id]?.phase !== "queued").length * RETRIEVALS_PER_PART,
    listingsCompared,
    partsVerified,
    supersessionsCaught: parts.filter(
      (p) => p.superseded && states[p.id] && states[p.id].phase !== "queued",
    ).length,
    elapsedSeconds: Math.max(1, Math.round(elapsedMs / 1000)),
  };
}

/* ---------------------------------------------------------------------- */

export type Baseline = TradePack["config"]["baseline"];

export type ValueCase = {
  manualMinutes: number;
  actualMinutes: number;
  minutesSavedPerQuote: number;
  percentFaster: number;
  quotesPerYear: number;
  hoursPerYear: number;
  dollarsPerYear: number;
};

/**
 * Per-quote saving scaled across the fleet. `actualSeconds` is the measured
 * run time plus an allowance for the human reviewing evidence and choosing a
 * supplier — the workflow is human-in-the-loop, so pretending review is free
 * would overstate the case.
 */
export function valueCase(
  baseline: Baseline,
  actualSeconds: number,
  reviewSeconds = REVIEW_SECONDS,
): ValueCase {
  const manualMinutes = baseline.manualMinutesPerQuote;
  const actualMinutes = round1((actualSeconds + reviewSeconds) / 60);
  const minutesSavedPerQuote = Math.max(0, round1(manualMinutes - actualMinutes));
  const quotesPerYear = baseline.quotesPerTechPerWeek * baseline.technicians * 48;
  const hoursPerYear = Math.round((minutesSavedPerQuote * quotesPerYear) / 60);

  return {
    manualMinutes,
    actualMinutes,
    minutesSavedPerQuote,
    percentFaster: manualMinutes === 0 ? 0 : Math.round((minutesSavedPerQuote / manualMinutes) * 100),
    quotesPerYear,
    hoursPerYear,
    dollarsPerYear: hoursPerYear * baseline.sourcingCostPerHour,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const compactMoney = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `$${Math.round(n / 1000)}K`
      : `$${n}`;

export const compactNumber = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n);
