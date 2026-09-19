"use client";
import type { ExaTrace, PipelineProgress } from "@/lib/job";
export function ExaResearch({events,trace,busy,routes,onCancel}:{events:PipelineProgress[];trace:ExaTrace[];busy:boolean;routes:{exact:number;ambiguous:number}|null;onCancel:()=>void}) {
 const last=events.at(-1);
 return <section className="exa-research" aria-label="Live Exa research">
  <header><div><span className="exa-tag">EXA</span><h2>{busy?"Researching your repair":"Your research trail"}</h2></div>{busy&&<button onClick={onCancel}>Stop research</button>}</header>
  <p className="research-status" role="status">{last?.message||"Connecting to the research pipeline…"}</p>
  {routes&&<div className="research-routes"><span><b>{routes.exact}</b> exact part {routes.exact===1?"request":"requests"} → product search</span><span><b>{routes.ambiguous}</b> uncertain {routes.ambiguous===1?"description":"descriptions"} → Exa discovery</span></div>}
  <details open={busy}><summary>Follow the actual search steps <span>{events.length} updates · {trace.length} Exa calls</span></summary><ol>{events.map((event,i)=><li key={i}><span>{event.stage.replaceAll("_"," ")}</span><p>{event.message}</p>{event.partId&&<small>{event.partId}</small>}</li>)}</ol></details>
  {trace.length>0&&<details><summary>Queries, sources and API usage</summary><div className="research-calls">{trace.map((call,i)=><article key={i}><strong>{call.step}</strong><code>{call.endpoint} · {call.searchType}</code><p>{call.query}</p><small>{call.results} results · {(call.ms/1000).toFixed(1)}s · {call.costDollars===null?"cost unavailable":`$${call.costDollars.toFixed(3)}`}{call.requestId?` · ${call.requestId}`:""}</small></article>)}</div></details>}
 </section>;
}
