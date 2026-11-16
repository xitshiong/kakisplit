// Receipt reading pipeline for KakiSplit Household.
//
// A single vision-model pass over a 50-line grocery receipt is not
// trustworthy enough to charge housemates real money, and worse, when it is
// wrong it is wrong silently. So this pipeline is built so that correctness
// can be *demonstrated* rather than assumed:
//
//   1. EXTRACT   Two different models (different vendors, so their mistakes
//                are uncorrelated) each read the receipt independently.
//   2. ALIGN     Their line items are aligned and compared field by field.
//                Any disagreement marks that specific line for review.
//   3. VERIFY    Both readings are checked against arithmetic the receipt
//                itself prints: line totals + tax - discounts must equal the
//                grand total, and the item count must match the receipt's own
//                counter when it prints one.
//   4. REPAIR    If neither reading balances, a third pass shows a model the
//                discrepancy and asks it to find the specific error.
//   5. BAKE      Tax and discounts are allocated across items in integer
//                cents so item totals sum to the grand total exactly.
//
// A scan is only labelled "verified" when the models agreed AND the money
// balances. Everything else surfaces in the review UI with the exact lines to
// check, which is a far more useful guarantee than a confident guess.

import { toCents } from "./money.js";
import { extractionPrompt, repairPrompt } from "./prompts.js";

// Reading a receipt wrong costs more than the few cents of inference, so the
// defaults here are accuracy-first. Override per deployment if you want.
// Optional chaining so this module can also be imported by the Node test run,
// where import.meta.env doesn't exist.
export const MODELS = {
  primary: import.meta.env?.VITE_HH_OCR_PRIMARY || "google/gemini-3.1-pro-preview",
  auditor: import.meta.env?.VITE_HH_OCR_AUDITOR || "anthropic/claude-sonnet-5",
  fallback: import.meta.env?.VITE_HH_OCR_FALLBACK || "google/gemini-3.6-flash",
};

const OCR_PROXY = "/api/ocr";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CENT_TOLERANCE = 2;

let proxyAvailable = null; // null = untested, false = fall back to direct calls

// ── IMAGE PREPARATION ─────────────────────────────────────────
// Receipts are tall and thin, and detail lives in small print. Downscaling to
// a square-ish bounding box (as the /app splitter does) destroys exactly the
// digits we care about, so height is allowed to run long.
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 4400;
const JPEG_QUALITY = 0.92;

export function prepareImage(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) {
      reject(new Error("That file is not an image."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't decode that image."));
      img.onload = () => {
        const scale = Math.min(
          1,
          MAX_WIDTH / img.width,
          MAX_HEIGHT / img.height
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));

        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve({
          dataUrl,
          b64: dataUrl.split(",")[1],
          width: canvas.width,
          height: canvas.height,
          preview: URL.createObjectURL(file),
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/** A small copy of the receipt to store alongside the expense, for reference. */
export function thumbnail(dataUrl, max = 900) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = dataUrl;
  });
}

// ── JSON RECOVERY ─────────────────────────────────────────────
// Vision models occasionally emit unescaped control characters inside strings
// or get cut off mid-object. Both are recoverable.

function escapeControlChars(s) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (inString && ch === "\\") { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
    }
    out += ch;
  }
  return out;
}

function closeStructures(input) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const ch of input) {
    if (escaped) { escaped = false; continue; }
    if (inString && ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if ((ch === "}" || ch === "]") && stack[stack.length - 1] === ch) stack.pop();
  }
  return (inString ? input + '"' : input) + stack.reverse().join("");
}

export function parseModelJson(text) {
  const cleaned = text.replace(/```json\s*|```/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* fall through */ }

  const start = cleaned.indexOf("{");
  if (start < 0) throw new Error("The reader didn't return any receipt data.");
  const body = escapeControlChars(cleaned.slice(start));

  const attempts = [body.replace(/,\s*$/, "")];
  // A response cut off mid-item leaves a partial trailing object; dropping it
  // salvages every complete line before the cut.
  const lastItem = attempts[0].lastIndexOf(",{");
  if (lastItem > 0) attempts.push(attempts[0].slice(0, lastItem));

  let lastError;
  for (const attempt of attempts) {
    try {
      return JSON.parse(closeStructures(attempt));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Couldn't parse the receipt data.");
}

// ── MODEL CALLS ───────────────────────────────────────────────

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out. Check your connection.`)), ms)
    ),
  ]);
}

function buildMessages(prompt, images) {
  // OpenRouter recommends text before images.
  return [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...images.map((b64) => ({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${b64}` },
        })),
      ],
    },
  ];
}

function extractText(data) {
  if (data?.error) {
    throw new Error(data.error.message || String(data.error));
  }
  const choice = data?.choices?.[0];
  const text = choice?.message?.content?.trim();
  if (!text) throw new Error("The reader returned an empty response.");
  return {
    text,
    finishReason: choice?.finish_reason || choice?.native_finish_reason || "",
  };
}

async function callModel({ model, prompt, images, maxTokens = 32000, timeout = 120000 }) {
  const payload = {
    model,
    messages: buildMessages(prompt, images),
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    reasoning: { exclude: true },
  };

  // Prefer the serverless proxy so the API key stays server-side. Fall back to
  // a direct browser call (dev, or a static deploy without functions).
  if (proxyAvailable !== false) {
    try {
      const res = await withTimeout(
        fetch(OCR_PROXY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        timeout,
        "Receipt scan"
      );
      if (res.ok) {
        proxyAvailable = true;
        return extractText(await res.json());
      }
      // 404/501: not deployed or not configured. 502/504: the function exists
      // but timed out, which a long two-model scan can do on short function
      // limits — the browser has no such limit, so retry directly.
      if ([404, 501, 502, 504].includes(res.status)) {
        proxyAvailable = false;
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || `Scan failed (${res.status}).`);
      }
    } catch (e) {
      if (proxyAvailable === true) throw e;
      proxyAvailable = false;
    }
  }

  const key = import.meta.env?.VITE_OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "Receipt scanning isn't configured. Set OPENROUTER_API_KEY on the server, or VITE_OPENROUTER_API_KEY for local development."
    );
  }
  const res = await withTimeout(
    fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    }),
    timeout,
    "Receipt scan"
  );
  const data = await res.json();
  if (!res.ok && !data?.error) throw new Error(`Scan failed (${res.status}).`);
  return extractText(data);
}

async function readWith(model, prompt, images) {
  const { text, finishReason } = await callModel({ model, prompt, images });
  try {
    return parseModelJson(text);
  } catch (e) {
    if (finishReason === "length") {
      throw new Error(
        "The receipt was too long to read in one go. Try splitting it into two photos."
      );
    }
    throw e;
  }
}

// ── NORMALISATION ─────────────────────────────────────────────

function normaliseItem(raw, index) {
  const qty = Number(raw?.qty);
  const lineCents = toCents(raw?.lineTotal ?? raw?.price ?? 0);
  const unitCents = toCents(raw?.unitPrice ?? raw?.price ?? 0);
  return {
    lineNo: Number.isFinite(Number(raw?.lineNo)) ? Number(raw.lineNo) : index + 1,
    name: String(raw?.name ?? "").trim().replace(/\s+/g, " ") || "Item",
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unit: raw?.unit || "ea",
    unitCents: unitCents || lineCents,
    lineCents,
    taxCode: raw?.taxCode || "",
    category: raw?.category || "other",
    confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw.confidence) : 1,
    uncertain: Array.isArray(raw?.uncertain) ? raw.uncertain : [],
  };
}

function normaliseReading(raw) {
  const items = (raw?.items || []).map(normaliseItem).filter((i) => i.name);
  const adjustments = (raw?.adjustments || []).map((a, i) => ({
    lineNo: Number(a?.lineNo) || 0,
    label: String(a?.label ?? "Adjustment").trim() || "Adjustment",
    cents: toCents(a?.amount),
    appliesToLineNo: Number.isFinite(Number(a?.appliesToLineNo))
      ? Number(a.appliesToLineNo)
      : null,
    index: i,
  }));

  const num = (v) => (v === null || v === undefined ? null : toCents(v));

  return {
    merchant: raw?.merchant || null,
    storeLocation: raw?.storeLocation || null,
    receiptDate: /^\d{4}-\d{2}-\d{2}$/.test(raw?.receiptDate || "") ? raw.receiptDate : null,
    currency: raw?.currency || null,
    // Explicit "Includes TAX" wording overrides an inferred tax mode.
    taxMode: raw?.taxIncluded === true
      ? "inclusive"
      : ["inclusive", "exclusive", "none"].includes(raw?.taxMode)
      ? raw.taxMode
      : "inclusive",
    taxIncluded:
      raw?.taxIncluded === true ? true : raw?.taxIncluded === false ? false : null,
    totalLabel: raw?.totalLabel ? String(raw.totalLabel).trim() : null,
    items,
    adjustments,
    subtotalCents: num(raw?.subtotal),
    taxCents: Math.abs(num(raw?.tax) ?? 0),
    serviceCents: Math.abs(num(raw?.serviceCharge) ?? 0),
    discountCents: Math.abs(num(raw?.discount) ?? 0),
    roundingCents: num(raw?.rounding) ?? 0,
    grandTotalCents: num(raw?.grandTotal),
    printedItemCount: Number.isFinite(Number(raw?.printedItemCount))
      ? Number(raw.printedItemCount)
      : null,
    paymentMethod: raw?.paymentMethod || null,
    totalsVisible: raw?.totalsVisible !== false,
    unreadable: Array.isArray(raw?.unreadable) ? raw.unreadable : [],
  };
}

/** Stitch the per-photo readings of one long receipt back into a single one. */
function mergeParts(parts) {
  const merged = {
    ...parts[0],
    items: [],
    adjustments: [],
    unreadable: [],
  };

  let offset = 0;
  for (const part of parts) {
    for (const item of part.items) {
      merged.items.push({ ...item, lineNo: item.lineNo + offset });
    }
    for (const adj of part.adjustments) {
      merged.adjustments.push({
        ...adj,
        lineNo: adj.lineNo + offset,
        appliesToLineNo:
          adj.appliesToLineNo === null ? null : adj.appliesToLineNo + offset,
      });
    }
    merged.unreadable.push(...part.unreadable);
    offset += part.items.length + part.adjustments.length;
  }

  // Totals are printed once, at the foot of the receipt.
  const withTotals = parts.filter((p) => p.grandTotalCents !== null);
  const source = withTotals[withTotals.length - 1];
  if (source) {
    merged.subtotalCents = source.subtotalCents;
    merged.taxCents = source.taxCents;
    merged.serviceCents = source.serviceCents;
    merged.discountCents = source.discountCents;
    merged.roundingCents = source.roundingCents;
    merged.grandTotalCents = source.grandTotalCents;
    merged.printedItemCount = source.printedItemCount;
    merged.taxMode = source.taxMode;
    merged.taxIncluded = source.taxIncluded;
    merged.totalLabel = source.totalLabel;
    merged.totalsVisible = true;
  } else {
    merged.grandTotalCents = null;
    merged.totalsVisible = false;
  }

  merged.merchant = parts.find((p) => p.merchant)?.merchant || null;
  merged.receiptDate = parts.find((p) => p.receiptDate)?.receiptDate || null;
  merged.currency = parts.find((p) => p.currency)?.currency || null;

  return merged;
}

// ── COMPARING TWO READINGS ────────────────────────────────────

function normaliseName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function similarity(a, b) {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;

  // Normalised Levenshtein, single-row implementation.
  const prev = new Array(y.length + 1);
  for (let j = 0; j <= y.length; j++) prev[j] = j;
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (x[i - 1] === y[j - 1] ? 0 : 1)
      );
      diag = temp;
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

function pairScore(a, b) {
  const nameScore = similarity(a.name, b.name);
  const priceScore = a.lineCents === b.lineCents ? 1 : 0;
  return 0.55 * nameScore + 0.45 * priceScore;
}

/**
 * Needleman-Wunsch alignment of two item lists.
 *
 * A plain index-by-index comparison breaks down the moment one model misses a
 * line: every subsequent row then looks like a mismatch. Aligning with gaps
 * isolates the actual disagreement to the one line it belongs to.
 */
function alignItems(left, right) {
  const GAP = -0.45;
  const n = left.length;
  const m = right.length;

  const score = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) score[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) score[0][j] = j * GAP;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      score[i][j] = Math.max(
        score[i - 1][j - 1] + pairScore(left[i - 1], right[j - 1]),
        score[i - 1][j] + GAP,
        score[i][j - 1] + GAP
      );
    }
  }

  const pairs = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (
      i > 0 && j > 0 &&
      score[i][j] === score[i - 1][j - 1] + pairScore(left[i - 1], right[j - 1])
    ) {
      pairs.push({ left: left[i - 1], right: right[j - 1] });
      i--; j--;
    } else if (i > 0 && score[i][j] === score[i - 1][j] + GAP) {
      pairs.push({ left: left[i - 1], right: null });
      i--;
    } else {
      pairs.push({ left: null, right: right[j - 1] });
      j--;
    }
  }
  return pairs.reverse();
}

/**
 * Check a reading against the arithmetic the receipt itself prints.
 * This is the part that makes an error detectable rather than invisible.
 */
export function verifyArithmetic(reading) {
  const problems = [];

  const itemSum = reading.items.reduce((s, i) => s + i.lineCents, 0);
  const adjustmentSum = reading.adjustments.reduce((s, a) => s + a.cents, 0);
  const lineSum = itemSum + adjustmentSum;

  // Inclusive tax is already inside the printed line totals; adding it again
  // would double-count it.
  const taxToAdd = reading.taxMode === "exclusive" ? reading.taxCents : 0;
  const expected =
    lineSum +
    taxToAdd +
    reading.serviceCents -
    reading.discountCents +
    reading.roundingCents;

  if (reading.grandTotalCents === null) {
    problems.push({
      severity: "error",
      code: "no_total",
      message: "No grand total was visible, so the scan can't be checked against the receipt.",
    });
    return { lineSum, expected, deltaCents: 0, balanced: false, problems };
  }

  const delta = reading.grandTotalCents - expected;
  const balanced = Math.abs(delta) <= CENT_TOLERANCE;

  if (!balanced) {
    problems.push({
      severity: "error",
      code: "unbalanced",
      deltaCents: delta,
      message:
        delta > 0
          ? "The items add up to less than the receipt total. A line was probably missed."
          : "The items add up to more than the receipt total. A line was probably doubled or misread.",
    });
  }

  if (
    reading.printedItemCount !== null &&
    reading.printedItemCount !== reading.items.length
  ) {
    problems.push({
      severity: "warn",
      code: "count_mismatch",
      message: `The receipt says ${reading.printedItemCount} items but ${reading.items.length} were read.`,
    });
  }

  for (const item of reading.items) {
    const implied = Math.round(item.qty * item.unitCents);
    if (Math.abs(implied - item.lineCents) > CENT_TOLERANCE) {
      problems.push({
        severity: "warn",
        code: "line_math",
        lineNo: item.lineNo,
        message: `"${item.name}": quantity times unit price doesn't match the line total.`,
      });
    }
  }

  for (const note of reading.unreadable) {
    problems.push({ severity: "warn", code: "unreadable", message: String(note) });
  }

  return { lineSum, expected, deltaCents: delta, balanced, problems };
}

/**
 * Merge two independent readings into one, marking every line the two models
 * disagreed about. Where they differ, the reading that balances arithmetically
 * wins; if both balance, the primary model wins but the line is still flagged.
 */
function reconcile(primary, auditor, primaryCheck, auditorCheck) {
  // Explicit included-tax wording is stronger evidence than a model-inferred
  // mode. Prefer that reading even if both readings happen to balance.
  const taxBase = auditor.taxIncluded === true
    ? auditor
    : primary.taxIncluded === true
    ? primary
    : null;
  const trustPrimary = primaryCheck.balanced || !auditorCheck.balanced;
  const base = taxBase || (trustPrimary ? primary : auditor);
  const other = base === primary ? auditor : primary;

  const pairs = alignItems(base.items, other.items);
  const items = [];
  let agreements = 0;

  for (const { left, right } of pairs) {
    if (left && right) {
      const flags = [];
      if (left.lineCents !== right.lineCents) flags.push("price");
      if (similarity(left.name, right.name) < 0.85) flags.push("name");
      if (Math.abs(left.qty - right.qty) > 0.001) flags.push("qty");

      if (flags.length === 0) agreements++;
      items.push({
        ...left,
        confidence: flags.length ? Math.min(left.confidence, 0.6) : left.confidence,
        flags: [...new Set([...left.uncertain, ...flags])],
        alternative: flags.length
          ? { name: right.name, lineCents: right.lineCents, qty: right.qty }
          : null,
      });
    } else if (left) {
      // Only the trusted reading saw this line.
      items.push({
        ...left,
        confidence: Math.min(left.confidence, 0.5),
        flags: [...new Set([...left.uncertain, "only_one_reader"])],
        alternative: null,
      });
    } else if (right) {
      // Only the other reading saw it. Keep it — a missing line is the more
      // expensive error — but flag it clearly.
      items.push({
        ...right,
        confidence: Math.min(right.confidence, 0.5),
        flags: [...new Set([...right.uncertain, "only_one_reader"])],
        alternative: null,
      });
    }
  }

  items.sort((a, b) => a.lineNo - b.lineNo);
  items.forEach((item, i) => { item.lineNo = i + 1; });

  const comparable = Math.max(base.items.length, other.items.length) || 1;
  return {
    reading: { ...base, items },
    agreementRate: agreements / comparable,
  };
}

// ── FINAL ASSEMBLY ────────────────────────────────────────────

/**
 * Fold adjustments into the items they modify, and allocate everything left
 * over (tax, store-wide discounts, rounding) proportionally across the items,
 * in integer cents, so the item totals sum to the grand total exactly.
 */
function bakeItems(reading) {
  const items = reading.items.map((item) => ({ ...item, adjustmentCents: 0, adjustmentLabels: [] }));
  const byLineNo = new Map(items.map((i) => [i.lineNo, i]));

  let unattached = 0;
  for (const adj of reading.adjustments) {
    const target = adj.appliesToLineNo !== null ? byLineNo.get(adj.appliesToLineNo) : null;
    if (target) {
      target.adjustmentCents += adj.cents;
      target.adjustmentLabels.push(adj.label);
    } else {
      unattached += adj.cents;
    }
  }

  const adjusted = items.map((i) => ({ ...i, netCents: i.lineCents + i.adjustmentCents }));
  const netSum = adjusted.reduce((s, i) => s + i.netCents, 0);

  const total =
    reading.grandTotalCents !== null
      ? reading.grandTotalCents
      : netSum + unattached + reading.taxCents + reading.serviceCents - reading.discountCents;

  // Everything the line items don't already account for — tax when it's added
  // at the till, service charge, store-wide discounts, rounding, and any
  // unattached adjustment — spread across items by value.
  const extras = total - netSum;
  const weights = adjusted.map((i) => Math.max(0, i.netCents));
  const allocation = allocateCents(extras, weights);

  return {
    total,
    items: adjusted.map((item, idx) => ({
      lineNo: item.lineNo,
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      unitCents: item.unitCents,
      lineCents: item.netCents,
      extrasCents: allocation[idx],
      totalCents: item.netCents + allocation[idx],
      category: item.category,
      confidence: item.confidence,
      flags: item.flags || [],
      alternative: item.alternative || null,
      adjustmentLabels: item.adjustmentLabels,
      memberIds: [],
    })),
  };
}

// Local copy so this module has no circular dependency on money.js internals.
function allocateCents(total, weights) {
  const n = weights.length;
  if (n === 0) return [];
  const sign = total < 0 ? -1 : 1;
  const amount = Math.abs(Math.round(total));
  let w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  let sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) { w = new Array(n).fill(1); sum = n; }
  const exact = w.map((x) => (amount * x) / sum);
  const out = exact.map(Math.floor);
  const remainder = amount - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e), weight: w[i] }))
    .sort((a, b) => b.frac - a.frac || b.weight - a.weight || a.i - b.i);
  for (let k = 0; k < remainder; k++) out[order[k % n].i] += 1;
  return out.map((x) => x * sign);
}

// ── ORCHESTRATION ─────────────────────────────────────────────

/**
 * Read a receipt from one or more photos.
 *
 * @param {Array<{b64: string}>} parts  photos of ONE receipt, top to bottom
 * @param {(stage: string, detail?: string) => void} onProgress
 */
export async function scanReceipt(parts, { onProgress = () => {} } = {}) {
  if (!parts?.length) throw new Error("Add a photo of the receipt first.");

  // Local OCR only orients the photo and scores readability. Extraction and
  // money still come from the vision models below.
  onProgress("preparing", "Checking photo quality");
  const { prepareReceiptParts } = await import("./receiptPrep.js");
  const preparedParts = await prepareReceiptParts(parts, { onProgress });
  const images = preparedParts.map((p) => p.b64);
  const prepReports = preparedParts.map((p) => p.prep || null);

  const readAllParts = async (model) => {
    const readings = [];
    for (let i = 0; i < images.length; i++) {
      const raw = await readWith(
        model,
        extractionPrompt({ partIndex: i + 1, partCount: images.length }),
        [images[i]]
      );
      readings.push(normaliseReading(raw));
    }
    return mergeParts(readings);
  };

  // Pass 1 and 2: two vendors read the receipt without seeing each other's work.
  onProgress("reading", "Reading every line");
  let primary;
  let usedPrimary = MODELS.primary;
  try {
    primary = await readAllParts(MODELS.primary);
  } catch (e) {
    if (MODELS.fallback && MODELS.fallback !== MODELS.primary) {
      usedPrimary = MODELS.fallback;
      primary = await readAllParts(MODELS.fallback);
    } else {
      throw e;
    }
  }

  onProgress("cross-checking", "Second reader double-checking");
  let auditor = null;
  let usedAuditor = MODELS.auditor;
  try {
    auditor = await readAllParts(MODELS.auditor);
  } catch {
    usedAuditor = null; // Cross-check unavailable; arithmetic check still applies.
  }

  onProgress("verifying", "Checking the maths");
  let primaryCheck = verifyArithmetic(primary);
  let reading = primary;
  let agreementRate = null;

  if (auditor) {
    const auditorCheck = verifyArithmetic(auditor);
    const merged = reconcile(primary, auditor, primaryCheck, auditorCheck);
    reading = merged.reading;
    agreementRate = merged.agreementRate;
    primaryCheck = verifyArithmetic(reading);
  }

  // Pass 3: only when the money genuinely doesn't add up. Show the model the
  // discrepancy so it re-reads with a specific error to look for.
  let repaired = false;
  if (!primaryCheck.balanced && reading.grandTotalCents !== null && images.length === 1) {
    onProgress("repairing", "Numbers don't add up, re-reading");
    try {
      const delta = primaryCheck.deltaCents;
      const raw = await readWith(
        usedAuditor || usedPrimary,
        repairPrompt({
          candidate: toCandidateJson(reading),
          currency: reading.currency,
          discrepancy:
            `The line items and totals differ from the printed grand total by ` +
            `${(Math.abs(delta) / 100).toFixed(2)} ` +
            `(${delta > 0 ? "the items are short of" : "the items exceed"} the printed total of ` +
            `${(reading.grandTotalCents / 100).toFixed(2)}).`,
        }),
        images
      );
      const candidate = normaliseReading(raw);
      const check = verifyArithmetic(candidate);
      if (check.balanced) {
        reading = candidate;
        primaryCheck = check;
        repaired = true;
      }
    } catch { /* keep the unbalanced reading and flag it for review */ }
  }

  const baked = bakeItems(reading);
  const modelsAgreed = agreementRate === null ? null : agreementRate >= 0.999;
  const verified = Boolean(primaryCheck.balanced && modelsAgreed !== false);

  return {
    verified,
    merchant: reading.merchant,
    storeLocation: reading.storeLocation,
    receiptDate: reading.receiptDate,
    currency: reading.currency,
    taxMode: reading.taxMode,
    paymentMethod: reading.paymentMethod,

    items: baked.items,
    subtotalCents: reading.subtotalCents ?? primaryCheck.lineSum,
    taxCents: reading.taxCents,
    serviceCents: reading.serviceCents,
    discountCents: reading.discountCents,
    roundingCents: reading.roundingCents,
    totalCents: baked.total,

    report: {
      verified,
      balanced: primaryCheck.balanced,
      deltaCents: primaryCheck.deltaCents,
      modelsAgreed,
      agreementRate,
      repaired,
      readers: [usedPrimary, usedAuditor].filter(Boolean),
      partCount: images.length,
      printedItemCount: reading.printedItemCount,
      problems: primaryCheck.problems,
      scannedAt: new Date().toISOString(),
      prep: prepReports,
    },
  };
}

// Exposed for the test run in ocr.test.mjs; not part of the module's API.
export const __test = { alignItems, reconcile, bakeItems, normaliseReading, mergeParts, similarity };

function toCandidateJson(reading) {
  return {
    items: reading.items.map((i) => ({
      lineNo: i.lineNo,
      name: i.name,
      qty: i.qty,
      unitPrice: i.unitCents / 100,
      lineTotal: i.lineCents / 100,
    })),
    adjustments: reading.adjustments.map((a) => ({
      label: a.label,
      amount: a.cents / 100,
      appliesToLineNo: a.appliesToLineNo,
    })),
    tax: reading.taxCents / 100,
    serviceCharge: reading.serviceCents / 100,
    discount: reading.discountCents / 100,
    rounding: reading.roundingCents / 100,
    grandTotal: reading.grandTotalCents === null ? null : reading.grandTotalCents / 100,
  };
}
