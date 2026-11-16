// Run with: node src/household/lib/receiptPrep.test.mjs

import assert from "node:assert/strict";
import {
  assessTextQuality,
  correctionDegreesFromOsd,
  prepWarningMessage,
  snapOrientationDegrees,
} from "./receiptPrepCore.js";

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

test("snaps OSD angles to quarter turns", () => {
  assert.equal(snapOrientationDegrees(0), 0);
  assert.equal(snapOrientationDegrees(88), 90);
  assert.equal(snapOrientationDegrees(179), 180);
  assert.equal(snapOrientationDegrees(-90), 270);
});

test("converts OSD orientation into a corrective rotation", () => {
  assert.equal(correctionDegreesFromOsd(0), 0);
  assert.equal(correctionDegreesFromOsd(90), 270);
  assert.equal(correctionDegreesFromOsd(180), 180);
  assert.equal(correctionDegreesFromOsd(270), 90);
});

test("flags sparse or low-confidence text without inventing money", () => {
  const sparse = assessTextQuality({ words: [{ confidence: 90 }], text: "TAX" });
  assert.equal(sparse.ok, false);
  assert.ok(sparse.warnings.includes("little_text"));

  const blurry = assessTextQuality({
    words: [
      { confidence: 40 },
      { confidence: 42 },
      { confidence: 38 },
      { confidence: 41 },
      { confidence: 39 },
      { confidence: 40 },
      { confidence: 42 },
      { confidence: 41 },
    ],
  });
  assert.equal(blurry.ok, false);
  assert.ok(blurry.warnings.includes("low_confidence"));

  const clear = assessTextQuality({
    words: Array.from({ length: 12 }, () => ({ confidence: 92 })),
    text: "Seafood Silken Tofu Soup 20.00",
  });
  assert.equal(clear.ok, true);
  assert.deepEqual(clear.warnings, []);
});

test("maps prep codes to user-facing copy", () => {
  assert.match(prepWarningMessage("little_text"), /Flatten the receipt/i);
  assert.match(prepWarningMessage("low_confidence"), /clearer shot/i);
  assert.match(prepWarningMessage("rotated"), /rotated/i);
});

console.log(`${passed} checks passed`);
