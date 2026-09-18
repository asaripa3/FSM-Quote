"use client";

import { useState } from "react";
import type { Part, TradePack } from "@/lib/trades";
import type { PartState } from "@/lib/run-stream";
import { runMetrics, valueCase, compactMoney, compactNumber, REVIEW_SECONDS } from "@/lib/metrics";

/**
 * The delta, made legible. Two halves:
 *   1. what this run actually did (counted from the event stream)
 *   2. what that is worth across the fleet (from baselines the customer edits)
 */
export function ValueMeter({
  pack,
  parts,
  states,
  elapsedMs,
  complete,
}: {
  pack: TradePack;
  parts: Part[];
  states: Record<string, PartState>;
  elapsedMs: number;
  complete: boolean;
}) {
  const [techs, setTechs] = useState(pack.config.baseline.technicians);
  const [manual, setManual] = useState(pack.config.baseline.manualMinutesPerQuote);
  const [open, setOpen] = useState(false);

  const m = runMetrics(parts, states, elapsedMs);
  const v = valueCase({ ...pack.config.baseline, technicians: techs, manualMinutesPerQuote: manual }, m.elapsedSeconds);
  const b = pack.config.baseline;

  return (
    <section className="value-meter">
      <header>
        <span className="micro-label">{complete ? "This run" : "Running…"}</span>
        <h2>
          {m.sourcesRead} sources read in {m.elapsedSeconds}s.
          <span> By hand: about {manual} minutes.</span>
        </h2>
      </header>

      <div className="value-counts">
        <Stat n={String(m.sourcesRead)} l="Sources read" />
        <Stat n={String(m.exaRetrievals)} l="Exa retrievals" />
        <Stat n={String(m.listingsCompared)} l="Listings compared" />
        <Stat n={`${m.partsVerified}/${parts.length}`} l="Parts verified" />
        {m.supersessionsCaught > 0 ? (
          <Stat n={String(m.supersessionsCaught)} l="Dead SKUs caught" accent />
        ) : null}
      </div>

      {complete ? (
        <>
          <div className="value-delta">
            <div className="value-bar" aria-hidden>
              <span className="bar-manual" style={{ width: "100%" }}>
                <i>{manual} min manual</i>
              </span>
              <span
                className="bar-auto"
                style={{ width: `${Math.max(4, (v.actualMinutes / Math.max(manual, 1)) * 100)}%` }}
              >
                <i>{v.actualMinutes} min</i>
              </span>
            </div>
            <p className="value-note">
              Includes a {Math.round(REVIEW_SECONDS / 60 * 10) / 10} min allowance for a human to
              read the evidence and choose a supplier — the selection stays manual on purpose.
            </p>
          </div>

          <div className="value-scale">
            <div>
              <strong>{v.percentFaster}%</strong>
              <span>faster per quote</span>
            </div>
            <div>
              <strong>{compactNumber(v.hoursPerYear)} hrs</strong>
              <span>returned per year</span>
            </div>
            <div>
              <strong>{compactMoney(v.dollarsPerYear)}</strong>
              <span>sourcing cost avoided</span>
            </div>
          </div>

          <button className="value-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide assumptions" : "These are assumptions — change them"} <span>{open ? "↑" : "↓"}</span>
          </button>

          {open ? (
            <div className="value-inputs">
              <label>
                <span>Technicians</span>
                <input
                  type="range"
                  min={5}
                  max={250}
                  step={5}
                  value={techs}
                  onChange={(e) => setTechs(Number(e.target.value))}
                />
                <output>{techs}</output>
              </label>
              <label>
                <span>Minutes per quote today</span>
                <input
                  type="range"
                  min={5}
                  max={45}
                  step={1}
                  value={manual}
                  onChange={(e) => setManual(Number(e.target.value))}
                />
                <output>{manual} min</output>
              </label>
              <p>
                Fixed: {b.quotesPerTechPerWeek} quotes/tech/week × 48 weeks ={" "}
                {compactNumber(v.quotesPerYear)} quotes/yr, sourcing labour at $
                {b.sourcingCostPerHour}/hr. Today that quote also costs {b.tabsOpened} browser tabs
                and {b.catalogsChecked} catalog lookups.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Stat({ n, l, accent = false }: { n: string; l: string; accent?: boolean }) {
  return (
    <div className={accent ? "is-accent" : undefined}>
      <strong>{n}</strong>
      <span>{l}</span>
    </div>
  );
}
