import { FONT_IDS_V4 } from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import { CANVASKIT_FONT_DATA_V4 } from "../src/font-assets";

const EXPECTED_FONT_HASHES_V4 = {
  "liberation-sans":
    "fd4ad4798606a4f1e59cade90f7eb0353dad48ff19cab1768c0a0468234c1609",
  "new-rocker":
    "74b00de142a8c3e97442a9512f30fee4c7fe1cb5ac935fb9ee3b9fbe94ab24dd",
  "stencil-ops":
    "536eb665414d97bb7b8aab59e53c7b0de3d552dca73af0f9be587ab2926ba119",
  "creeping-horror":
    "d1847aa4ceef3e71c32bc0d147aaf4a2269835e8b9af6438faa306f10f378018",
  "special-elite":
    "bfa15750b61b9300737886a42d3f1d2ec30d2850c169e6b490ed1ddd3cd81a78",
  "luckiest-guy":
    "dfa9dcf114ab651d3e6b4c041310c9ebac32ce601c13cfa3c4c833227601c4b7",
  "fontdiner-swanky":
    "e43891a8d9bf49d80c20c0aba1b901e69beb966199092499eba994dcdd76f003",
  syncopate:
    "5aad5466f0bc7d67b0e225a0ad734b377b25a34d0c2fecc551633b03054c1860",
} as const satisfies Record<(typeof FONT_IDS_V4)[number], string>;

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("CanvasKit V4 font assets", () => {
  it("pins one local subset for every immutable font id", async () => {
    expect(Object.keys(CANVASKIT_FONT_DATA_V4)).toEqual(FONT_IDS_V4);
    expect(Object.isFrozen(CANVASKIT_FONT_DATA_V4)).toBe(true);

    const hashes: Record<string, string> = {};
    for (const fontId of FONT_IDS_V4) {
      const bytes = CANVASKIT_FONT_DATA_V4[fontId];
      expect(bytes).toBeInstanceOf(ArrayBuffer);
      expect(bytes.byteLength).toBeGreaterThan(0);
      hashes[fontId] = await sha256(bytes);
    }
    expect(hashes).toEqual(EXPECTED_FONT_HASHES_V4);
  });
});
