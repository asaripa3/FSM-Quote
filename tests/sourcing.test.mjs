import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsIdentifier, evidenceOnPage, priceOnPage, successfulFreshContent, usableContent, priceExcerpt, partIdentifier, evidenceGrounding, evidenceAnchored } from '../lib/sourcing.ts';

test('a cheaper amount cannot be supported by a substring of another price', () => {
  assert.equal(priceOnPage(41.98, 'Price $141.98 USD each', 'Price $141.98 USD each'), false);
  assert.equal(priceOnPage(41.98, 'Price $41.98 USD each', 'Price $141.98 USD each'), false);
  assert.equal(priceOnPage(41.98, 'Price $41.98 USD each', 'Price $41.98 USD each'), true);
});
test('reject fabricated context even when the amount occurs elsewhere', () => {
  assert.equal(priceOnPage(41.98, 'A-1101-A price $41.98 USD', 'A-1101-A unavailable. Related A-42-A price $41.98 USD'), false);
});
test('money parsing handles commas and whole dollars without accepting model numbers', () => {
  assert.equal(priceOnPage(1234.50, 'USD 1,234.50 each', 'USD 1,234.50 each'), true);
  assert.equal(priceOnPage(42, '$42 USD each', '$42 USD each'), true);
  assert.equal(priceOnPage(41.98, 'Model 41.98', 'Model 41.98'), false);
  assert.equal(priceOnPage(NaN, '$41.98', '$41.98'), false);
});
test('evidence preserves wording and order across table fragments', () => {
  const page = '| Sloan A-1101-A | 1.6 GPF | includes vacuum breaker |';
  assert.equal(evidenceOnPage('Sloan A-1101-A ... includes vacuum breaker', page), true);
  assert.equal(evidenceOnPage('Sloan A-1101-A ... 3.5 GPF', page), false);
  assert.equal(evidenceOnPage('includes vacuum breaker ... Sloan A-1101-A', page), false);
  assert.equal(evidenceOnPage('', page), false);
});
test('identifiers are exact instead of fuzzy word coverage', () => {
  assert.equal(containsIdentifier('Kit A-1101-A from Sloan', 'A-1101-A'), true);
  assert.equal(containsIdentifier('Kit A-1101-AB', 'A-1101-A'), false);
  assert.equal(containsIdentifier('Model 90001', '9000'), false);
});
test('HTTP 200 with per-page error or cached fallback cannot confirm freshness', () => {
  assert.equal(successfulFreshContent({status:'success',source:'live'}), true);
  assert.equal(successfulFreshContent({status:'success',source:'cached'}), false);
  assert.equal(successfulFreshContent({status:'error'}), false);
  assert.equal(successfulFreshContent(undefined), false);
});

test('cached retailer text is usable for extraction but is not a fresh crawl', () => {
  // Home Depot, Lowe's and Amazon refuse live crawling, so cached text is the only text there is.
  assert.equal(usableContent({status:'success',source:'cached'}), true);
  assert.equal(successfulFreshContent({status:'success',source:'cached'}), false);
  assert.equal(usableContent({status:'error'}), false);
  assert.equal(usableContent(undefined), false);
});

test('a displayed price excerpt drops interleaved financing copy', () => {
  const raw = '$66.96\nApply Now\nPay**$41.96**after**$25 OFF**your total qualifying purchase upon opening a new card.info';
  const shown = priceExcerpt(raw, 66.96);
  assert.equal(shown.includes('66.96'), true);
  assert.equal(shown.includes('41.96'), false);
  assert.equal(priceExcerpt('Price: 70.43 USD.', 70.43), 'Price: 70.43 USD.');
});

test('a qualified identifier still yields its part number', () => {
  assert.equal(partIdentifier('A-1101-A (example for 1.6 gpf)'), 'A-1101-A');
  assert.equal(partIdentifier('3301070 (example for 1.6 gpf)'), '3301070');
  assert.equal(partIdentifier('Jard 12788'), 'Jard 12788');
  assert.equal(partIdentifier('QO220CP'), 'QO220CP');
  assert.equal(partIdentifier('Various (Generic/Pre-engineered)'), '');
  assert.equal(partIdentifier('N/A (Generic)'), '');
  assert.equal(partIdentifier('Generic/Pre-engineered'), '');
});

test('grounding scores a quote by how much of it is on the page', () => {
  const page = 'ROYAL Performance Kit includes dual filtered diaphragm assembly, handle repair kit with triple seal packing, high back pressure vacuum breaker repair kit.';
  // Faithful, including a bullet gap marker the page itself does not use.
  assert.equal(evidenceGrounding('dual filtered diaphragm assembly ••• high back pressure vacuum breaker repair kit', page), 1);
  // Invented wording is nowhere on the page.
  assert.equal(evidenceGrounding('This 45+5 MFD dual cap powers both your compressor and condenser fan motor', page), 0);
  // Half real, half lifted from elsewhere.
  const mixed = evidenceGrounding('dual filtered diaphragm assembly ... ships free from our Ohio warehouse today', page);
  assert.equal(mixed > 0.3 && mixed < 0.8, true);
});

test('anchoring accepts a partly loose quote but never an invented one', () => {
  const page = 'Model #QO220CP. Compatible with Square D QO electrical panels. 20-amp, double pole circuit breaker rated for 240 volts.';
  assert.equal(evidenceAnchored('Model #QO220CP ... Compatible with Square D QO electrical panels ... ships today from our warehouse', page), true);
  assert.equal(evidenceAnchored('This 45+5 MFD dual cap powers both your compressor and condenser fan motor', page), false);
  // Too short to prove anything on its own.
  assert.equal(evidenceAnchored('Model #QO220CP', page), false);
});
