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
    output:{content:{evidenceSummary:'Moen documentation ties a dripping single-handle Posi-Temp valve to a seized cartridge, and says to identify the valve body before ordering.',
      checkBeforeReplacing:['Read the valve body stamp','Check the retaining clip is intact'],
      repairPaths:[{component:'Posi-Temp cartridge',rationale:'Documented cause of drip after shutoff.',confirmBy:'Valve body stamp reads Posi-Temp.',evidenceLevel:'oem'},
                   {component:'No part required, seized retaining clip',rationale:'A galled clip presents the same symptom.',confirmBy:'Clip releases by hand.',evidenceLevel:'field_only'}]}},
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

 // One broad research search. Highlights, not full page text: a citation needs the excerpt shown,
 // whereas pricing needs the whole page because the amount has to be located in it independently.
 assert.equal(searches.length,1);
 assert.ok(searches[0].body.contents.highlights.query);
 assert.equal(searches[0].body.contents.text,undefined);
 assert.equal(searches[0].body.category,undefined);

 // Nothing is sourced and nothing is priced before the technician has decided.
 assert.equal(calls.filter(c=>c.url.endsWith('/contents')).length,0);
 assert.ok(!events.some(e=>e.event==='supplier_results'));
 assert.ok(!events.some(e=>e.event==='discovery_complete'));

 const packet=events.find(e=>e.event==='research_complete').data;
 assert.match(packet.evidenceSummary,/Posi-Temp/);
 assert.equal(packet.checkBeforeReplacing.length,2);
 // A path that needs no part at all is a real answer, and the schema has to be able to say so.
 assert.ok(packet.repairPaths.some(p=>/no part required/i.test(p.component)));
 assert.deepEqual(packet.repairPaths.map(p=>p.evidenceLevel),['oem','field_only']);
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
