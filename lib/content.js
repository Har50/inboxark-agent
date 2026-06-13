require('dotenv').config();
const fetch = require('node-fetch');

const PRODUCT = `InboxArk (inboxark.com) is an email attachment extraction and management tool:
- Connects to Gmail and Outlook via OAuth
- Automatically extracts every attachment — invoices, contracts, PDFs, photos
- Organizes attachments by sender, year, and file type
- Searchable dashboard with bulk download by date or type
- Free tier at 200 MB, paid plans from $6/mo
- Target: freelancers, small business owners, professionals who lose files in email`;

function parseRichPost(raw) {
  try {
    return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch { return null; }
}

async function callClaude(systemPrompt, userPrompt, maxTokens = 2000) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })
    });
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (err) { console.error('Claude error:', err.message); return null; }
}

async function generateImage(prompt) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024' })
    });
    const data = await res.json();
    return data.data?.[0]?.url || null;
  } catch (err) { console.error('DALL-E error:', err.message); return null; }
}

async function generateRichPost({ angle, tone, audience, platform, strategyContext = '', abVariant = 'A' }) {
  const hookNote = abVariant === 'B'
    ? 'Use a DIFFERENT opening hook — start with a question or bold statistic.'
    : 'Use a strong direct statement as the opening hook.';

  const raw = await callClaude(
    `You are the autonomous marketing AI for InboxArk.\nProduct:\n${PRODUCT}\n${strategyContext ? 'Strategy context:\n' + strategyContext : ''}\nReturn ONLY valid JSON, no markdown.`,
    `Write a ${tone} marketing post for InboxArk about: "${angle}".
Platform: ${platform}. Audience: ${audience}. Variant: ${abVariant}. ${hookNote}

Return this exact JSON:
{
  "text_fb": "<Facebook post under 200 words, include hashtags at end>",
  "text_li": "<LinkedIn post, story format, under 250 words>",
  "text_x": "<X post MUST be under 280 characters including hashtags>",
  "image_prompt": "<DALL-E prompt: minimalist dark tech illustration, purple gradient, no text in image>",
  "alt_text": "<accessibility description>",
  "hashtags": ["#Tag1","#Tag2","#Tag3","#Tag4","#Tag5","#Tag6"],
  "seo_keywords": ["keyword 1","keyword 2","keyword 3"],
  "internal_tags": ["${angle.split(' ')[0].toLowerCase()}-angle","${audience.split(' ')[0].toLowerCase()}-audience"]
}`
  );
  if (!raw) return null;
  const parsed = parseRichPost(raw);
  if (!parsed) { console.error('Failed to parse Claude JSON'); return null; }
  const imageUrl = await generateImage(parsed.image_prompt);
  return { angle, tone, audience, platform, ab_variant: abVariant, ...parsed, image_url: imageUrl, status: 'generated' };
}

async function generateBlogPost({ topic, keyword }) {
  return callClaude(
    'You are an SEO content writer for InboxArk (inboxark.com).',
    `Write a complete SEO blog article.\nTopic: "${topic}"\nKeyword: "${keyword}" (use 3-5 times naturally)\nLength: 900-1100 words. Use ## headings. End with CTA to try InboxArk free.\nLast line: META: [150-160 char meta description]`,
    2000
  );
}

async function generateEmailCampaign({ angle, audience }) {
  const raw = await callClaude(
    'You write email marketing for InboxArk.',
    `Write a marketing email about: "${angle}". Audience: ${audience}.\nReturn JSON: {"subject":"<subject>","preview":"<50 char preview>","body":"<HTML body under 300 words>"}`
  );
  return raw ? parseRichPost(raw) : null;
}

async function generateAdsCopy({ angle }) {
  const raw = await callClaude(
    'You write Google Ads copy for InboxArk. Strict character limits.',
    `Write Google Ads copy for: "${angle}".\nReturn JSON: {"headlines":["<30 chars>","<30 chars>","<30 chars>"],"descriptions":["<90 chars>","<90 chars>"]}`
  );
  return raw ? parseRichPost(raw) : null;
}

module.exports = { parseRichPost, callClaude, generateRichPost, generateBlogPost, generateEmailCampaign, generateAdsCopy };
