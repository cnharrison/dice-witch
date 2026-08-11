import { describe, expect, it } from "vitest";
import {
  D20_LIBERATION_SANS_FONT_SCALE_R6_V4,
  ENGRAVING_FINISHES_V4,
  SOURCE_TEXTURE_SIZE_V4,
  createEngravingLayerRecipeV4,
  engravingFontScaleV4,
  resolveEngravingContrastEdgeV4,
  type RenderAppearanceV4,
  type TextureRasterV4,
} from "../src/index";

describe("V4 engraving layer recipes", () => {
  it("pins every approved finish to deterministic physical layers", () => {
    const [red, green, blue] = [0.2, 0.4, 0.6] as const;
    expect(
      Object.fromEntries(
        ENGRAVING_FINISHES_V4.map((finish) => [
          finish,
          createEngravingLayerRecipeV4(finish, red, green, blue),
        ]),
      ),
    ).toEqual({
      "matte-ink": {
        cavity: [0.01, 0.005, 0.02, 0.98],
        wall: [0.38, 0.28, 0.16, 0.98],
        wallBlur: 0.018,
        ink: [red, green, blue, 1],
        glaze: [red, green, blue, 0.24],
        glazeBlur: 0.018,
        glazeDepthFraction: 0,
      },
      enamel: {
        cavity: [0.01, 0.005, 0.02, 0.98],
        wall: [red * 0.24, green * 0.24, blue * 0.24, 0.98],
        wallBlur: 0.02,
        ink: [red, green, blue, 1],
        glaze: [
          red + (1 - red) * 0.72,
          green + (1 - green) * 0.72,
          blue + (1 - blue) * 0.72,
          0.42,
        ],
        glazeBlur: 0.025,
        glazeDepthFraction: -0.32,
      },
      metallic: {
        cavity: [0.01, 0.005, 0.02, 0.98],
        wall: [red * 0.28 + 0.06, green * 0.28 + 0.06, blue * 0.28 + 0.06, 0.98],
        wallBlur: 0.016,
        ink: [red * 0.72 + 0.16, green * 0.72 + 0.16, blue * 0.72 + 0.16, 1],
        glaze: [
          red + (1 - red) * 0.8,
          green + (1 - green) * 0.8,
          blue + (1 - blue) * 0.8,
          0.52,
        ],
        glazeBlur: 0.022,
        glazeDepthFraction: -0.55,
      },
      luminous: {
        cavity: [red * 0.025, green * 0.025, blue * 0.025, 0.98],
        wall: [
          red + (1 - red) * 0.25,
          green + (1 - green) * 0.25,
          blue + (1 - blue) * 0.25,
          0.98,
        ],
        wallBlur: 0.035,
        ink: [
          red + (1 - red) * 0.34,
          green + (1 - green) * 0.34,
          blue + (1 - blue) * 0.34,
          1,
        ],
        glaze: [
          red + (1 - red) * 0.9,
          green + (1 - green) * 0.9,
          blue + (1 - blue) * 0.9,
          0.65,
        ],
        glazeBlur: 0.045,
        glazeDepthFraction: 0,
      },
      void: {
        cavity: [0, 0, 0, 0.99],
        wall: [red * 0.08, green * 0.08, blue * 0.08, 0.98],
        wallBlur: 0.014,
        ink: [red * 0.025, green * 0.025, blue * 0.025, 1],
        glaze: [red * 0.16, green * 0.16, blue * 0.16, 0.18],
        glazeBlur: 0.016,
        glazeDepthFraction: 0.12,
      },
    });
  });

  it("rejects an invalid color component", () => {
    expect(() =>
      createEngravingLayerRecipeV4("matte-ink", 1.01, 0.4, 0.6),
    ).toThrow("V4 engraving color component must be from 0 through 1");
  });

  it("rejects an unknown finish", () => {
    expect(() =>
      createEngravingLayerRecipeV4(
        "glitter" as never,
        0.2,
        0.4,
        0.6,
      ),
    ).toThrow("V4 engraving finish is invalid: glitter");
  });
});

function solidTexture(red: number, green: number, blue: number): TextureRasterV4 {
  const pixels = new Uint8Array(
    SOURCE_TEXTURE_SIZE_V4 * SOURCE_TEXTURE_SIZE_V4 * 4,
  );
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
    pixels[offset + 3] = 255;
  }
  return {
    version: 1,
    width: SOURCE_TEXTURE_SIZE_V4,
    height: SOURCE_TEXTURE_SIZE_V4,
    colorSpace: "srgb",
    alphaMode: "opaque",
    pixels,
  };
}

const CONTRAST_APPEARANCE: RenderAppearanceV4 = {
  material: {
    family: "classic",
    treatment: "solid",
    opacity: "opaque",
    finish: "satin",
    textureScale: 100,
  },
  palette: ["#f4e55e", "#f4e55e"],
  texture: {
    generatorId: "classic-v1",
    seed: 1,
    scale: 100,
    rotation: 0,
    offsetU: 0,
    offsetV: 0,
    scope: "die-wide",
  },
  lighting: { mode: "none" },
  engraving: {
    fontId: "liberation-sans",
    finish: "luminous",
    color: "#faf9f6",
  },
  outlineColor: "#000000",
  requiresLocalSeparation: false,
  effect: null,
};

describe("V4 additive engraving legibility policy", () => {
  it("scales only Liberation Sans on r6-and-later d20 dice", () => {
    expect(
      engravingFontScaleV4(
        "canvaskit-v4-r6",
        "d20",
        "liberation-sans",
      ),
    ).toBe(D20_LIBERATION_SANS_FONT_SCALE_R6_V4);
    expect(
      engravingFontScaleV4(
        "canvaskit-v4-r7",
        "d20",
        "liberation-sans",
      ),
    ).toBe(D20_LIBERATION_SANS_FONT_SCALE_R6_V4);
    expect(
      engravingFontScaleV4(
        "canvaskit-v4-r5",
        "d20",
        "liberation-sans",
      ),
    ).toBe(1);
    expect(
      engravingFontScaleV4("canvaskit-v4-r6", "d12", "liberation-sans"),
    ).toBe(1);
    expect(
      engravingFontScaleV4("canvaskit-v4-r6", "d20", "new-rocker"),
    ).toBe(1);
  });

  it("adds a dark edge when finish-adjusted ink blends into a bright surface", () => {
    expect(
      resolveEngravingContrastEdgeV4(
        CONTRAST_APPEARANCE,
        solidTexture(246, 230, 94),
      ),
    ).toEqual({
      color: "#000000",
      opacity: 0.78,
      widthRatio: 0.028,
    });
  });

  it("protects any locally low-contrast texture pixel only when requested", () => {
    const texture = solidTexture(17, 17, 17);
    texture.pixels[0] = 246;
    texture.pixels[1] = 230;
    texture.pixels[2] = 94;

    expect(
      resolveEngravingContrastEdgeV4(CONTRAST_APPEARANCE, texture),
    ).toBeNull();
    expect(
      resolveEngravingContrastEdgeV4(
        CONTRAST_APPEARANCE,
        texture,
        false,
        true,
      ),
    ).toEqual({
      color: "#000000",
      opacity: 0.92,
      widthRatio: 0.05,
    });
  });

  it("leaves already legible engraving unchanged", () => {
    expect(
      resolveEngravingContrastEdgeV4(
        {
          ...CONTRAST_APPEARANCE,
          engraving: {
            ...CONTRAST_APPEARANCE.engraving,
            finish: "matte-ink",
            color: "#111111",
          },
        },
        solidTexture(246, 230, 94),
      ),
    ).toBeNull();
  });

  it("always edges appearances already marked for local separation", () => {
    expect(
      resolveEngravingContrastEdgeV4(
        { ...CONTRAST_APPEARANCE, requiresLocalSeparation: true },
        solidTexture(17, 17, 17),
      ),
    ).not.toBeNull();
  });
});
