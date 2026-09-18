/**
 * Staged run of the FieldQuote pipeline.
 *
 * Emits exactly the event vocabulary from the plan (§28) that
 * `POST /api/quote-stream` will emit over SSE. The UI subscribes to these
 * events only — so wiring real Exa means replacing this emitter with an
 * EventSource and changing nothing in the components.
 */
import type { Listing, Part, TradePack } from "./trades";

export type RunEvent =
  | { type: "job_parsed" }
  | { type: "part_discovery_started"; partId: string; query: string }
  | { type: "superseded_detected"; partId: string }
  | { type: "search_source"; partId: string; domain: string }
  | { type: "candidate_found"; partId: string }
  | { type: "compat_started"; partId: string }
  | { type: "candidate_verified"; partId: string }
  | { type: "product_search_started"; partId: string; query: string }
  | { type: "supplier_found"; partId: string; listing: Listing }
  | { type: "part_completed"; partId: string }
  | { type: "quote_ready" };

/** Domains that visibly scroll past during the discovery phase. */
const DISCOVERY_SOURCES = [
  "sloan.com",
  "homedepot.com",
  "supplyhouse.com",
  "ferguson.com",
  "grainger.com",
  "amazon.com",
  "lowes.com",
  "partstown.com",
];

export function runPipeline(
  pack: TradePack,
  emit: (e: RunEvent) => void,
  speed = 1,
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let t = 0;

  const at = (ms: number, fn: () => void) => {
    t += ms * speed;
    timers.push(setTimeout(fn, t));
  };

  at(620, () => emit({ type: "job_parsed" }));

  pack.demo.parts.forEach((part: Part) => {
    at(420, () =>
      emit({
        type: "part_discovery_started",
        partId: part.id,
        query: part.superseded ? part.superseded.query : part.discoveryQuery,
      }),
    );

    if (part.superseded) {
      at(760, () => emit({ type: "superseded_detected", partId: part.id }));
    }

    // sources streaming in as Exa reads the live web
    DISCOVERY_SOURCES.slice(0, 5).forEach((domain) => {
      at(190, () => emit({ type: "search_source", partId: part.id, domain }));
    });

    at(520, () => emit({ type: "candidate_found", partId: part.id }));
    at(360, () => emit({ type: "compat_started", partId: part.id }));
    at(900, () => emit({ type: "candidate_verified", partId: part.id }));
    at(320, () =>
      emit({ type: "product_search_started", partId: part.id, query: part.productQuery }),
    );

    part.listings.forEach((listing) => {
      at(430, () => emit({ type: "supplier_found", partId: part.id, listing }));
    });

    at(260, () => emit({ type: "part_completed", partId: part.id }));
  });

  at(420, () => emit({ type: "quote_ready" }));

  return () => timers.forEach(clearTimeout);
}

/* ---------------------------------------------------------------------- */
/* Per-part progress state derived from the event stream                   */

export type PartPhase =
  | "queued"
  | "discovering"
  | "candidate"
  | "verifying"
  | "verified"
  | "sourcing"
  | "done";

export type PartState = {
  phase: PartPhase;
  sources: string[];
  listings: Listing[];
  discoveryQuery?: string;
  productQuery?: string;
  /** True once the run has proven the cited part number is discontinued. */
  superseded: boolean;
};

export const initialPartState = (): PartState => ({
  phase: "queued",
  sources: [],
  listings: [],
  superseded: false,
});

export function reducePart(state: PartState, e: RunEvent): PartState {
  switch (e.type) {
    case "part_discovery_started":
      return { ...state, phase: "discovering", discoveryQuery: e.query };
    case "superseded_detected":
      return { ...state, superseded: true };
    case "search_source":
      return { ...state, sources: [...state.sources, e.domain] };
    case "candidate_found":
      return { ...state, phase: "candidate" };
    case "compat_started":
      return { ...state, phase: "verifying" };
    case "candidate_verified":
      return { ...state, phase: "verified" };
    case "product_search_started":
      return { ...state, phase: "sourcing", productQuery: e.query };
    case "supplier_found":
      return { ...state, listings: [...state.listings, e.listing] };
    case "part_completed":
      return { ...state, phase: "done" };
    default:
      return state;
  }
}
