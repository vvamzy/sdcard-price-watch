import { fetchText } from '../lib/http.js';
import { isOutOfStock } from '../lib/jsonld.js';
import { readOffer } from './direct.js';

/**
 * Croma (croma.com) is fronted by Akamai. Product pages usually render fine
 * from datacenter IPs, but the JSON-LD block is not strictly valid JSON, so
 * extraction goes through the tolerant schema.org parser.
 *
 * Croma's card offer is a percentage teaser ("Upto 5% off on NeuCard") with no
 * cap to compute, so it is intentionally not counted as a bank discount.
 */
export const id = 'croma';

export async function fetchPrice(offer) {
  const body = await fetchText(offer.url, { retries: 2 });

  if (isBlocked(body)) throw new Error('Croma returned an Akamai bot page');

  return readOffer(body, offer);
}

export function isBlocked(html) {
  // Akamai error pages are a few KB and carry a Reference # block.
  if (html.length < 40_000) return true;
  return /<title>\s*Access Denied|errors\.edgesuite\.net/i.test(html);
}

export { isOutOfStock };
