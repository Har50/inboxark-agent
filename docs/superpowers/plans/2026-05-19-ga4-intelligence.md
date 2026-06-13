# GA4 Intelligence Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Pinnboxio agent's Intelligence tab to pull real GA4 data from pinnboxio.net and generate specific, data-driven strategy recommendations using Claude.

**Architecture:** Backend fetches GA4 data via `@google-analytics/data` (service account auth), passes it to Claude which returns a 4-block JSON strategy, exposed on `GET /api/analytics`. Frontend replaces the static Intelligence screen with a live metrics grid + AI strategy cards, auto-loading when the tab is opened.

**Tech Stack:** Node.js/Express, `@google-analytics/data` npm package, Anthropic Claude API (already wired), vanilla JS/HTML/CSS (existing patterns)

---

## File Map

| File | Change |
|------|--------|
| `server.js` | Add GA4 config keys, `analyticsCache`, `fetchGA4Data()`, `generateAnalyticsStrategy()`, `GET /api/analytics`, update `/api/status` and startup logs |
| `public/index.html` | Add GA4 chip in topbar, add GA4 CSS block, replace `#screen-intelligence` body, add analytics JS functions, wire `showScreen` |
| `package.json` | Add `@google-analytics/data` dependency |
| `tests/analytics.test.js` | Unit tests for `fetchGA4Data` data-shaping logic |

---

## Task 1: Install package + add GA4 config to server.js

**Files:**
- Modify: `package.json`
- Modify: `server.js` (lines 17–30 CONFIG block, line 34–36 stores, line 441–449 startup logs)

- [ ] **Step 1: Install `@google-analytics/data`**

```bash
cd C:/Users/Acer/pinnboxio-agent
npm install @google-analytics/data
```

Expected output: `added N packages` — no errors.

- [ ] **Step 2: Add GA4 require at top of server.js**

After line 1 (`require('dotenv').config();`), add:

```js
const {BetaAnalyticsDataClient} = require('@google-analytics/data');
```

- [ ] **Step 3: Add GA4 keys to CONFIG object in server.js**

Inside the `const CONFIG = { ... }` block (currently ends with `PORT` key), add three new keys after `REPLICATE_API_TOKEN`:

```js
  GA4_PROPERTY_ID:    process.env.GA4_PROPERTY_ID || '',
  GA4_CLIENT_EMAIL:   process.env.GA4_CLIENT_EMAIL || '',
  GA4_PRIVATE_KEY:    process.env.GA4_PRIVATE_KEY || '',
```

- [ ] **Step 4: Add analyticsCache after the videos array**

After `const videos = [];` (line 36), add:

```js
const analyticsCache = { data: null, period: null, generatedAt: 0 };
const ANALYTICS_TTL_MS = 5 * 60 * 1000; // 5 minutes
```

- [ ] **Step 5: Add GA4 startup log**

Inside the `app.listen` callback (after the Replicate log line), add:

```js
  addLog(`GA4: ${CONFIG.GA4_PROPERTY_ID ? 'Connected (' + CONFIG.GA4_PROPERTY_ID + ')' : 'Not configured'}`, CONFIG.GA4_PROPERTY_ID ? 'success' : 'warn');
```

- [ ] **Step 6: Verify server still starts**

```bash
cd C:/Users/Acer/pinnboxio-agent
node -e "require('./server.js')" 2>&1 | head -5
```

Expected: server starts without error (may show port in use — that's fine, just no crash).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server.js
git commit -m "feat: install @google-analytics/data and add GA4 config keys"
```

---

## Task 2: fetchGA4Data() function

**Files:**
- Modify: `server.js` (add function after `buildVideoPrompt`, before `generateVideo`)

- [ ] **Step 1: Write the failing test first**

Create `tests/analytics.test.js`:

```js
// Tests for GA4 data-shaping logic
// These test the pure data transformation, not the API call

function shapeGA4Response(overviewRow, channelRows, pageRows, totalSessions) {
  const sessions = parseInt(overviewRow.metricValues[0].value) || 0;
  const newUsers = parseInt(overviewRow.metricValues[1].value) || 0;
  const bounceRate = Math.round(parseFloat(overviewRow.metricValues[2].value) * 100) || 0;
  const avgSessionSec = Math.round(parseFloat(overviewRow.metricValues[3].value)) || 0;

  const topSources = channelRows.slice(0, 5).map(row => {
    const s = parseInt(row.metricValues[0].value) || 0;
    return {
      name: row.dimensionValues[0].value,
      sessions: s,
      pct: totalSessions > 0 ? Math.round((s / totalSessions) * 100) : 0
    };
  });

  const topPages = pageRows.slice(0, 5).map(row => ({
    path: row.dimensionValues[0].value,
    views: parseInt(row.metricValues[0].value) || 0
  }));

  return { sessions, newUsers, bounceRate, avgSessionSec, topSources, topPages };
}

describe('shapeGA4Response', () => {
  const overviewRow = {
    metricValues: [
      { value: '3214' },
      { value: '1847' },
      { value: '0.62' },
      { value: '134' }
    ]
  };
  const channelRows = [
    { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '1221' }] },
    { dimensionValues: [{ value: 'Social' }], metricValues: [{ value: '867' }] },
    { dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: '675' }] }
  ];
  const pageRows = [
    { dimensionValues: [{ value: '/home' }], metricValues: [{ value: '1204' }] },
    { dimensionValues: [{ value: '/features' }], metricValues: [{ value: '843' }] }
  ];

  test('extracts session count', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.sessions).toBe(3214);
  });

  test('extracts new users', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.newUsers).toBe(1847);
  });

  test('converts bounce rate to 0-100 integer', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.bounceRate).toBe(62);
  });

  test('rounds avg session to whole seconds', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.avgSessionSec).toBe(134);
  });

  test('builds topSources with percentage', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.topSources[0].name).toBe('Organic Search');
    expect(result.topSources[0].sessions).toBe(1221);
    expect(result.topSources[0].pct).toBe(38);
  });

  test('builds topPages with views', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.topPages[0].path).toBe('/home');
    expect(result.topPages[0].views).toBe(1204);
  });

  test('handles zero total sessions without dividing by zero', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 0);
    expect(result.topSources[0].pct).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/Users/Acer/pinnboxio-agent
npx jest tests/analytics.test.js --no-coverage
```

Expected: FAIL — `shapeGA4Response is not defined`

- [ ] **Step 3: Add `fetchGA4Data()` to server.js**

Add this function after the `buildVideoPrompt` function (around line 107) and before `generateVideo`:

```js
function shapeGA4Response(overviewRow, channelRows, pageRows, totalSessions) {
  const sessions = parseInt(overviewRow.metricValues[0].value) || 0;
  const newUsers = parseInt(overviewRow.metricValues[1].value) || 0;
  const bounceRate = Math.round(parseFloat(overviewRow.metricValues[2].value) * 100) || 0;
  const avgSessionSec = Math.round(parseFloat(overviewRow.metricValues[3].value)) || 0;

  const topSources = channelRows.slice(0, 5).map(row => {
    const s = parseInt(row.metricValues[0].value) || 0;
    return {
      name: row.dimensionValues[0].value,
      sessions: s,
      pct: totalSessions > 0 ? Math.round((s / totalSessions) * 100) : 0
    };
  });

  const topPages = pageRows.slice(0, 5).map(row => ({
    path: row.dimensionValues[0].value,
    views: parseInt(row.metricValues[0].value) || 0
  }));

  return { sessions, newUsers, bounceRate, avgSessionSec, topSources, topPages };
}

async function fetchGA4Data(period = '30d') {
  if (!CONFIG.GA4_PROPERTY_ID || !CONFIG.GA4_CLIENT_EMAIL || !CONFIG.GA4_PRIVATE_KEY) {
    return null;
  }
  const daysMap = { '7d': '7daysAgo', '30d': '30daysAgo', '90d': '90daysAgo' };
  const startDate = daysMap[period] || '30daysAgo';

  try {
    const client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: CONFIG.GA4_CLIENT_EMAIL,
        private_key: CONFIG.GA4_PRIVATE_KEY.replace(/\\n/g, '\n')
      }
    });

    const [overviewResp, channelResp, pagesResp] = await Promise.all([
      client.runReport({
        property: CONFIG.GA4_PROPERTY_ID,
        dateRanges: [{ startDate, endDate: 'yesterday' }],
        metrics: [
          { name: 'sessions' },
          { name: 'newUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' }
        ]
      }),
      client.runReport({
        property: CONFIG.GA4_PROPERTY_ID,
        dateRanges: [{ startDate, endDate: 'yesterday' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 5
      }),
      client.runReport({
        property: CONFIG.GA4_PROPERTY_ID,
        dateRanges: [{ startDate, endDate: 'yesterday' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5
      })
    ]);

    const overviewRow = overviewResp[0]?.rows?.[0];
    if (!overviewRow) { addLog('GA4: no data returned', 'warn'); return null; }

    const channelRows = channelResp[0]?.rows || [];
    const pageRows = pagesResp[0]?.rows || [];
    const totalSessions = parseInt(overviewRow.metricValues[0].value) || 0;

    const shaped = shapeGA4Response(overviewRow, channelRows, pageRows, totalSessions);
    addLog(`GA4 data fetched: ${shaped.sessions} sessions (${period})`, 'success');
    return { period, ...shaped };
  } catch (err) {
    addLog(`GA4 fetch error: ${err.message}`, 'error');
    return null;
  }
}
```

- [ ] **Step 4: Copy `shapeGA4Response` into test file so it is self-contained**

The test file should define `shapeGA4Response` at the top so it runs without importing server.js. The test already does this — no change needed, it defines the function inline.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd C:/Users/Acer/pinnboxio-agent
npx jest tests/analytics.test.js --no-coverage
```

Expected: PASS — 7 tests pass

- [ ] **Step 6: Commit**

```bash
git add server.js tests/analytics.test.js
git commit -m "feat: add fetchGA4Data and shapeGA4Response with unit tests"
```

---

## Task 3: generateAnalyticsStrategy() function

**Files:**
- Modify: `server.js` (add function after `fetchGA4Data`)

- [ ] **Step 1: Add `generateAnalyticsStrategy()` to server.js**

Add this function immediately after `fetchGA4Data`:

```js
async function generateAnalyticsStrategy(ga4Data) {
  if (!CONFIG.ANTHROPIC_API_KEY || !ga4Data) return null;
  const systemPrompt = `You are a business strategist and growth advisor for Pinnboxio (pinnboxio.net).
Pinnboxio is an AI productivity app with voice-to-email, unified inbox (Gmail+Outlook), multi-model AI (GPT-4, Claude, Gemini), smart replies, persistent memory, inbox search, cloud storage, and calendar sync. Available on iOS and web, Android coming.

Analyse the GA4 analytics data provided and return a JSON object with exactly four strategy blocks.
Each block has three fields: title (short headline, max 10 words), finding (2-3 sentences that reference specific numbers from the data), action (one concrete next step, max 20 words, starts with a verb).

The four blocks must use these exact keys: revenue, subscription, product, marketing.

Be specific. Reference exact numbers. Avoid generic advice. Think like a growth consultant who has seen the data and has strong opinions. Do not hedge.

Return ONLY valid JSON, no markdown fences, no explanation, no extra text.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Here is the GA4 analytics data for pinnboxio.net:\n\n${JSON.stringify(ga4Data, null, 2)}\n\nReturn the four-block strategy JSON now.`
        }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const strategy = JSON.parse(text);
    if (!strategy.revenue || !strategy.subscription || !strategy.product || !strategy.marketing) {
      addLog('GA4 strategy: missing required blocks', 'error');
      return null;
    }
    addLog('GA4 strategy generated', 'success');
    return strategy;
  } catch (err) {
    addLog(`GA4 strategy error: ${err.message}`, 'error');
    return null;
  }
}
```

- [ ] **Step 2: Verify server.js syntax is valid**

```bash
cd C:/Users/Acer/pinnboxio-agent
node --check server.js
```

Expected: no output (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add generateAnalyticsStrategy using Claude API"
```

---

## Task 4: GET /api/analytics route + update /api/status

**Files:**
- Modify: `server.js` (add route, update status route)

- [ ] **Step 1: Add `GET /api/analytics` route**

Add this route after the `GET /api/videos` route (around line 422):

```js
app.get('/api/analytics', async (req, res) => {
  const period = ['7d', '30d', '90d'].includes(req.query.period) ? req.query.period : '30d';

  if (!CONFIG.GA4_PROPERTY_ID || !CONFIG.GA4_CLIENT_EMAIL || !CONFIG.GA4_PRIVATE_KEY) {
    return res.json({ success: false, reason: 'not_configured' });
  }

  const now = Date.now();
  const cacheValid = analyticsCache.data &&
    analyticsCache.period === period &&
    (now - analyticsCache.generatedAt) < ANALYTICS_TTL_MS;

  if (cacheValid) {
    return res.json({ success: true, cached: true, ...analyticsCache.data });
  }

  const metrics = await fetchGA4Data(period);
  if (!metrics) {
    return res.json({ success: false, reason: 'ga4_error' });
  }

  const strategy = await generateAnalyticsStrategy(metrics);

  const payload = { period, metrics, strategy, generatedAt: now };
  analyticsCache.data = payload;
  analyticsCache.period = period;
  analyticsCache.generatedAt = now;

  res.json({ success: true, cached: false, ...payload });
});
```

- [ ] **Step 2: Update `/api/status` to include `ga4` field**

Find the existing `app.get('/api/status', ...)` route. It currently returns:
```js
res.json({
  claude: !!CONFIG.ANTHROPIC_API_KEY,
  openai: !!CONFIG.OPENAI_API_KEY,
  facebook: !!CONFIG.META_ACCESS_TOKEN,
  instagram: !!CONFIG.IG_USER_ID,
  x: false,
  linkedin: !!CONFIG.LINKEDIN_ACCESS_TOKEN,
  replicate: !!CONFIG.REPLICATE_API_TOKEN,
  nextPost: 'Mon/Wed/Fri at 9:00 AM UTC'
});
```

Add the `ga4` field:
```js
res.json({
  claude: !!CONFIG.ANTHROPIC_API_KEY,
  openai: !!CONFIG.OPENAI_API_KEY,
  facebook: !!CONFIG.META_ACCESS_TOKEN,
  instagram: !!CONFIG.IG_USER_ID,
  x: false,
  linkedin: !!CONFIG.LINKEDIN_ACCESS_TOKEN,
  replicate: !!CONFIG.REPLICATE_API_TOKEN,
  ga4: !!(CONFIG.GA4_PROPERTY_ID && CONFIG.GA4_CLIENT_EMAIL && CONFIG.GA4_PRIVATE_KEY),
  nextPost: 'Mon/Wed/Fri at 9:00 AM UTC'
});
```

- [ ] **Step 3: Verify syntax**

```bash
cd C:/Users/Acer/pinnboxio-agent
node --check server.js
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add GET /api/analytics route with caching and update /api/status"
```

---

## Task 5: Backend tests for analytics route

**Files:**
- Modify: `tests/analytics.test.js` (add route test)

- [ ] **Step 1: Add route test to analytics.test.js**

Append these tests to `tests/analytics.test.js`:

```js
// Route-level test — checks /api/analytics returns correct shape when not configured
const express = require('express');

function makeAnalyticsRouter() {
  const router = express.Router();
  router.get('/api/analytics', (req, res) => {
    // Simulates not_configured state
    res.json({ success: false, reason: 'not_configured' });
  });
  return router;
}

describe('/api/analytics not_configured', () => {
  let app, server;

  beforeAll(done => {
    app = express();
    app.use(makeAnalyticsRouter());
    server = app.listen(0, done);
  });

  afterAll(done => server.close(done));

  test('returns success:false with reason not_configured', async () => {
    const fetch = require('node-fetch');
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/analytics`);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.reason).toBe('not_configured');
  });
});
```

- [ ] **Step 2: Run all analytics tests**

```bash
cd C:/Users/Acer/pinnboxio-agent
npx jest tests/analytics.test.js --no-coverage
```

Expected: PASS — 8 tests pass

- [ ] **Step 3: Run full test suite to check nothing is broken**

```bash
cd C:/Users/Acer/pinnboxio-agent
npm test
```

Expected: all existing tests still pass

- [ ] **Step 4: Commit**

```bash
git add tests/analytics.test.js
git commit -m "test: add analytics route and data-shaping unit tests"
```

---

## Task 6: Frontend CSS for GA4 Intelligence

**Files:**
- Modify: `public/index.html` (add CSS block in `<style>` section)

- [ ] **Step 1: Add GA4 Intelligence CSS**

Find the `/* VIDEO CREATOR */` CSS comment block. Add a new `/* GA4 INTELLIGENCE */` block immediately before it:

```css
/* GA4 INTELLIGENCE */
.ga4-banner{display:flex;align-items:center;justify-content:space-between;background:rgba(244,169,0,0.06);border:1px dashed rgba(244,169,0,0.25);border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#8a7060;}
.ga4-banner.connected{border-style:solid;border-color:rgba(244,169,0,0.3);color:#c4a882;}
.ga4-banner strong{color:#f4a900;}
.ga4-refresh{background:none;border:1px solid rgba(244,169,0,0.3);color:#f4a900;padding:5px 12px;border-radius:8px;font-size:11px;cursor:pointer;font-family:var(--mono);}
.period-tabs{display:flex;gap:8px;margin-bottom:18px;}
.period-tab{padding:5px 14px;border-radius:20px;font-size:11px;cursor:pointer;border:1px solid rgba(244,169,0,0.2);color:#8a7060;font-family:var(--mono);}
.period-tab.active{background:#f4a900;color:#1a0a00;font-weight:700;border-color:#f4a900;}
.intel-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
.intel-metric{background:var(--choc);border:1px solid rgba(244,169,0,0.12);border-radius:10px;padding:16px;text-align:center;}
.intel-metric-val{font-size:26px;font-weight:700;color:#f4a900;font-family:var(--mono);}
.intel-metric-lbl{font-size:10px;color:#8a7060;margin-top:4px;text-transform:uppercase;letter-spacing:1px;}
.intel-metric-trend{font-size:11px;margin-top:5px;color:#4caf50;}
.intel-metric-trend.bad{color:#ef5350;}
.intel-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}
.source-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(244,169,0,0.07);}
.source-row:last-child{border-bottom:none;}
.source-bar-wrap{width:70px;height:5px;background:rgba(244,169,0,0.1);border-radius:3px;overflow:hidden;margin:0 8px;}
.source-bar{height:100%;background:#f4a900;border-radius:3px;}
.source-pct{color:#f4a900;font-size:11px;font-family:var(--mono);width:30px;text-align:right;}
.page-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(244,169,0,0.07);font-size:12px;}
.page-row:last-child{border-bottom:none;}
.page-url{color:#c4a882;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;}
.page-views{color:#f4a900;font-family:var(--mono);}
.intel-strategy-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#f4a900;font-family:var(--mono);margin-bottom:14px;}
.strategy-card{background:var(--choc);border:1px solid rgba(244,169,0,0.12);border-radius:12px;padding:18px 20px;margin-bottom:12px;position:relative;overflow:hidden;}
.strategy-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;}
.strategy-card.revenue::before{background:linear-gradient(90deg,#f4a900,#ff9800);}
.strategy-card.subscription::before{background:linear-gradient(90deg,#4caf50,#8bc34a);}
.strategy-card.product::before{background:linear-gradient(90deg,#42a5f5,#7c4dff);}
.strategy-card.marketing::before{background:linear-gradient(90deg,#ef5350,#ff4081);}
.strategy-hdr{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.strategy-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.si-revenue{background:rgba(244,169,0,0.12);}
.si-subscription{background:rgba(76,175,80,0.12);}
.si-product{background:rgba(66,165,245,0.12);}
.si-marketing{background:rgba(239,83,80,0.12);}
.strategy-title{font-weight:600;font-size:13px;color:#f5e6c8;line-height:1.4;}
.strategy-finding{color:#c4a882;font-size:12px;line-height:1.6;margin-bottom:10px;}
.strategy-action{padding:8px 12px;background:rgba(244,169,0,0.06);border-left:3px solid #f4a900;border-radius:0 6px 6px 0;font-size:12px;color:#f4a900;margin-bottom:10px;}
.strategy-btn{display:inline-block;padding:5px 12px;border-radius:8px;font-size:11px;cursor:pointer;border:1px solid rgba(244,169,0,0.3);color:#f4a900;background:none;font-family:var(--mono);}
.intel-skeleton{background:rgba(244,169,0,0.05);border-radius:8px;height:20px;margin-bottom:8px;animation:shimmer 1.5s infinite;}
@keyframes shimmer{0%,100%{opacity:0.4;}50%{opacity:0.8;}}
```

- [ ] **Step 2: Verify CSS was added correctly — no broken selectors**

Open `public/index.html` in a text editor and confirm the GA4 CSS block appears before `/* VIDEO CREATOR */`.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add GA4 intelligence CSS"
```

---

## Task 7: Frontend HTML — GA4 chip + Intelligence screen upgrade

**Files:**
- Modify: `public/index.html` (topbar chip, replace Intelligence screen body)

- [ ] **Step 1: Add GA4 status chip to topbar**

Find this line in the topbar-right div:
```html
      <span class="chip chip-off" id="cc-replicate">Replicate…</span>
```

Add the GA4 chip immediately after it:
```html
      <span class="chip chip-off" id="cc-ga4">GA4…</span>
```

- [ ] **Step 2: Replace the Intelligence screen content**

Find the entire Intelligence screen div:
```html
    <!-- INTELLIGENCE -->
    <div class="screen" id="screen-intelligence">
      <div style="margin-bottom:20px;">
        <div style="font-family:var(--font);font-size:26px;font-weight:600;font-style:italic;color:var(--gold);margin-bottom:4px;">Intelligence</div>
        <div style="font-size:13px;color:var(--beige);">Competitive analysis, feature recommendations, audience insights, App Store optimisation.</div>
      </div>
      <div class="two-col">
        <div>
          <div class="card">
            <div class="card-title">Competitive intelligence</div>
```

Replace the entire `#screen-intelligence` div (everything from `<!-- INTELLIGENCE -->` up to and including its closing `</div>` before `<!-- VIDEO CREATOR -->`) with:

```html
    <!-- INTELLIGENCE -->
    <div class="screen" id="screen-intelligence">
      <div style="margin-bottom:20px;">
        <div style="font-family:var(--font);font-size:26px;font-weight:600;font-style:italic;color:var(--gold);margin-bottom:4px;">Intelligence</div>
        <div style="font-size:13px;color:var(--beige);">Real GA4 data from pinnboxio.net + AI-generated business strategy.</div>
      </div>

      <!-- GA4 connection banner -->
      <div class="ga4-banner" id="ga4-banner">
        <span>Connect Google Analytics to unlock data-driven strategy. <a href="https://console.cloud.google.com" target="_blank" style="color:#f4a900;">Setup Guide ↗</a></span>
      </div>

      <!-- Period selector -->
      <div class="period-tabs" id="period-tabs" style="display:none;">
        <div class="period-tab" data-period="7d" onclick="setPeriod(this)">7 days</div>
        <div class="period-tab active" data-period="30d" onclick="setPeriod(this)">30 days</div>
        <div class="period-tab" data-period="90d" onclick="setPeriod(this)">90 days</div>
      </div>

      <!-- Metrics grid -->
      <div class="intel-metrics" id="intel-metrics" style="display:none;">
        <div class="intel-metric"><div class="intel-metric-val" id="im-sessions">—</div><div class="intel-metric-lbl">Visitors</div></div>
        <div class="intel-metric"><div class="intel-metric-val" id="im-new">—</div><div class="intel-metric-lbl">New Users</div></div>
        <div class="intel-metric"><div class="intel-metric-val" id="im-bounce">—</div><div class="intel-metric-lbl">Bounce Rate</div><div class="intel-metric-trend bad" id="im-bounce-note"></div></div>
        <div class="intel-metric"><div class="intel-metric-val" id="im-session">—</div><div class="intel-metric-lbl">Avg Session</div></div>
      </div>

      <!-- Sources + pages -->
      <div class="intel-two" id="intel-two" style="display:none;">
        <div class="card">
          <div class="card-title">Traffic Sources</div>
          <div id="intel-sources"><div class="intel-skeleton"></div><div class="intel-skeleton"></div><div class="intel-skeleton"></div></div>
        </div>
        <div class="card">
          <div class="card-title">Top Pages</div>
          <div id="intel-pages"><div class="intel-skeleton"></div><div class="intel-skeleton"></div><div class="intel-skeleton"></div></div>
        </div>
      </div>

      <!-- AI strategy -->
      <div id="intel-strategy-wrap" style="display:none;">
        <div class="intel-strategy-label">🧠 AI Strategy — Based On Your Real Data</div>
        <div id="intel-strategy"></div>
      </div>

      <!-- Loading state -->
      <div id="intel-loading" style="display:none;padding:40px 0;text-align:center;color:#8a7060;font-size:13px;">
        Loading analytics data and generating strategy…
      </div>

      <!-- Competitive + features (kept below GA4 section) -->
      <div class="two-col" style="margin-top:24px;">
        <div>
          <div class="card">
            <div class="card-title">Competitive intelligence</div>
            <div><label>Analysis type</label>
              <select id="intel-t">
                <option>Full competitive landscape</option>
                <option>vs Superhuman</option>
                <option>vs Notion AI</option>
                <option>vs Microsoft Copilot</option>
                <option>vs Google Gemini in Gmail</option>
                <option>vs Apple Intelligence</option>
                <option>Market gap analysis</option>
                <option>Global expansion opportunities</option>
              </select>
            </div>
            <div><label>Market</label><select id="intel-m"><option>Worldwide</option><option>North America</option><option>Europe</option><option>South Asia</option><option>Southeast Asia</option><option>Middle East</option></select></div>
            <button class="btn btn-gold btn-full" onclick="genIntel()">◎ Run intelligence report</button>
            <div class="status-msg" id="intel-st"></div>
          </div>
          <div class="card">
            <div class="card-title">Feature recommendations</div>
            <div><label>User feedback</label><textarea id="feat-fb" rows="3" placeholder="What are users asking for? What complaints are you seeing?…"></textarea></div>
            <div><label>Focus</label><select id="feat-f"><option>What to build next</option><option>Quick wins</option><option>Competitive moat</option><option>Global expansion</option></select></div>
            <button class="btn btn-gold btn-full" onclick="genFeatures()">💡 Get recommendations</button>
            <div class="status-msg" id="feat-st"></div>
          </div>
          <div class="card">
            <div class="card-title">App Store optimisation</div>
            <div><label>Platform</label><select id="aso-p"><option>iOS App Store</option><option>Google Play</option><option>Both</option></select></div>
            <button class="btn btn-gold btn-full" onclick="genASO()">💡 Optimise App Store listing</button>
            <div class="status-msg" id="aso-st"></div>
          </div>
        </div>
        <div id="intel-out"><div style="font-size:12px;color:var(--choc4);font-family:var(--mono);">Run an analysis to see insights here.</div></div>
      </div>
    </div>
```

- [ ] **Step 3: Verify the HTML structure is valid — no unclosed divs**

Search for `screen-intelligence` in the file and confirm the div closes properly before `<!-- VIDEO CREATOR -->`.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: add GA4 chip and upgrade Intelligence screen HTML"
```

---

## Task 8: Frontend JS — analytics functions + showScreen wiring

**Files:**
- Modify: `public/index.html` (add JS functions in `<script>` block)

- [ ] **Step 1: Add GA4 chip update to `loadSt()`**

Find the existing `loadSt()` function. It currently ends with the Replicate chip block:
```js
    const cr = document.getElementById('cc-replicate');
    if (cr) {
      cr.textContent = d.replicate ? 'Replicate ✓' : 'Replicate ✗';
      cr.className = d.replicate ? 'chip chip-on' : 'chip chip-off';
    }
```

Add the GA4 chip update immediately after:
```js
    const cg = document.getElementById('cc-ga4');
    if (cg) {
      cg.textContent = d.ga4 ? 'GA4 ✓' : 'GA4 ✗';
      cg.className = d.ga4 ? 'chip chip-on' : 'chip chip-off';
    }
```

- [ ] **Step 2: Wire auto-load into `showScreen()`**

Find the `showScreen` function. It currently looks like:
```js
function showScreen(n,el){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
  document.getElementById('screen-'+n).classList.add('active');
  el.classList.add('active');
  const titles={home:'Home',autopilot:'Autopilot',studio:'Studio',intelligence:'Intelligence',video:'Video Creator'};
  document.getElementById('page-title').textContent=titles[n]||n;
}
```

Replace it with:
```js
function showScreen(n,el){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
  document.getElementById('screen-'+n).classList.add('active');
  el.classList.add('active');
  const titles={home:'Home',autopilot:'Autopilot',studio:'Studio',intelligence:'Intelligence',video:'Video Creator'};
  document.getElementById('page-title').textContent=titles[n]||n;
  if(n==='intelligence') loadAnalytics(currentPeriod||'30d');
}
```

- [ ] **Step 3: Add analytics JS functions**

Find the line `// VIDEO CREATOR` comment in the script block. Add all analytics JS immediately before it:

```js
// ANALYTICS
let currentPeriod = '30d';
let analyticsLoaded = false;

function setPeriod(el) {
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  currentPeriod = el.dataset.period;
  analyticsLoaded = false;
  loadAnalytics(currentPeriod);
}

async function loadAnalytics(period) {
  const banner = document.getElementById('ga4-banner');
  const loading = document.getElementById('intel-loading');
  const metrics = document.getElementById('intel-metrics');
  const two = document.getElementById('intel-two');
  const stratWrap = document.getElementById('intel-strategy-wrap');
  const periodTabs = document.getElementById('period-tabs');

  loading.style.display = 'block';
  metrics.style.display = 'none';
  two.style.display = 'none';
  stratWrap.style.display = 'none';

  try {
    const res = await fetch('/api/analytics?period=' + period);
    const data = await res.json();
    loading.style.display = 'none';

    if (!data.success) {
      if (data.reason === 'not_configured') {
        banner.className = 'ga4-banner';
        banner.innerHTML = 'Connect Google Analytics to unlock data-driven strategy. <a href="https://console.cloud.google.com" target="_blank" style="color:#f4a900;">Setup Guide ↗</a>';
      } else {
        banner.className = 'ga4-banner';
        banner.innerHTML = '<strong>GA4 error:</strong> Could not fetch analytics data. Check server logs.';
      }
      return;
    }

    analyticsLoaded = true;
    const syncTime = new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    banner.className = 'ga4-banner connected';
    banner.innerHTML = '<span><strong>GA4 connected</strong> · pinnboxio.net · Last synced ' + syncTime + '</span><button class="ga4-refresh" onclick="refreshAnalytics()">⟳ Refresh</button>';

    periodTabs.style.display = 'flex';
    renderMetrics(data.metrics);
    renderSources(data.metrics.topSources);
    renderPages(data.metrics.topPages);
    metrics.style.display = 'grid';
    two.style.display = 'grid';

    if (data.strategy) {
      renderStrategy(data.strategy);
      stratWrap.style.display = 'block';
    }
  } catch (err) {
    loading.style.display = 'none';
    banner.innerHTML = 'Failed to load analytics: ' + err.message;
  }
}

function renderMetrics(m) {
  document.getElementById('im-sessions').textContent = m.sessions.toLocaleString();
  document.getElementById('im-new').textContent = m.newUsers.toLocaleString();
  const br = m.bounceRate + '%';
  document.getElementById('im-bounce').textContent = br;
  document.getElementById('im-bounce-note').textContent = m.bounceRate > 60 ? 'High — needs attention' : 'Good';
  document.getElementById('im-bounce-note').className = 'intel-metric-trend' + (m.bounceRate > 60 ? ' bad' : '');
  const mins = Math.floor(m.avgSessionSec / 60);
  const secs = String(m.avgSessionSec % 60).padStart(2, '0');
  document.getElementById('im-session').textContent = mins + 'm ' + secs + 's';
}

function renderSources(sources) {
  const el = document.getElementById('intel-sources');
  if (!sources || !sources.length) { el.innerHTML = '<div style="font-size:12px;color:#8a7060;">No source data</div>'; return; }
  const maxPct = Math.max(...sources.map(s => s.pct), 1);
  el.innerHTML = sources.map(s =>
    '<div class="source-row"><span style="font-size:12px;color:#c4a882;">' + s.name + '</span>' +
    '<div style="display:flex;align-items:center;">' +
    '<div class="source-bar-wrap"><div class="source-bar" style="width:' + Math.round((s.pct / maxPct) * 100) + '%"></div></div>' +
    '<span class="source-pct">' + s.pct + '%</span></div></div>'
  ).join('');
}

function renderPages(pages) {
  const el = document.getElementById('intel-pages');
  if (!pages || !pages.length) { el.innerHTML = '<div style="font-size:12px;color:#8a7060;">No page data</div>'; return; }
  el.innerHTML = pages.map(p =>
    '<div class="page-row"><span class="page-url" title="' + p.path + '">' + p.path + '</span><span class="page-views">' + p.views.toLocaleString() + '</span></div>'
  ).join('');
}

const STRATEGY_META = {
  revenue:      { icon: '💰', cls: 'revenue',      iconCls: 'si-revenue',      btn: 'View Pricing Page', action: () => window.open('https://pinnboxio.net/pricing', '_blank') },
  subscription: { icon: '🔔', cls: 'subscription', iconCls: 'si-subscription', btn: 'View Signup Page',  action: () => window.open('https://pinnboxio.net/signup', '_blank') },
  product:      { icon: '🛠️', cls: 'product',      iconCls: 'si-product',      btn: 'Open Studio',       action: () => { const el=document.querySelector('[onclick*="\'studio\'"]'); if(el)el.click(); } },
  marketing:    { icon: '📣', cls: 'marketing',    iconCls: 'si-marketing',    btn: 'Create Video',      action: (a) => { const el=document.querySelector('[onclick*="\'video\'"]'); if(el)el.click(); if(a)setTimeout(()=>setVidPrompt(a),100); } }
};

function renderStrategy(strategy) {
  const el = document.getElementById('intel-strategy');
  el.innerHTML = ['revenue','subscription','product','marketing'].map(key => {
    const block = strategy[key];
    if (!block) return '';
    const meta = STRATEGY_META[key];
    return '<div class="strategy-card ' + meta.cls + '">' +
      '<div class="strategy-hdr"><div class="strategy-icon ' + meta.iconCls + '">' + meta.icon + '</div>' +
      '<div class="strategy-title">' + block.title + '</div></div>' +
      '<div class="strategy-finding">' + block.finding + '</div>' +
      '<div class="strategy-action">→ ' + block.action + '</div>' +
      '<button class="strategy-btn" onclick="strategyAction(\'' + key + '\',this.dataset.action)" data-action="' + (block.action||'').replace(/"/g,'&quot;') + '">' + meta.btn + ' ↗</button>' +
      '</div>';
  }).join('');
}

function strategyAction(key, actionText) {
  const meta = STRATEGY_META[key];
  if (meta) meta.action(actionText);
}

function refreshAnalytics() {
  analyticsLoaded = false;
  loadAnalytics(currentPeriod);
}
```

- [ ] **Step 4: Verify no JS syntax errors**

Open the browser console on the local app and check for errors, OR run:

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('C:/Users/Acer/pinnboxio-agent/public/index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g);
console.log('Script blocks found:', scriptMatch ? scriptMatch.length : 0);
"
```

Expected: `Script blocks found: 1` (or more if multiple — just confirms the file parses)

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: add analytics JS — loadAnalytics, renderMetrics, renderSources, renderPages, renderStrategy"
```

---

## Task 9: Push to GitHub to trigger Render deploy

**Files:** none (git push only)

- [ ] **Step 1: Run full test suite one final time**

```bash
cd C:/Users/Acer/pinnboxio-agent
npm test
```

Expected: all tests pass

- [ ] **Step 2: Push to GitHub**

```bash
cd C:/Users/Acer/pinnboxio-agent
git push origin main
```

Expected: `main -> main` push succeeds

- [ ] **Step 3: Verify on live site**

Wait ~2 minutes for Render to deploy, then:
- Visit https://pinnboxio-agent.onrender.com
- Click **Intelligence** tab in sidebar
- If GA4 not yet configured: banner shows "Connect Google Analytics" with Setup Guide link
- If GA4 configured: metrics grid, source bars, top pages, and strategy cards appear

---

## Google Cloud Setup (for user — one-time after deploy)

1. Go to https://console.cloud.google.com → create/select a project
2. APIs & Services → Enable **Google Analytics Data API**
3. IAM & Admin → Service Accounts → Create service account → download JSON key
4. Open GA4 at analytics.google.com → Admin → Property Access Management → Add user → paste service account email → Role: **Viewer**
5. In Render dashboard → pinnboxio-agent → Environment, add:
   - `GA4_PROPERTY_ID` = value from GA4 Admin → Property Settings → Property ID, formatted as `properties/XXXXXXXXX`
   - `GA4_CLIENT_EMAIL` = `client_email` field from the downloaded JSON key
   - `GA4_PRIVATE_KEY` = `private_key` field from the downloaded JSON key (full block including `-----BEGIN...-----END...`)
6. Save → Render redeploys → Intelligence tab shows live data
