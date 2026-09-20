"use client";
import { useEffect, useState } from "react";
import type { ParsedJob } from "@/lib/job";

/**
 * The note, with the words the extraction actually took from it lit up in reading order.
 *
 * The parsed fields are paraphrases ("Diaphragm for Sloan Royal 111 water closet"), never verbatim
 * spans, so whole descriptions cannot be matched back. Distinctive terms are matched instead —
 * equipment words, part numbers, ratings and quantities — which is what a technician recognises as
 * "it caught that". Once the job is researched the note steps back and becomes a quiet reference.
 */
const STOP = new Set(["the","and","for","with","from","that","this","have","has","was","were","are","not","but","all","any","its","his","her","their","been","into","over","under","near","also","must","should","need","needs","needed","per","out","off","new","old","one","two","both","each","some","then","than","when","while","after","before","above","below"]);

function terms(job: ParsedJob) {
  const raw = [
    ...job.equipment.split(/[\s,;/]+/),
    ...job.knownParts.flatMap(p => [p.sku, ...p.description.split(/[\s,;]+/), ...p.equipment.split(/[\s,;]+/)]),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const term = value.trim().replace(/^[^\w/.-]+|[^\w/.-]+$/g, "");
    const key = term.toLowerCase();
    // A bare number is only distinctive with a unit or a model beside it, so keep tokens of real length.
    if (term.length < 3 || STOP.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

type Segment = { text: string; lit: boolean };
function segment(note: string, job: ParsedJob): Segment[] {
  const found: { start: number; end: number }[] = [];
  for (const term of terms(job)) {
    const pattern = new RegExp(`(?<![\\w-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "gi");
    for (const match of note.matchAll(pattern)) {
      const start = match.index ?? 0;
      if (!found.some(f => start < f.end && start + match[0].length > f.start)) found.push({ start, end: start + match[0].length });
    }
  }
  found.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const { start, end } of found) {
    if (start > cursor) out.push({ text: note.slice(cursor, start), lit: false });
    out.push({ text: note.slice(start, end), lit: true });
    cursor = end;
  }
  if (cursor < note.length) out.push({ text: note.slice(cursor), lit: false });
  return out;
}

export function NoteReplay({ note, job, collapsed }: { note: string; job: ParsedJob; collapsed: boolean }) {
  const segments = segment(note, job);
  const [revealed, setRevealed] = useState(0);
  const total = segments.filter(s => s.lit).length;

  useEffect(() => {
    if (collapsed || revealed >= total) return;
    const timer = setTimeout(() => setRevealed(n => n + 1), revealed === 0 ? 260 : 85);
    return () => clearTimeout(timer);
  }, [revealed, total, collapsed]);

  let index = 0;
  return (
    <div className={`note-replay${collapsed ? " collapsed" : ""}`}>
      <p>
        {segments.map((part, i) => {
          if (!part.lit) return <span key={i}>{part.text}</span>;
          const on = collapsed || index++ < revealed;
          return <mark key={i} className={on ? "on" : ""}>{part.text}</mark>;
        })}
      </p>
      {!collapsed && total > 0 && (
        <p className="note-replay-count" role="status">
          <span className="micro-label">YOUR NOTE</span> {Math.min(revealed, total)} of {total} details taken from your note
        </p>
      )}
    </div>
  );
}
