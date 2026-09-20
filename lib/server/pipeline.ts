import type { Confirmation, Discovery, JobPart, JobSettings, PipelineStage, ResolvedPart } from "@/lib/job";
import { dedupeConstraints, describesSameWork, exactCandidate, groundedIdentifier, splitSupersededWork, subjectCandidate } from "@/lib/intent";
import { designationsIn, measurementsIn } from "@/lib/research";
import { containsIdentifier, normalizeUnits } from "@/lib/sourcing";
import { parseInspection } from "./input";
import { discoverParts } from "./discovery";
import { searchProducts } from "./product-search";
import { candidateFromRecord, creditHit, lookupPart, rememberPart } from "./registry";
import { safeError } from "./providers";
import { researchJob } from "./research";

export type Emit = (event: string, payload: unknown) => void;
export type PipelineInput = {
  trade: string;
  note: string;
  settings: Pick<JobSettings,"region"|"supplierDomains"> & {preferredDomains?:string};
  /** Present only on the second phase, once the technician has run the checks and decided. */
  confirmed?: Confirmation;
};

/**
 * Phase one. Understand the situation, then research it.
 *
 * Nothing is sourced or priced here. The technician has not decided yet, and a price on screen before
 * a diagnosis is the behaviour this design exists to remove. The exception is a note that already
 * contains the decision, which needs no research and no confirmation because the transcript is the
 * confirmation.
 */
export async function runQuotePipeline(input: PipelineInput, signal: AbortSignal, emit: Emit) {
  const progress = (stage:PipelineStage,message:string,partId?:string)=>emit(stage,{stage,message,partId,at:new Date().toISOString()});
  if (input.confirmed) return sourceConfirmedRepair(input, input.confirmed, signal, emit, progress);

  progress("understanding_input","Reading what the technician is seeing. Nothing is diagnosed here.");
  const job = await parseInspection(input.trade,input.note,signal);
  emit("job_parsed",job);

  if (job.brief.needsResearch) {
    const packet = await researchJob(job.brief, supplierList(input), signal, progress);
    emit("research_complete", packet);
    progress("awaiting_confirmation", packet.repairPaths.length
      ? "Run the checks above, then tell the workspace what you found. Nothing is sourced until you do."
      : "The retrieved documentation did not settle this. Add the equipment model or the fault code and try again.");
    return;
  }

  // The note already decided. Price what it named, and say so.
  progress("understanding_input", "The note already names what to order, so nothing needs researching first.");
  await sourceParts(input, job.knownParts, signal, emit, progress);
}

/**
 * Phase two: the technician ran the checks and said what they found.
 *
 * No model call. The note was already understood in phase one and the technician has since made the
 * decision it could not, so re-reading the note would spend a call to rediscover what the
 * confirmation already states, and would add a second place a retry could fail. Sourcing a confirmed
 * repair is now retryable on its own without touching the research that produced it.
 */
async function sourceConfirmedRepair(input: PipelineInput, confirmed: Confirmation, signal: AbortSignal, emit: Emit, progress: (s:PipelineStage,m:string,p?:string)=>void) {
  progress("understanding_input", `Confirmed on site: ${confirmed.component}. Sourcing it now, no re-diagnosis.`);
  await sourceParts(input, [confirmedPart(withNoteContext(confirmed, input.note))], signal, emit, progress);
}

/**
 * Recover equipment context the caller did not carry, from the note, without a model call.
 *
 * The client should send the plate designation and the stated requirements with the confirmation,
 * and does. This is the guard for when it does not: a model-specific research phase handing
 * procurement a generic buying question is how a 120 V requirement and a 48TCED08A2A6 plate get lost
 * between the two. Both are lifted verbatim from the note, so nothing here is inferred.
 */
function withNoteContext(confirmed: Confirmation, note: string): Confirmation {
  // Grounded the same way the brief's own model is, because this arrives from a client: a designation
  // the note never carried would be searched for as this machine and checked against every page.
  const stated = confirmed.model && containsIdentifier(note, confirmed.model) ? confirmed.model : "";
  const model = stated || designationsIn(note).find(token => !describesSameWork(token, confirmed.component)) || "";
  const carried = (confirmed.constraints ?? []).filter(c => c.field && c.value && normalizeUnits(note).includes(normalizeUnits(c.value)));
  const constraints = carried.length ? carried
    // The field name is generic because recovering the value from the note cannot tell us what the
    // technician called it. A carried constraint keeps its real name, which is why carrying matters.
    : measurementsIn(note).map(value => ({ field: "stated requirement", value }));
  return { ...confirmed, model, constraints: dedupeConstraints(constraints) };
}

/**
 * The confirmed repair as a line item, carrying the equipment context with it.
 *
 * The model belongs in `equipment` rather than in `subject`, because `subject` is what the price gate
 * derives an identifier from: a pressure switch page will never carry the rooftop unit's plate
 * designation, and demanding it there would refuse every correct listing. In `equipment` it reaches
 * the discovery query, where naming the machine is exactly what makes the part specific.
 */
/**
 * Name the machine once. The maker, the plate and the equipment description overlap: "Carrier" plus
 * "48TCED08A2A6" plus "Carrier rooftop unit" searched Exa for "Carrier 48TCED08A2A6 Carrier rooftop
 * unit repair parts for pressure switch", which is the same repetition the supplier phrase already
 * strips out of "Moen Moen 1222 cartridge". First occurrence of each word wins, so plate order holds.
 */
function nameMachine(parts: (string | undefined)[]) {
  const seen = new Set<string>();
  return parts.filter(Boolean).join(" ").split(/\s+/)
    .filter(word => { const key = word.toLowerCase(); return seen.has(key) ? false : (seen.add(key), true); })
    .join(" ").trim();
}

function confirmedPart(confirmed: Confirmation): JobPart {
  const machine = nameMachine([confirmed.manufacturer, confirmed.model, confirmed.equipment]);
  const quantity = Number.isInteger(confirmed.quantity) && confirmed.quantity! > 0 && confirmed.quantity! <= 999 ? confirmed.quantity! : 1;
  // Never `part-1`. The parser numbers reported items from one, and this run keeps the parsed job on
  // screen, so sharing that id makes the estimate label the confirmed candidate with an unrelated
  // reported item and count that item as quoted. Measured: a confirmed vent repair displayed "pressure
  // switch" beside it and the estimate recorded the pressure switch as covered.
  return { id: "confirmed-1", description: confirmed.component, quantity, sku: "", equipment: machine, kind: "part", decided: true,
    // The discovery query for an uncertain item is built from rawContext, so a findings note alone
    // becomes the whole search: one live confirmation searched Exa for "Draft is normal. Switch has
    // failed continuity." and named neither the machine nor the component. It names the work first.
    intent: { rawContext: [machine, confirmed.component].filter(Boolean).join(" ") + (confirmed.findings ? `. Confirmed on site: ${confirmed.findings}` : ""),
      manufacturer: confirmed.manufacturer ?? "", fixture: machine,
      suspectedPart: confirmed.component, subject: confirmed.component, ruledOut: [], supersedes: [],
      exactModel: "", route: "ambiguous", constraints: dedupeConstraints(confirmed.constraints ?? []) } };
}

const supplierList = (input: PipelineInput) =>
  String(input.settings.preferredDomains ?? "").split(/[\s,]+/).map(d => d.toLowerCase()).filter(Boolean);

async function sourceParts(input: PipelineInput, incoming: JobPart[], signal: AbortSignal, emit: Emit, progress: (s:PipelineStage,m:string,p?:string)=>void) {
  const { remaining, superseded } = splitSupersededWork(incoming);
  const exact=remaining.filter(p=>p.intent?.route==="exact");
  const direct: ResolvedPart[]=exact.map(exactCandidate);
  // A description already resolved for this equipment and symptom does not need researching again:
  // the registry answers it and the run goes straight to pricing. Stale or under-specified records
  // return nothing, so the part falls through to discovery as usual.
  const ambiguous: JobPart[]=[]; const fromRegistry: string[]=[]; const chosen: JobPart[]=[]; const sourced: string[]=[];
  for(const part of remaining.filter(p=>p.intent?.route!=="exact")){
    const record=await lookupPart(input.trade,part);
    if(record){ creditHit(record); direct.push(candidateFromRecord(record,part)); fromRegistry.push(part.id); continue; }
    // Identifiable enough for direct retrieval: the note already carries a designation, so there is
    // nothing to diagnose. A disposal the technician has decided to replace is sourced as the
    // appliance on its plate, not researched as the motor that failed inside it.
    if(groundedIdentifier(part)){ direct.push(subjectCandidate(part)); sourced.push(part.id); continue; }
    // Chosen, but with no designation to price against: "cartridge puller" names the right product and
    // no orderable model. Researched as a buying question against product pages rather than as a fault.
    // A repair the technician confirmed on site belongs here too. It used to go to the alternatives
    // pass, which asks deep-lite to explore other product families and explicitly not to pick one —
    // the wrong question for a component already tested and established, and it cost the more
    // expensive call to ask it before the cheaper direct pass rescued the run.
    if(part.decided||part.kind==="tool"||part.kind==="unit") chosen.push(part); else ambiguous.push(part);
  }
  emit("intent_routed",{exact:exact.map(p=>p.id),registry:fromRegistry,sourced,tools:chosen.map(p=>p.id),ambiguous:ambiguous.map(p=>p.id),superseded:superseded.map(s=>s.partId)});
  if(superseded.length) progress("understanding_input",`${superseded.length} reported ${superseded.length===1?"item is":"items are"} covered by another line and will not be quoted twice.`);
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
  if(chosen.length){
    progress("resolving_part",`Exa is finding a purchasable model for ${chosen.length} ${chosen.length===1?"item the technician named":"items the technician named"}.`);
    const found=await discoverParts(chosen,signal,false);
    // Both passes number their candidates from one, and the interface keys selections by candidate id.
    discovery={parts:[...discovery.parts,...found.parts.map(p=>({...p,id:`chosen-${p.id}`}))],
      unresolved:[...discovery.unresolved,...found.unresolved],
      pagesScanned:discovery.pagesScanned+found.pagesScanned,trace:[...discovery.trace,...found.trace]};
  }
  const seen=new Set<string>();
  const parts=[...direct,...discovery.parts].filter(part=>{
    const key=`${part.manufacturer.toLowerCase()}|${part.partNumber.toLowerCase()}|${part.partIds.slice().sort().join(",")}`;
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,6);
  const represented=new Set(parts.flatMap(p=>p.partIds));
  const unresolved=[...discovery.unresolved];
  for(const p of remaining) if(!represented.has(p.id)&&!unresolved.some(u=>u.partId===p.id)) unresolved.push({partId:p.id,reason:"This run's candidate limit was reached. Research this item separately."});
  discovery={...discovery,parts,unresolved,superseded};
  // Keep what Exa established, so the next job with this equipment and symptom skips discovery.
  // Where a fault drew more than one candidate the choice is the technician's, not this run's: none of
  // the alternatives is a conclusion yet, so nothing is written for that fault.
  const candidatesPerFault=new Map<string,number>();
  for(const resolved of parts) for(const id of resolved.partIds) candidatesPerFault.set(id,(candidatesPerFault.get(id)??0)+1);
  for(const resolved of discovery.parts) for(const id of resolved.partIds){
    const part=incoming.find(p=>p.id===id);
    if(part) rememberPart(input.trade,part,resolved,candidatesPerFault.get(id)===1);
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
  // A decided repair finding nothing is genuinely ambiguous between "not found" and "not needed", and
  // the research prompt is asked for paths that need no part, so the second is a real answer rather
  // than a failure. Saying only "add the model" hides it and reads as a dead end.
  const decidedOnly=remaining.length>0&&remaining.every(p=>p.decided);
  progress("complete",failed?`Research finished; ${failed} supplier ${failed===1?"search needs":"searches need"} a retry.`
    :parts.length?"Research complete. Choose the right candidate and confirm its fit and price."
    :decidedOnly?"Nothing orderable was confirmed for this repair. If it needs no replacement part, quote the labour; otherwise add the part number and retry."
    :"No supported candidate yet. Add the equipment model or part number.");
}
