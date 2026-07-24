import {
  D12_STANDARD_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
  D8_STANDARD_GEOMETRY_V4,
  FONT_IDS_V4,
  FUDGE_STANDARD_GEOMETRY_V4,
  OTHER_SPHERE_GEOMETRY_V4,
  type FontIdV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import { CANVASKIT_FONT_DATA_V4 } from "../src/font-assets";
import { CanvasKitGeometryRendererV4 } from "../src/geometry-renderer";
import {
  CANVASKIT_INITIAL_MEMORY_BYTES_V4,
  loadCanvasKitV4,
} from "../src/runtime";

const PRESERVED_STANDARD_D20_HASH =
  "a10612178dd6fef565f5eb77c31de9003ce021f40231abce02add8bb1464a29b";

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function representativeFontGroup(fontId: FontIdV4) {
  return [
    {
      kind: "polyhedral" as const,
      geometry: D8_STANDARD_GEOMETRY_V4,
      result: 8,
      fontId,
    },
    {
      kind: "polyhedral" as const,
      geometry: D12_STANDARD_GEOMETRY_V4,
      result: 12,
      fontId,
    },
    {
      kind: "polyhedral" as const,
      geometry: D20_STANDARD_GEOMETRY_V4,
      result: 20,
      fontId,
    },
    {
      kind: "polyhedral" as const,
      geometry: FUDGE_STANDARD_GEOMETRY_V4,
      result: -1,
      fontId,
    },
    {
      kind: "sphere" as const,
      geometry: OTHER_SPHERE_GEOMETRY_V4,
      sides: 999,
      result: 999,
      fontId,
    },
  ];
}

describe("CanvasKit V4 font rendering", () => {
  it("selects every font per die without changing the explicit default", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = new CanvasKitGeometryRendererV4({
      canvasKit,
      defaultFontId: "liberation-sans",
      fontDataById: CANVASKIT_FONT_DATA_V4,
    });

    try {
      const hashes = new Set<string>();
      for (const fontId of FONT_IDS_V4) {
        const options = { groups: [representativeFontGroup(fontId)] };
        const first = await renderer.renderGeometryGrid(options);
        const second = await renderer.renderGeometryGrid(options);
        const firstHash = await sha256(first.png);
        expect(await sha256(second.png)).toBe(firstHash);
        hashes.add(firstHash);
      }
      expect(hashes.size).toBe(FONT_IDS_V4.length);

      const standard = await renderer.render({
        geometry: D20_STANDARD_GEOMETRY_V4,
        result: 20,
        size: 300,
      });
      expect(await sha256(standard.png)).toBe(PRESERVED_STANDARD_D20_HASH);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("fails initialization when any required font asset is absent", async () => {
    const canvasKit = await loadCanvasKitV4();
    const incomplete = Object.fromEntries(
      Object.entries(CANVASKIT_FONT_DATA_V4).filter(
        ([fontId]) => fontId !== "syncopate",
      ),
    );

    expect(
      () =>
        new CanvasKitGeometryRendererV4({
          canvasKit,
          defaultFontId: "liberation-sans",
          fontDataById: incomplete as typeof CANVASKIT_FONT_DATA_V4,
        }),
    ).toThrow("CanvasKit V4 font data is missing: syncopate");
  });
});
