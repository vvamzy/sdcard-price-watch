import { coin } from './diff.js';

function istTime(date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const priceAlerts = (alerts) => alerts.filter((a) => a.kind === 'price');
const bankAlerts = (alerts) => alerts.filter((a) => a.kind === 'bank');

export function buildSubject(alerts, health) {
  const drops = priceAlerts(alerts);
  const banks = bankAlerts(alerts);

  if (drops.length === 1 && banks.length === 0) {
    const d = drops[0];
    return `🔻 ${coin(d.amount)} drop — ${d.product.short} (${d.offer.label}) now ${coin(d.to)}`;
  }
  if (drops.length === 0 && banks.length >= 1) {
    const b = banks[0];
    if (banks.length > 1) return `💳 Card offers changed on ${banks.length} listings — SD card price watch`;
    const label = b.to > 0 ? `${coin(b.to)} off` : 'card offers cleared';
    return `💳 Bank offer updated — ${b.product.short} (${b.offer.label}): ${label}`;
  }
  if (drops.length >= 1 && banks.length >= 1) {
    return `🔻 ${drops.length} drop${drops.length > 1 ? 's' : ''} + 💳 ${banks.length} card offer change — SD card price watch`;
  }
  if (drops.length > 1) {
    return `🔻 ${drops.length} price drops — ${[...new Set(drops.map((d) => d.product.short))].join(', ')}`;
  }
  return health.length ? `⚠️ Price tracker: ${health.length} source${health.length === 1 ? '' : 's'} failing` : 'SD card price watch — snapshot';
}

function priceCard(a) {
  return `
    <div style="border:1px solid #fecaca;background:#fef2f2;border-radius:10px;padding:14px 16px;margin:0 0 10px">
      <div style="font-size:12px;color:#991b1b;text-transform:uppercase;letter-spacing:.05em;font-weight:700">
        Price drop · ${esc(a.offer.label)}
      </div>
      <div style="font-size:15px;font-weight:600;margin:4px 0 2px">${esc(a.product.name)}</div>
      <div style="font-size:22px;font-weight:700;margin:6px 0 2px">
        <span style="color:#9ca3af;text-decoration:line-through;font-size:15px;font-weight:400">${coin(a.from)}</span>
        &nbsp;→&nbsp; ${coin(a.to)}
      </div>
      <div style="font-size:14px;color:#b91c1c">down ${coin(a.amount)} (${a.percent}%)</div>
      <div style="margin-top:10px">
        <a href="${esc(a.offer.url)}" style="display:inline-block;background:#b91c1c;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-size:14px">
          Buy on ${esc(a.offer.label)}
        </a>
      </div>
    </div>`;
}

function bankCard(a) {
  const delta = a.amount;
  const headline =
    delta > 0
      ? `<span style="color:#047857">₹${delta.toLocaleString('en-IN')} more off</span>`
      : delta < 0
        ? `<span style="color:#b91c1c">₹${Math.abs(delta).toLocaleString('en-IN')} less off</span>`
        : 'Same best discount, different cards';

  const list = a.offers
    .map(
      (o) =>
        `<li style="margin:2px 0">${esc(o.bank)} — <strong>${coin(o.discount)} off</strong>${o.note ? ` <span style="color:#6b7280">(${esc(o.note)})</span>` : ''}</li>`
    )
    .join('');

  return `
    <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;padding:14px 16px;margin:0 0 10px">
      <div style="font-size:12px;color:#1e40af;text-transform:uppercase;letter-spacing:.05em;font-weight:700">
        Card offer change · ${esc(a.offer.label)}
      </div>
      <div style="font-size:15px;font-weight:600;margin:4px 0 2px">${esc(a.product.name)}</div>
      <div style="font-size:14px;margin:6px 0">${headline}${a.newLow ? ' · <strong>lowest effective price so far</strong>' : ''}</div>
      <ul style="margin:8px 0 0;padding-left:18px;font-size:14px;color:#1f2937">${list}</ul>
      ${a.effective != null ? `<div style="font-size:13px;color:#1e40af;margin-top:6px">Effective price with best offer: <strong>${coin(a.effective)}</strong></div>` : ''}
      <div style="margin-top:10px">
        <a href="${esc(a.offer.url)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-size:14px">
          Check offers on ${esc(a.offer.label)}
        </a>
      </div>
    </div>`;
}

export function buildEmail({ alerts, health, state, config, now = new Date() }) {
  const subject = buildSubject(alerts, health);
  const rows = [];

  for (const product of config.products) {
    const offerStates = state.products[product.id]?.offers || {};
    for (const offer of product.offers) {
      const s = offerStates[offer.retailer];
      if (!s) continue;

      const hot = alerts.some((a) => a.product.id === product.id && a.offer.retailer === offer.retailer);
      const effective = s.price != null ? Math.max(0, s.price - (s.bestBankDiscount || 0)) : null;
      const lowest = s.available === true && s.price != null ? Math.min(s.lowestEver ?? s.price, s.price) : s.lowestEver;
      const card = s.bankOffers?.find(o => o.discount === s.bestBankDiscount)?.bank;

      rows.push(`
        <div style="border:1px solid ${hot ? '#fdba74' : '#e5e7eb'};background:${hot ? '#fff7ed' : '#fff'};border-radius:8px;padding:10px 12px;margin-top:8px;overflow-wrap:break-word">
          <div style="font-size:16px;line-height:1.4">
            <a href="${esc(offer.url)}" style="display:inline-block;padding:6px 0;color:#1d4ed8;text-decoration:underline;font-weight:700">${esc(product.short)}</a>
            <span style="color:#4b5563;font-size:14px"> · ${esc(offer.label)}</span>
          </div>
          <div style="margin-top:4px;font-size:14px;color:#374151;line-height:1.6">
            <div>Listed <b>${s.price == null ? '—' : coin(s.price)}</b> · ${s.available === false ? '<span style="color:#b91c1c">Out of stock</span>' : s.available ? 'In stock' : 'Stock unknown'}</div>
            <div>Card offer: ${s.bestBankDiscount ? `${coin(s.bestBankDiscount)} off${card ? ` (${esc(card)})` : ''}` : '—'}</div>
            <div>Effective <b>${effective == null ? '—' : coin(effective)}</b> · Lowest ${lowest != null ? coin(lowest) : '—'}</div>
            ${s.fails ? `<div style="color:#92400e">Latest check failed. ${s.lastSeenAt ? `Last reading: ${istTime(new Date(s.lastSeenAt))} IST.` : 'No successful reading yet.'}</div>` : ''}
          </div>
        </div>`);
    }
  }

  const healthBlock = health.length
    ? `
    <div style="border:1px solid #fcd34d;background:#fffbeb;border-radius:10px;padding:12px 16px;margin:16px 0 0">
      <div style="font-weight:700;color:#92400e;margin-bottom:6px">Tracker health</div>
      <ul style="margin:0;padding-left:18px;color:#78350f;font-size:14px">
        ${health.map((h) => `<li>${esc(h.product.name)} — ${esc(h.offer.label)}: ${esc(h.message)}</li>`).join('')}
      </ul>
      <div style="color:#92400e;font-size:12px;margin-top:6px">
        Three consecutive failures. No price was overwritten, so earlier readings stay intact.
      </div>
    </div>`
    : '';

  const cards = [...alerts.filter((a) => a.kind === 'price').map(priceCard), ...alerts.filter((a) => a.kind === 'bank').map(bankCard)].join('');

  const html = `<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:8px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow-wrap:anywhere;word-wrap:break-word">
    <div style="padding:14px 12px;border-bottom:1px solid #eee">
      <div style="font-size:16px;font-weight:700">SD card price watch</div>
      <div style="font-size:13px;color:#6b7280">U3/V30 microSD · 64/128GB · India · ${istTime(now)} IST</div>
    </div>
    <div style="padding:14px 12px">
      ${cards || '<div style="color:#374151">No price changes in this check.</div>'}
      ${healthBlock}
      <div style="margin-top:24px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700">All tracked prices</div>
      <div style="margin-top:8px">${rows.join('') || 'No readings yet. The first price check will populate this list.'}</div>
      <div style="margin-top:16px;font-size:12px;color:#9ca3af;line-height:1.5">
        Alerts fire when a listed price falls below its all-time low, or when the set of bank/card offers changes.
        "Effective" is listed price minus the best single card offer. EMI and exchange offers are not included.
        Tap a product name to open its listing.
      </div>
    </div>
  </div>
</body></html>`;

  const text = [
    `SD card price watch — ${istTime(now)} IST`,
    '',
    ...(alerts.length
      ? alerts.map((a) =>
          a.kind === 'price'
            ? `PRICE DROP: ${a.product.name} @ ${a.offer.label}\n  ${coin(a.from)} -> ${coin(a.to)} (-${coin(a.amount)}, ${a.percent}%)\n  ${a.offer.url}`
            : `CARD OFFER CHANGE: ${a.product.name} @ ${a.offer.label}\n  best offer ${coin(a.from)} -> ${coin(a.to)}\n  ${a.offers.map((o) => `${o.bank}: ${coin(o.discount)} off`).join(', ')}\n  ${a.offer.url}`
        )
      : ['No price changes in this check.']),
    ...(health.length ? ['', 'Tracker health:', ...health.map((h) => `  ${h.product.name} / ${h.offer.label}: ${h.message}`)] : []),
    '',
    'Current prices:',
    ...Object.entries(state.products).flatMap(([pid, p]) =>
      Object.entries(p.offers || {}).map(([retailer, s]) => {
        const effective = s.price != null ? Math.max(0, s.price - (s.bestBankDiscount || 0)) : null;
        return `  ${pid} @ ${retailer}: listed ${s.price == null ? 'n/a' : coin(s.price)}, card ${s.bestBankDiscount ? coin(s.bestBankDiscount) : 'none'}, effective ${effective == null ? 'n/a' : coin(effective)}`;
      })
    ),
  ].join('\n');

  return { subject, html, text };
}
