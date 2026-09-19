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
 // Cache-first: forcing a live crawl returned nothing on the big retailers and cost ~18s per run.
 assert.equal(contents.maxAgeHours,undefined);assert.ok(contents.summary.schema);
 // A stated part number routes straight to product search: no discovery, and no registry reuse either.
 assert.deepEqual(events.find(e=>e.event==='intent_routed').data,{exact:['part-1'],registry:[],tools:[],ambiguous:[]});
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

test('a requirement stated by two faults becomes one check, not a duplicate React key', async () => {
  const { dedupeConstraints } = await import('../lib/intent.ts');
  // A shutoff valve and its supply line are both half-inch; the candidate covering both used to carry
  // the requirement twice, which printed "Confirm size: half-inch" twice and collided as a key.
  const merged = dedupeConstraints([
    { field: 'size', value: 'half-inch' },
    { field: 'size', value: 'half-inch' },
  ]);
  assert.equal(merged.length, 1);
  // Case and padding are wording, not meaning.
  assert.equal(dedupeConstraints([{field:'Size',value:'Half-Inch'},{field:'size',value:' half-inch '}]).length, 1);
  // Genuinely different requirements both survive.
  assert.equal(dedupeConstraints([{field:'size',value:'half-inch'},{field:'voltage',value:'440v'}]).length, 2);
  // The labels the card renders are now unique, which is what the key relies on.
  const labels = merged.map(c => `Confirm ${c.field}: ${c.value}`);
  assert.equal(new Set(labels).size, labels.length);
});

test('an unsettled alternative is never written to the registry as a confirmed part', async () => {
  const { rememberPart, lookupPart } = await import('../lib/server/registry.ts');
  const fault = {id:'part-1',description:'cartridge looks seized',query:'moen cartridge',quantity:1,sku:'',equipment:'Moen single-handle shower valve',
    intent:{rawContext:'Older Moen single-handle shower keeps dripping.',manufacturer:'Moen',fixture:'single-handle shower valve',
      symptom:'dripping after shutoff',suspectedPart:'cartridge',possibleFamily:'Posi-Temp',exactModel:'',confidence:0.6,route:'ambiguous',constraints:[]}};
  const candidate = (model, extra) => ({id:`r-${model}`,partIds:['part-1'],name:`Moen ${model} cartridge`,manufacturer:'Moen',partNumber:model,sku:'',
    reason:'Documentation suggests this fits.',evidence:'Posi-Temp cartridge',verified:true,sourceUrl:'https://www.moen.com/x',sourceLabel:'moen.com',
    supporting:[],searchQuery:`Moen ${model}`,skuStatus:'unknown',skuNote:'',route:'ambiguous',confidence:'high',constraints:[],conflicts:[],questions:[],...extra});

  // Two candidates for one fault: the technician has not chosen, so the run concludes nothing. Writing
  // either one used to leave whichever came last as a high-confidence hit with its questions removed.
  rememberPart('plumbing', fault, candidate('1222'), false);
  rememberPart('plumbing', fault, candidate('1225'), false);
  assert.equal(await lookupPart('plumbing', fault), null);

  // An open question is that same uncertainty in one candidate rather than across two.
  rememberPart('plumbing', fault, candidate('1222', {questions:['Confirm the valve is Posi-Temp.']}), true);
  assert.equal(await lookupPart('plumbing', fault), null);
  // So is a candidate discovery itself would not call settled.
  rememberPart('plumbing', fault, candidate('1222', {confidence:'medium'}), true);
  assert.equal(await lookupPart('plumbing', fault), null);

  // A sole, question-free, high-confidence resolution is the conclusion the registry exists to keep.
  rememberPart('plumbing', fault, candidate('1222'), true);
  const kept = await lookupPart('plumbing', fault);
  assert.equal(kept?.model, '1222');
});

test('a requirement survives the model rewording its units', async () => {
  const { normalizeIntent } = await import('../lib/intent.ts');
  const note = 'Commercial lighting contactor chatters. Coil is marked 120 V. Frame number is hard to read.';
  const part = {description:'lighting contactor coil',equipment:'commercial lighting contactor',sku:''};
  const intent = value => normalizeIntent({rawContext:'Coil is marked 120 V.',manufacturer:'',fixture:'lighting contactor',symptom:'chatters',
    suspectedPart:'coil',possibleFamily:'',exactModel:'',confidence:0.5,route:'ambiguous',constraints:[{field:'voltage',value}]}, note, part);
  // The note says "120 V"; extraction returns "120 volts" about as often. A literal check dropped the
  // requirement silently, so no voltage check was ever raised against any supplier page.
  for (const wording of ['120 V','120V','120 volts','120 Volts']) assert.equal(intent(wording).constraints.length, 1, wording);
  // A requirement the note does not state is still refused, which is what stops invented defaults.
  assert.equal(intent('240 volts').constraints.length, 0);
});

test('the counts stated in the note open the cart, and a kit covering two faults stays one kit', async () => {
  const { statedQuantities } = await import('../lib/job.ts');
  const job = {summary:'',equipment:'',laborHours:1,parts:[
    {id:'part-1',description:'cartridge',query:'',quantity:4,sku:'',equipment:''},
    {id:'part-2',description:'escutcheon',query:'',quantity:1,sku:'',equipment:''},
    {id:'part-3',description:'trim screws',query:'',quantity:2,sku:'',equipment:''}],questions:[]};
  const discovery = {parts:[{id:'r1',partIds:['part-1']},{id:'r2',partIds:['part-2','part-3']}],unresolved:[],pagesScanned:0,trace:[]};
  const quantities = statedQuantities(discovery, job);
  assert.equal(quantities.r1, 4);                       // four cartridges is four line items' worth
  assert.equal(quantities.r2, 2);                       // one kit answering both faults, at the larger count
  assert.deepEqual(statedQuantities(discovery, null), {});
});

test('an estimate too long for one page breaks instead of printing over its own footer', async () => {
  const { createQuotePdf } = await import('../lib/quote-pdf.ts');
  const { TRADES, buildQuote } = await import('../lib/trades.ts');
  const { PDFDocument } = await import('pdf-lib');
  const pack = TRADES.plumbing;
  const line = i => ({part:{id:`r${i}`,intent:`Item ${i}`,discoveryQuery:'q',discovery:{sku:`SKU-000${i}`,name:`Replacement cartridge assembly, item ${i}`,manufacturer:'Moen',reason:'',pagesScanned:6},compatibility:{verified:true,statement:'',evidence:'',sourceLabel:'',sourceUrl:''},productQuery:'q',listings:[]},
    listing:{supplier:'supplyhouse.com',domain:'supplyhouse.com',url:'https://supplyhouse.com/x',price:42.5+i,badges:[],match:'compatible',stock:'In stock'},qty:2});
  const pageCount = async n => {
    const lines = Array.from({length:n},(_,i)=>line(i+1));
    const quote = buildQuote(lines.map(l=>l.listing.price),lines.map(l=>l.qty),18,2,150);
    const demo = {...pack.demo,customer:'Harborview Property Group',site:'214 Mill Street',laborHours:2,parts:lines.map(l=>l.part)};
    return (await PDFDocument.load(await createQuotePdf({...pack,demo},lines,quote,'Northside Plumbing'))).getPageCount();
  };
  // A short estimate stays on one page; six items used to run the totals off the bottom edge and drop
  // the supplier references entirely, because everything was drawn on a single fixed page.
  assert.equal(await pageCount(1), 1);
  assert.equal(await pageCount(3), 1);
  assert.equal(await pageCount(6), 2);
  assert.equal(await pageCount(12), 3);
});

test('a remembered part cannot answer for a different replacement number', async () => {
  const { lookupPart } = await import('../lib/server/registry.ts');
  // The shipped registry holds a Square D QO220CP: a two-pole 240 V breaker. A note asking for a
  // QO120 shares every description word with it, so descriptor overlap matched and the estimate
  // opened on the wrong breaker, labelled as resolved before and confirmed.
  const breaker = (model) => ({id:'part-1',description:`Square D ${model} circuit breaker`,query:'',quantity:4,sku:model,equipment:'main panel',
    intent:{rawContext:`order four Square D ${model} circuit breakers`,manufacturer:'Square D',fixture:'circuit breaker',symptom:'',
      suspectedPart:'',possibleFamily:'QO series circuit breakers',exactModel:model,confidence:0,route:'ambiguous',constraints:[]}});
  assert.equal(await lookupPart('electrical', breaker('QO120')), null);
  assert.equal((await lookupPart('electrical', breaker('QO220CP')))?.model, 'QO220CP');

  // A designation that names the equipment rather than the replacement still reaches its repair kit:
  // "Sloan Royal 111" is the flushometer, and the part that fixes it is a V-651-A.
  const flushometer = {id:'part-1',description:'flushometer keeps running after flush',query:'',quantity:1,sku:'',equipment:'Sloan Royal 111 flushometer',
    intent:{rawContext:'Royal 111 flushometer keeps running after flush',manufacturer:'Sloan',fixture:'Royal 111 flushometer',symptom:'keeps running after flush',
      suspectedPart:'vacuum breaker sleeve',possibleFamily:'',exactModel:'',confidence:0.5,route:'ambiguous',constraints:[]}};
  assert.equal((await lookupPart('plumbing', flushometer))?.model, 'V-651-A');
});

test('work the estimate does not cover is recorded rather than blocking the print', async () => {
  const { uncoveredWork } = await import('../lib/job.ts');
  const job = {summary:'',equipment:'',laborHours:1,questions:[],parts:[
    {id:'part-1',description:'shower cartridge',query:'',quantity:1,sku:'',equipment:''},
    {id:'part-2',description:'escutcheon plate',query:'',quantity:1,sku:'',equipment:''},
    {id:'part-3',description:'mixing valve body',query:'',quantity:1,sku:'',equipment:''}]};
  const discovery = {parts:[{id:'r1',partIds:['part-1']},{id:'r2',partIds:['part-1']},{id:'r3',partIds:['part-2']}],
    unresolved:[{partId:'part-3',reason:'No candidate with a supported catalogue number was found.'}],pagesScanned:0,trace:[]};

  // One repair quoted, one left for a return visit, one never resolved: the estimate still prints and
  // says so, rather than refusing until every reported fault is covered.
  const excluded = uncoveredWork(job, discovery, id => id === 'r1');
  assert.deepEqual(excluded.map(e => e.label), ['escutcheon plate','mixing valve body']);
  assert.match(excluded[0].reason, /No supplier option was selected/);
  assert.match(excluded[1].reason, /supported catalogue number/);

  // Choosing one of two candidates for a fault covers that fault; the runner-up is not an omission.
  assert.equal(uncoveredWork(job, discovery, id => id === 'r1' || id === 'r3').length, 1);
  // A fully covered job records nothing.
  assert.equal(uncoveredWork({...job, parts: job.parts.slice(0,1)}, discovery, () => true).length, 0);
  assert.deepEqual(uncoveredWork(null, discovery, () => true), []);
});

test('excluded work reaches the printed estimate and paginates with it', async () => {
  const { createQuotePdf } = await import('../lib/quote-pdf.ts');
  const { TRADES, buildQuote } = await import('../lib/trades.ts');
  const { PDFDocument } = await import('pdf-lib');
  const pack = TRADES.plumbing;
  const line = i => ({part:{id:`r${i}`,intent:`Item ${i}`,discoveryQuery:'q',discovery:{sku:`SKU-000${i}`,name:`Replacement cartridge assembly, item ${i}`,manufacturer:'Moen',reason:'',pagesScanned:6},compatibility:{verified:true,statement:'',evidence:'',sourceLabel:'',sourceUrl:''},productQuery:'q',listings:[]},
    listing:{supplier:'supplyhouse.com',domain:'supplyhouse.com',url:'https://supplyhouse.com/x',price:42.5+i,badges:[],match:'compatible',stock:'In stock'},qty:2});
  const build = async (n, exclusions) => {
    const lines = Array.from({length:n},(_,i)=>line(i+1));
    const quote = buildQuote(lines.map(l=>l.listing.price),lines.map(l=>l.qty),18,2,150);
    const demo = {...pack.demo,customer:'Harborview Property Group',site:'214 Mill Street',laborHours:2,parts:lines.map(l=>l.part)};
    return PDFDocument.load(await createQuotePdf({...pack,demo},lines,quote,'Northside Plumbing',exclusions));
  };
  const long = {label:'mixing valve body',reason:'No candidate with a supported catalogue number was found. Add the equipment model or part number, or quote this item as non-catalogue material.'};
  // A short estimate keeps its exclusions on the same page.
  assert.equal((await build(1,[long])).getPageCount(), 1);
  // Enough of them, and the section breaks like everything else rather than printing over the footer.
  assert.equal((await build(3,Array.from({length:8},(_,i)=>({...long,label:`item ${i+1}`})))).getPageCount(), 2);
  // Nothing excluded means no section and no extra page.
  assert.equal((await build(3,[])).getPageCount(), 1);
});
