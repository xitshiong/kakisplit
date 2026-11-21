export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function normalizeCode(value) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
}

export function isTableCode(value) {
  return /^(?:[0-9]{4}|[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8})$/.test(normalizeCode(value));
}

export function formatCode(value) {
  const code = normalizeCode(value);
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function genCode(random = globalThis.crypto) {
  let code = '';
  const limit = 256 - (256 % CODE_ALPHABET.length);
  while (code.length < 8) {
    const bytes = random.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte < limit) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === 8) break;
    }
  }
  return code;
}
