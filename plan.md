# FSMpedia architecture

The product researches before it procures. A field note may legitimately contain no
repair decision, and the ordinary case is that the equipment is unfamiliar and the
answer is on the open web rather than in the company's own systems.

Two principles the field names, the prompts and the interface all have to carry:

- **Do not estimate what is not yet understood.** Parts are researched externally;
  labour comes from the contractor's own rules, never from the web.
- **The system reports evidence, it does not diagnose.** The technician is on site
  and the retrieval is not, so their finding outranks any candidate list.

## Eight steps, four phases

```
1 CAPTURE    voice / text / model plate                 components/audio-input.tsx
2 UNDERSTAND equipment, model, codes, checked, unsure   lib/server/input.ts
3 RESEARCH   one broad Exa search, bounded top-up       lib/server/research.ts
4 EXPLAIN    evidence, checks, repair paths, citations  components/research-packet.tsx
             ---- the technician runs the checks ----
5 CONFIRM    what they found, in their words            components/research-packet.tsx
6 SOURCE     part, supplier, public price               lib/server/discovery.ts, product-search.ts
7 ESTIMATE   labour rate, hours, markup                 lib/trades.ts
8 QUOTE      estimate, parts list, exclusions           lib/quote-pdf.ts
```

Externally this is four phases: **Capture, Research, Confirm, Act**, where Act holds
sourcing, estimate and quote.

## Two phases over one route

`POST /api/quote-stream` serves both, and the body says which:

- `{trade, note}` — understand, research, stop at `awaiting_confirmation`.
- `{trade, note, confirmed}` — source and price what the technician confirmed.

Phase two makes **no model call**. The note was understood in phase one and the
technician has since decided what it could not, so re-reading it would spend a call to
rediscover the confirmation and add a second place a retry could fail. Sourcing is
retryable on its own without touching the research that produced it.

A note that already names a part number skips research and confirmation entirely: the
transcript *is* the confirmation. That path proves the architecture is not "Exa
everywhere" but Exa where external knowledge is actually needed.

`confirmed` is untrusted client input. It is clamped at the route and re-grounded
against the note in the pipeline: a plate designation the note never carried is
refused, and so is a requirement the note never stated.

## What evidence has to survive

Nothing reaches the technician on a model's word alone.

- A **repair path** needs a component, an on-site test that would settle it, and a
  verbatim sentence located on a page that was retrieved. Its trust label is derived
  from where that sentence was found, never from a label the model wrote.
- A **contradiction** needs the same. Absence of a fault code from a few pages does
  not establish that the equipment never uses it.
- A **candidate part** needs a real catalogue number and a quote anchored on a page
  that also carries that identifier.
- A **price** needs the amount located in the page text independently.

Claims are checked against the whole retrieved document, not the excerpt displayed
beside them. Verifying against a 1800-character highlight made a real sentence from
page four of a service manual indistinguishable from an invented one.

A source is placed on two axes: where it came from (`oem`, `mirror`, `distributor`,
`practitioner`, `forum`, `unknown`) and how close it comes to this machine (`exact`,
`family`, `manufacturer`, `none`). A `.pdf` path earns nothing; one Lennox manual
Exa returned during testing was served from a Russian file host.

## Measured

- Research: **$0.0070**, one `/search`, ten results, highlights and text and the
  structured output in the same call. A second search only when a whole class of
  source came back missing.
- Sourcing a confirmed repair: **$0.0300** across three calls, end to end in under
  six seconds.
- Search cost is nearly flat in result count ($0.0070 at four and eight, $0.0090 at
  twelve); `/contents` is about $0.001 a page; schema size is free.
- Restricting suppliers by domain is harmful: a Square D QO120 restricted to
  amazon/homedepot/lowes returned four pages and no price, while the unrestricted
  search priced it from two specialist distributors. Preference, not exclusion.
- One host may contribute three pages. Seven of twelve results for a Carrier pressure
  switch were near-duplicate pages from one supplier, and the page carrying a real
  part number was never retrieved.

The call count is low because routing happens locally, before Exa, not because Exa is
rationed.

## Deliberately absent

- **No knowledge corpus.** The premise is that the technician will meet equipment
  their company has never seen, so manuals, bulletins and supersessions are assembled
  live for that job rather than collected and maintained in advance. The registry
  (`lib/server/registry.ts`) holds only conclusions this contractor's own technicians
  have confirmed, and starts empty for every company.
- **No prompt-output cache.** Two technicians describe the same fault differently, so
  a cache keyed on note text would almost never hit and would go stale invisibly.
- **No automatic procurement before confirmation.** Prices on screen before a
  diagnosis undermine the thesis, so the path is removed rather than left running.

## Known limits

- The registry is a process-global in-memory Map with no company identifier. Durable,
  tenant-scoped storage is the next step; the interface is the only thing that changes.
- The paid routes have an origin check, which is neither authentication nor a quota.
- A multi-item job that goes through confirmation collapses to the one confirmed
  repair; the other reported items appear as exclusions on the estimate rather than
  being sourced.
- Model-plate scanning needs an image upload and a vision call. The optional plate
  field covers it for now.
