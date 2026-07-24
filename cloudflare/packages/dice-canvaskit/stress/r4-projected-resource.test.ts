import {
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  type RenderAppearanceV4,
  type RendererRevisionV4,
  type RenderRequestV4,
} from "@dice-witch/dice-v4-model";
import { expect, test } from "vitest";
import { CANVASKIT_FONT_DATA_V4 } from "../src/font-assets";
import { CanvasKitDiceRequestRendererV4 } from "../src/render-request";
import { loadCanvasKitV4 } from "../src/runtime";

const FIXED_INITIAL_HEAP_BYTES = 32 * 1024 * 1024;

const appearance: RenderAppearanceV4 = {
  material: {
    family: "classic",
    treatment: "gradient",
    opacity: "opaque",
    finish: "satin",
    textureScale: 100,
  },
  palette: ["#170022", "#04c9df", "#f3d36a"],
  texture: {
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4.classic,
    seed: 0x51ce_b00c,
    scale: 100,
    rotation: 37,
    offsetU: 12_345,
    offsetV: 54_321,
    scope: "die-wide",
  },
  lighting: {
    mode: "combined",
    strength: "gentle",
    direction: "upper-left",
  },
  engraving: {
    fontId: "liberation-sans",
    finish: "matte-ink",
    color: "#faf9f6",
  },
  outlineColor: "#000000",
  requiresLocalSeparation: false,
  effect: null,
};

function maximumProjectedRequest(
  rendererRevision: RendererRevisionV4,
): RenderRequestV4 {
  return {
    version: 4,
    rendererRevision,
    groups: [
      Array.from({ length: 50 }, (_, index) => ({
        target: "d20" as const,
        result: (index % 20) + 1,
        form: "standard" as const,
        appearance: {
          ...appearance,
          texture: {
            ...appearance.texture,
            seed: (appearance.texture.seed + index) >>> 0,
            rotation: (index * 37) % 360,
            offsetU: (index * 12_345) % 65_536,
            offsetV: (index * 54_321) % 65_536,
          },
        },
        icons: [],
      })),
    ],
  };
}

test.each([
  "canvaskit-v4-r4",
  "canvaskit-v4-r5",
  "canvaskit-v4-r6",
  "canvaskit-v4-r7",
] as const)(
  "renders the maximum projected %s request repeatedly within the fixed heap",
  async (rendererRevision) => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = new CanvasKitDiceRequestRendererV4({
      canvasKit,
      defaultFontId: "liberation-sans",
      fontDataById: CANVASKIT_FONT_DATA_V4,
    });
    try {
      const request = maximumProjectedRequest(rendererRevision);
      const first = await renderer.renderValidated(request);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(FIXED_INITIAL_HEAP_BYTES);
      const repeated = await renderer.renderValidated(request);

      expect(first).toMatchObject({
        rendererRevision,
        width: 1_500,
        height: 750,
        diceCount: 50,
        rowCount: 5,
      });
      expect(repeated.png).toEqual(first.png);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(FIXED_INITIAL_HEAP_BYTES);
    } finally {
      renderer.dispose();
    }
  },
  60_000,
);
