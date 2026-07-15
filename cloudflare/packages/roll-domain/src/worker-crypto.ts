const WEB_CRYPTO_BYTE_LIMIT = 65_536;

export function randomBytes(size: number): Uint8Array {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new TypeError(
      "Random byte count must be a non-negative safe integer",
    );
  }
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < bytes.length; offset += WEB_CRYPTO_BYTE_LIMIT) {
    crypto.getRandomValues(
      bytes.subarray(offset, offset + WEB_CRYPTO_BYTE_LIMIT),
    );
  }
  return bytes;
}
