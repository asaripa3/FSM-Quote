# FieldQuote

An Exa-powered parts-intelligence layer for field service. A technician's inspection note becomes verified replacement parts, live supplier prices, and a quote-ready estimate.

**Live:** [fsm-quote.vercel.app](https://fsm-quote.vercel.app)

![A successful Exa run](docs/exa-run.png)

Above: three reported faults resolved into two orderable parts. The closet's worn diaphragm and cracked vacuum breaker sleeve collapse into a single Sloan A-1101-A kit, because the kit's own contents list (quoted from the page Exa retrieved) already includes the vacuum breaker repair kit. The second line item would have been a wasted order. The panel on the right shows every Exa call the run made.

## Chosen market

Field Service Management and MRO parts procurement: plumbing, HVAC, electrical and similar maintenance trades.

**Enterprise customer:** commercial field-service companies, multi-trade maintenance operators, facilities-service providers.

**End user:** the field technician or service estimator. Today they inspect equipment, record a note, then later replay it, identify parts, search supplier sites, verify compatibility, copy prices, and hand-build a quote. FieldQuote automates that post-inspection research.

## Where Exa is used

Exa runs twice per job, after the note is parsed:

1. **Identify the part.** `POST /search` with `systemPrompt` and `outputSchema`. Exa searches manufacturer and distributor pages and returns the orderable part, its contents, and a quote proving the fit. This is where messy field language ("diaphragm looks worn, vacuum breaker sleeve cracked") becomes one part number.
2. **Price the part.** `POST /search` with per-result structured price extraction, returning current supplier listings, price evidence, SKU, availability and product images.

Quote arithmetic is deterministic and never delegated to a model.

## What is verified before you see it

Nothing reaches the estimate on the model's word alone:

- **Evidence must be on the page.** A quote is scored against the text Exa actually retrieved; below 95% token coverage the card is flagged rather than shown as fact. Spec sheets arrive as PDF tables, so this is coverage-based rather than substring matching.
- **The fixture must exist.** If the retrieved pages never mention the equipment the technician named, no part is resolved. The app asks for the model designation instead of substituting a similar valve's kit.
- **Prices must be corroborated.** A price appears only when it is present in both the extraction's quote and the retrieved page text. Otherwise the card reads "price needs confirmation".
- **Ambiguity is surfaced, not guessed.** Where variants differ only by flow rate or voltage and the note does not say which, the app asks rather than picking one.

Toggle **Exa** off in the workspace header to see the same job with every Exa contribution withheld: the technician's words, no part number, no supplier, no price.

## Structure

A single Next.js app. The Exa work runs in route handlers, which deploy as serverless functions, so there is no separate backend to run.

- `app/api/quote-stream` runs the whole job and streams each stage back: note to faults, faults to parts with Exa, parts to priced supplier options.
- `app/api/source` re-prices a single resolved part when you retry one candidate.
- `app/api/transcribe` turns a recording or a microphone take into a note.
- `lib/` holds the trade packs, quote maths, and server-only provider calls.

## Run it

```bash
cp .env.example .env.local
```

Fill in `EXA_API_KEY` and the LiveKit keys, then:

```bash
npm install && npm run dev
```

Keys are read from the environment server-side and never reach the browser.

## Deploy

Deploys to Vercel with no configuration. Import the repository, then set `EXA_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in the project's environment variables.
