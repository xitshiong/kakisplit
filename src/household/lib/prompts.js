// Prompts for the household receipt reader.
//
// These are tuned for grocery and household receipts, which are much harder
// than restaurant bills: 40+ lines, weighed produce, multibuy adjustments,
// per-line tax codes, loyalty discounts and abbreviated product names.
//
// Three principles run through all of them:
//   1. Transcribe, never interpret. An abbreviation that gets "helpfully"
//      expanded is an error we can't detect later.
//   2. Report uncertainty instead of guessing. A flagged line costs the user
//      two seconds; a confidently wrong line costs them money.
//   3. Every number must survive an arithmetic check the code repeats
//      independently after the model is done.

const SCHEMA = `{
  "merchant": string | null,
  "storeLocation": string | null,
  "receiptDate": "YYYY-MM-DD" | null,
  "receiptTime": "HH:MM" | null,
  "currency": "MYR" | "SGD" | "AUD" | "USD" | "GBP" | "EUR" | "IDR" | "THB" | "PHP" | "VND" | "INR" | "JPY" | null,
  "taxMode": "inclusive" | "exclusive" | "none",
  "taxIncluded": boolean | null,
  "totalLabel": string | null,
  "items": [
    {
      "lineNo": integer,
      "name": string,
      "qty": number,
      "unit": "ea" | "kg" | "g" | "l" | "ml",
      "unitPrice": number,
      "lineTotal": number,
      "taxCode": string,
      "category": "produce" | "meat" | "dairy" | "bakery" | "pantry" | "frozen" | "drinks" | "alcohol" | "snacks" | "household" | "personal" | "pet" | "baby" | "other",
      "confidence": number,
      "uncertain": string[]
    }
  ],
  "adjustments": [
    { "lineNo": integer, "label": string, "amount": number, "appliesToLineNo": integer | null }
  ],
  "subtotal": number | null,
  "tax": number | null,
  "serviceCharge": number | null,
  "discount": number | null,
  "rounding": number | null,
  "grandTotal": number | null,
  "printedItemCount": integer | null,
  "paymentMethod": string | null,
  "totalsVisible": boolean,
  "unreadable": string[]
}`;

const CORE_RULES = `
## What counts as an item

Include EVERY line that has its own price printed against it, in the order it
appears, including:
- normal products, even at 0.00
- bag charges, container deposits, bottle/crate deposits, surcharges
- weighed goods (produce, deli, meat)
- gift cards, top-ups, phone credit
- anything you do not recognise — transcribe it rather than dropping it

EXCLUDE these; they belong in the totals fields, never in "items":
Subtotal, Total, Balance Due, Tax/GST/SST/VAT, Service Charge, Rounding,
Cash/Card/Change/Tendered, loyalty point balances, savings summaries
("You saved 12.40"), store messages, survey codes, ABN/company numbers.

## Transcribe, do not interpret

- Copy the product name EXACTLY as printed, including abbreviations, brand
  codes and odd spacing. Print "COL FC MILK 2L", not "Coles Full Cream Milk 2L".
- Strip only: leading/trailing whitespace, bullet glyphs, and currency symbols
  inside the name.
- Never merge two printed lines into one item, and never split one into two.
- Never reorder. "lineNo" is the printed order, starting at 1.
- Do not put quotes, backslashes, tabs or newlines inside any string.

## Quantities and weighed goods

- "qty" is the number of units for that line. Default 1.
- "unitPrice" is the price of ONE unit. "lineTotal" is what is printed for the
  whole line. These must satisfy: qty * unitPrice = lineTotal (to the cent).
- For a multi-buy line like "COKE 1.5L  3  @ 4.50   13.50":
  qty 3, unitPrice 4.50, lineTotal 13.50.
- For weighed goods like "BANANAS 0.784kg @ 4.90/kg   3.84":
  qty 0.784, unit "kg", unitPrice 4.90, lineTotal 3.84.
  Use the PRINTED lineTotal even if 0.784 * 4.90 rounds differently.
- If only a line total is printed, set qty 1 and unitPrice = lineTotal.

## Adjustments (the most commonly missed thing on grocery receipts)

A line that reduces or increases the price of the item above it — member
price, multibuy saving, markdown, "2 for 5.00" correction, staff discount,
voided line — goes in "adjustments", NOT in "items", with a NEGATIVE amount
for a reduction. Set "appliesToLineNo" to the item it modifies when that is
clear from the layout, otherwise null.

Store-wide discounts printed once near the totals go in the "discount" field
instead, as a POSITIVE number.

## Tax

- "taxMode" is "inclusive" when prices already contain tax (typical in
  Australia, Malaysia, the UK), "exclusive" when tax is added at the end
  (typical in the US), "none" when no tax appears.
- "taxIncluded" is true when the receipt explicitly says "Includes TAX",
  "Tax Included", "GST Included" or equivalent. It is false only when the
  receipt clearly shows tax being added after a subtotal, and null when the
  wording is not visible. An included-tax amount is informational and must
  NEVER be added to the printed total.
- "totalLabel" is the exact label immediately to the left of the amount you
  report as "grandTotal", such as "Total Amount" or "Amount Due". Do not use
  a tax label or a subtotal label as the grand total label.
- "taxCode" is the per-line tax marker if the receipt prints one
  (for example "*", "T", "S", "Z", "GST"). Use "" when absent.
- "tax" is the total tax amount printed near the totals. Report it even when
  taxMode is "inclusive" — the code needs it to verify, and will not add it
  a second time.

## Totals

Report every totals field you can actually see, and null for any you cannot.
Set "totalsVisible" to false if the bottom of the receipt is not in the image.
"discount" and "serviceCharge" are POSITIVE numbers. "rounding" keeps its
printed sign (often -0.02 or +0.03).
"printedItemCount" is the receipt's own item counter if it prints one, such as
"TOTAL ITEMS: 27" or "27 ITEM(S) SOLD". This is a valuable cross-check — look
for it carefully.

## Uncertainty

Guessing is worse than admitting doubt.
- "confidence" is 0.0-1.0 per item. Use below 0.9 for anything smudged,
  cut off, glare-covered, folded, or ambiguous.
- "uncertain" lists which fields you are unsure about, e.g. ["price"].
- "unreadable" describes anything you could not read at all, e.g.
  "line 14 price obscured by fold".

## Before you answer

Run this check yourself and fix any disagreement by re-reading the image. In
particular, on receipts with a line such as "Includes TAX: 18.72", the amount
on that line is a tax component, not an extra charge. The amount on the
"Total Amount" line is the amount charged:
  sum(item lineTotals) + sum(adjustment amounts)
    = subtotal            (when taxMode is "inclusive" or "none")
  when taxMode is "exclusive":
    sum(item lineTotals) + sum(adjustment amounts) + tax + serviceCharge
      - discount + rounding = grandTotal
  when taxMode is "inclusive" or "none":
    sum(item lineTotals) + sum(adjustment amounts) + serviceCharge
      - discount + rounding = grandTotal
Also confirm your item count matches "printedItemCount" when one is printed.
If they disagree, you have missed or duplicated a line — find it before
answering. Do not silently adjust a number to force the sum to balance.

Return one complete, valid JSON object and nothing else. No markdown fences,
no commentary. Never truncate mid-string.`;

export function extractionPrompt({ partIndex = 1, partCount = 1 } = {}) {
  const multipart =
    partCount > 1
      ? `

## This image is part ${partIndex} of ${partCount}

These ${partCount} photos are sections of ONE long receipt, in order.
- Transcribe ONLY the lines visible in THIS image.
- Number "lineNo" starting at 1 for this image; the code will re-number later.
- If a line is cut off at the top or bottom edge and you cannot read both its
  name and its price, leave it out and describe it in "unreadable" — the
  neighbouring photo will cover it.
- Report totals only if they are actually visible here. Otherwise use null and
  set "totalsVisible" to false.`
      : "";

  return `You are a forensic receipt auditor. Your transcription will be used to
charge real money to real housemates, so an error has a direct financial cost.
Read the receipt image and return structured JSON.

Return EXACTLY this shape:
${SCHEMA}
${CORE_RULES}${multipart}`;
}

/**
 * Shown to a second, different model together with the first model's output.
 * The point is a targeted re-read of specific lines, not another full pass —
 * we already have an independent full pass to compare against.
 */
export function repairPrompt({ candidate, discrepancy, currency }) {
  return `You are a forensic receipt auditor reviewing a failed audit.

Another reader transcribed the attached receipt and the numbers DO NOT
reconcile:

${discrepancy}

Their transcription was:
${JSON.stringify(candidate, null, 1)}

Re-read the image and find the mistake. The most likely causes, in order:
1. A line item was missed entirely — often a small one, a bag charge, a
   deposit, or a line squeezed against a fold or the edge of the photo.
2. A discount, member price or multibuy adjustment line was skipped, or was
   recorded as a positive number when it should be negative.
3. A digit was misread — 0/8, 1/7, 3/8, 5/6, or a misplaced decimal point.
4. A line was transcribed twice.
5. A totals field (tax, service charge, rounding) was misread or missed.

Do not fabricate a line item or fudge a number to make the arithmetic work.
If after re-reading you genuinely cannot make it balance, return your best
honest reading and describe the problem in "unreadable".

Amounts are in ${currency || "the receipt's currency"}.

Return the COMPLETE corrected JSON in exactly the same shape as the input
(all items, not just the changed ones), and nothing else.`;
}
