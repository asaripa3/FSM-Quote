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
function mockFetch(t,{ambiguous=false,failContents=false,parts=null,equipment='Moen shower'}={}){
 const calls=[];const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(url,init)=>{
  const body=JSON.parse(init.body);calls.push({url:String(url),body});
  if(String(url).includes('chat/completions'))return reply({choices:[{message:{content:JSON.stringify({summary:'Shower repair',equipment,laborHours:.75,brief:{equipment:'Moen single-handle shower',manufacturer:'Moen',model:'',serial:'',faultCodes:[],symptoms:['drips after shutoff'],alreadyChecked:[],stillUncertain:ambiguous?['cartridge model not identified']:[]},parts:parts??[ambiguous?{...part,sku:'',intent:{...intent,exactModel:'',route:'ambiguous',confidence:.6,rawContext:'Older Moen single handle shower drips; cartridge model unknown.'}}:part],questions:[]})}}]});
  if(String(url).endsWith('/search')&&body.outputSchema?.properties?.repairPaths)return reply({requestId:'research',resolvedSearchType:'neural',costDollars:{total:.007},
    results:[{url:'https://www.moen.com/support/cartridge-identification',title:'Moen cartridge identification',highlights:['Posi-Temp valves built after 1993 use the 1222 cartridge. Confirm the valve body stamp before ordering.']},
             {url:'https://www.youtube.com/watch?v=abc',title:'Replacing a seized Moen cartridge',highlights:['Pull the retaining clip before the puller goes on, or the brass will gall.']}],
    output:{content:{evidenceSummary:'Moen documentation ties a dripping single-handle Posi-Temp valve to a seized cartridge, and says to identify the valve body before ordering.',contradicts:'',
      checkBeforeReplacing:['Read the valve body stamp','Check the retaining clip is intact'],
      repairPaths:[{component:'Posi-Temp cartridge',rationale:'Documented cause of drip after shutoff.',confirmBy:'Valve body stamp reads Posi-Temp.',support:'Posi-Temp valves built after 1993 use the 1222 cartridge.'},
                   {component:'No part required, seized retaining clip',rationale:'A galled clip presents the same symptom.',confirmBy:'Clip releases by hand.',support:'Pull the retaining clip before the puller goes on'}]}},
    grounding:[]});
  if(String(url).endsWith('/search')&&!body.category)return reply({requestId:'discover',results:[{url:'https://manufacturer.example/cartridge',text:'Moen 1222 cartridge is a Posi-Temp replacement cartridge.',title:'Moen cartridge guide'}],output:{content:{parts:[{name:'Moen 1222 cartridge',manufacturer:'Moen',partNumber:'1222',sku:'',coversFaults:['part-1'],reason:'Candidate only. Check the valve family.',evidence:'Moen 1222 cartridge is a Posi-Temp replacement cartridge.',conflicts:[],questions:['Is this a Posi-Temp valve?']}]},grounding:[{field:'parts[0].name',confidence:'high',citations:[{url:'https://manufacturer.example/cartridge'}]}]},costDollars:{total:.01}});
  if(String(url).endsWith('/search'))return reply({requestId:'product',results:[{url:supplier,title:'Moen 1222 cartridge'}],costDollars:{total:.005}});
  if(String(url).endsWith('/contents')){if(failContents)return reply({results:[],statuses:[{id:supplier,status:'error'}]});return reply({requestId:'contents',results:[{url:supplier,text,summary:JSON.stringify(summary)}],statuses:[{id:supplier,status:'success',source:'live'}],costDollars:{total:.005}});}
  throw Error('Unexpected provider '+url);
 };return calls;
}
async function run(rawNote=note,confirmed){const events=[];const response=await POST(new Request('http://localhost/api/quote-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({trade:'plumbing',note:rawNote,confirmed,settings:{region:'United States',supplierDomains:''}})}));assert.equal(response.status,200);await readEventStream(response,(event,data)=>events.push({event,data}));return events;}

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
 assert.deepEqual(events.find(e=>e.event==='intent_routed').data,{exact:['part-1'],registry:[],sourced:[],tools:[],ambiguous:[],superseded:[]});
 const result=events.find(e=>e.event==='supplier_results').data;
 assert.equal(result.sources[0].price,41.98);assert.equal(result.sources[0].url,supplier);assert.equal(result.sources[0].packQuantity,1);
 for(const stage of ['understanding_input','searching_products','validating_results','comparing_suppliers','complete'])assert.ok(events.some(e=>e.event===stage));
 assert.ok(!events.some(e=>e.event==='resolving_part'));
});
test('an uncertain note is researched and then stops, with nothing sourced or priced',async t=>{
 const calls=mockFetch(t,{ambiguous:true}),events=await run('Older Moen single handle shower drips; cartridge model unknown.');
 const searches=calls.filter(c=>c.url.endsWith('/search'));

 // One broad research search, asking for both views of each page. The highlight is what the
 // technician reads; the whole document is what a claim is checked against, because the extraction
 // reasons over everything Exa retrieved. Measured on the Carrier fault code: verifying against the
 // 1800-character excerpt anchored none of the paths generated, verifying against the text anchored
 // all of them, and the two calls cost $0.0070 either way.
 assert.equal(searches.length,1);
 assert.ok(searches[0].body.contents.highlights.query);
 assert.equal(searches[0].body.contents.text,true);
 assert.equal(searches[0].body.category,undefined);

 // Nothing is sourced and nothing is priced before the technician has decided.
 assert.equal(calls.filter(c=>c.url.endsWith('/contents')).length,0);
 assert.ok(!events.some(e=>e.event==='supplier_results'));
 assert.ok(!events.some(e=>e.event==='discovery_complete'));

 const packet=events.find(e=>e.event==='research_complete').data;
 assert.match(packet.evidenceSummary,/Posi-Temp/);
 // Nothing in this note is contradicted by the documentation, so the correction stays empty.
 assert.equal(packet.contradicts,'');
 assert.equal(packet.checkBeforeReplacing.length,2);
 // A path that needs no part at all is a real answer, and the schema has to be able to say so.
 assert.ok(packet.repairPaths.some(p=>/no part required/i.test(p.component)));
 // The level comes from where each support was found, never from a label the model wrote: the
 // cartridge quote is on Moen's own page, the clip quote only on the video.
 assert.deepEqual(packet.repairPaths.map(p=>p.evidenceLevel),['oem','field_only']);
 assert.match(packet.repairPaths[0].support,/Posi-Temp valves built after 1993/);
 assert.equal(packet.repairPaths[0].sourceUrls[0],'https://www.moen.com/support/cartridge-identification');
 // Both are classified rather than listed raw, and the manufacturer's own page leads.
 assert.equal(packet.sources[0].kind,'oem');
 assert.equal(packet.sources.find(s=>s.domain==='youtube.com').kind,'practitioner');
 // This note names no plate designation, so even Moen's own page can only be tied to the maker.
 // Authority needs the manufacturer AND the machine, so it is corroboration and says so.
 assert.equal(packet.sources[0].match,'manufacturer');
 assert.equal(packet.sources[0].strength,'corroborating');
 assert.ok(events.some(e=>e.event==='awaiting_confirmation'));
});

test('the technician confirming the repair is what starts sourcing',async t=>{
 const calls=mockFetch(t),events=await run('Older Moen single handle shower drips; cartridge model unknown.',
   {component:'Moen 1222 cartridge',findings:'Valve body stamp reads Posi-Temp. Cartridge is seized.'});

 // No research on this phase: the question it answers has been answered on site.
 assert.equal(calls.filter(c=>c.url.endsWith('/search')&&c.body.outputSchema?.properties?.repairPaths).length,0);
 // The confirmed component reaches the product search, and the page is read to verify its price.
 assert.ok(calls.some(c=>c.url.endsWith('/search')&&c.body.category==='product'));
 assert.ok(calls.some(c=>c.url.endsWith('/contents')));
 assert.equal(events.find(e=>e.event==='supplier_results').data.sources[0].price,41.98);
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
  const job = {summary:'',equipment:'',laborHours:1,knownParts:[
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
  const { rememberPart, lookupPart } = await import('../lib/server/registry.ts');
  // Nothing is pre-loaded, so the record has to be earned first: this is a conclusion the contractor's
  // own technician confirmed, not a part conclusion shipped with the app.
  const breaker = (model) => ({id:'part-1',description:`Square D ${model} circuit breaker`,query:'',quantity:4,sku:model,equipment:'main panel',
    intent:{rawContext:`order four Square D ${model} circuit breakers`,manufacturer:'Square D',fixture:'circuit breaker',
      suspectedPart:'',subject:`Square D ${model} circuit breaker`,ruledOut:[],supersedes:[],exactModel:model,route:'ambiguous',constraints:[]}});
  rememberPart('electrical', breaker('QO220CP'), {id:'r1',partIds:['part-1'],name:'Square D QO 20 Amp 2-Pole Circuit Breaker',
    manufacturer:'Square D',partNumber:'QO220CP',sku:'577014',reason:'',evidence:'20-amp double pole rating',verified:true,
    sourceUrl:'https://example.test/qo220cp',sourceLabel:'example.test',supporting:[],searchQuery:'Square D QO220CP',
    route:'ambiguous',confidence:'high',constraints:[],conflicts:[],questions:[]});

  // The QO120 shares every description word with it and is a different breaker: one pole, not two.
  assert.equal(await lookupPart('electrical', breaker('QO120')), null);
  assert.equal((await lookupPart('electrical', breaker('QO220CP')))?.model, 'QO220CP');

  // A fresh trade has nothing remembered at all, because nothing ships pre-loaded.
  const flushometer = {id:'part-1',description:'flushometer keeps running after flush',query:'',quantity:1,sku:'',equipment:'Sloan Royal 111 flushometer',
    intent:{rawContext:'Royal 111 flushometer keeps running after flush',manufacturer:'Sloan',fixture:'Royal 111 flushometer',
      suspectedPart:'vacuum breaker sleeve',subject:'vacuum breaker sleeve',ruledOut:[],supersedes:[],exactModel:'',route:'ambiguous',constraints:[]}};
  assert.equal(await lookupPart('plumbing', flushometer), null);
});

test('work the estimate does not cover is recorded rather than blocking the print', async () => {
  const { uncoveredWork } = await import('../lib/job.ts');
  const job = {summary:'',equipment:'',laborHours:1,questions:[],knownParts:[
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
  assert.equal(uncoveredWork({...job, knownParts: job.knownParts.slice(0,1)}, discovery, () => true).length, 0);
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

test('the procurement subject is what gets sourced, not what failed', async () => {
  const { normalizeIntent, groundedIdentifier, subjectCandidate } = await import('../lib/intent.ts');
  const note = 'Equipment plate says this is an InSinkErator Badger 5, Model 5-87A, 1/2 horsepower. The motor inside the disposal has most likely failed, so I would replace the disposal unit rather than try to repair the motor.';
  const raw = {rawContext:'replace the disposal unit rather than try to repair the motor',manufacturer:'InSinkErator',
    fixture:'garbage disposal',symptom:'motor not responding',suspectedPart:'motor inside disposal',
    subject:'InSinkErator Badger 5 Model 5-87A',failureCause:'internal motor failure',
    ruledOut:['motor repair','wiring repair','flange replacement'],
    supersedes:[{subject:'disposal motor',reason:'technician explicitly chose whole-unit replacement instead of motor repair'}],
    possibleFamily:'',exactModel:'',route:'ambiguous',constraints:[]};
  const part = {id:'part-1',description:'Replacement garbage disposal compatible with InSinkErator Badger 5, Model 5-87A',
    quantity:1,sku:'',equipment:'InSinkErator Badger 5, Model 5-87A',kind:'unit'};
  const intent = normalizeIntent(raw, note, part);

  // The motor is what failed; the disposal is what gets bought. Searching for the first found nothing.
  assert.equal(intent.suspectedPart, 'motor inside disposal');
  assert.equal(intent.subject, 'InSinkErator Badger 5 Model 5-87A');
  assert.deepEqual(intent.ruledOut, ['motor repair','wiring repair','flange replacement']);
  assert.equal(intent.supersedes[0].subject, 'disposal motor');

  // A designation inside the subject is enough to price against, so this skips discovery entirely.
  const withIntent = {...part, intent};
  assert.equal(groundedIdentifier(withIntent), 'Badger 5');
  const candidate = subjectCandidate(withIntent);
  assert.equal(candidate.partNumber, 'Badger 5');
  assert.match(candidate.searchQuery, /InSinkErator Badger 5 Model 5-87A/);

  // A tool named without any model number still has nothing to price against, so it still gets researched.
  const puller = {id:'part-2',description:'Moen cartridge puller',quantity:1,sku:'',equipment:'Moen shower valve',kind:'tool',
    intent:{...raw,subject:'Moen cartridge puller',supersedes:[],ruledOut:[]}};
  assert.equal(groundedIdentifier(puller), '');

  // A supersession only holds when the model gave both halves of it.
  const half = normalizeIntent({...raw, supersedes:[{subject:'disposal motor'},{reason:'no subject'}]}, note, part);
  assert.equal(half.supersedes.length, 0);
});

test('work another line replaces is not quoted twice', async () => {
  const { describesSameWork } = await import('../lib/intent.ts');
  // The same repair, written two ways in one note: reported one way, ruled out another.
  assert.ok(describesSameWork('disposal motor', 'motor inside disposal'));
  assert.ok(describesSameWork('heat exchanger', 'cracked heat exchanger on the furnace'));
  assert.ok(describesSameWork('the replacement motor assembly', 'motor'));
  // Close wording that is genuinely different work must not collapse.
  assert.equal(describesSameWork('disposal motor', 'disposal flange'), false);
  assert.equal(describesSameWork('condenser fan motor', 'condenser coil'), false);
  assert.equal(describesSameWork('', 'motor'), false);
});


test('a whole-unit replacement is sourced directly and its failed component is not quoted twice', async t => {
  // The note the app used to answer with nothing: the motor failed, the technician replaces the
  // appliance. The extraction calls the line item a "part" because that is how the line reads.
  const disposalIntent = {rawContext:'replace the disposal unit rather than try to repair the motor',
    manufacturer:'InSinkErator',fixture:'garbage disposal',symptom:'motor not responding',
    suspectedPart:'motor inside the disposal',subject:'InSinkErator Badger 5, Model 5-87A',
    failureCause:'internal motor failure',ruledOut:['motor repair'],supersedes:[],
    possibleFamily:'',exactModel:'',route:'ambiguous',constraints:[]};
  const disposal = {id:'part-1',description:'Replacement garbage disposal compatible with InSinkErator Badger 5',
    quantity:1,sku:'',equipment:'InSinkErator Badger 5, Model 5-87A',kind:'part',intent:disposalIntent};
  const motor = {id:'part-2',description:'motor inside the disposal',quantity:1,sku:'',
    equipment:'InSinkErator Badger 5, Model 5-87A',kind:'part',
    intent:{...disposalIntent,subject:'disposal motor',suspectedPart:'disposal motor',supersedes:[]}};

  const calls = mockFetch(t, {parts:[disposal,motor], equipment:'InSinkErator Badger 5, Model 5-87A'});
  const events = await run('Motor inside the InSinkErator Badger 5, Model 5-87A has failed. Replace the disposal unit rather than repair the motor.');
  const routed = events.find(e => e.event === 'intent_routed').data;

  // What the technician intends to source is the equipment itself, so this is a unit replacement and
  // the designation inside the subject is enough to price against: no discovery call at all.
  assert.deepEqual(routed.sourced, ['part-1']);
  assert.deepEqual(routed.ambiguous, []);
  assert.equal(calls.filter(c => c.url.endsWith('/search') && !c.body.category).length, 0, 'no discovery search');

  // Replacing the whole disposal covers its motor, so the motor is not researched, priced or quoted.
  assert.deepEqual(routed.superseded, ['part-2']);
  const discovery = events.find(e => e.event === 'discovery_complete').data;
  assert.equal(discovery.superseded.length, 1);
  assert.match(discovery.superseded[0].reason, /Covered by replacing/);
  assert.ok(!discovery.parts.some(r => r.partIds.includes('part-2')));
  assert.ok(!discovery.unresolved.some(u => u.partId === 'part-2'), 'superseded work is not reported as unresolved');

  // The search Exa receives is the appliance, not the component that failed.
  const product = calls.find(c => c.url.endsWith('/search') && c.body.category === 'product');
  assert.match(product.body.query, /Badger 5/);
  assert.ok(!/motor/i.test(product.body.query), 'the failed component is not what gets searched');
});

test('a unit replacement is filed under the equipment, not the component that failed', async () => {
  const { registryKey, rememberPart, lookupPart } = await import('../lib/server/registry.ts');
  const base = {rawContext:'replace the disposal unit rather than repair the motor',manufacturer:'InSinkErator',
    fixture:'kitchen sink garbage disposal',ruledOut:['motor repair'],supersedes:[],exactModel:'',route:'ambiguous',constraints:[]};
  const disposal = {id:'part-1',description:'Replacement garbage disposal',quantity:1,sku:'',kind:'unit',
    equipment:'kitchen sink garbage disposal',
    intent:{...base, suspectedPart:'motor', subject:'InSinkErator Badger 5, Model 5-87A'}};

  // Keyed on what is being bought. Keying on the failed component would file an appliance under "motor".
  const key = registryKey('plumbing','InSinkErator Badger 5, Model 5-87A','kitchen sink garbage disposal','InSinkErator');
  assert.ok(key.includes('badger'));
  assert.ok(!key.includes('motor'));

  rememberPart('plumbing', disposal, {id:'r1',partIds:['part-1'],name:'InSinkErator Badger 5 Garbage Disposal',
    manufacturer:'InSinkErator',partNumber:'Badger 5',sku:'',reason:'',evidence:'Badger 5 1/2 HP continuous feed disposal',
    verified:true,sourceUrl:'https://insinkerator.example/badger-5',sourceLabel:'insinkerator.example',supporting:[],
    searchQuery:'InSinkErator Badger 5',route:'ambiguous',confidence:'high',constraints:[],conflicts:[],questions:[]});

  // The same job again gets the appliance back.
  assert.equal((await lookupPart('plumbing', disposal))?.partNumber ?? (await lookupPart('plumbing', disposal))?.model, 'Badger 5');

  // A different technician asking for a disposal motor must not be handed the whole appliance, even
  // though both notes share every word of "kitchen sink garbage disposal".
  const motorOnly = {id:'part-9',description:'disposal motor',quantity:1,sku:'',kind:'part',
    equipment:'kitchen sink garbage disposal',
    intent:{...base, ruledOut:[], suspectedPart:'disposal motor', subject:'disposal motor'}};
  assert.equal(await lookupPart('plumbing', motorOnly), null);
});

test('a priced row carries its price into the estimate even when the page is silent on pack size', async () => {
  const { openingPrice } = await import('../lib/job.ts');
  // Measured over twelve real supplier rows, exactly one stated a pack size of one. Requiring that
  // put $0.00 in the estimate for three of every four priced rows.
  assert.equal(openingPrice({price:89.1, packQuantity:null}), 89.1);
  assert.equal(openingPrice({price:88.76, packQuantity:1}), 88.76);
  // A stated multi-pack still carries its price; the row and the estimate line both say it is a pack,
  // and the unit cost is the estimator's to set before the line can be confirmed.
  assert.equal(openingPrice({price:42, packQuantity:10}), 42);
  // A row with no accepted price still contributes nothing.
  assert.equal(openingPrice({price:null, packQuantity:null}), 0);
});


test('a fault the documentation contradicts is stated as a correction, not buried in the summary',async t=>{
 // The run this guards: a technician reported "fault code 31" on a Carrier IGC, which reports faults
 // as one to nine LED flashes and has no code 31. Replacing a part on a misread code is the expensive
 // mistake, so the correction gets its own field rather than a sentence inside the prose.
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(url,init)=>{
  const body=JSON.parse(init.body);
  if(String(url).includes('chat/completions'))return Response.json({choices:[{message:{content:JSON.stringify({summary:'Rooftop unit',equipment:'Carrier rooftop unit',laborHours:null,
    brief:{equipment:'Carrier rooftop unit',manufacturer:'Carrier',model:'',serial:'',faultCodes:['31'],symptoms:['inducer runs, burners never light'],alreadyChecked:[],stillUncertain:['pressure switch not tested']},
    parts:[],questions:[]})}}]});
  if(String(url).endsWith('/search')&&body.outputSchema?.properties?.repairPaths)return Response.json({requestId:'r',costDollars:{total:.007},
    results:[{url:'https://www.carrier.com/48tc-service.pdf',title:'48TC service manual',highlights:['The IGC LED reports faults as 1 to 9 flashes.']}],
    output:{content:{evidenceSummary:'The IGC uses a self-diagnostic LED.',
      contradicts:'The 48TC IGC reports faults as 1 to 9 LED flashes; there is no code 31. Five flashes is an ignition lockout.',
      contradictsSupport:'The IGC LED reports faults as 1 to 9 flashes.',
      checkBeforeReplacing:['Observe the IGC LED through the viewport and count the flash sequence.'],
      repairPaths:[]}}});
  if(String(url).endsWith('/search'))return Response.json({requestId:'f',costDollars:{total:.007},results:[]});
  throw Error('unexpected '+url);
 };
 const events=[];
 const response=await POST(new Request('http://localhost/api/quote-stream',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({trade:'hvac',note:'Carrier rooftop unit. Fault code 31. Inducer runs, burners never light. Pressure switch not tested yet.',settings:{region:'United States',supplierDomains:''}})}));
 await readEventStream(response,(event,data)=>events.push({event,data}));
 const packet=events.find(e=>e.event==='research_complete').data;

 assert.match(packet.contradicts,/no code 31/);
 // Nothing is proposed to replace while the reported fault is wrong.
 assert.equal(packet.repairPaths.length,0);
 // And the checks say how to establish the real one.
 assert.match(packet.checkBeforeReplacing[0],/LED/);
 assert.ok(events.some(e=>e.event==='awaiting_confirmation'));
});

test('sourcing a confirmed repair spends no model call, so a failed retry costs nothing extra',async t=>{
 const calls=mockFetch(t);
 await run('Older Moen single handle shower drips; cartridge model unknown.',
   {component:'Moen 1222 cartridge',findings:'Valve body stamp reads Posi-Temp.',equipment:'Moen shower',manufacturer:'Moen'});
 // The note was understood in phase one and the technician has since decided what phase one could not.
 // Re-reading it would spend a call to rediscover the confirmation, and add a second place a retry
 // could fail. Retrying sourcing must not re-run the diagnosis.
 assert.equal(calls.filter(c=>c.url.includes('chat/completions')).length,0);
 assert.ok(calls.some(c=>c.url.endsWith('/search')&&c.body.category==='product'));
});

test('a failed practitioner top-up keeps the documentation packet and says what was lost',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 let searches=0;
 globalThis.fetch=async(url,init)=>{
  const body=JSON.parse(init.body);
  if(String(url).includes('chat/completions'))return Response.json({choices:[{message:{content:JSON.stringify({summary:'Rooftop',equipment:'Carrier rooftop unit',laborHours:null,
    brief:{equipment:'Carrier rooftop unit',manufacturer:'Carrier',model:'',serial:'',faultCodes:['5 flashes'],symptoms:['burners never light'],alreadyChecked:[],stillUncertain:['switch not tested']},
    parts:[],questions:[]})}}]});
  if(String(url).endsWith('/search')&&body.outputSchema?.properties?.repairPaths){searches++;return Response.json({requestId:'r',costDollars:{total:.007},
    results:[{url:'https://www.carrier.com/48tc.pdf',title:'48TC manual',highlights:['Five flashes indicates an ignition lockout fault.']}],
    output:{content:{evidenceSummary:'Five flashes is an ignition lockout.',contradicts:'',checkBeforeReplacing:['Check the igniter gap'],
      repairPaths:[{component:'Igniter',rationale:'Documented cause.',confirmBy:'Measure the gap.',support:'Five flashes indicates an ignition lockout fault.'}]}}});}
  // The top-up is the only call that fails.
  if(String(url).endsWith('/search'))throw Error('field search timed out');
  throw Error('unexpected '+url);
 };
 const events=[];
 const response=await POST(new Request('http://localhost/api/quote-stream',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({trade:'hvac',note:'Carrier rooftop unit. Five flashes on the board. Burners never light. Switch not tested.',settings:{region:'United States',supplierDomains:''}})}));
 await readEventStream(response,(event,data)=>events.push({event,data}));
 const packet=events.find(e=>e.event==='research_complete').data;

 // The run is not a failure: the documentation stands, and the gap is stated rather than left blank.
 assert.equal(searches,1);
 assert.equal(packet.fieldSourcesUnavailable,true);
 assert.match(packet.evidenceSummary,/ignition lockout/);
 assert.equal(packet.repairPaths.length,1);
 assert.equal(packet.sources.length,1);
 assert.ok(events.some(e=>e.event==='awaiting_confirmation'));
 assert.ok(!events.some(e=>e.event==='error'));
});

test('uncertain Moen observations with parser questions automatically research without a chosen part',async t=>{
 const calls=mockFetch(t,{ambiguous:true,parts:[]});
 const provider=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  const response=await provider(url,init);
  if(!String(url).includes('chat/completions'))return response;
  const body=await response.json(),parsed=JSON.parse(body.choices[0].message.content);
  parsed.questions=['What is the exact cartridge number?','Has the cartridge been removed?','Is the cartridge the cause?'];
  body.choices[0].message.content=JSON.stringify(parsed);
  return reply(body);
 };
 const events=await run('Older Moen single handle shower drips; cartridge model unknown. Handle and trim are fine. Cartridge has not been removed or confirmed as the cause.');
 const parsed=events.find(e=>e.event==='job_parsed').data;
 assert.equal(parsed.brief.needsResearch,true);
 assert.equal(parsed.knownParts.length,0);
 assert.equal(parsed.questions.length,3);
 const names=events.map(e=>e.event);
 assert.ok(names.indexOf('retrieving_knowledge')>names.indexOf('job_parsed'));
 assert.ok(names.indexOf('research_complete')>names.indexOf('retrieving_knowledge'));
 assert.equal(names.at(-1),'awaiting_confirmation');
 assert.ok(!names.includes('discovery_complete'));
 assert.ok(!calls.some(c=>c.body.category==='product'));
 assert.ok(events.find(e=>e.event==='research_complete').data.checkBeforeReplacing.length>0);
});

test('a confirmed repair is searched for by the work, not by the findings sentence',async t=>{
 const calls=mockFetch(t);
 await run('Carrier rooftop unit not cooling. Inducer runs, ignition does not proceed. Replacement switch must have a 120 V coil.\n\nEquipment plate: 48TCED08A2A6',
   {component:'pressure switch',findings:'Draft is normal. Switch has failed continuity.',
    equipment:'rooftop unit',manufacturer:'Carrier',model:'48TCED08A2A6',constraints:[{field:'voltage',value:'120 V'}]});
 const discovery=calls.filter(c=>c.url.endsWith('/search')&&c.body.outputSchema?.properties?.parts);
 // The discovery query for an uncertain item is composed from the item's own context, so a
 // confirmation whose context was the findings alone searched Exa for "Draft is normal. Switch has
 // failed continuity." and named neither the machine nor the component anywhere in the query.
 assert.equal(discovery.length,1);
 assert.match(discovery[0].body.query,/pressure switch/i);
 assert.match(discovery[0].body.query,/48TCED08A2A6/);
 assert.doesNotMatch(discovery[0].body.query,/Draft is normal/i);
 // A component the technician has tested is decided. The alternatives pass explores other product
 // families and is told not to pick one, which is the wrong question and the more expensive call.
 assert.notEqual(discovery[0].body.type,'deep-lite');
 assert.match(discovery[0].body.systemPrompt,/ITEMS ALREADY CHOSEN/);
 assert.match(discovery[0].body.systemPrompt,/\[confirmed\] pressure switch/);
 // The requirement keeps the name the technician's own note gave it. Carried through the route it
 // reads "voltage 120 V"; recovered from the note because the route dropped it, "stated requirement".
 assert.match(discovery[0].body.systemPrompt,/voltage 120 V/);
});

test('a confirmed repair is never filed under a reported item id',async t=>{
 mockFetch(t);
 const events=await run('Older Moen single handle shower drips; cartridge model unknown.',
   {component:'Moen 1222 cartridge',findings:'Cartridge is seized.',equipment:'Moen shower',manufacturer:'Moen'});
 const routed=events.find(e=>e.event==='intent_routed').data;
 // The parser numbers reported items from one and the job stays on screen through confirmation, so
 // sharing `part-1` made the estimate label this candidate with an unrelated reported item and count
 // that item as quoted. Which route it takes depends on whether it names a model and on what this
 // company has resolved before; that it is never `part-1` does not.
 const ids=Object.values(routed).flat();
 assert.deepEqual(ids,['confirmed-1']);
 for(const id of events.find(e=>e.event==='discovery_complete').data.parts.flatMap(p=>p.partIds))
   assert.equal(id,'confirmed-1');
});

test('a component the pages identify is not refused for failing to name the whole machine',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>Response.json({results:[{url:'https://supplyhouse.example/ps',title:'Pressure switch',
   text:'Universal air pressure switch, order number PS-1234. Fits many furnace and rooftop applications.'}],
   output:{content:{parts:[{name:'Pressure switch',manufacturer:'Generic',partNumber:'PS-1234',sku:'PS-1234',
     coversFaults:['confirmed-1'],reason:'Matches the reported switch.',
     evidence:'Universal air pressure switch, order number PS-1234.',conflicts:[],questions:[]}]}}});
 const { discoverParts }=await import('../lib/server/discovery.ts');
 const item={id:'confirmed-1',description:'pressure switch',equipment:'Carrier 48TCED08A2A6 packaged rooftop unit',sku:'',kind:'part',
   intent:{rawContext:'x',manufacturer:'Carrier',fixture:'',suspectedPart:'',subject:'pressure switch',ruledOut:[],supersedes:[],exactModel:'',route:'ambiguous',constraints:[]}};
 // The grounding check asks whether the retrieved pages mention the machine. That is right for a
 // fault and wrong for a decided component: a genuine switch listing carries the switch's own
 // identifiers, never a rooftop unit's plate designation, so the confirmed repair was refused outright.
 assert.equal((await discoverParts([item])).parts.length,0);
 assert.equal((await discoverParts([{...item,decided:true}])).parts.length,1);
});

test('documentation that could not be retrieved is not reported as documentation that disagrees',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>Response.json({
   // Both results are on the manufacturer's own domain and both excerpts are site furniture, which
   // is what a real Carrier run returned. Every page is dropped, and every claim below is bound to a
   // page, except the summary and the checks — which then narrate a machine nothing was read for.
   results:[{url:'https://www.carrier.com/search',title:'Document search',highlights:['Skip to main content Sign in Create an account My account Search by model number']},
            {url:'https://www.carrier.com/literature',title:'Literature',highlights:['Add to cart View cart Checkout Newsletter Cookie Privacy policy All rights reserved']}],
   output:{content:{evidenceSummary:'The 48TC IGC reports faults as 1 to 9 LED flashes and has no code 31.',
     contradicts:'This equipment has no code 31.',contradictsSupport:'',
     checkBeforeReplacing:['Read the IGC LED flash sequence'],repairPaths:[]}}});
 const { researchJob }=await import('../lib/server/research.ts');
 const packet=await researchJob({equipment:'rooftop unit',manufacturer:'Carrier',model:'48TCED08A2A6',serial:'',
   faultCodes:['31'],symptoms:['not cooling'],alreadyChecked:[],stillUncertain:['cause unknown'],constraints:[],needsResearch:true},[]);
 assert.equal(packet.documentationUnavailable,true);
 assert.equal(packet.sources.length,0);
 assert.equal(packet.evidenceSummary,'');
 assert.deepEqual(packet.checkBeforeReplacing,[]);
 assert.equal(packet.contradicts,'');
});

test('a mirrored service manual is neither the manufacturer nor a field report',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const quote='The IGC reports a pressure switch fault when the inducer proves no negative pressure at startup.';
 globalThis.fetch=async()=>Response.json({
   results:[{url:'https://www.manualslib.com/manual/48tc/carrier.html',title:'Carrier 48TC service manual',
     highlights:[`Carrier 48TCED08A2A6 service instructions. ${quote} Inspect the hose for obstruction.`]}],
   output:{content:{evidenceSummary:'x',contradicts:'',contradictsSupport:'',checkBeforeReplacing:[],
     repairPaths:[{component:'Pressure switch hose',rationale:'A blocked hose prevents proof of draft.',
       confirmBy:'Disconnect and inspect the hose.',support:quote}]}}});
 const { researchJob }=await import('../lib/server/research.ts');
 const packet=await researchJob({equipment:'rooftop unit',manufacturer:'Carrier',model:'48TCED08A2A6',serial:'',
   faultCodes:['31'],symptoms:['not cooling'],alreadyChecked:[],stillUncertain:['cause unknown'],constraints:[],needsResearch:true},[]);
 // A live Carrier run backed both of its surviving paths out of manualsdir and manualslib, copies of
 // the Carrier manual, and both read "Field reports only" beside a source marked "Unverified".
 assert.equal(packet.sources[0].kind,'mirror');
 assert.equal(packet.sources[0].strength,'corroborating');
 assert.equal(packet.repairPaths[0].evidenceLevel,'documented');
});

test('a repair that needs no part still produces an estimate', async () => {
 const { createQuotePdf }=await import('../lib/quote-pdf.ts');
 const { TRADES, buildQuote }=await import('../lib/trades.ts');
 const pack={...TRADES.hvac,demo:{...TRADES.hvac.demo,customer:'Northgate Retail Park',site:'Roof, unit 2',laborHours:1,parts:[]}};
 // The research prompt asks for paths that need no replacement part and returns them; printing used to
 // require a priced line, so the flow could dead-end on its own best answer.
 const quote=buildQuote([],[],30,1,165);
 assert.equal(quote.partsSubtotal,0);assert.equal(quote.labor,165);assert.equal(quote.total,165);
 const bytes=await createQuotePdf(pack,[],quote,'Northgate HVAC',[],
   {component:'Venting system',findings:'Flue was blocked with a bird nest. Cleared it, unit fired normally after.'});
 // One page, and it says on its face that no part was required rather than leaving a blank item list
 // above a total with nothing behind it.
 const { PDFDocument }=await import('pdf-lib');
 assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
 assert.ok(bytes.length>1000);
});

test('an identifier never carries half of the maker into the price check',async()=>{
 const { groundedIdentifier, subjectCandidate, withoutMaker }=await import('../lib/intent.ts');
 const breaker=id=>({id:'part-1',description:'20 amp single pole breaker',quantity:1,sku:'',equipment:'Square D QO load center',
   intent:{rawContext:'x',manufacturer:'Square D',fixture:'',suspectedPart:'breaker',subject:id,ruledOut:[],supersedes:[],exactModel:'',route:'ambiguous',constraints:[]}});
 // A two-word maker used to leave its last word behind. Measured over the same six supplier pages at
 // the same cost: "D QO120" returned one priced row and one identifier match, "QO120" four and five,
 // because the extraction cannot find a half-maker on a page that writes "Part Number: QO120".
 assert.equal(groundedIdentifier(breaker('Square D QO120')),'QO120');
 assert.equal(subjectCandidate(breaker('Square D QO120')).partNumber,'QO120');
 // The search phrase still names the maker; only the identifier drops it.
 assert.match(subjectCandidate(breaker('Square D QO120')).searchQuery,/Square D QO120/);
 // A designation that is genuinely two words keeps both, and a maker that is not a prefix is untouched.
 assert.equal(groundedIdentifier(breaker('InSinkErator Badger 5 Model 5-87A')),'Badger 5');
 assert.equal(withoutMaker('QO120','Square D'),'QO120');
 assert.equal(withoutMaker('Squared Away 12','Square'),'Squared Away 12');
 // One field writes the company one way and another writes it another way, for the same company.
 assert.equal(withoutMaker('Square-D QO120','Square D'),'QO120');
 assert.equal(withoutMaker('SquareD QO120','Square D'),'QO120');
 assert.equal(withoutMaker('Square D QO120','Square-D'),'QO120');
 // A subject that is only the maker's name is left alone rather than emptied.
 assert.equal(withoutMaker('Square D','Square D'),'Square D');
 assert.equal(withoutMaker('','Square D'),'');
});

test('a documented path that states no on-site check can still be confirmed',async()=>{
 const { decisionGate, confirmDecision }=await import('../lib/confirmation.ts');
 const brief={equipment:'rooftop unit',manufacturer:'Carrier',model:'48TCED08A2A6',serial:'',faultCodes:['31'],
   symptoms:[],alreadyChecked:[],stillUncertain:[],constraints:[],needsResearch:true};
 const base={selected:0,pathCount:2,typedComponent:'',result:'',notes:'',quantity:1,action:'replace'};
 const withCheck={component:'Pressure switch',confirmBy:'Meter across the switch terminals.'};
 const noCheck={component:'Vent system',confirmBy:''};

 // A path that names its test confirms against that test, as before.
 const normal=decisionGate({...base,path:withCheck,result:'supports'});
 assert.equal(normal.other,false);
 assert.equal(normal.unchecked,false);
 assert.equal(normal.component,'Pressure switch');
 assert.equal(normal.check,'Meter across the switch terminals.');
 assert.equal(normal.ready,true);

 // A path with no stated test used to leave the button disabled for good, while the screen told the
 // technician to "record an independent finding instead" and offered no way to do it. It takes the
 // independent route, which has a real check string, so the decision still carries why it was made.
 const blocked=decisionGate({...base,path:noCheck,result:'supports'});
 assert.equal(blocked.unchecked,true);
 assert.equal(blocked.other,true);
 assert.equal(blocked.ready,false);
 assert.match(blocked.blocker,/Name the component/);
 const done=decisionGate({...base,path:noCheck,typedComponent:'Vent system',result:'different',notes:'Flue was blocked. Cleared it.'});
 assert.equal(done.ready,true);
 assert.equal(done.blocker,'');
 assert.match(done.check,/documentation states none/);
 // And the confirmation it produces is accepted rather than thrown out for a missing check.
 const confirmation=confirmDecision({action:'replace',component:done.component,check:done.check,
   result:'different',notes:'Flue was blocked. Cleared it.',quantity:done.quantity,sourceUrls:[]},brief);
 assert.equal(confirmation.component,'Vent system');
 assert.match(confirmation.findings,/Flue was blocked/);
});

test('the confirm button always says what it is waiting for',async()=>{
 const { decisionGate }=await import('../lib/confirmation.ts');
 const path={component:'Pressure switch',confirmBy:'Meter across the terminals.'};
 const base={path,selected:0,pathCount:1,typedComponent:'',result:'',notes:'',quantity:1,action:'replace'};
 const why=over=>decisionGate({...base,...over}).blocker;
 // Every state that disables the control names the missing thing. Silence was the milder form of the
 // same dead end: clearing the quantity field greyed the button out with nothing on screen to explain it.
 assert.match(why({}),/Record what your check established/);
 assert.match(why({result:'ruled-out'}),/does not confirm a replacement/);
 assert.match(why({result:'unsure'}),/does not confirm a replacement/);
 assert.match(why({result:'supports',quantity:0}),/quantity between 1 and 999/);
 assert.match(why({result:'supports',quantity:1000}),/quantity between 1 and 999/);
 assert.match(why({selected:-2,pathCount:1}),/Name the component/);
 assert.match(why({selected:-2,pathCount:1,typedComponent:'Blocked flue'}),/Tick the box/);
 assert.match(why({selected:-2,pathCount:1,typedComponent:'Blocked flue',result:'different'}),/Describe what your inspection established/);
 assert.equal(why({result:'supports'}),'');
 // A repair needs no part, so its hidden quantity field can never block it.
 assert.equal(why({result:'supports',action:'repair',quantity:0}),'');
 assert.equal(decisionGate({...base,result:'supports',action:'repair',quantity:0}).quantity,1);
});
