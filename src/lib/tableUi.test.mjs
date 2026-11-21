import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentStatus, paymentBreakdown, savedTables, formatTableDate, localDate } from './tableUi.mjs';

test('partial shares are not marked paid', () => {
  assert.equal(paymentStatus({ payers: ['Ali'], total: 2 }).complete, false);
  assert.equal(paymentStatus({ payers: ['Ali', 'Mei'], total: 2 }).complete, true);
  assert.equal(paymentStatus({ payers: [], total: 1 }).complete, false);
  assert.equal(paymentStatus(undefined).complete, false);
});

test('legacy discounts retain signed totals and conserve signed paid shares', () => {
  assert.equal(paymentBreakdown(-2, undefined).totalCents, -200);
  assert.equal(paymentBreakdown(-2, undefined).paidCents, 0);
  assert.equal(paymentBreakdown(-2, { payers: ['A'], total: 3 }).paidCents, -67);
  assert.equal(paymentBreakdown(-2, { payers: ['A', 'B'], total: 3 }).paidCents, -134);
  assert.equal(paymentBreakdown(-2, { payers: ['A', 'B', 'C'], total: 3 }).paidCents, -200);
});

test('legacy paid entries retain payer names', () => {
  assert.deepEqual(paymentStatus('Ali'), { payers: ['Ali'], total: 1, complete: true });
  assert.deepEqual(paymentStatus({ name: 'Mei' }).payers, ['Mei']);
});

test('part-paid amounts and known owing names match the guest shares', () => {
  const partial = paymentBreakdown('12.00', { payers: ['Ali'], total: 3 }, ['Ali', 'Mei', 'Jo', 'Mei']);
  assert.equal(partial.complete, false);
  assert.equal(partial.paidCents, 400);
  assert.equal(partial.totalCents, 1200);
  assert.deepEqual(partial.owing, ['Mei', 'Jo']);
  assert.equal(partial.unnamedShares, 0);
  assert.equal(paymentBreakdown(12, { payers: ['Ali'], total: 3 }).unnamedShares, 2);
  assert.deepEqual(paymentBreakdown(12, undefined, null).owing, []);
  assert.equal(paymentBreakdown(10, { payers: ['Ali', 'Mei'], total: 3 }).paidCents, 667);
  assert.equal(paymentBreakdown(10, { payers: ['Ali', 'Mei', 'Jo'], total: 3 }).paidCents, 1000);
  assert.equal(paymentBreakdown('10.01', { payers: ['Ali'], total: 2 }).paidCents, 501);
});

test('saved table corruption does not break home', () => {
  const read = value => savedTables({ getItem: () => value });
  assert.deepEqual(read('broken'), []);
  assert.deepEqual(read('{}'), []);
  assert.deepEqual(read('[null, {"code":"1234"}, {"code":"wrong"}]'), [{ code: '1234' }]);
  assert.deepEqual(read('[{"code":"ABCDEFGH"}]'), [{ code: 'ABCDEFGH' }]);
});

test('table dates use readable local calendar dates', () => {
  assert.equal(localDate(new Date(2026, 10, 20, 0, 30)), '2026-11-20');
  assert.equal(formatTableDate('2026-11-20'), '20 Nov 2026');
  assert.equal(formatTableDate(''), '');
});

test('positive selections do not count as payments and invalid names are excluded', () => {
  const value = paymentBreakdown(15, { payers: [], total: 2 }, [null, '', 3, '   ', 'Ali', 'Ali']);
  assert.deepEqual(value.owing, ['Ali']);
  assert.equal(value.unnamedShares, 1);
  assert.equal(value.paidCents, 0);
  assert.equal(value.complete, false);
});

test('a partially paid item shows the remaining unnamed shares without going negative', () => {
  const selections = ['Ali', 'Mei', 'Jo', 'Ana'];
  const value = paymentBreakdown(15, { payers: ['Ali'], total: 2 }, selections);
  assert.equal(value.paidCents, 750);
  assert.equal(value.unnamedShares, 0);
  assert.equal(value.complete, false);
});

test('saved tables survive inaccessible storage and dates do not display Invalid Date', () => {
  assert.deepEqual(savedTables({ getItem: () => { throw new Error('denied'); } }), []);
  assert.equal(formatTableDate('unknown'), 'unknown');
  assert.equal(localDate(new Date(2027, 0, 4, 23, 35)), '2027-01-04');
});
