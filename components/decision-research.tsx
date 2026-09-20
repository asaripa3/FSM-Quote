"use client";
import { useState } from "react";
import { confirmDecision, decisionGate, type DecisionDraft } from "@/lib/confirmation";
import type { Brief, Confirmation, ResearchPacket, ResearchSource } from "@/lib/job";

export type WorkspacePhase = "capture" | "research" | "confirm" | "act";
const MATCH = {exact:"Exact model",family:"Model family only",manufacturer:"Manufacturer only",none:"Model not established"};
const KIND = {oem:"Manufacturer",mirror:"Mirrored manual",distributor:"Distributor",practitioner:"Practitioner",forum:"Community",unknown:"Unverified publisher"};

export function EvidencePanel({packet, pathIndex}:{packet:ResearchPacket;pathIndex:number}) {
 const [expanded,setExpanded]=useState<string|null>(null);
 const path=packet.repairPaths[pathIndex];
 const supporting=path?.sourceUrls?.length?packet.sources.filter(s=>path.sourceUrls.includes(s.url)):packet.sources;
 const sources=supporting.length?supporting:packet.sources;
 const row=(s:ResearchSource)=><article className="dw-source" key={s.url}>
  <button className="dw-source-button" aria-expanded={expanded===s.url} onClick={()=>setExpanded(expanded===s.url?null:s.url)}><span>{s.title}</span><span aria-hidden="true">{expanded===s.url?"−":"+"}</span></button>
  <p>{KIND[s.kind]} · {MATCH[s.match]}</p>
  {expanded===s.url&&<div className="dw-source-detail"><blockquote>{s.highlight||"No excerpt available."}</blockquote><a href={s.url} target="_blank" rel="noopener noreferrer">Open {s.domain} ↗</a></div>}
 </article>;
 return <aside className="dw-inspector" aria-label="Supporting evidence"><p className="dw-eyebrow">Supporting evidence</p><h2>{path?"Why this path?":"What the sources establish"}</h2>
  {path?<><p className="dw-copy">{path.rationale}</p>{path.support&&<details className="dw-disclosure"><summary>Supporting excerpt</summary><blockquote>{path.support}</blockquote></details>}</>:<p className="dw-copy">Sources for this job. Open a source to inspect its excerpt and model coverage.</p>}
  {sources.slice(0,3).map(row)}
  {sources.length>3&&<details className="dw-disclosure"><summary>{sources.length-3} more sources</summary>{sources.slice(3).map(row)}</details>}
  {!sources.length&&<p className="dw-copy">No readable sources were returned. A lack of results does not establish a diagnosis.</p>}
  {packet.fieldSourcesUnavailable&&<p className="dw-small">Field sources could not be retrieved. The available documentation is shown above.</p>}
 </aside>;
}

export function DecisionResearch({brief,packet,phase,onPhase,onConfirm,onEdit,busy}:{brief:Brief;packet:ResearchPacket;phase:WorkspacePhase;onPhase:(phase:WorkspacePhase)=>void;onConfirm:(c:Confirmation)=>void;onEdit:()=>void;busy:boolean}) {
 const [view,setView]=useState<"check"|"map">("check");
 const [selected,setSelected]=useState(-1),[result,setResult]=useState<DecisionDraft["result"]>("");
 const [action,setAction]=useState<DecisionDraft["action"]>("replace"),[component,setComponent]=useState("");
 const [notes,setNotes]=useState(""),[quantity,setQuantity]=useState(1),[error,setError]=useState("");
 const path=packet.repairPaths[selected];
 const choose=(index:number)=>{setSelected(index);setResult("");setError("");
  setComponent((packet.repairPaths[index]?.confirmBy??"").trim()?"":packet.repairPaths[index]?.component??"");};
 const {other,unchecked,component:confirmedComponent,check,quantity:counted,blocker,ready}=
  decisionGate({path,selected,pathCount:packet.repairPaths.length,typedComponent:component,result,notes,quantity,action});
 const submit=()=>{try{onConfirm(confirmDecision({action,component:confirmedComponent,check,result,notes,quantity:counted,sourceUrls:path?.sourceUrls||[]},brief));}catch(e){setError(e instanceof Error?e.message:"Review the confirmation.");}};
 if(phase!=="research"&&phase!=="confirm")return null;
 return <><section className="dw-main" aria-label={phase==="research"?"Research decision":"Confirm repair"}>
 {phase==="research"?<>
  <p className="dw-status">{packet.documentationUnavailable?"More information needed":packet.contradicts?"Reported fault needs checking":"Research ready · Repair not confirmed"}</p>
  <h1>{packet.documentationUnavailable?"No readable documentation found.":packet.contradicts?"Verify the reported fault first.":"Check the evidence. Then make the call."}</h1>
  {packet.contradicts?<div className="dw-alert"><p>{packet.contradicts}</p><details><summary>Read the supporting evidence</summary><blockquote>{packet.contradictsSupport}</blockquote>{packet.contradictsSourceUrls.map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname} ↗</a>)}</details></div>:<details className="dw-disclosure"><summary>Research summary</summary><p>{packet.evidenceSummary||"The available evidence did not settle the reported issue."}</p></details>}
  <div className="dw-tabs" role="group" aria-label="Research view"><button aria-pressed={view==="check"} onClick={()=>setView("check")}>Next check</button><button aria-pressed={view==="map"} onClick={()=>setView("map")}>Evidence map</button></div>
  {view==="check"?<section className="dw-focus"><div className="dw-eyebrow">Before replacing anything</div><h2>{packet.checkBeforeReplacing[0]||"Establish the equipment model and the actual fault."}</h2>
   {packet.checkBeforeReplacing.length>1&&<details className="dw-disclosure"><summary>{packet.checkBeforeReplacing.length-1} additional checks</summary><ol>{packet.checkBeforeReplacing.slice(1).map((c,i)=><li key={i}>{c}</li>)}</ol></details>}
  </section>:<div className="dw-map" aria-label="Observations and possible repair paths"><div className="dw-node"><span className="dw-eyebrow">Reported observation</span><strong>{brief.symptoms.join("; ")||brief.equipment}</strong></div><div className="dw-connector"/><div className="dw-node"><span className="dw-eyebrow">Verify on site</span><strong>{packet.checkBeforeReplacing[0]||"Identify equipment and fault"}</strong></div><div className="dw-connector"/><div className="dw-branches">{packet.repairPaths.length?packet.repairPaths.map((p,i)=><button key={i} aria-pressed={selected===i} onClick={()=>choose(i)}><span>{p.component}</span><small>Possible path · Not confirmed</small></button>):<p>No supported replacement path yet.</p>}</div></div>}
  <div className="dw-section-heading"><h2>Possible repair paths</h2><span>{packet.repairPaths.length} supported</span></div>
  <p className="dw-small">Select a path to inspect its evidence. Selection does not confirm a diagnosis.</p>
  <div className="dw-options">{packet.repairPaths.map((p,i)=><button key={i} className="dw-option" aria-pressed={selected===i} onClick={()=>choose(i)}><span className="dw-option-index">{String(i+1).padStart(2,"0")}</span><span><strong>{p.component}</strong><small>{p.evidenceLevel==="oem"?"Manufacturer documentation":p.evidenceLevel==="documented"?"Mirrored service documentation":p.evidenceLevel==="corroborated"?"Multiple supporting sources":"Field evidence only"}</small></span><span aria-hidden="true">→</span></button>)}</div>
  <button className="dw-text-button" onClick={()=>{choose(-2);onPhase("confirm");}}>I confirmed a different finding</button>
  <div className="dw-action-bar"><button className="dw-button" onClick={onEdit} disabled={busy}>Still unresolved · Add observations</button><button className="dw-button dw-primary" disabled={busy||selected<0} onClick={()=>onPhase("confirm")}>Record check result <span aria-hidden="true">→</span></button></div>
 </>:<>
  <p className="dw-status">Technician confirmation</p><h1>What did your check establish?</h1><p className="dw-copy">Your decision controls what happens next. Notes remain attached to that decision.</p>
  <div className="dw-focus"><p className="dw-eyebrow">{unchecked?"Documented path · no stated check":other?"Independent finding":"Selected path"}</p><h2>{unchecked?path!.component:other?"A different issue found on site":path?.component||"Choose a repair path"}</h2>
   {other?<>{unchecked&&<p className="dw-check-prompt">The documentation names this component but states no test for it. Describe the check you performed, so the decision carries the reason it was made.</p>}<label className="dw-label">Component or work confirmed<input value={component} onChange={e=>setComponent(e.target.value)} maxLength={200} placeholder="Name the component or work you verified"/></label><label className="dw-label">What your inspection established<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} maxLength={600} placeholder="Record the test and observed result"/></label><label className="dw-check"><input type="checkbox" checked={result==="different"} onChange={e=>setResult(e.target.checked?"different":"")}/>I confirmed this finding on site.</label></>:<><p className="dw-check-prompt">{check||"This path has no confirmation check. Record an independent finding instead."}</p><fieldset className="dw-result"><legend>Check result</legend>{([["supports","Supports this repair"],["ruled-out","Rules this out"],["unsure","Not yet conclusive"]] as const).map(([id,label])=><label key={id} data-selected={result===id}><input type="radio" name="check-result" value={id} checked={result===id} onChange={()=>setResult(id)}/>{label}</label>)}</fieldset>
   {(result==="ruled-out"||result==="unsure")&&<p className="dw-warning">No part will be sourced. Return to the evidence or record a different confirmed finding.</p>}
   <details className="dw-disclosure"><summary>Add observations or measurements (optional)</summary><label className="dw-label">On-site observations<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} maxLength={600}/></label></details></>}
  </div>
  <fieldset className="dw-result"><legend>Confirmed action</legend><label data-selected={action==="replace"}><input type="radio" name="repair-action" checked={action==="replace"} onChange={()=>setAction("replace")}/>Replace a component</label><label data-selected={action==="repair"}><input type="radio" name="repair-action" checked={action==="repair"} onChange={()=>setAction("repair")}/>Repair without replacement parts</label></fieldset>
  {action==="replace"&&<label className="dw-label dw-quantity">Quantity<input type="number" min={1} max={999} step={1} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>}
  {error&&<p className="dw-error" role="alert">{error}</p>}
  <div className="dw-action-bar"><button className="dw-button" disabled={busy} onClick={()=>onPhase("research")}>Back to evidence</button>{!busy&&blocker&&<p className="dw-small">{blocker}</p>}<button className="dw-button dw-primary" disabled={busy||!ready} onClick={submit}>{busy?"Continuing…":action==="repair"?"Confirm repair · Quote labor":"Confirm replacement · Find suppliers"}<span aria-hidden="true">→</span></button></div>
 </>}
 </section><EvidencePanel packet={packet} pathIndex={selected}/></>;
}
