export async function updateSelectionWithClient(client, code, name, selected) {
  if (!code || !name) return false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await client.from("sessions").select("selections").eq("code", code).single();
    if (error || !data) return false;
    const snapshot = data.selections;
    const selections = structuredClone(snapshot || {});
    for (const id of Object.keys(selections)) {
      selections[id] = selections[id].filter(payer => payer !== name);
    }
    for (const id of Object.keys(selected)) {
      if (selected[id]) (selections[id] ||= []).push(name);
    }
    let update = client.from("sessions").update({ selections }).eq("code", code);
    update = snapshot == null ? update.is("selections", null) : update.eq("selections", JSON.stringify(snapshot));
    const { data: updated, error: updateError } = await update.select("selections");
    if (!updateError && updated?.length) return true;
  }
  return false;
}
