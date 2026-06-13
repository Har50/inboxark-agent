# GA4 Intelligence Integration — Design Spec
**Date:** 2026-05-19
**Project:** Pinnboxio Agent
**Status:** Approved

---

## Overview

Upgrade the Intelligence tab in the Pinnboxio agent to pull real visitor data from Google Analytics 4 (GA4) for pinnboxio.net, then use Claude to generate specific, data-driven strategy recommendations across four categories: Revenue, Subscriptions, Product Improvement, and Marketing & Content. Strategy cards include cross-tab action buttons that jump to the relevant tab (Video Creator, Studio) with context pre-filled.

---

## Architecture

### Backend — `server.js`

**New config keys:**
- `GA4_PROPERTY_ID` — GA4 property ID in format `properties/XXXXXXXXX` (loaded from `process.env.GA4_PROPERTY_ID`)
- `GA4_CLIENT_EMAIL` — service account email (loaded from `process.env.GA4_CLIENT_EMAIL`)
- `GA4_PRIVATE_KEY` — service account private key, newlines escaped as `\n` (loaded from `process.env.GA4_PRIVATE_KEY`)

**New npm package:**
- `@google-analytics/data` — official Google GA4 Data API client, handles service account JWT auth

**New in-memory cache:**
```js
const analyticsCache = { data: null, period: null, generatedAt: 0 };
const ANALYTICS_TTL_MS = 5 * 60 * 1000; // 5 minutes
```
Cache is period-aware: if `period` changes between requests, always re-fetch regardless of TTL.

**New function: `fetchGA4Data(period)`**
- `period`: `'7d'`, `'30d'`, or `'90d'` (default `'30d'`)
- Initialises `BetaAnalyticsDataClient` with service account credentials
- Runs two GA4 API calls in parallel:
  1. `runReport` — dimensions: `sessionDefaultChannelGroup`, `country`, `deviceCategory`; metrics: `sessions`, `newUsers`, `bounceRate`, `averageSessionDuration`; dateRange: last N days
  2. `runReport` — dimensions: `pagePath`; metrics: `screenPageViews`; limit 5; orderBy `screenPageViews` DESC
- Returns structured object:
```js
{
  period,          // '30d'
  sessions,        // number
  newUsers,        // number
  bounceRate,      // number 0–100
  avgSessionSec,   // number (seconds)
  topSources: [    // max 5
    { name, sessions, pct }
  ],
  topPages: [      // max 5
    { path, views }
  ],
  devices: {       // mobile / desktop / tablet breakdown
    mobile: pct,
    desktop: pct,
    tablet: pct
  },
  topCountries: [  // max 3
    { name, sessions }
  ]
}
```
- Returns `null` and logs error if GA4 credentials not configured or API call fails

**New function: `generateAnalyticsStrategy(ga4Data)`**
- Calls existing `callClaude()` with a prompt that includes the full `ga4Data` object serialised as JSON
- System prompt instructs Claude to act as a business strategist for Pinnboxio, analyse the numbers, and return a JSON object with four strategy blocks:
```js
{
  revenue: { title, finding, action },
  subscription: { title, finding, action },
  product: { title, finding, action },
  marketing: { title, finding, action }
}
```
- Each block: `title` (short headline), `finding` (2-3 sentences, references specific numbers), `action` (one concrete next step)
- Returns parsed JSON or `null` on failure

**New API route: `GET /api/analytics`**
- Query param: `?period=7d|30d|90d` (default `30d`)
- Checks cache: if `analyticsCache.data` exists and `Date.now() - analyticsCache.generatedAt < ANALYTICS_TTL_MS` → return cached response
- Otherwise: calls `fetchGA4Data(period)` then `generateAnalyticsStrategy(data)` in sequence
- Stores result in `analyticsCache`
- Returns:
```json
{
  "success": true,
  "period": "30d",
  "metrics": { ...ga4Data },
  "strategy": { revenue, subscription, product, marketing },
  "generatedAt": 1716100000000
}
```
- On GA4 not configured: returns `{ "success": false, "reason": "not_configured" }`
- On GA4 error: returns `{ "success": false, "reason": "ga4_error", "error": "..." }`

**Update `GET /api/status`:**
- Add `ga4: !!CONFIG.GA4_PROPERTY_ID && !!CONFIG.GA4_CLIENT_EMAIL && !!CONFIG.GA4_PRIVATE_KEY`

**Update startup log:**
- `addLog(\`GA4: ${CONFIG.GA4_PROPERTY_ID ? 'Connected ('+CONFIG.GA4_PROPERTY_ID+')' : 'Not configured'}\`, ...)`

---

### Frontend — `public/index.html`

**New status chip in topbar:**
```html
<span class="chip chip-off" id="cc-ga4">GA4…</span>
```
Updated in `loadSt()`: if `d.ga4` → `chip-on` + text `GA4 ✓`, else `chip-off` + `GA4 ✗`

**Upgrade existing `#screen-intelligence` screen** — replace or augment current content with:

**Layout:** Single column, max-width 900px

**Section 1 — Connection banner:**
```html
<div id="ga4-banner" class="ga4-banner">
  <!-- if connected: "GA4 connected · pinnboxio.net · Last synced X min ago [⟳ Refresh]" -->
  <!-- if not configured: "Connect Google Analytics to unlock data-driven strategy [Setup Guide ↗]" -->
</div>
```

**Section 2 — Period selector:**
Three tabs: `7 days` / `30 days` / `90 days`. Clicking re-fetches `/api/analytics?period=Xd` and re-renders.

**Section 3 — Metrics grid (4 cards):**
| Card | Metric | Trend label |
|------|--------|-------------|
| Visitors | `metrics.sessions` | vs prev period if available |
| New Users | `metrics.newUsers` | — |
| Bounce Rate | `metrics.bounceRate%` | up is bad |
| Avg Session | formatted mm:ss | — |

**Section 4 — Two-column row:**
- Left: Traffic Sources (bar chart — channel name, inline bar, percentage)
- Right: Top Pages (path + view count)

**Section 5 — AI Strategy cards (4 cards):**
Each card renders one strategy block (`revenue`, `subscription`, `product`, `marketing`):
```
[icon] [title]
[finding text]
[action block — gold left border]
[cross-tab button]
```

Cross-tab action buttons:
| Strategy | Button label | Action |
|----------|-------------|--------|
| revenue | View Pricing Page | opens `https://pinnboxio.net/pricing` in new tab |
| subscription | View Signup Page | opens `https://pinnboxio.net/signup` in new tab |
| product | Open Studio | `showScreen('studio')` |
| marketing | Create Video | `showScreen('video')` with `setVidPrompt(...)` |

**New JS functions:**
- `loadAnalytics(period)` — fetches `/api/analytics?period=Xd`, calls `renderAnalytics(data)`
- `renderAnalytics(data)` — populates all sections; shows skeleton loader while fetching
- `renderStrategyCard(block, type)` — renders one strategy card with icon, title, finding, action, cross-tab button
- `refreshAnalytics()` — clears cache hint (`?bust=timestamp`), re-fetches, re-renders

**Auto-load:** Call `loadAnalytics('30d')` when user navigates to Intelligence screen (in `showScreen` switch).

---

## Strategy Prompt Design

Claude receives this system context:
```
You are a business strategist and growth advisor for Pinnboxio (pinnboxio.net).
Pinnboxio is an AI productivity app with voice-to-email, unified inbox, multi-model AI, smart replies, and calendar sync. iOS + web + Android.

Analyse the following GA4 analytics data and return a JSON object with four strategy blocks.
Each block has: title (short headline, max 10 words), finding (2-3 sentences referencing specific numbers from the data), action (one concrete step, max 20 words).

Be specific. Reference exact numbers. Avoid generic advice. Think like a growth consultant who has seen the data and has opinions.

Return ONLY valid JSON, no markdown, no explanation.
```

---

## Google Cloud Setup (One-Time, User Does This)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create project → Enable **Google Analytics Data API**
3. Create **Service Account** → download JSON key
4. In GA4 Admin → Property Access Management → add service account email as **Viewer**
5. Add to Render environment:
   - `GA4_PROPERTY_ID` = `properties/XXXXXXXXX` (from GA4 Admin → Property Settings)
   - `GA4_CLIENT_EMAIL` = service account email from JSON key
   - `GA4_PRIVATE_KEY` = private key from JSON key (copy entire `-----BEGIN RSA PRIVATE KEY-----...` block)

---

## Styling

Follows existing Pinnboxio design system:
- Colors: `--gold` (#f4a900), `--terra`, `--beige`, `--choc`, `--choc2`, `--snow`
- Fonts: Cormorant Garamond (titles), Outfit (body), Fira Code (mono/labels)
- Cards: `background:var(--choc)`, `border:1px solid rgba(244,169,0,0.1)`, `border-radius:12px`
- Step labels: gold, uppercase, `font-family:var(--mono)`
- Strategy card accent: coloured top border per category (gold/green/blue/red)
- Skeleton loader: `background: rgba(244,169,0,0.05)` animated shimmer while fetching

---

## What's NOT in Scope

- OAuth login flow (service account only — no user sign-in)
- Writing data back to GA4
- Historical trend charts (line graphs) — bar charts only for sources
- Real-time data (GA4 Data API only supports historical, minimum 1 day lag)
- Multi-property support (one property only — pinnboxio.net)
- Comparison vs previous period (future iteration)

---

## Files Changed

| File | Change |
|------|--------|
| `server.js` | Add `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, `GA4_PRIVATE_KEY` to CONFIG; add `analyticsCache`; add `fetchGA4Data()`, `generateAnalyticsStrategy()`; add `GET /api/analytics`; update `/api/status` |
| `public/index.html` | Add GA4 status chip; upgrade `#screen-intelligence` with metrics grid, source bars, top pages, strategy cards; add `loadAnalytics()`, `renderAnalytics()`, `renderStrategyCard()`, `refreshAnalytics()` |
| `package.json` | Add `@google-analytics/data` dependency |
| `.env` (Render) | Add `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, `GA4_PRIVATE_KEY` |
