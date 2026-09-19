import './register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { normalizeIntent } = await import('../lib/intent.ts');
const { checkSpecifications, rankSuppliers } = await import('../lib/source-ranking.ts');
const { readEventStream } = await import('../lib/read-stream.ts');
const { POST } = await import('../app/api/quote-stream/route.ts');
process.env.LIVEKIT_API_KEY='test-key';process.env.LIVEKIT_API_SECRET='test-secret';process.env.EXA_API_KEY='test-exa';
const reply=body=>Response.json(body);
const note='Order one Moen 1222 cartridge. Allow 45 minutes labor.';
const intent={rawContext:'Order one Moen 1222 cartridge.',manufacturer:'Moen',fixture:'shower',symptom:'',suspectedPart:'cartridge',possibleFamily:'',exactModel:'1222',confidence:.99,route:'exact',constraints:[]};
const part={id:'part-1',description:'replacement cartridge',query:'Moen 1222 cartridge',quantity:1,sku:'1222',equipment:'Moen shower',intent};
const supplier='https://supplier.example/moen-1222';
const text='Moen 1222 cartridge. Price USD $41.98 each. Sold as one unit. In stock.';
const summary={price:41.98,currency:'USD',priceEvidence:'Price USD $41.98 each.',sku:'1222',availability:'In stock',availabilityEvidence:'In stock.',packQuantity:1,packEvidence:'Sold as one unit.',identityEvidence:'Moen 1222 cartridge.',matchesRequestedPart:true,specifications:[]};
function mockFetch(t,{ambiguous=false,failContents=false}={}){
 const calls=[];const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(url,init)=>{
  const body=JSON.parse(init.body);calls.push({url:String(url),body});
  if(String(url).includes('chat/completions'))return reply({choices:[{message:{content:JSON.stringify({summary:'Shower repair',equipment:'Moen shower',laborHours:.75,parts:[ambiguous?{...part,sku:'',intent:{...intent,exactModel:'',route:'ambiguous',confidence:.6,rawContext:'Older Moen single handle shower drips; cartridge model unknown.'}}:part],questions:[]})}}]});
  if(String(url).endsWith('/search')&&!body.category)return reply({requestId:'discover',results:[{url:'https://manufacturer.example/cartridge',text:'Moen 1222 cartridge is a Posi-Temp replacement cartridge.',title:'Moen cartridge guide'}],output:{content:{parts:[{name:'Moen 1222 cartridge',manufacturer:'Moen',partNumber:'1222',sku:'',coversFaults:['part-1'],reason:'Candidate only. Check the valve family.',evidence:'Moen 1222 cartridge is a Posi-Temp replacement cartridge.',conflicts:[],questions:['Is this a Posi-Temp valve?']}]},grounding:[{field:'parts[0].name',confidence:'high',citations:[{url:'https://manufacturer.example/cartridge'}]}]},costDollars:{total:.01}});
  if(String(url).endsWith('/search'))return reply({requestId:'product',results:[{url:supplier,title:'Moen 1222 cartridge'}],costDollars:{total:.005}});
  if(String(url).endsWith('/contents')){if(failContents)return reply({results:[],statuses:[{id:supplier,status:'error'}]});return reply({requestId:'contents',results:[{url:supplier,text,summary:JSON.stringify(summary)}],statuses:[{id:supplier,status:'success',source:'live'}],costDollars:{total:.005}});}
  throw Error('Unexpected provider '+url);
 };return calls;
}
async function run(rawNote=note){const events=[];const response=await POST(new Request('http://localhost/api/quote-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({trade:'plumbing',note:rawNote,settings:{region:'United States',supplierDomains:''}})}));assert.equal(response.status,200);await readEventStream(response,(event,data)=>events.push({event,data}));return events;}

test('router needs a stated exact replacement number, not just confident model output',()=>{
 assert.equal(normalizeIntent(intent,note,part).route,'exact');
 assert.equal(normalizeIntent({...intent,exactModel:'1225'},note,part).route,'ambiguous');
 assert.equal(normalizeIntent({...intent,rawContext:'Maybe order Moen 1222',confidence:.99},'Maybe order Moen 1222',part).route,'ambiguous');
 assert.equal(normalizeIntent({...intent,rawContext:'Work order says 1222 last time'},'Work order says 1222 last time',part).route,'ambiguous');
});
test('exact path streams real product retrieval and Exa extraction without discovery or second local LLM',async t=>{
 const calls=mockFetch(t),events=await run();
 assert.equal(calls.filter(c=>c.url.includes('chat/completions')).length,1);
 const searches=calls.filter(c=>c.url.endsWith('/search'));
 assert.equal(searches.length,1);assert.equal(searches[0].body.category,'product');
 const contents=calls.find(c=>c.url.endsWith('/contents')).body;
 assert.equal(contents.maxAgeHours,0);assert.ok(contents.summary.schema);
 // A stated part number routes straight to product search: no discovery, and no registry reuse either.
 assert.deepEqual(events.find(e=>e.event==='intent_routed').data,{exact:['part-1'],registry:[],ambiguous:[]});
 const result=events.find(e=>e.event==='supplier_results').data;
 assert.equal(result.sources[0].price,41.98);assert.equal(result.sources[0].url,supplier);assert.equal(result.sources[0].packQuantity,1);
 for(const stage of ['understanding_input','searching_products','validating_results','comparing_suppliers','complete'])assert.ok(events.some(e=>e.event===stage));
 assert.ok(!events.some(e=>e.event==='resolving_part'));
});
test('ambiguous path preserves uncertainty for Exa discovery then searches concrete candidates',async t=>{
 const calls=mockFetch(t,{ambiguous:true}),events=await run('Older Moen single handle shower drips; cartridge model unknown.');
 const searches=calls.filter(c=>c.url.endsWith('/search'));
 assert.equal(searches.length,2);assert.equal(searches[0].body.type,'deep-lite');assert.equal(searches[0].body.category,undefined);
 assert.match(searches[0].body.query,/model unknown/);assert.equal(searches[1].body.category,'product');
 const candidate=events.find(e=>e.event==='discovery_complete').data.parts[0];
 assert.equal(candidate.route,'ambiguous');assert.equal(candidate.confidence,'high');assert.ok(candidate.questions.length);
});
test('partial crawl failures finish the stream with unknown prices, not invented fallback values',async t=>{
 mockFetch(t,{failContents:true});const events=await run();
 const source=events.find(e=>e.event==='supplier_results').data.sources[0];
 assert.equal(source.price,null);assert.equal(source.priceStatus,'needs-review');assert.equal(events.at(-1).event,'complete');
});
test('contradictory voltage blocks a candidate; missing evidence asks for review',()=>{
 const result=checkSpecifications([{field:'voltage',value:'120 V'}],[{field:'voltage',value:'240 V',evidence:'Coil voltage 240 V'}],'Coil voltage 240 V');
 assert.equal(result.conflicts.length,1);
 assert.equal(checkSpecifications([{field:'voltage',value:'120 V'}],[],'').missing.length,1);
});
test('supplier ranking never lets a cheaper conflicting offer outrank an exact part',()=>{
 const base={currency:'USD',packQuantity:1,availability:'In stock',availabilityEvidence:'In stock',domain:'supplier.example'};
 const ranked=rankSuppliers([{...base,price:1,matchStatus:'rejected'},{...base,price:42,matchStatus:'exact'}]);
 assert.equal(ranked[0].price,42);
});
test('stream parser handles byte splits and reports truncated streams',async()=>{
 const bytes=new TextEncoder().encode('event: searching_products\ndata: {"message":"Moen → suppliers"}\n\nevent: complete\ndata: {"stage":"complete"}\n\n');
 const seen=[];await readEventStream(new Response(new ReadableStream({start(c){for(const b of bytes)c.enqueue(Uint8Array.of(b));c.close();}})),(event,payload)=>seen.push({event,payload}));
 assert.equal(seen[0].payload.message,'Moen → suppliers');assert.equal(seen[1].event,'complete');
 await assert.rejects(()=>readEventStream(new Response('event: searching_products\ndata: {}\n\n'),()=>{}),/ended early/);
});
