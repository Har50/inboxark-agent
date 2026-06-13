require('dotenv').config();
const { addLog, getRecentPublishedPosts, getWeekMetrics, saveIntelReport } = require('./db');
const { generateEmailCampaign } = require('./content');

async function runWeeklyEmailCampaign() {
  try {
    await addLog('Email campaign generator starting...', 'info');
    const posts = await getRecentPublishedPosts(7);
    const metrics = await getWeekMetrics(7);
    const scored = posts.map(p => ({
      angle: p.angle,
      score: metrics.filter(m => m.post_id === p.id).reduce((a, m) => a + (m.reactions || 0) + (m.clicks || 0) * 2, 0)
    })).sort((a, b) => b.score - a.score);
    const topAngle = scored[0]?.angle || 'Never lose another attachment — InboxArk saves everything automatically';
    const email = await generateEmailCampaign({ angle: topAngle, audience: 'busy professionals and founders' });
    if (!email) { await addLog('Email generation failed', 'error'); return; }
    await saveIntelReport({ type: 'email_campaign', subject: email.subject, findings: email.body, opportunities: `Top angle: "${topAngle}"`, sources: [] });
    await addLog(`Email campaign generated: "${email.subject}"`, 'success');
    return email;
  } catch (err) { await addLog(`Email campaign error: ${err.message}`, 'error'); }
}

module.exports = { runWeeklyEmailCampaign };
