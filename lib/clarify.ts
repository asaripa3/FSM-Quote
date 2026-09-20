import type { Brief } from "./job";

/**
 * A question worth asking before spending a search on the job.
 *
 * `options` are taps, not a closed set: every follow-up also accepts free text, because the useful
 * answer to "can you read the tag" is usually the fragment itself rather than yes or no.
 */
export type FollowUp = {
  id: string;
  question: string;
  options: string[];
  placeholder: string;
  /** Said on screen, because a technician who knows why they are being asked answers better. */
  because: string;
};

/** Asking more than this reads as an interrogation and the technician abandons it. */
const MAX = 3;

/**
 * What is missing from the observation that would change the retrieval.
 *
 * Only asked when the answer would alter what comes back, never to be thorough. Measured on the
 * scenario set: a Symmons note carrying "Temptrol" returned six sources naming the exact model and
 * three manufacturer pages, while a Powers note that hedged the designation returned eight sources
 * none of which could be tied to the machine. The difference was one designation in the note, so
 * that is the first thing worth a question.
 *
 * Deterministic, from the brief the parser already produced. No model call and no search: a
 * clarifying question that costs a retrieval to ask has defeated its own purpose.
 */
export function followUps(brief: Brief): FollowUp[] {
  /** What each question already covers, so the parser's own wording of it is not asked twice. */
  const out: (FollowUp & { covers: RegExp })[] = [];

  if (!brief.model.trim()) out.push({
    covers: /\b(?:model|serial|designation|class|series|part\s*(?:number|no)|tag|nameplate|plate)\b/i,
    id: "model",
    question: "Can you read a model, class or series designation on it?",
    options: ["Nothing readable on the tag", "No tag at all"],
    placeholder: "Type whatever you can read, even a fragment",
    because: "Every source is graded against this designation. Without one, documentation for the right family reads the same as documentation for the wrong one.",
  });

  if (!brief.manufacturer.trim()) out.push({
    covers: /\b(?:manufacturer|maker|brand|who\s+(?:made|makes))\b/i,
    id: "manufacturer",
    question: "Who made it?",
    options: ["Unbranded or badge is gone"],
    placeholder: "Manufacturer name as it appears on the equipment",
    because: "The maker decides which documentation counts as the manufacturer's own.",
  });

  // Only asked where the report suggests a controller is involved, and deliberately narrow. An
  // earlier pass matched on "control" and "thermostat", which asked a technician standing at a
  // purely mechanical thermostatic mixing valve which fault code its control board was showing. A
  // question that does not apply to the equipment costs more trust than the answer was worth.
  const electronic = /\b(?:board|controller|led|display|fault code|error code|ignition|flash code|module)\b/i
    .test(`${brief.equipment} ${brief.symptoms.join(" ")}`);
  if (electronic && !brief.faultCodes.length) out.push({
    covers: /\b(?:fault|error|code|led|flash|blink|display)\b/i,
    id: "code",
    question: "Is the control board showing a fault code or an LED pattern?",
    options: ["No code showing", "No display on this board", "Did not check"],
    placeholder: "The code or the flash pattern, exactly as shown",
    because: "A code narrows the search to one failure. A misremembered one sends it after the wrong failure entirely.",
  });

  /**
   * A designation that names a family without naming the variant inside it.
   *
   * Asked for further MARKINGS, never for the variant itself, because the variant is the thing
   * being researched. A suffix letter, a casting date or a stamped code is on the equipment they
   * are already looking at and is what separates one repair kit from another, so it is both
   * answerable from where they stand and worth the asking. Raised only when the technician said
   * themselves that the variant is what they cannot pin down.
   */
  const unsureWhichVariant = /\b(?:variant|version|revision|generation|sub-?model|suffix|which model|exact model|model number)\b/i
    .test(brief.stillUncertain.join(" "));
  if (brief.model.trim() && unsureWhichVariant) out.push({
    covers: /\b(?:variant|version|revision|marking|casting|stamp|suffix)\b/i,
    id: "markings",
    question: `Any other markings beyond ${brief.model.trim()} — a suffix, a casting date, or a code stamped on the body or behind the trim?`,
    options: ["Nothing else legible", "Have not looked behind the trim"],
    placeholder: "Anything stamped, cast or printed, even partial",
    because: "A suffix or date code is what separates one repair kit from another inside the same family, and it is the one thing that narrows this which you can read without pulling anything.",
  });

  if (!brief.alreadyChecked.length) out.push({
    covers: /\b(?:checked|ruled out|tested|eliminat|already)\b/i,
    id: "checked",
    question: "What have you already ruled out?",
    options: ["Nothing yet"],
    placeholder: "Tests you ran and what they showed",
    because: "Whatever you have eliminated does not need researching, and what you found narrows what does.",
  });

  return out.slice(0, MAX).map(asked => ({ id: asked.id, question: asked.question, options: asked.options, placeholder: asked.placeholder, because: asked.because }));
}

/**
 * The observation and the answers, as one note for the parser.
 *
 * Appended rather than merged, and in the technician's own words, so every grounding check
 * downstream still runs against text a human actually wrote. A designation supplied in an answer
 * has to be findable in the note or the brief would refuse it, which is the behaviour we want.
 */
export function noteWithAnswers(note: string, asked: FollowUp[], answers: Record<string, string>) {
  const given = asked
    .map(f => ({ f, answer: (answers[f.id] ?? "").trim() }))
    .filter(({ answer }) => answer.length > 0);
  if (!given.length) return note;
  return `${note.trim()}\n\nFollow-up answers:\n${given.map(({ f, answer }) => `${f.question} ${answer}`).join("\n")}`;
}
