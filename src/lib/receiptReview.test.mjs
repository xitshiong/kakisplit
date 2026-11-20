import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewReceiptItems } from './receiptReview.mjs';

test('requires an item and a positive bill total', () => {
  assert.equal(reviewReceiptItems([]).valid, false);
  assert.match(reviewReceiptItems([]).totalError, /Add at least one/);
  for (const price of [0, -3]) {
    assert.equal(reviewReceiptItems([{ name: 'Discount', price }]).valid, false);
  }
});

test('validates names without accepting whitespace', () => {
  for (const name of ['', '  ', null, undefined]) {
    const result = reviewReceiptItems([{ name, price: 10 }]);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].name);
  }
});

test('rejects missing, nonfinite, unsafe or fractional-cent amounts', () => {
  for (const price of ['', ' ', null, undefined, NaN, Infinity, '12abc', '1.001', '1e2', '999999999999999999']) {
    const result = reviewReceiptItems([{ name: 'Nasi lemak', price }]);
    assert.equal(result.valid, false, `Accepted ${price}`);
    assert.ok(result.errors[0].price);
  }
});

test('preserves signed discounts, free items and common decimal entry', () => {
  const result = reviewReceiptItems([
    { name: 'Meal', price: '12.90' },
    { name: 'Discount', price: '-2.5' },
    { name: 'Extra sambal', price: '.50' },
    { name: 'Water', price: 0 },
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.total, 10.9);
});

test('adds currency amounts in cents without floating point drift', () => {
  assert.equal(reviewReceiptItems([{ name: 'A', price: 0.1 }, { name: 'B', price: 0.2 }]).total, 0.3);
});

test('does not alter item drafts and recovers after correction', () => {
  const items = [{ id: 'draft', name: 'Dinner', price: '' }];
  const before = JSON.stringify(items);
  assert.equal(reviewReceiptItems(items).valid, false);
  assert.equal(JSON.stringify(items), before);
  assert.equal(reviewReceiptItems([{ ...items[0], price: '15.00' }]).valid, true);
});

test('rejects an unsafe grand total even when individual amounts fit in safe cents', () => {
  const result = reviewReceiptItems([
    { name: 'A', price: '80000000000000.00' },
    { name: 'B', price: '80000000000000.00' },
  ]);
  assert.deepEqual(result.errors, [{ name: '', price: '' }, { name: '', price: '' }]);
  assert.equal(result.valid, false);
});

test('marks errors only on affected lines while keeping the total of valid amounts', () => {
  const result = reviewReceiptItems([
    { name: '', price: '3.00' },
    { name: 'Tea', price: 'invalid' },
    { name: 'Discount', price: '-1.50' },
  ]);
  assert.equal(result.total, 1.5);
  assert.deepEqual(result.errors.map(({ name, price }) => [Boolean(name), Boolean(price)]), [
    [true, false], [false, true], [false, false],
  ]);
  assert.equal(result.totalError, '');
});
