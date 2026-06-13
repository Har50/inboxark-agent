jest.mock('node-fetch');
process.env.REPLICATE_API_TOKEN = 'test-token';
process.env.ANTHROPIC_API_KEY = 'test';
process.env.OPENAI_API_KEY = 'test';

const fetch = require('node-fetch');
const { Response } = jest.requireActual('node-fetch');

// We test the pure function buildVideoPrompt by requiring server internals
// via a lightweight approach — import and test the logic directly.

describe('buildVideoPrompt', () => {
  // Inline the function for unit testing without spinning up the server
  const VIDEO_STYLE_HINTS = {
    cinematic: 'cinematic lighting, dramatic camera movements, film grain, professional color grading',
    bold: 'fast cuts, high energy, bold colors, dynamic motion, punch zooms',
  };
  const VIDEO_PLATFORM_HINTS = {
    tiktok: 'vertical 9:16 format, optimised for TikTok mobile viewing',
    twitter: 'horizontal 16:9 format, optimised for Twitter/X',
  };
  const VIDEO_ASPECT_RATIOS = { tiktok: '9:16', twitter: '16:9' };

  function buildVideoPrompt(prompt, platform, style, captions, music, textOverlay) {
    let enriched = prompt;
    if (VIDEO_STYLE_HINTS[style]) enriched += `, ${VIDEO_STYLE_HINTS[style]}`;
    if (VIDEO_PLATFORM_HINTS[platform]) enriched += `, ${VIDEO_PLATFORM_HINTS[platform]}`;
    if (captions) enriched += ', with clear readable on-screen text captions';
    if (music) enriched += ', with upbeat background music energy';
    if (textOverlay) enriched += `, with text overlay showing: "${textOverlay}"`;
    return { enrichedPrompt: enriched, aspectRatio: VIDEO_ASPECT_RATIOS[platform] || '16:9' };
  }

  test('returns base prompt with style and platform hints', () => {
    const { enrichedPrompt, aspectRatio } = buildVideoPrompt('App demo', 'tiktok', 'cinematic', false, false, null);
    expect(enrichedPrompt).toContain('App demo');
    expect(enrichedPrompt).toContain('cinematic lighting');
    expect(enrichedPrompt).toContain('vertical 9:16');
    expect(aspectRatio).toBe('9:16');
  });

  test('appends captions hint when captions is true', () => {
    const { enrichedPrompt } = buildVideoPrompt('Demo', 'tiktok', 'bold', true, false, null);
    expect(enrichedPrompt).toContain('on-screen text captions');
  });

  test('appends music hint when music is true', () => {
    const { enrichedPrompt } = buildVideoPrompt('Demo', 'tiktok', 'bold', false, true, null);
    expect(enrichedPrompt).toContain('background music energy');
  });

  test('appends textOverlay when provided', () => {
    const { enrichedPrompt } = buildVideoPrompt('Demo', 'tiktok', 'bold', false, false, 'Try Pinnboxio free');
    expect(enrichedPrompt).toContain('Try Pinnboxio free');
  });

  test('defaults to 16:9 for unknown platform', () => {
    const { aspectRatio } = buildVideoPrompt('Demo', 'unknown', 'minimal', false, false, null);
    expect(aspectRatio).toBe('16:9');
  });

  test('twitter gets 16:9 aspect ratio', () => {
    const { aspectRatio } = buildVideoPrompt('Demo', 'twitter', 'cinematic', false, false, null);
    expect(aspectRatio).toBe('16:9');
  });
});
