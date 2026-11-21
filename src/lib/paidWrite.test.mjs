import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savePaidWithClient } from './paidWrite.mjs';

function mockClient(initial, { concurrent = false, readError = false, updateError = false, conflict = false } = {}) {
  let paid = structuredClone(initial);
  let reads = 0;
  let writes = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const predicates = [];
  return {
    get paid() { return paid; },
    get reads() { return reads; },
    get writes() { return writes; },
    predicates,
    from(table) {
      assert.equal(table, 'sessions');
      return {
        select(column) {
          assert.equal(column, 'paid');
          return { eq(key, code) {
            assert.equal(key, 'code');
            assert.equal(code, '1234');
            return { async single() {
              const snapshot = structuredClone(paid);
              const read = ++reads;
              if (concurrent && read <= 2) {
                if (read === 2) release();
                await gate;
              }
              return readError ? { error: { message: 'read failed' } } : { data: { paid: snapshot } };
            } };
          } };
        },
        update(next) {
          let expected;
          let hasPredicate = false;
          const query = {
            eq(key, value) {
              if (key === 'code') assert.equal(value, '1234');
              else {
                assert.equal(key, 'paid');
                expected = JSON.parse(value);
                hasPredicate = true;
                predicates.push(['eq', value]);
              }
              return query;
            },
            is(key, value) {
              assert.equal(key, 'paid');
              assert.equal(value, null);
              expected = null;
              hasPredicate = true;
              predicates.push(['is', null]);
              return query;
            },
            async select(column) {
              assert.equal(column, 'paid');
              assert.ok(hasPredicate, 'write must compare the original snapshot');
              writes++;
              if (updateError) return { error: { message: 'write failed' } };
              if (conflict || JSON.stringify(expected) !== JSON.stringify(paid)) return { data: [] };
              paid = structuredClone(next.paid);
              return { data: [{ paid: structuredClone(paid) }] };
            },
          };
          return query;
        },
      };
    },
  };
}

const pay = (client, name, item = 'dish', total = 2) => savePaidWithClient(client, item, name, '1234', total);

test('numeric IDs emitted by OCR can still be paid', async () => {
  const client = mockClient({});
  assert.deepEqual(await pay(client, 'Guest', 1, 1), { success: true });
  assert.deepEqual(client.paid, { 1: { payers: ['Guest'], total: 1 } });
});

test('untrusted payment arguments are rejected before any database access', async () => {
  for (const [item, name, code, count] of [
    ['__proto__', 'Guest', '1234', 1], ['constructor', 'Guest', '1234', 1],
    ['', 'Guest', '1234', 1], ['dish', '', '1234', 1], ['dish', 'x'.repeat(101), '1234', 1],
    ['dish', 'Guest', '1234)or(code.neq.0', 1], ['dish', 'Guest', '1234', Infinity],
    ['dish', 'Guest', '1234', -1], ['dish', 'Guest', '1234', 101],
  ]) {
    const client = mockClient({});
    assert.deepEqual(await savePaidWithClient(client, item, name, code, count), { success: false });
    assert.equal(client.reads, 0);
  }
});

test('tampered database payment entries fail closed without throwing or writing', async () => {
  for (const state of [[], 'bad', { dish: null }, { dish: { payers: 'Guest', total: 1 } },
    { dish: { payers: [{}], total: 1 } }, { dish: { payers: [], total: -1 } }]) {
    const client = mockClient(state);
    assert.deepEqual(await pay(client, 'Guest'), { success: false });
    assert.equal(client.writes, 0);
  }
});

test('concurrent payments on the same split both survive', async () => {
  const client = mockClient({}, { concurrent: true });
  assert.deepEqual(await Promise.all([pay(client, 'cha'), pay(client, 'charl')]), [
    { success: true }, { success: true },
  ]);
  assert.deepEqual(client.paid, { dish: { payers: ['cha', 'charl'], total: 2 } });
  assert.equal(client.reads, 3);
  assert.equal(client.writes, 3);
  assert.equal(client.predicates[0][1], '{}');
});

test('concurrent payments on different items preserve the whole map', async () => {
  const client = mockClient({ existing: { payers: ['Host'], total: 1 } }, { concurrent: true });
  await Promise.all([pay(client, 'cha'), pay(client, 'charl', 'drink', 1)]);
  assert.deepEqual(client.paid, {
    existing: { payers: ['Host'], total: 1 },
    dish: { payers: ['cha'], total: 2 },
    drink: { payers: ['charl'], total: 1 },
  });
});

test('null paid state uses IS NULL and preserves a partial split', async () => {
  const client = mockClient(null);
  assert.deepEqual(await pay(client, 'cha'), { success: true });
  assert.deepEqual(client.paid, { dish: { payers: ['cha'], total: 2 } });
  assert.deepEqual(client.predicates, [['is', null]]);
});

test('retry rechecks whether the payer has already paid', async () => {
  const client = mockClient({}, { concurrent: true });
  assert.deepEqual(await Promise.all([pay(client, 'cha'), pay(client, 'cha')]), [
    { success: true }, { success: true, alreadyPaid: true },
  ]);
  assert.deepEqual(client.paid.dish, { payers: ['cha'], total: 2 });
});

test('retry rechecks capacity and retains the winning split count', async () => {
  const client = mockClient({}, { concurrent: true });
  assert.deepEqual(await Promise.all([pay(client, 'cha', 'dish', 1), pay(client, 'charl')]), [
    { success: true }, { success: false, full: true },
  ]);
  assert.deepEqual(client.paid.dish, { payers: ['cha'], total: 1 });
});

test('existing split count is retained and legacy full entries are not overwritten', async () => {
  const client = mockClient({ dish: { payers: ['cha'], total: 3 }, legacy: 'Host' });
  assert.deepEqual(await pay(client, 'charl'), { success: true });
  assert.equal(client.paid.dish.total, 3);
  assert.deepEqual(await pay(client, 'guest', 'legacy'), { success: false, full: true });
  assert.equal(client.paid.legacy, 'Host');
});

test('read failures return failure without writing', async () => {
  const client = mockClient({}, { readError: true });
  assert.deepEqual(await pay(client, 'cha'), { success: false });
  assert.equal(client.writes, 0);
});

test('persistent write errors and conflicts are bounded to five attempts', async () => {
  for (const options of [{ updateError: true }, { conflict: true }]) {
    const client = mockClient({}, options);
    assert.deepEqual(await pay(client, 'cha'), { success: false });
    assert.equal(client.reads, 5);
    assert.equal(client.writes, 5);
    assert.deepEqual(client.paid, {});
  }
});
