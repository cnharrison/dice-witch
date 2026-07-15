const DISCORD_PUBLIC_KEY = /^[0-9a-fA-F]{64}$/;
const DISCORD_SIGNATURE = /^[0-9a-fA-F]{128}$/;
const DISCORD_TIMESTAMP = /^[0-9]+$/;

export type DiscordSignatureRequest = {
  publicKey: string;
  signature: string;
  timestamp: string;
  body: Uint8Array;
};

function decodeHex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

export async function verifyDiscordRequestSignature(
  request: DiscordSignatureRequest,
): Promise<boolean> {
  if (!DISCORD_PUBLIC_KEY.test(request.publicKey)) {
    throw new Error("Discord public key configuration is invalid");
  }
  if (
    !DISCORD_SIGNATURE.test(request.signature) ||
    !DISCORD_TIMESTAMP.test(request.timestamp)
  ) {
    return false;
  }
  const timestamp = new TextEncoder().encode(request.timestamp);
  const message = new Uint8Array(timestamp.length + request.body.length);
  message.set(timestamp);
  message.set(request.body, timestamp.length);
  const key = await crypto.subtle.importKey(
    "raw",
    decodeHex(request.publicKey),
    "Ed25519",
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "Ed25519",
    key,
    decodeHex(request.signature),
    message,
  );
}
