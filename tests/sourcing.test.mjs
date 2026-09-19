import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsIdentifier, evidenceOnPage, priceOnPage, successfulFreshContent, usableContent } from '../lib/sourcing.ts';

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
