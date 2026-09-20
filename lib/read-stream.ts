/** POST-compatible SSE reader. Handles split UTF-8 and split frames; ignores keepalive comments. */
export async function readEventStream(response: Response, onEvent:(event:string,data:unknown)=>void) {
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Research could not start.");}
  if(!response.body)throw new Error("Streaming is unavailable in this browser.");
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer="",completed=false;
  try{
    while(true){
      const {value,done}=await reader.read();
      buffer+=decoder.decode(value,{stream:!done}).replace(/\r\n/g,"\n");
      let end;
      while((end=buffer.indexOf("\n\n"))>=0){
        const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
        const event=frame.split("\n").find(l=>l.startsWith("event:"))?.slice(6).trim()||"message";
        const data=frame.split("\n").filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trimStart()).join("\n");
        if(!data)continue;
        const payload=JSON.parse(data);
        if(event==="error")throw new Error(payload.error||"Research failed.");
        // Two terminal events now: a finished job, and a research phase that has done its work and
        // is waiting on the technician. Both are a complete stream, not a dropped connection.
        if(event==="complete"||event==="awaiting_confirmation")completed=true;
        onEvent(event,payload);
      }
      if(done)break;
    }
    if(!completed)throw new Error("The research connection ended early. Retry the job.");
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
