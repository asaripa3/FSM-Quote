# FSMpedia

The live knowledge layer for field technicians.

**Live:** [fsm-quote.vercel.app](https://fsm-quote.vercel.app)

![Exa research on a Carrier rooftop unit](docs/exa-run.png)

Above: the technician reported fault code 31. The retrieved documentation says this controller has no
code 31, and what its real flash codes mean. Nothing is sourced or priced until that is settled.

## Why

A technician stands in front of equipment their company has never seen. The manual, the fault code
table, the wiring diagram and the right replacement part are all on the open web, spread across
manufacturer portals, PDFs, distributor pages and forums. Finding them means leaving the job. You
cannot pre-load every manufacturer, model, revision and service bulletin a multi-trade technician
meets over a decade, so the knowledge base has to be assembled per job, live. That is what Exa is for.

## What it does

Describe what you are seeing, by voice or text, including what you do not know. FSMpedia extracts the
equipment, fault codes, symptoms and open questions, then runs one Exa search to build a knowledge
packet for that job: OEM documentation, field knowledge, what the evidence says, and the checks to run
before replacing anything. Sources are graded by where they came from and how closely they match the
machine, so a manual covering the family is never presented as one naming your exact model. You run
the checks and confirm what you found, and only then does it search for the part, the supplier and a
public price. Your labour rate and markup finish the quote, and they never come from the web.

## Setup

```bash
cp .env.example .env.local
```

Fill in `EXA_API_KEY`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, then:

```bash
npm install && npm run dev
```

Keys are read server-side and never reach the browser. `npm test` runs the suite.

Deploys to Vercel with no configuration. Set the same three variables in the project. The API routes
have no authentication or rate limiting and call paid services, so put deployment protection in front
of them before sharing a URL.
