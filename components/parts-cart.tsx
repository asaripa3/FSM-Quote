"use client";
import { useState } from "react";
import { money } from "@/lib/trades";
import type { Discovery, PickedSource, ResolvedPart, SourceOption } from "@/lib/job";

export type SearchState = { loading: boolean; sources: SourceOption[]; error: string; query: string };

/** Supplier product shot. Arbitrary third-party hosts, so it loads direct instead of through the Next optimizer. */
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="cart-thumb empty" aria-hidden />;
  // A page banner or carousel slide that slipped past the server filter gives itself away by its shape.
  const rejectBanners = (img: HTMLImageElement) => { const { naturalWidth: w, naturalHeight: h } = img; if (w && h && (w / h > 2.5 || h / w > 2.5)) setFailed(true); };
  return (
    <span className="cart-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onLoad={e => rejectBanners(e.currentTarget)} onError={() => setFailed(true)} />
    </span>
  );
}

function Offer({ source, part, picked, quantity, onPick, onQuantity }: {
  source: SourceOption; part: ResolvedPart; picked: boolean; quantity: number;
  onPick: (pick: PickedSource | null) => void; onQuantity: (value: number) => void;
}) {
  // The page price is carried into the estimate so ticking a row behaves like a cart. Where the pack size
  // is unknown or greater than one it may be a pack price, which the row says plainly and the estimator
  // confirms line by line before anything can be printed.
  const startingPrice = source.price ?? 0;
  return (
    <tr className={picked ? "cart-row picked" : "cart-row"}>
      <td className="cart-pick">
        <input type="checkbox" checked={picked} aria-label={`Quote ${source.title} from ${source.domain}`}
          onChange={e => onPick(e.target.checked ? { source, price: startingPrice, confirmed: false } : null)} />
      </td>
      <td><Thumb src={source.image} /></td>
      <td className="cart-product">
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>
        <span className="cart-supplier">{source.domain}{source.sku ? ` · SKU ${source.sku}` : ""}</span>
        <span className="cart-note">{source.priceEvidence}</span>
        {source.identityEvidence && <span className="cart-note">Page identifies: {source.identityEvidence}</span>}
      </td>
      <td className="cart-price">
        {source.price !== null ? <strong>{money(source.price)}</strong> : <span className="cart-unpriced">Confirm on page</span>}
        {source.price !== null && (source.packQuantity === null || source.packQuantity === undefined) && <span className="cart-pack warn">pack size unknown</span>}
        {source.packQuantity && source.packQuantity > 1 && <span className="cart-pack warn">pack of {source.packQuantity} — set unit cost</span>}
        {source.currencyAssumed && <span className="cart-pack">$ read as USD</span>}
        {source.priceStatus === "cached-page" && <span className="cart-pack">cached copy</span>}
      </td>
      <td className="cart-qty">
        <input type="number" min="1" max="999" step="1" value={quantity} disabled={!picked}
          aria-label={`Quantity of ${part.name}`}
          onChange={e => onQuantity(Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))))} />
      </td>
    </tr>
  );
}

export function PartsCart({ discovery, searches, picks, quantities, onPick, onQuantity, onRemove, faultLabel }: {
  discovery: Discovery;
  searches: Record<string, SearchState>;
  picks: Record<string, PickedSource>;
  quantities: Record<string, number>;
  onPick: (partId: string, pick: PickedSource | null) => void;
  onQuantity: (partId: string, value: number) => void;
  onRemove: (partId: string) => void;
  faultLabel: (faultId: string) => string;
}) {
  return (
    <div className="cart">
      {discovery.parts.map((part, index) => {
        const search = searches[part.id];
        const picked = picks[part.id];
        return (
          <section className="cart-group" key={part.id}>
            <header>
              <div>
                <span className="cart-index">ITEM {String(index + 1).padStart(2, "0")}</span>
                <h3>{part.name}</h3>
                <p className="cart-ids">{[part.manufacturer, part.partNumber && `Part ${part.partNumber}`, part.sku && `SKU ${part.sku}`].filter(Boolean).join(" · ")}</p>
              </div>
              <button className="text-button" onClick={() => onRemove(part.id)} disabled={search?.loading}>Remove</button>
            </header>
            {part.partIds.length > 1 && (
              <p className="cart-covers">One kit covers {part.partIds.length} of the reported faults: {part.partIds.map(faultLabel).filter(Boolean).join("; ")}</p>
            )}
            <details className="cart-why">
              <summary>Why this part <span className="exa-tag">EXA</span></summary>
              <p>{part.reason}</p>
              <blockquote>{part.evidence}</blockquote>
              <p className="cart-sources">
                {(part.supporting.length ? part.supporting : [{ url: part.sourceUrl, label: part.sourceLabel }]).map((s, i) => (
                  <span key={s.url}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a></span>
                ))}
              </p>
              {part.skuNote && <p className={`sku-note ${part.skuStatus}`}>{part.skuNote}</p>}
            </details>

            {search?.loading && <p className="search-status" role="status"><span className="pulse-dot" />Pricing this part across your suppliers with Exa…</p>}
            {search?.error && <p className="form-error" role="alert">{search.error}</p>}
            {search && !search.loading && !search.error && search.sources.length === 0 && (
              <p className="empty-message">No supplier pages found. Widen your allowed suppliers in settings.</p>
            )}
            {!!search?.sources.length && (
              <table className="cart-table">
                <thead>
                  <tr><th scope="col"><span className="sr-only">Quote</span></th><th scope="col"><span className="sr-only">Image</span></th><th scope="col">Supplier listing</th><th scope="col">Unit price</th><th scope="col">Qty</th></tr>
                </thead>
                <tbody>
                  {search.sources.map(source => (
                    <Offer key={source.url} source={source} part={part}
                      picked={picked?.source.url === source.url}
                      quantity={quantities[part.id] ?? 1}
                      onPick={pick => onPick(part.id, pick)}
                      onQuantity={value => onQuantity(part.id, value)} />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
