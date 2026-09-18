import WebSocket from "ws";
import { inferenceToken, safeError, sameOrigin } from "@/lib/server/providers";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error:"Invalid request origin." },{status:403});
  try {
    const size = Number(request.headers.get("content-length") || 0);
    if (size > 20_000_000) return Response.json({error:"Please use a recording shorter than 10 minutes."},{status:413});
    if (request.headers.get("content-type") !== "audio/pcm") return Response.json({error:"Expected mono 16 kHz PCM audio."},{status:415});
    const pcm = Buffer.from(await request.arrayBuffer());
    if (!pcm.length || pcm.length > 20_000_000 || pcm.length % 2) return Response.json({error:"The audio is empty or too large."},{status:400});
    const transcript = await new Promise<string>((resolve,reject)=> {
      const ws = new WebSocket("wss://agent-gateway.livekit.cloud/v1/stt?model=deepgram/nova-3", { headers:{Authorization:`Bearer ${inferenceToken()}`},handshakeTimeout:15000 });
      const finals: string[] = []; let settled = false;
      const finish = (error?: Error) => {if(settled)return;settled=true;clearTimeout(timer);request.signal.removeEventListener("abort",abort);ws.close();if(error)reject(error);else resolve(finals.join(" ").trim());};
      const timer = setTimeout(()=>finish(new Error("Transcription timed out. Please try a shorter recording.")),90000);
      const abort = ()=>finish(new Error("Transcription cancelled.")); request.signal.addEventListener("abort",abort,{once:true});
      ws.on("open",()=>ws.send(JSON.stringify({type:"session.create",model:"deepgram/nova-3",settings:{language:"en",encoding:"pcm_s16le",sample_rate:"16000",extra:{punctuate:true}}})));
      ws.on("message", async raw=> {
        try {
          const message=JSON.parse(raw.toString());
          if(message.type === "session.created") {
            for(let offset=0;offset<pcm.length && !settled;offset+=3200) {
              await new Promise<void>((done,fail)=>ws.send(JSON.stringify({type:"input_audio",audio:pcm.subarray(offset,offset+3200).toString("base64")}),e=>e?fail(e):done()));
            }
            if(!settled)ws.send(JSON.stringify({type:"session.finalize"}));
          } else if(message.type === "final_transcript" && typeof message.transcript === "string") finals.push(message.transcript);
          else if(message.type === "session.finalized") finish();
          else if(message.type === "error") finish(new Error("LiveKit could not transcribe this audio. Check inference access, or try another recording."));
        } catch {finish(new Error("Transcription failed. Please retry."));}
      });
      ws.on("error",()=>finish(new Error("Could not connect to LiveKit transcription. Check server access and credentials.")));
      ws.on("close",()=>{if(!settled)finish(finals.length?undefined:new Error("Transcription ended without text. Please try again."));});
    });
    if(!transcript) return Response.json({error:"No speech was detected. Try a clearer recording."},{status:422});
    return Response.json({transcript});
  } catch(error) {return Response.json({error:safeError(error)},{status:502});}
}
