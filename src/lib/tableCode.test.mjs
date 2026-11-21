import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_ALPHABET, genCode, normalizeCode, formatCode, isTableCode } from './tableCode.mjs';

test('codes normalize readable codes and preserve legacy links', () => {
  assert.equal(normalizeCode(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(formatCode('abcdefgh'), 'ABCD-EFGH');
  for (const code of ['ABCD-EFGH', 'abcd efgh', '1234']) assert.ok(isTableCode(code));
  for (const code of ['', '000', 'AAAAAAAAA', 'ABCD0FGH', 'ABCD/FGH', null]) assert.ok(!isTableCode(code));
});

test('generation rejects biased bytes and uses only cryptographic random bytes', () => {
  let calls = 0;
  const code = genCode({ getRandomValues(bytes) { calls++; bytes.fill(calls === 1 ? 255 : 0); return bytes; } });
  assert.equal(calls, 2);
  assert.equal(code, CODE_ALPHABET[0].repeat(8));
  assert.match(genCode(), /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
});
