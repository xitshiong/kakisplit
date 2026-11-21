import { priceCentsBigInt } from './splitMoney.mjs';

const MAX_AMOUNT_CENTS = 100_000_000n;

export function reviewReceiptItems(items) {
  let totalCents = 0n;
  let subtotalCents = 0n;
  const errors = items.map(item => {
    const name = String(item.name ?? '').trim() ? '' : 'Enter an item name.';
    const value = String(item.price ?? '').trim();
    const cents = priceCentsBigInt(value);
    const price = cents === null
      ? 'Enter an amount with up to 2 decimal places.'
      : cents > MAX_AMOUNT_CENTS || cents < -MAX_AMOUNT_CENTS
        ? 'Amount is too large. Maximum per line is 1,000,000.00.'
        : cents < 0n && !item.billLevel ? 'Only whole-bill adjustments can be negative.' : '';
    if (!price) {
      totalCents += cents;
      if (!item.billLevel) subtotalCents += cents;
    }
    return { name, price };
  });
  const hasErrors = errors.some(error => error.name || error.price);
  const totalTooLarge = totalCents > MAX_AMOUNT_CENTS || totalCents < -MAX_AMOUNT_CENTS || subtotalCents > MAX_AMOUNT_CENTS;
  const totalError = !items.length ? 'Add at least one item to continue.'
    : !hasErrors && totalTooLarge ? 'Amount is too large. Maximum bill or regular-item subtotal is 1,000,000.00.'
    : !hasErrors && totalCents <= 0n
      ? 'Your bill total must be more than zero.' : '';
  const billError = totalError || (!hasErrors && subtotalCents <= 0n
    ? 'Add a regular item with a positive price.' : '');
  const absoluteCents = totalCents < 0n ? -totalCents : totalCents;
  const totalText = totalTooLarge ? null : `${totalCents < 0n ? '-' : ''}${absoluteCents / 100n}.${String(absoluteCents % 100n).padStart(2, '0')}`;
  return { errors, total: Number(totalCents) / 100, totalText, totalError: billError, valid: !hasErrors && !billError };
}
