"use client";
import type { ExaTrace, PipelineProgress, Routes } from "@/lib/job";

/**
 * How each reported item was routed. The pipeline decides between four destinations and the panel
 * used to name two of them, so a job whose only item was a named tool reported nothing at all while
 * the trace underneath it listed the searches that tool had caused.
 */
const ROUTE_LABELS: [keyof Routes, string, string, string][] = [
  ["exact", "exact part request", "exact part requests", "product search"],
  ["registry", "description resolved before", "descriptions resolved before", "priced without researching again"],
  ["sourced", "item the technician named", "items the technician named", "product search"],
  ["tools", "named item without a model", "named items without a model", "Exa finds one to buy"],
  ["ambiguous", "uncertain description", "uncertain descriptions", "Exa discovery"],
  ["superseded", "item covered by another line", "items covered by another line", "not quoted twice"],
];
export function ExaResearch({events,trace,busy,routes,onCancel}:{events:PipelineProgress[];trace:ExaTrace[];busy:boolean;routes:Routes|null;onCancel:()=>void}) {
 const last=events.at(-1);
 return <section className="exa-research" aria-label="Live Exa research">
  <header><div><span className="exa-tag">EXA</span><h2>{busy?"Researching your repair":"Your research trail"}</h2></div>{busy&&<button onClick={onCancel}>Stop research</button>}</header>
  <p className="research-status" role="status">{last?.message||"Connecting to the research pipeline…"}</p>
  {routes&&<div className="research-routes">{ROUTE_LABELS.filter(([key])=>routes[key]>0).map(([key,one,many,destination])=>
   <span key={key}><b>{routes[key]}</b> {routes[key]===1?one:many} → {destination}</span>)}
   {ROUTE_LABELS.every(([key])=>routes[key]===0)&&<span>Nothing to research on this note.</span>}</div>}
  <details open={busy}><summary>Follow the actual search steps <span>{events.length} updates · {trace.length} Exa calls</span></summary><ol>{events.map((event,i)=><li key={i}><span>{event.stage.replaceAll("_"," ")}</span><p>{event.message}</p>{event.partId&&<small>{event.partId}</small>}</li>)}</ol></details>
  {trace.length>0&&<details><summary>Queries, sources and API usage</summary><div className="research-calls">{trace.map((call,i)=><article key={i}><strong>{call.step}</strong><code>{call.endpoint} · {call.searchType}</code><p>{call.query}</p><small>{call.results} results · {(call.ms/1000).toFixed(1)}s · {call.costDollars===null?"cost unavailable":`$${call.costDollars.toFixed(3)}`}{call.requestId?` · ${call.requestId}`:""}</small></article>)}</div></details>}
 </section>;
}
