# FSMpedia architecture audit — 20 September 2026

## Verdict

The pivot is implemented in the orchestration, but the evidence contract is weaker than the product claims. Research-before-procurement is a better fit for an uncertain field observation. The current implementation can still present unsupported generated claims as documented knowledge, and loses important equipment context at the confirmation boundary. Prioritize these over more search tuning or visual work.

Audited commit: `bb6bd7f`. Intended design: the supplied `FSMpedia_Product_Direction_Audit.md`, supported by the recent “Market opportunity analysis” conversation. Repository `plan.md` still describes the earlier parts-first architecture and should be archived or updated. Statements in the supplied audit were treated as claims to check, not as proof that implementation works.

## What was tested

- Existing suite: **45 passed, 1 skipped** (live-provider test).
- Added eight offline contract tests: **1 passed, 7 failed**. These inject controlled provider responses to test application safeguards, not Exa's typical answer quality.
- TypeScript and ESLint passed before the audit artifacts were added; the new audit file was also linted separately.
- No paid Exa or LiveKit calls, dependency upgrades, deployment, or application code changes in this audit.
- No fresh production build, browser/microphone/PDF end-to-end session, or deployed Vercel streaming test. Those remain unverified, not failed.

Run the existing checks with `npm test`. Run the separate intentionally failing audit contracts with `node --test audits/fsmpedia-contract.test.mjs`. They are outside the normal test glob so the pre-existing suite remains distinguishable from the new acceptance criteria.

## What succeeds

1. **The phase boundary is real.** An uncertain job emits its research packet and returns before product discovery or pricing. Existing pipeline tests exercise that stop. Confirmed repairs enter a separate sourcing phase without calling the parser again.
2. **The exact-request shortcut survives.** Existing tests cover a specifically requested replacement going directly to sourcing. This avoids paying for technical research where the technician has already decided.
3. **A failed practitioner top-up does not destroy OEM research.** Both the existing suite and a new simulated-timeout test preserve the first packet and set `fieldSourcesUnavailable`.
4. **Procurement retains independent evidence checks.** Identifier, amount, contradictory specifications and unavailable-page behavior have existing tests. The pivot has not replaced those checks with unrestricted generated prices.
5. **Source and model relevance are represented separately.** The types and UI distinguish exact, family and manufacturer-only evidence, and ordinary manual mirrors are not automatically authoritative just because they are PDFs. The classification implementation still has the defect below.
6. **Cost is bounded in the ordinary path.** Technical research uses one broad search and at most one field-source top-up; sourcing occurs later with bounded fan-out. This is a useful architecture, although actual current dollar costs were not re-measured here.

## Findings, ordered by priority

### P1 — Generated research claims have no enforceable evidence requirement

`lib/server/research.ts:130–146` copies generated repair paths, evidence levels and contradictions directly into the packet. It does not consume the response's grounding information or bind each claim to a retained source and excerpt. `RepairPath` has no citation field. `components/research-packet.tsx` then renders “OEM documented” or “Two sources agree” from the generated label alone.

Reproduced twice: an empty source list plus an invented OEM repair path is accepted; an empty source list plus a definitive fault-code contradiction is also accepted. Even an empty `confirmBy` is accepted. Filtering a navigation page out of the source list does not remove claims derived from it.

**Fix:** Give each actionable claim supporting source IDs and excerpts, validate them against returned evidence, and derive trust labels from those supports. Require a meaningful confirmation check. Withhold unsupported claims while retaining useful sources. A contradiction should require explicit, relevant evidence; absence of a code in retrieved highlights does not establish that the equipment never uses it.

### P1 — Brand substrings confer OEM authority

`lib/research.ts:28` treats any hostname containing the normalized manufacturer name as OEM. The new test shows `carrier-manuals.example` is classified as OEM. A domain such as `carrier.com.unrelated.example` meets the same rule.

**Fix:** Use a small maintained mapping of manufacturer identities to verified publication domains, with exact host/subdomain boundaries. This is provenance configuration, not a pre-collected knowledge corpus. Unrecognized sources can remain visible without receiving OEM authority.

### P1 — Confirmation discards the context needed to source the correct part

`components/workflow.tsx:45` sends only generic equipment and manufacturer alongside the chosen component/findings. `lib/server/pipeline.ts:62–67` reconstructs one part with quantity 1, no SKU, no constraints and no explicit model. The confirmed branch does not re-read the note, so details present only there are lost.

The audit intercepted the outgoing discovery request after confirming a pressure switch for `Carrier 48TCED08A2A6` with an explicit `120 V` requirement. Neither identifier nor requirement reached that request. This creates a generic buying question after a model-specific research phase. The branch also replaces the incoming scope with one synthetic `part-1`, which needs explicit treatment for multi-item jobs and exclusions.

**Fix:** Carry a versioned confirmed-repair object containing equipment ID/model/serial, component, constraints, quantity, original work-item IDs, findings and evidence references. Preserve context directly; do not reintroduce a parser call merely to recover fields the app already has.

### P1 — Invented fault codes survive normalization

`lib/server/input.ts:102` clamps fault-code strings but does not verify them against the note. Model and serial fields do have such a guard.

Reproduced: a note explicitly stating that no fault code was recorded accepts a model response containing `31`. Research then asks about that invented code, potentially generating a convincing contradiction to an assumption the technician never made.

**Fix:** Anchor codes to transcript spans, handling spoken numbers and flash-count notation carefully. An unmatched code becomes a review question, not a research premise. Also avoid using a replacement part number as the equipment model through the fallback at line 100.

### P2 — Existing checks and uncertainty do not reach Exa

The broad and fallback request builders in `lib/server/research.ts:40–60` include equipment, model, symptoms and codes but omit `alreadyChecked`, `stillUncertain` and serial. The new test confirms that “Continuity measured 0.2 ohms” and “venting obstruction not inspected” are absent from the entire request.

**Fix:** Include concise, labeled observations and unresolved questions in the research input. This improves relevance using information already paid for and can avoid recommending tests the technician has completed. Treat reported measurements as observations, not instructions.

### P2 — Missing output is treated as a substantive negative finding

`lib/server/research.ts:130` defaults missing structured output to `{}` and returns a successful empty packet. The UI in `components/research-packet.tsx` equates zero repair paths with documentation not supporting the reported fault.

The new test confirms that a response with no structured output succeeds instead of producing a retryable extraction error. No results, failed extraction, insufficient evidence, a supported contradiction and a repair requiring no replacement are different outcomes.

**Fix:** Validate the response shape and represent these outcomes explicitly. Use “Insufficient retrieved evidence” for an incomplete search; reserve contradiction wording for a supported contradiction. Keep usable sources when extraction fails.

### P2 — The proposed no-replacement outcome still becomes a buying request

The research prompt explicitly permits paths such as clearing an obstruction or correcting wiring. The confirmation UI nevertheless asks for “The part you need,” and every confirmation calls `sourceParts`. Printing requires at least one priced part (`components/workflow.tsx:73–74`). A legitimate labor-only fix cannot complete the intended flow.

**Fix:** Model the confirmed action as replacement, adjustment/repair, additional diagnosis, or no work required. Permit a labor-only estimate. Service fees and a structured next-visit plan are also described in the supplied direction but not implemented in the current economics/quote model.

## Further architectural gaps

- **Research retry is not isolated.** Confirmed sourcing avoids re-parsing, but retrying research calls `analyze()` with no confirmation, clears the job and packet, and runs the parser again. Preserve the brief and retry only the failed research phase. A request failure during that retry can otherwise lose the displayed parsed context, despite retaining the raw note.
- **Field knowledge is appended, not reconciled.** The second search adds source rows, but summary, checks, contradiction and repair paths still come only from the first search. Do not imply that the packet's conclusions incorporate or reconcile the fallback sources. Add an evidence section or bounded reconciliation only when those sources materially change the answer.
- **The registry is not company-scoped confirmed memory.** `lib/server/registry.ts` uses a process-global in-memory Map with no company identifier. Pipeline research still writes eligible candidates before the estimator's final fit confirmation. Removing seed data helps, but does not establish the tenancy and confirmation semantics described in its comments. Disable automatic reuse for a multi-company deployment until those boundaries exist.
- **Source-type heuristics are not contributor verification.** YouTube hostname alone establishes neither a qualified practitioner nor corroboration. Family matching is a prefix heuristic, not verified model-range membership. Keep labels appropriately qualified.
- **Trace totals lose research history at sourcing.** `discovery_complete` replaces the trace with discovery trace, discarding the earlier technical-research trace from displayed totals. Append stage-scoped trace data so whole-job cost claims remain honest.
- **Public paid endpoints remain an access-control decision.** The existing origin-only check is not authentication or a usage quota. A protected local demo and an internet-accessible multi-company service require different controls.

## Optimization plan for the current stage

### First: improve correctness without increasing search volume

1. Enforce claim-to-source evidence and fix OEM domain classification.
2. Preserve the complete confirmed context; ground fault codes and include already-checked observations in research.
3. Separate insufficient evidence, malformed output and supported contradiction.

Acceptance: the seven failing audit contracts pass, plus a navigation-only result cannot support an actionable claim. These changes target the current product promise rather than adding more API calls.

### Next: prevent repeat work and unnecessary calls

1. Give each job a stable ID and immutable brief revision. Retry research from that brief; retry one supplier independently. Keep research and procurement state separate.
2. Retain phase-specific results and append trace events instead of resetting the cost history. Track attempts, actual provider calls, accepted claims and usable prices separately.
3. Add cancellation-aware in-flight deduplication and short-lived research-result reuse only for the same tenant, equipment and observation revision. Never cache a technician diagnosis merely because a generated candidate was confident.
4. Keep broad supplier coverage and the existing candidate budget until measured accepted-price yield demonstrates a better alternative. The previous domain restriction experiment is not a reason to restrict technical research sources.

### Then: a small, repeatable quality evaluation

Use six scenarios: exact replacement; uncertain fault with useful OEM evidence; explicit code contradiction; no useful evidence; repair requiring no part; and mixed known/unknown work. Add timeouts at parser, broad research, practitioner fallback and sourcing. Assert no premature procurement, preserved context, supported citations, correct exclusions and no duplicate quote rows.

Run offline fixtures on every change. When usage allows, run one ambiguous and one exact live case, recording request IDs, per-phase latency, cost, source/model relevance and accepted evidence. A single successful Carrier demo is a useful example, not proof that negative conclusions are stable across equipment or repeated searches.

### Defer

Do not add a large RAG corpus, default deep search, image scanning or speculative supersession machinery now. Add service fees, labor-only completion and next-visit details before claiming the full estimate/quote plan is finished. Add tenant authentication, quota enforcement and durable confirmed-history storage before treating the demo as a multi-company product.
