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
    { name: 'Discount', price: '-2.5', billLevel: true },
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

test('rejects an oversized bill even when individual amounts are within the line cap', () => {
  const result = reviewReceiptItems([
    { name: 'A', price: '1000000.00' },
    { name: 'B', price: '0.01' },
  ]);
  assert.deepEqual(result.errors, [{ name: '', price: '' }, { name: '', price: '' }]);
  assert.equal(result.valid, false);
  assert.match(result.totalError, /Amount is too large/);
  assert.equal(result.totalText, null);
});

test('reports oversized decimal amounts clearly, including unsafe cents and signed adjustments', () => {
  for (const price of ['1000000.01', '1000000,01', '90071992547389.90', '90071992547409.92', '-1000000.01']) {
    const result = reviewReceiptItems([{ name: 'Amount', price, billLevel: true }]);
    assert.equal(result.valid, false);
    assert.match(result.errors[0].price, /^Amount is too large/);
  }
  const result = reviewReceiptItems([{ name: 'A', price: '10.00' }, { name: 'B', price: '10.00' }, { name: 'C', price: '90071992547389.90' }]);
  assert.equal(result.totalText, '20.00');
  assert.match(result.errors[2].price, /^Amount is too large/);
});

test('formats displayed totals from integer cents at the cap and below', () => {
  const atCap = reviewReceiptItems([{ name: 'A', price: '999999.99' }, { name: 'B', price: '0.01' }]);
  assert.equal(atCap.valid, true);
  assert.equal(atCap.totalText, '1000000.00');
  assert.equal(reviewReceiptItems([{ name: 'A', price: '.10' }, { name: 'B', price: '.20' }]).totalText, '0.30');
});

test('marks errors only on affected lines while keeping the total of valid amounts', () => {
  const result = reviewReceiptItems([
    { name: '', price: '3.00' },
    { name: 'Tea', price: 'invalid' },
    { name: 'Discount', price: '-1.50', billLevel: true },
  ]);
  assert.equal(result.total, 1.5);
  assert.deepEqual(result.errors.map(({ name, price }) => [Boolean(name), Boolean(price)]), [
    [true, false], [false, true], [false, false],
  ]);
  assert.equal(result.totalError, '');
});
