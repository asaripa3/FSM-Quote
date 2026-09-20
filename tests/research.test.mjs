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
  assert.equal(kind('https://c-o-k.ru/library/lennox-lga090.pdf', '', 'Lennox'), 'unknown');
  assert.equal(kind('https://www.manualslib.com/manual/1475043/Carrier-48TC.html', '', 'Lennox'), 'unknown');

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
  // Nothing tied to the equipment is authoritative, however official the host looks.
  assert.equal(evidenceStrength('oem', 'none'), 'anecdotal');
});

test('a retrieval missing a whole source class asks for one narrow second search', () => {
  // Measured on the first real run: nine manual mirrors, one carrier.com, no practitioner source.
  assert.equal(missingPractitioner(['oem','unknown','unknown','unknown']), true);
  assert.equal(missingPractitioner(['oem','unknown','practitioner']), false);
  // Nothing retrieved means nothing to top up; the failure is upstream.
  assert.equal(missingPractitioner([]), false);
});
