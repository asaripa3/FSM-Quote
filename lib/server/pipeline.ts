import type { Discovery, JobSettings, PipelineStage, ResolvedPart } from "@/lib/job";
import { exactCandidate, toolCandidate } from "@/lib/intent";
import { parseInspection } from "./input";
import { discoverParts } from "./discovery";
import { searchProducts } from "./product-search";
import { candidateFromRecord, creditHit, lookupPart, rememberPart } from "./registry";
import { safeError } from "./providers";

export type Emit = (event: string, payload: unknown) => void;
export async function runQuotePipeline(input: {trade:string;note:string;settings:Pick<JobSettings,"region"|"supplierDomains"> & {preferredDomains?:string}}, signal: AbortSignal, emit: Emit) {
  const progress = (stage:PipelineStage,message:string,partId?:string)=>emit(stage,{stage,message,partId,at:new Date().toISOString()});
  progress("understanding_input","Reading the technician's observations. Unknown part numbers stay unknown.");
  const job = await parseInspection(input.trade,input.note,signal);
  emit("job_parsed",job);
  const exact=job.parts.filter(p=>p.intent?.route==="exact");
  const direct: ResolvedPart[]=exact.map(exactCandidate);
  // A description already resolved for this equipment and symptom does not need researching again:
  // the registry answers it and the run goes straight to pricing. Stale or under-specified records
  // return nothing, so the part falls through to discovery as usual.
  const ambiguous: typeof job.parts=[]; const fromRegistry: string[]=[]; const tools: string[]=[];
  for(const part of job.parts.filter(p=>p.intent?.route!=="exact")){
    // A tool the technician named is a commercial question, not a research one: they know what they
    // need, they need somewhere to buy it. Researching "cartridge puller" in manufacturer documentation
    // spends an Exa call to rediscover what the note already said.
    if(part.kind==="tool"){ tools.push(part.id); direct.push(toolCandidate(part)); continue; }
    const record=await lookupPart(input.trade,part);
    if(record){ creditHit(record); direct.push(candidateFromRecord(record,part)); fromRegistry.push(part.id); }
    else ambiguous.push(part);
  }
  emit("intent_routed",{exact:exact.map(p=>p.id),registry:fromRegistry,tools,ambiguous:ambiguous.map(p=>p.id)});
  if(fromRegistry.length) progress("resolving_part",`${fromRegistry.length} ${fromRegistry.length===1?"description was":"descriptions were"} resolved before for this equipment; reusing that part and pricing it now.`);
  let discovery: Discovery={parts:[],unresolved:[],pagesScanned:0,trace:[]};
  if(ambiguous.length){
    progress("resolving_part",`Exa is researching ${ambiguous.length} uncertain ${ambiguous.length===1?"description":"descriptions"} in manufacturer and distributor documentation.`);
    discovery=await discoverParts(ambiguous,signal,true);
    // The alternatives pass asks deep-lite for manufacturer documentation, which returns fewer pages
    // carrying a supplier-grade part number (measured 4 of 11 against 7 of 12), so the evidence checks
    // often find nothing to anchor. Fall back to the direct product phrasing rather than show an empty
    // list; it costs one more Exa call only when the first pass resolved nothing at all.
    if(!discovery.parts.length){
      progress("resolving_part","No alternative was supported by documentation. Re-running the search against supplier product pages.");
      const direct=await discoverParts(ambiguous,signal,false);
      if(direct.parts.length) discovery={...direct,trace:[...discovery.trace,...direct.trace],pagesScanned:discovery.pagesScanned+direct.pagesScanned};
    }
  }
  const seen=new Set<string>();
  const parts=[...direct,...discovery.parts].filter(part=>{
    const key=`${part.manufacturer.toLowerCase()}|${part.partNumber.toLowerCase()}|${part.partIds.slice().sort().join(",")}`;
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,6);
  const represented=new Set(parts.flatMap(p=>p.partIds));
  const unresolved=[...discovery.unresolved];
  for(const p of job.parts) if(!represented.has(p.id)&&!unresolved.some(u=>u.partId===p.id)) unresolved.push({partId:p.id,reason:"This run's candidate limit was reached. Research this item separately."});
  discovery={...discovery,parts,unresolved};
  // Keep what Exa established, so the next job with this equipment and symptom skips discovery.
  for(const resolved of discovery.parts) for(const id of resolved.partIds){
    const part=job.parts.find(p=>p.id===id);
    if(part) rememberPart(input.trade,part,resolved);
  }
  emit("discovery_complete",discovery);
  let next=0,failed=0;
  // Two concurrent candidate searches: bounded fan-out with per-candidate results as soon as they finish.
  const worker=async()=>{
    while(next<parts.length){
      signal.throwIfAborted();
      const part=parts[next++];
      emit("product_search_started",{partId:part.id,query:part.searchQuery});
      try {
        const result=await searchProducts({query:part.searchQuery,partNumber:part.partNumber,sku:part.sku,constraints:part.constraints,domains:input.settings.supplierDomains,preferredDomains:input.settings.preferredDomains,region:input.settings.region},signal,(stage,message)=>progress(stage,message,part.id));
        signal.throwIfAborted();
        emit("supplier_results",{partId:part.id,...result});
      }catch(error){if(signal.aborted)throw error;failed++;emit("supplier_error",{partId:part.id,error:safeError(error)});}
    }
  };
  await Promise.all([worker(),worker()]);
  progress("complete",failed?`Research finished; ${failed} supplier ${failed===1?"search needs":"searches need"} a retry.`:parts.length?"Research complete. Choose the right candidate and confirm its fit and price.":"No supported candidate yet. Add the model or rating from the equipment plate.");
}
