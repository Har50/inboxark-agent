jest.mock('node-fetch');
process.env.ANTHROPIC_API_KEY = 'test';
process.env.OPENAI_API_KEY = 'test';
const { parseRichPost } = require('../lib/content');

test('parseRichPost extracts fields from JSON string', () => {
  const raw = JSON.stringify({ text_fb:'fb', text_li:'li', text_x:'x', image_prompt:'p', alt_text:'a', hashtags:['#A'], seo_keywords:['kw'], internal_tags:['t'] });
  const r = parseRichPost(raw);
  expect(r.text_fb).toBe('fb');
  expect(r.hashtags).toEqual(['#A']);
});
test('parseRichPost handles markdown code block wrapper', () => {
  const raw = '```json\n{"text_fb":"f","text_li":"l","text_x":"x","image_prompt":"p","alt_text":"a","hashtags":[],"seo_keywords":[],"internal_tags":[]}\n```';
  expect(parseRichPost(raw).text_fb).toBe('f');
});
test('parseRichPost returns null for invalid JSON', () => {
  expect(parseRichPost('not json')).toBeNull();
});
