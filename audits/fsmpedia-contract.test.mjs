// Offline audit contracts. Failures document gaps; no paid provider calls are made.
import '../tests/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { sourceKind } = await import('../lib/research.ts');
const { researchJob } = await import('../lib/server/research.ts');
const { parseInspection } = await import('../lib/server/input.ts');
const { runQuotePipeline } = await import('../lib/server/pipeline.ts');
process.env.EXA_API_KEY='offline-audit';
process.env.LIVEKIT_API_KEY='offline-audit';
process.env.LIVEKIT_API_SECRET='offline-audit';
const brief={equipment:'rooftop unit',manufacturer:'Carrier',model:'48TCED08A2A6',serial:'',faultCodes:['31'],symptoms:['not cooling'],alreadyChecked:[],stillUncertain:['cause unknown'],needsResearch:true};
const empty={evidenceSummary:'No supported finding.',contradicts:'',checkBeforeReplacing:[],repairPaths:[]};
const generatedPath={component:'pressure switch',rationale:'Replace switch',confirmBy:'',evidenceLevel:'oem'};

test('OEM authority requires a verified manufacturer host, not a brand substring',()=>{
 assert.notEqual(sourceKind('https://carrier-manuals.example/manual','Carrier manual','Carrier'),'oem');
 assert.notEqual(sourceKind('https://carrier.com.unrelated.example/manual','Carrier manual','Carrier'),'oem');
});

test('a generated repair path without any retrieved evidence is withheld',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({results:[],output:{content:{...empty,repairPaths:[generatedPath]},grounding:[]}}));
 const packet=await researchJob(brief,[]);
 assert.equal(packet.repairPaths.length,0);
});

test('a generated contradiction without retrieved evidence is not asserted as documented fact',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({results:[],output:{content:{...empty,contradicts:'This equipment has no code 31.'},grounding:[]}}));
 const packet=await researchJob(brief,[]);
 assert.equal(packet.contradicts,'');
});

test('already-checked observations and remaining uncertainty reach the research request',async t=>{
 const requests=[];
 t.mock.method(globalThis,'fetch',async(_url,init)=>{requests.push(JSON.parse(init.body));return Response.json({results:[],output:{content:empty}});});
 await researchJob({...brief,alreadyChecked:['Continuity measured 0.2 ohms'],stillUncertain:['venting obstruction not inspected']},[]);
 const sent=JSON.stringify(requests);
 assert.match(sent,/0\.2 ohms/);
 assert.match(sent,/venting obstruction not inspected/);
});

test('confirmation retains equipment model and explicit requirements during sourcing',async t=>{
 let request;
 t.mock.method(globalThis,'fetch',async(_url,init)=>{request=JSON.parse(init.body);throw new Error('Stop after inspecting the outgoing request');});
 await assert.rejects(runQuotePipeline({trade:'hvac',note:'Carrier 48TCED08A2A6. Replacement must have 120 V coil.',settings:{region:'United States',supplierDomains:''},confirmed:{component:'pressure switch',findings:'Failed continuity',manufacturer:'Carrier',equipment:'rooftop unit'}},new AbortController().signal,()=>{}));
 assert.match(JSON.stringify(request),/48TCED08A2A6/);
 assert.match(JSON.stringify(request),/120 V/);
});

test('fault codes absent from the note are rejected by the brief normalizer',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({choices:[{message:{content:JSON.stringify({summary:'Not cooling',equipment:'Carrier unit',parts:[],questions:[],brief:{...brief,faultCodes:['31']}})}}]}));
 const job=await parseInspection('hvac','Carrier unit is not cooling. No fault code was recorded.');
 assert.deepEqual(job.brief.faultCodes,[]);
});

test('missing structured research output is a retryable failure, not a successful packet',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({results:[]}));
 await assert.rejects(researchJob(brief,[]));
});

test('practitioner fallback failure preserves the OEM packet',async t=>{
 let count=0;
 t.mock.method(globalThis,'fetch',async()=>{
  if(count++)throw new Error('simulated fallback timeout');
  return Response.json({results:[{url:'https://carrier.com/manual.pdf',title:'48TCED08A2A6 service',highlights:['Carrier 48TCED08A2A6 service instructions: check the reported control-board flash sequence before replacing components.']}],output:{content:empty}});
 });
 const packet=await researchJob(brief,[]);
 assert.equal(packet.sources.length,1);
 assert.equal(packet.fieldSourcesUnavailable,true);
 assert.equal(packet.sources[0].strength,'authoritative');
});
