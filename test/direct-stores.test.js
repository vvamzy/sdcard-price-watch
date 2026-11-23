import test from 'node:test';
import assert from 'node:assert/strict';
import { readOffer } from '../src/sources/direct.js';

const listing = { url: 'https://example.org/card?variant=128', sku: 'card-128' };
const offer = { '@type': 'Offer', priceCurrency: 'INR', price: 1200, url: listing.url, availability: 'https://schema.org/InStock' };
const product = { '@type': 'Product', name: '128GB microSDXC', sku: listing.sku, offers: offer };
const page = (data, suffix = '') => `<script type="application/ld+json">${JSON.stringify(data)}${suffix}</script>`;

test('direct stores select the exact variant and actual INR offer, ignoring cheaper recommendations and MRP', () => {
  const recommended = { ...product, offers: { ...offer, price: 100, url: listing.url.replace('128', '64') } };
  const target = { ...product, offers: [{ ...offer, priceSpecification: { price: 2000 } }] };
  const r = readOffer(page(recommended) + page(target), listing);
  assert.equal(r.price, 1200);
  assert.equal(r.available, true);
  for (const wrong of [{ ...product, sku: 'wrong' }, { ...product, offers: { ...offer, priceCurrency: 'USD' } }, recommended]) {
    assert.throws(() => readOffer(page(wrong), listing), /no matching INR/);
  }
});

test('Croma tolerates its extra trailing brace but never infers in-stock from a displayed price', () => {
  const croma = { ...listing, retailer: 'croma' };
  assert.equal(readOffer(page({ ...product, offers: { ...offer, availability: undefined } }, '}'), croma).available, null);
  assert.equal(readOffer(page({ ...product, offers: { ...offer, availability: 'https://schema.org/OutOfStock' } }), croma).available, false);
});
