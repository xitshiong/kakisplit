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

test('returning-table intent retains its own valid code instead of changing the active table', () => {
  const intent = { mode: 'host-return', code: '1234', ts: 1000 };
  assert.deepEqual(readLoginIntent(storage(JSON.stringify(intent)), 121000), intent);
  assert.equal(readLoginIntent(storage(JSON.stringify({ ...intent, code: 'bad' })), 121000), null);
  assert.equal(readLoginIntent(storage(JSON.stringify({ mode: 'host-return', ts: 1000 })), 121000), null);
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

test('a valid intent survives until just before expiry and is removed at expiry', () => {
  const intent = { mode: 'profile', ts: 1000 };
  const session = storage(JSON.stringify(intent));
  assert.deepEqual(readLoginIntent(session, intent.ts + LOGIN_INTENT_TTL - 1), intent);
  assert.notEqual(session.getItem(LOGIN_INTENT_KEY), undefined);
  assert.equal(readLoginIntent(session, intent.ts + LOGIN_INTENT_TTL), null);
  assert.equal(session.getItem(LOGIN_INTENT_KEY), undefined);
});

test('restricted browser storage does not break login intent handling', () => {
  const restricted = () => { throw new Error('Storage denied'); };
  assert.equal(readLoginIntent({ getItem: restricted }), null);
  assert.equal(readLoginIntent({ getItem: () => 'null', removeItem: restricted }), null);
});

test('requires both implicit tokens and preserves query and fragment data for callbacks', () => {
  assert.equal(authReturnPath(new URL('https://kakisplit.com/#access_token=fixture')), null);
  const url = new URL('https://kakisplit.com/?error=access_denied&lang=en#error_code=denied');
  assert.equal(authReturnPath(url), '/app/?error=access_denied&lang=en#error_code=denied');
  assert.equal(hasAuthError(url), true);
  assert.equal(hasAuthError(new URL('https://kakisplit.com/app/?code=fixture')), false);
});
