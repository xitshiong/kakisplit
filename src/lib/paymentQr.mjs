const MAX_QR_LENGTH = 80_000;
const QR_EDGES = [1024, 768, 576, 400];

async function encodePaymentQr(source) {
  const image = new Image();
  image.src = source;
  await image.decode();

  const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  for (const edge of new Set(QR_EDGES.map(limit => Math.min(longEdge, limit)))) {
    const scale = edge / longEdge;
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = canvas.toDataURL("image/png");
    if (png.length <= MAX_QR_LENGTH) return png;
    const jpeg = canvas.toDataURL("image/jpeg", 0.9);
    if (jpeg.length <= MAX_QR_LENGTH) return jpeg;
  }

  const jpeg = canvas.toDataURL("image/jpeg", 0.8);
  if (jpeg.length <= MAX_QR_LENGTH) return jpeg;
  throw new Error("Crop the image around the QR code and upload it again.");
}

export async function readPaymentQr(file) {
  if (!file?.type.startsWith("image/")) throw new Error("Choose an image of your payment QR code.");
  const source = URL.createObjectURL(file);
  try {
    return await encodePaymentQr(source);
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function prepareQrForSave(qr) {
  if (!qr?.startsWith("data:") || qr.length <= MAX_QR_LENGTH) return qr || null;
  return encodePaymentQr(qr);
}
