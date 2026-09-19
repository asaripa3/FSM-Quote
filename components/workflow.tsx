"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ReceiptPrinter } from "./receipt-printer";
import { NoteReplay } from "./note-replay";
import { PartsCart, type SearchState } from "./parts-cart";
import { ExaResearch } from "./exa-research";
import { readEventStream } from "@/lib/read-stream";
import { AudioInput } from "./audio-input";
import { buildQuote, money, type TradePack, type Part } from "@/lib/trades";
import { statedQuantities, validAmount, type JobSettings, type ParsedJob, type PickedSource, type Discovery, type ResolvedPart, type ExaTrace, type PipelineProgress, type ProductSearchResult } from "@/lib/job";
import type { QuoteLine } from "@/lib/quote-pdf";

export function Workflow({pack}:{pack:TradePack}) {
 const defaultDomains="";
 const defaults:JobSettings={company:"",laborRate:pack.config.laborRate,markupPercent:pack.config.markupPercent,supplierDomains:defaultDomains,region:"United States"};
 const [settings,setSettings]=useState(defaults),[showSettings,setShowSettings]=useState(false),[saved,setSaved]=useState(false);
 const [customer,setCustomer]=useState(""),[site,setSite]=useState(""),[note,setNote]=useState(""),[hours,setHours]=useState(0);
 const [mode,setMode]=useState<"note"|"audio"|"mic">("note"),[job,setJob]=useState<ParsedJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[quoteOpen,setQuoteOpen]=useState(false);
 const [searches,setSearches]=useState<Record<string,SearchState>>({}),[picks,setPicks]=useState<Record<string,PickedSource>>({});
 const [discovery,setDiscovery]=useState<Discovery|null>(null),[stage,setStage]=useState<""|"parsing"|"researching">("");
 const [events,setEvents]=useState<PipelineProgress[]>([]),[routes,setRoutes]=useState<{exact:number;ambiguous:number}|null>(null);
 const runController=useRef<AbortController|null>(null);
 const [quantities,setQuantities]=useState<Record<string,number>>({});
 const [showExa,setShowExa]=useState(false),[trace,setTrace]=useState<ExaTrace[]>([]);
 const requests=useRef<Set<AbortController>>(new Set());
 const settingsKey=`fieldquote-settings-v1-${pack.id}`;
 useEffect(()=>{const pending=requests.current;const timer=setTimeout(()=>{try{const raw=localStorage.getItem(settingsKey);if(raw){const value=JSON.parse(raw);if(validAmount(value.laborRate)&&validAmount(value.markupPercent,1000)&&typeof value.company==="string"&&typeof value.supplierDomains==="string"&&typeof value.region==="string")setSettings(value);}}catch{/* Storage is optional. */}},0);return()=>{clearTimeout(timer);pending.forEach(c=>c.abort());};},[settingsKey,defaultDomains]);
 const request=async(url:string,body:object)=>{const c=new AbortController();requests.current.add(c);try{const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:c.signal});const data=await res.json();if(!res.ok)throw new Error(data.error||"Request failed. Please retry.");return data;}finally{requests.current.delete(c);}};
 const cancelResearch=()=>{runController.current?.abort();setSearches(current=>Object.fromEntries(Object.entries(current).map(([id,value])=>[id,value.loading?{...value,loading:false,error:"Search stopped. Retry this supplier search."}:value])));};
 const analyze=async()=>{
  runController.current?.abort();const c=new AbortController();runController.current=c;requests.current.add(c);
  setError("");setBusy(true);setStage("parsing");setJob(null);setDiscovery(null);setPicks({});setSearches({});setTrace([]);setEvents([]);setRoutes(null);setQuantities({});
  try{
   const response=await fetch("/api/quote-stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trade:pack.id,note,settings:{supplierDomains:settings.supplierDomains,region:settings.region,preferredDomains:settings.preferredDomains||""}}),signal:c.signal});
   // The parsed job is needed again when discovery lands, before React has re-rendered with it.
   let parsed:ParsedJob|null=null;
   await readEventStream(response,(event,payload)=>{
    if(c.signal.aborted)return;
    if(event==="job_parsed"){parsed=payload as ParsedJob;setJob(parsed);setHours(parsed.laborHours??0);setStage("researching");}
    else if(event==="intent_routed"){const data=payload as {exact:string[];ambiguous:string[]};setRoutes({exact:data.exact.length,ambiguous:data.ambiguous.length});}
    else if(event==="discovery_complete"){const found=payload as Discovery;setDiscovery(found);setTrace(found.trace||[]);setQuantities(statedQuantities(found,parsed));}
    else if(event==="product_search_started"){const data=payload as {partId:string;query:string};setSearches(s=>({...s,[data.partId]:{loading:true,sources:[],error:"",query:data.query}}));}
    else if(event==="supplier_results"){const data=payload as ProductSearchResult & {partId:string};setSearches(s=>({...s,[data.partId]:{loading:false,sources:data.sources,error:"",query:data.query}}));setTrace(t=>[...t,...data.trace]);}
    else if(event==="supplier_error"){const data=payload as {partId:string;error:string};setSearches(s=>({...s,[data.partId]:{...s[data.partId],loading:false,error:data.error}}));}
    else {const data=payload as PipelineProgress;if(data.stage)setEvents(e=>[...e,data]);}
   });
  }catch(e){setError(c.signal.aborted?"Research stopped. Completed results are still available.":e instanceof Error?e.message:"Could not research this note.");setSearches(s=>Object.fromEntries(Object.entries(s).map(([id,v])=>[id,v.loading?{...v,loading:false,error:"Research interrupted. Retry this search."}:v])));}
  finally{requests.current.delete(c);if(runController.current===c){setBusy(false);setStage("");runController.current=null;}}
 };
 const research=()=>analyze();
 const findSources=async(resolved:ResolvedPart)=>{const key=resolved.id,query=resolved.searchQuery;setSearches(s=>({...s,[key]:{loading:true,sources:[],error:"",query}}));setPicks(prev=>{const next={...prev};delete next[key];return next;});try{const data=await request("/api/source",{query,partNumber:resolved.partNumber,sku:resolved.sku,constraints:resolved.constraints,domains:settings.supplierDomains,preferredDomains:settings.preferredDomains||"",region:settings.region});setSearches(s=>({...s,[key]:{loading:false,sources:data.sources,error:"",query:data.query}}));setTrace(t=>[...t,...(data.trace||[])]);}catch(e){setSearches(s=>({...s,[key]:{loading:false,sources:[],error:e instanceof Error?e.message:"Search failed.",query}}));}};
 const dropResolved=(id:string)=>{setDiscovery(d=>d?{...d,parts:d.parts.filter(r=>r.id!==id)}:d);setPicks(s=>{const next={...s};delete next[id];return next;});setSearches(s=>{const next={...s};delete next[id];return next;});};
 const lines:QuoteLine[]=useMemo(()=>discovery?.parts.flatMap(r=>{const pick=picks[r.id];if(!pick)return[];const qty=quantities[r.id] ?? 1;const part:Part={id:r.id,intent:r.name,discoveryQuery:r.searchQuery,discovery:{sku:r.sku||r.partNumber,name:r.name,manufacturer:r.manufacturer,reason:r.reason,pagesScanned:discovery.pagesScanned},compatibility:{verified:r.verified,statement:r.reason,evidence:r.evidence,sourceLabel:r.sourceLabel,sourceUrl:r.sourceUrl},productQuery:r.searchQuery,listings:[]};return[{part,listing:{supplier:pick.source.supplier,domain:pick.source.domain,url:pick.source.url,price:pick.price,badges:[],match:"compatible" as const,stock:pick.source.availability},qty}];})||[],[discovery,picks,quantities]);
 const quote=buildQuote(lines.map(l=>l.listing.price),lines.map(l=>l.qty),settings.markupPercent,hours,settings.laborRate);
 const allConfirmed=lines.length>0&&Object.values(picks).every(p=>p.confirmed&&p.price>0&&validAmount(p.price)&&p.source.matchStatus!=="rejected");
 const canPrint=!busy&&allConfirmed&&customer.trim().length>0&&validAmount(hours,1000)&&validAmount(settings.laborRate)&&validAmount(settings.markupPercent,1000);
 const quotePack:TradePack={...pack,config:{...pack.config,laborRate:settings.laborRate,markupPercent:settings.markupPercent},demo:{...pack.demo,customer,site,note,laborHours:hours,parts:lines.map(l=>l.part)}};
 const inSearch=Object.values(searches).some(s=>s.loading);
 const loadExample=(kind:"exact"|"ambiguous")=>{
  const examples={plumbing:{exact:"Order one Moen 1222 cartridge for the shower repair. The part number is confirmed on the work order. Allow 45 minutes labor.",ambiguous:"Older Moen single-handle shower keeps dripping after shutoff. Cartridge looks seized. It might be Posi-Temp, but the model is unknown. Find candidate cartridges and tell me what to check before ordering."},hvac:{exact:"Order one Honeywell TH1110D2009 thermostat. The replacement part number is confirmed. Allow 30 minutes labor.",ambiguous:"Condenser fan hums but does not start. Capacitor label is worn. Equipment is a Carrier outdoor unit; model and capacitance rating need confirmation. Find what information and replacement candidates to check."},electrical:{exact:"Order one Square D QO120 circuit breaker. The replacement number is confirmed by the technician. Allow 30 minutes labor.",ambiguous:"Commercial lighting contactor chatters. Coil is marked 120 V. Manufacturer and frame number are hard to read. Research replacement options and identify the missing specifications before we order."}};
  setNote(examples[pack.id][kind]);setJob(null);setDiscovery(null);setSearches({});setPicks({});setEvents([]);setTrace([]);
 };
 const appendTranscript=(text:string)=>setNote(n=>n?`${n.trim()} ${text.trim()}`:text.trim());
 return <div className="workshop"><div className="page-width">
  <div className="job-heading"><Image src={pack.mascot} alt="" width={pack.mascotW} height={pack.mascotH} unoptimized /><div><p className="eyebrow">{pack.name.toUpperCase()} WORKSPACE</p><h1>A new job. A clear estimate.</h1><p>Bring your field note. We’ll help with the rest.</p></div><div className="heading-controls"><ToggleControl label="Exa" enabled={showExa} onToggle={()=>setShowExa(v=>!v)}/><button className="secondary-button" onClick={()=>setShowSettings(true)}>⚙ Rates & suppliers</button></div></div>
  {(busy||events.length>0)&&showExa&&<ExaResearch events={events} trace={trace} busy={busy} routes={routes} onCancel={cancelResearch}/>}
  {saved&&<p className="saved-message" role="status">Your {pack.name.toLowerCase()} rates and supplier preferences are saved on this device.</p>}
  <div className={`job-layout${discovery&&discovery.parts.length>0?"":" solo"}`}><div className="job-main">
   <section className="job-card"><header><div><span className="section-number">01</span><h2>The job details</h2></div><span>Start here</span></header><div className="job-card-body"><div className="job-fields"><label>Customer / business<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Who is the estimate for?" maxLength={120}/></label><label>Site / job location<input value={site} onChange={e=>setSite(e.target.value)} placeholder="Address, building or work order" maxLength={180}/></label></div>
    <div className="input-tabs" role="group" aria-label="Input method">{([["note","Type a note"],["audio","Upload audio"],["mic","Use microphone"]] as const).map(([id,label])=><button key={id} aria-pressed={mode===id} className={mode===id?"active":""} onClick={()=>setMode(id)}>{label}</button>)}</div>
    {mode!=="note"&&!busy&&!job&&<AudioInput key={mode} mode={mode} onTranscript={appendTranscript}/>}
    <label className="note-label">{mode==="note"?"Inspection note":"Transcript — review and edit"}<textarea value={note} onChange={e=>setNote(e.target.value)} disabled={busy||!!job} rows={5} maxLength={12000} placeholder="What equipment did you inspect? What needs replacing? Include model numbers, quantities and labor time if you have them."/></label>
    <div className="demo-paths"><span>Try either path</span><button disabled={busy||inSearch} onClick={()=>loadExample("exact")}>I know the part number ↗</button><button disabled={busy||inSearch} onClick={()=>loadExample("ambiguous")}>I only know the problem ↗</button></div>
    <div className="note-actions"><button className="text-button" disabled={busy||inSearch} onClick={()=>{setNote(pack.demo.note);setJob(null);setDiscovery(null);setSearches({});setPicks({});setEvents([]);setTrace([]);}}>Use an example note</button>{job?<button className="secondary-button" disabled={busy||inSearch} onClick={()=>{setJob(null);setDiscovery(null);setSearches({});setPicks({});setEvents([]);setTrace([]);}}>Edit note & start again</button>:<button className="primary-button" disabled={busy||note.trim().length<12} onClick={analyze}>{busy?"Reading your note…":"Review the job"}<span>→</span></button>}</div>{error&&<p className="form-error" role="alert">{error}</p>}</div></section>
   {job?<section className="job-card"><header><div><span className="section-number">02</span><h2>{discovery?"Your parts list":"Reading your note"}</h2></div><span>{discovery?`${discovery.pagesScanned} pages read`:""}</span></header><div className="job-card-body">
    <NoteReplay note={note} job={job} collapsed={!!discovery&&!busy}/>
    {stage==="researching"&&<p className="search-status" role="status"><span className="pulse-dot"/>Reading manufacturer and distributor pages with Exa to find what actually fixes this…</p>}
    {!discovery&&job.questions.length>0&&<div className="review-questions"><strong>Check before ordering</strong><ul>{job.questions.map(q=><li key={q}>{q}</li>)}</ul></div>}
     {discovery&&<div className={showExa?"exa-on":"exa-off"}>
      {discovery.parts.some(r=>r.partIds.length>1&&r.verified)&&<p className="consolidated-note">One kit below already covers what a second line item would have duplicated.</p>}
      {discovery.parts.length===0&&<p className="empty-message">No orderable part could be confirmed from the retrieved pages. Add the model designation from the equipment plate and try again.</p>}
      <PartsCart discovery={discovery} searches={searches} picks={picks} quantities={quantities}
       onPick={(id,pick)=>setPicks(s=>{const next={...s};if(pick){const target=discovery.parts.find(p=>p.id===id);for(const other of discovery.parts)if(other.id!==id&&other.partIds.some(fault=>target?.partIds.includes(fault)))delete next[other.id];next[id]=pick;}else delete next[id];return next;})}
       onQuantity={(id,value)=>setQuantities(q=>({...q,[id]:value}))}
       onRemove={dropResolved} onRetry={findSources} busy={busy}
       faultLabel={id=>job.parts.find(p=>p.id===id)?.description||""}/>
      {discovery.unresolved.length>0&&<div className="unresolved-block"><strong>Not confirmed from the retrieved pages</strong><ul>{discovery.unresolved.map(u=><li key={u.partId}><em>{job.parts.find(p=>p.id===u.partId)?.description||u.partId}</em> — {u.reason}</li>)}</ul></div>}
      <button className="text-button add-part" onClick={research} disabled={busy}>↻ Research these parts again</button>
      {showExa&&<ExaLegend/>}
    </div>}</div></section>:<div className="workshop-empty"><Image src={pack.mascot} alt="" width={pack.mascotW} height={pack.mascotH} unoptimized/><div><h3>No after-hours replay session.</h3><p>Your note becomes an editable parts list. You check the sources and set the price.</p></div></div>}
  </div>{discovery&&discovery.parts.length>0&&<aside className="estimate-panel"><header><span className="micro-label">YOUR ESTIMATE</span><span>▤</span></header><div className="estimate-body"><h2>{customer||"Your customer"}</h2><p>{site||"Add the job location"}</p><div className="estimate-lines">{!lines.length?<p className="empty-message">Your selected parts will appear here.</p>:lines.map(line=>{const pick=picks[line.part.id];return <div className="estimate-line" key={line.part.id}><strong>{line.part.discovery.name}</strong><a href={pick.source.url} target="_blank" rel="noopener noreferrer">{pick.source.domain} ↗</a><label>Unit cost (USD)<input aria-label={`Unit cost for ${line.part.discovery.name}`} type="number" min="0" max="100000" step=".01" value={pick.price} onChange={e=>setPicks(s=>({...s,[line.part.id]:{...s[line.part.id],price:Number(e.target.value),confirmed:false}}))}/></label><div className="line-extension"><span>{line.qty} × {money(pick.price)}</span><strong>{money(line.qty*pick.price)}</strong></div>{pick.price!==pick.source.price&&<small>Manually entered price — confirm against source.</small>}<label className="confirm-source"><input type="checkbox" checked={pick.confirmed} onChange={e=>setPicks(s=>({...s,[line.part.id]:{...s[line.part.id],confirmed:e.target.checked}}))}/><span>I checked fit, pack quantity, and price.</span></label></div>;})}</div>
   <div className="pricing-inputs"><label>Labor hours{job?.laborRange&&<span className="stated-range">{job.laborRange.min===job.laborRange.max?`note says ${job.laborRange.min} hr`:`note says ${job.laborRange.min}–${job.laborRange.max} hr`}</span>}<input type="number" min="0" max="1000" step=".25" value={hours} onChange={e=>setHours(Number(e.target.value))}/></label><label>Hourly rate ($)<input type="number" min="0" max="100000" step=".01" value={settings.laborRate} onChange={e=>setSettings(s=>({...s,laborRate:Number(e.target.value)}))}/></label><label>Parts markup (%)<input type="number" min="0" max="1000" step=".1" value={settings.markupPercent} onChange={e=>setSettings(s=>({...s,markupPercent:Number(e.target.value)}))}/></label></div><dl className="estimate-totals"><div><dt>Parts</dt><dd>{money(quote.partsSubtotal)}</dd></div><div><dt>Parts markup</dt><dd>{money(quote.markup)}</dd></div><div><dt>Labor</dt><dd>{money(quote.labor)}</dd></div><div className="estimate-grand"><dt>Estimated total</dt><dd>{money(quote.total)}</dd></div></dl><button className="primary-button" disabled={!canPrint} onClick={()=>setQuoteOpen(true)}>Print estimate <span>↗</span></button><p className="estimate-hint">{!customer.trim()?"Add a customer name to create your estimate.":!allConfirmed?"Choose candidates and confirm their fit and price before printing.":"Ready to review and download as PDF."}</p>{trace.length>0&&showExa&&<ExaRunTrace trace={trace}/>}<p className="estimate-footnote">Tax and shipping excluded. Check the supplier page before ordering. Markup applies to parts only.</p></div></aside>}</div></div>
 {showSettings&&<SettingsDialog initial={settings} trade={pack.name} onClose={()=>setShowSettings(false)} onSave={value=>{setSettings(value);setShowSettings(false);try{localStorage.setItem(settingsKey,JSON.stringify(value));setSaved(true);}catch{setError("Settings apply to this job, but browser storage is unavailable.");}}}/>}
 {quoteOpen&&<ReceiptPrinter pack={quotePack} lines={lines} quote={quote} company={settings.company} onClose={()=>setQuoteOpen(false)}/>}
 </div>;
}

function ToggleControl({label,enabled,onToggle}:{label:string;enabled:boolean;onToggle:()=>void}) {
 return <button type="button" role="switch" aria-checked={enabled} className={`exa-toggle ${enabled?"on":""}`} onClick={onToggle}><span className="exa-toggle-label">{label}</span><span className="exa-toggle-track"><span className="exa-toggle-knob"/></span></button>;
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


function SettingsDialog({initial,trade,onClose,onSave}:{initial:JobSettings;trade:string;onClose:()=>void;onSave:(s:JobSettings)=>void}) {
 const [draft,setDraft]=useState(initial),[error,setError]=useState("");const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;const focus=document.activeElement as HTMLElement|null;d?.showModal();return()=>{d?.close();focus?.focus();};},[]);
 const save=()=>{if(!validAmount(draft.laborRate)||!validAmount(draft.markupPercent,1000)){setError("Enter a valid positive rate and markup (up to 1,000%).");return;}const domains=draft.supplierDomains.split(/[\s,]+/).filter(Boolean);if(domains.length>12||domains.some(d=>!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(d))){setError("Use up to 12 domains, such as supplyhouse.com, separated by commas.");return;}onSave(draft);};
 return <dialog ref={ref} className="settings-dialog" onCancel={onClose} aria-labelledby="settings-title" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="settings-content"><header><div><p className="eyebrow">{trade.toUpperCase()} DEFAULTS</p><h2 id="settings-title">Your rates. Your suppliers.</h2></div><button onClick={onClose} aria-label="Close settings">×</button></header><p>Defaults for this trade, saved on this device. You can adjust rates and hours for each estimate.</p><label>Your business name<input value={draft.company} onChange={e=>setDraft(d=>({...d,company:e.target.value}))} placeholder="Shown on your estimates" maxLength={100}/></label><div className="job-fields"><label>Hourly labor rate ($)<input type="number" min="0" max="100000" step=".01" value={draft.laborRate} onChange={e=>setDraft(d=>({...d,laborRate:Number(e.target.value)}))}/></label><label>Parts markup (%)<input type="number" min="0" max="1000" value={draft.markupPercent} onChange={e=>setDraft(d=>({...d,markupPercent:Number(e.target.value)}))}/></label></div><label>Search region<input value={draft.region} onChange={e=>setDraft(d=>({...d,region:e.target.value}))} placeholder="United States" maxLength={100}/></label><label>Preferred suppliers (rank in this order)<input value={draft.preferredDomains||""} onChange={e=>setDraft(d=>({...d,preferredDomains:e.target.value}))} placeholder="supplyhouse.com, grainger.com" maxLength={2000}/></label><label>Allowed supplier domains<textarea value={draft.supplierDomains} onChange={e=>setDraft(d=>({...d,supplierDomains:e.target.value}))} placeholder="supplyhouse.com, grainger.com" rows={3}/></label><p>Leave this empty to search across suppliers. Quotes currently use USD. A domain restriction changes which pages Exa searches.</p>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button" onClick={save}>Save defaults <span>✓</span></button></div></dialog>;
}
