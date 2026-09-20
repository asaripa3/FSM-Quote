"use client";
import { useState } from "react";
import type { Brief, ModelMatch, ResearchPacket, ResearchSource } from "@/lib/job";

/**
 * How close a source comes to this machine, said in words rather than implied by a shared badge.
 *
 * A family match is genuinely useful and genuinely weaker: a manual headed "48TC04-48TC14" is the
 * right document for a plate reading 48TCED08A2A6, and it is not the same claim as naming it. Showing
 * both as one green tick would manufacture confidence the retrieval has not earned.
 */
const MATCH_LABEL: Record<ModelMatch, string> = {
  exact: "names this model",
  family: "covers this family, not this exact model",
  manufacturer: "this manufacturer, not this model",
  none: "does not name this equipment",
};

const STRENGTH_LABEL = { authoritative: "Authoritative", corroborating: "Corroborating", anecdotal: "Unverified" } as const;

function SourceRow({ source }: { source: ResearchSource }) {
  return (
    <li className="packet-source" data-strength={source.strength}>
      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>
      <span className="packet-source-meta">
        <span className="packet-domain">{source.domain}</span>
        <span className="packet-strength" data-strength={source.strength}>{STRENGTH_LABEL[source.strength]}</span>
        <span className="packet-match" data-match={source.match}>{MATCH_LABEL[source.match]}</span>
      </span>
      {source.highlight && <blockquote>{source.highlight}</blockquote>}
    </li>
  );
}

/**
 * The state of knowledge about this job, at the top where it cannot be missed.
 *
 * This is what makes the human-in-the-loop model legible without anyone narrating it: the problem is
 * unresolved, then the evidence arrives and the checks appear, and only when the technician says what
 * they found does anything get sourced.
 */
export function EpistemicState({ packet, confirmed, busy }: { packet: ResearchPacket | null; confirmed: { component: string; findings: string } | null; busy: boolean }) {
  if (confirmed) return (
    <div className="epistemic confirmed" role="status">
      <strong>Repair confirmed by the technician</strong>
      <span>{confirmed.component}{confirmed.findings ? ` — ${confirmed.findings}` : ""}</span>
      {busy && <span className="epistemic-next">Finding the replacement part…</span>}
    </div>
  );
  if (!packet) return (
    <div className="epistemic unresolved" role="status">
      <strong>Problem unresolved</strong>
      <span>{busy ? "Reading documentation for this equipment…" : "Describe what you are seeing. Uncertainty is fine."}</span>
    </div>
  );
  const best = packet.sources.find(s => s.strength === "authoritative") ?? packet.sources.find(s => s.match === "family" || s.match === "exact");
  return (
    <div className="epistemic researched" role="status">
      <strong>{packet.repairPaths.length} evidence-backed repair {packet.repairPaths.length === 1 ? "path" : "paths"}</strong>
      <ul>
        {packet.sources.some(s => s.kind === "oem") && <li>OEM documentation found</li>}
        {best && <li>{MATCH_LABEL[best.match]}</li>}
        {packet.checkBeforeReplacing.length > 0 && <li>{packet.checkBeforeReplacing.length} checks recommended before replacement</li>}
      </ul>
    </div>
  );
}

export function ResearchPacketView({ brief, packet, onConfirm, busy }: {
  brief: Brief;
  packet: ResearchPacket;
  onConfirm: (confirmation: { component: string; findings: string }) => void;
  busy: boolean;
}) {
  const [chosen, setChosen] = useState("");
  const [typed, setTyped] = useState("");
  const [findings, setFindings] = useState("");
  // The documentation does not always name a cause, and on the run that produced this branch it
  // correctly refused to: a Carrier IGC has no fault code 31, so there was nothing to list. The
  // technician still knows what they found, so the flow has to let them say it rather than dead-end.
  const component = packet.repairPaths.length ? chosen : typed.trim();
  const official = packet.sources.filter(s => s.kind === "oem");
  const field = packet.sources.filter(s => s.kind === "practitioner" || s.kind === "forum");
  const other = packet.sources.filter(s => !official.includes(s) && !field.includes(s));

  return (
    <div className="packet">
      <section className="packet-block">
        <h3>What the evidence says</h3>
        <p className="packet-summary">{packet.evidenceSummary || "The retrieved documentation did not address this equipment directly."}</p>
      </section>

      {packet.checkBeforeReplacing.length > 0 && (
        <section className="packet-block packet-checks">
          <h3>Before replacing anything</h3>
          <ol>{packet.checkBeforeReplacing.map(check => <li key={check}>{check}</li>)}</ol>
        </section>
      )}

      {packet.repairPaths.length > 0 && (
        <section className="packet-block">
          <h3>Likely repair paths</h3>
          <p className="packet-note">These are what the documentation associates with this failure, not a diagnosis. Run the checks, then tell the workspace what you found.</p>
          <div className="packet-paths">
            {packet.repairPaths.map(path => (
              <label key={path.component} className={chosen === path.component ? "packet-path picked" : "packet-path"}>
                <input type="radio" name="repair-path" value={path.component} checked={chosen === path.component} onChange={() => setChosen(path.component)} />
                <span className="packet-path-body">
                  <strong>{path.component}</strong>
                  <em data-level={path.evidenceLevel}>{path.evidenceLevel === "oem" ? "OEM documented" : path.evidenceLevel === "corroborated" ? "Two sources agree" : "Field reports only"}</em>
                  <span>{path.rationale}</span>
                  {path.confirmBy && <span className="packet-confirm-by">Confirm by: {path.confirmBy}</span>}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {official.length > 0 && <section className="packet-block"><h3>Official documentation</h3><ul className="packet-sources">{official.map(s => <SourceRow key={s.url} source={s} />)}</ul></section>}
      {field.length > 0 && <section className="packet-block"><h3>Field knowledge</h3><ul className="packet-sources">{field.map(s => <SourceRow key={s.url} source={s} />)}</ul></section>}
      {other.length > 0 && (
        <details className="packet-block packet-other">
          <summary>Other sources retrieved ({other.length})</summary>
          <ul className="packet-sources">{other.map(s => <SourceRow key={s.url} source={s} />)}</ul>
        </details>
      )}

      <section className="packet-block packet-confirm">
        <h3>What did you find?</h3>
        <p className="packet-note">Nothing is sourced or priced until you say. {brief.equipment ? `This is for the ${brief.equipment}.` : ""}</p>
        {packet.repairPaths.length === 0 && (
          <label>
            The part you need
            <input value={typed} onChange={e => setTyped(e.target.value)} maxLength={200}
              placeholder="The documentation did not name one. What are you replacing?" />
          </label>
        )}
        <label>
          What you confirmed on site
          <textarea value={findings} onChange={e => setFindings(e.target.value)} rows={2} maxLength={1000}
            placeholder="Draft is normal. Switch has failed continuity." />
        </label>
        <button className="primary-button" disabled={busy || !component}
          onClick={() => onConfirm({ component, findings: findings.trim() })}>
          {busy ? "Sourcing…" : component ? `Source ${component}` : packet.repairPaths.length ? "Choose a repair path first" : "Name the part to source"} <span>→</span>
        </button>
      </section>
    </div>
  );
}
