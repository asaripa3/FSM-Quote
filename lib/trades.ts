/**
 * Trade Packs — one retrieval engine, configured per trade.
 *
 * Everything an Exa call needs (query shape, allowed domains, compatibility
 * schema) lives here alongside the staged demo payload. When the real Exa
 * integration lands, `parts[].discovery` / `parts[].listings` get replaced by
 * live results; the pack config above them stays exactly as-is.
 */

export type TradeId = "plumbing" | "hvac" | "electrical";

export type Listing = {
  supplier: string;
  domain: string;
  price: number;
  /** Badges are assigned by the ranker, never by an LLM. */
  badges: ("EXACT MATCH" | "LOWEST PRICE" | "PREFERRED SUPPLIER" | "PICKUP TODAY" | "OEM")[];
  match: "exact" | "compatible";
  stock: string;
  url: string;
};

export type Part = {
  id: string;
  /** What the technician described, before any SKU is known. */
  intent: string;
  /** Exa discovery query — shown verbatim in the retrieval panel. */
  discoveryQuery: string;
  discovery: {
    sku: string;
    name: string;
    manufacturer: string;
    /** Why this candidate was extracted from the discovery results. */
    reason: string;
    pagesScanned: number;
  };
  compatibility: {
    verified: boolean;
    statement: string;
    evidence: string;
    sourceLabel: string;
    sourceUrl: string;
  };
  productQuery: string;
  listings: Listing[];
  /**
   * Set when the note cites a part number that the manufacturer has since
   * discontinued. Resolving this is the clearest Exa-only capability: an ERP
   * knows what was bought three years ago, not what replaces it today.
   */
  superseded?: {
    from: string;
    to: string;
    query: string;
    evidence: string;
    sourceLabel: string;
    sourceUrl: string;
  };
};

export type TradePack = {
  id: TradeId;
  name: string;
  role: string;
  mascot: string;
  mascotAlt: string;
  /** Intrinsic pixel dimensions — the three sprites differ in aspect ratio. */
  mascotW: number;
  mascotH: number;
  /** Three-word capability stack shown on the landing card. */
  capabilities: [string, string, string];
  blurb: string;

  config: {
    trustedManufacturers: string[];
    allowedDomains: string[];
    compatibilityFields: string[];
    preferredSuppliers: string[];
    markupPercent: number;
    laborRate: number;
    /**
     * Hours this trade's shop books for an ordinary call, used until the estimator edits it.
     *
     * The estimate panel labels the field "Shop default hours, editable" and used to open at zero,
     * so it promised a default that did not exist and every uncertain job priced labour at $0.00
     * until somebody noticed. Never taken from the web: a duration is the contractor's own rule.
     */
    laborHours: number;
    /**
     * What this quote costs the business by hand today. These are ASSUMPTIONS,
     * surfaced and editable in the UI so a customer can re-run the value case
     * with their own numbers rather than being told ours.
     */
    baseline: {
      manualMinutesPerQuote: number;
      tabsOpened: number;
      catalogsChecked: number;
      quotesPerTechPerWeek: number;
      technicians: number;
      /** Blended loaded cost of whoever does the sourcing today, $/hr. */
      sourcingCostPerHour: number;
    };
  };

  demo: {
    customer: string;
    site: string;
    laborHours: number;
    parts: Part[];
  };
};

/**
 * Retailers every trade can buy from. Measured against Exa: these carry the product but often render the
 * price client-side, so each trade adds supply houses that publish prices in the page itself.
 */
const COMMON_SUPPLIERS = ["amazon.com", "homedepot.com", "lowes.com"];

export const TRADES: Record<TradeId, TradePack> = {
  /* ------------------------------------------------------------------ */
  plumbing: {
    id: "plumbing",
    name: "Plumbing",
    role: "Commercial fixtures & valves",
    mascot: "/assets/plumber-mascot.png",
    mascotAlt: "Pixel-art plumber holding a pipe wrench",
    mascotW: 638,
    mascotH: 926,
    capabilities: ["Fixtures", "Valves", "Repair kits"],
    blurb: "Flushometers, faucets, mixing valves and the repair kits that keep them in service.",
    config: {
      trustedManufacturers: ["Sloan", "Kohler", "Moen", "Zurn", "Chicago Faucets"],
      allowedDomains: [...COMMON_SUPPLIERS, "qualityplumbingsupply.com", "fwwebb.com", "supplyhouse.com"],
      compatibilityFields: ["manufacturer", "model", "part_number", "size", "flow_rate"],
      preferredSuppliers: ["Ferguson", "Local Plumbing Supply", "Grainger"],
      markupPercent: 30,
      laborRate: 150,
      laborHours: 0.75,
      baseline: {
        manualMinutesPerQuote: 22,
        tabsOpened: 8,
        catalogsChecked: 3,
        quotesPerTechPerWeek: 12,
        technicians: 40,
        sourcingCostPerHour: 45,
      },
    },
    demo: {
      customer: "Marriott Downtown",
      site: "Men's restroom — 2nd floor",
      laborHours: 0.75,
      parts: [
        {
          id: "p1",
          intent: "Royal water closet diaphragm + vacuum breaker",
          discoveryQuery: "Sloan Royal 111 1.6 gpf water closet worn diaphragm cracked vacuum breaker rebuild kit",
          discovery: {
            sku: "A-1101-A",
            name: "Royal Water Closet Diaphragm Performance Kit, 1.6 gpf (Sloan 3301070)",
            manufacturer: "Sloan",
            reason:
              "One kit answers both symptoms: the A-1101-A performance kit contains the dual-filtered diaphragm assembly AND the high-back-pressure vacuum breaker repair kit, so the cracked sleeve does not need a second line item",
            pagesScanned: 10,
          },
          compatibility: {
            verified: true,
            statement: "Fits Royal 111 — both faults covered",
            evidence:
              "Sloan rates the Royal 111 as a 1.6 gpf exposed water closet flushometer, and lists A-1101-A (3301070) as the 1.6 gpf Royal water closet performance kit. Its contents include the diaphragm assembly with relief valve and guide, a handle repair kit, a high back pressure vacuum breaker repair kit, and the tailpiece O-ring.",
            sourceLabel: "sloan.com — Royal 111 flushometer",
            sourceUrl: "https://www.sloan.com/products/flushometers/royal/royal-111",
          },
          productQuery: "Sloan A-1101-A 3301070 Royal water closet performance kit 1.6 gpf",
          listings: [
            { supplier: "Home Depot", domain: "homedepot.com", price: 89.97, badges: ["EXACT MATCH", "PICKUP TODAY"], match: "exact", stock: "In stock — 3 nearby stores", url: "https://www.homedepot.com/p/SLOAN-Royal-A-1101-A-3301070-1-6-GPF-Diaphragm-Performance-Rebuild-Kit-for-Low-Consumption-Water-Closets-3301070/206050637" },
            { supplier: "SupplyHouse", domain: "supplyhouse.com", price: 72.95, badges: ["LOWEST PRICE"], match: "exact", stock: "In stock — ships same day", url: "https://www.supplyhouse.com/Sloan-3301070-A-1101-A-Royal-Water-Closet-Diaphragm-Performance-Kit-1-6-GPF" },
            { supplier: "Ferguson", domain: "ferguson.com", price: 94.25, badges: ["PREFERRED SUPPLIER", "OEM"], match: "exact", stock: "In stock — branch pickup", url: "https://www.ferguson.com/product/sloan-valve-royal-a1101a-royal-16-gpf-perform-rebuild-kit-s3301070/_/R-854340" },
          ],
        },
        {
          id: "p2",
          intent: "Regal urinal diaphragm kit",
          discoveryQuery: "Sloan Regal urinal 1.0 gpf diaphragm weeping repair kit",
          discovery: {
            sku: "A-42-A",
            name: "Regal Urinal Repair Kit, 1.0 gpf (Sloan 3301044)",
            manufacturer: "Sloan",
            reason:
              "The Regal urinal drop-in kit at 1.0 gpf — note the Regal/urinal pairing, this kit does not fit the Royal water closet on the same wall",
            pagesScanned: 10,
          },
          compatibility: {
            verified: true,
            statement: "Fits Regal urinal, 1.0 gpf",
            evidence:
              "Sloan lists A-42-A (3301044) as the 1.0 gpf repair kit for Regal urinal flushometers, containing the diaphragm, molded disc, relief valve and guide assembly. It is a urinal kit — quoting it for the Royal water closet would be the wrong part.",
            sourceLabel: "sloan.com — Regal flushometer parts",
            sourceUrl: "https://www.sloan.com/products/part-groupings/regal-flushometer",
          },
          productQuery: "Sloan A-42-A 3301044 Regal urinal repair kit 1.0 gpf",
          listings: [
            { supplier: "Amazon", domain: "amazon.com", price: 38.99, badges: ["EXACT MATCH"], match: "exact", stock: "In stock — ships in 2 days", url: "https://www.amazon.com/Sloan-Regal-Urinal-Diaphragm-Assembly/dp/B0012QGXKW" },
            { supplier: "SupplyHouse", domain: "supplyhouse.com", price: 31.5, badges: ["LOWEST PRICE"], match: "exact", stock: "In stock — ships same day", url: "https://www.supplyhouse.com/Sloan-3301044-A-42-A-Repair-Kit-Urinal-1-0-GPF" },
            { supplier: "F.W. Webb", domain: "fwwebb.com", price: 34.8, badges: ["PREFERRED SUPPLIER"], match: "exact", stock: "In stock — branch pickup", url: "https://www.fwwebb.com/product/Sloan/A-42-A-Flushometer-Repair-Kit/3301044/87751" },
          ],
        },
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  hvac: {
    id: "hvac",
    name: "HVAC",
    role: "Cooling & control components",
    mascot: "/assets/hvac-mascot.png",
    mascotAlt: "Pixel-art HVAC technician holding a manifold gauge",
    mascotW: 568,
    mascotH: 1062,
    capabilities: ["Cooling", "Controls", "Components"],
    blurb: "Rooftop units, air handlers and the capacitors, contactors and motors inside them.",
    config: {
      trustedManufacturers: ["Carrier", "Trane", "Lennox", "Goodman", "York"],
      allowedDomains: [...COMMON_SUPPLIERS, "supplyhouse.com", "northamericahvac.com", "tophvacparts.com"],
      compatibilityFields: ["manufacturer", "model", "voltage", "microfarads", "horsepower", "refrigerant_type"],
      preferredSuppliers: ["Johnstone Supply", "Ferguson HVAC", "Grainger"],
      markupPercent: 30,
      laborRate: 165,
      laborHours: 1.0,
      baseline: {
        manualMinutesPerQuote: 26,
        tabsOpened: 9,
        catalogsChecked: 4,
        quotesPerTechPerWeek: 10,
        technicians: 55,
        sourcingCostPerHour: 48,
      },
    },
    demo: {
      customer: "Northside Medical Plaza",
      site: "Rooftop unit RTU-3",
      laborHours: 1.0,
      parts: [
        {
          id: "h1",
          intent: "Dual run capacitor, 45/5 µF, 440V",
          discoveryQuery: "Carrier rooftop condenser fan dual run capacitor 45/5 MFD 440V round replacement",
          discovery: {
            sku: "TRCFD455",
            name: "Titan Pro Dual Run Capacitor, 45+5 µF, 440/370V, Round",
            manufacturer: "Packard / Titan Pro",
            reason:
              "Matches the 45/5 µF at 440V stamped rating the technician read off the failed can, in the round case the unit uses",
            pagesScanned: 10,
          },
          compatibility: {
            verified: true,
            statement: "Matches 45/5 µF @ 440/370V",
            evidence:
              "Titan Pro TRCFD455 is a round dual motor-run capacitor rated 45+5 MFD at 440/370 VAC — the higher rating serves the compressor and the lower the condenser fan, a direct replacement for the failed can's stamped rating.",
            sourceLabel: "supplyhouse.com — TRCFD455 specification",
            sourceUrl: "https://www.supplyhouse.com/Titan-Pro-TRCFD455-45-5-MFD-Round-Dual-Motor-Run-Capacitor-440-370V",
          },
          productQuery: "Titan Pro TRCFD455 45/5 MFD 440V dual run capacitor",
          listings: [
            { supplier: "Home Depot", domain: "homedepot.com", price: 9.99, badges: ["EXACT MATCH", "LOWEST PRICE", "PICKUP TODAY"], match: "exact", stock: "In stock — 4 nearby stores", url: "https://www.homedepot.com/p/Packard-TITAN-PRO-45-Plus-5-MFD-440-370V-Dual-Voltage-Round-Run-Capacitor-TRCFD455/334530823" },
            { supplier: "SupplyHouse", domain: "supplyhouse.com", price: 11.49, badges: ["PREFERRED SUPPLIER"], match: "exact", stock: "In stock — ships same day", url: "https://www.supplyhouse.com/Titan-Pro-TRCFD455-45-5-MFD-Round-Dual-Motor-Run-Capacitor-440-370V" },
            { supplier: "Amazon", domain: "amazon.com", price: 13.95, badges: [], match: "exact", stock: "In stock — ships tomorrow", url: "https://www.amazon.com/TitanPro-TRCFD455-Round-Motor-Capacitor/dp/B07P5BTJKH" },
          ],
        },
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  electrical: {
    id: "electrical",
    name: "Electrical",
    role: "Panels, breakers & devices",
    mascot: "/assets/electrician-mascot.png",
    mascotAlt: "Pixel-art electrician holding a digital multimeter",
    mascotW: 486,
    mascotH: 1074,
    capabilities: ["Panels", "Breakers", "Devices"],
    blurb: "Load centers, breakers and disconnects — where series compatibility is the whole job.",
    config: {
      trustedManufacturers: ["Square D", "Eaton", "Siemens", "GE"],
      allowedDomains: [...COMMON_SUPPLIERS, "platt.com", "zoro.com", "gordonelectricsupply.com"],
      compatibilityFields: ["manufacturer", "series", "amperage", "poles", "voltage"],
      preferredSuppliers: ["Graybar", "Rexel", "Grainger"],
      markupPercent: 28,
      laborRate: 155,
      laborHours: 1.5,
      baseline: {
        manualMinutesPerQuote: 19,
        tabsOpened: 7,
        catalogsChecked: 3,
        quotesPerTechPerWeek: 11,
        technicians: 35,
        sourcingCostPerHour: 46,
      },
    },
    demo: {
      customer: "Harborview Office Park",
      site: "Suite 210 — main load center",
      laborHours: 1.5,
      parts: [
        {
          id: "e1",
          intent: "20A 2-pole breaker, QO series",
          discoveryQuery: "Square D QO panel 20 amp double pole circuit breaker compatible",
          discovery: {
            sku: "QO220CP",
            name: "QO 20 Amp 2-Pole Circuit Breaker",
            manufacturer: "Square D",
            reason: "QO-series plug-on breaker in the 20A two-pole configuration the panel requires",
            pagesScanned: 10,
          },
          compatibility: {
            verified: true,
            statement: "Fits Square D QO load centers",
            evidence:
              "Schneider Electric lists QO220CP as a QO plug-in miniature breaker, 20A, 2-pole, 120/240 VAC, 10kA — the 3/4 in. QO format that plugs into QO load centers and NQOD panelboards.",
            sourceLabel: "se.com — QO220CP product page",
            sourceUrl: "https://www.se.com/us/en/product/QO220CP/mini-circuit-breaker-qo-20a-2-pole-120-240vac-10ka-plug-in-consumer-pack/",
          },
          productQuery: "Square D QO220CP 20 amp 2 pole QO plug-on breaker",
          listings: [
            { supplier: "Home Depot", domain: "homedepot.com", price: 35.87, badges: ["EXACT MATCH", "OEM", "PICKUP TODAY"], match: "exact", stock: "In stock — 6 nearby stores", url: "https://www.homedepot.com/p/Square-D-QO-20-Amp-2-Pole-Circuit-Breaker-QO220CP-QO220CP/100032386" },
            { supplier: "Lowe's", domain: "lowes.com", price: 33.98, badges: ["LOWEST PRICE"], match: "exact", stock: "In stock — 2 nearby stores", url: "https://www.lowes.com/pd/Square-D-QO-20-Amp-2-Pole-Standard-Trip-Circuit-Breaker/1098947" },
            { supplier: "Cooper Electric", domain: "cooper-electric.com", price: 38.4, badges: ["PREFERRED SUPPLIER"], match: "exact", stock: "In stock — counter pickup", url: "https://www.cooper-electric.com/product/detail/1568130/square-d-schneider-qo220cp" },
          ],
        },
      ],
    },
  },
};

export const TRADE_LIST = [TRADES.plumbing, TRADES.hvac, TRADES.electrical];

export const isTradeId = (v: unknown): v is TradeId => typeof v === "string" && Object.hasOwn(TRADES, v);

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Deterministic quote math. Never delegated to a model: labour and markup are the contractor's
 * own rules, so nothing here may come from the web or from a generated number.
 */
export function buildQuote(
  unitPrices: number[],
  quantities: number[],
  markupPercent: number,
  laborHours: number,
  laborRate: number,
) {
  const partsSubtotal = unitPrices.reduce((sum, p, i) => sum + p * (quantities[i] ?? 1), 0);
  const markup = partsSubtotal * (markupPercent / 100);
  const labor = laborHours * laborRate;
  return {
    partsSubtotal: round2(partsSubtotal),
    markup: round2(markup),
    labor: round2(labor),
    total: round2(partsSubtotal + markup + labor),
  };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
