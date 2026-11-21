import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOcrHandler } from '../../api/ocr.js';
import { scanReceipt } from './receiptOcr.js';

const image = 'data:image/png;base64,dGVzdA==';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon', OPENROUTER_API_KEY: 'server-only' };
function fixture({ quota = true, user = true, quotaError = false, providerStatus = 200 } = {}) {
  const calls = [];
  const handler = createOcrHandler({ env, makeClient: (url, key, options) => {
    assert.equal(options.global.headers.Authorization, 'Bearer jwt');
    return {
      auth: { getUser: async token => { assert.equal(token, 'jwt'); return { data: { user: user ? { id: 'user' } : null } }; } },
      rpc: async name => { calls.push(name); return { data: quota, error: quotaError ? {} : null }; },
    };
  }, fetchModel: async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json({ choices: [{ message: { content: '{"items":[]}' }, finish_reason: 'stop' }] }, { status: providerStatus });
  } });
  return { calls, async run(body = { image }, headers = { authorization: 'Bearer jwt' }, method = 'POST') {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.code = s; return this; }, json(b) { this.body = b; return this; } };
    await handler({ method, headers, body }, res);
    return res;
  } };
}

test('OCR requires POST and verified authentication before provider access', async () => {
  const f = fixture();
  assert.equal((await f.run({ image }, {}, 'GET')).code, 405);
  assert.equal((await f.run({ image }, {})).code, 401);
  assert.equal((await fixture({ user: false }).run()).code, 401);
  assert.deepEqual(f.calls, []);
});

test('OCR fails closed on quota exhaustion and quota service failure', async () => {
  for (const [options, status] of [[{ quota: false }, 429], [{ quotaError: true }, 503]]) {
    const f = fixture(options);
    assert.equal((await f.run()).code, status);
    assert.deepEqual(f.calls, ['consume_ocr_quota']);
  }
});

test('OCR rejects empty, malformed, huge and caller-controlled provider payloads', async () => {
  const f = fixture();
  for (const body of [null, {}, 'not json', { image: 'https://evil.test/a' }, { image: 'data:image/svg+xml;base64,abcd' },
    { image: 'data:image/png;base64,' }, { image, retry: 'yes' }, { image, model: 'expensive' }, { image, messages: [] }, { image, key: 'attacker' }]) {
    assert.equal((await f.run(body)).code, 400);
  }
  assert.equal((await f.run({ image }, { authorization: 'Bearer jwt', 'content-length': '4500000' })).code, 413);
  assert.equal((await f.run({ image: 'data:image/png;base64,' + 'A'.repeat(4_000_000) })).code, 413);
  assert.deepEqual(f.calls, []);
});

test('a bounded multi-megabyte image does not overflow regular-expression matching', async () => {
  const f = fixture();
  assert.equal((await f.run({ image: 'data:image/png;base64,' + 'A'.repeat(3_000_000) })).code, 200);
});

test('server alone fixes model, prompt, schema, tokens and credential', async () => {
  const f = fixture();
  const res = await f.run({ image, retry: true });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { text: '{"items":[]}', finishReason: 'stop' });
  const request = f.calls[1];
  assert.equal(request.headers.Authorization, 'Bearer server-only');
  assert.equal(request.body.model, 'google/gemini-2.5-flash-lite');
  assert.equal(request.body.max_tokens, 8192);
  assert.equal(request.body.response_format.type, 'json_schema');
  assert.match(request.body.messages[0].content[0].text, /again from scratch/);
  assert.equal(request.body.messages[0].content[1].image_url.url, image);
  assert.equal((await fixture({ providerStatus: 500 }).run()).code, 502);
});

test('browser code has no public OCR credentials or direct provider endpoints', async () => {
  for (const file of ['src/App.jsx', 'src/lib/receiptOcr.js', 'src/household/lib/ocr.js']) {
    const source = await readFile(new URL('../../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /VITE_(?:GEMINI|OPENROUTER)_API_KEY|https:\/\/openrouter.ai|generativelanguage.googleapis.com/);
  }
});

test('client sends only image/retry to same-origin OCR with bearer token', async () => {
  const result = await scanReceipt(image, { accessToken: 'jwt' }, async (url, options) => {
    assert.equal(url, '/api/ocr');
    assert.equal(options.headers.Authorization, 'Bearer jwt');
    assert.deepEqual(JSON.parse(options.body), { image, retry: false });
    return Response.json({ text: JSON.stringify({ items: [{ name: 'Tea', qty: 1, lineTotal: 2 }], adjustments: [], grandTotal: 2, hasUnreadableRows: false }) });
  });
  assert.equal(result.items[0].price, 2);
  await assert.rejects(scanReceipt(image), /Sign in/);
  for (const [status, message] of [[401, /Sign in/], [429, /limit reached/]]) {
    await assert.rejects(scanReceipt(image, { accessToken: 'jwt' }, async () => new Response(null, { status })), message);
  }
});
