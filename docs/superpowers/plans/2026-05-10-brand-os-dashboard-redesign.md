# Brand OS Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Pinnboxio dashboard with a sidebar-nav Brand OS control center showing posts, A/B test results, strategy memory evolution, competitor intel, trend radar, engagement charts, and weekly learning.

**Architecture:** Single-file vanilla JS SPA (`public/index.html`) — no build step, no framework. Two new backend functions in `lib/db.js` (`getLatestStrategy`, `getBusinessMetricsHistory`) exposed via two new Express routes in `server.js` (`GET /api/strategy`, `GET /api/metrics/history`). All data fetched client-side via `fetch()` on section load.

**Tech Stack:** Node.js, Express, Supabase JS client, vanilla JS, pure CSS (no Chart.js, no external libraries beyond what already exists)

---

## File Map

| File | Change | Responsibility |
|------|--------|----------------|
| `lib/db.js` | Modify | Add `getLatestStrategy()` + `getBusinessMetricsHistory()`, update `module.exports` |
| `server.js` | Modify | Update import from `lib/db.js`, add `GET /api/strategy` and `GET /api/metrics/history` routes |
| `public/index.html` | Full rewrite | Complete new SPA: CSS, sidebar nav, 8 sections, all JS loaders |

---

## Task 1: Add DB functions to lib/db.js

**Files:**
- Modify: `lib/db.js`

- [ ] **Step 1: Add `getLatestStrategy` after the `getWeekBusinessMetrics` function (line 75 in the current file)**

Add this code after the `getWeekBusinessMetrics` function and before the `getCurrentWeek` function:

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
    .order('recorded_at', { ascending: false })
    .limit(100);
  return data || [];
}
```

- [ ] **Step 2: Update `module.exports` to include both new functions**

The current `module.exports` block at line 90–94 is:
```js
module.exports = {
  supabase, addLog, savePost, updatePost, getLogs, getPosts, getQueuedPosts,
  saveIntelReport, getIntelReports, getRecentPublishedPosts,
  saveMetrics, getWeekMetrics, readStrategyMemory, writeStrategyMemory,
  saveBusinessMetrics, getWeekBusinessMetrics, getCurrentWeek
};
```

Replace it with:
```js
module.exports = {
  supabase, addLog, savePost, updatePost, getLogs, getPosts, getQueuedPosts,
  saveIntelReport, getIntelReports, getRecentPublishedPosts,
  saveMetrics, getWeekMetrics, readStrategyMemory, writeStrategyMemory,
  saveBusinessMetrics, getWeekBusinessMetrics, getCurrentWeek,
  getLatestStrategy, getBusinessMetricsHistory
};
```

- [ ] **Step 3: Verify the module loads without error**

Run:
```bash
cd C:\Users\Acer\Downloads\pinnboxio-agent
node -e "const db = require('./lib/db'); console.log(typeof db.getLatestStrategy, typeof db.getBusinessMetricsHistory);"
```

Expected output:
```
function function
```

- [ ] **Step 4: Commit**

```bash
git add lib/db.js
git commit -m "feat: add getLatestStrategy and getBusinessMetricsHistory to db"
```

---

## Task 2: Add API routes to server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Update the destructured import from `./lib/db` at line 4**

Current line 4:
```js
const { addLog, savePost, updatePost, getLogs, getPosts, getQueuedPosts, getIntelReports, saveBusinessMetrics } = require('./lib/db');
```

Replace with:
```js
const { addLog, savePost, updatePost, getLogs, getPosts, getQueuedPosts, getIntelReports, saveBusinessMetrics, getLatestStrategy, getBusinessMetricsHistory } = require('./lib/db');
```

- [ ] **Step 2: Add the two new GET routes after the existing `app.get('/api/intel', ...)` route (around line 106)**

After the line:
```js
app.get('/api/intel', asyncRoute(async (req, res) => res.json({ reports: await getIntelReports(20) })));
```

Add:
```js
app.get('/api/strategy', asyncRoute(async (req, res) => res.json({ strategy: await getLatestStrategy() })));
app.get('/api/metrics/history', asyncRoute(async (req, res) => res.json({ metrics: await getBusinessMetricsHistory() })));
```

- [ ] **Step 3: Verify the server starts and both routes respond**

```bash
node server.js
```

Expected in console: `Pinnboxio Agent running on port 3000`

Then in a second terminal:
```bash
curl http://localhost:3000/api/strategy
curl http://localhost:3000/api/metrics/history
```

Expected: both return JSON (either `{"strategy":null}` or `{"strategy":{...}}`, and `{"metrics":[]}` or `{"metrics":[...]}`)

Stop the server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add /api/strategy and /api/metrics/history routes"
```

---

## Task 3: Rewrite public/index.html — complete new Brand OS dashboard

**Files:**
- Rewrite: `public/index.html`

This task replaces the entire existing file (1250 lines of old design) with the new Brand OS SPA. Write the complete file below exactly as specified.

- [ ] **Step 1: Overwrite `public/index.html` with the complete new file**

Write `public/index.html` with this exact content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Pinnboxio Brand OS</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#0f172a;--sidebar:#0b1120;--card:#1e293b;
  --active-bg:#1e3a5f;--active-text:#38bdf8;
  --muted:#64748b;--text:#cbd5e1;--bright:#f8fafc;
  --green:#34d399;--blue:#38bdf8;--amber:#f59e0b;--red:#ef4444;
  --teal:#0d9488;--purple:#7c3aed;
  --fb:#1877f2;--li:#0a66c2;--x:#1d9bf0;
  --border:#1e293b;
}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;height:100vh;overflow:hidden;}
#app{display:flex;height:100vh;}

/* ---- Sidebar ---- */
#sidebar{width:168px;background:var(--sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;padding:16px 0;overflow-y:auto;}
.brand{padding:0 14px 14px;font-size:12px;font-weight:800;color:var(--active-text);letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid var(--border);margin-bottom:10px;}
.brand small{display:block;font-size:9px;color:var(--muted);font-weight:400;letter-spacing:.04em;margin-top:2px;text-transform:none;}
.nav-item{display:flex;align-items:center;gap:8px;padding:9px 12px;margin:0 8px 2px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--muted);transition:all .15s;user-select:none;}
.nav-item:hover{color:var(--text);background:rgba(255,255,255,.04);}
.nav-item.active{background:var(--active-bg);color:var(--active-text);}

/* ---- Main ---- */
#main{flex:1;overflow-y:auto;padding:28px 32px;}
.section{display:none;}
.section.visible{display:block;}

/* ---- Section headers ---- */
.section-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;}
.section-title{font-size:20px;font-weight:700;color:var(--bright);}
.section-sub{font-size:12px;color:var(--muted);margin-top:3px;}

/* ---- Stat strip ---- */
.stat-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
.stat-card{background:var(--card);border-radius:10px;padding:16px;text-align:center;}
.stat-value{font-size:28px;font-weight:700;margin-bottom:4px;line-height:1;}
.stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;}

/* ---- Two-col layout ---- */
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;}

/* ---- Generic card ---- */
.card{background:var(--card);border-radius:10px;padding:18px;margin-bottom:14px;}
.card-title{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;font-weight:600;}

/* ---- Timeline ---- */
.timeline{border-left:2px solid #334155;padding-left:14px;}
.tl-item{position:relative;margin-bottom:12px;}
.tl-dot{position:absolute;left:-20px;top:4px;width:9px;height:9px;border-radius:50%;}
.tl-dot-dashed{border:2px dashed #475569;background:transparent;}
.tl-msg{font-size:12px;color:var(--bright);line-height:1.4;}
.tl-time{font-size:10px;color:var(--muted);margin-top:1px;}

/* ---- Chart ---- */
.chart-wrap{display:flex;flex-direction:column;}
.chart-bars{display:flex;align-items:flex-end;gap:6px;height:80px;margin-bottom:6px;}
.chart-group{flex:1;display:flex;flex-direction:column;align-items:stretch;gap:1px;}
.bar-a{background:var(--fb);border-radius:2px 2px 0 0;min-height:2px;}
.bar-b{background:var(--li);min-height:2px;}
.bar-c{background:var(--x);border-radius:0 0 2px 2px;min-height:2px;}
.chart-lbl{font-size:8px;color:var(--muted);text-align:center;margin-top:4px;}
.chart-legend{display:flex;gap:14px;}
.chart-legend span{font-size:10px;color:var(--muted);}

/* ---- Post grid ---- */
.post-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}
.post-card{background:var(--card);border-radius:10px;overflow:hidden;}
.post-img{width:100%;height:160px;object-fit:cover;display:block;}
.post-body{padding:14px;}
.post-angle{font-size:13px;font-weight:600;color:var(--bright);margin-bottom:6px;line-height:1.4;}
.post-text{font-size:11px;color:var(--muted);line-height:1.55;margin-bottom:8px;}
.post-date{font-size:10px;color:var(--muted);margin-bottom:8px;}

/* ---- Badges ---- */
.badges{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;}
.badge{font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:.04em;}
.b-published{background:rgba(52,211,153,.15);color:var(--green);}
.b-queued{background:rgba(245,158,11,.15);color:var(--amber);}
.b-failed{background:rgba(239,68,68,.15);color:var(--red);}
.b-a{background:rgba(13,148,136,.2);color:var(--teal);}
.b-b{background:rgba(124,58,237,.2);color:var(--purple);}
.b-fb{background:rgba(24,119,242,.2);color:var(--fb);}
.b-li{background:rgba(10,102,194,.2);color:var(--li);}
.b-x{background:rgba(29,155,240,.2);color:var(--x);}
.b-dim{background:rgba(100,116,139,.1);color:var(--muted);}
.b-competitors{background:rgba(239,68,68,.15);color:#fb923c;}
.b-trends{background:rgba(124,58,237,.15);color:#a78bfa;}

/* ---- Hashtags ---- */
.tags{display:flex;flex-wrap:wrap;gap:4px;}
.tag{font-size:9px;color:var(--muted);background:rgba(255,255,255,.05);padding:2px 6px;border-radius:4px;}

/* ---- A/B ---- */
.ab-pair{background:var(--card);border-radius:10px;padding:18px;margin-bottom:14px;}
.ab-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;}
.ab-side{background:rgba(255,255,255,.03);border-radius:8px;padding:12px;}
.ab-side-label{font-size:11px;font-weight:700;margin-bottom:8px;}
.winner-badge{display:inline-block;font-size:10px;font-weight:600;padding:3px 9px;border-radius:6px;background:rgba(52,211,153,.15);color:var(--green);margin-top:8px;}

/* ---- Strategy ---- */
.strategy-content{font-size:14px;color:var(--bright);line-height:1.85;font-style:italic;}
.strategy-meta{font-size:11px;color:var(--muted);margin-top:10px;}
.explainer{background:rgba(56,189,248,.06);border-left:3px solid var(--blue);padding:14px 18px;border-radius:0 8px 8px 0;font-size:12px;line-height:1.7;color:var(--text);margin-top:16px;}

/* ---- Intel ---- */
.intel-card{background:var(--card);border-radius:10px;padding:18px;margin-bottom:14px;}
.intel-summary{font-size:12px;line-height:1.65;color:var(--text);}
.intel-toggle{font-size:11px;color:var(--blue);cursor:pointer;margin-top:8px;display:inline-block;border:none;background:none;padding:0;}
.intel-toggle:hover{text-decoration:underline;}
.intel-raw{font-size:10px;color:var(--muted);margin-top:10px;white-space:pre-wrap;display:none;font-family:'Courier New',monospace;max-height:280px;overflow-y:auto;background:rgba(0,0,0,.2);border-radius:6px;padding:10px;}

/* ---- Metrics table ---- */
.metrics-table{width:100%;border-collapse:collapse;font-size:12px;}
.metrics-table th{text-align:left;padding:8px 14px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border);}
.metrics-table td{padding:11px 14px;border-bottom:1px solid rgba(30,41,59,.7);color:var(--text);}
.metrics-table tr:last-child td{border-bottom:none;}

/* ---- Logs ---- */
.log-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid rgba(30,41,59,.5);font-family:'Courier New',monospace;font-size:11px;}
.log-row:last-child{border-bottom:none;}
.log-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:3px;}
.log-ts{color:var(--muted);flex-shrink:0;min-width:130px;}
.log-msg{color:var(--text);word-break:break-word;}

/* ---- Buttons ---- */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:7px;border:none;cursor:pointer;font-size:12px;font-weight:600;transition:opacity .15s;font-family:inherit;}
.btn:hover:not(:disabled){opacity:.82;}
.btn:disabled{opacity:.5;cursor:not-allowed;}
.btn-primary{background:var(--active-text);color:#0f172a;}
.btn-ghost{background:rgba(255,255,255,.07);color:var(--text);}
.btn-sm{padding:5px 11px;font-size:11px;}
.btn-danger{background:rgba(239,68,68,.15);color:var(--red);}
.job-grid{display:flex;flex-wrap:wrap;gap:8px;}

/* ---- Misc ---- */
.empty{text-align:center;padding:40px 20px;color:var(--muted);font-size:13px;line-height:1.6;}
.error-banner{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:12px 16px;color:var(--red);font-size:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;}
.divider{border:none;border-top:1px solid var(--border);margin:20px 0;}
.hint{font-size:11px;color:var(--muted);font-family:'Courier New',monospace;background:rgba(0,0,0,.2);padding:8px 12px;border-radius:6px;margin-top:8px;}
</style>
</head>
<body>
<div id="app">

  <nav id="sidebar">
    <div class="brand">Pinnboxio<small>Brand OS</small></div>
    <div class="nav-item active" data-s="overview" onclick="show('overview')">📊 Overview</div>
    <div class="nav-item" data-s="posts" onclick="show('posts')">📅 Posts</div>
    <div class="nav-item" data-s="abtests" onclick="show('abtests')">🧪 A/B Tests</div>
    <div class="nav-item" data-s="strategy" onclick="show('strategy')">🧠 Strategy</div>
    <div class="nav-item" data-s="intel" onclick="show('intel')">🔍 Intel</div>
    <div class="nav-item" data-s="metrics" onclick="show('metrics')">📈 Metrics</div>
    <div class="nav-item" data-s="email" onclick="show('email')">📧 Email</div>
    <div class="nav-item" data-s="logs" onclick="show('logs')">📋 Logs</div>
  </nav>

  <main id="main">
    <div id="s-overview" class="section"></div>
    <div id="s-posts" class="section"></div>
    <div id="s-abtests" class="section"></div>
    <div id="s-strategy" class="section"></div>
    <div id="s-intel" class="section"></div>
    <div id="s-metrics" class="section"></div>
    <div id="s-email" class="section"></div>
    <div id="s-logs" class="section"></div>
  </main>

</div>
<script>
// ============================================================
// Utilities
// ============================================================
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function relTime(d){
  if(!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms/60000);
  if(m < 1) return 'just now';
  if(m < 60) return m+'m ago';
  const h = Math.floor(m/60);
  if(h < 24) return h+'h ago';
  const days = Math.floor(h/24);
  if(days < 7) return days+'d ago';
  return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}

function fmtDate(d){
  if(!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})
    +' · '+dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+' UTC';
}

function dotColor(type){ return {success:'#34d399',info:'#38bdf8',warn:'#f59e0b',error:'#ef4444'}[type]||'#64748b'; }

function errBanner(msg, retryFn){
  const d = document.createElement('div');
  d.className = 'error-banner';
  d.innerHTML = `<span>${esc(msg)}</span>`;
  const b = document.createElement('button');
  b.className = 'btn btn-ghost btn-sm';
  b.textContent = 'Retry';
  b.onclick = retryFn;
  d.appendChild(b);
  return d;
}

async function triggerJob(job, btn){
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Running…';
  try{
    const r = await fetch('/api/cron/trigger/'+job,{method:'POST'});
    const d = await r.json();
    btn.textContent = d.success ? 'Done ✓' : 'Error ✗';
    btn.style.color = d.success ? '#34d399' : '#ef4444';
  }catch(e){
    btn.textContent = 'Error ✗'; btn.style.color = '#ef4444';
  }
  setTimeout(()=>{ btn.textContent = orig; btn.disabled = false; btn.style.color=''; }, 3000);
}

function platformBadges(p){
  const bs = [];
  if(p.fb_post_id) bs.push('<span class="badge b-fb">FB</span>');
  else bs.push('<span class="badge b-dim">FB</span>');
  if(p.li_post_id) bs.push('<span class="badge b-li">LI</span>');
  else bs.push('<span class="badge b-dim">LI</span>');
  if(p.x_post_id) bs.push('<span class="badge b-x">X</span>');
  else bs.push('<span class="badge b-dim">X</span>');
  return bs.join('');
}

function platformCount(p){ return [p.fb_post_id, p.li_post_id, p.x_post_id].filter(Boolean).length; }

// ============================================================
// Navigation
// ============================================================
const LOADERS = {};
let _overviewTimer, _logsTimer;

function show(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('visible'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('s-'+name).classList.add('visible');
  document.querySelector('[data-s="'+name+'"]').classList.add('active');
  if(LOADERS[name]) LOADERS[name]();
}

document.addEventListener('DOMContentLoaded', ()=>{
  show('overview');
  _overviewTimer = setInterval(()=>{ if(LOADERS.overview) LOADERS.overview(); }, 60000);
});

// ============================================================
// Overview
// ============================================================
LOADERS.overview = async function loadOverview(){
  const el = document.getElementById('s-overview');
  try{
    const [pRes, lRes, iRes, mRes, sRes] = await Promise.all([
      fetch('/api/posts').then(r=>r.json()),
      fetch('/api/logs').then(r=>r.json()),
      fetch('/api/intel').then(r=>r.json()),
      fetch('/api/metrics/history').then(r=>r.json()),
      fetch('/api/strategy').then(r=>r.json()),
    ]);
    const posts    = pRes.posts    || [];
    const logs     = lRes.logs     || [];
    const intel    = iRes.reports  || [];
    const metrics  = mRes.metrics  || [];
    const strategy = sRes.strategy || null;

    const published = posts.filter(p=>p.status==='published').length;
    const intelCount = intel.length;

    // A/B result this week
    const wkMs = 7*24*60*60*1000;
    const recent = posts.filter(p=>p.status==='published' && Date.now()-new Date(p.created_at)<wkMs);
    const aCount = recent.filter(p=>p.ab_variant==='A').length;
    const bCount = recent.filter(p=>p.ab_variant==='B').length;
    const abResult = !recent.length ? '—' : aCount > bCount ? 'A leads' : bCount > aCount ? 'B leads' : 'Tied';

    // Signup growth: compare two most recent metric rows
    let growth = '—';
    if(metrics.length >= 2){
      const cur = metrics[0].signups || 0;
      const prev = metrics[1].signups || 0;
      if(prev > 0) growth = (((cur-prev)/prev)*100).toFixed(0)+'%';
    }

    el.innerHTML = `
      <div class="section-header">
        <div><div class="section-title">Brand OS Overview</div>
        <div class="section-sub">Live view of autonomous agent activity · auto-refreshes every 60s</div></div>
      </div>
      <div class="stat-strip">
        <div class="stat-card"><div class="stat-value" style="color:#38bdf8">${published}</div><div class="stat-label">Posts Published</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#34d399">${esc(growth)}</div><div class="stat-label">Signup Growth</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#f59e0b">${esc(abResult)}</div><div class="stat-label">A/B This Week</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#a78bfa">${intelCount}</div><div class="stat-label">Intel Reports</div></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">Agent Activity Timeline</div>
          ${renderTimeline(logs)}
          <hr class="divider"/>
          <div class="card-title" style="margin-top:4px">Scheduled Jobs (UTC)</div>
          ${renderSchedule()}
        </div>
        <div class="card">
          <div class="card-title">Business Metrics — Weekly</div>
          ${renderChart(metrics)}
        </div>
      </div>
      <div class="card">
        <div class="card-title">🧠 Current Strategy Memory</div>
        ${strategy
          ? `<div class="strategy-content">${esc(strategy.content)}</div>
             <div class="strategy-meta">Updated ${relTime(strategy.updated_at)} · by weekly review agent</div>`
          : `<div class="empty">Strategy memory not yet written — weekly review runs every Sunday at 8am UTC</div>`}
      </div>`;
  }catch(e){
    el.innerHTML='';
    el.appendChild(errBanner('Failed to load overview — '+e.message, LOADERS.overview));
  }
};

function renderTimeline(logs){
  if(!logs.length) return '<div class="empty" style="padding:12px 0">No activity yet</div>';
  return '<div class="timeline">'+logs.slice(0,12).map(l=>`
    <div class="tl-item">
      <div class="tl-dot" style="background:${dotColor(l.type)}"></div>
      <div class="tl-msg">${esc(l.message)}</div>
      <div class="tl-time">${relTime(l.created_at)}</div>
    </div>`).join('')+'</div>';
}

function renderSchedule(){
  const items=[
    ['Mon/Wed/Fri 9am','Autonomous post + A/B'],
    ['Daily 6pm','Metrics collection'],
    ['Tue 10am','Competitor scan'],
    ['Thu 10am','Trend radar'],
    ['Fri 6pm','Brand scorecard'],
    ['Sun 8am','Weekly review → rewrites strategy'],
    ['Sun 9am','Email campaign'],
    ['Sun 10am','Autonomous planner → queues posts'],
  ];
  return '<div class="timeline">'+items.map(([t,l])=>`
    <div class="tl-item">
      <div class="tl-dot tl-dot-dashed"></div>
      <div class="tl-msg" style="color:#94a3b8">${esc(l)}</div>
      <div class="tl-time">${esc(t)} UTC</div>
    </div>`).join('')+'</div>';
}

function renderChart(metrics){
  if(!metrics.length) return '<div class="empty">No metrics data yet — metrics collect daily at 6pm UTC<br><small>Send data via POST /api/metrics/business</small></div>';
  // Group by week number
  const wks={};
  metrics.forEach(m=>{
    const d = new Date(m.recorded_at||m.created_at);
    const iso = d.getFullYear()+'-W'+String(getISOWeek(d)).padStart(2,'0');
    if(!wks[iso]) wks[iso]={s:0,t:0,c:0};
    wks[iso].s += m.signups||0;
    wks[iso].t += m.trials||0;
    wks[iso].c += m.conversions||0;
  });
  const keys = Object.keys(wks).sort().slice(-8);
  const maxV = Math.max(...keys.map(k=>wks[k].s+wks[k].t+wks[k].c),1);
  const bars = keys.map(k=>{
    const w=wks[k], total=w.s+w.t+w.c;
    const hS=Math.max((w.s/maxV)*72,2), hT=Math.max((w.t/maxV)*72,2), hC=Math.max((w.c/maxV)*72,2);
    const lbl='W'+k.split('-W')[1];
    return `<div class="chart-group">
      <div class="bar-a" style="height:${hS}px"></div>
      <div class="bar-b" style="height:${hT}px"></div>
      <div class="bar-c" style="height:${hC}px"></div>
      <div class="chart-lbl">${lbl}</div>
    </div>`;
  }).join('');
  return `<div class="chart-wrap">
    <div class="chart-bars">${bars}</div>
    <div class="chart-legend">
      <span style="color:#1877f2">■ Signups</span>
      <span style="color:#0a66c2">■ Trials</span>
      <span style="color:#1d9bf0">■ Conversions</span>
    </div>
  </div>`;
}

function getISOWeek(d){
  const jan4 = new Date(d.getFullYear(),0,4);
  const s = new Date(jan4); s.setDate(jan4.getDate()-((jan4.getDay()+6)%7));
  return Math.floor((d-s)/(7*86400000))+1;
}

// ============================================================
// Posts
// ============================================================
LOADERS.posts = async function loadPosts(){
  const el = document.getElementById('s-posts');
  try{
    const {posts=[]} = await fetch('/api/posts').then(r=>r.json());
    if(!posts.length){
      el.innerHTML='<div class="section-header"><div class="section-title">Posts</div></div><div class="empty">No posts yet — the agent posts Mon/Wed/Fri at 9am UTC</div>';
      return;
    }
    const cards = posts.map(p=>{
      const img = p.image_url ? `<img class="post-img" src="${esc(p.image_url)}" onerror="this.style.display='none'" alt=""/>` : '';
      const statusCls = {published:'b-published',queued:'b-queued',failed:'b-failed'}[p.status]||'b-dim';
      const abBadge = p.ab_variant ? `<span class="badge ${p.ab_variant==='A'?'b-a':'b-b'}">Variant ${esc(p.ab_variant)}</span>` : '';
      const tags = (p.hashtags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('');
      const preview = p.text_fb ? esc(p.text_fb.slice(0,200))+(p.text_fb.length>200?'…':'') : '';
      return `<div class="post-card">
        ${img}
        <div class="post-body">
          <div class="badges">
            <span class="badge ${statusCls}">${esc(p.status)}</span>
            ${abBadge}
            ${platformBadges(p)}
          </div>
          <div class="post-angle">${esc(p.angle||p.topic||'')}</div>
          <div class="post-text">${preview}</div>
          <div class="post-date">${fmtDate(p.scheduled_at||p.created_at)}</div>
          ${tags ? `<div class="tags">${tags}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    el.innerHTML=`
      <div class="section-header">
        <div><div class="section-title">Posts</div><div class="section-sub">${posts.length} posts — newest first</div></div>
      </div>
      <div class="post-grid">${cards}</div>`;
  }catch(e){
    el.innerHTML='';
    el.appendChild(errBanner('Failed to load posts — '+e.message, LOADERS.posts));
  }
};

// ============================================================
// A/B Tests
// ============================================================
LOADERS.abtests = async function loadABTests(){
  const el = document.getElementById('s-abtests');
  try{
    const {posts=[]} = await fetch('/api/posts').then(r=>r.json());
    // Build pairs: A posts are anchors, B posts reference A's id via ab_pair_id
    const aMap={}, bMap={}, solo=[];
    posts.forEach(p=>{
      if(p.ab_variant==='A') aMap[p.id]=p;
      else if(p.ab_variant==='B' && p.ab_pair_id) bMap[p.ab_pair_id]=p;
      else if(!p.ab_variant) solo.push(p);
    });
    const pairs = Object.values(aMap).map(a=>({a, b:bMap[a.id]||null}));

    if(!pairs.length && !solo.length){
      el.innerHTML=`<div class="section-header"><div class="section-title">A/B Tests</div></div>
        <div class="empty">No A/B pairs yet — pairs are created on each autonomous post cycle</div>`;
      return;
    }

    const pairCards = pairs.map(({a,b})=>{
      const aPlatforms = platformCount(a);
      const bPlatforms = b ? platformCount(b) : 0;
      const winner = aPlatforms >= bPlatforms ? 'A' : 'B';
      return `<div class="ab-pair">
        <div class="badges">
          <span class="badge b-dim">${fmtDate(a.scheduled_at||a.created_at)}</span>
        </div>
        <div class="post-angle" style="margin:8px 0 0">${esc(a.angle||a.topic||'')}</div>
        <div class="ab-grid">
          <div class="ab-side">
            <div class="ab-side-label" style="color:#0d9488">Variant A</div>
            <div class="badges">${platformBadges(a)}</div>
            <div style="font-size:11px;color:#64748b">${aPlatforms} platform${aPlatforms!==1?'s':''} published</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:6px">${esc((a.text_fb||'').slice(0,120))}${(a.text_fb||'').length>120?'…':''}</div>
            ${winner==='A' ? '<div class="winner-badge">✓ More platforms</div>' : ''}
          </div>
          <div class="ab-side">
            <div class="ab-side-label" style="color:#7c3aed">Variant B</div>
            ${b ? `<div class="badges">${platformBadges(b)}</div>
            <div style="font-size:11px;color:#64748b">${bPlatforms} platform${bPlatforms!==1?'s':''} published (FB only)</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:6px">${esc((b.text_fb||'').slice(0,120))}${(b.text_fb||'').length>120?'…':''}</div>
            ${winner==='B' ? '<div class="winner-badge">✓ More platforms</div>' : ''}`
            : '<div style="font-size:11px;color:#64748b">B variant not found</div>'}
          </div>
        </div>
      </div>`;
    }).join('');

    const soloList = solo.length ? `
      <h3 style="font-size:13px;color:#64748b;margin:20px 0 12px">Solo Posts (no A/B pair)</h3>
      ${solo.map(p=>`<div class="card">
        <div class="badges">${platformBadges(p)}<span class="badge b-${p.status==='published'?'published':p.status==='queued'?'queued':'failed'}">${esc(p.status)}</span></div>
        <div class="post-angle">${esc(p.angle||p.topic||'')}</div>
        <div class="post-date" style="margin-top:6px">${fmtDate(p.scheduled_at||p.created_at)}</div>
      </div>`).join('')}` : '';

    el.innerHTML=`
      <div class="section-header">
        <div><div class="section-title">A/B Tests</div>
        <div class="section-sub">${pairs.length} pair${pairs.length!==1?'s':''} — Variant A publishes to all platforms, B to Facebook only</div></div>
      </div>
      ${pairCards}${soloList}`;
  }catch(e){
    el.innerHTML='';
    el.appendChild(errBanner('Failed to load A/B tests — '+e.message, LOADERS.abtests));
  }
};

// ============================================================
// Strategy
// ============================================================
LOADERS.strategy = async function loadStrategy(){
  const el = document.getElementById('s-strategy');
  try{
    const {strategy=null} = await fetch('/api/strategy').then(r=>r.json());
    const triggerBtn = `<button class="btn btn-ghost" style="margin-top:16px" onclick="triggerJob('review',this)">▶ Run Weekly Review Now</button>`;
    el.innerHTML=`
      <div class="section-header">
        <div><div class="section-title">Strategy Memory</div>
        <div class="section-sub">The agent's evolving beliefs about what works for Pinnboxio</div></div>
      </div>
      ${strategy ? `
        <div class="card">
          <div class="card-title">Current Strategy · Updated ${relTime(strategy.updated_at)}</div>
          <div class="strategy-content">${esc(strategy.content)}</div>
          <div class="strategy-meta">Last rewritten by weekly review agent on ${fmtDate(strategy.updated_at)}</div>
        </div>
        <div class="explainer">
          Every Sunday at 8am UTC, the review agent reads last week's post performance and rewrites this memory.
          The autonomous planner and content generator both read this before creating new posts — so what the agent
          learns from engagement directly shapes the next week's content strategy.
        </div>
        <div style="margin-top:16px">${triggerBtn}</div>`
      : `<div class="card">
          <div class="empty">Weekly review hasn't run yet — it runs every Sunday at 8am UTC.<br>You can trigger it manually below.</div>
          ${triggerBtn}
        </div>`}`;
  }catch(e){
    el.innerHTML='';
    el.appendChild(errBanner('Failed to load strategy — '+e.message, LOADERS.strategy));
  }
};

// ============================================================
// Intel
// ============================================================
LOADERS.intel = async function loadIntel(){
  const el = document.getElementById('s-intel');
  try{
    const {reports=[]} = await fetch('/api/intel').then(r=>r.json());
    const triggerBtns = `<div style="display:flex;gap:10px;margin-bottom:20px">
      <button class="btn btn-ghost btn-sm" onclick="triggerJob('competitors',this)">▶ Run Competitor Scan</button>
      <button class="btn btn-ghost btn-sm" onclick="triggerJob('trends',this)">▶ Run Trend Radar</button>
    </div>`;
    if(!reports.length){
      el.innerHTML=`<div class="section-header"><div class="section-title">Intel</div><div class="section-sub">Competitor monitoring + trend radar</div></div>
        ${triggerBtns}
        <div class="empty">No intel reports yet — competitor scan runs Tuesdays 10am UTC, trend radar runs Thursdays 10am UTC</div>`;
      return;
    }
    const cards = reports.map((r,i)=>{
      const typeCls = r.type==='competitors' ? 'b-competitors' : 'b-trends';
      const summary = r.summary || '';
      const truncated = summary.length > 400;
      const displaySummary = truncated ? summary.slice(0,400)+'…' : summary;
      const raw = r.raw_data ? (typeof r.raw_data==='string' ? r.raw_data : JSON.stringify(r.raw_data,null,2)) : '';
      return `<div class="intel-card">
        <div class="badges" style="margin-bottom:10px">
          <span class="badge ${typeCls}">${esc(r.type||'report')}</span>
          <span class="badge b-dim">${fmtDate(r.created_at)}</span>
        </div>
        <div class="intel-summary" id="is-${i}">${esc(displaySummary)}</div>
        ${truncated ? `<button class="intel-toggle" onclick="expandSummary(this,'${i}',${JSON.stringify(summary)})">Show full summary ▾</button>` : ''}
        ${raw ? `<button class="intel-toggle" onclick="toggleRaw(this,'ir-${i}')">Show full report ▾</button>
                 <div class="intel-raw" id="ir-${i}">${esc(raw)}</div>` : ''}
      </div>`;
    }).join('');
    el.innerHTML=`
      <div class="section-header">
        <div><div class="section-title">Intel</div>
        <div class="section-sub">${reports.length} report${reports.length!==1?'s':''} — competitor scans + trend radar</div></div>
      </div>
      ${triggerBtns}${cards}`;
  }catch(e){
    el.innerHTML='';
    el.appendChild(errBanner('Failed to load intel — '+e.message, LOADERS.intel));
  }
};

function expandSummary(btn, id, fullText){
  document.getElementById('is-'+id).textContent = fullText;
  btn.remove();
}
function toggleRaw(btn, id){
  const el = document.getElementById(id);
  const open = el.style.display==='block';
  el.style.display = open ? 'none' : 'block';
  btn.textContent = open ? 'Show full report ▾' : 'Hide full report ▴';
}

// ============================================================
// Metrics
// ============================================================
LOADERS.metrics = async function loadMetrics(){
  const el = document.getElementById('s-metrics');
  try{
    const {metrics=[]} = await fetch('/api/metrics/history').then(r=>r.json());
    if(!metrics.length){
      el.innerHTML=`<div class="section-header"><div class="section-title">Metrics</div></div>
        <div class="empty">No business metrics yet.<br>
        Send data via POST /api/metrics/business with JSON body: {"signups":0,"trials":0,"conversions":0,"notes":""}
        </div>
        <div class="hint">POST https://pinnboxio-agent.onrender.com/api/metrics/business</div>`;
      return;
    }
    const totals = metrics.reduce((a,m)=>({s:a.s+(m.signups||0),t:a.t+(m.trials||0),c:a.c+(m.conversions||0)}),{s:0,t:0,c:0});
    const rows = metrics.map(m=>`<tr>
      <td>${fmtDate(m.recorded_at||m.created_at)}</td>
      <td>${m.signups||0}</td><td>${m.trials||0}</td><td>${m.conversions||0}</td>
      <td>${esc(m.source||'')}</td><td>${esc(m.notes||'')}</td>
    </tr>`).join('');
    el.innerHTML=`
      <div class="section-header">
        <div><div class="section-title">Metrics</div>
        <div class="section-sub">Business metrics — ${metrics.length} records</div></div>
      </div>
      <div class="stat-strip" style="grid-template-columns:repeat(3,1fr);max-width:500px;margin-bottom:24px">
        <div class="stat-card"><div class="stat-value" style="color:#38bdf8">${totals.s}</div><div class="stat-label">Total Signups</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#34d399">${totals.t}</div><div class="stat-label">Total Trials</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#f59e0b">${totals.c}</div><div class="stat-label">Total Conversions</div></div>
      </div>
      <div class="card" style="overflow-x:auto">
        <table class="metrics-table">
          <thead><tr><th>Date</th><th>Signups</th><th>Trials</th><th>Conversions</th><th>Source</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="hint" style="margin-top:12px">Webhook: POST https://pinnboxio-agent.onrender.com/api/metrics/business</div>`;
  }catch(e){
    el.innerHTML='';
    el.appendChild(errBanner('Failed to load metrics — '+e.message, LOADERS.metrics));
  }
};

// ============================================================
// Email
// ============================================================
LOADERS.email = async function loadEmail(){
  const el = document.getElementById('s-email');
  try{
    const {logs=[]} = await fetch('/api/logs').then(r=>r.json());
    const emailLogs = logs.filter(l=>l.message&&(l.message.toLowerCase().includes('email')||l.message.toLowerCase().includes('campaign')));
    const triggerBtn = `<button class="btn btn-ghost" onclick="triggerJob('email',this)">▶ Run Email Campaign Now</button>`;
    const note = `<div style="font-size:12px;color:#64748b;margin-top:10px">Email campaign runs every Sunday at 9am UTC · uses your subscriber list + weekly performance summary</div>`;
    if(!emailLogs.length){
      el.innerHTML=`<div class="section-header"><div class="section-title">Email</div></div>
        <div style="margin-bottom:20px">${triggerBtn}${note}</div>
        <div class="empty">No email activity yet</div>`;
      return;
    }
    const rows = emailLogs.map(l=>`
      <div class="log-row">
        <div class="log-dot" style="background:${dotColor(l.type)}"></div>
        <div class="log-ts">${fmtDate(l.created_at)}</div>
        <div class="log-msg">${esc(l.message)}</div>
      </div>`).join('');
    el.innerHTML=`
      <div class="section-header">
        <div><div class="section-title">Email</div>
        <div class="section-sub">${emailLogs.length} email events</div></div>
      </div>
      <div style="margin-bottom:20px">${triggerBtn}${note}</div>
      <div class="card">${rows}</div>`;
  }catch(e){
    el.innerHTML='';
    el.appendChild(errBanner('Failed to load email — '+e.message, LOADERS.email));
  }
};

// ============================================================
// Logs
// ============================================================
LOADERS.logs = async function loadLogs(){
  const el = document.getElementById('s-logs');
  try{
    const {logs=[]} = await fetch('/api/logs').then(r=>r.json());
    const rows = logs.map(l=>`
      <div class="log-row">
        <div class="log-dot" style="background:${dotColor(l.type)}"></div>
        <div class="log-ts">${l.time||fmtDate(l.created_at)}</div>
        <div class="log-msg">${esc(l.message)}</div>
      </div>`).join('');
    const jobs = ['post','metrics','scorecard','competitors','trends','review','email','planner'];
    const jobBtns = jobs.map(j=>`<button class="btn btn-ghost btn-sm" onclick="triggerJob('${j}',this)">${j}</button>`).join('');
    el.innerHTML=`
      <div class="section-header">
        <div><div class="section-title">Logs</div>
        <div class="section-sub">Last ${logs.length} events · auto-refreshes every 30s</div></div>
        <button class="btn btn-ghost btn-sm" onclick="LOADERS.logs()">↻ Refresh</button>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">Manual Job Triggers</div>
        <div class="job-grid">${jobBtns}</div>
      </div>
      <div class="card" style="font-family:'Courier New',monospace">${rows||'<div class="empty">No logs yet</div>'}</div>`;

    // Start/reset auto-refresh
    if(_logsTimer) clearInterval(_logsTimer);
    _logsTimer = setInterval(LOADERS.logs, 30000);
  }catch(e){
    el.innerHTML='';
    el.appendChild(errBanner('Failed to load logs — '+e.message, LOADERS.logs));
  }
};
</script>
</body>
</html>
```

- [ ] **Step 2: Verify the file was written**

```bash
node -e "const fs=require('fs'); const h=fs.readFileSync('public/index.html','utf8'); console.log('Lines:', h.split('\n').length, '| Has sidebar:', h.includes('id=\"sidebar\"'), '| Has LOADERS:', h.includes('LOADERS.overview'));"
```

Expected output (numbers may vary slightly):
```
Lines: ~280 | Has sidebar: true | Has LOADERS: true
```

- [ ] **Step 3: Start the server locally and verify all 8 sections load without JS errors**

```bash
node server.js
```

Open `http://localhost:3000` in browser. Check:
- Sidebar shows 8 nav items
- Overview loads (stat strip visible, timeline visible)
- Click each nav item — no blank white screens, no console errors
- Logs section shows "Manual Job Triggers" panel with 8 buttons

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: Brand OS dashboard — sidebar nav, 8 sections, engagement charts, A/B view, strategy memory"
```

---

## Task 4: Deploy to Render

**Files:**
- No file changes — push and deploy

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

Expected: `Branch 'main' set up to track remote branch 'main' from 'origin'.`

- [ ] **Step 2: Trigger Render deploy**

In the Render dashboard at https://dashboard.render.com:
1. Select the `pinnboxio-agent` service
2. Click **Manual Deploy** → **Deploy latest commit**
3. Watch logs — wait for `==> Build successful`

- [ ] **Step 3: Smoke test the live dashboard**

Open `https://pinnboxio-agent.onrender.com` in browser.

Verify:
- New sidebar-nav design loads (not the old header-based design)
- Overview shows stat strip with real post count
- Posts section shows published post cards with images
- Logs section shows agent activity
- All 8 job trigger buttons respond (click "post" — should show "Running…" then "Done ✓" or "Error ✗")

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Overview: stat strip (published count, growth, A/B, intel count), timeline, chart, strategy snippet
- ✅ Posts: 2-col grid, image, badges, angle, text preview, hashtags, date
- ✅ A/B Tests: pair grouping by `ab_pair_id`, side-by-side comparison, winner badge, solo posts list
- ✅ Strategy: full content, updated_at, explainer, manual trigger button
- ✅ Intel: type badge, date, summary truncation + expand, raw_data toggle, manual trigger buttons
- ✅ Metrics: 3 stat cards, table view, webhook hint
- ✅ Email: log filter for email events, trigger button, schedule note
- ✅ Logs: colored dots, timestamps, auto-refresh 30s, 8 job trigger buttons
- ✅ Error handling: `errBanner()` with Retry on every fetch
- ✅ Auto-refresh: Overview 60s, Logs 30s
- ✅ lib/db.js: `getLatestStrategy` + `getBusinessMetricsHistory` added
- ✅ server.js: `/api/strategy` + `/api/metrics/history` routes added

**Type consistency:**
- `LOADERS.overview`, `LOADERS.posts`, etc. — all consistent
- `triggerJob(job, btn)` — called the same way everywhere
- `platformBadges(post)` — uses `fb_post_id`, `li_post_id`, `x_post_id` — matches Supabase schema
- `getBusinessMetricsHistory()` uses `recorded_at` for ordering — consistent with existing `getWeekBusinessMetrics` which also queries `recorded_at`
