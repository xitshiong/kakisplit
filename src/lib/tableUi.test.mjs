import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentStatus, savedTables, formatTableDate, localDate } from './tableUi.mjs';

test('partial shares are not marked paid', () => {
  assert.equal(paymentStatus({ payers: ['Ali'], total: 2 }).complete, false);
  assert.equal(paymentStatus({ payers: ['Ali', 'Mei'], total: 2 }).complete, true);
  assert.equal(paymentStatus({ payers: [], total: 1 }).complete, false);
  assert.equal(paymentStatus(undefined).complete, false);
});

test('legacy paid entries retain payer names', () => {
  assert.deepEqual(paymentStatus('Ali'), { payers: ['Ali'], total: 1, complete: true });
  assert.deepEqual(paymentStatus({ name: 'Mei' }).payers, ['Mei']);
});

test('saved table corruption does not break home', () => {
  const read = value => savedTables({ getItem: () => value });
  assert.deepEqual(read('broken'), []);
  assert.deepEqual(read('{}'), []);
  assert.deepEqual(read('[null, {"code":"1234"}, {"code":"wrong"}]'), [{ code: '1234' }]);
});

test('table dates use readable local calendar dates', () => {
  assert.equal(localDate(new Date(2026, 10, 20, 0, 30)), '2026-11-20');
  assert.equal(formatTableDate('2026-11-20'), '20 Nov 2026');
  assert.equal(formatTableDate(''), '');
});
