"use client";

import { Check } from "./icons";
import type { Part, TradePack } from "@/lib/trades";
import { money } from "@/lib/trades";
import type { PartState } from "@/lib/run-stream";

const PHASE_ORDER = ["queued", "discovering", "candidate", "verifying", "verified", "sourcing", "done"];
const reached = (s: PartState, p: string) => PHASE_ORDER.indexOf(s.phase) >= PHASE_ORDER.indexOf(p);

export function PartCard({
  part,
  state,
  pack,
  index,
  selected,
  onSelect,
}: {
  part: Part;
  state: PartState;
  pack: TradePack;
  index: number;
  selected: number | null;
  onSelect: (listingIndex: number) => void;
}) {
  const idle = state.phase === "queued";

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-paper transition-opacity ${
        idle ? "border-line opacity-55" : "border-line"
      }`}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-faint tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="text-[14px] font-medium tracking-tight text-ink">{part.intent}</h3>
        </div>
        <PhaseChip state={state} />
      </div>

      <div className="p-5">
        {idle ? (
          <p className="font-mono text-[11px] text-faint">Queued</p>
        ) : (
          <div className="space-y-4">
            {/* ---------- Exa discovery ---------- */}
            <TraceStep
              badge={part.superseded ? "Exa supersession lookup" : "Exa discovery"}
              query={state.discoveryQuery}
              meta={`type: auto · numResults: 10${
                reached(state, "candidate") ? ` · ${part.discovery.pagesScanned} pages read` : ""
              }`}
              active={state.phase === "discovering"}
            >
              {state.sources.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {state.sources.map((d, i) => (
                    <span
                      key={`${d}-${i}`}
                      className="rise rounded border border-line bg-marble px-1.5 py-0.5 font-mono text-[10px] text-muted"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              ) : null}
            </TraceStep>

            {/* ---------- superseded part (§17) ---------- */}
            {state.superseded && part.superseded ? (
              <div className="superseded-panel rise">
                <span className="micro-label">Legacy part number on the work order</span>
                <div className="superseded-chain">
                  <span className="superseded-from">{part.superseded.from}</span>
                  <i>catalogued today as</i>
                  <strong>{part.superseded.to}</strong>
                </div>
                <p>{part.superseded.evidence}</p>
                <a href={part.superseded.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {part.superseded.sourceLabel} ↗
                </a>
              </div>
            ) : null}

            {/* ---------- candidate ---------- */}
            {reached(state, "candidate") ? (
              <div className="rise rounded-lg border border-line bg-marble/60 p-4">
                <p className="label mb-2.5">Part identified</p>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-[16px] font-medium tracking-tight text-ink">
                    {part.discovery.manufacturer} {part.discovery.sku}
                  </span>
                  <span className="text-[12px] text-muted">{part.discovery.name}</span>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">{part.discovery.reason}</p>
              </div>
            ) : null}

            {/* ---------- compatibility ---------- */}
            {state.phase === "verifying" ? (
              <Working label={`Verifying compatibility with ${pack.demo.equipment.model}…`} />
            ) : null}

            {reached(state, "verified") ? (
              <div className="rise rounded-lg border border-ok/25 bg-ok-tint/60 p-4">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-ok">
                  <Check /> {part.compatibility.statement}
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-ink/80">
                  {part.compatibility.evidence}
                </p>
                <a
                  href={part.compatibility.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.06em] text-exa underline-offset-2 hover:underline"
                >
                  {part.compatibility.sourceLabel} ↗
                </a>
              </div>
            ) : null}

            {/* ---------- supplier search ---------- */}
            {reached(state, "sourcing") ? (
              <TraceStep
                badge="Exa product search"
                query={state.productQuery}
                meta={`category: product · numResults: 20${
                  state.phase === "done" ? ` · ${part.listings.length} ranked after dedupe` : ""
                }`}
                active={state.phase === "sourcing" && state.listings.length < part.listings.length}
              />
            ) : null}

            {state.listings.length > 0 ? (
              <div className="space-y-2">
                {state.listings.map((l, i) => {
                  const isSelected = selected === i;
                  return (
                    <div
                      key={l.supplier}
                      className={`rise flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5 transition-colors ${
                        isSelected ? "border-exa bg-exa-tint/50" : "border-line bg-paper hover:border-faint"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium text-ink">{l.supplier}</span>
                          {l.badges.map((b) => (
                            <span
                              key={b}
                              className={`rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] uppercase ${
                                b === "LOWEST PRICE"
                                  ? "border border-line bg-marble text-muted"
                                  : "border border-exa-line bg-exa-tint text-exa"
                              }`}
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                          <span className={l.match === "exact" ? "text-ok" : "text-warn"}>
                            {l.match === "exact" ? "✓ Exact SKU" : "✓ Compatible"}
                          </span>
                          <span className="text-faint">·</span>
                          <span>{l.stock}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[15px] text-ink tabular-nums">
                          {money(l.price)}
                        </span>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-line px-2.5 py-1.5 font-mono text-[10px] tracking-[0.08em] text-muted uppercase transition-colors hover:border-faint hover:text-ink"
                        >
                          Listing ↗
                        </a>
                        <button
                          onClick={() => onSelect(i)}
                          className={`rounded-md px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors ${
                            isSelected
                              ? "bg-exa text-white"
                              : "border border-ink/15 bg-ink text-white hover:bg-exa"
                          }`}
                        >
                          {isSelected ? "In quote ✓" : "Use in quote"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------------- */

function PhaseChip({ state }: { state: PartState }) {
  const map: Record<string, { text: string; cls: string }> = {
    queued: { text: "Queued", cls: "border-line bg-marble text-faint" },
    discovering: { text: "Discovering", cls: "border-exa-line bg-exa-tint text-exa" },
    candidate: { text: "Candidate found", cls: "border-exa-line bg-exa-tint text-exa" },
    verifying: { text: "Verifying", cls: "border-warn/25 bg-warn-tint text-warn" },
    verified: { text: "Verified", cls: "border-ok/25 bg-ok-tint text-ok" },
    sourcing: { text: "Sourcing", cls: "border-exa-line bg-exa-tint text-exa" },
    done: { text: "Ready", cls: "border-ok/25 bg-ok-tint text-ok" },
  };
  const m = map[state.phase];
  const live = ["discovering", "verifying", "sourcing"].includes(state.phase);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] uppercase ${m.cls}`}
    >
      {live ? <span className="pulse-dot h-1 w-1 rounded-full bg-current" /> : null}
      {m.text}
    </span>
  );
}

function TraceStep({
  badge,
  query,
  meta,
  active,
  children,
}: {
  badge: string;
  query?: string;
  meta: string;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper">
      {active ? (
        <div className="sweep h-[2px] w-full bg-line-soft">
          <div className="sweep-bar h-full w-1/3 bg-exa" />
        </div>
      ) : (
        <div className="h-[2px] w-full bg-line-soft" />
      )}
      <div className="p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-exa-line bg-exa-tint px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-exa uppercase">
            {badge}
          </span>
          {query ? (
            <span className="font-mono text-[11px] break-all text-ink">&ldquo;{query}&rdquo;</span>
          ) : null}
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-faint">{meta}</p>
        {children}
      </div>
    </div>
  );
}

function Working({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-marble/60 px-3.5 py-3">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-warn" />
      <span className="font-mono text-[11px] text-muted">{label}</span>
    </div>
  );
}
