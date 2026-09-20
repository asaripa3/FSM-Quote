"use client";
import { useEffect, useRef, useState } from "react";
import { buildQuote, money, type TradePack } from "@/lib/trades";
import type { QuoteExclusion, QuoteLine, WorkPerformed } from "@/lib/quote-pdf";

export function ReceiptPrinter({ pack, lines, quote, onClose, company = "", exclusions = [], work = null }: { pack: TradePack; lines: QuoteLine[]; quote: ReturnType<typeof buildQuote>; onClose: () => void; company?: string; exclusions?: QuoteExclusion[]; work?: WorkPerformed | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [printKey, setPrintKey] = useState(0);
  const [printing, setPrinting] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = oldOverflow; previousFocus?.focus(); };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setPrinting(false), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2200);
    return () => clearTimeout(timer);
  }, [printKey]);
  const download = async () => {
    setDownloading(true); setError("");
    try { const { downloadQuotePdf } = await import("@/lib/quote-pdf"); await downloadQuotePdf(pack, lines, quote, company, exclusions, work); }
    catch { setError("The PDF could not be created. Please try again."); }
    finally { setDownloading(false); }
  };
  return <dialog ref={dialogRef} className="receipt-dialog" aria-labelledby="receipt-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="receipt-modal-content"><div className="receipt-heading"><div><span className="micro-label">THE DELIVERABLE</span><h2 id="receipt-title">Your quote, on paper.</h2></div><button className="receipt-close" onClick={onClose} aria-label="Close quote" autoFocus>×</button></div>
      <div className="printer"><div className="printer-top"><span className={`printer-light ${printing ? "is-printing" : ""}`} /><span role="status">{printing ? "PRINTING YOUR QUOTE..." : "QUOTE READY."}</span><span className="printer-model">FQ–01</span></div><div className="printer-slot" /></div>
      <div className="receipt-output" key={printKey}><article className="receipt-paper"><div className="receipt-brand">{company || "FSMpedia"}<span>✳</span></div><p className="receipt-subtitle">FROM FIELD OBSERVATION TO SOURCED REPAIR</p><div className="receipt-rule" /><p className="receipt-kicker">{pack.name.toUpperCase()} / ESTIMATE</p><h3>{pack.demo.customer}</h3><p className="receipt-site">{pack.demo.site}</p><div className="receipt-rule" /><div className="receipt-columns"><span>ITEM / QUANTITY</span><span>USD</span></div>{!lines.length && work && <div className="receipt-item"><div><strong>LABOR ONLY</strong><strong>{money(quote.labor)}</strong></div><p>{work.component}</p>{work.findings && <small>Confirmed on site: {work.findings}</small>}<small>No replacement part required.</small></div>}{lines.map(l => <div className="receipt-item" key={l.part.id}><div><strong>{l.part.discovery.sku}</strong><strong>{money(l.listing.price * l.qty)}</strong></div><p>{l.part.discovery.name}</p><small>{l.qty} × {money(l.listing.price)} · {l.listing.supplier}</small></div>)}<div className="receipt-rule" /><dl className="receipt-totals"><div><dt>Parts</dt><dd>{money(quote.partsSubtotal)}</dd></div><div><dt>Markup ({pack.config.markupPercent}%)</dt><dd>{money(quote.markup)}</dd></div><div><dt>Labor ({pack.demo.laborHours} hr × {money(pack.config.laborRate)})</dt><dd>{money(quote.labor)}</dd></div><div className="receipt-grand"><dt>TOTAL</dt><dd>{money(quote.total)}</dd></div></dl>{exclusions.length > 0 && <div className="receipt-excluded"><p className="receipt-excluded-title">NOT INCLUDED</p>{exclusions.map(e => <div key={e.label}><strong>{e.label}</strong><small>{e.reason}</small></div>)}</div>}<p className="receipt-thanks">PREPARED FOR YOUR APPROVAL.</p><div className="receipt-barcode" aria-hidden /><p className="receipt-id">FQ / {pack.id.toUpperCase()} / ESTIMATE</p><p className="receipt-disclaimer">Estimate · work not yet carried out<br />Tax and shipping not included.</p></article></div>
      <div className="receipt-actions"><button onClick={() => { setPrinting(true); setPrintKey(k => k + 1); }} disabled={printing} className="reprint-button">↻ Print again</button><button onClick={download} disabled={downloading} className="primary-button">{downloading ? "Preparing PDF…" : "Download PDF"}<span>↓</span></button></div>{error && <p role="alert" className="pdf-error">{error}</p>}<p className="receipt-endnote">Parts and evidence researched externally. Labour and markup are your own rates.</p>

    </div>
  </dialog>;
}
