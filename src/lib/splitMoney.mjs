export function priceCents(value) {
  const text = String(value ?? '').trim().replace(/^(-?\d+),([0-9]{1,2})$/, '$1.$2');
  if (!/^-?(?:\d+\.?\d{0,2}|\.\d{1,2})$/.test(text)) return null;
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const cents = (BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'))) * (text.startsWith('-') ? -1n : 1n);
  return cents >= -BigInt(Number.MAX_SAFE_INTEGER) && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export function shareCents(cents, count, slot) {
  if (!Number.isSafeInteger(cents) || cents < 0 || !Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(slot) || slot < 0) {
    throw new RangeError('Invalid share');
  }
  if (slot >= count) return 0;
  return Math.floor(cents / count) + (slot < cents % count ? 1 : 0);
}

export function guestShareCents(price, paid, name, count = 1) {
  const payers = paid?.payers || (paid ? [paid] : []);
  const index = payers.findIndex(payer => (typeof payer === 'object' ? payer.name : payer) === name);
  return shareCents(priceCents(price), paid?.total || count, index < 0 ? payers.length : index);
}

export function canConfirmSelection(items, cents) {
  return items.length > 0 && Number.isSafeInteger(cents) && cents >= 0;
}

export function allocateBillItems(items) {
  const regular = items.filter(item => !item.billLevel);
  const subtotal = regular.reduce((sum, item) => sum + priceCents(item.price), 0);
  const adjustment = items.filter(item => item.billLevel).reduce((sum, item) => sum + priceCents(item.price), 0);
  const total = subtotal + adjustment;
  if (!regular.length || subtotal <= 0 || total <= 0 || !Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total) || items.some(item => priceCents(item.price) === null || (!item.billLevel && priceCents(item.price) < 0))) {
    throw new RangeError('Invalid bill');
  }
  let weight = 0n;
  let allocated = 0;
  return regular.map(item => {
    const cents = priceCents(item.price);
    weight += BigInt(cents);
    const cumulative = Number((BigInt(total) * weight * 2n + BigInt(subtotal)) / (2n * BigInt(subtotal)));
    const price = cumulative - allocated;
    allocated = cumulative;
    const amount = `${BigInt(price) / 100n}.${String(BigInt(price) % 100n).padStart(2, '0')}`;
    return { ...item, price: amount, rawPrice: item.rawPrice ?? cents / 100,
      itemTax: (price - priceCents(item.rawPrice ?? item.price)) / 100 };
  });
}
