import test from 'node:test';
import assert from 'node:assert/strict';
import { collect, commit } from '../src/lib/engine.js';
import { buildEmail, buildSubject } from '../src/lib/report.js';
import { parseBankOffers } from '../src/sources/flipkart.js';

const reading = (price, discount = 0, available = true) => ({ price, available,
  bestBankDiscount: discount, bankOffers: discount ? [{ bank: 'Test Bank', discount }] : [] });

function tracker(retailers = ['one']) {
  const config = { alert: { cooldownHours: 1 }, products: [{ id: 'card', short: 'Test card',
    offers: retailers.map(retailer => ({ retailer, label: retailer, url: `https://example.org/${retailer}` })) }] };
  const state = { meta: { healthAlerted: {} }, products: {} };
  return { state, config, async run(minute, readings, delivered = true) {
    const now = new Date(Date.UTC(2026, 0, 1, 0, minute));
    const result = await collect({ config, state, now, fetchPrice: async ({ retailer }) => {
      if (readings[retailer] instanceof Error) throw readings[retailer];
      return readings[retailer];
    } });
    commit({ state, now, delivered, ...result });
    return result;
  } };
}

test('another listing’s delivered email cannot consume a cooled-down drop or bank change', async () => {
  const t = tracker(['one', 'two']);
  await t.run(0, { one: reading(1000, 50), two: reading(1500) });
  await t.run(1, { one: reading(950, 50), two: reading(1500) });
  const readings = { one: reading(900, 75), two: reading(1400) };
  const cooled = await t.run(30, readings);
  assert.deepEqual(cooled.alerts.map(a => a.offer.retailer), ['two']);
  const retry = await t.run(61, readings);
  assert.deepEqual(retry.alerts.map(a => [a.kind, a.from, a.to]), [['price', 950, 900], ['bank', 50, 75]]);
  assert.deepEqual((await t.run(130, readings)).alerts, []);
});

test('a failed send keeps the last reported bank discount and does not advertise a rebound as a low', async () => {
  const t = tracker();
  await t.run(0, { one: reading(1000, 50) });
  await t.run(1, { one: reading(900, 70) }, false);
  const higher = await t.run(2, { one: reading(950, 70) });
  assert.deepEqual(higher.alerts.map(a => [a.kind, a.from, a.to]), [['bank', 50, 70]]);
  assert.equal((await t.run(62, { one: reading(900, 70) })).alerts[0].kind, 'price');
});

test('unavailable and unknown-stock readings neither alert nor set a buyable baseline', async () => {
  const t = tracker();
  await t.run(0, { one: reading(300, 25, false) });
  assert.equal(t.state.products.card.offers.one.watermark, null);
  assert.deepEqual((await t.run(1, { one: reading(1000, 50) })).alerts, []);
  for (const availability of [false, null]) {
    assert.deepEqual((await t.run(2, { one: reading(200, 100, availability) })).alerts, []);
    assert.equal(t.state.products.card.offers.one.lowestEver, 1000);
  }
  const { alerts } = await t.run(3, { one: reading(900, 80) });
  assert.deepEqual(alerts.map(a => [a.kind, a.from, a.to]), [['price', 1000, 900], ['bank', 50, 80]]);
});

test('bad readings retain prices and raise only one health alert per failure streak', async () => {
  const t = tracker();
  await t.run(0, { one: reading(1000) });
  const bad = { one: reading(0) };
  for (const [minute, expected] of [[1, 0], [2, 0], [3, 1], [4, 0]]) {
    assert.equal((await t.run(minute, bad)).health.length, expected);
  }
  assert.equal(t.state.products.card.offers.one.price, 1000);
  const { html } = buildEmail({ config: t.config, state: t.state, alerts: [], health: [] });
  assert.match(html, /Latest check failed/);
  await t.run(5, { one: reading(1000) });
  assert.deepEqual(t.state.meta.healthAlerted, {});
});

test('a multi-listing subject does not attribute a different card’s discount to the first listing', () => {
  const alerts = ['A', 'B'].map((short, i) => ({ kind: 'bank', product: { short }, offer: { label: 'Shop' }, to: i * 100 }));
  assert.match(buildSubject(alerts, []), /2 listings/);
});

test('an offer without an amount cannot take the next bank’s discount', () => {
  const html = '{"offerTitle":"Bank A"},{"offerTitle":"Bank B","discountedPriceText":"₹150 off"}';
  assert.deepEqual(parseBankOffers(html), [{ bank: 'Bank B', discount: 150 }]);
});
