require('dotenv').config();
const fetch = require('node-fetch');

async function postToFacebook(text) {
  if (!process.env.META_PAGE_ID || !process.env.META_ACCESS_TOKEN) return null;
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${process.env.META_PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, access_token: process.env.META_ACCESS_TOKEN })
    });
    const data = await res.json();
    if (data.id) return data.id;
    console.error('Facebook error:', JSON.stringify(data.error));
    return null;
  } catch (err) { console.error('Facebook failed:', err.message); return null; }
}

async function postToLinkedIn(text) {
  if (!process.env.LINKEDIN_ACCESS_TOKEN || !process.env.LINKEDIN_PERSON_URN) return null;
  try {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        author: process.env.LINKEDIN_PERSON_URN,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
      })
    });
    const data = await res.json();
    if (data.id) return data.id;
    console.error('LinkedIn error:', JSON.stringify(data));
    return null;
  } catch (err) { console.error('LinkedIn failed:', err.message); return null; }
}

async function postToX(text) {
  if (!process.env.X_API_KEY || !process.env.X_ACCESS_TOKEN) return null;
  try {
    const xText = text.length > 280 ? text.substring(0, 277) + '...' : text;
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.X_ACCESS_TOKEN}` },
      body: JSON.stringify({ text: xText })
    });
    const data = await res.json();
    if (data.data?.id) return data.data.id;
    console.error('X error:', JSON.stringify(data));
    return null;
  } catch (err) { console.error('X failed:', err.message); return null; }
}

async function publishPost(post) {
  const results = {};
  if (post.text_fb) results.fb = await postToFacebook(post.text_fb + '\n\n' + (post.hashtags || []).join(' '));
  if (post.text_li) results.li = await postToLinkedIn(post.text_li);
  if (post.text_x)  results.x  = await postToX(post.text_x);
  return results;
}

module.exports = { postToFacebook, postToLinkedIn, postToX, publishPost };
