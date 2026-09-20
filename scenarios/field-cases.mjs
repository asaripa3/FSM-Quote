/**
 * The cases FSMpedia is actually for, and a harness that runs them against live Exa.
 *
 * Not `npm test`. These spend real money and their answers move between runs, so they are an
 * evaluation rather than a suite: run them to see whether the product is doing its job, not to gate
 * a commit. The offline tests in tests/ check mechanics with mocked providers and stay where they are.
 *
 *   node --env-file=.env.local scenarios/field-cases.mjs            # all cases
 *   node --env-file=.env.local scenarios/field-cases.mjs powers     # one, by id
 *
 * WHAT MAKES A CASE BELONG HERE
 *
 * The technician is competent and knows their trade. What they cannot know is the equipment's
 * history: which revision is installed, what a previous contractor retrofitted, which service
 * bulletin applies, what supersedes what. That knowledge lives on the open web and in nobody's
 * head, which is the whole reason to retrieve it.
 *
 * So a case qualifies on: legacy equipment, model or revision ambiguity, retrofit history,
 * discontinued or superseded parts, OEM versus aftermarket internals, conflicting manuals, partial
 * identification from a damaged tag, or an equipment-specific test sequence.
 *
 * A case does NOT qualify if the technician is asking what a cartridge is, how to identify a part
 * by looking at it, how to run a standard diagnostic they were trained on, or what the code says.
 * Writing those in flatters the product and misrepresents the buyer: a plumber who needs the first
 * three is not the plumber who pays for this.
 */

export const CASES = [
  {
    id: "powers",
    trade: "plumbing",
    /** Model/revision ambiguity plus retrofit history plus supersession. The hardest honest case. */
    uncertainty: "Which valve generation is installed, whether the internals are already a retrofit, and which current kit fits it",
    note: `Hotel mechanical room, older Powers thermostatic mixing valve on the domestic hot water loop. The tag is damaged but the body looks like a 900 series. Outlet temperature swings from 120 down to around 90 after about twenty seconds, then recovers. Hot and cold supply pressures are both normal and the check stops are open. The cartridge that is in there now does not match the exploded diagram I found for the older model. I am not sure whether this has already been retrofitted or whether the thermostatic element itself is failing.`,
    good: "Names the generations the body could belong to, flags that the installed cartridge reads as a later kit, and says what to measure (spindle length, temperature-limit assembly) before ordering. Cites an OEM bulletin or parts diagram, not a retailer listing.",
  },
  {
    id: "carrier",
    trade: "hvac",
    /** The reported premise is wrong for this machine. The strongest output is a correction. */
    uncertainty: "Whether the fault code the technician read even exists on this control board",
    note: `Carrier rooftop unit is not cooling. Fault code 31 on the board. Inducer is running but ignition does not proceed. I checked the hose visually. I am not sure whether it is the pressure switch or the venting. Equipment plate: 48TCED08A2A6`,
    good: "States that the 48TC IGC reports 2 to 9 LED flashes and has no code 31, quotes Table 9, and puts re-reading the LED ahead of any component. A component list here is the weaker answer.",
  },
  {
    id: "symmons",
    trade: "plumbing",
    /** Discontinued body, aftermarket internals, kit that no longer matches. */
    uncertainty: "Which rebuild kit fits this generation, given the last one did not",
    note: `1970s Symmons Temptrol tub and shower valve in a walk-up. Brass body is sound and the stops hold. The spindle is seized and the seat looks scored. The rebuild kit the supply house sold me last year did not fit this one, the spindle was shorter and the cap threads were different. I want to know which kit actually matches this generation before I pull it a second time.`,
    good: "Distinguishes Temptrol generations, identifies which kit supersedes which, and names the dimension that tells them apart. Should not simply return the current catalogue kit as if one fits all.",
  },
  {
    id: "contactor",
    trade: "electrical",
    /** Partial identification from a worn label, plus possible supersession of the whole assembly. */
    uncertainty: "Whether the coil alone is serviceable on this frame, or the contactor is superseded",
    // First draft of this note named no manufacturer, and the run graded all ten sources as untied to
    // the equipment - correctly, because the note gave nothing to tie them to. That was a bad case,
    // not a bad result: a technician standing at the panel reads the maker off the label even when
    // the suffix is gone. Partial identification means half a designation, not none.
    note: `Commercial lighting contactor in a 277 volt panel is chattering and dropping the bank. It is a Square D lighting contactor and the coil is stamped 120 V. The class number on the label is worn, I can read 8903 but not the suffix after it. The building has had two lighting retrofits so this may not be the original contactor. I want to know whether the coil is available on its own for this class or whether the contactor has been superseded.`,
    good: "Treats the 120 V coil as a stated requirement, says what the readable frame fragment narrows it to, and reports whether a coil is sold separately for that frame. Should refuse to name a part number no retrieved page carries.",
  },
  {
    id: "exact",
    trade: "plumbing",
    /** The decision is already made. Research here would be spending money to learn nothing. */
    uncertainty: "None. This exists to prove the product does not research what the note already settles",
    note: `Order one Moen 1222 cartridge for the guest bathroom shower. Part number confirmed off the old one. Allow 45 minutes labour.`,
    good: "Skips research entirely and goes to supplier pricing. One model call, no documentation search.",
  },
  {
    id: "labour-only",
    trade: "plumbing",
    /** The correct outcome is that nothing is ordered. */
    uncertainty: "Whether the documented torque spec supports what was found, with no part involved",
    note: `Rheem gas water heater, pilot would not stay lit after another contractor replaced the thermocouple last week. Draft hood and flue are clear. I found the thermocouple nut backed off about half a turn at the gas valve, snugged it, and it is holding now. Nothing to order. I want the manufacturer's torque figure for that connection before I write the visit up.`,
    good: "Finds the documented figure or says plainly that it could not, and completes as a labour-only estimate. Must not invent a torque value, and must not manufacture a part to sell.",
  },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  await import("../tests/register.mjs");
  const { runQuotePipeline } = await import("../lib/server/pipeline.ts");
  const only = process.argv[2];
  const run = only ? CASES.filter(c => c.id === only) : CASES;
  if (!run.length) { console.error(`No case "${only}". Ids: ${CASES.map(c => c.id).join(", ")}`); process.exit(1); }
  const settings = { region: "United States", supplierDomains: "", preferredDomains: "supplyhouse.com, grainger.com" };
  let spend = 0;
  for (const c of run) {
    const events = [];
    const started = Date.now();
    console.log(`\n${"=".repeat(78)}\n${c.id.toUpperCase()}  (${c.trade})  — ${c.uncertainty}\n${"=".repeat(78)}`);
    try {
      await runQuotePipeline({ trade: c.trade, note: c.note, settings }, AbortSignal.timeout(280000), (e, p) => events.push([e, p]));
    } catch (error) { console.log(`  THREW: ${error.message}`); continue; }
    const job = events.find(([e]) => e === "job_parsed")?.[1];
    const packet = events.find(([e]) => e === "research_complete")?.[1];
    console.log(`  brief: maker=${job?.brief.manufacturer || "—"} model=${job?.brief.model || "—"} codes=[${job?.brief.faultCodes ?? ""}] needsResearch=${job?.brief.needsResearch}`);
    if (!packet) { console.log("  no research phase (the note already decided)"); }
    else {
      // Reported apart, because "names the maker" and "cannot be tied to this equipment at all" are
      // different answers and collapsing them hides the case this set exists to find: a technician
      // who could only half-read the tag, whose sources then grade against nothing.
      const grade = m => packet.sources.filter(s => s.match === m).length;
      console.log(`  sources ${packet.sources.length}  exact ${grade("exact")} · family ${grade("family")} · maker-only ${grade("manufacturer")} · untied ${grade("none")}`);
      console.log(`  manufacturer pages: ${packet.sources.filter(s => s.kind === "oem").length}  ·  readable in app: ${packet.sources.filter(s => s.viewable).length}`);
      if (packet.contradicts) console.log(`  CORRECTION: ${packet.contradicts}`);
      console.log(`  first check: ${packet.checkBeforeReplacing[0] ?? "—"}`);
      for (const p of packet.repairPaths) console.log(`    component  ${p.evidenceLevel.padEnd(12)} ${p.component}`);
    }
    const trace = [...(packet?.trace ?? []), ...events.flatMap(([e, p]) => e === "discovery_complete" || e === "supplier_results" ? p.trace ?? [] : [])];
    const cost = trace.reduce((s, t) => s + (t.costDollars ?? 0), 0);
    spend += cost;
    console.log(`  ${trace.length} Exa calls · $${cost.toFixed(4)} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(`  LOOKS RIGHT WHEN: ${c.good}`);
  }
  console.log(`\ntotal Exa spend this run: $${spend.toFixed(4)}`);
}
