import { runQuotePipeline } from "@/lib/server/pipeline";
import { safeError, sameOrigin } from "@/lib/server/providers";
import { isTradeId } from "@/lib/trades";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  if(!sameOrigin(request))return Response.json({error:"Invalid request origin."},{status:403});
  let body;
  try {body=await request.json();}catch{return Response.json({error:"Invalid job request."},{status:400});}
  if(!body||!isTradeId(body.trade)||typeof body.note!=="string"||body.note.trim().length<12||body.note.length>12000)return Response.json({error:"Add a field note between 12 and 12,000 characters."},{status:400});
  const settings={region:typeof body.settings?.region==="string"?body.settings.region.slice(0,100):"United States",supplierDomains:typeof body.settings?.supplierDomains==="string"?body.settings.supplierDomains.slice(0,2000):"",preferredDomains:typeof body.settings?.preferredDomains==="string"?body.settings.preferredDomains.slice(0,2000):""};
  // The technician's confirmation is client-supplied and therefore untrusted: clamped like the note,
  // and it reaches a prompt only as quoted observation, never as instruction.
  const raw=body.confirmed;
  const clamp=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
  const component=clamp(raw?.component,200);
  // The equipment and maker ride with the confirmation so the sourcing phase needs no model call at
  // all, which makes a failed sourcing retryable on its own. Clamped like everything else from a client.
  const confirmed=component?{component,findings:clamp(raw?.findings,1000),equipment:clamp(raw?.equipment,200),manufacturer:clamp(raw?.manufacturer,100)}:undefined;
  const abort=new AbortController();
  const signal=AbortSignal.any([request.signal,abort.signal,AbortSignal.timeout(285000)]);
  const encoder=new TextEncoder();
  let closed=false;
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  const stream=new ReadableStream<Uint8Array>({
    start(controller){
      const emit=(event:string,payload:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));};
      heartbeat=setInterval(()=>{if(!closed)controller.enqueue(encoder.encode(": keepalive\n\n"));},15000);
      void runQuotePipeline({trade:body.trade,note:body.note,settings,confirmed},signal,emit)
        .catch(error=>{if(!closed)emit("error",{error:safeError(error)});})
        .finally(()=>{clearInterval(heartbeat);if(!closed){closed=true;controller.close();}});
    },
    cancel(){closed=true;clearInterval(heartbeat);abort.abort();},
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"}});
}
