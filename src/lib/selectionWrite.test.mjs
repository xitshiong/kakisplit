import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateSelectionWithClient } from './selectionWrite.mjs';

function backend(initial, failure) {
  let selections = initial;
  let writes = 0;
  const client = { from() { return {
    select() { return { eq() { return { async single() {
      if (failure === 'missing') return { error: { code: '42703', message: 'column sessions.selections does not exist' } };
      return failure === 'read' ? { error: {} } : { data: { selections: structuredClone(selections) } };
    } }; } }; },
    update(next) {
      let expected;
      const query = {
        eq(key, value) { if (key === 'selections') expected = JSON.parse(value); return query; },
        is() { expected = null; return query; },
        then(resolve, reject) {
          writes++;
          if (failure === 'write') return Promise.resolve({ error: {} }).then(resolve, reject);
          selections = next.selections;
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
        async select() {
          writes++;
          if (failure === 'write' || failure === 'json') return { error: { message: 'operator does not exist: json = json' } };
          if (JSON.stringify(expected) !== JSON.stringify(selections)) return { data: [] };
          selections = next.selections;
          return { data: [{ selections }] };
        },
      };
      return query;
    },
  }; } };
  return { client, get selections() { return selections; }, get writes() { return writes; } };
}

test('concurrent selections preserve both guests, including on the same dish', async () => {
  const db = backend({});
  assert.deepEqual(await Promise.all([
    updateSelectionWithClient(db.client, '1234', 'Ari', { tea: true }),
    updateSelectionWithClient(db.client, '1234', 'Bela', { tea: true, noodles: true }),
  ]), [true, true]);
  assert.deepEqual(db.selections, { tea: ['Ari', 'Bela'], noodles: ['Bela'] });
  assert.equal(db.writes, 3);
});

test('empty selection removes only the named guest, and null state can be initialized', async () => {
  const db = backend(null);
  assert.equal(await updateSelectionWithClient(db.client, '1234', 'Ari', { tea: true }), true);
  await updateSelectionWithClient(db.client, '1234', 'Bela', { tea: true });
  await updateSelectionWithClient(db.client, '1234', 'Ari', {});
  assert.deepEqual(db.selections, { tea: ['Bela'] });
});

test('read and persistent write errors report failure without replacing saved selections', async () => {
  for (const failure of ['read', 'write']) {
    const db = backend({ tea: ['Bela'] }, failure);
    assert.equal(await updateSelectionWithClient(db.client, '1234', 'Ari', { tea: true }), false);
    assert.deepEqual(db.selections, { tea: ['Bela'] });
    assert.equal(db.writes, failure === 'read' ? 0 : 2);
  }
});

test('JSON comparison errors fall back to the legacy unconditional update', async () => {
  const db = backend({ tea: ['Bela'] }, 'json');
  assert.equal(await updateSelectionWithClient(db.client, '1234', 'Ari', { tea: true }), true);
  assert.deepEqual(db.selections, { tea: ['Bela', 'Ari'] });
  assert.equal(db.writes, 2);
});

test('a missing selections column is non-fatal and does not attempt to write', async () => {
  const db = backend(null, 'missing');
  assert.equal(await updateSelectionWithClient(db.client, '1234', 'Ari', { tea: true }), true);
  assert.equal(db.writes, 0);
});

test('malformed non-array entries do not throw when removing or adding a guest', async () => {
  const db = backend({ tea: 'Bela', noodles: null, rice: { name: 'Ari' } });
  assert.equal(await updateSelectionWithClient(db.client, '1234', 'Ari', { tea: true }), true);
  assert.deepEqual(db.selections, { tea: ['Ari'], noodles: [], rice: [] });
});
