"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReceiptPrinter } from "./receipt-printer";
import { PartsCart, type SearchState } from "./parts-cart";
import { DecisionResearch, type WorkspacePhase } from "./decision-research";
import { readEventStream } from "@/lib/read-stream";
import { InlineCapture } from "./audio-input";
import { buildQuote, money, type TradePack, type Part } from "@/lib/trades";
import { describesSameWork } from "@/lib/intent";
import { followUps, noteWithAnswers, type FollowUp } from "@/lib/clarify";
import { statedQuantities, uncoveredWork, validAmount, type Confirmation, type ResearchPacket, type JobSettings, type ParsedJob, type PickedSource, type Discovery, type ResolvedPart, type ExaTrace, type PipelineProgress, type ProductSearchResult } from "@/lib/job";
import type { QuoteLine } from "@/lib/quote-pdf";

export function Workflow({pack}:{pack:TradePack}) {
 const defaultDomains="";
 // The trade's own distributors rank first; they do not restrict the search. Measured on a Square D
 // QO120, restricting to amazon/homedepot/lowes returned four pages and no price at all, while the
 // unrestricted search priced it from two specialist breaker distributors. Preference, not exclusion.
 const defaults:JobSettings={company:"",laborRate:pack.config.laborRate,markupPercent:pack.config.markupPercent,supplierDomains:defaultDomains,preferredDomains:pack.config.allowedDomains.join(", "),region:"United States"};
 const [settings,setSettings]=useState(defaults),[showSettings,setShowSettings]=useState(false),[saved,setSaved]=useState(false);
 const [customer,setCustomer]=useState(""),[site,setSite]=useState(""),[note,setNote]=useState(""),[hours,setHours]=useState(pack.config.laborHours);
 const [phase,setPhase]=useState<WorkspacePhase>("capture");
 const [job,setJob]=useState<ParsedJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[quoteOpen,setQuoteOpen]=useState(false);
 const [searches,setSearches]=useState<Record<string,SearchState>>({}),[picks,setPicks]=useState<Record<string,PickedSource>>({});
 const [discovery,setDiscovery]=useState<Discovery|null>(null),[stage,setStage]=useState<""|"parsing"|"researching">("");
 const [packet,setPacket]=useState<ResearchPacket|null>(null),[confirmed,setConfirmed]=useState<Confirmation|null>(null);
 // The technician confirmed a repair and sourcing found nothing to buy, because there is nothing to
 // buy: an obstruction cleared, a connection remade. The research prompt asks for exactly these paths.
 const [labourOnly,setLabourOnly]=useState(false);
 /**
  * The clarifying round between the note and the search.
  *
  * `asked` is null before the note is sent and an array after, so an empty array is a real answer:
  * the note was complete and nothing needed asking. Every question accepts free text, and any of
  * them can be left blank - an unanswered question is itself information, and a technician who
  * cannot read a tag must not be stuck behind a field demanding that they do.
  */
 const [asked,setAsked]=useState<FollowUp[]|null>(null);
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [clarifying,setClarifying]=useState(false);
 const [events,setEvents]=useState<PipelineProgress[]>([]);
 const runController=useRef<AbortController|null>(null);
 const [quantities,setQuantities]=useState<Record<string,number>>({});
 // Two traces, because they have different lifetimes. The research calls belong to the job and stay
 // on screen through confirmation and every sourcing retry; the sourcing calls belong to this run and
 // start again with it. Held as one array, `discovery_complete` overwrote the research entries and the
 // panel then reported a researched job's whole-job cost as the price of its last phase alone.
 const [trace,setTrace]=useState<ExaTrace[]>([]),[researchTrace,setResearchTrace]=useState<ExaTrace[]>([]);
 const requests=useRef<Set<AbortController>>(new Set());
 const settingsKey=`fieldquote-settings-v1-${pack.id}`;
 useEffect(()=>{const pending=requests.current;const timer=setTimeout(()=>{try{const raw=localStorage.getItem(settingsKey);if(raw){const value=JSON.parse(raw);if(validAmount(value.laborRate)&&validAmount(value.markupPercent,1000)&&typeof value.company==="string"&&typeof value.supplierDomains==="string"&&typeof value.region==="string")setSettings(value);}}catch{/* Storage is optional. */}},0);return()=>{clearTimeout(timer);pending.forEach(c=>c.abort());};},[settingsKey,defaultDomains]);
 const request=async(url:string,body:object)=>{const c=new AbortController();requests.current.add(c);try{const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:c.signal});const data=await res.json();if(!res.ok)throw new Error(data.error||"Request failed. Please retry.");return data;}finally{requests.current.delete(c);}};
 const cancelResearch=()=>{runController.current?.abort();setSearches(current=>Object.fromEntries(Object.entries(current).map(([id,value])=>[id,value.loading?{...value,loading:false,error:"Search stopped. Retry this supplier search."}:value])));};
 const analyze=async(confirmation?:Confirmation,sendNote?:string)=>{
  runController.current?.abort();const c=new AbortController();runController.current=c;requests.current.add(c);
  setError("");setBusy(true);setStage("parsing");setPhase(confirmation?"act":"research");
  // Every run starts from a clean cart, so a retry can never leave two sets of candidates or two
  // priced rows behind. What it must not clear is what the technician already established: confirming
  // or retrying a sourcing run keeps the job, the research packet and the confirmation on screen.
  setDiscovery(null);setPicks({});setSearches({});setQuantities({});
  setTrace([]);
  if(confirmation){setConfirmed(confirmation);setLabourOnly(confirmation.decision?.action==="repair");}
  else{setPacket(null);setConfirmed(null);setResearchTrace([]);setEvents([]);setLabourOnly(false);}
  try{
   const response=await fetch("/api/quote-stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trade:pack.id,note:sendNote??note,
    confirmed:confirmation&&{...confirmation,equipment:job?.brief.equipment??"",manufacturer:job?.brief.manufacturer??"",
     model:job?.brief.model??"",constraints:job?.brief.constraints??[]},settings:{supplierDomains:settings.supplierDomains,region:settings.region,preferredDomains:settings.preferredDomains||""}}),signal:c.signal});
   // The parsed job is needed again when discovery lands, before React has re-rendered with it.
   let parsed:ParsedJob|null=null;
   await readEventStream(response,(event,payload)=>{
    if(c.signal.aborted)return;
    if(event==="job_parsed"){parsed=payload as ParsedJob;setJob(parsed);setHours(parsed.laborHours??pack.config.laborHours);setStage("researching");if(!parsed.brief.needsResearch)setPhase("act");}
    else if(event==="research_complete"){const found=payload as ResearchPacket;setPacket(found);setResearchTrace(found.trace||[]);}
    else if(event==="discovery_complete"){const found=payload as Discovery;setDiscovery(found);setTrace(t=>[...t,...(found.trace||[])]);setQuantities(confirmation?Object.fromEntries(found.parts.map(p=>[p.id,confirmation.quantity??1])):statedQuantities(found,parsed));setPhase("act");}
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
 /**
  * Send the observation, learn what is missing, and ask before spending a search.
  *
  * This runs the parser and nothing else - one model call, no Exa - so the questions cost nothing to
  * raise. When the note already answers everything, no card appears and the job goes straight to
  * research: the round exists to remove ambiguity, not to add a step.
  */
 const sendObservation=async()=>{
  setError("");setClarifying(true);setAsked(null);setAnswers({});
  const controller=new AbortController();requests.current.add(controller);
  try{
   const response=await fetch("/api/quote-stream",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({trade:pack.id,note,clarifyOnly:true,settings:{supplierDomains:settings.supplierDomains,region:settings.region,preferredDomains:settings.preferredDomains||""}}),signal:controller.signal});
   let parsed:ParsedJob|null=null;
   await readEventStream(response,(event,payload)=>{if(event==="job_parsed")parsed=payload as ParsedJob;});
   if(!parsed)throw new Error("The observation could not be read. Try again.");
   const job=parsed as ParsedJob;
   setJob(job);
   const questions=followUps(job.brief);
   setAsked(questions);
   if(!questions.length)await analyze(undefined,note);
  }catch(e){setError(e instanceof Error?e.message:"The observation could not be read. Try again.");}
  finally{requests.current.delete(controller);setClarifying(false);}
 };
 const launch=()=>analyze(undefined,noteWithAnswers(note,asked??[],answers));
 const appendTranscript=(text:string)=>setNote(n=>n?`${n.trim()} ${text.trim()}`:text.trim());
 return <div className="decision-workspace">
  <header className="dw-top">
   <p className="dw-eyebrow">{pack.name} workspace</p>
   <nav className="dw-steps" aria-label="Job stages">{(["capture","research","confirm","act"] as const).map((step,i)=><button key={step} aria-current={phase===step?"step":undefined} disabled={busy||inSearch||(step==="research"&&!job)||(step==="confirm"&&!packet)||(step==="act"&&!discovery)} onClick={()=>setPhase(step)}><span>{String(i+1).padStart(2,"0")}</span>{step.charAt(0).toUpperCase()+step.slice(1)}</button>)}</nav>
   <div className="dw-toolbar">{phase==="act"&&<button className="dw-button" onClick={()=>setShowSettings(true)}>Rates & suppliers</button>}</div>
  </header>
  {saved&&<p className="dw-notice" role="status">Your rates and supplier preferences are saved on this device.</p>}
  <div className={`dw-layout${phase==="act"?" dw-act":""}${phase==="capture"?" dw-solo":""}`}>
   {phase!=="capture"&&<aside className="dw-context"><p className="dw-eyebrow">Current job</p><h2>{job?.brief.equipment||`${pack.name} inspection`}</h2><p className="dw-small">{job?.brief.manufacturer||pack.name}</p>
    {job?<><dl>{[["Model",job.brief.model],["Reported",job.brief.symptoms.join("; ")],["Fault codes",job.brief.faultCodes.join(", ")],["Already checked",job.brief.alreadyChecked.join("; ")]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><details className="dw-disclosure"><summary>Original observation</summary><p>{note}</p></details><button className="dw-text-button" disabled={busy||inSearch} onClick={()=>setPhase("capture")}>Edit observation</button></>:<p className="dw-copy">Start with what you see. A part number or repair decision is not required.</p>}
    {confirmed&&<div className="dw-confirmed"><span className="dw-eyebrow">Confirmed on site</span><strong>{confirmed.component}</strong><span>{confirmed.decision?.action==="repair"?"No replacement parts":"Replacement requested"}</span></div>}
   </aside>}
   {error&&<div className="dw-error dw-error-wide" role="alert"><p>{error}</p><button className="dw-button" disabled={busy} onClick={()=>analyze(confirmed??undefined)}>{confirmed?"Retry sourcing":"Retry research"}</button><button className="dw-text-button" disabled={busy} onClick={()=>setPhase("capture")}>Edit observation</button></div>}
   {phase==="capture"&&<><section className="dw-main dw-capture"><h1>Inspection notes</h1>
    {asked===null?<>
     {/* One composer. Voice and upload are icons on it rather than modes to choose between: the
         technician is describing a machine, not picking an input method. */}
     <div className="dw-composer">
      <textarea value={note} onChange={e=>setNote(e.target.value)} disabled={clarifying||busy} rows={5} maxLength={12000}
       aria-label="Field observation"
       placeholder="The equipment and what it is doing, what you have already ruled out, and what you cannot pin down — which revision is in there, what a previous contractor changed, which kit actually fits."/>
      <div className="dw-composer-bar">
       <div className="dw-composer-tools"><InlineCapture onTranscript={appendTranscript} disabled={clarifying||busy}/></div>
       <button className="dw-send" disabled={clarifying||busy||note.trim().length<12} onClick={sendObservation}
        aria-label="Send observation">{clarifying?"Reading…":"Send"} <span aria-hidden="true">↑</span></button>
      </div>
     </div>
    </>:<>
     {/* The observation becomes the record it always was, and the gaps in it become the card. */}
     <div className="dw-said"><p className="dw-eyebrow">Your observation</p><p>{note}</p>
      <button className="dw-text-button" disabled={busy} onClick={()=>{setAsked(null);setAnswers({});}}>Edit and send again</button></div>
     {asked.length>0&&<div className="dw-followups">
      <p className="dw-eyebrow">{asked.length} {asked.length===1?"question":"questions"} before the search</p>
      <p className="dw-small">Answer what you can. Anything left blank is recorded as unknown rather than guessed.</p>
      {asked.map((f,i)=><div className="dw-followup" key={f.id}>
       <p className="dw-followup-q"><span className="dw-option-index">{String(i+1).padStart(2,"0")}</span>{f.question}</p>
       <p className="dw-small">{f.because}</p>
       {f.options.length>0&&<div className="dw-followup-options">{f.options.map(o=>
        <button key={o} type="button" aria-pressed={answers[f.id]===o} onClick={()=>setAnswers(a=>({...a,[f.id]:a[f.id]===o?"":o}))}>{o}</button>)}</div>}
       <input value={answers[f.id]&&!f.options.includes(answers[f.id])?answers[f.id]:""} maxLength={300} placeholder={f.placeholder}
        aria-label={f.question} onChange={e=>setAnswers(a=>({...a,[f.id]:e.target.value}))}/>
      </div>)}
     </div>}
     <div className="dw-action-bar"><span className="dw-small">{Object.values(answers).some(v=>v.trim())?"":"You can run the search without answering."}</span>
      <button className="dw-button dw-launch" disabled={busy} onClick={launch}>{busy?"Powering up Exa search…":"Power up Exa search"} <span aria-hidden="true">→</span></button></div>
    </>}
   </section></>}
   {phase==="research"&&!packet&&!discovery&&<section className="dw-main"><p className="dw-status">{busy?"Research in progress":"Research paused"}</p><h1>{stage==="parsing"?"Understanding the observation.":"Reading the equipment documentation."}</h1><div className="dw-focus" role="status"><span className="pulse-dot"/><p>{researchMessage||"Identifying the equipment and the questions to research."}</p></div><p className="dw-small">Evidence will appear here automatically. Nothing is ordered or selected.</p>{busy&&<button className="dw-text-button" onClick={cancelResearch}>Stop research</button>}</section>}
   {packet&&<DecisionResearch brief={job!.brief} packet={packet} phase={phase} onPhase={setPhase} onConfirm={c=>analyze(c)} onEdit={()=>setPhase("capture")} busy={busy}/>}
   {phase==="act"&&<section className="dw-main"><p className="dw-status">{confirmed?.decision?.action==="repair"?"Repair confirmed · No parts required":busy?"Finding supplier evidence":"Supplier comparison"}</p><h1>{confirmed?.decision?.action==="repair"?"Quote the work performed.":"Choose the right part and supplier."}</h1>
    {confirmed&&<p className="dw-copy">{confirmed.component} · {confirmed.quantity??1} required</p>}
    {!discovery&&<div className="dw-focus" role="status"><p>{events.at(-1)?.message||"Resolving the confirmed component and checking suppliers…"}</p></div>}
    {discovery&&<div>
     {discovery.parts.length===0&&<div className="dw-focus"><h2>{labourOnly?"No supplier search needed.":"No supported part found yet."}</h2><p>{labourOnly?"Set the labor for this visit in the estimate.":"Add an identifier or retry sourcing. No part found does not mean no part is required."}</p></div>}
     <PartsCart discovery={discovery} searches={searches} picks={picks} quantities={quantities}
      onPick={(id,pick)=>setPicks(s=>{const next={...s};if(pick){const target=discovery.parts.find(p=>p.id===id);for(const other of discovery.parts)if(other.id!==id&&other.partIds.some(fault=>target?.partIds.includes(fault)))delete next[other.id];next[id]=pick;}else delete next[id];return next;})}
      onQuantity={(id,value)=>setQuantities(q=>({...q,[id]:value}))} onRemove={dropResolved} onRetry={findSources} busy={busy} faultLabel={labelFor}/>
     {discovery.unresolved.length>0&&<details className="dw-disclosure"><summary>{discovery.unresolved.length} unconfirmed items</summary><ul>{discovery.unresolved.map(u=><li key={u.partId}>{labelFor(u.partId)} — {u.reason}</li>)}</ul></details>}
     {(discovery.superseded?.length??0)>0&&<details className="dw-disclosure"><summary>Work covered by another line</summary><ul>{discovery.superseded!.map(sup=><li key={sup.partId}>{labelFor(sup.partId)} — {sup.reason}</li>)}</ul></details>}
     {!labourOnly&&<button className="dw-text-button" onClick={research} disabled={busy||inSearch}>Research parts again</button>}
    </div>}
    {packet&&<button className="dw-text-button" disabled={busy} onClick={()=>setPhase("research")}>Back to research & confirmation</button>}
   </section>}
   {phase==="act"&&discovery&&(discovery.parts.length>0||nothingToSource)&&<aside className="estimate-panel dw-estimate"><header><span className="micro-label">YOUR ESTIMATE</span></header><div className="estimate-body"><div className="estimate-who"><label>Customer<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Who is this for?" maxLength={120}/></label><label>Site<input value={site} onChange={e=>setSite(e.target.value)} placeholder="Address or work order" maxLength={180}/></label></div><p className="estimate-zone" data-zone="external">Researched externally <span>part, supplier and public price</span></p><div className="estimate-lines">{nothingToSource?<label className="labour-only"><input type="checkbox" checked={labourOnly} onChange={e=>setLabourOnly(e.target.checked)}/><span>This repair needs no replacement part. Quote labour only.</span></label>:!lines.length?<p className="empty-message">Your selected parts will appear here.</p>:lines.map(line=>{const pick=picks[line.part.id];return <div className="estimate-line" key={line.part.id}><strong>{line.part.discovery.name}</strong><a href={pick.source.url} target="_blank" rel="noopener noreferrer">{pick.source.domain} ↗</a><label>Unit cost (USD)<input aria-label={`Unit cost for ${line.part.discovery.name}`} type="number" min="0" max="100000" step=".01" value={pick.price} onChange={e=>setPicks(s=>({...s,[line.part.id]:{...s[line.part.id],price:Number(e.target.value),confirmed:false}}))}/></label><div className="line-extension"><span>{line.qty} × {money(pick.price)}</span><strong>{money(line.qty*pick.price)}</strong></div>{pick.price!==pick.source.price&&<small>Manually entered price — confirm against source.</small>}{pick.source.packQuantity==null?<small>Page did not state a pack size. Confirm this is the price for one.</small>:pick.source.packQuantity>1?<small>Page sells a pack of {pick.source.packQuantity} — set the unit cost.</small>:null}<label className="confirm-source"><input type="checkbox" checked={pick.confirmed} onChange={e=>setPicks(s=>({...s,[line.part.id]:{...s[line.part.id],confirmed:e.target.checked}}))}/><span>I checked fit, pack quantity, and price.</span></label></div>;})}</div>
   <p className="estimate-zone" data-zone="shop">Your shop&apos;s rates <span>never taken from the web</span></p><div className="pricing-inputs"><label>{job?.laborRange?"Labor hours":"Shop default hours, editable"}{job?.laborRange&&<span className="stated-range">{job.laborRange.min===job.laborRange.max?`note says ${job.laborRange.min} hr`:`note says ${job.laborRange.min}–${job.laborRange.max} hr`}</span>}<input type="number" min="0" max="1000" step=".25" value={hours} onChange={e=>setHours(Number(e.target.value))}/></label><label>Hourly rate ($)<input type="number" min="0" max="100000" step=".01" value={settings.laborRate} onChange={e=>setSettings(s=>({...s,laborRate:Number(e.target.value)}))}/></label><label>Parts markup (%)<input type="number" min="0" max="1000" step=".1" value={settings.markupPercent} onChange={e=>setSettings(s=>({...s,markupPercent:Number(e.target.value)}))}/></label></div><p className="estimate-zone" data-zone="customer">The customer&apos;s quote <span>parts, markup and labour</span></p><dl className="estimate-totals"><div><dt>Parts</dt><dd>{money(quote.partsSubtotal)}</dd></div><div><dt>Parts markup</dt><dd>{money(quote.markup)}</dd></div><div><dt>Labor</dt><dd>{money(quote.labor)}</dd></div><div className="estimate-grand"><dt>Estimated total</dt><dd>{money(quote.total)}</dd></div></dl><button className="primary-button" disabled={!canPrint} onClick={()=>setQuoteOpen(true)}>Review quote <span aria-hidden="true">→</span></button><p className="estimate-hint">{!customer.trim()?"Add a customer name to create your estimate.":work?hours>0?"Ready to print a labour-only estimate. It will state that no replacement part was required.":"Set the hours for this visit to print a labour-only estimate.":!allConfirmed?nothingToSource?"Nothing was found to buy. Tick the box above if this repair needs no part, or retry the sourcing.":"Choose candidates and confirm their fit and price before printing.":exclusions.length?`Ready to print. ${exclusions.length} reported ${exclusions.length===1?"item is":"items are"} not priced here and will be listed on the estimate as not included.`:"Ready to review and download as PDF."}</p>{fullTrace.length>0&&<ExaRunTrace trace={fullTrace}/>}<p className="estimate-footnote">Tax and shipping excluded. Check the supplier page before ordering. Markup applies to parts only.</p></div></aside>}
  </div>
  {packet&&<footer className="dw-footer"><span>{packet.sources.length} sources retained</span></footer>}
  {showSettings&&<SettingsDialog initial={settings} trade={pack.name} onClose={()=>setShowSettings(false)} onSave={value=>{setSettings(value);setShowSettings(false);try{localStorage.setItem(settingsKey,JSON.stringify(value));setSaved(true);}catch{setError("Settings apply to this job, but browser storage is unavailable.");}}}/>}
  {quoteOpen&&<ReceiptPrinter pack={quotePack} lines={lines} quote={quote} company={settings.company} exclusions={exclusions} work={work} onClose={()=>setQuoteOpen(false)}/>}
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
