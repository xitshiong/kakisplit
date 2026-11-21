import { isTableCode } from './tableCode.mjs';
import { priceCents, shareCents } from './splitMoney.mjs';

export function paymentStatus(value) {
  const entries = Array.isArray(value?.payers) ? value.payers : value ? [value] : [];
  const payers = entries.map(payer => typeof payer === 'object' ? payer?.name || 'Host' : payer);
  const total = Math.max(1, Number(value?.total) || 1);
  return { payers, total, complete: payers.length >= total };
}

export function paymentBreakdown(price, value, selected = []) {
  const status = paymentStatus(value);
  const totalCents = priceCents(price) ?? 0;
  const paidCents = status.complete ? totalCents : status.payers.reduce((sum, _, slot) =>
    sum + Math.sign(totalCents) * shareCents(Math.abs(totalCents), status.total, slot), 0);
  const owing = [...new Set(Array.isArray(selected) ? selected : [])]
    .filter(name => typeof name === 'string' && name.trim() && !status.payers.includes(name));
  const unnamedShares = Math.max(0, status.total - status.payers.length - owing.length);
  return { ...status, totalCents, paidCents, owing, unnamedShares };
}

export function savedTables(storage = localStorage) {
  try {
    const tables = JSON.parse(storage.getItem('ks_tables') || '[]');
    return Array.isArray(tables) ? tables.filter(table => table && isTableCode(table.code)) : [];
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
