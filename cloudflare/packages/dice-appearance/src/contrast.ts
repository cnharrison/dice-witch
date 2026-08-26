import type {
  AppearanceFill,
  AppearanceLightingStrength,
  AppearanceTarget,
  ResolvedAppearanceLightingV2,
  ResolvedAppearanceSurfaceV2,
} from "./types";

export const DARK_APPEARANCE_INK = "#111111" as const;
export const LIGHT_APPEARANCE_INK = "#faf9f6" as const;
export const MINIMUM_APPEARANCE_CONTRAST = 4.5;
export const MINIMUM_APPEARANCE_OUTLINE_CONTRAST = 3;
export const MINIMUM_APPEARANCE_SILHOUETTE_CONTRAST = 2;
export const APPEARANCE_GENTLE_LIGHTING_MULTIPLIER = 0.2;
export const APPEARANCE_STRONG_LIGHTING_MULTIPLIER = 5 / 3;

export type AppearanceLightingOpacities = Readonly<{
  highlight: number;
  shadow: number;
}>;

export const APPEARANCE_FACET_LIGHTING_OPACITIES = {
  d4: { highlight: 0.1, shadow: 0.14 },
  d6: { highlight: 0.12, shadow: 0.18 },
  d8: { highlight: 0.1, shadow: 0.18 },
  d10: { highlight: 0.1, shadow: 0.18 },
  d12: { highlight: 0.12, shadow: 0.2 },
  d20: { highlight: 0.11, shadow: 0.18 },
  percentile: { highlight: 0.1, shadow: 0.18 },
  fudge: { highlight: 0.12, shadow: 0.18 },
  other: { highlight: 0.2, shadow: 0.12 },
} satisfies Readonly<Record<AppearanceTarget, AppearanceLightingOpacities>>;

export const APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES = {
  gentle: { highlight: 0.03, shadow: 0.04 },
  subtle: { highlight: 0.2, shadow: 0.3 },
  strong: { highlight: 0.34, shadow: 0.5 },
} satisfies Readonly<
  Record<AppearanceLightingStrength, AppearanceLightingOpacities>
>;

export type AppearanceInkColor =
  | typeof DARK_APPEARANCE_INK
  | typeof LIGHT_APPEARANCE_INK;

export type AppearanceInkResolution = {
  textColor: AppearanceInkColor;
  minimumContrast: number;
  requiresLocalSeparation: boolean;
};

export type AppearanceOutlineColor = "#000000" | "#ffffff";

export type AppearanceOutlineResolution = {
  outlineColor: AppearanceOutlineColor;
  minimumContrast: number;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const INK_CANDIDATES: readonly AppearanceInkColor[] = [
  DARK_APPEARANCE_INK,
  LIGHT_APPEARANCE_INK,
];

function parseColor(value: string): string {
  if (!HEX_COLOR.test(value)) {
    throw new Error("Resolved appearance color must be a six-digit hex color");
  }
  return value.toLowerCase();
}

type RgbColor = readonly [number, number, number];

type ColorPath = Readonly<{
  from: RgbColor;
  to: RgbColor;
}>;

function rgbColor(color: string): RgbColor {
  const canonical = parseColor(color);
  const channel = (offset: number): number =>
    Number.parseInt(canonical.slice(offset, offset + 2), 16) / 255;
  return [channel(1), channel(3), channel(5)];
}

function linearizedChannel(color: string, offset: number): number {
  const channel =
    Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  const red = linearizedChannel(color, 1);
  const green = linearizedChannel(color, 3);
  const blue = linearizedChannel(color, 5);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

const LUMINANCE_WEIGHTS: RgbColor = [0.2126, 0.7152, 0.0722];

function linearizedValue(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearizedSlope(channel: number): number {
  return channel <= 0.04045
    ? 1 / 12.92
    : (2.4 / 1.055) * ((channel + 0.055) / 1.055) ** 1.4;
}

function pathColor(path: ColorPath, amount: number): RgbColor {
  const [fromRed, fromGreen, fromBlue] = path.from;
  const [toRed, toGreen, toBlue] = path.to;
  const interpolate = (from: number, to: number): number =>
    from + (to - from) * amount;
  return [
    interpolate(fromRed, toRed),
    interpolate(fromGreen, toGreen),
    interpolate(fromBlue, toBlue),
  ];
}

function rgbLuminance(color: RgbColor): number {
  const [red, green, blue] = color;
  const [redWeight, greenWeight, blueWeight] = LUMINANCE_WEIGHTS;
  return (
    linearizedValue(red) * redWeight +
    linearizedValue(green) * greenWeight +
    linearizedValue(blue) * blueWeight
  );
}

function pathLuminance(path: ColorPath, amount: number): number {
  return rgbLuminance(pathColor(path, amount));
}

function pathLuminanceSlope(path: ColorPath, amount: number): number {
  const [red, green, blue] = pathColor(path, amount);
  const [fromRed, fromGreen, fromBlue] = path.from;
  const [toRed, toGreen, toBlue] = path.to;
  const [redWeight, greenWeight, blueWeight] = LUMINANCE_WEIGHTS;
  return (
    linearizedSlope(red) * (toRed - fromRed) * redWeight +
    linearizedSlope(green) * (toGreen - fromGreen) * greenWeight +
    linearizedSlope(blue) * (toBlue - fromBlue) * blueWeight
  );
}

// Inverse-sRGB luminance is convex along an sRGB-linear color path, so the
// endpoints and its single possible derivative minimum bound the full path.
function pathLuminanceRange(path: ColorPath): [number, number] {
  const from = pathLuminance(path, 0);
  const to = pathLuminance(path, 1);
  let minimum = Math.min(from, to);
  if (pathLuminanceSlope(path, 0) < 0 && pathLuminanceSlope(path, 1) > 0) {
    let lower = 0;
    let upper = 1;
    for (let iteration = 0; iteration < 64; iteration += 1) {
      const middle = (lower + upper) / 2;
      if (pathLuminanceSlope(path, middle) < 0) lower = middle;
      else upper = middle;
    }
    minimum = pathLuminance(path, (lower + upper) / 2);
  }
  return [minimum, Math.max(from, to)];
}

function luminanceContrast(left: number, right: number): number {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getContrastRatio(
  foreground: string,
  background: string,
): number {
  return luminanceContrast(
    relativeLuminance(parseColor(foreground)),
    relativeLuminance(parseColor(background)),
  );
}

function activeSurfaceColors(
  colors: readonly string[],
  fill: AppearanceFill,
): string[] {
  if (colors.length < 1 || colors.length > 6) {
    throw new Error(
      "Resolved appearance palette must contain from one through six colors",
    );
  }
  if (fill.type !== "solid" && colors.length < 2) {
    throw new Error(
      "Resolved gradient and pattern fills require at least two colors",
    );
  }
  const canonicalColors = colors.map(parseColor);
  return fill.type === "solid" ? canonicalColors.slice(0, 1) : canonicalColors;
}

function constantPath(color: string): ColorPath {
  const rgb = rgbColor(color);
  return { from: rgb, to: rgb };
}

function materialColorPaths(
  surface: ResolvedAppearanceSurfaceV2,
): ColorPath[] {
  if (surface.type === "solid") {
    const [color] = activeSurfaceColors([surface.color], { type: "solid" });
    if (color === undefined) throw new Error("Resolved solid color is missing");
    return [constantPath(color)];
  }
  if (surface.type === "pattern") {
    return activeSurfaceColors(
      [surface.primaryColor, surface.secondaryColor],
      { type: "pattern", patternId: surface.patternId },
    ).map(constantPath);
  }
  const stops = activeSurfaceColors(surface.colors, { type: "gradient" });
  return stops.slice(0, -1).map((color, index) => {
    const next = stops[index + 1];
    if (next === undefined) throw new Error("Resolved gradient stop is missing");
    return { from: rgbColor(color), to: rgbColor(next) };
  });
}

function scaledOpacities(
  opacities: AppearanceLightingOpacities,
  strength: AppearanceLightingStrength,
): AppearanceLightingOpacities {
  let multiplier = 1;
  if (strength === "gentle") {
    multiplier = APPEARANCE_GENTLE_LIGHTING_MULTIPLIER;
  } else if (strength === "strong") {
    multiplier = APPEARANCE_STRONG_LIGHTING_MULTIPLIER;
  }
  return {
    highlight: opacities.highlight * multiplier,
    shadow: opacities.shadow * multiplier,
  };
}

function formLightingOpacities(
  target: AppearanceTarget,
  lighting: ResolvedAppearanceLightingV2,
): AppearanceLightingOpacities | null {
  if (target === "other") {
    const strength =
      lighting.mode === "facet" || lighting.mode === "combined"
        ? lighting.strength
        : "subtle";
    return scaledOpacities(
      APPEARANCE_FACET_LIGHTING_OPACITIES.other,
      strength,
    );
  }
  if (lighting.mode !== "facet" && lighting.mode !== "combined") return null;
  return scaledOpacities(
    APPEARANCE_FACET_LIGHTING_OPACITIES[target],
    lighting.strength,
  );
}

function directionalLightingOpacities(
  lighting: ResolvedAppearanceLightingV2,
): AppearanceLightingOpacities | null {
  return lighting.mode === "directional" || lighting.mode === "combined"
    ? APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES[lighting.strength]
    : null;
}

function overlayPath(
  path: ColorPath,
  overlayChannel: 0 | 1,
  opacity: number,
): ColorPath {
  const apply = (color: RgbColor): RgbColor => {
    const [red, green, blue] = color;
    const blend = (channel: number): number =>
      channel + (overlayChannel - channel) * opacity;
    return [blend(red), blend(green), blend(blue)];
  };
  return { from: apply(path.from), to: apply(path.to) };
}

function addLightingExtrema(
  paths: readonly ColorPath[],
  opacities: AppearanceLightingOpacities | null,
): ColorPath[] {
  if (opacities === null) return [...paths];
  return paths.flatMap((path) => [
    path,
    overlayPath(path, 1, opacities.highlight),
    overlayPath(path, 0, opacities.shadow),
  ]);
}

function treatedColorPaths(
  surface: ResolvedAppearanceSurfaceV2,
  lighting: ResolvedAppearanceLightingV2,
  target: AppearanceTarget,
): ColorPath[] {
  const formTreated = addLightingExtrema(
    materialColorPaths(surface),
    formLightingOpacities(target, lighting),
  );
  return addLightingExtrema(
    formTreated,
    directionalLightingOpacities(lighting),
  );
}

type InkScore = {
  textColor: AppearanceInkColor;
  minimum: number;
  average: number;
};

function scoreInk(
  textColor: AppearanceInkColor,
  surfaceColors: readonly string[],
): InkScore {
  const contrasts = surfaceColors.map((color) =>
    getContrastRatio(textColor, color),
  );
  return {
    textColor,
    minimum: Math.min(...contrasts),
    average:
      contrasts.reduce((total, contrast) => total + contrast, 0) /
      contrasts.length,
  };
}

function minimumPathContrast(
  foreground: string,
  paths: readonly ColorPath[],
): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const ranges = paths.map(pathLuminanceRange);
  const surfaceMinimum = Math.min(...ranges.map(([minimum]) => minimum));
  const surfaceMaximum = Math.max(...ranges.map(([, maximum]) => maximum));
  if (
    foregroundLuminance >= surfaceMinimum &&
    foregroundLuminance <= surfaceMaximum
  ) {
    return 1;
  }
  return Math.min(
    ...ranges.flatMap(([pathMinimum, pathMaximum]) => [
      luminanceContrast(foregroundLuminance, pathMinimum),
      luminanceContrast(foregroundLuminance, pathMaximum),
    ]),
  );
}

function scoreInkPaths(
  textColor: AppearanceInkColor,
  paths: readonly ColorPath[],
): InkScore {
  const inkLuminance = relativeLuminance(textColor);
  const samples = paths.flatMap((path) =>
    [0, 0.5, 1].map((amount) =>
      luminanceContrast(inkLuminance, pathLuminance(path, amount)),
    ),
  );
  return {
    textColor,
    minimum: minimumPathContrast(textColor, paths),
    average:
      samples.reduce((total, contrast) => total + contrast, 0) /
      samples.length,
  };
}

function resolveInkScores(scores: InkScore[]): AppearanceInkResolution {
  const [best] = scores.sort(
    (left, right) =>
      right.minimum - left.minimum ||
      right.average - left.average ||
      INK_CANDIDATES.indexOf(left.textColor) -
        INK_CANDIDATES.indexOf(right.textColor),
  );
  if (best === undefined) {
    throw new Error("Appearance ink candidates are not configured");
  }
  return {
    textColor: best.textColor,
    minimumContrast: Number(best.minimum.toFixed(4)),
    requiresLocalSeparation:
      best.minimum < MINIMUM_APPEARANCE_CONTRAST,
  };
}

function resolveInk(
  surfaceColors: readonly string[],
): AppearanceInkResolution {
  return resolveInkScores(
    INK_CANDIDATES.map((textColor) => scoreInk(textColor, surfaceColors)),
  );
}

function resolveInkPaths(paths: readonly ColorPath[]): AppearanceInkResolution {
  return resolveInkScores(
    INK_CANDIDATES.map((textColor) => scoreInkPaths(textColor, paths)),
  );
}

export function resolveAppearanceInk(
  colors: readonly string[],
  fill: AppearanceFill,
): AppearanceInkResolution {
  return resolveInk(activeSurfaceColors(colors, fill));
}

export function resolveAppearanceInkV2(
  surface: ResolvedAppearanceSurfaceV2,
  lighting: ResolvedAppearanceLightingV2,
  target: AppearanceTarget,
): AppearanceInkResolution {
  return resolveInkPaths(treatedColorPaths(surface, lighting, target));
}

function resolveOutlinePaths(
  paths: readonly ColorPath[],
  minimumBlackContrast: number,
  minimumWhiteContrast: number,
): AppearanceOutlineResolution {
  const blackContrast = minimumPathContrast("#000000", paths);
  const whiteContrast = minimumPathContrast("#ffffff", paths);
  const useWhite =
    blackContrast < minimumBlackContrast &&
    whiteContrast >= minimumWhiteContrast;
  return {
    outlineColor: useWhite ? "#ffffff" : "#000000",
    minimumContrast: Number(
      (useWhite ? whiteContrast : blackContrast).toFixed(4),
    ),
  };
}

export function resolveAppearanceOutlineV2(
  surface: ResolvedAppearanceSurfaceV2,
  lighting: ResolvedAppearanceLightingV2,
  target: AppearanceTarget,
): AppearanceOutlineResolution {
  return resolveOutlinePaths(
    treatedColorPaths(surface, lighting, target),
    MINIMUM_APPEARANCE_OUTLINE_CONTRAST,
    MINIMUM_APPEARANCE_OUTLINE_CONTRAST,
  );
}

export function resolveAppearanceSilhouetteOutlineV3(
  surface: ResolvedAppearanceSurfaceV2,
  lighting: ResolvedAppearanceLightingV2,
  target: AppearanceTarget,
): AppearanceOutlineResolution {
  return resolveOutlinePaths(
    treatedColorPaths(surface, lighting, target),
    MINIMUM_APPEARANCE_SILHOUETTE_CONTRAST,
    MINIMUM_APPEARANCE_OUTLINE_CONTRAST,
  );
}
