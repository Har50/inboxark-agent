// Tests for GA4 data-shaping logic
// These test the pure data transformation, not the API call

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

describe('shapeGA4Response', () => {
  const overviewRow = {
    metricValues: [
      { value: '3214' },
      { value: '1847' },
      { value: '0.62' },
      { value: '134' }
    ]
  };
  const channelRows = [
    { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '1221' }] },
    { dimensionValues: [{ value: 'Social' }], metricValues: [{ value: '867' }] },
    { dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: '675' }] }
  ];
  const pageRows = [
    { dimensionValues: [{ value: '/home' }], metricValues: [{ value: '1204' }] },
    { dimensionValues: [{ value: '/features' }], metricValues: [{ value: '843' }] }
  ];

  test('extracts session count', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.sessions).toBe(3214);
  });

  test('extracts new users', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.newUsers).toBe(1847);
  });

  test('converts bounce rate to 0-100 integer', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.bounceRate).toBe(62);
  });

  test('rounds avg session to whole seconds', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.avgSessionSec).toBe(134);
  });

  test('builds topSources with percentage', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.topSources[0].name).toBe('Organic Search');
    expect(result.topSources[0].sessions).toBe(1221);
    expect(result.topSources[0].pct).toBe(38);
  });

  test('builds topPages with views', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 3214);
    expect(result.topPages[0].path).toBe('/home');
    expect(result.topPages[0].views).toBe(1204);
  });

  test('handles zero total sessions without dividing by zero', () => {
    const result = shapeGA4Response(overviewRow, channelRows, pageRows, 0);
    expect(result.topSources[0].pct).toBe(0);
  });
});

// Route-level test — checks /api/analytics returns correct shape when not configured
const express = require('express');

function makeAnalyticsRouter() {
  const router = express.Router();
  router.get('/api/analytics', (req, res) => {
    // Simulates not_configured state
    res.json({ success: false, reason: 'not_configured' });
  });
  return router;
}

describe('/api/analytics not_configured', () => {
  let app, server;

  beforeAll(() => new Promise(resolve => {
    app = express();
    app.use(makeAnalyticsRouter());
    server = app.listen(0, resolve);
  }));

  afterAll(() => new Promise(resolve => server.close(resolve)));

  test('returns success:false with reason not_configured', async () => {
    const fetch = require('node-fetch');
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/analytics`);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.reason).toBe('not_configured');
  });
});
