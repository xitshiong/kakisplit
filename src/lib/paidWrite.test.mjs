import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savePaidWithClient } from './paidWrite.mjs';

test('payments use only the locked server RPC and preserve its return semantics', async () => {
  for (const result of [{ success: true }, { success: true, alreadyPaid: true }, { success: false, full: true }]) {
    const client = { rpc: async (name, args) => {
      assert.equal(name, 'mark_paid');
      assert.deepEqual(args, { p_code: 'ABCDEFGH', p_item_id: '1', p_name: 'Ari', p_split_count: 2 });
      return { data: result };
    } };
    assert.deepEqual(await savePaidWithClient(client, 1, 'Ari', 'abcd-efgh', 2), result);
  }
});

test('invalid input never reaches the backend', async () => {
  const client = { rpc() { assert.fail('Unexpected call'); } };
  for (const [id, name, code, count] of [
    ['__proto__', 'Ari', '1234', 1], ['constructor', 'Ari', '1234', 1],
    ['', 'Ari', '1234', 1], ['tea', '', '1234', 1], ['tea', 'x'.repeat(101), '1234', 1],
    ['tea', 'Ari', '1234)or(code.neq.0', 1], ['tea', 'Ari', '1234', Infinity],
    ['tea', 'Ari', '1234', -1], ['tea', 'Ari', '1234', 101],
  ]) assert.deepEqual(await savePaidWithClient(client, id, name, code, count), { success: false });
});

test('missing, failed and malformed RPC results fail closed', async () => {
  for (const response of [{ data: null }, { error: {} }, { data: {} }]) {
    assert.deepEqual(await savePaidWithClient({ rpc: async () => response }, 'tea', 'Ari', '1234'), { success: false });
  }
  assert.deepEqual(await savePaidWithClient({ rpc: async () => { throw Error('offline'); } }, 'tea', 'Ari', '1234'), { success: false });
});
