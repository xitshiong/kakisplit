import { priceCents } from './splitMoney.mjs';

export function reviewReceiptItems(items) {
  let totalCents = 0;
  const errors = items.map(item => {
    const name = String(item.name ?? '').trim() ? '' : 'Enter an item name.';
    const value = String(item.price ?? '').trim();
    const cents = priceCents(value);
    const price = cents === null
      ? 'Enter an amount with up to 2 decimal places.'
      : cents < 0 && !item.billLevel ? 'Only whole-bill adjustments can be negative.' : '';
    if (!price) totalCents += cents;
    return { name, price };
  });
  const hasErrors = errors.some(error => error.name || error.price);
  const subtotal = items.filter(item => !item.billLevel).reduce((sum, item) => sum + (priceCents(item.price) ?? 0), 0);
  const totalError = !items.length ? 'Add at least one item to continue.'
    : !hasErrors && (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(subtotal) || totalCents <= 0)
      ? 'Your bill total must be more than zero.' : '';
  const billError = totalError || (!hasErrors && !items.some(item => !item.billLevel && priceCents(item.price) > 0)
    ? 'Add a regular item with a positive price.' : '');
  return { errors, total: totalCents / 100, totalError: billError, valid: !hasErrors && !billError };
}
