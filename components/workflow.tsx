"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ReceiptPrinter } from "./receipt-printer";
import { NoteReplay } from "./note-replay";
import { PartsCart, type SearchState } from "./parts-cart";
import { ExaResearch } from "./exa-research";
import { EpistemicState, ResearchPacketView } from "./research-packet";
import { readEventStream } from "@/lib/read-stream";
import { AudioInput } from "./audio-input";
import { buildQuote, money, type TradePack, type Part } from "@/lib/trades";
import { describesSameWork } from "@/lib/intent";
import { statedQuantities, uncoveredWork, validAmount, type Confirmation, type ResearchPacket, type Routes, type JobSettings, type ParsedJob, type PickedSource, type Discovery, type ResolvedPart, type ExaTrace, type PipelineProgress, type ProductSearchResult } from "@/lib/job";
import type { QuoteLine } from "@/lib/quote-pdf";

export function Workflow({pack}:{pack:TradePack}) {
 const defaultDomains="";
 // The trade's own distributors rank first; they do not restrict the search. Measured on a Square D
 // QO120, restricting to amazon/homedepot/lowes returned four pages and no price at all, while the
 // unrestricted search priced it from two specialist breaker distributors. Preference, not exclusion.
 const defaults:JobSettings={company:"",laborRate:pack.config.laborRate,markupPercent:pack.config.markupPercent,supplierDomains:defaultDomains,preferredDomains:pack.config.allowedDomains.join(", "),region:"United States"};
 const [settings,setSettings]=useState(defaults),[showSettings,setShowSettings]=useState(false),[saved,setSaved]=useState(false);
 const [customer,setCustomer]=useState(""),[site,setSite]=useState(""),[note,setNote]=useState(""),[hours,setHours]=useState(pack.config.laborHours),[plate,setPlate]=useState("");
 const [mode,setMode]=useState<"note"|"audio"|"mic">("note"),[job,setJob]=useState<ParsedJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[quoteOpen,setQuoteOpen]=useState(false);
 const [searches,setSearches]=useState<Record<string,SearchState>>({}),[picks,setPicks]=useState<Record<string,PickedSource>>({});
 const [discovery,setDiscovery]=useState<Discovery|null>(null),[stage,setStage]=useState<""|"parsing"|"researching">("");
 const [packet,setPacket]=useState<ResearchPacket|null>(null),[confirmed,setConfirmed]=useState<Confirmation|null>(null);
 // The technician confirmed a repair and sourcing found nothing to buy, because there is nothing to
 // buy: an obstruction cleared, a connection remade. The research prompt asks for exactly these paths.
 const [labourOnly,setLabourOnly]=useState(false);
 const [events,setEvents]=useState<PipelineProgress[]>([]),[routes,setRoutes]=useState<Routes|null>(null);
 const runController=useRef<AbortController|null>(null);
 const [quantities,setQuantities]=useState<Record<string,number>>({});
 // Two traces, because they have different lifetimes. The research calls belong to the job and stay
 // on screen through confirmation and every sourcing retry; the sourcing calls belong to this run and
 // start again with it. Held as one array, `discovery_complete` overwrote the research entries and the
 // panel then reported a researched job's whole-job cost as the price of its last phase alone.
 const [showExa,setShowExa]=useState(false),[trace,setTrace]=useState<ExaTrace[]>([]),[researchTrace,setResearchTrace]=useState<ExaTrace[]>([]);
 const requests=useRef<Set<AbortController>>(new Set());
 const settingsKey=`fieldquote-settings-v1-${pack.id}`;
 useEffect(()=>{const pending=requests.current;const timer=setTimeout(()=>{try{const raw=localStorage.getItem(settingsKey);if(raw){const value=JSON.parse(raw);if(validAmount(value.laborRate)&&validAmount(value.markupPercent,1000)&&typeof value.company==="string"&&typeof value.supplierDomains==="string"&&typeof value.region==="string")setSettings(value);}}catch{/* Storage is optional. */}},0);return()=>{clearTimeout(timer);pending.forEach(c=>c.abort());};},[settingsKey,defaultDomains]);
 const request=async(url:string,body:object)=>{const c=new AbortController();requests.current.add(c);try{const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:c.signal});const data=await res.json();if(!res.ok)throw new Error(data.error||"Request failed. Please retry.");return data;}finally{requests.current.delete(c);}};
 const cancelResearch=()=>{runController.current?.abort();setSearches(current=>Object.fromEntries(Object.entries(current).map(([id,value])=>[id,value.loading?{...value,loading:false,error:"Search stopped. Retry this supplier search."}:value])));};
 const analyze=async(confirmation?:Confirmation)=>{
  runController.current?.abort();const c=new AbortController();runController.current=c;requests.current.add(c);
  setError("");setBusy(true);setStage("parsing");setRoutes(null);
  // Every run starts from a clean cart, so a retry can never leave two sets of candidates or two
  // priced rows behind. What it must not clear is what the technician already established: confirming
  // or retrying a sourcing run keeps the job, the research packet and the confirmation on screen.
  setDiscovery(null);setPicks({});setSearches({});setQuantities({});
  setTrace([]);
  if(confirmation)setConfirmed(confirmation);
  else{setJob(null);setPacket(null);setConfirmed(null);setResearchTrace([]);setEvents([]);setLabourOnly(false);}
  try{
   const response=await fetch("/api/quote-stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trade:pack.id,note:plate.trim()?`${note.trim()}\n\nEquipment plate: ${plate.trim()}`:note,
    confirmed:confirmation&&{...confirmation,equipment:job?.brief.equipment??"",manufacturer:job?.brief.manufacturer??"",
     model:job?.brief.model??"",constraints:job?.brief.constraints??[]},settings:{supplierDomains:settings.supplierDomains,region:settings.region,preferredDomains:settings.preferredDomains||""}}),signal:c.signal});
   // The parsed job is needed again when discovery lands, before React has re-rendered with it.
   let parsed:ParsedJob|null=null;
   await readEventStream(response,(event,payload)=>{
    if(c.signal.aborted)return;
    if(event==="job_parsed"){parsed=payload as ParsedJob;setJob(parsed);setHours(parsed.laborHours??pack.config.laborHours);setStage("researching");}
    else if(event==="intent_routed"){const data=payload as Record<keyof Routes,string[]|undefined>;
     setRoutes({exact:data.exact?.length??0,registry:data.registry?.length??0,sourced:data.sourced?.length??0,tools:data.tools?.length??0,ambiguous:data.ambiguous?.length??0,superseded:data.superseded?.length??0});}
    else if(event==="research_complete"){const found=payload as ResearchPacket;setPacket(found);setResearchTrace(found.trace||[]);}
    else if(event==="discovery_complete"){const found=payload as Discovery;setDiscovery(found);setTrace(t=>[...t,...(found.trace||[])]);setQuantities(statedQuantities(found,parsed));}
    else if(event==="product_search_started"){const data=payload as {partId:string;query:string};setSearches(s=>({...s,[data.partId]:{loading:true,sources:[],error:"",query:data.query}}));}
    else if(event==="supplier_results"){const data=payload as ProductSearchResult & {partId:string};setSearches(s=>({...s,[data.partId]:{loading:false,sources:data.sources,error:"",query:data.query}}));setTrace(t=>[...t,...data.trace]);}
    else if(event==="supplier_error"){const data=payload as {partId:string;error:string};setSearches(s=>({...s,[data.partId]:{...s[data.partId],loading:false,error:data.error}}));}
    else {const data=payload as PipelineProgress;if(data.stage)setEvents(e=>[...e,data]);}
   });
  }catch(e){setError(c.signal.aborted?"Research stopped. Completed results are still available."
    :confirmation?`Sourcing ${confirmation.component} did not finish. Your confirmation is kept; retry sourcing without re-running the research.`
    :e instanceof Error?e.message:"Research is temporarily unavailable. Your note is kept, retry when ready.");setSearches(s=>Object.fromEntries(Object.entries(s).map(([id,v])=>[id,v.loading?{...v,loading:false,error:"Research interrupted. Retry this search."}:v])));}
  finally{requests.current.delete(c);if(runController.current===c){setBusy(false);setStage("");runController.current=null;}}
 };
 const research=()=>analyze(confirmed??undefined);
 const findSources=async(resolved:ResolvedPart)=>{const key=resolved.id,query=resolved.searchQuery;setSearches(s=>({...s,[key]:{loading:true,sources:[],error:"",query}}));setPicks(prev=>{const next={...prev};delete next[key];return next;});try{const data=await request("/api/source",{query,partNumber:resolved.partNumber,sku:resolved.sku,constraints:resolved.constraints,domains:settings.supplierDomains,preferredDomains:settings.preferredDomains||"",region:settings.region});setSearches(s=>({...s,[key]:{loading:false,sources:data.sources,error:"",query:data.query}}));setTrace(t=>[...t,...(data.trace||[])]);}catch(e){setSearches(s=>({...s,[key]:{loading:false,sources:[],error:e instanceof Error?e.message:"Search failed.",query}}));}};
 const dropResolved=(id:string)=>{setDiscovery(d=>d?{...d,parts:d.parts.filter(r=>r.id!==id)}:d);setPicks(s=>{const next={...s};delete next[id];return next;});setSearches(s=>{const next={...s};delete next[id];return next;});};
 const lines:QuoteLine[]=useMemo(()=>discovery?.parts.flatMap(r=>{const pick=picks[r.id];if(!pick)return[];const qty=quantities[r.id] ?? 1;const part:Part={id:r.id,intent:r.name,discoveryQuery:r.searchQuery,discovery:{sku:r.sku||r.partNumber,name:r.name,manufacturer:r.manufacturer,reason:r.reason,pagesScanned:discovery.pagesScanned},compatibility:{verified:r.verified,statement:r.reason,evidence:r.evidence,sourceLabel:r.sourceLabel,sourceUrl:r.sourceUrl},productQuery:r.searchQuery,listings:[]};return[{part,listing:{supplier:pick.source.supplier,domain:pick.source.domain,url:pick.source.url,price:pick.price,badges:[],match:"compatible" as const,stock:pick.source.availability},qty}];})||[],[discovery,picks,quantities]);
 const quote=buildQuote(lines.map(l=>l.listing.price),lines.map(l=>l.qty),settings.markupPercent,hours,settings.laborRate);
 // A confirmed repair is sourced under its own id, so it can never match a reported item by id. The
 // work it describes is matched instead, or the estimate lists the fault it just priced as excluded.
 const exclusions=useMemo(()=>uncoveredWork(job,discovery,id=>!!picks[id],
  confirmed?description=>describesSameWork(confirmed.component,description):undefined),[job,discovery,picks,confirmed]);
 const fullTrace=useMemo(()=>[...researchTrace,...trace],[researchTrace,trace]);
 const allConfirmed=lines.length>0&&Object.values(picks).every(p=>p.confirmed&&p.price>0&&validAmount(p.price)&&p.source.matchStatus!=="rejected");
 // Offered only where it is the honest reading: a repair was confirmed, sourcing ran, and it found
 // nothing to buy. It is never inferred - the technician ticks it - because "no part found" and "no
 // part needed" look identical from here and mean opposite things. Keyed on candidates rather than on
 // selected lines, or unticking a row would offer to quote labour for a repair that has a part listed
 // right above the offer.
 const nothingToSource=!!confirmed&&!!discovery&&discovery.parts.length===0;
 const work=labourOnly&&nothingToSource&&confirmed?{component:confirmed.component,findings:confirmed.findings}:null;
 const canPrint=!busy&&(allConfirmed||(!!work&&hours>0))&&customer.trim().length>0&&validAmount(hours,1000)&&validAmount(settings.laborRate)&&validAmount(settings.markupPercent,1000);
 const quotePack:TradePack={...pack,config:{...pack.config,laborRate:settings.laborRate,markupPercent:settings.markupPercent},demo:{...pack.demo,customer,site,laborHours:hours,parts:lines.map(l=>l.part)}};
 const inSearch=Object.values(searches).some(s=>s.loading);
 // What to call a line in the unresolved and superseded blocks. A confirmed repair is filed under its
 // own id by design, so it is named from the confirmation rather than from the reported items.
 const labelFor=(partId:string)=>job?.knownParts.find(p=>p.id===partId)?.description
  ||(partId.startsWith("confirmed-")?confirmed?.component??"":"")||partId;
 const researchMessage=[...events].reverse().find(e=>e.stage==="retrieving_knowledge"||e.stage==="reading_documentation")?.message;
 const appendTranscript=(text:string)=>setNote(n=>n?`${n.trim()} ${text.trim()}`:text.trim());
 return <div className="workshop"><div className="page-width">
  <div className="job-heading"><Image src={pack.mascot} alt="" width={pack.mascotW} height={pack.mascotH} unoptimized /><div><p className="eyebrow">{pack.name.toUpperCase()} WORKSPACE</p><h1>Start with what you don’t know.</h1><p>Describe the equipment and what it is doing. FSMpedia researches it, you confirm the repair, then it sources the part.</p></div><div className="heading-controls"><ToggleControl label="Exa" enabled={showExa} onToggle={()=>setShowExa(v=>!v)}/><button className="secondary-button" onClick={()=>setShowSettings(true)}>⚙ Rates & suppliers</button></div></div>
  {saved&&<p className="saved-message" role="status">Your {pack.name.toLowerCase()} rates and supplier preferences are saved on this device.</p>}
  <div className={`job-layout${discovery&&discovery.parts.length>0?"":" solo"}`}><div className="job-main">
   <section className="job-card"><header><div><span className="section-number">01</span><h2>What are you seeing?</h2></div><span>Uncertainty is fine</span></header><div className="job-card-body"><div className="job-fields"><label>Equipment model or serial <span className="field-optional">optional</span><input value={plate} onChange={e=>setPlate(e.target.value)} placeholder="From the plate, if you can read it" maxLength={120}/></label></div>
    <div className="input-tabs" role="group" aria-label="Input method">{([["note","Type a note"],["audio","Upload audio"],["mic","Use microphone"]] as const).map(([id,label])=><button key={id} aria-pressed={mode===id} className={mode===id?"active":""} onClick={()=>setMode(id)}>{label}</button>)}</div>
    {mode!=="note"&&!busy&&!job&&<AudioInput key={mode} mode={mode} onTranscript={appendTranscript}/>}
    <label className="note-label">{mode==="note"?"What you found on site":"Transcript — review and edit"}<textarea value={note} onChange={e=>setNote(e.target.value)} disabled={busy||!!job} rows={5} maxLength={12000} placeholder="The equipment, what it is doing, any fault code, and what you have already checked. You do not need to know the answer."/></label>
        <div className="note-actions">{job?<button className="secondary-button" disabled={busy||inSearch} onClick={()=>{setJob(null);setPacket(null);setConfirmed(null);setDiscovery(null);setSearches({});setPicks({});setEvents([]);setTrace([]);setResearchTrace([]);setLabourOnly(false);setHours(pack.config.laborHours);}}>Start again</button>:<button className="primary-button" disabled={busy||note.trim().length<12} onClick={()=>analyze()}>{busy?"Reading…":"Research this job"}<span>→</span></button>}</div>{error&&<div className="form-error" role="alert"><p>{error}</p>
     <button className="text-button" disabled={busy} onClick={()=>analyze(confirmed??undefined)}>
      ↻ {confirmed?`Retry sourcing ${confirmed.component}`:packet?"Retry research":"Try again"}</button></div>}</div></section>
   {job?<section className="job-card"><header><div><span className="section-number">02</span><h2>{discovery?"Your parts list":packet?"What the evidence says":busy&&job.brief.needsResearch?"Researching the equipment":"Your field observations"}</h2></div><span>{discovery&&discovery.pagesScanned>0?`${discovery.pagesScanned} pages read`:""}</span></header><div className="job-card-body">
    <NoteReplay note={note} job={job} collapsed={!!(discovery||packet)&&!busy}/>
    <EpistemicState packet={packet} confirmed={confirmed} busy={busy}/>
    <JobContext brief={job.brief}/>
    {busy&&stage==="researching"&&job.brief.needsResearch&&!packet&&<div className="research-status" role="status" aria-live="polite"><p className="search-status"><span className="pulse-dot"/>{researchMessage||"Your note needs research. Exa is finding documentation for this equipment…"}</p><p>No extra step is needed. The evidence and checks will appear here before any parts are sourced.</p></div>}
    {packet&&!discovery&&<ResearchPacketView brief={job.brief} packet={packet} busy={busy} onConfirm={c=>analyze(c)}/>}
    {!busy&&!discovery&&!packet&&job.questions.length>0&&<div className="review-questions"><strong>Still unknown</strong><ul>{job.questions.map(q=><li key={q}>{q}</li>)}</ul></div>}
     {discovery&&<div className={showExa?"exa-on":"exa-off"}>
      {discovery.parts.some(r=>r.partIds.length>1&&r.verified)&&<p className="consolidated-note">One kit below already covers what a second line item would have duplicated.</p>}
      {discovery.parts.length===0&&<p className="empty-message">{confirmed?"No orderable part could be confirmed from the retrieved pages. If this repair needs no replacement part, quote the labour in the estimate; otherwise add the part number and research again.":"No orderable part could be confirmed from the retrieved pages. Add the equipment model or part number and try again."}</p>}
      <PartsCart discovery={discovery} searches={searches} picks={picks} quantities={quantities}
       onPick={(id,pick)=>setPicks(s=>{const next={...s};if(pick){const target=discovery.parts.find(p=>p.id===id);for(const other of discovery.parts)if(other.id!==id&&other.partIds.some(fault=>target?.partIds.includes(fault)))delete next[other.id];next[id]=pick;}else delete next[id];return next;})}
       onQuantity={(id,value)=>setQuantities(q=>({...q,[id]:value}))}
       onRemove={dropResolved} onRetry={findSources} busy={busy}
       faultLabel={id=>job.knownParts.find(p=>p.id===id)?.description||""}/>
      {(discovery.superseded?.length??0)>0&&<div className="superseded-block"><strong>Already covered by another line</strong><ul>{discovery.superseded!.map(sup=><li key={sup.partId}><em>{labelFor(sup.partId)}</em> — {sup.reason}</li>)}</ul></div>}
      {discovery.unresolved.length>0&&<div className="unresolved-block"><strong>Not confirmed from the retrieved pages</strong><ul>{discovery.unresolved.map(u=><li key={u.partId}><em>{labelFor(u.partId)}</em> — {u.reason}</li>)}</ul></div>}
      <button className="text-button add-part" onClick={research} disabled={busy}>↻ Research these parts again</button>
    </div>}</div></section>:<div className="workshop-empty"><Image src={pack.mascot} alt="" width={pack.mascotW} height={pack.mascotH} unoptimized/><div><h3>No after-hours replay session.</h3><p>Your note becomes an editable parts list. You check the sources and set the price.</p></div></div>}
  </div>{discovery&&(discovery.parts.length>0||nothingToSource)&&<aside className="estimate-panel"><header><span className="micro-label">YOUR ESTIMATE</span><span>▤</span></header><div className="estimate-body"><div className="estimate-who"><label>Customer<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Who is this for?" maxLength={120}/></label><label>Site<input value={site} onChange={e=>setSite(e.target.value)} placeholder="Address or work order" maxLength={180}/></label></div><p className="estimate-zone" data-zone="external">Researched externally <span>part, supplier and public price</span></p><div className="estimate-lines">{nothingToSource?<label className="labour-only"><input type="checkbox" checked={labourOnly} onChange={e=>setLabourOnly(e.target.checked)}/><span>This repair needs no replacement part. Quote labour only.</span></label>:!lines.length?<p className="empty-message">Your selected parts will appear here.</p>:lines.map(line=>{const pick=picks[line.part.id];return <div className="estimate-line" key={line.part.id}><strong>{line.part.discovery.name}</strong><a href={pick.source.url} target="_blank" rel="noopener noreferrer">{pick.source.domain} ↗</a><label>Unit cost (USD)<input aria-label={`Unit cost for ${line.part.discovery.name}`} type="number" min="0" max="100000" step=".01" value={pick.price} onChange={e=>setPicks(s=>({...s,[line.part.id]:{...s[line.part.id],price:Number(e.target.value),confirmed:false}}))}/></label><div className="line-extension"><span>{line.qty} × {money(pick.price)}</span><strong>{money(line.qty*pick.price)}</strong></div>{pick.price!==pick.source.price&&<small>Manually entered price — confirm against source.</small>}{pick.source.packQuantity==null?<small>Page did not state a pack size. Confirm this is the price for one.</small>:pick.source.packQuantity>1?<small>Page sells a pack of {pick.source.packQuantity} — set the unit cost.</small>:null}<label className="confirm-source"><input type="checkbox" checked={pick.confirmed} onChange={e=>setPicks(s=>({...s,[line.part.id]:{...s[line.part.id],confirmed:e.target.checked}}))}/><span>I checked fit, pack quantity, and price.</span></label></div>;})}</div>
   <p className="estimate-zone" data-zone="shop">Your shop&apos;s rates <span>never taken from the web</span></p><div className="pricing-inputs"><label>{job?.laborRange?"Labor hours":"Shop default hours, editable"}{job?.laborRange&&<span className="stated-range">{job.laborRange.min===job.laborRange.max?`note says ${job.laborRange.min} hr`:`note says ${job.laborRange.min}–${job.laborRange.max} hr`}</span>}<input type="number" min="0" max="1000" step=".25" value={hours} onChange={e=>setHours(Number(e.target.value))}/></label><label>Hourly rate ($)<input type="number" min="0" max="100000" step=".01" value={settings.laborRate} onChange={e=>setSettings(s=>({...s,laborRate:Number(e.target.value)}))}/></label><label>Parts markup (%)<input type="number" min="0" max="1000" step=".1" value={settings.markupPercent} onChange={e=>setSettings(s=>({...s,markupPercent:Number(e.target.value)}))}/></label></div><p className="estimate-zone" data-zone="customer">The customer&apos;s quote <span>parts, markup and labour</span></p><dl className="estimate-totals"><div><dt>Parts</dt><dd>{money(quote.partsSubtotal)}</dd></div><div><dt>Parts markup</dt><dd>{money(quote.markup)}</dd></div><div><dt>Labor</dt><dd>{money(quote.labor)}</dd></div><div className="estimate-grand"><dt>Estimated total</dt><dd>{money(quote.total)}</dd></div></dl><button className="primary-button" disabled={!canPrint} onClick={()=>setQuoteOpen(true)}>Print estimate <span>↗</span></button><p className="estimate-hint">{!customer.trim()?"Add a customer name to create your estimate.":work?hours>0?"Ready to print a labour-only estimate. It will state that no replacement part was required.":"Set the hours for this visit to print a labour-only estimate.":!allConfirmed?nothingToSource?"Nothing was found to buy. Tick the box above if this repair needs no part, or retry the sourcing.":"Choose candidates and confirm their fit and price before printing.":exclusions.length?`Ready to print. ${exclusions.length} reported ${exclusions.length===1?"item is":"items are"} not priced here and will be listed on the estimate as not included.`:"Ready to review and download as PDF."}</p>{fullTrace.length>0&&showExa&&<ExaRunTrace trace={fullTrace}/>}<p className="estimate-footnote">Tax and shipping excluded. Check the supplier page before ordering. Markup applies to parts only.</p></div></aside>}</div>
  {(busy||events.length>0)&&showExa&&<ExaResearch events={events} trace={fullTrace} busy={busy} routes={routes} onCancel={cancelResearch}/>}
  </div>
 {showSettings&&<SettingsDialog initial={settings} trade={pack.name} onClose={()=>setShowSettings(false)} onSave={value=>{setSettings(value);setShowSettings(false);try{localStorage.setItem(settingsKey,JSON.stringify(value));setSaved(true);}catch{setError("Settings apply to this job, but browser storage is unavailable.");}}}/>}
 {quoteOpen&&<ReceiptPrinter pack={quotePack} lines={lines} quote={quote} company={settings.company} exclusions={exclusions} work={work} onClose={()=>setQuoteOpen(false)}/>}
 </div>;
}

/** The situation, read back to the technician so they can see what was understood. */
function JobContext({brief}:{brief:ParsedJob["brief"]}) {
 // "Carrier" and "Carrier rooftop unit" are the same word twice on screen.
 const machine=brief.equipment.toLowerCase().includes(brief.manufacturer.toLowerCase())?brief.equipment:[brief.manufacturer,brief.equipment].filter(Boolean).join(" ");
 const rows:[string,string][]=[["Equipment",machine],["Model",brief.model],
  ["Fault codes",brief.faultCodes.join(", ")],["Symptoms",brief.symptoms.join("; ")],
  ["Already checked",brief.alreadyChecked.join("; ")],["Still uncertain",brief.stillUncertain.join("; ")]];
 const shown=rows.filter(([,value])=>value);
 if(!shown.length) return null;
 return <dl className="job-context">{shown.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function ToggleControl({label,enabled,onToggle}:{label:string;enabled:boolean;onToggle:()=>void}) {
 return <button type="button" role="switch" aria-checked={enabled} className={`exa-toggle ${enabled?"on":""}`} onClick={onToggle}><span className="exa-toggle-label">{label}</span><span className="exa-toggle-track"><span className="exa-toggle-knob"/></span></button>;
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
