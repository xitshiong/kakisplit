// Tesseract.js as a pre-scan helper for household receipts.
//
// Role: orientation + photo quality only. It does NOT extract totals or line
// items — that stays with the vision-model pipeline in ocr.js. If Tesseract
// fails to load or times out, scanning continues with the original photo.

import {
  assessTextQuality,
  correctionDegreesFromOsd,
  snapOrientationDegrees,
} from "./receiptPrepCore.js";

export {
  assessTextQuality,
  correctionDegreesFromOsd,
  prepWarningMessage,
  snapOrientationDegrees,
} from "./receiptPrepCore.js";

const JPEG_QUALITY = 0.92;
const ORIENT_CONFIDENCE_MIN = 1.2;
const PREP_TIMEOUT_MS = 25000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out.`)), ms)
    ),
  ]);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't decode the receipt photo."));
    img.src = dataUrl;
  });
}

/** Rotate a data-URL image by 0/90/180/270 degrees clockwise. */
export async function rotateDataUrl(dataUrl, degrees) {
  const turn = snapOrientationDegrees(degrees);
  if (!turn) {
    return null;
  }

  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const swap = turn % 180 !== 0;
  canvas.width = swap ? img.height : img.width;
  canvas.height = swap ? img.width : img.height;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  const next = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return {
    dataUrl: next,
    b64: next.split(",")[1],
    width: canvas.width,
    height: canvas.height,
    rotatedBy: turn,
  };
}

async function createPrepWorker() {
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    // OSD (detect) needs the legacy model packaged alongside LSTM.
    legacyCore: true,
    legacyLang: true,
    logger: () => {},
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    user_defined_dpi: "300",
    preserve_interword_spaces: "1",
  });
  return worker;
}

function wordsFromBlocks(blocks) {
  const words = [];
  for (const block of blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const word of line.words || []) {
          words.push({
            text: word.text,
            confidence: word.confidence,
          });
        }
      }
    }
  }
  return words;
}

/**
 * Orient one receipt photo and score how readable it looks.
 * Fail-soft: callers should catch and keep the original part.
 *
 * @param {{ dataUrl: string, b64: string, width?: number, height?: number }} part
 */
export async function prepareReceiptPart(part) {
  if (!part?.dataUrl && !part?.b64) {
    throw new Error("No receipt image to prepare.");
  }

  const sourceDataUrl =
    part.dataUrl || `data:image/jpeg;base64,${part.b64}`;

  const worker = await withTimeout(
    createPrepWorker(),
    PREP_TIMEOUT_MS,
    "Photo check"
  );

  try {
    let dataUrl = sourceDataUrl;
    let b64 = part.b64 || sourceDataUrl.split(",")[1];
    let width = part.width || null;
    let height = part.height || null;
    let rotatedBy = 0;
    const warnings = [];

    // 1) Orientation
    try {
      const { data: osd } = await withTimeout(
        worker.detect(dataUrl),
        PREP_TIMEOUT_MS,
        "Orientation check"
      );
      const orientDeg = snapOrientationDegrees(osd?.orientation_degrees);
      const orientConf = Number(osd?.orientation_confidence) || 0;
      if (orientDeg && orientConf >= ORIENT_CONFIDENCE_MIN) {
        const correction = correctionDegreesFromOsd(orientDeg);
        const rotated = await rotateDataUrl(dataUrl, correction);
        if (rotated) {
          dataUrl = rotated.dataUrl;
          b64 = rotated.b64;
          width = rotated.width;
          height = rotated.height;
          rotatedBy = rotated.rotatedBy;
          warnings.push("rotated");
        }
      }
    } catch {
      // Orientation is best-effort; continue with the original frame.
    }

    // 2) Quality probe — confidence only, never used as money source.
    let quality = {
      meanConfidence: 0,
      wordCount: 0,
      warnings: ["little_text"],
      ok: false,
    };
    try {
      const { data } = await withTimeout(
        worker.recognize(dataUrl, {}, { text: true, blocks: true }),
        PREP_TIMEOUT_MS,
        "Quality check"
      );
      quality = assessTextQuality({
        words: wordsFromBlocks(data?.blocks),
        text: data?.text || "",
      });
    } catch {
      // Keep going; Gemini still reads the photo.
    }

    for (const code of quality.warnings) {
      if (!warnings.includes(code)) warnings.push(code);
    }

    return {
      ...part,
      dataUrl,
      b64,
      width: width ?? part.width,
      height: height ?? part.height,
      prep: {
        engine: "tesseract.js",
        rotatedBy,
        meanConfidence: quality.meanConfidence,
        wordCount: quality.wordCount,
        warnings,
        ok: quality.ok,
      },
    };
  } finally {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Prepare every part. Never throws for a single bad prep — originals are kept.
 */
export async function prepareReceiptParts(parts, { onProgress = () => {} } = {}) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    onProgress(
      "preparing",
      parts.length > 1
        ? `Checking photo ${i + 1} of ${parts.length}`
        : "Checking photo quality"
    );
    try {
      out.push(await prepareReceiptPart(parts[i]));
    } catch {
      out.push({
        ...parts[i],
        prep: {
          engine: "tesseract.js",
          skipped: true,
          rotatedBy: 0,
          meanConfidence: 0,
          wordCount: 0,
          warnings: [],
          ok: true,
        },
      });
    }
  }
  return out;
}
