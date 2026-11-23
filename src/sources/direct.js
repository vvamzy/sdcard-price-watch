import { fetchText } from '../lib/http.js';

// Direct stores publish a single-item selling price. Match the checkout link
// (including any variant) rather than recommendations or a category's lowPrice.
export function readOffer(html, offer) {
  const url = new URL(offer.url);
  for (const [, raw] of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(raw); }
    catch {
      // Croma sometimes appends one extra closing brace after a valid Product.
      if (offer.retailer !== 'croma') continue;
      try { data = JSON.parse(raw.trimEnd().replace(/}$/, '')); } catch { continue; }
    }
    for (const p of [data].flat()) {
      if (p?.['@type'] !== 'Product' || !/micro\s?sd/i.test(p.name || '')) continue;
      for (const o of [p.offers].flat()) {
        if (o?.['@type'] !== 'Offer' || o.priceCurrency !== 'INR' || !o.url) continue;
        if (new URL(o.url, url).href !== url.href || (offer.sku && String(o.sku ?? p.sku) !== offer.sku)) continue;
        const price = Number(o.price);
        if (!Number.isFinite(price) || price <= 0) continue;
        const stock = o.availability?.split('/').pop();
        const available = stock === 'InStock' ? true : ['OutOfStock', 'SoldOut', 'Discontinued'].includes(stock) ? false : null;
        return { price: Math.round(price), currency: 'INR', available, bankOffers: [], bestBankDiscount: 0, title: p.name, productUrl: offer.url };
      }
    }
  }
  throw new Error('no matching INR product offer');
}

export async function fetchPrice(offer) {
  return readOffer(await fetchText(offer.url), offer);
}
