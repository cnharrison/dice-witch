import { describe, expect, it } from "vitest";
import { verifyDiscordRequestSignature } from "../../packages/discord-contracts/src";

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signedFixture(): Promise<{
  body: Uint8Array;
  publicKey: string;
  signature: string;
  timestamp: string;
}> {
  const keys = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  if (!("privateKey" in keys)) {
    throw new Error("Ed25519 key generation did not return a key pair");
  }
  const body = new TextEncoder().encode('{"type":1}');
  const timestamp = "1783800000";
  const message = new Uint8Array(
    new TextEncoder().encode(timestamp).length + body.length,
  );
  message.set(new TextEncoder().encode(timestamp));
  message.set(body, timestamp.length);
  const publicKey = await crypto.subtle.exportKey("raw", keys.publicKey);
  if (!(publicKey instanceof ArrayBuffer)) {
    throw new Error("Ed25519 public key export was not raw bytes");
  }
  return {
    body,
    publicKey: hex(publicKey),
    signature: hex(
      await crypto.subtle.sign("Ed25519", keys.privateKey, message),
    ),
    timestamp,
  };
}

describe("Discord HTTP signature verification", () => {
  it("accepts the exact signed timestamp and raw body", async () => {
    const fixture = await signedFixture();

    await expect(verifyDiscordRequestSignature(fixture)).resolves.toBe(true);
  });

  it("rejects altered bodies and malformed request headers", async () => {
    const fixture = await signedFixture();

    await expect(
      verifyDiscordRequestSignature({
        ...fixture,
        body: new TextEncoder().encode('{"type":2}'),
      }),
    ).resolves.toBe(false);
    await expect(
      verifyDiscordRequestSignature({ ...fixture, signature: "not-hex" }),
    ).resolves.toBe(false);
    await expect(
      verifyDiscordRequestSignature({ ...fixture, timestamp: "" }),
    ).resolves.toBe(false);
  });

  it("fails loudly when the configured public key is invalid", async () => {
    const fixture = await signedFixture();

    await expect(
      verifyDiscordRequestSignature({ ...fixture, publicKey: "00" }),
    ).rejects.toThrow("Discord public key configuration is invalid");
  });
});
