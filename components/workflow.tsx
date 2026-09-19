"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ReceiptPrinter } from "./receipt-printer";
import { AudioInput } from "./audio-input";
import { buildQuote, money, type TradePack, type Part } from "@/lib/trades";
import { validAmount, type JobSettings, type ParsedJob, type SourceOption, type PickedSource, type Discovery, type ResolvedPart, type ExaTrace } from "@/lib/job";
import type { QuoteLine } from "@/lib/quote-pdf";

type SearchState={loading:boolean;sources:SourceOption[];error:string;query:string};
export function Workflow({pack}:{pack:TradePack}) {
 const defaultDomains=pack.config.allowedDomains.join(", ");
 const defaults:JobSettings={company:"",laborRate:pack.config.laborRate,markupPercent:pack.config.markupPercent,supplierDomains:defaultDomains,region:"United States"};
 const [settings,setSettings]=useState(defaults),[showSettings,setShowSettings]=useState(false),[saved,setSaved]=useState(false);
 const [customer,setCustomer]=useState(""),[site,setSite]=useState(""),[note,setNote]=useState(""),[hours,setHours]=useState(0);
 const [mode,setMode]=useState<"note"|"audio"|"mic">("note"),[job,setJob]=useState<ParsedJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[quoteOpen,setQuoteOpen]=useState(false);
 const [searches,setSearches]=useState<Record<string,SearchState>>({}),[picks,setPicks]=useState<Record<string,PickedSource>>({});
 const [discovery,setDiscovery]=useState<Discovery|null>(null),[stage,setStage]=useState<""|"parsing"|"researching">("");
 const [showExa,setShowExa]=useState(true),[trace,setTrace]=useState<ExaTrace[]>([]);
 const requests=useRef<Set<AbortController>>(new Set());
 const settingsKey=`fieldquote-settings-v1-${pack.id}`;
 useEffect(()=>{const pending=requests.current;const timer=setTimeout(()=>{try{const raw=localStorage.getItem(settingsKey);if(raw){const value=JSON.parse(raw);if(validAmount(value.laborRate)&&validAmount(value.markupPercent,1000)&&typeof value.company==="string"&&typeof value.supplierDomains==="string"&&typeof value.region==="string")setSettings({...value,supplierDomains:value.supplierDomains.trim()||defaultDomains});}}catch{/* Storage is optional. */}},0);return()=>{clearTimeout(timer);pending.forEach(c=>c.abort());};},[settingsKey,defaultDomains]);
 const request=async(url:string,body:object)=>{const c=new AbortController();requests.current.add(c);try{const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:c.signal});const data=await res.json();if(!res.ok)throw new Error(data.error||"Request failed. Please retry.");return data;}finally{requests.current.delete(c);}};
 const analyze=async()=>{setError("");setBusy(true);setJob(null);setDiscovery(null);setPicks({});setSearches({});setTrace([]);try{setStage("parsing");const parsed:ParsedJob=await request("/api/parse",{trade:pack.id,note});setJob(parsed);if(parsed.laborHours!==null)setHours(parsed.laborHours);if(parsed.parts.length){setStage("researching");const found:Discovery=await request("/api/discover",{trade:pack.id,parts:parsed.parts.map(p=>({id:p.id,description:p.description,equipment:p.equipment,sku:p.sku}))});setDiscovery(found);setTrace(found.trace||[]);}}catch(e){setError(e instanceof Error?e.message:"Could not analyze the note.");}finally{setBusy(false);setStage("");}};
 const research=async(current:ParsedJob)=>{setError("");setBusy(true);setStage("researching");setPicks({});setSearches({});try{const found:Discovery=await request("/api/discover",{trade:pack.id,parts:current.parts.map(p=>({id:p.id,description:p.description,equipment:p.equipment,sku:p.sku}))});setDiscovery(found);setTrace(found.trace||[]);}catch(e){setError(e instanceof Error?e.message:"Could not research the parts.");}finally{setBusy(false);setStage("");}};
 const findSources=async(resolved:ResolvedPart)=>{const key=resolved.id,query=resolved.searchQuery;setSearches(s=>({...s,[key]:{loading:true,sources:[],error:"",query}}));setPicks(prev=>{const next={...prev};delete next[key];return next;});try{const data=await request("/api/source",{query,partNumber:resolved.partNumber,sku:resolved.sku,domains:settings.supplierDomains,region:settings.region});setSearches(s=>({...s,[key]:{loading:false,sources:data.sources,error:"",query:data.query}}));setTrace(t=>[...t,...(data.trace||[])]);}catch(e){setSearches(s=>({...s,[key]:{loading:false,sources:[],error:e instanceof Error?e.message:"Search failed.",query}}));}};
 const dropResolved=(id:string)=>{setDiscovery(d=>d?{...d,parts:d.parts.filter(r=>r.id!==id)}:d);setPicks(s=>{const next={...s};delete next[id];return next;});setSearches(s=>{const next={...s};delete next[id];return next;});};
 const lines:QuoteLine[]=useMemo(()=>discovery?.parts.flatMap(r=>{const pick=picks[r.id];if(!pick)return[];const qty=Math.max(1,...r.partIds.map(id=>job?.parts.find(p=>p.id===id)?.quantity??1));const part:Part={id:r.id,intent:r.name,discoveryQuery:r.searchQuery,discovery:{sku:r.sku||r.partNumber,name:r.name,manufacturer:r.manufacturer,reason:r.reason,pagesScanned:discovery.pagesScanned},compatibility:{verified:r.verified,statement:r.reason,evidence:r.evidence,sourceLabel:r.sourceLabel,sourceUrl:r.sourceUrl},productQuery:r.searchQuery,listings:[]};return[{part,listing:{supplier:pick.source.supplier,domain:pick.source.domain,url:pick.source.url,price:pick.price,badges:[],match:"compatible" as const,stock:pick.source.availability},qty}];})||[],[discovery,picks,job]);
 const quote=buildQuote(lines.map(l=>l.listing.price),lines.map(l=>l.qty),settings.markupPercent,hours,settings.laborRate);
 const allConfirmed=!!discovery&&discovery.parts.length>0&&discovery.parts.every(r=>picks[r.id]?.confirmed&&picks[r.id]?.price>0&&validAmount(picks[r.id]?.price));
 const canPrint=allConfirmed&&customer.trim().length>0&&validAmount(hours,1000)&&validAmount(settings.laborRate)&&validAmount(settings.markupPercent,1000);
 const quotePack:TradePack={...pack,config:{...pack.config,laborRate:settings.laborRate,markupPercent:settings.markupPercent},demo:{...pack.demo,customer,site,note,laborHours:hours,parts:lines.map(l=>l.part)}};
 const inSearch=Object.values(searches).some(s=>s.loading);
 const appendTranscript=(text:string)=>setNote(n=>n?`${n.trim()} ${text.trim()}`:text.trim());
 return <div className="workshop"><div className="page-width">
  <div className="job-heading"><Image src={pack.mascot} alt="" width={pack.mascotW} height={pack.mascotH} unoptimized /><div><p className="eyebrow">{pack.name.toUpperCase()} WORKSPACE</p><h1>A new job. A clear estimate.</h1><p>Bring your field note. We’ll help with the rest.</p></div><div className="heading-controls"><ToggleControl label="Exa" enabled={showExa} onToggle={()=>setShowExa(v=>!v)}/><button className="secondary-button" onClick={()=>setShowSettings(true)}>⚙ Rates & suppliers</button></div></div>
  {saved&&<p className="saved-message" role="status">Your {pack.name.toLowerCase()} rates and supplier preferences are saved on this device.</p>}
  <div className="job-layout"><div className="job-main">
   <section className="job-card"><header><div><span className="section-number">01</span><h2>The job details</h2></div><span>Start here</span></header><div className="job-card-body"><div className="job-fields"><label>Customer / business<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Who is the estimate for?" maxLength={120}/></label><label>Site / job location<input value={site} onChange={e=>setSite(e.target.value)} placeholder="Address, building or work order" maxLength={180}/></label></div>
    <div className="input-tabs" role="group" aria-label="Input method">{([["note","Type a note"],["audio","Upload audio"],["mic","Use microphone"]] as const).map(([id,label])=><button key={id} aria-pressed={mode===id} className={mode===id?"active":""} onClick={()=>setMode(id)}>{label}</button>)}</div>
    {mode!=="note"&&!busy&&!job&&<AudioInput key={mode} mode={mode} onTranscript={appendTranscript}/>}
    <label className="note-label">{mode==="note"?"Inspection note":"Transcript — review and edit"}<textarea value={note} onChange={e=>setNote(e.target.value)} disabled={busy||!!job} rows={5} maxLength={12000} placeholder="What equipment did you inspect? What needs replacing? Include model numbers, quantities and labor time if you have them."/></label>
    <div className="note-actions"><button className="text-button" disabled={busy} onClick={()=>{setNote(pack.demo.note);setJob(null);setSearches({});setPicks({});}}>Use an example note</button>{job?<button className="secondary-button" disabled={inSearch} onClick={()=>{setJob(null);setSearches({});setPicks({});}}>Edit note & start again</button>:<button className="primary-button" disabled={busy||note.trim().length<12} onClick={analyze}>{busy?"Reading your note…":"Review the job"}<span>→</span></button>}</div>{error&&<p className="form-error" role="alert">{error}</p>}</div></section>
   {job?<section className="job-card"><header><div><span className="section-number">02</span><h2>What actually fixes this</h2></div><span>{discovery?`${discovery.pagesScanned} pages read`:""}</span></header><div className="job-card-body"><p className="job-summary">{job.summary}</p>{!discovery&&job.questions.length>0&&<div className="review-questions"><strong>Check before ordering</strong><ul>{job.questions.map(q=><li key={q}>{q}</li>)}</ul></div>}
   {stage==="researching"&&<p className="search-status" role="status"><span className="pulse-dot"/>Reading manufacturer and distributor pages with Exa to find the part that fixes this…</p>}
   {discovery&&!busy&&<div className={showExa?"exa-on":"exa-off"}>
    {showExa?<p className="section-help">Each part below was identified from the pages Exa retrieved, not from the note alone. Open a source to check the fit yourself before you order.</p>
     :<p className="section-help">Exa is off. This is everything the note alone gives you — the technician&apos;s words, no part number, no supplier, no price. Turn Exa back on to resolve these into orderable parts.</p>}
    {!showExa&&<NoteOnlyView parts={job.parts}/>}
    {showExa&&<>
    {discovery.parts.some(r=>r.partIds.length>1&&r.verified)&&<p className="consolidated-note">{job.parts.length} reported faults resolved into {discovery.parts.length} {discovery.parts.length===1?"part":"parts"} — a kit below already contains what a second line item would have duplicated.</p>}
    {discovery.parts.length===0&&<p className="empty-message">No part could be confirmed from the retrieved pages. Add the model designation from the equipment plate and try again.</p>}
    {discovery.parts.map((resolved,index)=><div className="requirement" key={resolved.id}>
     <div className="requirement-top"><span>PART {String(index+1).padStart(2,"0")}</span><span className="exa-tag">EXA</span>{resolved.verified?<span className="evidence-badge">EXCERPT FOUND</span>:<span className="evidence-badge unproven">QUOTE NOT FOUND ON PAGE</span>}<button className="text-button" onClick={()=>dropResolved(resolved.id)} disabled={searches[resolved.id]?.loading}>Remove</button></div>
     <h3 className="resolved-name">{resolved.name}</h3>
     <p className="resolved-ids exa-trace">{[resolved.manufacturer,resolved.partNumber&&`Part ${resolved.partNumber}`,resolved.sku&&`SKU ${resolved.sku}`].filter(Boolean).join(" · ")}</p>
     {resolved.partIds.length>1&&<p className="covers-note">Covers {resolved.partIds.length} of the reported faults: {resolved.partIds.map(id=>job.parts.find(p=>p.id===id)?.description).filter(Boolean).join("; ")}</p>}
     <p className="resolved-reason exa-trace">{resolved.reason}</p>
     {resolved.skuNote&&<p className={`sku-note ${resolved.skuStatus}`}>{resolved.skuStatus==="superseded"?"SUPERSEDED — ":resolved.skuStatus==="variant"?"PACKAGING VARIANT — ":""}{resolved.skuNote}</p>}
     <blockquote className="resolved-evidence exa-trace">{resolved.evidence}</blockquote>
     <p className="resolved-sources exa-trace">{resolved.supporting.length?resolved.supporting.map((src,i)=><span key={src.url}>{i>0&&" · "}<a href={src.url} target="_blank" rel="noopener noreferrer">{src.label} ↗</a></span>):<a href={resolved.sourceUrl} target="_blank" rel="noopener noreferrer">{resolved.sourceLabel} ↗</a>}</p>
     <div className="search-action"><span>Searching suppliers for: {resolved.searchQuery}</span><button className="secondary-button" onClick={()=>findSources(resolved)} disabled={searches[resolved.id]?.loading}>{searches[resolved.id]?.loading?"Searching with Exa…":searches[resolved.id]?"Refresh prices ↻":"Find supplier prices ↗"}</button></div>
     {searches[resolved.id]?.loading&&<p className="search-status" role="status"><span className="pulse-dot"/>Retrieving product pages and price evidence from Exa…</p>}
     {searches[resolved.id]?.error&&<p className="form-error" role="alert">{searches[resolved.id].error}</p>}
     {searches[resolved.id]&&!searches[resolved.id].loading&&!searches[resolved.id].error&&searches[resolved.id].sources.length===0&&<p className="empty-message">No usable supplier pages found. Try widening your allowed suppliers in settings.</p>}
     {searches[resolved.id]?.sources.map(source=><article className={`source-option ${picks[resolved.id]?.source.url===source.url?"picked":""}`} key={source.url}><SourceThumb src={source.image}/><div className="source-top"><span>{source.domain}</span><strong>{source.price!==null?money(source.price):"Price needs confirmation"}</strong></div><a href={source.url} target="_blank" rel="noopener noreferrer" className="source-title">{source.title} ↗</a><p className="price-evidence">{source.priceEvidence}{source.currencyAssumed&&<span className="cached-flag"> · page shows $ without a currency code; read as USD for a United States search</span>}{source.priceStatus==="cached-page"&&<span className="cached-flag"> · from Exa’s cached copy of this page, not a live fetch — confirm before ordering</span>}</p><p className="price-evidence">{source.packQuantity ? `Sold as ${source.packQuantity===1?"one unit":`a pack of ${source.packQuantity}`}. ${source.packQuantity>1?"Enter the unit cost you intend to quote.":""}` : "Package size unknown — confirm units and enter the unit cost before quoting."}</p><div className="source-meta"><span>{source.sku?`SKU ${source.sku} · `:""}Retrieved {new Date(source.retrievedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span><button className="secondary-button" onClick={()=>setPicks(s=>({...s,[resolved.id]:{source,price:source.packQuantity===1 ? source.price||0 : 0,confirmed:false}}))}>{picks[resolved.id]?.source.url===source.url?"Selected ✓":"Use this source"}</button></div></article>)}
    </div>)}
    {discovery.unresolved.length>0&&<div className="unresolved-block"><strong>Not confirmed from the retrieved pages</strong><ul>{discovery.unresolved.map(u=><li key={u.partId}><em>{job.parts.find(p=>p.id===u.partId)?.description||u.partId}</em> — {u.reason}</li>)}</ul></div>}
    <button className="text-button add-part" onClick={()=>research(job)} disabled={busy}>↻ Research these parts again</button>
    </>}
    <ExaLegend/>
   </div>}</div></section>:<div className="workshop-empty"><Image src={pack.mascot} alt="" width={pack.mascotW} height={pack.mascotH} unoptimized/><div><h3>No after-hours replay session.</h3><p>Your note becomes an editable parts list. You check the sources and set the price.</p></div></div>}
  </div><aside className="estimate-panel"><header><span className="micro-label">YOUR ESTIMATE</span><span>▤</span></header><div className="estimate-body"><h2>{customer||"Your customer"}</h2><p>{site||"Add the job location"}</p><div className="estimate-lines">{!lines.length?<p className="empty-message">Your selected parts will appear here.</p>:lines.map(line=>{const pick=picks[line.part.id];return <div className="estimate-line" key={line.part.id}><strong>{line.part.discovery.name}</strong><a href={pick.source.url} target="_blank" rel="noopener noreferrer">{pick.source.domain} ↗</a><label>Unit cost (USD)<input aria-label={`Unit cost for ${line.part.discovery.name}`} type="number" min="0" max="100000" step=".01" value={pick.price} onChange={e=>setPicks(s=>({...s,[line.part.id]:{...s[line.part.id],price:Number(e.target.value),confirmed:false}}))}/></label><div className="line-extension"><span>{line.qty} × {money(pick.price)}</span><strong>{money(line.qty*pick.price)}</strong></div>{pick.price!==pick.source.price&&<small>Manually entered price — confirm against source.</small>}<label className="confirm-source"><input type="checkbox" checked={pick.confirmed} onChange={e=>setPicks(s=>({...s,[line.part.id]:{...s[line.part.id],confirmed:e.target.checked}}))}/><span>I checked fit, pack quantity, and price.</span></label></div>;})}</div>
   <div className="pricing-inputs"><label>Labor hours<input type="number" min="0" max="1000" step=".25" value={hours} onChange={e=>setHours(Number(e.target.value))}/></label><label>Hourly rate ($)<input type="number" min="0" max="100000" step=".01" value={settings.laborRate} onChange={e=>setSettings(s=>({...s,laborRate:Number(e.target.value)}))}/></label><label>Parts markup (%)<input type="number" min="0" max="1000" step=".1" value={settings.markupPercent} onChange={e=>setSettings(s=>({...s,markupPercent:Number(e.target.value)}))}/></label></div><dl className="estimate-totals"><div><dt>Parts</dt><dd>{money(quote.partsSubtotal)}</dd></div><div><dt>Parts markup</dt><dd>{money(quote.markup)}</dd></div><div><dt>Labor</dt><dd>{money(quote.labor)}</dd></div><div className="estimate-grand"><dt>Estimated total</dt><dd>{money(quote.total)}</dd></div></dl><button className="primary-button" disabled={!canPrint} onClick={()=>setQuoteOpen(true)}>Print estimate <span>↗</span></button><p className="estimate-hint">{!customer.trim()?"Add a customer name to create your estimate.":!allConfirmed?"Select and confirm each part before printing.":"Ready to review and download as PDF."}</p>{trace.length>0&&showExa&&<ExaRunTrace trace={trace}/>}<p className="estimate-footnote">Tax and shipping excluded. Check the supplier page before ordering. Markup applies to parts only.</p></div></aside></div></div>
 {showSettings&&<SettingsDialog initial={settings} trade={pack.name} onClose={()=>setShowSettings(false)} onSave={value=>{setSettings(value);setShowSettings(false);try{localStorage.setItem(settingsKey,JSON.stringify(value));setSaved(true);}catch{setError("Settings apply to this job, but browser storage is unavailable.");}}}/>}
 {quoteOpen&&<ReceiptPrinter pack={quotePack} lines={lines} quote={quote} company={settings.company} onClose={()=>setQuoteOpen(false)}/>}
 </div>;
}

function ToggleControl({label,enabled,onToggle}:{label:string;enabled:boolean;onToggle:()=>void}) {
 return <button type="button" role="switch" aria-checked={enabled} className={`exa-toggle ${enabled?"on":""}`} onClick={onToggle}><span className="exa-toggle-label">{label}</span><span className="exa-toggle-track"><span className="exa-toggle-knob"/></span></button>;
}

/** What the parsed note gives you on its own, with every Exa contribution withheld. */
function NoteOnlyView({parts}:{parts:{id:string;description:string;quantity:number;sku:string;equipment:string}[]}) {
 if (!parts.length) return <p className="empty-message">The note did not name any replacement parts.</p>;
 return <div className="note-only">{parts.map((part,index)=><div className="note-only-row" key={part.id}>
  <span className="note-only-index">FAULT {String(index+1).padStart(2,"0")}</span>
  <div><strong>{part.description}</strong><p>{part.equipment||"Equipment not stated"} · qty {part.quantity} · {part.sku?`work-order number ${part.sku}`:"no part number"}</p></div>
  <span className="note-only-gap">no supplier · no price</span>
 </div>)}</div>;
}

function ExaLegend() {
 return <div className="exa-legend"><span className="exa-legend-title">Legend</span>
  <span><i className="swatch note"/>From the technician&apos;s note</span>
  <span><i className="swatch exa"/>Retrieved with Exa · fit needs your review</span>
  <span><i className="swatch unproven"/>Quote not found on the page</span>
 </div>;
}

/** What was actually asked of Exa during this run. */
function ExaRunTrace({trace}:{trace:ExaTrace[]}) {
 const cost=trace.reduce((sum,t)=>sum+(t.costDollars??0),0),ms=trace.reduce((sum,t)=>sum+t.ms,0),pages=trace.reduce((sum,t)=>sum+t.results,0);
 return <div className="exa-run-trace"><header><span className="exa-tag">EXA</span><span>{trace.length} {trace.length===1?"call":"calls"} · {pages} pages · {(ms/1000).toFixed(1)}s · ${cost.toFixed(3)}</span></header>
  <ol>{trace.map((t,i)=><li key={`${t.step}-${i}`}><strong>{t.step}</strong><code>{t.endpoint} · type {t.searchType}</code><span>{t.query}</span></li>)}</ol>
 </div>;
}

/** Supplier product shot. Arbitrary third-party hosts, so it loads direct instead of through the Next optimizer. */
function SourceThumb({src}:{src:string}) {
 const [failed,setFailed]=useState(false);
 if (!src||failed) return null;
 // A page banner or carousel slide that slipped past the server filter gives itself away by its shape, not its filename.
 const rejectBanners=(img:HTMLImageElement)=>{const{naturalWidth:w,naturalHeight:h}=img;if(w&&h&&(w/h>2.5||h/w>2.5))setFailed(true);};
 return <div className="source-thumb">
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onLoad={e=>rejectBanners(e.currentTarget)} onError={()=>setFailed(true)}/>
 </div>;
}

function SettingsDialog({initial,trade,onClose,onSave}:{initial:JobSettings;trade:string;onClose:()=>void;onSave:(s:JobSettings)=>void}) {
 const [draft,setDraft]=useState(initial),[error,setError]=useState("");const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;const focus=document.activeElement as HTMLElement|null;d?.showModal();return()=>{d?.close();focus?.focus();};},[]);
 const save=()=>{if(!validAmount(draft.laborRate)||!validAmount(draft.markupPercent,1000)){setError("Enter a valid positive rate and markup (up to 1,000%).");return;}const domains=draft.supplierDomains.split(/[\s,]+/).filter(Boolean);if(domains.length>12||domains.some(d=>!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(d))){setError("Use up to 12 domains, such as supplyhouse.com, separated by commas.");return;}onSave(draft);};
 return <dialog ref={ref} className="settings-dialog" onCancel={onClose} aria-labelledby="settings-title" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="settings-content"><header><div><p className="eyebrow">{trade.toUpperCase()} DEFAULTS</p><h2 id="settings-title">Your rates. Your suppliers.</h2></div><button onClick={onClose} aria-label="Close settings">×</button></header><p>Defaults for this trade, saved on this device. You can adjust rates and hours for each estimate.</p><label>Your business name<input value={draft.company} onChange={e=>setDraft(d=>({...d,company:e.target.value}))} placeholder="Shown on your estimates" maxLength={100}/></label><div className="job-fields"><label>Hourly labor rate ($)<input type="number" min="0" max="100000" step=".01" value={draft.laborRate} onChange={e=>setDraft(d=>({...d,laborRate:Number(e.target.value)}))}/></label><label>Parts markup (%)<input type="number" min="0" max="1000" value={draft.markupPercent} onChange={e=>setDraft(d=>({...d,markupPercent:Number(e.target.value)}))}/></label></div><label>Search region<input value={draft.region} onChange={e=>setDraft(d=>({...d,region:e.target.value}))} placeholder="United States" maxLength={100}/></label><label>Allowed supplier domains<textarea value={draft.supplierDomains} onChange={e=>setDraft(d=>({...d,supplierDomains:e.target.value}))} placeholder="supplyhouse.com, grainger.com" rows={3}/></label><p>Leave this empty to search across suppliers. Quotes currently use USD. A domain restriction changes which pages Exa searches.</p>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button" onClick={save}>Save defaults <span>✓</span></button></div></dialog>;
}
