// Pure helpers for the Tesseract pre-scan step. Kept free of the heavy
// tesseract.js import so the review UI can reuse the copy without pulling the
// OCR engine into the initial household bundle.

export const MIN_WORDS = 8;
export const LOW_CONFIDENCE = 55;

/**
 * Snap an OSD angle to the nearest quarter turn.
 * @param {number} degrees
 */
export function snapOrientationDegrees(degrees) {
  const n = ((Math.round(Number(degrees) || 0) % 360) + 360) % 360;
  return (Math.round(n / 90) * 90) % 360;
}

/**
 * OSD reports how far the page is rotated from upright. Return the canvas
 * rotation that puts text upright again.
 */
export function correctionDegreesFromOsd(orientationDegrees) {
  const snapped = snapOrientationDegrees(orientationDegrees);
  return (360 - snapped) % 360;
}

/**
 * Turn raw OCR word stats into soft warnings for the review UI.
 */
export function assessTextQuality({ words = [], text = "" } = {}) {
  const confidences = (words || [])
    .map((w) => Number(w?.confidence))
    .filter((c) => Number.isFinite(c));
  const meanConfidence = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;
  const wordCount =
    confidences.length ||
    (String(text || "").trim() ? String(text).trim().split(/\s+/).length : 0);

  const warnings = [];
  if (wordCount < MIN_WORDS) warnings.push("little_text");
  if (meanConfidence > 0 && meanConfidence < LOW_CONFIDENCE) {
    warnings.push("low_confidence");
  }

  return {
    meanConfidence: Math.round(meanConfidence * 10) / 10,
    wordCount,
    warnings,
    ok: warnings.length === 0,
  };
}

export function prepWarningMessage(code) {
  switch (code) {
    case "little_text":
      return "Not much readable text was found. Flatten the receipt and fill the frame.";
    case "low_confidence":
      return "The photo looks soft or glare-heavy. A clearer shot will read more accurately.";
    case "rotated":
      return "The photo looked sideways and was rotated before scanning.";
    default:
      return "The photo may be hard to read. Check the numbers on the next screen.";
  }
}
