export async function savePaidWithClient(client, itemId, name, code, splitCount = 1) {
  if (Number.isSafeInteger(itemId) && itemId >= 0) itemId = String(itemId);
  if (typeof itemId !== 'string' || !itemId || itemId.length > 200 ||
      ['__proto__', 'constructor', 'prototype'].includes(itemId) ||
      typeof name !== 'string' || !name.trim() || name.length > 100 ||
      typeof code !== 'string' || !/^\d{4}$/.test(code) ||
      !Number.isInteger(splitCount) || splitCount < 1 || splitCount > 100) return { success: false };
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await client.from("sessions").select("paid").eq("code", code).single();
    if (error || !data) return { success: false };

    const snapshot = data.paid;
    if (snapshot != null && (typeof snapshot !== 'object' || Array.isArray(snapshot))) return { success: false };
    const paid = structuredClone(snapshot || {});
    if (!Object.hasOwn(paid, itemId)) paid[itemId] = { payers: [], total: splitCount };
    if (typeof paid[itemId] === 'string') paid[itemId] = { payers: [paid[itemId]], total: 1 };
    const entry = paid[itemId];
    if (!entry || !Array.isArray(entry.payers) || !entry.payers.every(payer => typeof payer === 'string') ||
        !Number.isInteger(entry.total) || entry.total < 1 || entry.total > 100) return { success: false };

    const payers = paid[itemId].payers;
    const total = paid[itemId].total || splitCount;
    if (payers.includes(name)) return { success: true, alreadyPaid: true };
    if (payers.length >= total) return { success: false, full: true };
    payers.push(name);

    let update = client.from("sessions").update({ paid }).eq("code", code);
    update = snapshot == null ? update.is("paid", null) : update.eq("paid", JSON.stringify(snapshot));
    const { data: updated, error: updateError } = await update.select("paid");
    if (!updateError && updated?.length > 0) return { success: true };
  }
  return { success: false };
}
