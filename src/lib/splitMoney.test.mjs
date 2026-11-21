import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCents, shareCents, guestShareCents, canConfirmSelection, allocateBillItems } from './splitMoney.mjs';
import { reviewReceiptItems } from './receiptReview.mjs';
import { paymentBreakdown } from './tableUi.mjs';

test('legacy negative and invalid prices do not crash share rendering', () => {
  for (const price of [-2, 'junk', null, 'NaN']) {
    assert.equal(guestShareCents(price, { payers: ['Other'], total: 2 }, 'Guest'), 0);
    assert.equal(paymentBreakdown(price, { payers: ['Other'], total: 2 }).paidCents, 0);
  }
});

test('shared cents conserve the bill including tiny and uneven splits', () => {
  for (const [cents, count] of [[1000, 3], [1, 3], [100, 7], [10000, 7]]) {
    const shares = Array.from({ length: count }, (_, slot) => shareCents(cents, count, slot));
    assert.equal(shares.reduce((a, b) => a + b, 0), cents);
    for (let paid = 0; paid <= count; paid++) {
      const payers = shares.slice(0, paid).map((_, i) => `P${i}`);
      assert.equal(paymentBreakdown(cents / 100, { payers, total: count }).paidCents, shares.slice(0, paid).reduce((a, b) => a + b, 0));
    }
  }
  assert.deepEqual([0, 1, 2].map(slot => shareCents(1000, 3, slot)), [334, 333, 333]);
  assert.deepEqual([0, 1, 2].map(slot => shareCents(1, 3, slot)), [1, 0, 0]);
  assert.equal(guestShareCents(10, { payers: ['A'], total: 3 }, 'A'), 334);
  assert.equal(guestShareCents(10, { payers: ['A'], total: 3 }, 'B'), 333);
  assert.throws(() => shareCents(1, 0, 0), RangeError);
});

test('zero-value nonempty selections can be confirmed', () => {
  assert.equal(shareCents(0, 3, 0), 0);
  assert.equal(canConfirmSelection([{ price: 0 }], 0), true);
  assert.equal(canConfirmSelection([], 0), false);
  assert.equal(canConfirmSelection([{}], -1), false);
  assert.equal(canConfirmSelection([{}], NaN), false);
});

test('decimal commas work without accepting thousands grouping or junk', () => {
  for (const [value, cents] of [['1,50', 150], ['1,5', 150], ['-2,50', -250], ['1.50', 150]]) assert.equal(priceCents(value), cents);
  for (const value of ['', '1,000', '1,234.50', '1.234,50', '1,2,3', 'abc', Infinity]) assert.equal(priceCents(value), null);
  assert.equal(reviewReceiptItems([{ name: 'Tea', price: '1,50' }]).valid, true);
  assert.equal(reviewReceiptItems([{ name: 'Tea', price: '-1' }, { name: 'Food', price: 5 }]).valid, false);
});

test('whole-bill charges and discounts are allocated exactly, excluding free items', () => {
  for (const adjustment of [1, -1, -9.99]) {
    const items = [{ id: 1, name: 'A', price: '3,33' }, { id: 2, name: 'B', price: 6.67 },
      { id: 3, name: 'Free', price: 0 }, { name: 'Adjustment', price: adjustment, billLevel: true }];
    const before = JSON.stringify(items);
    const result = allocateBillItems(items);
    assert.deepEqual(result.map(item => item.id), [1, 2, 3]);
    assert.equal(result.reduce((sum, item) => sum + priceCents(item.price), 0), 1000 + priceCents(adjustment));
    assert.equal(result[2].price, '0.00');
    assert.equal(JSON.stringify(items), before);
  }
  assert.throws(() => allocateBillItems([]), RangeError);
  assert.throws(() => allocateBillItems([{ price: 1 }, { price: -2, billLevel: true }]), RangeError);
  assert.throws(() => allocateBillItems([{ price: 'junk' }]), RangeError);
  assert.equal(allocateBillItems([{ price: '90071992547409.91' }])[0].price, '90071992547409.91');
});
