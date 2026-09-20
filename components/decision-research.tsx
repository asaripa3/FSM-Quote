"use client";
import { useEffect, useRef, useState } from "react";
import { confirmDecision, decisionGate, type DecisionDraft } from "@/lib/confirmation";
import type { Brief, Confirmation, ResearchPacket, ResearchSource } from "@/lib/job";

export type WorkspacePhase = "capture" | "research" | "confirm" | "act";
const MATCH = {exact:"Exact model",family:"Model family only",manufacturer:"Manufacturer only",none:"Model not established"};
/** Where the support was found, said plainly. Matches the legend colours in the rail. */
const LEVEL_LABEL = {oem:"Manufacturer documentation",documented:"Service documentation, mirrored host",corroborated:"Two sources agree",field_only:"Field evidence only"} as const;
const KIND = {oem:"Manufacturer",mirror:"Mirrored manual",distributor:"Distributor",practitioner:"Practitioner",forum:"Community",unknown:"Unverified publisher"};

/**
 * The cited page itself, opened in the app.
 *
 * An answer is worth what the page behind it is worth, and a technician who cannot see the page is
 * taking the same on-faith answer a chatbot gives. Service manuals carry the part of the evidence
 * prose cannot: the flash-code table, the wiring diagram, the exploded parts view.
 *
 * Only hosts that agreed to be framed reach here - the server asked them - so this never renders a
 * blank panel and calls it documentation. Everything else keeps its link out.
 */
function SourceViewer({source, quote, onClose}:{source:ResearchSource;quote?:string;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 // A frame's load event fires whether it painted the manual or a refusal, so it cannot be trusted to
 // report success. The panel says what it is doing, and after a few seconds says plainly that the
 // host is slow to embed and offers the page directly. A blank rectangle presented as documentation
 // is the failure this whole feature exists to avoid.
 const [slow,setSlow]=useState(false);
 useEffect(()=>{const d=ref.current;const focused=document.activeElement as HTMLElement|null;d?.showModal();
  const timer=setTimeout(()=>setSlow(true),6000);
  return()=>{clearTimeout(timer);d?.close();focused?.focus();};},[]);
 return <dialog ref={ref} className="dw-viewer" aria-label={`Source: ${source.title}`} onCancel={onClose}
   onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <header><div><p className="dw-eyebrow">{KIND[source.kind]} · {MATCH[source.match]}</p><h2>{source.title}</h2></div>
   <div><a className="dw-button" href={source.url} target="_blank" rel="noopener noreferrer">Open on {source.domain} ↗</a>
   <button className="dw-button" onClick={onClose} aria-label="Close source">Close</button></div></header>
  {quote&&<blockquote className="dw-viewer-quote">{quote}</blockquote>}
  <div className="dw-viewer-frame">
   <p className="dw-viewer-state" aria-live="polite">{slow
     ? <>This page is slow to embed. <a href={source.url} target="_blank" rel="noopener noreferrer">Open it on {source.domain} ↗</a></>
     : <>Loading the page from {source.domain}…</>}</p>
   <iframe src={source.url} title={source.title} referrerPolicy="no-referrer"/>
  </div>
 </dialog>;
}

export function EvidencePanel({packet, pathIndex}:{packet:ResearchPacket;pathIndex:number}) {
 const [expanded,setExpanded]=useState<string|null>(null),[viewing,setViewing]=useState<ResearchSource|null>(null);
 const path=packet.repairPaths[pathIndex];
 const supporting=path?.sourceUrls?.length?packet.sources.filter(s=>path.sourceUrls.includes(s.url)):packet.sources;
 const sources=supporting.length?supporting:packet.sources;
 const row=(s:ResearchSource)=><article className="dw-source" key={s.url}>
  <button className="dw-source-button" aria-expanded={expanded===s.url} onClick={()=>setExpanded(expanded===s.url?null:s.url)}><span>{s.title}</span><span aria-hidden="true">{expanded===s.url?"−":"+"}</span></button>
  <p>{KIND[s.kind]} · {MATCH[s.match]}</p>
  {expanded===s.url&&<div className="dw-source-detail"><blockquote>{s.highlight||"No excerpt available."}</blockquote>
   {s.viewable&&<button className="dw-text-button" onClick={()=>setViewing(s)}>Read this page in the app ⤢</button>}
   <a href={s.url} target="_blank" rel="noopener noreferrer">Open {s.domain} ↗</a></div>}
 </article>;
 // Documents the technician can actually open, best match first. This is the part of the retrieval
 // worth leading with: everything else in this panel is description of a page, this is the page.
 const readable=packet.sources.filter(s=>s.viewable);
 // The maker's own site and the distributors that sell for this plate. Named separately because
 // "who publishes this" is the question the whole product turns on.
 const official=packet.sources.filter(s=>s.kind==="oem"||s.kind==="distributor");
 return <aside className="dw-inspector" aria-label="Supporting evidence">
  <EvidenceState packet={packet}/>
  {readable.length>0&&<section className="dw-read">
   <p className="dw-eyebrow">Read the source</p>
   {readable.map(s=><button key={s.url} className="dw-read-open" onClick={()=>setViewing(s)}>
    <span><strong>{s.title}</strong><small>{KIND[s.kind]} · {MATCH[s.match]}</small></span><span aria-hidden="true">⤢</span></button>)}
  </section>}
  {official.length>0&&<section className="dw-official">
   <p className="dw-eyebrow">Manufacturer and supplier pages</p>
   {official.map(s=><a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.domain}<small>{KIND[s.kind]} · {MATCH[s.match]}</small></a>)}
  </section>}
  {viewing&&<SourceViewer source={viewing} quote={viewing.highlight} onClose={()=>setViewing(null)}/>}
  <p className="dw-eyebrow">{path?"The pages behind this component":"Sources, best fit first"}</p>
  {path&&<><p className="dw-copy">{path.rationale}</p>{path.support&&<details className="dw-disclosure"><summary>Supporting excerpt</summary><blockquote>{path.support}</blockquote></details>}</>}
  {sources.slice(0,3).map(row)}
  {sources.length>3&&<details className="dw-disclosure"><summary>{sources.length-3} more sources</summary>{sources.slice(3).map(row)}</details>}
  {!sources.length&&<p className="dw-copy">No readable sources were returned. A lack of results does not establish a diagnosis.</p>}
  {packet.fieldSourcesUnavailable&&<p className="dw-small">Field sources could not be retrieved. The available documentation is shown above.</p>}
 </aside>;
}

/**
 * What the retrieval established, stated as the answer rather than buried as source metadata.
 *
 * This is the product's actual output. A component list is one thing evidence can yield and often
 * not the most useful one: on the Carrier job the strongest result was that the reported fault code
 * does not exist for this unit, and no repair path could have said that. Leading with a numbered
 * list of components turns a research tool into an automatic mechanic, which raises the safety
 * burden, invites a correctness argument we should not be having, and competes with a chatbot on a
 * chatbot's own ground. Grading what was retrieved against this plate is the thing a chatbot cannot
 * do, so it goes first.
 */
function EvidenceState({packet}:{packet:ResearchPacket}) {
 const lines=[
  {tone:"exact",  label:"Exact model sources",     count:packet.sources.filter(s=>s.match==="exact").length},
  {tone:"family", label:"Model family sources",    count:packet.sources.filter(s=>s.match==="family").length},
  {tone:"maker",  label:"Manufacturer website",    count:packet.sources.filter(s=>s.kind==="oem").length},
  {tone:"supply", label:"Supplier pages",          count:packet.sources.filter(s=>s.kind==="distributor").length},
  {tone:"public", label:"Equipment public sources",count:packet.sources.filter(s=>s.match==="manufacturer"||s.match==="none").length},
 ].filter(l=>l.count>0);
 if(!lines.length) return null;
 return <section className="dw-established">
  <p className="dw-eyebrow">What the evidence establishes</p>
  <ul className="dw-legend">{lines.map(l=>
   <li key={l.tone} data-tone={l.tone}><span className="dw-swatch" aria-hidden="true"/>{l.label}<b>{l.count}</b></li>)}</ul>
 </section>;
}

/** The passage with the verified sentence marked, so the eye lands on the span that was checked. */
function splitOnQuote(text: string, quote: string) {
 const at = quote ? text.indexOf(quote) : -1;
 if (at < 0) return text;
 return <>{text.slice(0, at)}<mark>{text.slice(at, at + quote.length)}</mark>{text.slice(at + quote.length)}</>;
}

export function DecisionResearch({brief,packet,phase,onPhase,onConfirm,onEdit,busy}:{brief:Brief;packet:ResearchPacket;phase:WorkspacePhase;onPhase:(phase:WorkspacePhase)=>void;onConfirm:(c:Confirmation)=>void;onEdit:()=>void;busy:boolean}) {
 const [selected,setSelected]=useState(-1),[result,setResult]=useState<DecisionDraft["result"]>("");
 const [action,setAction]=useState<DecisionDraft["action"]>("replace"),[component,setComponent]=useState("");
 const [notes,setNotes]=useState(""),[quantity,setQuantity]=useState(1),[error,setError]=useState("");
 const [viewing,setViewing]=useState<ResearchSource|null>(null);
 /**
  * Which document the answer is being read out of.
  *
  * A plate can be covered by several documents that do not say the same thing - a 48TC ships with
  * either the IGC or the RTU-MP control, and their fault tables differ - so "what does the
  * documentation say" is an ambiguous question until someone says which documentation. The
  * technician is the only one who can see the board, so they answer it.
  *
  * Offered beside the answer rather than in front of it. Asking first would stall on a question the
  * evidence usually settles on its own; asking beside it makes the correction one click.
  */
 const paths=packet.repairPaths.map((p,i)=>({p,i}));
 const path=packet.repairPaths[selected];
 const choose=(index:number)=>{setSelected(selected===index?-1:index);setResult("");setError("");
  setComponent((packet.repairPaths[index]?.confirmBy??"").trim()?"":packet.repairPaths[index]?.component??"");};
 const {other,unchecked,component:confirmedComponent,check,quantity:counted,blocker,ready}=
  decisionGate({path,selected,pathCount:packet.repairPaths.length,typedComponent:component,result,notes,quantity,action});
 const submit=()=>{try{onConfirm(confirmDecision({action,component:confirmedComponent,check,result,notes,quantity:counted,sourceUrls:path?.sourceUrls||[]},brief));}catch(e){setError(e instanceof Error?e.message:"Review the confirmation.");}};
 if(phase!=="research"&&phase!=="confirm")return null;
 return <><section className="dw-main" aria-label={phase==="research"?"Research decision":"Confirm repair"}>
 {phase==="research"?<>
  <h1>{packet.documentationUnavailable?"No readable documentation found.":packet.contradicts?"Verify the reported fault first.":"Here is what the evidence establishes."}</h1>
  {packet.contradicts&&<div className="dw-alert"><p>{packet.contradicts}</p><details><summary>Read the supporting evidence</summary><blockquote>{packet.contradictsSupport}</blockquote>{packet.contradictsSourceUrls.map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname} ↗</a>)}</details></div>}
  <p className="dw-summary">{packet.evidenceSummary||"The available evidence did not settle the reported issue."}</p>
  {packet.checkBeforeReplacing.length>0&&<section className="dw-checks">
   <h2>Diagnose further with</h2>
   <ol>{packet.checkBeforeReplacing.map((c,i)=><li key={i}>{c}</li>)}</ol>
  </section>}
  <div className="dw-section-heading"><h2>Components the documentation associates with this failure</h2><span/></div>
  {!packet.repairPaths.length&&<p className="dw-small">No component was named by a page that could be quoted for it. That is a result, not a gap: the evidence above stands on its own, and the check comes before any part.</p>}
  <div className="dw-components">{paths.map(({p,i})=>
   <article key={i} className="dw-component" aria-current={selected===i||undefined}>
    <header>
     <div><strong>{p.component}</strong>
      <em data-level={p.evidenceLevel}>{LEVEL_LABEL[p.evidenceLevel]}</em></div>
     <button className="dw-button" aria-pressed={selected===i} onClick={()=>choose(i)}>{selected===i?"Selected":"Select"}</button>
    </header>
    {p.rationale&&<p className="dw-copy">{p.rationale}</p>}
    {p.passage
     ? <figure className="dw-passage">
        <figcaption>{[p.source?.domain,p.passage.section,`${p.passage.positionPct}% through the document`].filter(Boolean).join(" · ")}</figcaption>
        <div className="dw-passage-text">{splitOnQuote(p.passage.text,p.passage.quote)}</div>
        {p.source&&<div className="dw-passage-actions">
         {p.source.viewable&&<button className="dw-text-button" onClick={()=>setViewing({url:p.source!.url,title:p.source!.title,domain:p.source!.domain,highlight:p.passage!.quote,kind:"mirror",match:"family",strength:"corroborating",viewable:true})}>Read this document in the app ⤢</button>}
         <a href={p.source.url} target="_blank" rel="noopener noreferrer">{p.source.title}</a>
        </div>}
       </figure>
     : p.support&&<blockquote className="dw-passage-quote">{p.support}<cite>{p.source?.domain}</cite></blockquote>}
    {p.confirmBy&&<p className="dw-small">Settles it on site: {p.confirmBy}</p>}
   </article>)}</div>
  <button className="dw-text-button" onClick={()=>{choose(-2);onPhase("confirm");}}>My inspection found something else</button>
  <div className="dw-action-bar"><button className="dw-button" onClick={onEdit} disabled={busy}>Still unresolved · Add observations</button><button className="dw-button dw-primary" disabled={busy||selected<0} onClick={()=>onPhase("confirm")}>Record check result <span aria-hidden="true">→</span></button></div>
 </>:<>
  <p className="dw-status">Technician confirmation</p><h1>What did your check establish?</h1><p className="dw-copy">Your decision controls what happens next. Notes remain attached to that decision.</p>
  <div className="dw-focus"><p className="dw-eyebrow">{unchecked?"Documented component · no stated check":other?"Your own finding":"Component you are confirming"}</p><h2>{unchecked?path!.component:other?"A finding from your own inspection":path?.component||"What you established on site"}</h2>
   {other?<>{unchecked&&<p className="dw-check-prompt">The documentation names this component but states no test for it. Describe the check you performed, so the decision carries the reason it was made.</p>}<label className="dw-label">Component or work confirmed<input value={component} onChange={e=>setComponent(e.target.value)} maxLength={200} placeholder="Name the component or work you verified"/></label><label className="dw-label">What your inspection established<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} maxLength={600} placeholder="Record the test and observed result"/></label><label className="dw-check"><input type="checkbox" checked={result==="different"} onChange={e=>setResult(e.target.checked?"different":"")}/>I confirmed this finding on site.</label></>:<><p className="dw-check-prompt">{check||"This path has no confirmation check. Record an independent finding instead."}</p><fieldset className="dw-result"><legend>Check result</legend>{([["supports","Supports this repair"],["ruled-out","Rules this out"],["unsure","Not yet conclusive"]] as const).map(([id,label])=><label key={id} data-selected={result===id}><input type="radio" name="check-result" value={id} checked={result===id} onChange={()=>setResult(id)}/>{label}</label>)}</fieldset>
   {(result==="ruled-out"||result==="unsure")&&<p className="dw-warning">No part will be sourced. Return to the evidence or record a different confirmed finding.</p>}
   <details className="dw-disclosure"><summary>Add observations or measurements (optional)</summary><label className="dw-label">On-site observations<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} maxLength={600}/></label></details></>}
  </div>
  <fieldset className="dw-result"><legend>Confirmed action</legend><label data-selected={action==="replace"}><input type="radio" name="repair-action" checked={action==="replace"} onChange={()=>setAction("replace")}/>Replace a component</label><label data-selected={action==="repair"}><input type="radio" name="repair-action" checked={action==="repair"} onChange={()=>setAction("repair")}/>Repair without replacement parts</label></fieldset>
  {action==="replace"&&<label className="dw-label dw-quantity">Quantity<input type="number" min={1} max={999} step={1} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>}
  {error&&<p className="dw-error" role="alert">{error}</p>}
  <div className="dw-action-bar"><button className="dw-button" disabled={busy} onClick={()=>onPhase("research")}>Back to evidence</button>{!busy&&blocker&&<p className="dw-small">{blocker}</p>}<button className="dw-button dw-primary" disabled={busy||!ready} onClick={submit}>{busy?"Continuing…":action==="repair"?"Confirm repair · Quote labor":"Confirm replacement · Find suppliers"}<span aria-hidden="true">→</span></button></div>
 </>}
 {viewing&&<SourceViewer source={viewing} quote={viewing.highlight} onClose={()=>setViewing(null)}/>}
 </section><EvidencePanel packet={packet} pathIndex={selected}/></>;
}
