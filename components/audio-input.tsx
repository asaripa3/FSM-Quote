"use client";
import { useEffect, useRef, useState } from "react";
type Recognition = {continuous:boolean;interimResults:boolean;lang:string;onresult:((e:RecognitionEvent)=>void)|null;onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type RecognitionEvent = {resultIndex:number;results:{length:number;[key:number]:{isFinal:boolean;[key:number]:{transcript:string}}}};
type SpeechWindow = Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};

async function toPcm(file: Blob) {
 const context = new AudioContext();
 try {const decoded=await context.decodeAudioData(await file.arrayBuffer());if(decoded.duration>600)throw new Error("Please use audio shorter than 10 minutes.");const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const audio=await offline.startRendering();const samples=audio.getChannelData(0);const bytes=new ArrayBuffer(samples.length*2);const view=new DataView(bytes);for(let i=0;i<samples.length;i++)view.setInt16(i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);return bytes;}finally{await context.close();}
}
/**
 * Voice and file capture as two controls on the composer, not a mode to choose first.
 *
 * The microphone dictates live where the browser can, and where it cannot it records and transcribes
 * on stop. That fallback is not offered as a choice: a technician pressing a microphone wants their
 * words in the box, and which speech service put them there is not their problem. Either way the
 * text lands in the same note they were already writing.
 */
export function InlineCapture({onTranscript,disabled}:{onTranscript:(text:string)=>void;disabled?:boolean}) {
 const [working,setWorking]=useState(false),[recording,setRecording]=useState(false),[error,setError]=useState(""),[interim,setInterim]=useState("");
 const recognition=useRef<Recognition|null>(null),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),controller=useRef<AbortController|null>(null),captureTimer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;recognition.current?.abort();if(recorder.current?.state==="recording"){recorder.current.onstop=null;recorder.current.stop();}stream.current?.getTracks().forEach(t=>t.stop());controller.current?.abort();if(captureTimer.current)clearTimeout(captureTimer.current);};},[]);
 const transcribe=async(file:Blob)=>{setError("");setWorking(true);controller.current=new AbortController();try{if(file.size>25_000_000)throw new Error("Please choose a file smaller than 25 MB.");const pcm=await toPcm(file);const res=await fetch("/api/transcribe",{method:"POST",headers:{"Content-Type":"audio/pcm"},body:pcm,signal:controller.current.signal});const data=await res.json();if(!res.ok)throw new Error(data.error);if(mounted.current)onTranscript(data.transcript);}catch(e){if(mounted.current)setError(e instanceof Error?e.message:"Could not read this audio.");}finally{if(mounted.current)setWorking(false);}};
 const record=async()=>{setError("");try{if(!navigator.mediaDevices?.getUserMedia)throw new Error("Recording needs microphone access over HTTPS or localhost.");const media=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;const r=new MediaRecorder(media);recorder.current=r;const chunks:Blob[]=[];r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};r.onstop=()=>{media.getTracks().forEach(t=>t.stop());setRecording(false);if(captureTimer.current)clearTimeout(captureTimer.current);void transcribe(new Blob(chunks,{type:r.mimeType}));};r.start();setRecording(true);captureTimer.current=setTimeout(()=>{if(r.state==="recording")r.stop();},600000);}catch(e){setError(e instanceof Error?e.message:"Microphone access failed.");}};
 const listen=()=>{
  setError("");
  const Constructor=(window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
  // No browser speech service: record and transcribe on stop instead. Same result, arriving later.
  if(!Constructor){void record();return;}
  const r=new Constructor();recognition.current=r;r.continuous=true;r.interimResults=true;r.lang="en-US";
  r.onresult=e=>{let draft="";for(let i=e.resultIndex;i<e.results.length;i++){const text=e.results[i][0].transcript;if(e.results[i].isFinal)onTranscript(text);else draft+=text;}setInterim(draft);};
  r.onerror=e=>{setError(e.error==="not-allowed"?"Microphone permission was denied. Allow it in your browser and try again.":`Dictation stopped (${e.error}).`);setRecording(false);};
  r.onend=()=>{setRecording(false);setInterim("");};
  try{r.start();setRecording(true);}catch{setError("Could not start dictation. Please try again.");}
 };
 const stop=()=>{recognition.current?.stop();if(recorder.current?.state==="recording")recorder.current.stop();setRecording(false);};
 return <>
  <label className="dw-tool" title="Attach a recording" aria-label="Attach a recording" data-busy={working||undefined}>
   {working?"…":"\u21ea"}
   <input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm" disabled={disabled||working||recording}
    onChange={e=>{const f=e.target.files?.[0];if(f)void transcribe(f);e.target.value="";}}/>
  </label>
  <button type="button" className="dw-tool" aria-pressed={recording} disabled={disabled||working}
   title={recording?"Stop dictation":"Dictate into the note"} aria-label={recording?"Stop dictation":"Dictate into the note"}
   onClick={recording?stop:listen}>{recording?"\u25a0":"\u25c9"}</button>
  {(recording||working||interim||error)&&<span className="dw-tool-state" role="status" data-error={!!error||undefined}>
   {error||interim||(working?"Transcribing…":"Listening…")}</span>}
 </>;
}
