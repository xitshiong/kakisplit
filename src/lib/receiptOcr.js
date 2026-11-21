class UnusableReading extends Error {}

async function requestReading(image, accessToken, retry, fetchReceipt) {
  const response = await fetchReceipt("/api/ocr", {
    method: "POST",
    signal: AbortSignal.timeout(50_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ image, retry }),
  });
  if (response.status === 401) throw new Error("Sign in to scan receipts.");
  if (response.status === 429) throw new Error("Receipt scan limit reached. Try tomorrow or enter items manually.");
  if (!response.ok) throw new Error("The receipt service couldn't scan this photo. Try again or enter items manually.");
  const body = await response.json();
  try {
    if (body.finishReason && body.finishReason !== "stop") throw new UnusableReading();
    return JSON.parse(body.text.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""));
  } catch { throw new UnusableReading(); }
}

function cents(value) {
  if (typeof value !== "number") return null;
  const scaled = Math.abs(value) * 100;
  const amount = Math.sign(value) * Math.round(scaled + scaled * Number.EPSILON);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function reconcileReceipt(reading) {
  if (!Array.isArray(reading?.items) || reading.items.length > 200 ||
      !Array.isArray(reading.adjustments) || reading.adjustments.length > 100 || typeof reading.hasUnreadableRows !== "boolean") {
    throw new UnusableReading();
  }

  let incomplete = reading.hasUnreadableRows;
  const portions = [];
  for (const item of reading.items) {
    const name = typeof item?.name === "string" ? item.name.trim().replace(/\s+/g, " ") : "";
    const qty = item?.qty;
    const line = cents(item?.lineTotal) ?? (typeof item?.unitPrice === "number" ? cents(item.unitPrice * qty) : null);
    const rowCount = Number.isInteger(qty) && qty > 0 && qty <= 100 ? qty : 1;
    if (!name || name.length > 300 || !Number.isFinite(qty) || qty <= 0 || line === null || line < 0 || portions.length + rowCount > 1000) {
      incomplete = true;
      continue;
    }

    if (Number.isInteger(qty) && qty <= 100) {
      for (let i = 0; i < qty; i++) {
        portions.push({
          name: qty > 1 ? `${name} (${i + 1}/${qty})` : name,
          rawCents: Math.round(line * ((i + 1) / qty)) - Math.round(line * (i / qty)),
        });
      }
    } else {
      portions.push({ name: `${name} (×${qty})`, rawCents: line });
    }
  }

  const printedTotal = cents(reading.grandTotal);
  const subtotal = portions.reduce((sum, item) => sum + item.rawCents, 0);
  const adjustment = reading.adjustments.reduce((sum, value) => {
    const amount = cents(value);
    if (amount === null) incomplete = true;
    return sum + (amount ?? 0);
  }, 0);
  const extractedTotal = subtotal + adjustment;
  const warnings = [];
  if (!portions.length) {
    return {
      items: [],
      warnings: [printedTotal === null
        ? "No priced items could be read."
        : `No priced items could be read. Printed total: ${(printedTotal / 100).toFixed(2)}.`],
    };
  }

  if (incomplete) warnings.push("Some rows may be missing. Compare the items to your receipt.");
  if (printedTotal === null) {
    warnings.push("The printed total couldn't be read. Check the prices before sharing.");
  } else if (printedTotal !== extractedTotal) {
    warnings.push(`Scanned total ${(extractedTotal / 100).toFixed(2)} doesn't match printed total ${(printedTotal / 100).toFixed(2)}. Check the prices before sharing.`);
  }
  // Only fold in charges/discounts when the receipt backs them up. Avoid
  // redistributing a missing item, duplicated tax, or guessed rounding.
  const canAllocate = !incomplete && printedTotal === extractedTotal && printedTotal >= 0 && (subtotal > 0 || adjustment === 0);
  if (!canAllocate && adjustment !== 0) warnings.push("Unverified taxes, fees or discounts were not added to the items.");

  let weight = 0;
  let allocated = 0;
  return {
    warnings,
    items: portions.map(({ name, rawCents }) => {
      weight += rawCents;
      const cumulative = canAllocate && subtotal > 0 ? Math.round(printedTotal * (weight / subtotal)) : weight;
      const price = cumulative - allocated;
      allocated = cumulative;
      return { name, rawPrice: rawCents / 100, itemTax: (price - rawCents) / 100, price: price / 100 };
    }),
  };
}

export async function scanReceipt(image, { accessToken } = {}, fetchReceipt = fetch) {
  if (!accessToken) throw new Error("Sign in to scan receipts.");
  const read = retry => requestReading(image, accessToken, retry, fetchReceipt);
  let first;
  let second;
  try {
    first = reconcileReceipt(await read(false));
    if (!first.warnings.length) return first;
  } catch (error) {
    if (!(error instanceof UnusableReading)) throw error;
  }
  try {
    second = reconcileReceipt(await read(true));
  } catch (error) {
    if (!first && !(error instanceof UnusableReading)) throw error;
  }
  if (second && (!second.warnings.length || (!first?.items.length && second.items.length))) return second;
  return first ?? second ?? { items: [], warnings: ["No priced items could be read. Try a clearer photo."] };
}

export async function scanReceiptBatch(receipts, readReceipt) {
  const items = [];
  const warnings = [];
  for (const receipt of receipts) {
    try {
      const result = await readReceipt(receipt.img);
      items.push(...result.items.map((item, i) => ({ ...item, id: items.length + i + 1, receiptId: receipt.id })));
      if (result.warnings.length) warnings.push({ receiptId: receipt.id, message: result.warnings.join(" ") });
    } catch (error) {
      warnings.push({ receiptId: receipt.id, message: error?.message || "Couldn't scan this receipt." });
    }
  }
  return { items, warnings };
}
