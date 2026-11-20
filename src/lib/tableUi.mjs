export function paymentStatus(value) {
  const entries = Array.isArray(value?.payers) ? value.payers : value ? [value] : [];
  const payers = entries.map(payer => typeof payer === 'object' ? payer?.name || 'Host' : payer);
  const total = Math.max(1, Number(value?.total) || 1);
  return { payers, total, complete: payers.length >= total };
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
