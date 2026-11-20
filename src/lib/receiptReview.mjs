export function reviewReceiptItems(items) {
  let totalCents = 0;
  const errors = items.map(item => {
    const name = String(item.name ?? '').trim() ? '' : 'Enter an item name.';
    const value = String(item.price ?? '').trim();
    const amount = Number(value);
    const cents = Math.round(amount * 100);
    const price = !/^-?(?:\d+\.?\d{0,2}|\.\d{1,2})$/.test(value) || !Number.isSafeInteger(cents)
      ? 'Enter an amount with up to 2 decimal places.'
      : '';
    if (!price) totalCents += cents;
    return { name, price };
  });
  const hasErrors = errors.some(error => error.name || error.price);
  const totalError = !items.length ? 'Add at least one item to continue.'
    : !hasErrors && (!Number.isSafeInteger(totalCents) || totalCents <= 0)
      ? 'Your bill total must be more than zero.' : '';
  return { errors, total: totalCents / 100, totalError, valid: !hasErrors && !totalError };
}
