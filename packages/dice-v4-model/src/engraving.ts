import { rendererRevisionPolicyV4 } from "./renderer-revision";
import type {
  AppearanceTargetV4,
  EngravingFinishV4,
  FontIdV4,
  RenderAppearanceV4,
  RendererRevisionV4,
} from "./types";

export type EngravingLayerColorV4 = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

export type EngravingLayerRecipeV4 = {
  cavity: EngravingLayerColorV4;
  wall: EngravingLayerColorV4;
  wallBlur: number;
  ink: EngravingLayerColorV4;
  glaze: EngravingLayerColorV4;
  glazeBlur: number;
  glazeDepthFraction: number;
};

export type EngravingContrastEdgeV4 = {
  color: "#000000" | "#ffffff";
  opacity: number;
  widthRatio: number;
};

export type EngravingContrastRasterV4 = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

export const D20_LIBERATION_SANS_FONT_SCALE_R6_V4 = 0.9;
export const ENGRAVING_CONTRAST_EDGE_MINIMUM_RATIO_V4 = 3;
export const ENGRAVING_CONTRAST_EDGE_LOW_PIXEL_FRACTION_V4 = 0.02;
export const ENGRAVING_CONTRAST_EDGE_OPACITY_V4 = 0.78;
export const ENGRAVING_CONTRAST_EDGE_WIDTH_RATIO_V4 = 0.028;
export const ENGRAVING_PROTECTIVE_EDGE_OPACITY_R31_V4 = 0.92;
export const ENGRAVING_PROTECTIVE_EDGE_WIDTH_RATIO_R31_V4 = 0.05;

export function engravingFontScaleV4(
  rendererRevision: RendererRevisionV4 | undefined,
  target: AppearanceTargetV4,
  fontId: FontIdV4,
): number {
  return rendererRevision !== undefined &&
    rendererRevisionPolicyV4(rendererRevision).d20LiberationSansScale &&
    target === "d20" &&
    fontId === "liberation-sans"
    ? D20_LIBERATION_SANS_FONT_SCALE_R6_V4
    : 1;
}

function srgbLuminanceChannelV4(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminanceV4(red: number, green: number, blue: number): number {
  return (
    srgbLuminanceChannelV4(red) * 0.2126 +
    srgbLuminanceChannelV4(green) * 0.7152 +
    srgbLuminanceChannelV4(blue) * 0.0722
  );
}

function contrastRatioV4(left: number, right: number): number {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseEngravingColorV4(
  color: string,
): readonly [red: number, green: number, blue: number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error("V4 engraving contrast color must be six-digit hex");
  }
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function contrastEdgeForInkV4(
  inkLuminance: number,
  protectiveEdge: boolean,
): EngravingContrastEdgeV4 {
  return {
    color: inkLuminance < 0.5 ? "#ffffff" : "#000000",
    opacity: protectiveEdge
      ? ENGRAVING_PROTECTIVE_EDGE_OPACITY_R31_V4
      : ENGRAVING_CONTRAST_EDGE_OPACITY_V4,
    widthRatio: protectiveEdge
      ? ENGRAVING_PROTECTIVE_EDGE_WIDTH_RATIO_R31_V4
      : ENGRAVING_CONTRAST_EDGE_WIDTH_RATIO_V4,
  };
}

export function resolveEngravingContrastEdgeV4(
  appearance: RenderAppearanceV4,
  texture: EngravingContrastRasterV4,
  enhanceD4Finish = false,
  protectiveEdge = false,
): EngravingContrastEdgeV4 | null {
  const [red, green, blue] = parseEngravingColorV4(
    appearance.engraving.color,
  );
  const baseRecipe = createEngravingLayerRecipeV4(
    appearance.engraving.finish,
    red / 255,
    green / 255,
    blue / 255,
  );
  const recipe = enhanceD4Finish
    ? enhanceD4EngravingLayerRecipeV4(
        appearance.engraving.finish,
        baseRecipe,
      )
    : baseRecipe;
  const inkLuminance = luminanceV4(
    recipe.ink[0] * 255,
    recipe.ink[1] * 255,
    recipe.ink[2] * 255,
  );
  const edge = contrastEdgeForInkV4(inkLuminance, protectiveEdge);
  if (appearance.requiresLocalSeparation) return edge;

  const pixelCount = texture.width * texture.height;
  const requiredLowContrastPixels = protectiveEdge
    ? 1
    : Math.ceil(
        pixelCount * ENGRAVING_CONTRAST_EDGE_LOW_PIXEL_FRACTION_V4,
      );
  let lowContrastPixels = 0;
  for (let offset = 0; offset < texture.pixels.length; offset += 4) {
    const redChannel = texture.pixels[offset];
    const greenChannel = texture.pixels[offset + 1];
    const blueChannel = texture.pixels[offset + 2];
    if (
      redChannel === undefined ||
      greenChannel === undefined ||
      blueChannel === undefined
    ) {
      throw new Error("V4 engraving contrast texture is incomplete");
    }
    const backgroundLuminance = luminanceV4(
      redChannel,
      greenChannel,
      blueChannel,
    );
    if (
      contrastRatioV4(inkLuminance, backgroundLuminance) <
      ENGRAVING_CONTRAST_EDGE_MINIMUM_RATIO_V4
    ) {
      lowContrastPixels += 1;
      if (lowContrastPixels >= requiredLowContrastPixels) return edge;
    }
  }
  return null;
}

export function enhanceD4EngravingLayerRecipeV4(
  finish: EngravingFinishV4,
  recipe: EngravingLayerRecipeV4,
): EngravingLayerRecipeV4 {
  if (finish === "enamel") {
    return {
      ...recipe,
      wallBlur: 0.04,
      ink: [
        brightenChannelV4(recipe.ink[0], 0.12),
        brightenChannelV4(recipe.ink[1], 0.12),
        brightenChannelV4(recipe.ink[2], 0.12),
        1,
      ],
      glaze: [1, 1, 1, 0.85],
      glazeBlur: 0.08,
      glazeDepthFraction: -1.2,
    };
  }
  if (finish === "metallic") {
    return {
      ...recipe,
      wallBlur: 0.28,
      ink: [
        brightenChannelV4(recipe.ink[0], 0.25),
        brightenChannelV4(recipe.ink[1], 0.25),
        brightenChannelV4(recipe.ink[2], 0.25),
        1,
      ],
      glaze: [recipe.glaze[0], recipe.glaze[1], recipe.glaze[2], 0.78],
      glazeBlur: 0.38,
      glazeDepthFraction: -0.72,
    };
  }
  if (finish === "luminous") {
    return {
      ...recipe,
      wallBlur: 0.7,
      ink: [
        brightenChannelV4(recipe.ink[0], 0.35),
        brightenChannelV4(recipe.ink[1], 0.35),
        brightenChannelV4(recipe.ink[2], 0.35),
        1,
      ],
      glaze: [recipe.glaze[0], recipe.glaze[1], recipe.glaze[2], 0.9],
      glazeBlur: 1,
    };
  }
  return recipe;
}

function brightenChannelV4(channel: number, amount: number): number {
  return channel + (1 - channel) * amount;
}

export function createEngravingLayerRecipeV4(
  finish: EngravingFinishV4,
  red: number,
  green: number,
  blue: number,
): EngravingLayerRecipeV4 {
  if (
    [red, green, blue].some(
      (channel) => !Number.isFinite(channel) || channel < 0 || channel > 1,
    )
  ) {
    throw new Error("V4 engraving color component must be from 0 through 1");
  }
  switch (finish) {
    case "matte-ink":
      return {
        cavity: [0.01, 0.005, 0.02, 0.98],
        wall: [0.38, 0.28, 0.16, 0.98],
        wallBlur: 0.018,
        ink: [red, green, blue, 1],
        glaze: [red, green, blue, 0.24],
        glazeBlur: 0.018,
        glazeDepthFraction: 0,
      };
    case "enamel":
      return {
        cavity: [0.01, 0.005, 0.02, 0.98],
        wall: [red * 0.24, green * 0.24, blue * 0.24, 0.98],
        wallBlur: 0.02,
        ink: [red, green, blue, 1],
        glaze: [
          brightenChannelV4(red, 0.72),
          brightenChannelV4(green, 0.72),
          brightenChannelV4(blue, 0.72),
          0.42,
        ],
        glazeBlur: 0.025,
        glazeDepthFraction: -0.32,
      };
    case "metallic":
      return {
        cavity: [0.01, 0.005, 0.02, 0.98],
        wall: [
          red * 0.28 + 0.06,
          green * 0.28 + 0.06,
          blue * 0.28 + 0.06,
          0.98,
        ],
        wallBlur: 0.016,
        ink: [
          red * 0.72 + 0.16,
          green * 0.72 + 0.16,
          blue * 0.72 + 0.16,
          1,
        ],
        glaze: [
          brightenChannelV4(red, 0.8),
          brightenChannelV4(green, 0.8),
          brightenChannelV4(blue, 0.8),
          0.52,
        ],
        glazeBlur: 0.022,
        glazeDepthFraction: -0.55,
      };
    case "luminous":
      return {
        cavity: [red * 0.025, green * 0.025, blue * 0.025, 0.98],
        wall: [
          brightenChannelV4(red, 0.25),
          brightenChannelV4(green, 0.25),
          brightenChannelV4(blue, 0.25),
          0.98,
        ],
        wallBlur: 0.035,
        ink: [
          brightenChannelV4(red, 0.34),
          brightenChannelV4(green, 0.34),
          brightenChannelV4(blue, 0.34),
          1,
        ],
        glaze: [
          brightenChannelV4(red, 0.9),
          brightenChannelV4(green, 0.9),
          brightenChannelV4(blue, 0.9),
          0.65,
        ],
        glazeBlur: 0.045,
        glazeDepthFraction: 0,
      };
    case "void":
      return {
        cavity: [0, 0, 0, 0.99],
        wall: [red * 0.08, green * 0.08, blue * 0.08, 0.98],
        wallBlur: 0.014,
        ink: [red * 0.025, green * 0.025, blue * 0.025, 1],
        glaze: [red * 0.16, green * 0.16, blue * 0.16, 0.18],
        glazeBlur: 0.016,
        glazeDepthFraction: 0.12,
      };
    default:
      throw new Error(`V4 engraving finish is invalid: ${String(finish)}`);
  }
}
