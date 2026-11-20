import assert from "node:assert/strict";
import test from "node:test";
import { prepareQrForSave, readPaymentQr } from "./paymentQr.mjs";

const imageFile = new Blob([], { type: "image/png" });
const oversized = `data:image/png;base64,${"A".repeat(80_000)}`;

function mockCanvas(t, { width = 960, height = 840, decodeError, encode }) {
  const attempts = [];
  const decoded = [];
  const revoked = [];
  let drawing = [];
  const context = {
    fillRect(...args) { drawing.push(["fill", this.fillStyle, ...args]); },
    drawImage(_image, ...args) { drawing.push(["draw", ...args]); }
  };
  const canvas = {
    getContext: () => context,
    get width() { return this.bitmapWidth; },
    set width(value) {
      this.bitmapWidth = value;
      drawing = [];
    },
    toDataURL(type, quality) {
      const attempt = { type, quality, width: this.bitmapWidth, height: this.height };
      attempts.push({ ...attempt, drawing: [...drawing] });
      return encode(attempt);
    }
  };

  t.mock.method(URL, "createObjectURL", () => "blob:qr");
  t.mock.method(URL, "revokeObjectURL", source => revoked.push(source));
  globalThis.Image = class {
    naturalWidth = width;
    naturalHeight = height;
    async decode() {
      decoded.push(this.src);
      if (decodeError) throw decodeError;
    }
  };
  globalThis.document = { createElement: () => canvas };
  t.after(() => {
    delete globalThis.Image;
    delete globalThis.document;
  });
  return { attempts, decoded, revoked };
}

test("uploads a sharp, lossless QR on white and saves it without another encode", async t => {
  const png = `data:image/png;base64,${"A".repeat(80_000 - "data:image/png;base64,".length)}`;
  const { attempts, decoded, revoked } = mockCanvas(t, { encode: () => png });

  const uploaded = await readPaymentQr(imageFile);
  assert.equal(uploaded, png);
  assert.equal(await prepareQrForSave(uploaded), uploaded);
  assert.deepEqual(decoded, ["blob:qr"]);
  assert.deepEqual(revoked, ["blob:qr"]);
  assert.deepEqual(attempts, [{
    type: "image/png", quality: undefined, width: 960, height: 840,
    drawing: [["fill", "#fff", 0, 0, 960, 840], ["draw", 0, 0, 960, 840]]
  }]);
});

test("uses high-quality JPEG before dropping resolution", async t => {
  const jpeg = "data:image/jpeg;base64,AAAA";
  const { attempts } = mockCanvas(t, {
    width: 1080, height: 2400,
    encode: ({ type }) => type === "image/png" ? oversized : jpeg
  });
  assert.equal(await readPaymentQr(imageFile), jpeg);
  assert.deepEqual(attempts.map(({ type, quality, width, height }) => [type, quality, width, height]), [
    ["image/png", undefined, 461, 1024],
    ["image/jpeg", 0.9, 461, 1024]
  ]);
});

test("fits a legacy data URL to the size budget while preserving aspect ratio", async t => {
  const png = "data:image/png;base64,AAAA";
  const { attempts, decoded } = mockCanvas(t, {
    encode: ({ width }) => width > 576 ? oversized : png
  });
  assert.equal(await prepareQrForSave(oversized), png);
  assert.deepEqual(decoded, [oversized]);
  assert.deepEqual(attempts.map(({ width, height }) => [width, height]), [
    [960, 840], [960, 840], [768, 672], [768, 672], [576, 504]
  ]);
});

test("does not re-encode hosted QRs or enlarge small uploads", async t => {
  const png = "data:image/png;base64,AAAA";
  const { attempts, decoded } = mockCanvas(t, { width: 180, height: 190, encode: () => png });
  const url = "https://example.com/payment.png";
  assert.equal(await prepareQrForSave(url), url);
  assert.equal(await prepareQrForSave(null), null);
  assert.deepEqual(decoded, []);
  assert.equal(await readPaymentQr(imageFile), png);
  assert.deepEqual(attempts.map(({ width, height }) => [width, height]), [[180, 190]]);
});

test("rejects an image that cannot fit without shrinking below the minimum", async t => {
  const { attempts, revoked } = mockCanvas(t, { encode: () => oversized });
  await assert.rejects(readPaymentQr(imageFile), /Crop the image/);
  assert.equal(attempts.at(-1).width, 400);
  assert.deepEqual(revoked, ["blob:qr"]);
});

test("cleans up the upload after a decode failure", async t => {
  const { attempts, revoked } = mockCanvas(t, { decodeError: new Error("invalid image") });
  await assert.rejects(readPaymentQr(imageFile), /invalid image/);
  assert.deepEqual(attempts, []);
  assert.deepEqual(revoked, ["blob:qr"]);
});
