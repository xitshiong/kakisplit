import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('deployment denies framing, referrer leakage and active embedded content', async () => {
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const headers = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)').headers.map(h => [h.key, h.value]));
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
    assert.ok(headers['Content-Security-Policy'].includes(directive));
  }
  for (const source of ['/app(.*)', '/api/(.*)', '/sw.js']) {
    assert.ok(config.headers.find(rule => rule.source === source).headers.some(h => h.key === 'Cache-Control' && h.value === 'no-store'));
  }
});

for (const keys of [[], ['kakisplit-v1', 'kakisplit-v2', 'another-app']]) {
  test(`retired worker removes only owned caches and never caches requests (${keys.length} caches)`, async () => {
    const handlers = {};
    const deleted = [];
    let claimed = false;
    let unregistered = false;
    let pending;
    vm.runInNewContext(await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
      self: {
        addEventListener: (type, handler) => { handlers[type] = handler; },
        skipWaiting() {},
        clients: { claim: async () => { claimed = true; } },
        registration: { unregister: async () => { unregistered = true; } },
      },
      caches: { keys: async () => keys, delete: async key => { deleted.push(key); } },
    });
    assert.equal(handlers.fetch, undefined);
    handlers.activate({ waitUntil: promise => { pending = promise; } });
    await pending;
    assert.deepEqual(deleted, keys.filter(key => key.startsWith('kakisplit-')));
    assert.ok(claimed && unregistered);
  });
}
