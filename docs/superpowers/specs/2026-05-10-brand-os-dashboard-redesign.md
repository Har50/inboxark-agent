# Pinnboxio Brand OS Dashboard Redesign — Design Spec

## Goal

Replace the existing single-page dashboard with a sidebar-nav driven Brand OS control center that visualizes everything the autonomous agent is doing — posts, engagement graphs, A/B test results, strategy memory evolution, competitor intel, trend radar, and weekly learning — so the user can watch the agent evolve the Pinnboxio brand over time.

## Architecture

Single HTML file (`public/index.html`) rewritten as a client-side SPA. No build step, no framework — vanilla JS + CSS, same as existing. All data comes from the existing Express API endpoints (`/api/posts`, `/api/logs`, `/api/intel`, `/api/status`). Two new API endpoints are added to `server.js`: `GET /api/metrics/history` (returns `business_metrics` rows) and `GET /api/strategy` (returns latest `strategy_memory` row). Navigation state is managed in JS with `showSection(name)` — no URL routing needed.

## Layout

Fixed left sidebar (160px wide, dark navy `#0b1120`) + full-height scrollable main content area. Sidebar stays visible at all times. Main area re-renders on nav click. The layout uses CSS flexbox — sidebar is `flex-shrink:0`, main area is `flex:1 overflow-y:auto`.

## Sidebar Navigation

Eight sections in order:

1. **Overview** (default on load) — `📊`
2. **Posts** — `📅`
3. **A/B Tests** — `🧪`
4. **Strategy** — `🧠`
5. **Intel** — `🔍`
6. **Metrics** — `📈`
7. **Email** — `📧`
8. **Logs** — `📋`

Active section gets highlighted background (`#1e3a5f`, text `#38bdf8`). Inactive is muted (`#64748b`). Clicking triggers `showSection(name)` which hides all section divs and shows the target one.

## Sections — Content & Data Sources

### Overview
The landing screen. Loads on `DOMContentLoaded`.

**Stat strip** (4 cards across top):
- Total posts published — count of `posts` where `status = 'published'`
- Engagement growth — placeholder "—" until metrics data available (from `business_metrics`)
- A/B this week — "A wins / B wins / Tied" based on comparing `ab_variant='A'` vs `ab_variant='B'` published posts from the last 7 days
- Intel reports count — count of rows in `intel_reports`

**Agent Activity Timeline** (left column, ~50% width):
- Fetches `/api/logs` (50 most recent)
- Renders chronological list, newest first, with colored dot per log type: `success` = green `#34d399`, `info` = blue `#38bdf8`, `warn` = amber `#f59e0b`, `error` = red `#ef4444`
- Each entry: log message + relative time ("2h ago", "Mon")
- Upcoming scheduled jobs shown as gray dashed dots at bottom (static — hardcoded cron schedule)

**Engagement Chart** (right column, ~50% width):
- Fetches `/api/metrics/history` — returns `business_metrics` rows ordered by `created_at`
- Stacked bar chart, one bar per week, three segments: FB (blue `#1877f2`), LinkedIn (navy `#0a66c2`), X (sky `#1d9bf0`)
- If no metrics data yet: show "No metrics data yet — metrics collect daily at 6pm UTC" placeholder
- Pure CSS bars: bar height = `(value / maxValue) * 60px`, rendered as flex column

**Strategy Memory Snippet** (full width, below columns):
- Fetches `/api/strategy`
- Displays `content` field in italic, plus `updated_at` timestamp
- If none: "Strategy memory not yet written — weekly review runs Sunday 8am UTC"

### Posts
Full post history.

- Fetches `/api/posts` (50 most recent)
- Each post card shows:
  - DALL·E image (if `image_url` present) — `<img>` with `onerror` hiding the element
  - Platform badges: FB / LI / X — colored only if that platform's post_id is non-null
  - A/B variant badge: `A` (teal) or `B` (purple) if `ab_variant` is set
  - Status badge: `published` (green), `queued` (amber), `failed` (red)
  - Post angle/topic
  - First 200 chars of `text_fb` with "..." truncation
  - Hashtags as small gray pills
  - `scheduled_at` formatted as "Mon May 6 · 9:00am UTC"
- Cards in a 2-column CSS grid on wide screens, 1-column on narrow

### A/B Tests
Shows paired A/B posts and which variant performed better.

- Fetches `/api/posts`, groups by `ab_pair_id` (post A's `id` = pair anchor, post B has `ab_pair_id` pointing to A's id)
- Each pair renders as a side-by-side comparison card:
  - Left: Variant A — platform badges, published time, `fb_post_id`/`li_post_id`/`x_post_id` presence
  - Right: Variant B — same, FB only
  - Winner badge: "A published to 3 platforms" vs "B published to 1 platform" — simple platform count comparison shown, no engagement data (we don't pull live engagement stats yet)
- Unpaired posts (no `ab_pair_id`, no `ab_variant`) shown in a separate "Solo Posts" list below
- If no pairs yet: "No A/B pairs yet — pairs are created on each autonomous post cycle"

### Strategy
Full strategy memory view — the brain of the agent.

- Fetches `/api/strategy`
- Top card: full `content` text of current strategy memory, formatted in a dark card with generous line-height
- `updated_at` + "Updated by weekly review agent"
- Below: "What this means" — static explainer paragraph: "Every Sunday at 8am UTC, the review agent reads the last week's post performance and rewrites this memory. The planner and content generator both read this before creating new posts."
- If no strategy yet: "Weekly review hasn't run yet — it runs every Sunday at 8am UTC. You can trigger it manually below." + "Run Weekly Review" button that POSTs to `/api/cron/trigger/review`

### Intel
Competitor monitoring + trend radar reports.

- Fetches `/api/intel`
- Each report card shows:
  - Report type badge: `competitors` (red-orange) or `trends` (purple)
  - `created_at` formatted as date
  - `summary` field (truncated to 400 chars with expand toggle)
  - `raw_data` expandable section (collapsed by default, "Show full report" link)
- Sorted newest first
- If none: "No intel reports yet — competitor scan runs Tuesdays 10am UTC, trend radar runs Thursdays 10am UTC"
- Manual trigger buttons: "Run Competitor Scan" → POST `/api/cron/trigger/competitors`, "Run Trend Radar" → POST `/api/cron/trigger/trends`

### Metrics
Business + platform metrics.

- Fetches `/api/metrics/history`
- Table view: columns = Date, Signups, Trials, Conversions, Source, Notes
- Sorted newest first
- Above table: 3 summary stat cards — Total Signups, Total Trials, Total Conversions (summed from all rows)
- If no data: "No business metrics yet. Send data via POST /api/metrics/business (signups, trials, conversions, notes)"
- Shows Render webhook URL hint for automating: `POST https://pinnboxio-agent.onrender.com/api/metrics/business`

### Email
Email campaign history.

- Fetches `/api/logs` filtered client-side for messages containing "email" or "Email"
- Shows a simple log list of email-related events
- "Run Email Campaign" button → POST `/api/cron/trigger/email`
- Static note: "Email campaign runs every Sunday at 9am UTC"

### Logs
Raw agent logs.

- Fetches `/api/logs` (50 most recent)
- Monospace font, full-width rows
- Each row: colored dot (by type) + timestamp + message
- Auto-refresh every 30 seconds via `setInterval`
- "Refresh Now" button
- Manual job trigger panel at bottom:
  - Buttons for each of the 8 jobs: Post, Metrics, Scorecard, Competitors, Trends, Review, Email, Planner
  - Each button POSTs to `/api/cron/trigger/:job`
  - Button shows spinner + "Running..." while in-flight, then "Done ✓" or "Error ✗"

## New API Endpoints (server.js additions)

### GET /api/metrics/history
```js
app.get('/api/metrics/history', asyncRoute(async (req, res) => {
  const { data } = await supabase
    .from('business_metrics')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  res.json({ metrics: data || [] });
}));
```

### GET /api/strategy
```js
app.get('/api/strategy', asyncRoute(async (req, res) => {
  const { data } = await supabase
    .from('strategy_memory')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  res.json({ strategy: data || null });
}));
```

Both use the existing `supabase` client already imported in `server.js` via `lib/db.js`. Actually, `supabase` is not exported from `lib/db.js` directly — these queries go through a new exported function `getLatestStrategy()` and `getBusinessMetrics()` added to `lib/db.js`, consistent with the existing pattern.

## lib/db.js Additions

Two new exported functions:

```js
async function getLatestStrategy() {
  const { data } = await supabase
    .from('strategy_memory')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

async function getBusinessMetricsHistory() {
  const { data } = await supabase
    .from('business_metrics')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  return data || [];
}
```

Export both in the `module.exports` block.

## Visual Design

- Background: `#0f172a` (deep navy)
- Sidebar: `#0b1120`
- Cards: `#1e293b`
- Active nav: `#1e3a5f` with `#38bdf8` text
- Inactive nav: `#64748b`
- Success/green: `#34d399`
- Info/blue: `#38bdf8`
- Warning/amber: `#f59e0b`
- Error/red: `#ef4444`
- A variant badge: teal `#0d9488`
- B variant badge: purple `#7c3aed`
- Body text: `#cbd5e1`, muted: `#64748b`
- Monospace font for logs: `'Courier New', monospace`
- All other text: system sans-serif stack

## Error Handling

Every `fetch()` call wraps in try/catch. On error, the section div shows a red error banner: "Failed to load data — check server logs" with a Retry button that re-runs the load function.

## Auto-refresh

- Overview: reloads stat strip + timeline every 60 seconds
- Logs: reloads every 30 seconds
- All other sections: manual refresh only (no auto-reload)

## What Is Not In Scope

- Real-time engagement stats pulled from Facebook/LinkedIn/X APIs (requires separate metrics collection job, already in the cron schedule — the data will appear when `collectFBMetrics` and `collectLIMetrics` run)
- Charts using Chart.js or any external library — pure CSS bars only
- Mobile responsive breakpoints (desktop-first, sidebar collapses on narrow screens is a future enhancement)
- User authentication on the dashboard
