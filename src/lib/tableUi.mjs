export function paymentStatus(value) {
  const entries = Array.isArray(value?.payers) ? value.payers : value ? [value] : [];
  const payers = entries.map(payer => typeof payer === 'object' ? payer?.name || 'Host' : payer);
  const total = Math.max(1, Number(value?.total) || 1);
  return { payers, total, complete: payers.length >= total };
}

export function paymentBreakdown(price, value, selected = []) {
  const status = paymentStatus(value);
  const totalCents = Math.round((Number(price) || 0) * 100);
  const shareCents = Math.round(Number(((Number(price) || 0) / status.total).toFixed(2)) * 100);
  const paidCents = status.complete ? totalCents : shareCents * status.payers.length;
  const owing = [...new Set(Array.isArray(selected) ? selected : [])]
    .filter(name => typeof name === 'string' && name.trim() && !status.payers.includes(name));
  const unnamedShares = Math.max(0, status.total - status.payers.length - owing.length);
  return { ...status, totalCents, paidCents, owing, unnamedShares };
}

export function savedTables(storage = localStorage) {
  try {
    const tables = JSON.parse(storage.getItem('ks_tables') || '[]');
    return Array.isArray(tables) ? tables.filter(table => table && /^\d{4}$/.test(table.code)) : [];
  } catch {
    return [];
  }
}

export function formatTableDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
