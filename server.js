require('dotenv').config();
const {BetaAnalyticsDataClient} = require('@google-analytics/data');
const express = require('express');
const cron = require('node-cron');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const CONFIG = {
  ANTHROPIC_API_KEY:      process.env.ANTHROPIC_API_KEY || '',
  OPENAI_API_KEY:         process.env.OPENAI_API_KEY || '',
  REPLICATE_API_TOKEN:    process.env.REPLICATE_API_TOKEN || '',
  GA4_PROPERTY_ID:    process.env.GA4_PROPERTY_ID || '',
  GA4_CLIENT_EMAIL:   process.env.GA4_CLIENT_EMAIL || '',
  GA4_PRIVATE_KEY:    process.env.GA4_PRIVATE_KEY || '',
  META_PAGE_ID:           process.env.META_PAGE_ID || '',
  META_ACCESS_TOKEN:      process.env.META_ACCESS_TOKEN || '',
  META_AD_ACCOUNT_ID:     process.env.META_AD_ACCOUNT_ID || '',
  IG_USER_ID:             process.env.IG_USER_ID || '',
  LINKEDIN_CLIENT_ID:     process.env.LINKEDIN_INBOXARK_CLIENT_ID || process.env.LINKEDIN_CLIENT_ID || '',
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_INBOXARK_CLIENT_SECRET || process.env.LINKEDIN_CLIENT_SECRET || '',
  LINKEDIN_REDIRECT_URI:  'https://inboxark-agent.onrender.com/auth/linkedin/callback',
  LINKEDIN_ORG_ID:        process.env.LINKEDIN_ORGANIZATION_ID || '',
  LINKEDIN_ACCESS_TOKEN:  process.env.LINKEDIN_ACCESS_TOKEN || '',
  PORT:                   process.env.PORT || 3000
};

const PRODUCT = `InboxArk (inboxark.com): Real-time email attachment extraction tool. Connects to Gmail and Outlook via OAuth, automatically extracts every attachment (invoices, contracts, PDFs, photos), organizes by year and sender, searchable dashboard, bulk download by date or file type. Free tier at 200 MB. Paid plans from $6/mo. Web app.`;

const logs = [];
const posts = [];
const videos = [];
const analyticsCache = { data: null, period: null, generatedAt: 0 };
const ANALYTICS_TTL_MS = 5 * 60 * 1000; // 5 minutes

function addLog(message, type = 'info') {
  const entry = { id: Date.now(), message, type, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) };
  logs.unshift(entry);
  if (logs.length > 200) logs.pop();
  console.log(`[${type.toUpperCase()}] ${message}`);
}

async function callClaude(prompt, system) {
  if (!CONFIG.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CONFIG.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1000, system: system || `You are the marketing AI for InboxArk. Product: ${PRODUCT}. Be specific, punchy, human.`, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (err) { addLog(`Claude error: ${err.message}`, 'error'); return null; }
}

async function generateImage(prompt) {
  if (!CONFIG.OPENAI_API_KEY) return null;
  try {
    addLog('Generating image with DALL-E 3...', 'info');
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'standard' })
    });
    const data = await res.json();
    if (data.data?.[0]?.url) { addLog('Image generated OK', 'success'); return data.data[0].url; }
    addLog(`DALLE error: ${JSON.stringify(data.error)}`, 'error');
    return null;
  } catch (err) { addLog(`Image failed: ${err.message}`, 'error'); return null; }
}

const VIDEO_STYLE_HINTS = {
  cinematic: 'cinematic lighting, dramatic camera movements, film grain, professional color grading',
  bold:      'fast cuts, high energy, bold colors, dynamic motion, punch zooms',
  lifestyle: 'soft natural lighting, warm tones, relaxed pacing, authentic feel',
  corporate: 'clean professional look, neutral tones, structured composition, business context',
  minimal:   'minimalist aesthetic, clean background, simple elegant motion'
};

const VIDEO_PLATFORM_HINTS = {
  tiktok:   'vertical 9:16 format, optimised for TikTok mobile viewing',
  reels:    'vertical 9:16 format, optimised for Instagram Reels',
  shorts:   'vertical 9:16 format, optimised for YouTube Shorts',
  twitter:  'horizontal 16:9 format, optimised for Twitter/X',
  linkedin: 'square 1:1 format, professional business audience'
};

const VIDEO_ASPECT_RATIOS = {
  tiktok: '9:16', reels: '9:16', shorts: '9:16', twitter: '16:9', linkedin: '1:1'
};

function buildVideoPrompt(prompt, platform, style, captions, music, textOverlay) {
  let enriched = prompt;
  const hint = VIDEO_STYLE_HINTS[style];
  const platHint = VIDEO_PLATFORM_HINTS[platform];
  if (hint) enriched += `, ${hint}`;
  if (platHint) enriched += `, ${platHint}`;
  if (captions) enriched += ', with clear readable on-screen text captions';
  if (music) enriched += ', with upbeat background music energy';
  if (textOverlay) enriched += `, with text overlay showing: "${textOverlay}"`;
  return {
    enrichedPrompt: enriched,
    aspectRatio: VIDEO_ASPECT_RATIOS[platform] || '16:9'
  };
}

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

async function generateAnalyticsStrategy(ga4Data) {
  if (!CONFIG.ANTHROPIC_API_KEY || !ga4Data) return null;
  const systemPrompt = `You are a business strategist and growth advisor for InboxArk (inboxark.com).
InboxArk is an email attachment extraction and management tool. It connects to Gmail and Outlook via OAuth, automatically extracts every attachment, and organizes them by year and sender in a searchable dashboard. Available as a web app.

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
          content: `Here is the GA4 analytics data for inboxark.com:\n\n${JSON.stringify(ga4Data, null, 2)}\n\nReturn the four-block strategy JSON now.`
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

async function generateVideo(prompt, aspectRatio, duration) {
  if (!CONFIG.REPLICATE_API_TOKEN) return null;
  try {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'bytedance/seedance-2.0',
        input: { prompt, aspect_ratio: aspectRatio, duration }
      })
    });
    const data = await res.json();
    if (data.id) { addLog(`Video generation started: ${data.id}`, 'info'); return data.id; }
    addLog(`Replicate error: ${JSON.stringify(data.detail || data)}`, 'error');
    return null;
  } catch (err) { addLog(`generateVideo failed: ${err.message}`, 'error'); return null; }
}

async function pollVideoStatus(predictionId) {
  if (!CONFIG.REPLICATE_API_TOKEN) return { status: 'failed', videoUrl: null, error: 'not configured' };
  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${CONFIG.REPLICATE_API_TOKEN}` }
    });
    const data = await res.json();
    const videoUrl = Array.isArray(data.output) ? data.output[0] : (data.output || null);
    return { status: data.status, videoUrl, error: data.error || null };
  } catch (err) { return { status: 'failed', videoUrl: null, error: err.message }; }
}

async function postToFacebook(text) {
  if (!CONFIG.META_PAGE_ID || !CONFIG.META_ACCESS_TOKEN) { addLog('Facebook not configured', 'warn'); return false; }
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${CONFIG.META_PAGE_ID}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, access_token: CONFIG.META_ACCESS_TOKEN })
    });
    const data = await res.json();
    if (data.id) { addLog(`Facebook published: ${data.id}`, 'success'); return true; }
    addLog(`Facebook error: ${JSON.stringify(data.error)}`, 'error'); return false;
  } catch (err) { addLog(`Facebook failed: ${err.message}`, 'error'); return false; }
}

async function postImageToFacebook(imageUrl, caption) {
  if (!CONFIG.META_PAGE_ID || !CONFIG.META_ACCESS_TOKEN) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${CONFIG.META_PAGE_ID}/photos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: imageUrl, caption, access_token: CONFIG.META_ACCESS_TOKEN })
    });
    const data = await res.json();
    if (data.id) { addLog(`Facebook image published: ${data.id}`, 'success'); return true; }
    addLog(`Facebook image error: ${JSON.stringify(data.error)}`, 'error'); return false;
  } catch (err) { addLog(`Facebook image failed: ${err.message}`, 'error'); return false; }
}

async function postToInstagram(text) {
  if (!CONFIG.IG_USER_ID || !CONFIG.META_ACCESS_TOKEN) { addLog('Instagram not configured', 'warn'); return false; }
  try {
    const c = await (await fetch(`https://graph.facebook.com/v19.0/${CONFIG.IG_USER_ID}/media`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: text, media_type: 'REELS', access_token: CONFIG.META_ACCESS_TOKEN })
    })).json();
    if (!c.id) return false;
    const p = await (await fetch(`https://graph.facebook.com/v19.0/${CONFIG.IG_USER_ID}/media_publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: c.id, access_token: CONFIG.META_ACCESS_TOKEN })
    })).json();
    if (p.id) { addLog(`Instagram published: ${p.id}`, 'success'); return true; }
    return false;
  } catch (err) { addLog(`Instagram failed: ${err.message}`, 'error'); return false; }
}

async function postToLinkedIn(text) {
  if (!CONFIG.LINKEDIN_ACCESS_TOKEN || !CONFIG.LINKEDIN_ORG_ID) { addLog('LinkedIn not configured', 'warn'); return false; }
  try {
    const authorUrn = `urn:li:organization:${CONFIG.LINKEDIN_ORG_ID}`;
    addLog(`LinkedIn posting as org: ${authorUrn}`, 'info');
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.LINKEDIN_ACCESS_TOKEN}`,
        'LinkedIn-Version': '202501'
      },
      body: JSON.stringify({
        author: authorUrn,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
      })
    });
    if (res.status === 201) { addLog('LinkedIn published successfully!', 'success'); return true; }
    const data = await res.json();
    addLog(`LinkedIn error: ${JSON.stringify(data)}`, 'error');
    return false;
  } catch (err) { addLog(`LinkedIn failed: ${err.message}`, 'error'); return false; }
}

async function postImageToLinkedIn(imageUrl, caption) {
  if (!CONFIG.LINKEDIN_ACCESS_TOKEN || !CONFIG.LINKEDIN_ORG_ID) return false;
  try {
    const reg = await (await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.LINKEDIN_ACCESS_TOKEN}`, 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({ registerUploadRequest: { recipes: ['urn:li:digitalmediaRecipe:feedshare-image'], owner: `urn:li:organization:${CONFIG.LINKEDIN_ORG_ID}`, serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }] } })
    })).json();
    const uploadUrl = reg.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    const asset = reg.value?.asset;
    if (!uploadUrl || !asset) return false;
    const imgBuf = await (await fetch(imageUrl)).buffer();
    await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: imgBuf });
    const post = await (await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.LINKEDIN_ACCESS_TOKEN}`, 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({ author: `urn:li:organization:${CONFIG.LINKEDIN_ORG_ID}`, lifecycleState: 'PUBLISHED', specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: caption }, shareMediaCategory: 'IMAGE', media: [{ status: 'READY', media: asset, title: { text: 'InboxArk' } }] } }, visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' } })
    })).json();
    if (post.id) { addLog(`LinkedIn image published: ${post.id}`, 'success'); return true; }
    return false;
  } catch (err) { addLog(`LinkedIn image failed: ${err.message}`, 'error'); return false; }
}

// ─── FACEBOOK ADS ───────────────────────────────────────────────────────────

async function createFacebookAd(adsetConfig) {
  if (!CONFIG.META_AD_ACCOUNT_ID || !CONFIG.META_ACCESS_TOKEN) {
    addLog('Facebook Ads not configured', 'warn');
    return false;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${CONFIG.META_AD_ACCOUNT_ID}/adsets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: adsetConfig.name,
        daily_budget: adsetConfig.dailyBudget,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'REACH',
        targeting: adsetConfig.targeting,
        access_token: CONFIG.META_ACCESS_TOKEN
      })
    });
    const data = await res.json();
    if (data.id) { addLog(`Ad created: ${data.id}`, 'success'); return data.id; }
    addLog(`Ad creation error: ${JSON.stringify(data.error)}`, 'error');
    return false;
  } catch (err) { addLog(`Ad creation failed: ${err.message}`, 'error'); return false; }
}

const ANGLES = [
  'Never lose another attachment — InboxArk saves everything automatically',
  'Signed that contract? InboxArk already saved the PDF',
  'Stop digging through emails for that one invoice',
  'Your attachments, organized by sender and year — automatically',
  'Every PDF, every photo, every contract — saved and searchable',
  'Inbox zero for your attachments, not your emails',
  'Find any attachment in seconds, not minutes',
  'Forget drag-and-drop. InboxArk just works.',
  '200 MB free. No setup. No manual work.',
  'Gmail + Outlook attachments in one dashboard'
];
let angleIndex = 0;

async function runAutonomousPost() {
  addLog('Autonomous post cycle started', 'info');
  const angle = ANGLES[angleIndex % ANGLES.length];
  angleIndex++;
  const text = await callClaude(`Write a bold social media post for InboxArk about: "${angle}". Under 200 words. Include 5-8 hashtags. Sound human.`);
  if (!text) return;
  const post = { id: Date.now(), text, angle, status: 'generated', created: new Date().toISOString() };
  posts.unshift(post);
  if (posts.length > 100) posts.pop();

  let imageUrl = null;
  if (CONFIG.OPENAI_API_KEY) {
    const imgPrompt = await callClaude(`Create a DALL-E 3 image prompt for InboxArk about: "${angle}". Modern, professional, tech. Return ONLY the prompt, max 100 words.`);
    if (imgPrompt) imageUrl = await generateImage(imgPrompt);
  }

  let fb, ig, li;
  if (imageUrl) {
    [fb, ig, li] = await Promise.all([postImageToFacebook(imageUrl, text), postToInstagram(text), postImageToLinkedIn(imageUrl, text)]);
  } else {
    [fb, ig, li] = await Promise.all([postToFacebook(text), postToInstagram(text), postToLinkedIn(text)]);
  }
  post.status = (fb || ig || li) ? 'published' : 'generated_only';
  post.published = { facebook: fb, instagram: ig, linkedin: li, image: !!imageUrl };
  addLog(`Cycle complete — FB:${fb} IG:${ig} LI:${li} IMG:${!!imageUrl}`, 'success');
}

// Mon/Wed/Fri 9am UTC
cron.schedule('0 9 * * 1,3,5', () => { addLog('Scheduled post triggered', 'info'); runAutonomousPost(); });

// ─── LINKEDIN OAUTH ───────────────────────────────────────────────────────────
app.get('/auth/linkedin/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) return res.send(`<h2>LinkedIn Error</h2><p>${error}: ${error_description}</p>`);
  if (!code) return res.send('<h2>No code received</h2>');
  try {
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CONFIG.LINKEDIN_REDIRECT_URI, client_id: CONFIG.LINKEDIN_CLIENT_ID, client_secret: CONFIG.LINKEDIN_CLIENT_SECRET })
    });
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      CONFIG.LINKEDIN_ACCESS_TOKEN = tokenData.access_token;
      addLog('LinkedIn access token obtained!', 'success');
      res.send(`<h2 style="font-family:sans-serif;color:green;">LinkedIn Connected!</h2><p style="font-family:sans-serif;">Add this to Render as <strong>LINKEDIN_ACCESS_TOKEN</strong>:</p><textarea style="width:100%;height:80px;font-family:monospace;">${tokenData.access_token}</textarea>`);
    } else {
      res.send(`<h2>Token Error</h2><pre>${JSON.stringify(tokenData, null, 2)}</pre><p>Client ID: ${CONFIG.LINKEDIN_CLIENT_ID} (${CONFIG.LINKEDIN_CLIENT_ID.length} chars)</p><p>Secret: ${CONFIG.LINKEDIN_CLIENT_SECRET ? 'SET' : 'MISSING'}</p>`);
    }
  } catch (err) { res.send(`<h2>Error</h2><p>${err.message}</p>`); }
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/api/logs', (req, res) => res.json({ logs: logs.slice(0, 50) }));
app.get('/api/posts', (req, res) => res.json({ posts: posts.slice(0, 50) }));

app.get('/api/status', (req, res) => res.json({
  claude: !!CONFIG.ANTHROPIC_API_KEY,
  openai: !!CONFIG.OPENAI_API_KEY,
  facebook: !!CONFIG.META_ACCESS_TOKEN,
  instagram: !!CONFIG.IG_USER_ID,
  x: false,
  linkedin: !!CONFIG.LINKEDIN_ACCESS_TOKEN,
  replicate: !!CONFIG.REPLICATE_API_TOKEN,
  ga4: !!(CONFIG.GA4_PROPERTY_ID && CONFIG.GA4_CLIENT_EMAIL && CONFIG.GA4_PRIVATE_KEY),
  nextPost: 'Mon/Wed/Fri at 9:00 AM UTC'
}));

app.post('/api/claude', async (req, res) => {
  const { prompt, system } = req.body;
  if (!CONFIG.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Claude API key not configured' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CONFIG.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1000, system: system || `You are the marketing AI for InboxArk. Product: ${PRODUCT}. Be specific, punchy, human.`, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    addLog(`Content generated: "${prompt.substring(0, 50)}..."`, 'success');
    res.json({ text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/publish', async (req, res) => {
  const { platform, text, angle } = req.body;
  addLog(`Manual publish triggered → ${platform || 'all'}`, 'info');

  // Generate text if not provided
  const postText = text || await callClaude(`Write a bold social media post for InboxArk about: "${angle || 'Never lose another attachment — InboxArk saves everything automatically'}". Under 200 words. Include 5-8 hashtags. Sound human.`);
  if (!postText) return res.json({ success: false, message: 'Content generation failed' });

  let fb = false, ig = false, li = false;

  if (platform === 'facebook' || platform === 'fb') {
    fb = await postToFacebook(postText);
  } else if (platform === 'instagram' || platform === 'ig') {
    ig = await postToInstagram(postText);
  } else if (platform === 'linkedin' || platform === 'li') {
    li = await postToLinkedIn(postText);
  } else if (platform === 'fb+li') {
    [fb, li] = await Promise.all([postToFacebook(postText), postToLinkedIn(postText)]);
  } else {
    // all platforms
    [fb, ig, li] = await Promise.all([postToFacebook(postText), postToInstagram(postText), postToLinkedIn(postText)]);
  }

  addLog(`Published → FB:${fb} IG:${ig} LI:${li}`, 'success');
  res.json({ success: true, facebook: fb, instagram: ig, linkedin: li, text: postText });
});

app.post('/api/create-ad', async (req, res) => {
  const { name, dailyBudget, targeting } = req.body;
  if (!name || !dailyBudget || !targeting) {
    return res.status(400).json({ error: 'name, dailyBudget, and targeting required' });
  }
  const adId = await createFacebookAd({ name, dailyBudget, targeting });
  res.json({ success: !!adId, adId });
});

app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;
  if (!CONFIG.OPENAI_API_KEY) return res.json({ success: false, message: 'OpenAI API key not configured' });
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt: prompt || 'Modern AI email assistant app', n: 1, size: '1024x1024', quality: 'standard' })
    });
    const data = await r.json();
    if (data.data?.[0]?.url) { addLog('Image generated for preview', 'success'); res.json({ success: true, imageUrl: data.data[0].url }); }
    else res.json({ success: false, message: JSON.stringify(data.error || data) });
  } catch (err) { res.json({ success: false, message: err.message }); }
});

app.post('/api/post-with-image', async (req, res) => {
  const { angle, caption } = req.body;
  addLog('Image post triggered', 'info');
  try {
    const imgPrompt = await callClaude(`Create a DALL-E 3 image prompt for InboxArk about: "${angle || 'Email attachment organizer'}". Modern, professional. Return ONLY the prompt, max 100 words.`);
    const imageUrl = await generateImage(imgPrompt || 'Modern AI email productivity app interface, dark theme, professional');
    if (!imageUrl) return res.json({ success: false, message: 'Image generation failed' });
    const postCaption = caption || `${angle} — Try InboxArk free at inboxark.com`;
    const [fb, li] = await Promise.all([postImageToFacebook(imageUrl, postCaption), postImageToLinkedIn(imageUrl, postCaption)]);
    res.json({ success: true, imageUrl, facebook: fb, linkedin: li });
  } catch (err) { res.json({ success: false, message: err.message }); }
});

app.post('/api/generate-video', async (req, res) => {
  const { prompt, platform, style, duration, captions, music, textOverlay } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (!CONFIG.REPLICATE_API_TOKEN) return res.status(500).json({ error: 'REPLICATE_API_TOKEN not configured' });
  const { enrichedPrompt, aspectRatio } = buildVideoPrompt(
    prompt, platform || 'tiktok', style || 'cinematic', captions, music, textOverlay
  );
  const videoDuration = Math.min(Math.max(parseInt(duration) || 7, 1), 10);
  const predictionId = await generateVideo(enrichedPrompt, aspectRatio, videoDuration);
  if (!predictionId) return res.status(500).json({ error: 'Video generation failed to start' });
  const video = {
    id: predictionId, prompt, platform: platform || 'tiktok',
    style: style || 'cinematic', duration: videoDuration,
    status: 'starting', videoUrl: null, created: new Date().toISOString()
  };
  videos.unshift(video);
  if (videos.length > 50) videos.pop();
  addLog(`Video queued for ${platform || 'tiktok'} — "${prompt.substring(0, 40)}…"`, 'info');
  res.json({ success: true, predictionId });
});

app.get('/api/video-status/:id', async (req, res) => {
  const result = await pollVideoStatus(req.params.id);
  const video = videos.find(v => v.id === req.params.id);
  if (video) {
    video.status = result.status;
    if (result.videoUrl) video.videoUrl = result.videoUrl;
  }
  res.json(result);
});

app.get('/api/videos', (req, res) => {
  res.json({ videos: videos.slice(0, 20) });
});

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

app.get('/debug/linkedin', (req, res) => res.json({
  org_id: CONFIG.LINKEDIN_ORG_ID,
  org_id_length: CONFIG.LINKEDIN_ORG_ID.length,
  author_urn: `urn:li:organization:${CONFIG.LINKEDIN_ORG_ID}`,
  has_token: !!CONFIG.LINKEDIN_ACCESS_TOKEN,
  token_length: CONFIG.LINKEDIN_ACCESS_TOKEN.length
}));

app.get('/debug/env', (req, res) => res.json({
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'MISSING',
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN ? 'SET' : 'MISSING',
  LINKEDIN_ACCESS_TOKEN: process.env.LINKEDIN_ACCESS_TOKEN ? 'SET' : 'MISSING',
  LINKEDIN_PINNBOXIO_CLIENT_ID: process.env.LINKEDIN_PINNBOXIO_CLIENT_ID ? `SET (${process.env.LINKEDIN_PINNBOXIO_CLIENT_ID.length} chars)` : 'MISSING',
  LINKEDIN_PINNBOXIO_CLIENT_SECRET: process.env.LINKEDIN_PINNBOXIO_CLIENT_SECRET ? `SET (${process.env.LINKEDIN_PINNBOXIO_CLIENT_SECRET.length} chars)` : 'MISSING',
}));

app.listen(CONFIG.PORT, () => {
  addLog(`InboxArk Agent running on port ${CONFIG.PORT}`, 'success');
  addLog('Schedule: Mon/Wed/Fri at 9:00 AM UTC', 'info');
  addLog(`Claude API: ${CONFIG.ANTHROPIC_API_KEY ? 'Connected' : 'Not configured'}`, CONFIG.ANTHROPIC_API_KEY ? 'success' : 'warn');
  addLog(`Meta API: ${CONFIG.META_ACCESS_TOKEN ? 'Connected' : 'Not configured'}`, CONFIG.META_ACCESS_TOKEN ? 'success' : 'warn');
  addLog(`LinkedIn: ${CONFIG.LINKEDIN_ACCESS_TOKEN ? 'Connected' : 'Not configured'}`, CONFIG.LINKEDIN_ACCESS_TOKEN ? 'success' : 'warn');
  addLog(`OpenAI: ${CONFIG.OPENAI_API_KEY ? 'Connected' : 'Not configured'}`, CONFIG.OPENAI_API_KEY ? 'success' : 'warn');
  addLog(`Replicate: ${CONFIG.REPLICATE_API_TOKEN ? 'Connected' : 'Not configured'}`, CONFIG.REPLICATE_API_TOKEN ? 'success' : 'warn');
  addLog(`GA4: ${CONFIG.GA4_PROPERTY_ID ? 'Connected (' + CONFIG.GA4_PROPERTY_ID + ')' : 'Not configured'}`, CONFIG.GA4_PROPERTY_ID ? 'success' : 'warn');
});



