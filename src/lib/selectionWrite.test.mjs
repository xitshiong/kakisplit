import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateSelectionWithClient } from './selectionWrite.mjs';

function backend(initial, failure) {
  let selections = initial;
  let writes = 0;
  const client = { from() { return {
    select() { return { eq() { return { async single() {
      return failure === 'read' ? { error: {} } : { data: { selections: structuredClone(selections) } };
    } }; } }; },
    update(next) {
      let expected;
      const query = {
        eq(key, value) { if (key === 'selections') expected = JSON.parse(value); return query; },
        is() { expected = null; return query; },
        async select() {
          writes++;
          if (failure === 'write') return { error: {} };
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
    assert.equal(db.writes, failure === 'read' ? 0 : 5);
  }
});
