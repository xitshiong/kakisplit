// Money helpers for the household split. Every amount is an integer number of
// minor units ("cents") so sums and splits never drift by floating-point error.

export const CURRENCIES = {
  MYR: { symbol: "RM", name: "Malaysian ringgit" },
  SGD: { symbol: "S$", name: "Singapore dollar" },
  AUD: { symbol: "A$", name: "Australian dollar" },
  USD: { symbol: "$", name: "US dollar" },
  GBP: { symbol: "£", name: "British pound" },
  EUR: { symbol: "€", name: "Euro" },
  IDR: { symbol: "Rp", name: "Indonesian rupiah" },
  THB: { symbol: "฿", name: "Thai baht" },
  PHP: { symbol: "₱", name: "Philippine peso" },
  VND: { symbol: "₫", name: "Vietnamese dong" },
  INR: { symbol: "₹", name: "Indian rupee" },
  JPY: { symbol: "¥", name: "Japanese yen" },
};

/**
 * Convert a major-unit amount (number or user/model-entered string such as
 * "12.5", "RM 1,234.50", "-3.10" or "(3.10)") to integer cents. Anything that
 * isn't a number becomes 0.
 */
export function toCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100 + (value >= 0 ? 1e-9 : -1e-9)) : 0;
  }
  let s = String(value).trim();
  const parenthesised = /^\(.*\)$/.test(s);
  const negative = parenthesised || /^-|^[^\d]*-/.test(s);
  s = s.replace(/[^\d.]/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return 0;
  const cents = toCents(n);
  return negative && cents !== 0 ? -cents : cents;
}

/** Plain "1234.50" for editable inputs (no symbol, no grouping). */
export function fmtPlain(cents) {
  const n = Math.round(Number(cents) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Display amount with currency symbol and thousands grouping, e.g. "RM 1,234.50". */
export function fmt(cents, currency) {
  const n = Math.round(Number(cents) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol = CURRENCIES[currency]?.symbol ?? currency ?? "";
  const amount = `${whole}.${String(abs % 100).padStart(2, "0")}`;
  return `${sign}${symbol ? `${symbol} ` : ""}${amount}`;
}

/**
 * Split `total` cents across `weights` with the largest-remainder method, so
 * the parts are whole cents and always sum exactly to `total`.
 */
export function allocateCents(total, weights) {
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

/**
 * Spread whatever the grand total has beyond the line items (tax, service,
 * discounts, rounding) across the lines by value. Returns one
 * `{ extrasCents, totalCents }` per line; the totals sum to `grandTotalCents`.
 */
export function bakeExtras(lineCents, grandTotalCents) {
  const lines = lineCents.map((c) => Math.round(Number(c) || 0));
  const extras = Math.round(Number(grandTotalCents) || 0) - lines.reduce((a, b) => a + b, 0);
  const allocation = allocateCents(extras, lines);
  return lines.map((c, i) => ({ extrasCents: allocation[i], totalCents: c + allocation[i] }));
}
