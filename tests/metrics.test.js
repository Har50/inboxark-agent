const { parseFBMetrics, parseLIMetrics, computeEngagementRate } = require('../lib/metrics');

test('parseFBMetrics extracts impressions and reactions', () => {
  const raw = { data: [
    { name: 'post_impressions', values: [{ value: 1500 }] },
    { name: 'post_reactions_by_type_total', values: [{ value: { like: 42, love: 8 } }] },
    { name: 'post_clicks', values: [{ value: 23 }] }
  ]};
  const r = parseFBMetrics(raw);
  expect(r.impressions).toBe(1500);
  expect(r.reactions).toBe(50);
  expect(r.clicks).toBe(23);
});

test('parseLIMetrics extracts totals', () => {
  const raw = { elements: [{ totalShareStatistics: { impressionCount: 800, clickCount: 55, likeCount: 30, commentCount: 5, shareCount: 10 } }] };
  const r = parseLIMetrics(raw);
  expect(r.impressions).toBe(800);
  expect(r.reactions).toBe(30);
});

test('computeEngagementRate calculates correctly', () => {
  expect(computeEngagementRate({ reactions: 50, comments: 5, shares: 5, impressions: 1000 })).toBe(6.0);
});
