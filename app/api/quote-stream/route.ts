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
  const abort=new AbortController();
  const signal=AbortSignal.any([request.signal,abort.signal,AbortSignal.timeout(285000)]);
  const encoder=new TextEncoder();
  let closed=false;
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  const stream=new ReadableStream<Uint8Array>({
    start(controller){
      const emit=(event:string,payload:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));};
      heartbeat=setInterval(()=>{if(!closed)controller.enqueue(encoder.encode(": keepalive\n\n"));},15000);
      void runQuotePipeline({trade:body.trade,note:body.note,settings},signal,emit)
        .catch(error=>{if(!closed)emit("error",{error:safeError(error)});})
        .finally(()=>{clearInterval(heartbeat);if(!closed){closed=true;controller.close();}});
    },
    cancel(){closed=true;clearInterval(heartbeat);abort.abort();},
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"}});
}
