import { normalizeCode, isTableCode } from './tableCode.mjs';

export async function savePaidWithClient(client, itemId, name, code, splitCount = 1) {
  if (Number.isSafeInteger(itemId) && itemId >= 0) itemId = String(itemId);
  if (typeof itemId !== 'string' || !itemId || itemId.length > 200 ||
      ['__proto__', 'constructor', 'prototype'].includes(itemId) ||
      typeof name !== 'string' || !name.trim() || name.length > 100 || !isTableCode(code) ||
      !Number.isInteger(splitCount) || splitCount < 1 || splitCount > 100) return { success: false };
  try {
    const { data, error } = await client.rpc('mark_paid', {
      p_code: normalizeCode(code), p_item_id: itemId, p_name: name, p_split_count: splitCount,
    });
    return !error && data && typeof data.success === 'boolean' ? data : { success: false };
  } catch { return { success: false }; }
}
