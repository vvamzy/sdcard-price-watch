# sdcard-price-watch

Watches a basket of **U3 / V30 microSD cards (64GB and 128GB)** in India and emails you when any
listing hits a new all-time low — or when the bank/card offer stacked on it changes.

Runs on GitHub Actions every 30 minutes. No server, no database, no paid APIs.

> Built by reusing the engine from `dji-price-watch`, which remains retired and untouched.

---

## What it tracks

A curated basket of U3/V30 cards across **Samsung, SanDisk, Lexar, Kingston and EVM**, in both
64GB and 128GB where those variants exist. Only cards rated **U3 + V30** are included; SanDisk
Ultra (U1/A1) is deliberately excluded. Exact listings live in [`config/products.json`](config/products.json).

| Retailer | How it's read | Card offers |
|---|---|---|
| Amazon.in | Mobile product endpoint (`/gp/aw/d/ASIN`) with retries | Buybox card discount + cashback note |
| Flipkart | schema.org price block | `bankOfferGrid` instant discounts |

**Quick commerce is not tracked.** Blinkit returns HTTP 403 bot challenges, Zepto and Swiggy
Instamart return ~2KB JavaScript shells with HTTP 202, and BigBasket's server-rendered payload has
`SSRData: null` (products load client-side). There is no reliable plain-HTTP price to poll from a
GitHub runner, so no fake adapters were added.

---

## When it emails

1. **New all-time low** — the listed price falls below the lowest ever recorded for that
   store + listing. Not merely "cheaper than last run".
2. **Card offer change** — the set of bank offers changes (e.g. HDFC ₹150 → ₹250 off). The email
   shows each current card offer and the resulting effective price. Cashback is shown as a note,
   not subtracted from the price.

Failed sends do not advance watermarks — the same drop is retried next run. Three consecutive
failures on a required source raise one health email. No changes worth reporting produce no email.

---

## Setup

1. Push this repo to GitHub (public or private — both work).
2. Settings → Secrets and variables → Actions → **New repository secret**:
   - `GMAIL_USER` — the Gmail address
   - `GMAIL_APP_PASSWORD` — a Gmail app password (never commit or paste it anywhere)
   - `ALERT_TO` — recipient address
3. Actions → **sdcard-price-check** → Enable workflow. It also runs manually via "Run workflow".

### Manual CLI

```bash
npm ci
node src/index.js --test-email          # verify Gmail settings
node src/index.js --check --force       # probe every listing, send nothing
node src/index.js --dry-run --force     # full pipeline, no email or state write
node src/index.js                       # normal run
```

---

## Configuration

Everything is in [`config/products.json`](config/products.json):

- `products[].offers[]` — retailer, label, product URL. `variant` is only used by the Shopify adapter.
- `optional: true` — failures are logged but never emailed as a health problem (used for Croma).
- `polling` — minutes between polls per retailer:
  ```json
  "polling": { "amazon": 15, "flipkart": 15 }
  ```
- `alert` — `cooldownHours: 1`, `dailyEmailCap: 12`, `minSecondsBetweenEmails: 60`.

To add a card: append a product with its ASIN (`https://www.amazon.in/dp/<ASIN>`) and/or Flipkart
product URL. Run `node src/index.js --check --force` to confirm the price parses before committing.

---

## Layout

```
src/index.js                  entry point, CLI flags, email/budget orchestration
src/lib/engine.js             cadence, alert detection, state commits
src/lib/diff.js               watermark logic
src/lib/report.js             HTML/text email builder
src/lib/mailer.js             Gmail SMTP
src/lib/state.js              state load/save helpers
src/lib/jsonld.js             schema.org Product extractor
src/lib/http.js               retrying fetch helper
src/sources/amazon.js         mobile-endpoint ASIN adapter (retrying)
src/sources/flipkart.js       JSON-LD + bankOfferGrid adapter
src/sources/croma.js          schema.org adapter
src/sources/reliance.js       retained but unused (403s from runner IPs)
src/sources/dji.js            retained but unused (Shopify adapter)
state/prices.json             persisted prices, watermarks, email budget
.github/workflows/price-check.yml   the scheduled run
```

---

## Known limits

- **Timing.** GitHub schedules are best-effort: a `*/30` cron does not guarantee 30-minute runs.
  In the source repo the real cadence worked out to ~5 runs/day. Fine for catching sales, not for
  second-level flash deals.
- **Amazon.** Only the mobile endpoint works from datacenter IPs. Each poll retries several times;
  if all attempts fail, that poll is logged as a miss, never as a price change.
- **Listed price only.** EMI, exchange and coupon discounts are not tracked. A "₹1" flash sale on a
  quick-commerce site would be a stock gimmick anyway.
- **Public repo.** Prices and state commits are public if you make the repo public; credentials are
  not — they live only in GitHub Secrets.
