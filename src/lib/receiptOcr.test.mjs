import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileReceipt, scanReceipt, scanReceiptBatch } from "./receiptOcr.js";

const reading = (items, grandTotal, adjustments = [], hasUnreadableRows = false) =>
  ({ items, grandTotal, adjustments, hasUnreadableRows });
const line = (name, qty, lineTotal, unitPrice = null) => ({ name, qty, lineTotal, unitPrice });
const photo = "data:image/jpeg;base64,dGVzdA==";
const response = (data, finishReason = "stop") => Response.json({
  text: typeof data === "string" ? data : JSON.stringify(data), finishReason,
});

test('oversized model arrays are rejected and oversized item names are not rendered', () => {
  assert.throws(() => reconcileReceipt(reading(Array(201).fill(line('Tea', 1, 1)), 201)));
  assert.throws(() => reconcileReceipt(reading([], 0, Array(101).fill(0))));
  const result = reconcileReceipt(reading([line('x'.repeat(301), 1, 1), line('Tea', 1, 2)], 3));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, 'Tea');
  assert.match(result.warnings.join(' '), /Some rows may be missing/);
});

test('hostile model quantities cannot expand into more than 1000 rendered rows', () => {
  const result = reconcileReceipt(reading(Array(20).fill(line('Tea', 100, 100)), 2000));
  assert.equal(result.items.length, 1000);
  assert.match(result.warnings.join(' '), /Some rows may be missing/);
});

test("two malformed readings return a review warning rather than fabricated items", async () => {
  const responses = [response("not JSON"), response({ items: [] })];
  const result = await scanReceipt(photo, { accessToken: "user-token" }, () => responses.shift());
  assert.equal(responses.length, 0);
  assert.deepEqual(result.items, []);
  assert.match(result.warnings.join(" "), /No priced items could be read/);
});

test("a service failure on retry is not swallowed if the first response was unusable", async () => {
  const responses = [response("not JSON"), Response.json({ error: "unavailable" }, { status: 503 })];
  await assert.rejects(
    scanReceipt(photo, { accessToken: "user-token" }, () => responses.shift()),
    /receipt service couldn't scan/,
  );
  assert.equal(responses.length, 0);
});

test("invalid rows trigger review while usable names and amounts are retained", () => {
  const result = reconcileReceipt(reading([
    line("  Iced \t lemon  tea ", 1, 3),
    line("", 1, 4),
    line("Invalid quantity", 0, 9),
    line("Invalid negative line", 1, -1),
    line("Unknown price", 1, null),
  ], 3));
  assert.deepEqual(result.items, [{ name: "Iced lemon tea", rawPrice: 3, itemTax: 0, price: 3 }]);
  assert.match(result.warnings.join(" "), /Some rows may be missing/);
});

test("a large printed quantity stays on one line rather than generating hundreds of rows", () => {
  const result = reconcileReceipt(reading([line("Catering", 120, 240)], 240));
  assert.deepEqual(result.items, [{ name: "Catering (×120)", rawPrice: 240, itemTax: 0, price: 240 }]);
  assert.deepEqual(result.warnings, []);
});

test("rounding spreads signed adjustments exactly without charging free items", () => {
  const lines = [line("Drinks", 3, 10), line("Water", 1, 0)];
  for (const [adjustment, total, prices] of [[0.11, 10.11, [337, 337, 337, 0]], [-0.11, 9.89, [329, 331, 329, 0]]]) {
    const result = reconcileReceipt(reading(lines, total, [adjustment]));
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.items.map(item => Math.round(item.price * 100)), prices);
  }
});

test("an empty receipt batch finishes without asking the provider to read anything", async () => {
  assert.deepEqual(await scanReceiptBatch([], () => assert.fail("unexpected read")), { items: [], warnings: [] });
});

test("tax-inclusive receipt uses printed line totals without redistributing included GST", () => {
  const result = reconcileReceipt(reading([line("Nasi Lemak", 2, 19.95, 10), line("Teh Tarik", 1, 2.55)], 22.5));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.items.map(i => [i.name, i.price, i.itemTax]), [
    ["Nasi Lemak (1/2)", 9.98, 0], ["Nasi Lemak (2/2)", 9.97, 0], ["Teh Tarik", 2.55, 0],
  ]);
});

test("bill-level taxes, service fee, coupon and printed rounding reconcile exactly", () => {
  const result = reconcileReceipt(reading([line("茶", 3, null, 2.5), line("饭", 2, 20)], 29.51, [1.65, 2.75, -2.4, 0.01]));
  assert.deepEqual(result.warnings, []);
  assert.equal(result.items.reduce((n, i) => n + Math.round(i.price * 100), 0), 2951);
  assert.equal(result.items.reduce((n, i) => n + Math.round(i.itemTax * 100), 0), 201);
});

test("weighted items are not split into whole units; duplicate lines keep their order", () => {
  const result = reconcileReceipt(reading([
    line("Mangga", 0.325, 2.6), line("Susu", 1, 7), line("Susu", 1, 7), line("Beg", 1, 0),
  ], 16.6));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.items.map(i => [i.name, i.price]), [["Mangga (×0.325)", 2.6], ["Susu", 7], ["Susu", 7], ["Beg", 0]]);
});

test("a unit-only amount is rounded after multiplying the quantity", () => {
  const result = reconcileReceipt(reading([line("By weight", 0.5, null, 20.15)], 10.08));
  assert.deepEqual(result.warnings, []);
  assert.equal(result.items[0].price, 10.08);
});

test("unreadable rows and inconsistent totals never become allocated charges", () => {
  const result = reconcileReceipt(reading([line("Set lunch", 1, 10), line("Side", 1, null)], 12, [0.6]));
  assert.equal(result.items[0].price, 10);
  assert.equal(result.items.length, 1);
  assert.match(result.warnings.join(" "), /missing.*10\.60.*12\.00.*not added/);
});

test("a missing printed total retains items for review, and payment-only slips don't invent any", () => {
  const partial = reconcileReceipt(reading([line("Set lunch", 1, 10)], null));
  const totalOnly = reconcileReceipt(reading([], 10));
  assert.equal(partial.items.length, 1);
  assert.match(partial.warnings[0], /printed total couldn/);
  assert.deepEqual(totalOnly.items, []);
  assert.match(totalOnly.warnings[0], /Printed total: 10\.00/);
});

test("the scan uses structured image output and retries an unbalanced reading once", async () => {
  const requests = [];
  const result = await scanReceipt(photo, { accessToken: "user-token" }, async (_, { body }) => {
    requests.push(JSON.parse(body));
    return requests.length === 1 ?
      response(reading([line("Roti", 1, 4)], 4, [0.24])) :
      response(reading([line("Roti", 1, 4)], 4));
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests, [{ image: photo, retry: false }, { image: photo, retry: true }]);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.items[0].price, 4);
});

test("clipped responses are retried rather than silently accepting a partial object", async () => {
  let calls = 0;
  const result = await scanReceipt(photo, { accessToken: "user-token" }, async () => ++calls === 1 ?
    response(reading([line("Partial scan", 1, 1)], 1), "length") :
    response(reading([line("Complete scan", 1, 2)], 2)));
  assert.equal(calls, 2);
  assert.equal(result.items[0].name, "Complete scan");
});

test("a failed retry keeps the first reading marked for review", async () => {
  let calls = 0;
  const result = await scanReceipt(photo, { accessToken: "user-token" }, async () => ++calls === 1 ?
    response(reading([line("Set lunch", 1, 10)], 15)) : new Response(null, { status: 503 }));
  assert.equal(calls, 2);
  assert.equal(result.items[0].price, 10);
  assert.match(result.warnings[0], /doesn't match/);
});

test("a bad receipt doesn't stop later scans or erase previously extracted items", async () => {
  const receipts = ["a", "b", "c"].map(id => ({ id, img: id }));
  const result = await scanReceiptBatch(receipts, async (image) => {
    if (image === "b") throw new Error("Please retake the photo.");
    return reconcileReceipt(reading([line(image.toUpperCase(), 1, 5)], 5));
  });
  assert.deepEqual(result.items.map(i => [i.receiptId, i.id, i.price]), [["a", 1, 5], ["c", 2, 5]]);
  assert.deepEqual(result.warnings, [{ receiptId: "b", message: "Please retake the photo." }]);
});
