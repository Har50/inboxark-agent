jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'mock' } }),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
    })
  })
}));
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-key';

const { addLog, savePost, getLogs, getPosts, getCurrentWeek } = require('../lib/db');

test('addLog returns entry with message and type', async () => {
  const e = await addLog('hello', 'info');
  expect(e.message).toBe('hello');
  expect(e.type).toBe('info');
});
test('savePost returns post object', async () => {
  const p = await savePost({ angle: 'test' });
  expect(p.angle).toBe('test');
});
test('getLogs returns array', async () => expect(Array.isArray(await getLogs())).toBe(true));
test('getPosts returns array', async () => expect(Array.isArray(await getPosts())).toBe(true));
test('getCurrentWeek returns YYYY-WW string', () => expect(getCurrentWeek()).toMatch(/^\d{4}-\d{2}$/));
