const { readStrategyMemory, writeStrategyMemory, getCurrentWeek, getRecentPublishedPosts, getWeekMetrics, getWeekBusinessMetrics, getIntelReports, addLog } = require('./db');
const { callClaude, parseRichPost } = require('./content');

function formatStrategyContext(memory) {
  if (!memory) return '';
  return `CURRENT STRATEGY MEMORY:
- Top angles: ${(memory.top_angles || []).join(', ')}
- Best tone: ${(memory.top_tones || []).join(', ')}
- Avoid: ${(memory.avoid || []).join(', ')}
- Opportunities: ${memory.opportunities || 'none noted'}`.trim();
}

async function getStrategyContext() {
  return formatStrategyContext(await readStrategyMemory(getCurrentWeek()));
}

async function runWeeklyReview() {
  try {
    await addLog('Weekly Review Agent starting...', 'info');
    const [posts, metrics, intel, business] = await Promise.all([
      getRecentPublishedPosts(7), getWeekMetrics(7), getIntelReports(10), getWeekBusinessMetrics(7)
    ]);
    const totalSignups = business.reduce((a, b) => a + (b.signups || 0), 0);
    const postSummary = posts.map(p => {
      const eng = metrics.filter(m => m.post_id === p.id).reduce((a, m) => a + (m.reactions || 0) + (m.clicks || 0), 0);
      return `- [${p.ab_variant}] "${p.angle}" on ${p.platform}: ${eng} engagements`;
    }).join('\n');
    const raw = await callClaude(
      "You are InboxArk's autonomous marketing strategist.",
      `Analyse this week and write next week's strategy.\n\nPOSTS:\n${postSummary || 'none'}\n\nCOMPETITOR INTEL:\n${intel.filter(r=>r.type==='competitor').map(r=>r.findings).join('\n') || 'none'}\n\nTRENDS:\n${intel.filter(r=>r.type==='trends').map(r=>r.findings).join('\n') || 'none'}\n\nSignups: ${totalSignups}\n\nReturn JSON:\n{"top_angles":["a1","a2","a3"],"top_tones":["t1"],"top_audiences":["a1"],"winning_formats":{"facebook":"short hook","linkedin":"story","x":"bold claim"},"brand_voice":"2 sentence voice guide","avoid":["thing1"],"opportunities":"key opportunity","raw_summary":"2 paragraph narrative"}`,
      2000
    );
    if (!raw) { await addLog('Weekly review: no response', 'error'); return; }
    const parsed = parseRichPost(raw);
    if (!parsed) { await addLog('Weekly review: parse failed', 'error'); return; }
    await writeStrategyMemory(getCurrentWeek(), parsed);
    await addLog(`Weekly Review complete — week ${getCurrentWeek()}`, 'success');
  } catch (err) { await addLog(`Weekly Review error: ${err.message}`, 'error'); }
}

async function runAutonomousPlanner() {
  try {
    await addLog('Autonomous Planner starting...', 'info');
    const { savePost } = require('./db');
    const { generateRichPost } = require('./content');
    const strategyContext = await getStrategyContext();
    const now = new Date();
    const nextMon = new Date(now); nextMon.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7)); nextMon.setUTCHours(9, 0, 0, 0);
    for (let i = 0; i < 3; i++) {
      const slot = new Date(nextMon); slot.setDate(nextMon.getDate() + [0, 2, 4][i]);
      const [pA, pB] = await Promise.all([
        generateRichPost({ angle: 'auto', tone: 'Bold & direct', audience: 'busy professionals and founders', platform: 'FB+LI+X', abVariant: 'A', strategyContext }),
        generateRichPost({ angle: 'auto', tone: 'Bold & direct', audience: 'busy professionals and founders', platform: 'FB+LI+X', abVariant: 'B', strategyContext })
      ]);
      if (pA) {
        const saved = await savePost({ ...pA, status: 'queued', scheduled_at: slot.toISOString() });
        if (pB) await savePost({ ...pB, status: 'queued', scheduled_at: slot.toISOString(), ab_pair_id: saved.id, ab_variant: 'B' });
        await addLog(`Queued post for ${['Mon','Wed','Fri'][i]}`, 'success');
      }
    }
    await addLog('Planner complete — 3 posts queued', 'success');
  } catch (err) { await addLog(`Planner error: ${err.message}`, 'error'); }
}

module.exports = { formatStrategyContext, getStrategyContext, runWeeklyReview, runAutonomousPlanner };
