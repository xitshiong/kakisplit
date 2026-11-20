// Every split in the household flow is done in integer cents. These cover
// parsing what people and models type, formatting it back, and spreading tax
// and charges so the shares always add back up to the printed total.

import assert from "node:assert/strict";
import test from "node:test";
import { CURRENCIES, allocateCents, bakeExtras, fmt, fmtPlain, toCents } from "./money.js";

// ── toCents ───────────────────────────────────────────────────

test("converts numbers to whole cents without float drift", () => {
  assert.equal(toCents(3.1), 310);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(206), 20600);
  assert.equal(toCents(-1.5), -150);
});

test("parses typed and printed amounts", () => {
  assert.equal(toCents("12.5"), 1250);
  assert.equal(toCents("5."), 500);
  assert.equal(toCents(".75"), 75);
  assert.equal(toCents("RM 1,234.50"), 123450);
  assert.equal(toCents("-3.10"), -310);
  assert.equal(toCents("(3.10)"), -310);
});

test("treats empty or junk input as zero", () => {
  for (const v of [null, undefined, "", ".", "abc", NaN, Infinity, "1.2.3"]) {
    assert.equal(toCents(v), 0, `toCents(${String(v)})`);
  }
});

// ── formatting ────────────────────────────────────────────────

test("fmtPlain gives an editable two-decimal string", () => {
  assert.equal(fmtPlain(0), "0.00");
  assert.equal(fmtPlain(5), "0.05");
  assert.equal(fmtPlain(123450), "1234.50");
  assert.equal(fmtPlain(-310), "-3.10");
});

test("fmtPlain round-trips through toCents", () => {
  for (const c of [0, 1, 99, 310, 123456, -150]) assert.equal(toCents(fmtPlain(c)), c);
});

test("fmt adds the currency symbol and groups thousands", () => {
  assert.equal(fmt(123450, "MYR"), "RM 1,234.50");
  assert.equal(fmt(-150, "SGD"), "-S$ 1.50");
  assert.equal(fmt(100000000, "USD"), "$ 1,000,000.00");
});

test("fmt falls back to the code for unknown currencies", () => {
  assert.equal(fmt(250, "XYZ"), "XYZ 2.50");
  assert.equal(fmt(250), "2.50");
});

test("every currency the OCR prompt can return has a symbol", () => {
  for (const code of ["MYR", "SGD", "AUD", "USD", "GBP", "EUR", "IDR", "THB", "PHP", "VND", "INR", "JPY"]) {
    assert.ok(CURRENCIES[code]?.symbol, code);
  }
});

// ── allocation ────────────────────────────────────────────────

test("allocateCents splits by weight and sums exactly", () => {
  assert.deepEqual(allocateCents(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocateCents(1000, [3, 1]), [750, 250]);
  const parts = allocateCents(1001, [7, 13, 29]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 1001);
});

test("allocateCents handles negatives and zero weights", () => {
  assert.deepEqual(allocateCents(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(allocateCents(10, [0, 0]), [5, 5]);
  assert.deepEqual(allocateCents(10, []), []);
});

// ── bakeExtras ────────────────────────────────────────────────

test("bakeExtras spreads tax by value so lines add up to the total", () => {
  const spread = bakeExtras([1000, 500], 1600);
  assert.deepEqual(spread, [
    { extrasCents: 67, totalCents: 1067 },
    { extrasCents: 33, totalCents: 533 },
  ]);
});

test("bakeExtras spreads a discount as negative extras", () => {
  const spread = bakeExtras([1350, 310], 1510);
  assert.equal(spread.reduce((s, i) => s + i.totalCents, 0), 1510);
  assert.ok(spread.every((i) => i.extrasCents <= 0));
});

test("bakeExtras leaves lines alone when the total already matches", () => {
  assert.deepEqual(bakeExtras([310, 450], 760), [
    { extrasCents: 0, totalCents: 310 },
    { extrasCents: 0, totalCents: 450 },
  ]);
  assert.deepEqual(bakeExtras([], 0), []);
});

test("allocated cents always conserve the total for positive shares and credits", () => {
  for (const total of [-301, -1, 0, 1, 2, 301]) {
    for (const weights of [[1, 1, 1], [1, 10, 5], [0, 2, 0], [0, 0], [NaN, -1, 3]]) {
      const result = allocateCents(total, weights);
      assert.equal(result.length, weights.length);
      assert.ok(result.every(Number.isInteger));
      assert.equal(result.reduce((sum, value) => sum + value, 0), total);
    }
  }
});

test("ties assign leftover cents deterministically and excluded members receive zero", () => {
  assert.deepEqual(allocateCents(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocateCents(7, [1, 0, 1]), [4, 0, 3]);
  assert.deepEqual(allocateCents(7, []), []);
});
