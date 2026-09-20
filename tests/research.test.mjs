import './register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { sourceKind, evidenceStrength, modelMatch, familyMatch, missingPractitioner } = await import('../lib/research.ts');

const SUPPLIERS = ['amazon.com','homedepot.com','supplyhouse.com'];
const kind = (url, title = '', maker = 'Carrier') => sourceKind(url, title, maker, SUPPLIERS);

test('a source is placed by where it came from, never by its file extension', () => {
  // The manufacturer's own domain is the only thing that earns "oem".
  assert.equal(kind('https://www.carrier.com/commercial/en/us/48tc-service-manual.pdf'), 'oem');
  assert.equal(kind('https://carrier.com/products/48tc'), 'oem');
  // A manual mirrored on an unrecognised host is the sketchy-manual problem, not an OEM document.
  // One of the Lennox service manuals Exa returned in testing came from a Russian file host.
  assert.equal(kind('https://randommanuals123.com/files/48tc.pdf'), 'unknown');
  assert.equal(kind('https://c-o-k.ru/library/lennox-lga090.pdf', '', 'Lennox'), 'mirror');
  // A host whose business IS republishing manuals is its own class. Not the maker, and not a forum
  // either: a live Carrier run backed both of its surviving repair paths out of manualsdir and
  // manualslib, and labelling those "field reports" put a service manual beside a YouTube comment.
  assert.equal(kind('https://www.manualslib.com/manual/1475043/Carrier-48TC.html', '', 'Lennox'), 'mirror');
  assert.equal(kind('https://www.manualsdir.com/manuals/48tc/carrier.html'), 'mirror');

  assert.equal(kind('https://www.supplyhouse.com/products/pressure-switch'), 'distributor');
  assert.equal(kind('https://www.youtube.com/watch?v=abc'), 'practitioner');
  assert.equal(kind('https://www.reddit.com/r/hvacadvice/comments/xyz'), 'forum');
  assert.equal(kind('https://hvac-talk.example/forum/thread/991'), 'forum');
});

test('a family match is not an exact match', () => {
  const plate = { manufacturer: 'Carrier', model: '48TCED08A2A6' };
  // The service manual is headed with the range, and the exact designation appears nowhere in it.
  const manual = 'Service and Troubleshooting, 48TC04-48TC14 single package rooftop units';
  assert.equal(modelMatch(manual, plate), 'family');
  assert.equal(familyMatch(manual, plate.model), '48TC');
  // The exact plate designation, when a page does carry it.
  assert.equal(modelMatch('Unit 48TCED08A2A6 wiring', plate), 'exact');
  // Named maker, nothing model-specific.
  assert.equal(modelMatch('Carrier rooftop units, general guidance', plate), 'manufacturer');
  assert.equal(modelMatch('Generic HVAC troubleshooting', plate), 'none');
  // Four characters is the floor: "48" must not match every page with a number on it.
  assert.equal(familyMatch('Model 48 of something else entirely', '48TCED08A2A6'), '');
  // A short designation has no family below itself.
  assert.equal(modelMatch('Moen 1222 cartridge', { manufacturer: 'Moen', model: '1222' }), 'exact');
});

test('authority needs the manufacturer AND the machine', () => {
  assert.equal(evidenceStrength('oem', 'exact'), 'authoritative');
  assert.equal(evidenceStrength('oem', 'family'), 'authoritative');
  // An OEM page that never names this equipment is corroboration, not authority.
  assert.equal(evidenceStrength('oem', 'manufacturer'), 'corroborating');
  assert.equal(evidenceStrength('practitioner', 'exact'), 'corroborating');
  assert.equal(evidenceStrength('distributor', 'family'), 'corroborating');
  assert.equal(evidenceStrength('forum', 'exact'), 'anecdotal');
  assert.equal(evidenceStrength('unknown', 'exact'), 'anecdotal');
  // A mirrored manual that names this machine corroborates. It is never authoritative: nothing
  // establishes that the copy is complete, current, or the document it claims to be.
  assert.equal(evidenceStrength('mirror', 'exact'), 'corroborating');
  assert.equal(evidenceStrength('mirror', 'family'), 'corroborating');
  assert.equal(evidenceStrength('mirror', 'none'), 'anecdotal');
  // Nothing tied to the equipment is authoritative, however official the host looks.
  assert.equal(evidenceStrength('oem', 'none'), 'anecdotal');
});

test('a retrieval missing a whole source class asks for one narrow second search', () => {
  // Measured on the first real run: nine manual mirrors, one carrier.com, no practitioner source.
  assert.equal(missingPractitioner(['oem','mirror','mirror','mirror']), true);
  assert.equal(missingPractitioner(['oem','mirror','practitioner']), false);
  assert.equal(missingPractitioner(['oem','unknown','unknown','unknown']), true);
  // Nothing retrieved means nothing to top up; the failure is upstream.
  assert.equal(missingPractitioner([]), false);
});

test('a manufacturer search portal is not documentation', async () => {
  const { looksLikeNavigation } = await import('../lib/research.ts');
  // Both "official" sources on a real Carrier run were document search portals: OEM domain, OEM
  // ranking, and an excerpt made entirely of menus. Citing that as documentation is worse than
  // citing nothing, because the label implies the technician can act on it.
  assert.equal(looksLikeNavigation('Product Document Search | Carrier Commercial Systems North America Skip to main content We will help you find what you are looking for. Simply select the product type, the model number and the literature you want. Sign In to shop with real-time inventory. Add to cart. Checkout faster with saved delivery.'), true);
  assert.equal(looksLikeNavigation('Documents | CE Search Account Lists Cart Create An Account Register to shop from our vast inventory of top brand name HVAC equipment, parts, and supplies. Sign in to get organized with lists. View cart and checkout.'), true);
  // Real documentation survives, including a page that happens to mention one furniture phrase.
  assert.equal(looksLikeNavigation('The Integrated Gas Unit Controller reports faults using an LED that flashes between one and nine times, with a three second pause between sequences. Five flashes indicates an ignition lockout fault after four unsuccessful attempts.'), false);
  // A short, dense sentence is often the best evidence on the page, so length is only a floor.
  assert.equal(looksLikeNavigation('Five flashes indicates an ignition lockout fault.'), false);
  assert.equal(looksLikeNavigation('48TC service manual'), true);
});

test('a claim is checked against the whole document, not the excerpt shown beside it', async () => {
  const { researchJob } = await import('../lib/server/research.ts');
  process.env.EXA_API_KEY='test-exa';
  const original = globalThis.fetch;
  // A real sentence from a service manual, sitting well past the excerpt the search returned. Checked
  // against the highlight it is indistinguishable from an invented quote, and the path is withheld for
  // being correct about a part of the page we chose not to keep.
  const deep = 'The IGC control reports a pressure switch fault when the inducer fails to prove negative pressure within thirty seconds of start.';
  const page = `${'Carrier 48TC single package rooftop units, service and troubleshooting. '.repeat(400)}${deep}`;
  const reply = withText => async () => Response.json({
    results: [{ url: 'https://www.carrier.com/48tc-service.pdf', title: 'Carrier 48TC service manual',
      highlights: ['Carrier 48TC single package rooftop units, service and troubleshooting information for the installer.'],
      ...(withText ? { text: page } : {}) }],
    output: { content: { evidenceSummary: 'x', contradicts: '', contradictsSupport: '', checkBeforeReplacing: [],
      repairPaths: [{ component: 'Pressure switch', rationale: 'Documented cause.', confirmBy: 'Meter across the switch.', support: deep }] } },
  });
  const brief = { equipment:'rooftop unit', manufacturer:'Carrier', model:'48TCED08A2A6', serial:'', faultCodes:['31'],
    symptoms:['not cooling'], alreadyChecked:[], stillUncertain:['cause unknown'], constraints:[], needsResearch:true };
  try {
    globalThis.fetch = reply(false);
    assert.equal((await researchJob(brief, [])).repairPaths.length, 0);
    globalThis.fetch = reply(true);
    const packet = await researchJob(brief, []);
    assert.equal(packet.repairPaths.length, 1);
    assert.equal(packet.repairPaths[0].evidenceLevel, 'oem');
    // The document is verified against; the excerpt is still what gets shown.
    assert.match(packet.sources[0].highlight, /service and troubleshooting information for the installer/);
    assert.ok(!packet.sources[0].highlight.includes(deep));
    // And nothing that large is ever sent to the client.
    assert.ok(JSON.stringify(packet).length < 4000);
  } finally { globalThis.fetch = original; }
});
