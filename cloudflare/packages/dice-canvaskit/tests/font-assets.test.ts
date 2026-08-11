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
  "source-sans-3":
    "70200d4a63548cc973996e594097ae52c3fca68cb037aa2ede3e334d19b8aa6e",
  cinzel:
    "b068ca824ec96014d93cd674ff2c9ce92c9897eb8ce967864c7536c33d4e3581",
  "barlow-condensed":
    "7a753a96b0e1549d40acd2435e01c3b074e66379277856cbedee6df699ff8128",
  "zilla-slab":
    "65b43b484a4382e08daf09fa803952323b11015f59557f3d2a53112d96a99611",
  "space-grotesk":
    "2d9a0ed7570fcde15efd9bfadeaf0e4cd7fe044907c2cbc6fbdb44cd2941a42e",
  fraunces:
    "b333e2efecbb1fa1a29cd0be1085483682111a6d28adff3539b768b113d7ae11",
  "bricolage-grotesque":
    "0b754e08a41a46b4449d91e4a56e16451d02d65e802d2dc0af9ccbd74b9e17a9",
  "alcarin-tengwar":
    "5a001d1ebee020f50c3ddb584f02c372209d8384d49b58aef3c0e7ea6f4ac278",
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
