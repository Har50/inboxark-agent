require('dotenv').config();
const fetch = require('node-fetch');
const { addLog, saveIntelReport } = require('./db');
const { callClaude } = require('./content');

async function serperSearch(query, tbs = 'qdr:w') {
  if (!process.env.SERPER_API_KEY) return [];
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 10, tbs })
    });
    const data = await res.json();
    return (data.organic || []).map(r => `${r.title}: ${r.snippet} (${r.link})`);
  } catch (err) { console.error('Serper error:', err.message); return []; }
}

async function runCompetitorMonitor() {
  try {
    await addLog('Competitor Monitor starting...', 'info');
    const queries = ['attachment extraction tool', 'email attachment organizer', 'save email attachments automatically', 'find email attachments fast'];
    const results = (await Promise.all(queries.map(q => serperSearch(q)))).flat().slice(0, 20);
    if (!results.length) { await addLog('Competitor Monitor: no Serper results', 'warn'); return; }
    const analysis = await callClaude('You are a competitive intelligence analyst for InboxArk.',
      `Analyse competitor signals and find opportunities for InboxArk:\n\n${results.join('\n')}\n\nProvide: 1) Key findings, 2) Opportunities for InboxArk, 3) Threats to watch.`);
    if (analysis) {
      await saveIntelReport({ type: 'competitor', subject: 'Weekly Competitor Scan', findings: analysis, opportunities: '', sources: results.slice(0, 5) });
      await addLog('Competitor Monitor complete', 'success');
    }
  } catch (err) { await addLog(`Competitor Monitor error: ${err.message}`, 'error'); }
}

async function runTrendRadar() {
  try {
    await addLog('Trend Radar starting...', 'info');
    const queries = ['email attachment management 2026', 'save email attachments automatically', 'gmail attachment extractor', 'site:reddit.com email attachment organizer'];
    const results = (await Promise.all(queries.map(q => serperSearch(q)))).flat().slice(0, 20);
    if (!results.length) { await addLog('Trend Radar: no results', 'warn'); return; }
    const analysis = await callClaude('You are a trend analyst for InboxArk.',
      `Identify trending topics for InboxArk from:\n\n${results.join('\n')}\n\nProvide: 1) Top 3 trending angles to post about, 2) Exact hook for each, 3) Best platform.`);
    if (analysis) {
      await saveIntelReport({ type: 'trends', subject: 'Weekly Trend Radar', findings: analysis, opportunities: '', sources: results.slice(0, 5) });
      await addLog('Trend Radar complete', 'success');
    }
  } catch (err) { await addLog(`Trend Radar error: ${err.message}`, 'error'); }
}

module.exports = { runCompetitorMonitor, runTrendRadar };
