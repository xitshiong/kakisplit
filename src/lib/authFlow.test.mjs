import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authReturnPath, readLoginIntent, LOGIN_INTENT_KEY, LOGIN_INTENT_TTL, hasAuthError } from './authFlow.mjs';

function storage(value) {
  const values = new Map([[LOGIN_INTENT_KEY, value]]);
  return { getItem: key => values.get(key), removeItem: key => values.delete(key) };
}

test('a Google sign-in lasting over one minute still resumes hosting', () => {
  const intent = { mode: 'host', ts: 1000 };
  assert.deepEqual(readLoginIntent(storage(JSON.stringify(intent)), 121000), intent);
});

test('expired, future, corrupt and arbitrary routing intents are ignored', () => {
  for (const value of ['bad', JSON.stringify({ mode: 'https://evil.test', ts: 1000 }),
    JSON.stringify({ mode: 'host', ts: 1000 + LOGIN_INTENT_TTL + 1 })]) {
    assert.equal(readLoginIntent(storage(value), 1000), null);
  }
  assert.equal(readLoginIntent(storage(JSON.stringify({ mode: 'host', ts: 1000 })), 1000 + LOGIN_INTENT_TTL), null);
});

test('site-root implicit callbacks forward to the app without dropping auth fragments', () => {
  const url = new URL('https://kakisplit.com/#access_token=fixture&refresh_token=fixture&type=signup');
  assert.equal(authReturnPath(url), '/app/#access_token=fixture&refresh_token=fixture&type=signup');
  assert.equal(authReturnPath(new URL('https://kakisplit.com/app/#access_token=fixture&refresh_token=fixture')), null);
});

test('callback errors reach the app; ordinary marketing visits stay on marketing', () => {
  const url = new URL('https://kakisplit.com/#error=access_denied&error_code=access_denied');
  assert.equal(authReturnPath(url), '/app/#error=access_denied&error_code=access_denied');
  assert.equal(hasAuthError(url), true);
  assert.equal(authReturnPath(new URL('https://kakisplit.com/#how-it-works')), null);
  assert.equal(authReturnPath(new URL('https://kakisplit.com/?code=referral')), null);
  assert.equal(authReturnPath(new URL('https://kakisplit.com/?code=fixture'), true), '/app/?code=fixture');
});
