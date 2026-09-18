# Exa FSM — FieldQuote Demo Plan

## 0. Demo Goal

Build a polished Exa-powered enterprise demo for **Field Service Management (FSM)** showing how a technician's inspection note becomes a verified, quote-ready parts list.

The customer is the **field-service business**. The end user is the **field technician / estimator**.

Core workflow:

```text
FIELD INSPECTION
      ↓
TECHNICIAN RECORDS A VOICE NOTE
      ↓
TRANSCRIPT / TEXT NOTE
      ↓
TRADE-SPECIFIC PARSING
      ↓
PART INTENT
      ↓
EXA DISCOVERY
      ↓
EXACT PRODUCT / SKU
      ↓
COMPATIBILITY VERIFICATION
      ↓
EXA PRODUCT SEARCH
      ↓
LIVE SUPPLIER LISTINGS
      ↓
SELECT SOURCE
      ↓
DETERMINISTIC QUOTE
```

The demo must make two things immediately clear:

1. **Who the end user is and what problem they are solving.**
2. **How Exa fits into that user's actual workflow.**

---

# 1. Product Positioning

## Product name

**FieldQuote**

## Tagline

> **From inspection voice notes to quote-ready parts.**

## Market

**Field Service / MRO Parts Intelligence**

## Enterprise customer

Commercial field-service organizations such as:

- plumbing service companies
- HVAC service companies
- electrical contractors
- facilities-maintenance providers
- multi-trade maintenance operators

## Economic buyer

- VP of Field Service
- Director of Operations
- Head of Service
- Procurement leader
- Digital Transformation leader
- CTO / VP Engineering for larger service businesses

## End user

- Field technician
- Service estimator
- Service manager reviewing quotes

---

# 2. The Business Problem

Technicians already capture useful information during inspection. The manual work begins afterward.

Typical current workflow:

```text
Technician inspects equipment
        ↓
records voice note
        ↓
moves to next job
        ↓
replays the note later
        ↓
writes down required repair
        ↓
identifies possible part numbers
        ↓
searches supplier websites
        ↓
checks compatibility
        ↓
copies prices
        ↓
calculates labor + markup
        ↓
writes customer estimate
```

The expensive part is converting the diagnosis into:

- exact part
- compatible replacement
- current supplier
- current price
- source evidence
- quote-ready line item

FieldQuote compresses that post-inspection workflow.

---

# 3. Product Thesis

> **Technicians already know what is wrong. FieldQuote uses Exa to resolve their field language against the live product web and turn it into verified parts and current sourcing options.**

```text
Messy technician language
        ↓
Exa-powered product discovery
        ↓
Verified compatible SKU
        ↓
Current supplier listings
        ↓
Quote-ready procurement data
```

---

# 4. Why Exa

Exa has two distinct jobs.

## Job 1 — Product Discovery

The technician often does **not** provide a clean SKU.

Example:

```text
"The diaphragm inside the Royal 111 looks worn."
```

FieldQuote turns this into a search intent:

```text
Sloan Royal 111 worn diaphragm replacement repair kit
```

Exa searches semantically and discovers a concrete candidate such as:

```text
Sloan A-42-A
Royal Flushometer Diaphragm Repair Kit
```

This is the **discovery path**.

## Job 2 — Current Product Retrieval

Once FieldQuote knows the exact product:

```text
Sloan A-42-A
```

it switches into targeted product retrieval.

Exa retrieves current public product listings including:

- product page
- current price
- product image candidates
- relevant highlights
- source URL
- current retailer listing

This is the **direct product path**.

---

# 5. Core Architecture

Borrow the strongest pattern from Exa's Shopping Demo: broad discovery first when the product is unknown, direct product search when the product is already specific.

```text
                       FIELD NOTE
                           │
                           ▼
                       JOB PARSER
                           │
                           ▼
                       PART INTENT
                           │
                 ┌─────────┴─────────┐
                 │                   │
          EXACT SKU KNOWN?      VAGUE DESCRIPTION
                 │                   │
                 │                   ▼
                 │             EXA DISCOVERY
                 │                   │
                 │                   ▼
                 │             CONCRETE SKU
                 │                   │
                 └──────────┬────────┘
                            ▼
                 COMPATIBILITY CHECK
                            │
                            ▼
                    EXA PRODUCT SEARCH
                            │
                            ▼
                   SUPPLIER LISTINGS
                            │
                            ▼
                  VALIDATE / DEDUPLICATE
                            │
                            ▼
                    HUMAN SELECTION
                            │
                            ▼
                  DETERMINISTIC QUOTE
```

---

# 6. Input Modes

Support three input methods.

## 6.1 Demo Note

This is the **default interview path**.

Use an editable pre-filled note:

> Sloan Royal 111 flushometer in the men's restroom. Valve keeps running after flush. Diaphragm looks worn and the vacuum breaker sleeve is cracked. Replace both. Estimate about 45 minutes labor.

Button:

```text
[ ANALYZE JOB ]
```

This path should always work.

## 6.2 Uploaded Audio

Support:

```text
[ Upload Audio ]
```

File types:

- `.mp3`
- `.wav`
- `.m4a`

Pipeline:

```text
audio file
   ↓
transcription
   ↓
same text pipeline
```

## 6.3 Live Dictation

Optional secondary feature using the existing LiveKit transcription path if stable.

```text
mic → transcript
```

No TTS. No spoken answer. The demo is about Exa retrieval, not voice infrastructure.

---

# 7. Multi-Trade Architecture

Support multiple FSM categories through **Trade Packs**.

Avoid positioning them as separate apps or fully autonomous agents.

Use:

> **One retrieval engine, configured through trade-specific intelligence packs.**

The core engine stays the same. Trade-specific configuration changes:

- terminology
- equipment ontology
- compatibility attributes
- manufacturer vocabulary
- approved suppliers
- product extraction schema
- validation rules

---

# 8. Landing Page Trade Packs

Use three initial roles:

1. **Plumbing**
2. **HVAC**
3. **Electrical**

The pixel-art characters provide personality while the surrounding UI remains clean and Exa-like.

```text
CHOOSE A FIELD WORKFLOW

[ PLUMBING ]      [ HVAC ]      [ ELECTRICAL ]

   avatar           avatar          avatar

Fixtures          Cooling         Panels
Valves            Controls        Breakers
Repair kits       Components      Devices

[ Start job → ]   [ Start job → ] [ Start job → ]
```

---

# 9. Trade Pack — Plumbing

```json
{
  "trade": "PLUMBING",
  "equipment_types": [
    "flushometer",
    "faucet",
    "toilet",
    "valve",
    "pump"
  ],
  "trusted_manufacturers": [
    "Sloan",
    "Kohler",
    "Moen",
    "Zurn"
  ],
  "demo_suppliers": [
    "homedepot.com",
    "lowes.com",
    "amazon.com"
  ],
  "compatibility_fields": [
    "manufacturer",
    "model",
    "part_number",
    "size",
    "flow_rate"
  ]
}
```

Expected extraction from the demo note:

```json
{
  "equipment": {
    "manufacturer": "Sloan",
    "model": "Royal 111",
    "category": "flushometer"
  },
  "issues": [
    "continuous running",
    "worn diaphragm",
    "damaged vacuum breaker sleeve"
  ],
  "required_parts": [
    {"intent": "diaphragm repair kit"},
    {"intent": "vacuum breaker repair kit"}
  ],
  "labor_hours": 0.75
}
```

---

# 10. Trade Pack — HVAC

```json
{
  "trade": "HVAC",
  "equipment_types": [
    "air conditioner",
    "furnace",
    "heat pump",
    "air handler",
    "rooftop unit"
  ],
  "compatibility_fields": [
    "manufacturer",
    "model",
    "voltage",
    "microfarads",
    "horsepower",
    "refrigerant_type"
  ]
}
```

Example note:

> Carrier rooftop unit. Condenser fan isn't starting. Capacitor is swollen. 45/5 microfarad, 440 volt. Need replacement and about an hour labor.

Expected extraction:

```text
Equipment:
Carrier rooftop unit

Part:
Dual run capacitor

Specs:
45/5 µF
440V

Labor:
1.0 hr
```

---

# 11. Trade Pack — Electrical

```json
{
  "trade": "ELECTRICAL",
  "equipment_types": [
    "panel",
    "breaker",
    "disconnect",
    "contactor",
    "outlet"
  ],
  "compatibility_fields": [
    "manufacturer",
    "series",
    "amperage",
    "poles",
    "voltage"
  ]
}
```

Example note:

> Square D QO panel. Customer needs another 20 amp double-pole circuit for the condenser. Need compatible breaker and about an hour and a half.

Expected extraction:

```text
Panel family:
Square D QO

Part:
2-pole breaker

Amperage:
20A

Labor:
1.5 hr
```

---

# 12. Supplier Strategy

For the live interview demo, use recognizable public retailers:

- Home Depot
- Lowe's
- Amazon

Why:

- recognizable
- intuitive
- easy to explain
- public pages
- current product content
- visibly demonstrates Exa product retrieval

---

# 13. Enterprise Supplier Strategy

Make it explicit that public retailers are only the **demo configuration**.

Real deployments may use:

- Ferguson
- Grainger
- Johnstone Supply
- Graybar
- Rexel
- Parts Town
- local wholesalers
- negotiated vendors
- private distributor APIs
- ERP inventory
- contract pricing
- regional suppliers

Visual:

```text
DEMO

Home Depot
Lowe's
Amazon

        ↓

     FieldQuote


ENTERPRISE

Preferred suppliers
Local distributors
OEM catalogs
Contract pricing
ERP inventory

        ↓

     FieldQuote
```

Pitch:

> Public retailers make the demo easy to verify. In an enterprise deployment, supplier retrieval is configured around the customer's approved supply network and procurement policy.

---

# 14. Trade Pack Configuration

Do not say:

> "We just swap the prompt."

Say:

> **The core retrieval engine is horizontal. Each trade pack defines its terminology, compatibility schema, manufacturers, supplier policy, and extraction rules.**

Example:

```json
{
  "trade": "HVAC",
  "allowed_domains": [
    "homedepot.com",
    "lowes.com",
    "amazon.com"
  ],
  "manufacturers": [
    "Carrier",
    "Trane",
    "Lennox"
  ],
  "compatibility_schema": [
    "model",
    "voltage",
    "microfarads",
    "horsepower",
    "refrigerant_type"
  ],
  "markup_percent": 30,
  "labor_rate": 150
}
```

---

# 15. Product Search Routing

## 15.1 Direct Product Path

If the note already includes a specific SKU, part number, or exact product name, skip discovery.

Example:

```text
"Need Sloan A-42-A."
```

Go directly to Exa product search.

Conceptual request:

```json
{
  "query": "Sloan A-42-A diaphragm repair kit United States",
  "type": "auto",
  "numResults": 20,
  "category": "product",
  "contents": {
    "summary": {
      "query": "Price and currency for Sloan A-42-A"
    },
    "highlights": {
      "maxCharacters": 4000,
      "query": "Sloan A-42-A price compatibility"
    }
  }
}
```

## 15.2 Discovery Path

If only functional intent is known:

```text
"diaphragm inside Royal 111 is worn"
```

first run a broader Exa search.

```json
{
  "query": "Sloan Royal 111 worn diaphragm replacement repair kit",
  "type": "auto",
  "numResults": 10,
  "contents": {
    "text": true
  }
}
```

Extract candidate products:

```json
{
  "candidate_products": [
    {
      "name": "Sloan A-42-A",
      "part_number": "A-42-A",
      "reason": "Royal 111 diaphragm repair kit"
    }
  ]
}
```

Each candidate then enters the direct product path.

---

# 16. Compatibility Verification

Before a product enters the quote, verify that it fits the equipment.

Example:

```text
Equipment:
Sloan Royal 111

Candidate:
Sloan A-42-A
```

Search:

```text
Sloan A-42-A Royal 111 compatibility
```

Prefer manufacturer evidence or trustworthy distributor evidence.

Return:

```json
{
  "compatible": true,
  "equipment": "Royal 111",
  "part": "A-42-A",
  "evidence": "...",
  "source": "..."
}
```

UI:

```text
✓ Compatibility verified
```

If compatibility cannot be proven:

```text
? Compatibility unverified
```

Do not automatically use the part in the quote.

---

# 17. Superseded Part Flow

This is an excellent Exa-specific feature.

Example:

```text
"Need part 3301036."
```

The old SKU may be obsolete.

Search:

```text
Sloan 3301036 replacement superseded by
```

Possible UI:

```text
OLD PART DETECTED

3301036
   ↓ superseded by
A-42-A

Verified source:
manufacturer / distributor
```

Then search current suppliers for the replacement part.

Pitch:

> **Your ERP knows what part you bought three years ago. Exa can find what replaces it today.**

---

# 18. Search Result Quality

For each product:

1. collect product search results
2. remove irrelevant marketplace pages
3. prefer structured/raw price evidence
4. validate the product image if images are shown
5. deduplicate the same supplier/product
6. verify compatibility
7. retain source URL
8. rank 3–5 useful options

Do not show 20 raw results.

---

# 19. Human-in-the-Loop Sourcing

Do not automatically equate lowest price with best option.

Use separate labels:

```text
EXACT MATCH
LOWEST PRICE
PREFERRED SUPPLIER
PICKUP TODAY
OEM
```

The technician / estimator selects:

```text
[ USE IN QUOTE ]
```

This is more enterprise-safe than autonomous purchasing.

---

# 20. Quote Engine

Use deterministic business logic.

```text
Quote =
Parts subtotal
+ Parts markup
+ Labor
```

Example:

```text
PARTS

Sloan A-42-A
1 × $41.98                         $41.98

Vacuum Breaker Kit
1 × $28.40                         $28.40

Parts subtotal                     $70.38
Parts markup 30%                   $21.11

LABOR

0.75 hr × $150/hr                 $112.50

─────────────────────────────────────────
ESTIMATED TOTAL                   $203.99
```

Do not let an LLM calculate this.

---

# 21. Supply-Chain Expansion

The longer-term product can move beyond quote preparation.

```text
Technician identifies need
        ↓
Part resolution
        ↓
Approved supplier network
        ↓
price + stock + pickup + location
        ↓
procurement policy
        ↓
best fulfillment option
        ↓
reserve / pickup / delivery
        ↓
quote
        ↓
purchase order
```

Example:

```text
Carrier capacitor XYZ

Grainger
$48.20
2.1 miles
Pickup today

Local HVAC Supply
$43.60
7.4 miles
Contract price
Pickup today

Internal warehouse
$0 transfer
23 miles
Available tomorrow
```

Future optimization can consider:

```text
effective cost =
part price
+ delivery
+ technician travel time
+ SLA impact
```

This is supply-chain management, not just shopping.

---

# 22. UI Design Direction

Use an Exa-inspired visual system.

## Global shell

```text
[ EXA ]  |  FSM
```

Right side:

```text
How it works
Trade Packs
Why Exa
```

Do not put a long product description in the navbar.

---

# 23. Brand Direction

Recommended base palette:

```text
Base background   Exa marble / off-white
Cards             White
Primary           Exa blue
Text              Near-black
Borders           Soft neutral gray
```

Use the pixel characters as the playful visual layer.

Do not make the page black.

Keep the application:

- clean
- technical
- light
- polished
- sparse
- visually memorable through characters

---

# 24. Landing Page Hero

## Eyebrow

```text
EXA FOR FIELD SERVICE
```

## Heading

> **From inspection voice notes to quote-ready parts.**

## Subheading

> Field technicians already record what they find on-site. FieldQuote turns those notes into structured repair requirements, uses Exa to identify and verify the right replacement parts across the live web, and prepares a quote without the manual catalog hunt.

## Workflow strip

```text
INSPECT
   →
RECORD
   →
FIND PARTS
   →
VERIFY
   →
QUOTE
```

Primary CTA:

```text
[ TRY THE WORKFLOW ]
```

---

# 25. Avatar Section

Heading:

> **Choose a field workflow**

Display three large pixel characters.

```text
PLUMBING             HVAC                ELECTRICAL

[avatar]             [avatar]            [avatar]

Fixtures             Cooling             Panels
Valves               Controls            Breakers
Repair kits          Components          Devices

[Start job →]        [Start job →]       [Start job →]
```

Interaction:

- small hover lift
- subtle glow / accent
- role-specific supporting label
- clicking navigates to the corresponding workflow

---

# 26. Problem Section

Heading:

> **Technicians already capture the diagnosis. The manual work starts afterward.**

### Today

```text
Voice note
   ↓
replay
   ↓
identify part
   ↓
Google / catalogs
   ↓
verify fit
   ↓
copy price
   ↓
quote
```

### With FieldQuote

```text
Voice note
   ↓
FieldQuote
   ↓
Exa
   ↓
verified parts
   ↓
current suppliers
   ↓
quote
```

---

# 27. Plumbing Workflow Page

Top nav:

```text
EXA | FSM / PLUMBING
```

Primary layout:

```text
┌────────────────────────────────────┬──────────────────────────────────┐
│ INSPECTION NOTE                    │ JOB                              │
│                                    │                                  │
│ [Demo note] [Record]               │ Equipment                        │
│ [Upload audio]                     │ Sloan Royal 111                  │
│                                    │                                  │
│ ┌────────────────────────────────┐ │ Symptoms                         │
│ │ Sloan Royal 111...            │ │ • valve keeps running            │
│ │ diaphragm looks worn...       │ │ • diaphragm worn                 │
│ │ vacuum breaker cracked...     │ │                                  │
│ │ 45 minutes labor...           │ │ Labor                            │
│ └────────────────────────────────┘ │ 0.75 hr                          │
│                                    │                                  │
│          [ ANALYZE JOB ]           │                                  │
└────────────────────────────────────┴──────────────────────────────────┘
```

---

# 28. Streaming Search Experience

Copy the general UX pattern from Exa demos.

Use Server-Sent Events.

Backend:

```text
POST /api/quote-stream
```

Potential events:

```text
job_parsed
part_discovery_started
search_source
candidate_found
candidate_verified
product_search_started
supplier_found
part_completed
quote_completed
```

Frontend progression:

```text
ANALYZING INSPECTION

✓ Understanding field note

  Sloan Royal 111
  ├─ diaphragm failure
  └─ damaged vacuum breaker

● Finding exact replacement parts

  Searching the live web...
```

Then:

```text
✓ Part identified

  Sloan A-42-A
  Diaphragm Repair Kit
```

Then:

```text
● Verifying compatibility...
```

Then:

```text
✓ Compatible with Royal 111
```

Then:

```text
● Searching current suppliers

  Home Depot
  Lowe's
  Amazon
```

---

# 29. Make Exa Visible

Do not hide Exa behind the product.

Display:

```text
POWERED BY EXA SEARCH
```

Show retrieval activity.

Example:

```text
EXA DISCOVERY

"Sloan Royal 111 worn diaphragm replacement repair kit"

Search type:
Auto

Results:
10 pages
```

Then:

```text
EXA PRODUCT SEARCH

"Sloan A-42-A diaphragm repair kit"

Category:
Product

Results:
20 listings
```

The interviewer should be able to see exactly why Exa is required.

---

# 30. Product Match Screen

Example:

```text
WE FOUND THE PART

┌──────────────────────────────────────────────────────────────┐
│ [product image]                                              │
│                                                              │
│ Sloan A-42-A                                                 │
│ Royal Diaphragm Repair Kit                                   │
│                                                              │
│ ✓ Exact model match                                          │
│ ✓ Royal 111 compatibility verified                           │
│                                                              │
│ Manufacturer evidence                          [View source]  │
└──────────────────────────────────────────────────────────────┘
```

Then supplier options:

```text
HOME DEPOT                              EXACT MATCH
$41.98
✓ Exact SKU
[Use in quote] [View listing]

AMAZON                                  LOWEST PRICE
$38.70
✓ Exact SKU
[Use in quote] [View listing]

LOWE'S
$44.20
✓ Compatible
[Use in quote] [View listing]
```

---

# 31. Quote Screen

```text
QUOTE DRAFT

Customer
Marriott Downtown

Job
Men's restroom — Royal 111 flushometer

PARTS

Sloan A-42-A                  1 × $41.98
Vacuum Breaker Kit            1 × $28.40

Parts                         $70.38
Parts markup 30%              $21.11

LABOR

Plumbing                      0.75 hr
Labor rate                    $150/hr
                              $112.50

──────────────────────────────────────────────
ESTIMATED TOTAL               $203.99
──────────────────────────────────────────────

Supplier
Home Depot

Sources
2 verified listings

[ CREATE QUOTE ]
```

---

# 32. Enterprise Configuration UI

Optional page or modal:

```text
PLUMBING TRADE PACK

Approved Suppliers
────────────────────
✓ Home Depot
✓ Lowe's
✓ Amazon

+ Add supplier


Preferred Suppliers
────────────────────
1. Ferguson
2. Local Plumbing Supply
3. Grainger


Company Rules
────────────────────
Parts markup          30%
Labor rate            $150/hr

Prefer
☑ contract suppliers
☑ local pickup
☑ exact OEM parts
☐ marketplace sellers
```

This communicates configurability without requiring full integrations in the demo.

---

# 33. "How It Works" Section

Use five steps:

```text
1. Understand the inspection
2. Discover the exact part
3. Verify compatibility
4. Search current suppliers
5. Build the quote
```

---

# 34. "Why Exa" Section

Recommended copy:

> Field notes rarely contain clean product names or exact SKUs, while supplier catalogs, compatibility information, images, and prices continuously change. Exa searches the live product web from natural-language repair intent and returns the product evidence, pricing information, page content, and source URL needed to verify each quote item.

Three visual blocks:

## Semantic Discovery

```text
"rubber diaphragm inside a Royal 111"

                ↓

          Sloan A-42-A
```

## Live Product Data

```text
current listing
current price
product image
source URL
```

## Verifiable Results

```text
Every quote item
links back to the
original source.
```

---

# 35. Multi-Trade Section

Heading:

> **One engine. Trade-specific intelligence.**

```text
                 FIELDQUOTE ENGINE

Inspection
note/audio
     │
     ▼
┌───────────────────────────────────────┐
│              TRADE PACK              │
│                                      │
│ terminology                          │
│ equipment ontology                   │
│ compatibility schema                 │
│ trusted manufacturers                │
│ approved suppliers                   │
└───────────────────┬───────────────────┘
                    │
                    ▼
                 EXA SEARCH
                    │
                    ▼
             LIVE PRODUCT WEB
```

Show:

```text
[ PLUMBING ]   [ HVAC ]   [ ELECTRICAL ]
```

---

# 36. Enterprise Deployment Section

Heading:

> **Public web for the demo. Your supply chain in production.**

```text
DEMO
────────────────────
Home Depot
Lowe's
Amazon


CUSTOMER DEPLOYMENT
────────────────────
Approved wholesalers
Local suppliers
OEM sources
ERP inventory
Contract pricing
Pickup availability
```

Message:

> The retrieval engine stays the same; the customer's supplier policy and internal data determine which sources are preferred.

---

# 37. Recommended Landing Page Structure

```text
────────────────────────────────────────
EXA | FSM
────────────────────────────────────────

HERO
From inspection voice notes
to quote-ready parts.

[ Try the workflow ]

────────────────────────────────────────

CHOOSE YOUR FIELD WORKFLOW

[ Plumber ]    [ HVAC ]    [ Electrician ]

pixel avatars

────────────────────────────────────────

THE PROBLEM

Today
Voice note → replay → catalogs → parts →
prices → quote

With FieldQuote
Voice note → Exa → verified parts → quote

────────────────────────────────────────

HOW IT WORKS

1 Understand inspection
2 Discover exact part
3 Verify compatibility
4 Search suppliers
5 Build quote

────────────────────────────────────────

WHY EXA

Semantic discovery
Live product data
Source-backed retrieval

────────────────────────────────────────

ONE ENGINE. MULTIPLE TRADES.

Plumbing
HVAC
Electrical

────────────────────────────────────────

ENTERPRISE DEPLOYMENT

Demo:
Home Depot / Lowe's / Amazon

Production:
approved wholesalers
local suppliers
contract pricing
ERP / inventory
pickup availability

────────────────────────────────────────
```

---

# 38. FDE Interview Demo Sequence

## Step 1 — Frame the customer

Say:

> “The customer is a multi-trade field-service organization. The end user is a technician who already records inspection notes in the field. The manual work starts afterward when someone has to convert that note into exact parts, verify fit, search suppliers, copy prices, and build the estimate.”

## Step 2 — Choose a trade

Click **Plumbing**.

## Step 3 — Show the field note

Use the pre-filled note.

Say:

> “In production this can arrive from a recorded inspection or live transcription. For the demo I'm using the same transcript directly so we can focus on retrieval.”

## Step 4 — Analyze

Click:

```text
ANALYZE JOB
```

Show extracted:

```text
Sloan Royal 111
continuous running
diaphragm repair
vacuum breaker repair
0.75 hr labor
```

Do not spend long here.

## Step 5 — Exa discovery

Show actual query and streaming results.

Say:

> “The technician didn't give me a SKU. Exa is resolving the repair intent against the live web to identify the product.”

Show the candidate SKU.

## Step 6 — Compatibility

Show verified compatibility and source evidence.

Say:

> “I don't put the part into a quote just because a model suggested it. We verify the match against retrieved product evidence.”

## Step 7 — Supplier search

Show Home Depot, Lowe's, and Amazon with price and source.

Say:

> “Once I know the exact product, I switch from discovery to Exa's product-search path and retrieve current supplier listings.”

## Step 8 — Select supplier

Click:

```text
USE IN QUOTE
```

## Step 9 — Quote

Show deterministic calculation.

Say:

> “The quote math itself is regular business logic. Exa solves the external-data problem: identifying the right part and grounding it against current supplier information.”

## Step 10 — Show scalability

Return to the trade selector.

Say:

> “Nothing in the core retrieval architecture is plumbing-specific. HVAC and electrical use the same pipeline with different terminology, compatibility schemas, manufacturers, and supplier policies.”

---

# 39. Three-Slide Interview Structure

## Slide 1 — Problem

### Heading

> **Technicians already capture the diagnosis. The manual work starts afterward.**

Visual:

```text
Inspection
   ↓
Voice note
   ↓
part identification
   ↓
catalog search
   ↓
compatibility
   ↓
supplier pricing
   ↓
quote
```

Key message:

Field-service companies lose technician/office time converting messy inspection notes into accurate parts and customer estimates.

## Slide 2 — Product

### Heading

> **Exa turns field language into live parts intelligence.**

Visual:

```text
Inspection note
      ↓
Trade Pack
      ↓
Exa discovery
      ↓
Exact part
      ↓
Compatibility
      ↓
Exa product search
      ↓
Current suppliers
      ↓
Quote
```

## Slide 3 — Enterprise Scale

### Heading

> **One retrieval engine. Every field-service trade.**

Visual:

```text
Plumbing
HVAC
Electrical
     ↓
FieldQuote
     ↓
Exa
     ↓
Public product web
+
customer supplier network
+
ERP / contract pricing
```

Message:

> Public retailers make the demo easy to verify. Enterprise deployments configure the same engine around approved suppliers, local distributors, negotiated pricing, inventory, and procurement rules.

---

# 40. Why This Fits the FDE Assessment

## Real market

Field Service / MRO.

## Enterprise customer

Commercial service companies and multi-trade maintenance organizations.

## Clear end user

Field technician / estimator.

## Concrete problem

Turn unstructured field diagnosis into exact, compatible replacement parts and a customer-ready quote.

## Real external content

- manufacturer product pages
- retailer listings
- supplier pages
- current price
- images
- compatibility evidence
- product descriptions
- supersession data

## Exa is central

Exa handles:

1. semantic product discovery
2. targeted product retrieval
3. inline live content
4. current pricing evidence
5. source-backed validation

## Fits the user's actual workflow

```text
Inspect → Record → Find → Verify → Quote
```

---

# 41. Technical Stack

Recommended:

```text
Frontend
Next.js
TypeScript
React

Streaming
Server-Sent Events

Transcription
LiveKit / existing transcription path

LLM
Job parsing
candidate extraction
compatibility synthesis

Search
Exa API

Business Logic
TypeScript / backend application code

Optional persistence
Postgres
```

Postgres is optional for the demo unless job history/configuration is required.

---

# 42. Build Order

## Phase 1 — Static UX

- Exa | FSM navbar
- hero
- three pixel trade avatars
- Plumbing workflow
- pre-filled note
- static analysis state
- static quote

Goal: finalize visual flow first.

## Phase 2 — Job Parser

- parse technician note
- output equipment
- issues
- parts intent
- labor

## Phase 3 — Exa Product Discovery

- vague intent → broad search
- candidate product extraction
- source trace

## Phase 4 — Compatibility Verification

- candidate + equipment
- Exa search
- evidence
- compatibility state

## Phase 5 — Exa Product Search

- `category=product`
- Home Depot
- Lowe's
- Amazon
- price
- source
- image if useful
- dedupe

## Phase 6 — Quote

- selection
- markup
- labor
- deterministic total

## Phase 7 — SSE Streaming

Show:

```text
Parsing
Searching
Candidate found
Verifying
Supplier search
Quote ready
```

## Phase 8 — Audio

Only after the core demo is stable.

Add:

- upload audio
- live microphone

Both feed the same transcript route.

---

# 43. Demo Reliability Rules

1. Default to a pre-filled note.
2. Have one known-good plumbing case.
3. Cache a fallback response only for catastrophic live-search failure.
4. Do not make microphone input mandatory.
5. Do not depend on TTS.
6. Do not depend on checkout/purchase.
7. Never let an LLM do quote arithmetic.
8. Never automatically call the cheapest product the best product.
9. Keep source links visible.
10. Keep Exa retrieval activity visible.

---

# 44. Final Pitch

> **FieldQuote is an Exa-powered parts-intelligence layer for field-service businesses. Technicians already record what they found during an inspection. Instead of replaying that note later, manually identifying replacement parts, searching supplier sites, checking compatibility, and copying prices into an estimate, FieldQuote resolves the technician's field language against the live product web. Exa discovers the exact part, verifies it against current product evidence, retrieves current supplier listings, and turns that information into a quote-ready workflow.**
>
> **The same engine supports plumbing, HVAC, electrical, and other field-service trades through configurable trade packs. Public retailers make the demo easy to verify; enterprise deployments can incorporate the customer's approved wholesalers, local suppliers, contract pricing, ERP inventory, and procurement rules.**

---

# 45. One-Line Version

> **FieldQuote turns technician inspection notes into verified replacement parts, live supplier options, and quote-ready line items using Exa.**
