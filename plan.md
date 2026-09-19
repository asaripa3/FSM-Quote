I’d structure it around two paths: exact-part search and ambiguous-part resolution. Exa stays at the center of both.
Technician
 voice / text / inspection notes
          │
          ▼
1. Input Understanding Layer
   - speech-to-text if needed
   - preserve raw transcript
   - extract lightweight fields only:
     brand, symptom, appliance/fixture,
     suspected part, dimensions, location,
     urgency, confidence
          │
          ▼
2. Intent Router
   ├── High-confidence / exact part
   │      "Moen 1222 cartridge"
   │
   └── Ambiguous / descriptive part
          "older Moen single-handle shower,
           dripping after shutoff,
           cartridge looks seized"
For the exact path:
Exact part intent
      │
      ▼
3A. Exa Product Search
    /search
    type: auto or fast
    category: product
    numResults: 10–20

    contents:
      highlights:
        query: "<part> compatibility price"
      summary:
        schema:
          product_name
          manufacturer
          model
          price
          currency
          availability
      extras:
        richImageLinks
        imageLinks

      │
      ▼
4. Candidate Validator
   - exact model match
   - compatibility constraints
   - remove marketplace/noisy pages
   - dedupe same SKU
   - reject contradictory specs
      │
      ▼
5. Supplier Ranker
   - compatibility first
   - availability
   - preferred vendors
   - price
   - location/shipping
      │
      ▼
6. FSM UI
   - product image
   - supplier
   - price
   - evidence snippet
   - source link
   - "Add to estimate"
For the ambiguous path:
Ambiguous technician description
          │
          ▼
3B. Exa Discovery Search
    /search
    type: auto / deep-lite
    no product category initially

    query:
    rich natural-language description
    of symptom + equipment + suspected repair

    contents:
      highlights: true

          │
          ▼
4B. Part Resolution
    Extract 1–5 concrete candidate products:
      - Moen 1222 cartridge
      - Moen 1225 cartridge
      - Moen cartridge puller

    Keep:
      candidate name
      why it matches
      confidence
      conflicting evidence

          │
          ▼
5B. Fan-out Product Search
    One Exa category:product search
    per candidate

          │
          ▼
6B. Compatibility Resolver
    Compare:
      manufacturer
      model
      valve/system type
      thread size
      dimensions
      OEM/aftermarket
      supporting highlights

          │
          ▼
7. Supplier Ranker + FSM UI
The main runtime architecture:
                   ┌─────────────────────┐
                   │ Technician / User   │
                   └─────────┬───────────┘
                             │
                    voice / text input
                             │
                             ▼
                   ┌─────────────────────┐
                   │ Input Normalizer    │
                   │ + Part Intent       │
                   └─────────┬───────────┘
                             │
                    confidence routing
                 ┌───────────┴───────────┐
                 │                       │
                 ▼                       ▼
      ┌───────────────────┐   ┌─────────────────────┐
      │ Exact Part Path   │   │ Ambiguous Part Path │
      └─────────┬─────────┘   └──────────┬──────────┘
                │                        │
                │                Exa semantic discovery
                │                        │
                │                  candidate parts
                │                        │
                └─────────────┬──────────┘
                              ▼
                    ┌─────────────────────┐
                    │ EXA PRODUCT SEARCH  │
                    │ category: product   │
                    │                     │
                    │ price               │
                    │ images              │
                    │ URL                 │
                    │ highlights          │
                    │ structured summary  │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Validation Layer    │
                    │ compatibility       │
                    │ dedupe              │
                    │ source quality      │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Supplier Ranking    │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ FSM Work Order UI   │
                    │ Estimate / Purchase │
                    └─────────────────────┘
Keep the local application intelligence deliberately thin before Exa. Do not have an LLM aggressively convert the transcript into an exact SKU before search. That would destroy the strongest part of the demo.
Your local extraction should produce something like:
{
  "raw_context": "Older Moen single-handle shower...",
  "manufacturer": "Moen",
  "fixture": "shower valve",
  "symptom": "dripping after shutoff",
  "suspected_part": "cartridge",
  "possible_family": "Posi-Temp",
  "exact_model": null,
  "confidence": 0.61
}
Then the Exa query should retain the ambiguity:
Find purchasable replacement parts for an older Moen
single-handle shower valve that continues dripping after
shutoff. The technician suspects a Posi-Temp cartridge but
does not know the exact model. Prefer OEM-compatible
replacement cartridges and relevant removal tools.
For production, add a small canonical-part cache:
Resolved Part Registry

canonical_part_id
manufacturer
model
aliases
specifications
known_supplier_urls
last_verified_at
Then routing becomes smarter:
new observation
   │
   ├── known part, high confidence
   │       → Exa product search directly
   │
   └── unknown / ambiguous
           → Exa discovery
           → resolve
           → save canonical part
I’d also stream the workflow to the frontend with SSE:
understanding_input
→ resolving_part
→ searching_products
→ validating_results
→ comparing_suppliers
→ complete
That makes the demo visually clear and also exposes where Exa is working.
The clean ownership split should be:
Your FSM owns:
- technician workflow
- domain constraints
- compatibility rules
- ranking/business logic
- work orders and estimates

Exa owns:
- semantic web retrieval
- product discovery
- search expansion
- product-page retrieval
- price extraction
- image candidates
- evidence/highlights
- structured web extraction
- source URLs
The core architectural rule is:
Exa should solve “what on the live web best matches what this technician actually means?” Your FSM should solve “is this mechanically valid and what should the technician do with it?”

That gives you a clean product story and keeps Exa as the actual foundation rather than a replaceable search box.