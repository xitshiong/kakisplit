import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const configUrl = new URL('../../vercel.json', import.meta.url);

test('CSP supports Tesseract v7 workers, WASM and traineddata without allowing JS eval', async () => {
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  const csp = config.headers.find(rule => rule.source === '/(.*)').headers.find(h => h.key === 'Content-Security-Policy').value;
  const directives = Object.fromEntries(csp.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  for (const directive of ['script-src', 'worker-src', 'connect-src']) {
    assert.ok(directives[directive].includes('https://cdn.jsdelivr.net'), directive);
    assert.ok(!directives[directive].includes('*'), directive);
  }
  assert.ok(directives['script-src'].includes("'wasm-unsafe-eval'"));
  assert.ok(!directives['script-src'].includes("'unsafe-eval'"));
  assert.ok(!directives['script-src'].includes("'unsafe-inline'"));
  assert.ok(directives['worker-src'].includes('blob:'));
  assert.ok(directives['script-src'].includes("'self'"), 'same-origin Vercel analytics script');
  assert.ok(directives['connect-src'].includes("'self'"), 'same-origin analytics events');
  assert.ok(directives['connect-src'].includes('https://*.supabase.co'));
  assert.ok(directives['connect-src'].includes('wss://*.supabase.co'));
  assert.ok(directives['img-src'].includes('https:'), 'Google avatars');
  assert.ok(directives['style-src'].includes("'unsafe-inline'"), 'React styles and static style tags');
  assert.ok(!directives['navigate-to'], 'OAuth top-level redirects must remain unrestricted');
});

test('HTML entrypoints contain no inline scripts requiring a weaker script policy', async () => {
  for (const file of ['index.html', 'app/index.html', 'info.html', 'privacy.html']) {
    const html = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      assert.match(match[1], /\bsrc=["']\//, file);
      assert.equal(match[2].trim(), '', file);
    }
    assert.doesNotMatch(html, /\son\w+\s*=/i, file);
  }
});

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
