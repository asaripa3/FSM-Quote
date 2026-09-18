# FieldQuote

An Exa-powered parts-intelligence layer for field service. A technician's inspection note becomes verified replacement parts, live supplier prices, and a quote-ready estimate.

![A successful Exa run](docs/exa-run.png)

Above: three reported faults resolved into two orderable parts. The closet's worn diaphragm and cracked vacuum breaker sleeve collapse into a single Sloan A-1101-A kit, because the kit's own contents list — quoted from the page Exa retrieved — already includes the vacuum breaker repair kit. The second line item would have been a wasted order. The panel on the right shows every Exa call the run made.

## Chosen market

Field Service Management and MRO parts procurement — plumbing, HVAC, electrical and similar maintenance trades.

**Enterprise customer:** commercial field-service companies, multi-trade maintenance operators, facilities-service providers.

**End user:** the field technician or service estimator. Today they inspect equipment, record a note, then later replay it, identify parts, search supplier sites, verify compatibility, copy prices, and hand-build a quote. FieldQuote automates that post-inspection research.

## Where Exa is used

Exa runs twice per job, after the note is parsed:

1. **Identify the part** — `POST /search` with `systemPrompt` + `outputSchema`. Exa searches manufacturer and distributor pages and returns the orderable part, its contents, and a quote proving the fit. This is where messy field language ("diaphragm looks worn, vacuum breaker sleeve cracked") becomes one part number.
2. **Price the part** — `POST /search` with per-result structured price extraction, returning current supplier listings, price evidence, SKU, availability and product images.

Quote arithmetic is deterministic and never delegated to a model.

## What is verified before you see it

Nothing reaches the estimate on the model's word alone:

- **Evidence must be on the page.** A quote is scored against the text Exa actually retrieved; below 95% token coverage the card is flagged, not shown as fact. Spec sheets arrive as PDF tables, so this is coverage-based rather than substring matching.
- **The fixture must exist.** If the retrieved pages never mention the equipment the technician named, no part is resolved — the app asks for the model designation instead of substituting a similar valve's kit.
- **Prices must be corroborated.** A price appears only when it is present in both the extraction's quote and the retrieved page text; otherwise the card reads "price needs confirmation".
- **Ambiguity is surfaced, not guessed.** Where variants differ only by flow rate or voltage and the note does not say which, the app asks rather than picking one.

Toggle **Exa** off in the workspace header to see the same job with every Exa contribution withheld — the technician's words, no part number, no supplier, no price.

## Structure

- `frontend/` — Next.js app, Exa API routes (`/api/parse`, `/api/discover`, `/api/source`).
- `backend/` — holds `.env` only; reserved for the LiveKit voice agent.

## Run it

```bash
cd backend && cp .env.example .env   # fill in EXA_API_KEY and the LiveKit keys
```

```bash
cd frontend && npm install && npm run dev
```

The frontend reads `backend/.env` server-side; keys are never sent to the browser.
