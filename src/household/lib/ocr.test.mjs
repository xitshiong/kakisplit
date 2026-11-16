// Run with: node src/household/lib/ocr.test.mjs
//
// These cover the parts of the scan pipeline that decide whether a receipt is
// trustworthy: recovering malformed model output, catching arithmetic that
// doesn't add up, and lining up two readings so a disagreement is pinned to
// the one line it belongs to.

import assert from "node:assert/strict";
import { __test, parseModelJson, verifyArithmetic } from "./ocr.js";

const { alignItems, reconcile, bakeItems, normaliseReading } = __test;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
}

const reading = (over = {}) =>
  normaliseReading({
    taxMode: "inclusive",
    items: [],
    adjustments: [],
    ...over,
  });

// ── JSON recovery ─────────────────────────────────────────────

test("parses clean JSON", () => {
  assert.deepEqual(parseModelJson('{"a":1}'), { a: 1 });
});

test("strips markdown fences", () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
});

test("recovers raw newlines inside strings", () => {
  const out = parseModelJson('{"name":"MILK\n2L"}');
  assert.equal(out.name, "MILK\n2L");
});

test("salvages a response cut off mid-item", () => {
  const truncated = '{"items":[{"name":"RICE","lineTotal":5.20},{"name":"EG';
  const out = parseModelJson(truncated);
  assert.equal(out.items[0].name, "RICE");
  assert.ok(out.items.length >= 1);
});

test("throws when there is no JSON at all", () => {
  assert.throws(() => parseModelJson("I cannot read this receipt."));
});

// ── arithmetic verification ───────────────────────────────────

test("accepts a receipt that balances with tax already in the prices", () => {
  const check = verifyArithmetic(
    reading({
      items: [
        { name: "MILK", lineTotal: 3.1 },
        { name: "BREAD", lineTotal: 4.5 },
      ],
      tax: 0.69,
      grandTotal: 7.6,
    })
  );
  assert.ok(check.balanced, "inclusive tax must not be added twice");
  assert.equal(check.deltaCents, 0);
});

test("adds tax on top when the till charges it separately", () => {
  const check = verifyArithmetic(
    reading({
      taxMode: "exclusive",
      items: [{ name: "MILK", lineTotal: 10.0 }],
      tax: 0.6,
      grandTotal: 10.6,
    })
  );
  assert.ok(check.balanced);
});

test("catches a missed line item", () => {
  const check = verifyArithmetic(
    reading({
      items: [{ name: "MILK", lineTotal: 3.1 }],
      grandTotal: 7.6,
    })
  );
  assert.equal(check.balanced, false);
  assert.equal(check.deltaCents, 450);
  assert.ok(check.problems.some((p) => p.code === "unbalanced"));
});

test("applies discounts and rounding", () => {
  const check = verifyArithmetic(
    reading({
      items: [{ name: "RICE", lineTotal: 20.0 }],
      discount: 2.0,
      rounding: -0.02,
      grandTotal: 17.98,
    })
  );
  assert.ok(check.balanced);
});

test("does not add an included-tax component to the printed total", () => {
  const receipt = reading({
    taxMode: "exclusive",
    taxIncluded: true,
    items: [{ name: "DINNER", lineTotal: 206.0 }],
    tax: 18.72,
    totalLabel: "Total Amount",
    grandTotal: 206.0,
  });
  assert.equal(receipt.taxMode, "inclusive");
  const check = verifyArithmetic(receipt);
  assert.ok(check.balanced);
  assert.equal(check.expected, 20600);
});

test("normalises the photographed receipt to 206.00, not 224.72", () => {
  const receipt = normaliseReading({
    taxMode: "exclusive",
    taxIncluded: true,
    items: [
      { name: "Seafood Silken Tofu Soup", lineTotal: 20 },
      { name: "Kimchi Stew with Pork", lineTotal: 20 },
      { name: "Kimchi & Pork Pancake", lineTotal: 25 },
      { name: "Tofu Kimchi & Pork", lineTotal: 25 },
      { name: "Beef Bulgogi", lineTotal: 35 },
      { name: "Steamed Rice", lineTotal: 6 },
      { name: "Steamed Rice", lineTotal: 9 },
      { name: "Char-Grilled Marinated Pork", lineTotal: 30 },
      { name: "Fish Cake Udon", lineTotal: 16 },
      { name: "Kimchi&Pork Silken Tofu Soup", lineTotal: 19 },
      { name: "Takeaway container (Soup)", lineTotal: 1 },
    ],
    tax: 18.72,
    totalLabel: "Total Amount",
    grandTotal: 206,
  });
  assert.equal(receipt.items.reduce((sum, item) => sum + item.lineCents, 0), 20600);
  assert.equal(verifyArithmetic(receipt).expected, 20600);
  assert.notEqual(verifyArithmetic(receipt).expected, 22472);
});

test("prefers explicit included-tax evidence during reconciliation", () => {
  const wrong = reading({
    taxMode: "exclusive",
    items: [{ name: "DINNER", lineTotal: 206.0 }],
    tax: 18.72,
    grandTotal: 224.72,
  });
  const correct = reading({
    taxMode: "exclusive",
    taxIncluded: true,
    items: [{ name: "DINNER", lineTotal: 206.0 }],
    tax: 18.72,
    grandTotal: 206.0,
  });
  const merged = reconcile(
    wrong, correct, verifyArithmetic(wrong), verifyArithmetic(correct)
  );
  assert.equal(merged.reading.taxMode, "inclusive");
  assert.equal(merged.reading.grandTotalCents, 20600);
});

test("counts multibuy adjustment lines", () => {
  const check = verifyArithmetic(
    reading({
      items: [{ name: "COKE", qty: 3, unitPrice: 4.5, lineTotal: 13.5 }],
      adjustments: [{ label: "3 for 12", amount: -1.5, appliesToLineNo: 1 }],
      grandTotal: 12.0,
    })
  );
  assert.ok(check.balanced);
});

test("flags a mismatch against the receipt's own item count", () => {
  const check = verifyArithmetic(
    reading({
      items: [{ name: "MILK", lineTotal: 3.1 }],
      printedItemCount: 2,
      grandTotal: 3.1,
    })
  );
  assert.ok(check.balanced);
  assert.ok(check.problems.some((p) => p.code === "count_mismatch"));
});

test("flags a line where quantity times unit price is wrong", () => {
  const check = verifyArithmetic(
    reading({
      items: [{ name: "COKE", qty: 3, unitPrice: 4.5, lineTotal: 9.0 }],
      grandTotal: 9.0,
    })
  );
  assert.ok(check.problems.some((p) => p.code === "line_math"));
});

test("refuses to call a scan checked when no total was visible", () => {
  const check = verifyArithmetic(
    reading({ items: [{ name: "MILK", lineTotal: 3.1 }], grandTotal: null })
  );
  assert.equal(check.balanced, false);
  assert.ok(check.problems.some((p) => p.code === "no_total"));
});

// ── aligning two readings ─────────────────────────────────────

const item = (name, cents, lineNo) => ({
  lineNo, name, qty: 1, unit: "ea",
  unitCents: cents, lineCents: cents,
  confidence: 1, uncertain: [], taxCode: "", category: "other",
});

test("identical readings align one to one", () => {
  const a = [item("MILK", 310, 1), item("BREAD", 450, 2)];
  const pairs = alignItems(a, a);
  assert.equal(pairs.length, 2);
  assert.ok(pairs.every((p) => p.left && p.right));
});

test("a line missed by one reader becomes a gap, not a cascade", () => {
  const full = [item("MILK", 310, 1), item("EGGS", 620, 2), item("BREAD", 450, 3)];
  const missing = [item("MILK", 310, 1), item("BREAD", 450, 2)];
  const pairs = alignItems(full, missing);

  const gaps = pairs.filter((p) => !p.left || !p.right);
  assert.equal(gaps.length, 1, "exactly one unmatched line");
  assert.equal(gaps[0].left.name, "EGGS");

  const matched = pairs.filter((p) => p.left && p.right);
  assert.ok(matched.every((p) => p.left.name === p.right.name), "the rest still line up");
});

test("a price disagreement is isolated to its own line", () => {
  const a = [item("MILK", 310, 1), item("BREAD", 450, 2)];
  const b = [item("MILK", 310, 1), item("BREAD", 480, 2)];
  const pairs = alignItems(a, b);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[1].left.lineCents, 450);
  assert.equal(pairs[1].right.lineCents, 480);
});

test("reconcile flags disagreements and keeps lines only one reader saw", () => {
  const primary = reading({
    items: [
      { name: "MILK", lineTotal: 3.1 },
      { name: "BREAD", lineTotal: 4.5 },
    ],
    grandTotal: 7.6,
  });
  const auditor = reading({
    items: [
      { name: "MILK", lineTotal: 3.1 },
      { name: "BREAD", lineTotal: 4.8 },
      { name: "BAG", lineTotal: 0.15 },
    ],
    grandTotal: 8.05,
  });

  const merged = reconcile(
    primary, auditor, verifyArithmetic(primary), verifyArithmetic(auditor)
  );
  const names = merged.reading.items.map((i) => i.name);
  assert.ok(names.includes("BAG"), "a line only one reader saw is kept, not dropped");

  const bread = merged.reading.items.find((i) => i.name === "BREAD");
  assert.ok(bread.flags.includes("price"), "the disputed price is flagged");
  assert.equal(bread.alternative.lineCents, 480);

  const milk = merged.reading.items.find((i) => i.name === "MILK");
  assert.equal(milk.flags.length, 0, "agreed lines stay clean");
  assert.ok(merged.agreementRate < 1);
});

test("reconcile prefers the reading whose numbers actually balance", () => {
  const unbalanced = reading({
    items: [{ name: "MILK", lineTotal: 3.1 }],
    grandTotal: 7.6,
  });
  const balanced = reading({
    items: [{ name: "MILK", lineTotal: 3.1 }, { name: "BREAD", lineTotal: 4.5 }],
    grandTotal: 7.6,
  });

  const merged = reconcile(
    unbalanced, balanced, verifyArithmetic(unbalanced), verifyArithmetic(balanced)
  );
  assert.equal(merged.reading.items.length, 2);
});

// ── baking ────────────────────────────────────────────────────

test("adjustments land on the item they belong to", () => {
  const baked = bakeItems(
    reading({
      items: [
        { lineNo: 1, name: "COKE", lineTotal: 13.5 },
        { lineNo: 2, name: "MILK", lineTotal: 3.1 },
      ],
      adjustments: [{ lineNo: 3, label: "Member price", amount: -1.5, appliesToLineNo: 1 }],
      grandTotal: 15.1,
    })
  );
  const coke = baked.items.find((i) => i.name === "COKE");
  assert.equal(coke.lineCents, 1200, "the saving comes off the coke, not the milk");
  assert.equal(baked.items.reduce((s, i) => s + i.totalCents, 0), 1510);
});

test("baked item totals always reach the grand total", () => {
  const baked = bakeItems(
    reading({
      taxMode: "exclusive",
      items: [
        { lineNo: 1, name: "A", lineTotal: 3.33 },
        { lineNo: 2, name: "B", lineTotal: 3.33 },
        { lineNo: 3, name: "C", lineTotal: 3.34 },
      ],
      tax: 0.6,
      grandTotal: 10.6,
    })
  );
  assert.equal(baked.items.reduce((s, i) => s + i.totalCents, 0), 1060);
});

console.log(`${passed} checks passed`);
