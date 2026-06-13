require('dotenv').config();
const fetch = require('node-fetch');
const { addLog, getPosts, saveMetrics, getWeekMetrics, saveIntelReport, getWeekBusinessMetrics, getCurrentWeek } = require('./db');
const { callClaude } = require('./content');

function parseFBMetrics(raw) {
  const m = { impressions: 0, reach: 0, reactions: 0, clicks: 0 };
  for (const item of raw.data || []) {
    const val = item.values?.[0]?.value;
    if (item.name === 'post_impressions') m.impressions = val || 0;
    if (item.name === 'post_impressions_unique') m.reach = val || 0;
    if (item.name === 'post_clicks') m.clicks = val || 0;
    if (item.name === 'post_reactions_by_type_total') m.reactions = Object.values(val || {}).reduce((a, b) => a + b, 0);
  }
  return m;
}

function parseLIMetrics(raw) {
  const s = raw.elements?.[0]?.totalShareStatistics || {};
  return { impressions: s.impressionCount || 0, reach: s.impressionCount || 0, clicks: s.clickCount || 0, reactions: s.likeCount || 0, comments: s.commentCount || 0, shares: s.shareCount || 0 };
}

function computeEngagementRate({ reactions = 0, comments = 0, shares = 0, impressions = 0 }) {
  if (!impressions) return 0;
  return Number(((reactions + comments + shares) / impressions * 100).toFixed(1));
}

async function collectFBMetrics() {
  if (!process.env.META_ACCESS_TOKEN) return;
  try {
    const posts = (await getPosts(50)).filter(p => p.fb_post_id && p.status === 'published');
    for (const post of posts) {
      const res = await fetch(`https://graph.facebook.com/v19.0/${post.fb_post_id}/insights?metric=post_impressions,post_impressions_unique,post_reactions_by_type_total,post_clicks&access_token=${process.env.META_ACCESS_TOKEN}`);
      const data = await res.json();
      if (data.data) { await saveMetrics({ post_id: post.id, platform: 'facebook', ...parseFBMetrics(data) }); }
    }
    await addLog('FB metrics collected', 'success');
  } catch (err) { await addLog(`FB metrics error: ${err.message}`, 'error'); }
}

async function collectLIMetrics() {
  if (!process.env.LINKEDIN_ACCESS_TOKEN) return;
  try {
    const posts = (await getPosts(50)).filter(p => p.li_post_id && p.status === 'published');
    for (const post of posts) {
      const res = await fetch(`https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&shares[0]=${post.li_post_id}`,
        { headers: { 'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` } });
      const data = await res.json();
      if (data.elements?.length) { await saveMetrics({ post_id: post.id, platform: 'linkedin', ...parseLIMetrics(data) }); }
    }
    await addLog('LI metrics collected', 'success');
  } catch (err) { await addLog(`LI metrics error: ${err.message}`, 'error'); }
}

async function runBrandScorecard() {
  try {
    await addLog('Generating brand scorecard...', 'info');
    const metrics = await getWeekMetrics(7);
    const business = await getWeekBusinessMetrics(7);
    const totalReach = metrics.reduce((a, m) => a + (m.reach || m.impressions || 0), 0);
    const totalReactions = metrics.reduce((a, m) => a + (m.reactions || 0), 0);
    const totalSignups = business.reduce((a, b) => a + (b.signups || 0), 0);
    const scorecard = await callClaude(
      'You are a marketing analytics expert for InboxArk.',
      `Analyse this week's performance:\n- Total reach: ${totalReach}\n- Total reactions: ${totalReactions}\n- Signups: ${totalSignups}\n- Posts: ${new Set(metrics.map(m => m.post_id)).size}\n\nWrite a concise scorecard: overall health (🟢/🟡/🔴), narrative, top content, 3 recommendations.`
    );
    if (scorecard) {
      await saveIntelReport({ type: 'scorecard', subject: `Brand Scorecard — Week ${getCurrentWeek()}`, findings: scorecard, opportunities: '', sources: [] });
      await addLog('Brand scorecard generated', 'success');
    }
  } catch (err) { await addLog(`Scorecard error: ${err.message}`, 'error'); }
}

module.exports = { parseFBMetrics, parseLIMetrics, computeEngagementRate, collectFBMetrics, collectLIMetrics, runBrandScorecard };
