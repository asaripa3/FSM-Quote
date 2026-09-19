import './register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nonProductPageReason } from '../lib/product-page.ts';

test('navigation pages do not spend supplier extraction slots', () => {
  for (const path of ['/', '/?utm_source=exa', '/index.php', '/home/', '/en-us/', '/collections/breakers', '/category/plumbing', '/categories', '/en-us/collections/breakers', '/departments', '/shop/']) {
    assert.ok(nonProductPageReason(new URL(`https://supplier.example${path}`)), path);
  }
});

test('product URLs and uncertain supplier URL conventions survive the prefilter', () => {
  for (const path of ['/?product_id=123', '/index.php?sku=QO120', '/collections/breakers/products/qo120', '/products/qo120', '/p/qo120', '/shop/qo120', '/catalog/104421.html', '/square-d-qo120', '/category/breakers/product/qo120', '/departments/plumbing/plumbing-tools/specialty-tools/4560249',
    // Small carts file the product under its category without saying "product" anywhere in the path.
    '/category/plumbing/moen-104421', '/collections/breakers/qo120', '/categories/circuit-breakers/qo120-20a', '/en-us/category/plumbing/moen-104421']) {
    assert.equal(nonProductPageReason(new URL(`https://supplier.example${path}`)), null, path);
  }
});
