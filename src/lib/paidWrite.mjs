export async function savePaidWithClient(client, itemId, name, code, splitCount = 1) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await client.from("sessions").select("paid").eq("code", code).single();
    if (error || !data) return { success: false };

    const snapshot = data.paid;
    const paid = structuredClone(snapshot || {});
    if (!paid[itemId]) paid[itemId] = { payers: [], total: splitCount };
    if (!paid[itemId].payers) paid[itemId] = { payers: [paid[itemId]], total: 1 };

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
