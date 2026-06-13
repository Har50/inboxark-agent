jest.mock('node-fetch');
const fetch = require('node-fetch');
const { Response } = jest.requireActual('node-fetch');

process.env.META_PAGE_ID = 'page123';
process.env.META_ACCESS_TOKEN = 'token123';
process.env.LINKEDIN_ACCESS_TOKEN = 'litoken';
process.env.LINKEDIN_PERSON_URN = 'urn:li:person:abc123';

const { postToFacebook, postToLinkedIn } = require('../lib/publish');

test('postToFacebook returns post id on success', async () => {
  fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'fb123' }), { status: 200 }));
  expect(await postToFacebook('Test')).toBe('fb123');
});

test('postToFacebook returns null on API error', async () => {
  fetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Bad' } }), { status: 400 }));
  expect(await postToFacebook('Test')).toBeNull();
});

test('postToLinkedIn sends correct author URN in body', async () => {
  fetch.mockClear();
  fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'li456' }), { status: 201 }));
  const result = await postToLinkedIn('LI text');
  expect(result).toBe('li456');
  expect(JSON.parse(fetch.mock.calls[0][1].body).author).toBe('urn:li:person:abc123');
});
