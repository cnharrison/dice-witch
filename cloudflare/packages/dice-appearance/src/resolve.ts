import {
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  canonicalJsonV4,
  deriveAppearanceSeedV4,
  deriveNamedSeedV4,
  hashStringV4,
  materialDefaultPolyhedralFormV4,
  resolveAppearanceSelectionV4,
  resolveCompatiblePolyhedralFormV4,
  type AppearanceMaterialV4,
  type AppearanceRecipeV3,
  type EngravingFinishV4,
  type LinearDirectionV4,
  type RenderLightingV4,
  type TextureScopeV4,
} from "@dice-witch/dice-v4-model";
import {
  isBuiltinRandomRecipeV3,
  randomSpecialMaterialV3,
} from "./catalog";
import {
  LIGHT_APPEARANCE_INK,
  resolveAppearanceInk,
  resolveAppearanceInkV2,
  type AppearanceInkResolution,
} from "./contrast";
import { legacyAppearanceRecipeV1 } from "./migrate";
import {
  APPEARANCE_TARGETS,
  type AppearanceFill,
  type AppearanceRecipeV1,
  type AppearanceRecipeV2,
  type AppearanceResolutionContext,
  type AppearanceResolutionContextV3,
  type AppearanceSelection,
  type ResolvedAppearanceLightingV2,
  type ResolvedAppearanceSurfaceV2,
  type ResolvedAppearanceV1,
  type ResolvedAppearanceV2,
  type ResolvedAppearanceV3,
} from "./types";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextUint32(): number {
    this.state = (this.state + 0x6d2b_79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  index(length: number): number {
    if (!Number.isSafeInteger(length) || length < 1) {
      throw new Error("Appearance resolution selection is empty");
    }
    return this.nextUint32() % length;
  }
}

function hashString(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function canonicalColor(value: string): string {
  if (!HEX_COLOR.test(value)) {
    throw new Error("Appearance recipe color must be a six-digit hex color");
  }
  return value.toLowerCase();
}

function validateContext(context: AppearanceResolutionContext): void {
  if (
    !Number.isInteger(context.renderSeed) ||
    context.renderSeed < 0 ||
    context.renderSeed > 0xffff_ffff
  ) {
    throw new Error("Appearance render seed must be an unsigned 32-bit integer");
  }
  if (!Number.isSafeInteger(context.groupIndex) || context.groupIndex < 0) {
    throw new Error("Appearance group index must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(context.dieIndex) || context.dieIndex < 0) {
    throw new Error("Appearance die index must be a non-negative safe integer");
  }
  if (!APPEARANCE_TARGETS.includes(context.target)) {
    throw new Error("Appearance resolution target is not supported");
  }
}

type SeededRecipe = AppearanceRecipeV1 | AppearanceRecipeV2;

function scopeKey(
  recipe: SeededRecipe,
  context: AppearanceResolutionContext,
): string {
  if (recipe.varyBy === "roll") {
    return `${String(context.renderSeed)}:roll`;
  }
  if (recipe.varyBy === "group") {
    return `${String(context.renderSeed)}:group:${String(context.groupIndex)}`;
  }
  return `${String(context.renderSeed)}:die:${String(context.groupIndex)}:${String(context.dieIndex)}:${context.target}`;
}

function scopedSeed(
  recipe: SeededRecipe,
  context: AppearanceResolutionContext,
): number {
  if (recipe.variation === "fixed") {
    return hashString(JSON.stringify(recipe));
  }
  return hashString(`${scopeKey(recipe, context)}:${recipe.variation}`);
}

function randomColor(random: DeterministicRandom): string {
  return `#${(random.nextUint32() & 0xff_ffff).toString(16).padStart(6, "0")}`;
}

function distinctPair(primary: string, candidate: string): [string, string] {
  if (candidate !== primary) return [primary, candidate];
  const complement = Number.parseInt(primary.slice(1), 16) ^ 0xff_ffff;
  return [primary, `#${complement.toString(16).padStart(6, "0")}`];
}

function distinctRandomPair(
  random: DeterministicRandom,
): [string, string] {
  return distinctPair(randomColor(random), randomColor(random));
}

function colorDistance(first: string, second: string): number {
  return Math.hypot(
    ...[1, 3, 5].map(
      (offset) =>
        Number.parseInt(first.slice(offset, offset + 2), 16) -
        Number.parseInt(second.slice(offset, offset + 2), 16),
    ),
  );
}

function distinctRandomPartnerR27(
  primary: string,
  random: DeterministicRandom,
): string {
  const candidate = randomColor(random);
  if (colorDistance(primary, candidate) >= 110) return candidate;
  if (
    colorDistance(primary, "#000000") >=
    colorDistance(primary, "#ffffff")
  ) {
    return "#000000";
  }
  return "#ffffff";
}

type VividPairFamily = "bright" | "dark";

type GeneratedVividPair = {
  colors: [string, string];
  family: VividPairFamily;
};

function hexChannel(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

function hsvColor(hue: number, saturation: number, value: number): string {
  const chroma = value * saturation;
  const segment = (((hue % 360) + 360) % 360) / 60;
  const intermediate = chroma * (1 - Math.abs((segment % 2) - 1));
  let channels: [number, number, number];
  if (segment < 1) channels = [chroma, intermediate, 0];
  else if (segment < 2) channels = [intermediate, chroma, 0];
  else if (segment < 3) channels = [0, chroma, intermediate];
  else if (segment < 4) channels = [0, intermediate, chroma];
  else if (segment < 5) channels = [intermediate, 0, chroma];
  else channels = [chroma, 0, intermediate];
  const match = value - chroma;
  return `#${channels
    .map((channel) => hexChannel((channel + match) * 255))
    .join("")}`;
}

function vividRandomPair(random: DeterministicRandom): GeneratedVividPair {
  const family: VividPairFamily =
    random.index(2) === 0 ? "dark" : "bright";
  const independent = random.index(2) === 0;
  const hue = random.nextFloat() * 360;
  const primary = hsvColor(
    hue,
    0.78 + random.nextFloat() * 0.22,
    0.88 + random.nextFloat() * 0.12,
  );
  if (independent) {
    const direction = random.index(2) === 0 ? -1 : 1;
    const secondaryHue = hue + direction * (60 + random.nextFloat() * 240);
    return {
      colors: distinctPair(
        primary,
        hsvColor(
          secondaryHue,
          0.78 + random.nextFloat() * 0.22,
          0.82 + random.nextFloat() * 0.18,
        ),
      ),
      family,
    };
  }
  return {
    colors: distinctPair(
      primary,
      hsvColor(
        hue + (random.nextFloat() - 0.5) * 24,
        0.72 + random.nextFloat() * 0.24,
        0.5 + random.nextFloat() * 0.22,
      ),
    ),
    family,
  };
}

function vividRandomPairR27(random: DeterministicRandom): GeneratedVividPair {
  const hue = random.nextFloat() * 360;
  const separation = 72 + random.nextFloat() * 216;
  const direction = random.index(2) === 0 ? -1 : 1;
  return {
    colors: distinctPair(
      hsvColor(
        hue,
        0.78 + random.nextFloat() * 0.2,
        0.88 + random.nextFloat() * 0.12,
      ),
      hsvColor(
        hue + direction * separation,
        0.78 + random.nextFloat() * 0.2,
        0.88 + random.nextFloat() * 0.12,
      ),
    ),
    family: "bright",
  };
}

function adjustedVividColor(
  color: string,
  family: VividPairFamily,
  level: number,
): string {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
  return `#${channels
    .map((channel) =>
      hexChannel(
        family === "dark"
          ? (channel * level) / 255
          : 255 - ((255 - channel) * level) / 255,
      ),
    )
    .join("")}`;
}

function mixColor(color: string, target: number, amount: number): string {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
  return `#${channels
    .map((channel) =>
      Math.round(channel + (target - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function tonalAmount(
  variation: AppearanceRecipeV1["variation"],
  random: DeterministicRandom,
): number {
  if (variation === "fixed") return 0.35;
  if (variation === "curated") return 0.25 + random.nextFloat() * 0.15;
  return 0.15 + random.nextFloat() * 0.4;
}

function tonalPartner(
  primaryColor: string,
  variation: AppearanceRecipeV1["variation"],
  random: DeterministicRandom,
): string {
  const brightness = [1, 3, 5]
    .map((offset) => Number.parseInt(primaryColor.slice(offset, offset + 2), 16))
    .reduce((total, channel) => total + channel, 0) / 3;
  return mixColor(
    primaryColor,
    brightness < 128 ? 255 : 0,
    tonalAmount(variation, random),
  );
}

function requiredSelection<T>(
  values: readonly T[],
  index: number,
  message: string,
): T {
  const value = values[index];
  if (value === undefined) throw new Error(message);
  return value;
}

function resolveColors(
  recipe: Pick<AppearanceRecipeV1, "colors" | "variation">,
  random: DeterministicRandom,
): [string, string] {
  if (recipe.colors.mode === "tonal") {
    const primaryColor = canonicalColor(recipe.colors.primary);
    return [
      primaryColor,
      tonalPartner(primaryColor, recipe.variation, random),
    ];
  }
  if (recipe.colors.mode === "random") {
    return [canonicalColor(recipe.colors.primary), randomColor(random)];
  }
  const colors = recipe.colors.colors.map(canonicalColor);
  if (colors.length < 2) {
    throw new Error("Appearance palette must contain at least two colors");
  }
  if (recipe.variation === "fixed") {
    return [
      requiredSelection(colors, 0, "Appearance palette is empty"),
      requiredSelection(colors, 1, "Appearance palette requires two colors"),
    ];
  }
  const primaryIndex = random.index(colors.length);
  const secondaryIndex =
    recipe.variation === "curated"
      ? (primaryIndex + 1) % colors.length
      : (primaryIndex + 1 + random.index(colors.length - 1)) % colors.length;
  return [
    requiredSelection(colors, primaryIndex, "Appearance primary color is missing"),
    requiredSelection(
      colors,
      secondaryIndex,
      "Appearance secondary color is missing",
    ),
  ];
}

function cloneFill(fill: AppearanceFill): AppearanceFill {
  return fill.type === "pattern"
    ? { type: "pattern", patternId: fill.patternId }
    : { type: fill.type };
}

function weightedOption<T extends { weight: number }>(
  options: readonly T[],
  random: DeterministicRandom,
  fixed: boolean,
  message: string,
): T {
  if (fixed) return requiredSelection(options, 0, message);
  const totalWeight = options.reduce((total, { weight }) => total + weight, 0);
  let selection = random.index(totalWeight);
  for (const option of options) {
    if (selection < option.weight) return option;
    selection -= option.weight;
  }
  throw new Error(message);
}

function resolveFill(
  recipe: Pick<AppearanceRecipeV1, "fill" | "variation">,
  random: DeterministicRandom,
): AppearanceFill {
  if (recipe.fill.mode === "fixed") return cloneFill(recipe.fill.value);
  if (recipe.fill.mode === "weighted") {
    return cloneFill(
      weightedOption(
        recipe.fill.options,
        random,
        recipe.variation === "fixed",
        "Appearance fill selection is empty",
      ).value,
    );
  }
  const index =
    recipe.variation === "fixed" ? 0 : random.index(recipe.fill.values.length);
  return cloneFill(
    requiredSelection(
      recipe.fill.values,
      index,
      "Appearance fill selection is empty",
    ),
  );
}

function resolveFont(
  recipe: Pick<AppearanceRecipeV1, "font" | "variation">,
  random: DeterministicRandom,
): string {
  if (recipe.font.mode === "fixed") return recipe.font.fontId;
  if (recipe.font.mode === "weighted") {
    return weightedOption(
      recipe.font.options,
      random,
      recipe.variation === "fixed",
      "Appearance font selection is empty",
    ).fontId;
  }
  const index =
    recipe.variation === "fixed" ? 0 : random.index(recipe.font.fontIds.length);
  return requiredSelection(
    recipe.font.fontIds,
    index,
    "Appearance font selection is empty",
  );
}

export function resolveAppearanceRecipe(
  recipe: AppearanceRecipeV1,
  context: AppearanceResolutionContext,
): ResolvedAppearanceV1 {
  validateContext(context);
  const random = new DeterministicRandom(scopedSeed(recipe, context));
  const [primaryColor, secondaryColor] = resolveColors(recipe, random);
  const fill = resolveFill(recipe, random);
  const fontId = resolveFont(recipe, random);
  const activeColors =
    fill.type === "solid"
      ? [primaryColor]
      : [primaryColor, secondaryColor];
  const ink = resolveAppearanceInk(activeColors, fill);
  return {
    version: 1,
    primaryColor,
    secondaryColor,
    textColor: ink.textColor,
    outlineColor: "#000000",
    fill,
    fontId,
    requiresLocalSeparation: ink.requiresLocalSeparation,
  };
}

type NativeColors = {
  ordered: [string, string, ...string[]];
  pair: [string, string];
};

function gradientColors(
  values: readonly string[],
): [string, string, ...string[]] {
  const first = requiredSelection(
    values,
    0,
    "Appearance gradient requires two colors",
  );
  const second = requiredSelection(
    values,
    1,
    "Appearance gradient requires two colors",
  );
  return [first, second, ...values.slice(2)];
}

function resolveNativeColors(
  recipe: Pick<AppearanceRecipeV3, "colors" | "variation">,
  random: DeterministicRandom,
): NativeColors {
  const source = recipe.colors;
  if (source.mode === "random-pair") {
    const pair = distinctRandomPair(random);
    return { ordered: [...pair], pair };
  }
  if (source.mode === "vivid-random-pair") {
    throw new Error("Vivid random colors require resolved treatment");
  }
  if (source.mode === "tonal" || source.mode === "random") {
    const pair = resolveColors(
      {
        colors: { mode: source.mode, primary: source.primary },
        variation: recipe.variation,
      },
      random,
    );
    return { ordered: [...pair], pair };
  }
  if (!("colors" in source)) {
    throw new Error("Appearance colors are not supported");
  }
  const colors = source.colors.map(canonicalColor);
  if (colors.length < 2) {
    throw new Error("Appearance palette must contain at least two colors");
  }
  let ordered = [...colors];
  if (recipe.variation !== "fixed") {
    const start = random.index(colors.length);
    ordered = [...colors.slice(start), ...colors.slice(0, start)];
    if (recipe.variation === "wild" && random.index(2) === 1) {
      const first = requiredSelection(
        ordered,
        0,
        "Appearance primary color is missing",
      );
      ordered = [first, ...ordered.slice(1).reverse()];
    }
  }

  const resolved = gradientColors(ordered);
  const secondaryIndex =
    recipe.variation === "wild"
      ? 1 + random.index(resolved.length - 1)
      : 1;
  return {
    ordered: resolved,
    pair: [
      resolved[0],
      requiredSelection(
        resolved,
        secondaryIndex,
        "Appearance secondary color is missing",
      ),
    ],
  };
}

function resolveValueSelection<Value extends string>(
  selection: AppearanceSelection<Value>,
  random: DeterministicRandom,
  fixed: boolean,
  message: string,
): Value {
  if (selection.mode === "fixed") return selection.value;
  if (selection.mode === "weighted") {
    return weightedOption(selection.options, random, fixed, message).value;
  }
  const index = fixed ? 0 : random.index(selection.values.length);
  return requiredSelection(selection.values, index, message);
}

function resolveNativeSurface(
  recipe: AppearanceRecipeV2,
  colors: NativeColors,
  fill: AppearanceFill,
  random: DeterministicRandom,
): ResolvedAppearanceSurfaceV2 {
  if (fill.type === "solid") {
    return { type: "solid", color: colors.pair[0] };
  }
  if (fill.type === "pattern") {
    return {
      type: "pattern",
      patternId: fill.patternId,
      primaryColor: colors.pair[0],
      secondaryColor: colors.pair[1],
    };
  }
  const fixed = recipe.variation === "fixed";
  return {
    type: "gradient",
    colors: colors.ordered,
    scope: resolveValueSelection(
      recipe.gradient.scope,
      random,
      fixed,
      "Appearance gradient scope selection is empty",
    ),
    direction: resolveValueSelection(
      recipe.gradient.direction,
      random,
      fixed,
      "Appearance gradient direction selection is empty",
    ),
  };
}

function resolveNativeLighting(
  recipe: AppearanceRecipeV2,
  random: DeterministicRandom,
): ResolvedAppearanceLightingV2 {
  const fixed = recipe.variation === "fixed";
  const mode = resolveValueSelection(
    recipe.lighting.mode,
    random,
    fixed,
    "Appearance lighting mode selection is empty",
  );
  if (mode === "none") return { mode };
  const strength = resolveValueSelection(
    recipe.lighting.strength,
    random,
    fixed,
    "Appearance lighting strength selection is empty",
  );
  if (mode === "facet") return { mode, strength };
  return {
    mode,
    strength,
    direction: resolveValueSelection(
      recipe.lighting.direction,
      random,
      fixed,
      "Appearance lighting direction selection is empty",
    ),
  };
}

function legacySurface(
  resolved: ResolvedAppearanceV1,
): ResolvedAppearanceSurfaceV2 {
  if (resolved.fill.type === "solid") {
    return { type: "solid", color: resolved.primaryColor };
  }
  if (resolved.fill.type === "gradient") {
    return {
      type: "gradient",
      colors: [resolved.primaryColor, resolved.secondaryColor],
      scope: "repeated",
      direction: "top-to-bottom",
    };
  }
  return {
    type: "pattern",
    patternId: resolved.fill.patternId,
    primaryColor: resolved.primaryColor,
    secondaryColor: resolved.secondaryColor,
  };
}

function surfaceWithVividPair(
  surface: ResolvedAppearanceSurfaceV2,
  pair: [string, string],
): ResolvedAppearanceSurfaceV2 {
  if (surface.type === "solid") {
    return { type: "solid", color: pair[0] };
  }
  if (surface.type === "gradient") {
    return { ...surface, colors: pair };
  }
  return {
    ...surface,
    primaryColor: pair[0],
    secondaryColor: pair[1],
  };
}

type VividSurfaceResolution = Pick<
  ResolvedAppearanceV2,
  "requiresLocalSeparation" | "surface" | "textColor"
>;

function searchAccessibleVividSurface(
  generated: GeneratedVividPair,
  family: VividPairFamily,
  surface: ResolvedAppearanceSurfaceV2,
  lighting: ResolvedAppearanceLightingV2,
  target: AppearanceResolutionContext["target"],
): VividSurfaceResolution | null {
  const expectedInk = family === "dark" ? "#faf9f6" : "#111111";
  let lower = 0;
  let upper = 255;
  let resolved:
    | {
        pair: [string, string];
        surface: ResolvedAppearanceSurfaceV2;
      }
    | undefined;
  while (lower <= upper) {
    const level = Math.floor((lower + upper) / 2);
    const candidatePair = generated.colors.map((color) =>
      adjustedVividColor(color, family, level),
    ) as [string, string];
    const candidateSurface = surfaceWithVividPair(surface, candidatePair);
    const candidateInk = resolveAppearanceInkV2(
      candidateSurface,
      lighting,
      target,
    );
    const accessible =
      !candidateInk.requiresLocalSeparation &&
      candidateInk.textColor === expectedInk;
    if (accessible) {
      resolved = { pair: candidatePair, surface: candidateSurface };
      lower = level + 1;
    } else {
      upper = level - 1;
    }
  }
  if (resolved === undefined || resolved.pair[0] === resolved.pair[1]) {
    return null;
  }
  return {
    surface: resolved.surface,
    textColor: expectedInk,
    requiresLocalSeparation: false,
  };
}

function vividContrastTarget(
  family: VividPairFamily,
  lighting: ResolvedAppearanceLightingV2,
  target: AppearanceResolutionContext["target"],
): AppearanceResolutionContext["target"] {
  if (lighting.mode !== "combined" || lighting.strength !== "gentle") {
    return target;
  }
  // These opposite Gentle extrema preserve the approved Random palette across
  // shapes while bounding every current target for the selected ink family.
  return family === "dark" ? "other" : "d12";
}

function accessibleVividSurface(
  generated: GeneratedVividPair,
  family: VividPairFamily,
  surface: ResolvedAppearanceSurfaceV2,
  lighting: ResolvedAppearanceLightingV2,
  target: AppearanceResolutionContext["target"],
): VividSurfaceResolution | null {
  const contrastTarget = vividContrastTarget(family, lighting, target);
  const bounded = searchAccessibleVividSurface(
    generated,
    family,
    surface,
    lighting,
    contrastTarget,
  );
  if (bounded !== null) {
    const actualInk = resolveAppearanceInkV2(
      bounded.surface,
      lighting,
      target,
    );
    if (
      !actualInk.requiresLocalSeparation &&
      actualInk.textColor === bounded.textColor
    ) {
      return bounded;
    }
  }
  if (contrastTarget === target) return null;
  return searchAccessibleVividSurface(
    generated,
    family,
    surface,
    lighting,
    target,
  );
}

function resolveVividSurface(
  generated: GeneratedVividPair,
  surface: ResolvedAppearanceSurfaceV2,
  lighting: ResolvedAppearanceLightingV2,
  target: AppearanceResolutionContext["target"],
): VividSurfaceResolution {
  const preferred = accessibleVividSurface(
    generated,
    generated.family,
    surface,
    lighting,
    target,
  );
  if (preferred !== null) return preferred;

  const alternative = accessibleVividSurface(
    generated,
    generated.family === "dark" ? "bright" : "dark",
    surface,
    lighting,
    target,
  );
  if (alternative !== null) return alternative;

  // Strong directional fields can leave a generated two-color surface with
  // too much luminance range for either ink to reach 4.5:1. Preserve the
  // explicit lighting choice and use the existing physical separation layer.
  const unresolvedSurface = surfaceWithVividPair(surface, generated.colors);
  const ink = resolveAppearanceInkV2(unresolvedSurface, lighting, target);
  return {
    surface: unresolvedSurface,
    textColor: ink.textColor,
    requiresLocalSeparation: ink.requiresLocalSeparation,
  };
}

function resolvedTextColor(
  value: string,
): ResolvedAppearanceV2["textColor"] {
  if (value === "#111111" || value === "#faf9f6") return value;
  throw new Error("Resolved appearance text color is invalid");
}

export function resolveAppearanceRecipeV2(
  recipe: AppearanceRecipeV2,
  context: AppearanceResolutionContext,
): ResolvedAppearanceV2 {
  validateContext(context);
  if (recipe.compatibility === "legacy-v1") {
    const legacy = resolveAppearanceRecipe(
      legacyAppearanceRecipeV1(recipe),
      context,
    );
    return {
      version: 2,
      compatibility: "legacy-v1",
      surface: legacySurface(legacy),
      lighting: { mode: "facet", strength: "subtle" },
      textColor: resolvedTextColor(legacy.textColor),
      outlineColor: legacy.outlineColor,
      fontId: legacy.fontId,
      requiresLocalSeparation: legacy.requiresLocalSeparation,
    };
  }

  const random = new DeterministicRandom(scopedSeed(recipe, context));
  if (recipe.colors.mode === "vivid-random-pair") {
    const generated = vividRandomPair(random);
    const initialColors: NativeColors = {
      ordered: [...generated.colors],
      pair: generated.colors,
    };
    const fill = resolveFill(recipe, random);
    const fontId = resolveFont(recipe, random);
    const surface = resolveNativeSurface(
      recipe,
      initialColors,
      fill,
      random,
    );
    const lighting = resolveNativeLighting(recipe, random);
    return {
      version: 2,
      compatibility: "native-v2",
      ...resolveVividSurface(generated, surface, lighting, context.target),
      lighting,
      outlineColor: "#000000",
      fontId,
    };
  }

  const colors = resolveNativeColors(recipe, random);
  const fill = resolveFill(recipe, random);
  const fontId = resolveFont(recipe, random);
  const surface = resolveNativeSurface(recipe, colors, fill, random);
  const lighting = resolveNativeLighting(recipe, random);
  const ink = resolveAppearanceInkV2(surface, lighting, context.target);
  return {
    version: 2,
    compatibility: "native-v2",
    surface,
    lighting,
    textColor: ink.textColor,
    outlineColor: "#000000",
    fontId,
    requiresLocalSeparation: ink.requiresLocalSeparation,
  };
}

const TEXTURE_ROTATION_BY_DIRECTION_V3 = {
  "left-to-right": 0,
  "upper-left-to-lower-right": 45,
  "top-to-bottom": 90,
  "upper-right-to-lower-left": 135,
  "right-to-left": 180,
  "lower-right-to-upper-left": 225,
  "bottom-to-top": 270,
  "lower-left-to-upper-right": 315,
} as const satisfies Record<LinearDirectionV4, number>;

function namedRandomV3(seed: number, stream: string): DeterministicRandom {
  return new DeterministicRandom(deriveNamedSeedV4(seed, stream));
}

export type AppearanceResolutionSeedPolicyV3 =
  | "legacy"
  | "property-streams-r26"
  | "property-streams-r27"
  | "property-streams-r28"
  | "property-streams-r29";

function usesR27ColorBehaviorV3(
  policy: AppearanceResolutionSeedPolicyV3,
): boolean {
  return (
    policy === "property-streams-r27" ||
    policy === "property-streams-r28" ||
    policy === "property-streams-r29"
  );
}

function propertyScopeV3(
  recipe: AppearanceRecipeV3,
  context: AppearanceResolutionContextV3,
  sharedAcrossDice: boolean,
): string {
  if (sharedAcrossDice || recipe.varyBy === "roll") {
    return `${String(context.renderSeed)}:roll:${recipe.variation}`;
  }
  if (recipe.varyBy === "group") {
    return context.groupIdentity === undefined
      ? `${String(context.renderSeed)}:group:${String(context.groupIndex)}:${recipe.variation}`
      : `${String(context.renderSeed)}:group-id:${context.groupIdentity}:${recipe.variation}`;
  }
  return context.dieIdentity === undefined
    ? `${String(context.renderSeed)}:die:${String(context.groupIndex)}:${String(context.dieIndex)}:${context.target}:${recipe.variation}`
    : `${String(context.renderSeed)}:die-id:${context.dieIdentity}:${context.target}:${recipe.variation}`;
}

function propertySeedV3(
  recipe: AppearanceRecipeV3,
  context: AppearanceResolutionContextV3,
  seed: number,
  policy: AppearanceResolutionSeedPolicyV3,
  stream: string,
  value: unknown,
  sharedAcrossDice = false,
): number {
  if (policy === "legacy") return seed;
  if (policy === "property-streams-r26") {
    if (recipe.variation !== "fixed") return seed;
    return hashStringV4(`fixed-r26:${stream}:${canonicalJsonV4(value)}`);
  }
  const usesPerDieRandomPalette =
    (policy === "property-streams-r28" ||
      policy === "property-streams-r29") &&
    usesFullSpectrumRandomizationV3(recipe);
  const sharePropertyAcrossDice = sharedAcrossDice && !usesPerDieRandomPalette;
  return hashStringV4(
    `property-r27:${propertyScopeV3(recipe, context, sharePropertyAcrossDice)}:${stream}:${canonicalJsonV4(value)}`,
  );
}

function propertyRandomV3(
  recipe: AppearanceRecipeV3,
  context: AppearanceResolutionContextV3,
  seed: number,
  policy: AppearanceResolutionSeedPolicyV3,
  stream: string,
  value: unknown,
): DeterministicRandom {
  return namedRandomV3(
    propertySeedV3(recipe, context, seed, policy, stream, value),
    stream,
  );
}

function resolveColorsV3(
  recipe: AppearanceRecipeV3,
  random: DeterministicRandom,
  seedPolicy: AppearanceResolutionSeedPolicyV3,
): NativeColors {
  if (recipe.colors.mode === "vivid-random-pair") {
    const pair = (usesR27ColorBehaviorV3(seedPolicy)
      ? vividRandomPairR27(random)
      : vividRandomPair(random)).colors;
    return { ordered: [...pair], pair };
  }
  if (
    recipe.colors.mode === "random-pair" &&
    usesR27ColorBehaviorV3(seedPolicy)
  ) {
    const primary = randomColor(random);
    const pair: [string, string] = [
      primary,
      distinctRandomPartnerR27(primary, random),
    ];
    return { ordered: [...pair], pair };
  }
  if (
    recipe.colors.mode === "random" &&
    usesR27ColorBehaviorV3(seedPolicy)
  ) {
    const primary = canonicalColor(recipe.colors.primary);
    const pair: [string, string] = [
      primary,
      distinctRandomPartnerR27(primary, random),
    ];
    return { ordered: [...pair], pair };
  }
  if (
    recipe.colors.mode === "tonal" &&
    usesR27ColorBehaviorV3(seedPolicy)
  ) {
    const primary = canonicalColor(recipe.colors.primary);
    const brightness = [1, 3, 5]
      .map((offset) => Number.parseInt(primary.slice(offset, offset + 2), 16))
      .reduce((total, channel) => total + channel, 0) / 3;
    const pair: [string, string] = [
      primary,
      mixColor(primary, brightness < 128 ? 255 : 0, 0.5),
    ];
    return { ordered: [...pair], pair };
  }
  const resolved = resolveNativeColors(recipe, random);
  if (new Set(resolved.ordered).size >= 2) return resolved;
  const pair = distinctPair(resolved.pair[0], resolved.pair[1]);
  return { ordered: [...pair], pair };
}

function colorsFromPaletteV3(
  palette: readonly [string, string, ...string[]],
): NativeColors {
  const ordered: [string, string, ...string[]] = [
    palette[0],
    palette[1],
    ...palette.slice(2),
  ];
  return { ordered, pair: [ordered[0], ordered[1]] };
}

function fullSpectrumGradientColorsV3(seed: number): NativeColors {
  const stopCount =
    2 + namedRandomV3(seed, "gradient-stop-count").index(5);
  const random = namedRandomV3(seed, "gradient-colors");
  const bright = random.index(2) === 0;
  const direction = random.index(2) === 0 ? -1 : 1;
  const baseHue = random.nextFloat() * 360;
  const colors = Array.from({ length: stopCount }, (_, index) =>
    hsvColor(
      baseHue +
        direction * index * (360 / stopCount) +
        (random.nextFloat() - 0.5) * 12,
      0.78 + random.nextFloat() * 0.22,
      bright
        ? 0.84 + random.nextFloat() * 0.16
        : 0.34 + random.nextFloat() * 0.2,
    ),
  );
  const first = colors[0];
  const second = colors[1];
  if (first === undefined || second === undefined) {
    throw new Error("Full-spectrum gradient requires at least two colors");
  }
  return {
    ordered: [first, second, ...colors.slice(2)],
    pair: [first, second],
  };
}

function usesFullSpectrumRandomizationV3(
  recipe: AppearanceRecipeV3,
): boolean {
  return (
    recipe.randomization === "full-spectrum-v1" ||
    recipe.randomization === "full-spectrum-v2"
  );
}

function resolveRandomizedColorsV3(
  recipe: AppearanceRecipeV3,
  material: AppearanceMaterialV4,
  seed: number,
  seedPolicy: AppearanceResolutionSeedPolicyV3,
  authoredPalette?: readonly [string, string, ...string[]],
): NativeColors {
  if (usesFullSpectrumRandomizationV3(recipe) && authoredPalette !== undefined) {
    return colorsFromPaletteV3(authoredPalette);
  }
  if (
    usesFullSpectrumRandomizationV3(recipe) &&
    material.family === "classic" &&
    material.treatment === "gradient"
  ) {
    return fullSpectrumGradientColorsV3(seed);
  }
  return resolveColorsV3(recipe, namedRandomV3(seed, "colors"), seedPolicy);
}

function resolveLightingV3(
  recipe: AppearanceRecipeV3,
  seed: number,
): RenderLightingV4 {
  const mode = resolveAppearanceSelectionV4(
    recipe.lighting.mode,
    namedRandomV3(seed, "lighting-mode"),
  );
  if (mode === "none") return { mode };
  const strength = resolveAppearanceSelectionV4(
    recipe.lighting.strength,
    namedRandomV3(seed, "lighting-strength"),
  );
  if (mode === "facet") return { mode, strength };
  return {
    mode,
    strength,
    direction: resolveAppearanceSelectionV4(
      recipe.lighting.direction,
      namedRandomV3(seed, "lighting-direction"),
    ),
  };
}

// Void renders every base ink near black, so a surface that required light
// ink must receive the approved opposite-luminance physical separation layer.
function requiresPhysicalSeparationV3(
  ink: AppearanceInkResolution,
  engravingFinish: EngravingFinishV4,
): boolean {
  return (
    ink.requiresLocalSeparation ||
    (engravingFinish === "void" && ink.textColor === LIGHT_APPEARANCE_INK)
  );
}

function contrastSurfaceV3(
  material: AppearanceMaterialV4,
  colors: NativeColors,
  scope: "repeated" | "die-wide",
  direction: LinearDirectionV4,
): ResolvedAppearanceSurfaceV2 {
  if (material.family === "classic" && material.treatment === "solid") {
    return { type: "solid", color: colors.ordered[0] };
  }
  if (material.family === "classic" && material.treatment === "pattern") {
    return {
      type: "pattern",
      patternId: material.patternId,
      primaryColor: colors.pair[0],
      secondaryColor: colors.pair[1],
    };
  }
  return {
    type: "gradient",
    colors: colors.ordered,
    scope,
    direction,
  };
}

export function resolveAppearanceRecipeV3(
  recipe: AppearanceRecipeV3,
  context: AppearanceResolutionContextV3,
  seedPolicy: AppearanceResolutionSeedPolicyV3 = "legacy",
): ResolvedAppearanceV3 {
  const seed = deriveAppearanceSeedV4({
    ...context,
    variation: recipe.variation,
    varyBy: recipe.varyBy,
    recipe,
  });
  const selectedMaterial = resolveAppearanceSelectionV4(
    recipe.material,
    propertyRandomV3(
      recipe,
      context,
      seed,
      seedPolicy,
      "material",
      recipe.material,
    ),
  );
  const usesFullSpectrumRandomization =
    usesFullSpectrumRandomizationV3(recipe);
  const randomSpecial = usesFullSpectrumRandomization
    ? randomSpecialMaterialV3(selectedMaterial)
    : undefined;
  const material: AppearanceMaterialV4 = {
    ...(context.target === "d20" && randomSpecial !== undefined
      ? randomSpecial.d20Material
      : selectedMaterial),
  };
  const colorSeedValue = {
    colors: recipe.colors,
    ...(usesR27ColorBehaviorV3(seedPolicy) &&
    !usesFullSpectrumRandomization
      ? {}
      : { material }),
    ...(recipe.randomization === undefined
      ? {}
      : { randomization: recipe.randomization }),
  };
  const colors = resolveRandomizedColorsV3(
    recipe,
    material,
    propertySeedV3(
      recipe,
      context,
      seed,
      seedPolicy,
      "colors",
      colorSeedValue,
      true,
    ),
    seedPolicy,
    randomSpecial?.palette,
  );
  const form =
    context.target === "other"
      ? recipe.form.other
      : usesFullSpectrumRandomization
        ? context.target === "d20" && randomSpecial !== undefined
          ? randomSpecial.d20Form
          : "standard"
        : recipe.form.policy === "material-default-v1"
          ? materialDefaultPolyhedralFormV4(material.family, context.target)
          : resolveCompatiblePolyhedralFormV4(
              recipe.form.polyhedral,
              material.family,
              propertyRandomV3(recipe, context, seed, seedPolicy, "form", {
                form: recipe.form,
                materialFamily: material.family,
                ...(recipe.randomization === undefined
                  ? {}
                  : { randomization: recipe.randomization }),
              }),
            );
  const fontId = resolveAppearanceSelectionV4(
    recipe.font,
    propertyRandomV3(
      recipe,
      context,
      seed,
      seedPolicy,
      "font",
      recipe.font,
    ),
  );
  const engravingFinish = resolveAppearanceSelectionV4(
    recipe.engraving,
    propertyRandomV3(
      recipe,
      context,
      seed,
      seedPolicy,
      "engraving",
      recipe.engraving,
    ),
  );
  const gradientScope = resolveAppearanceSelectionV4(
    recipe.gradient.scope,
    propertyRandomV3(
      recipe,
      context,
      seed,
      seedPolicy,
      "gradient-scope",
      recipe.gradient.scope,
    ),
  );
  const gradientDirection = resolveAppearanceSelectionV4(
    recipe.gradient.direction,
    propertyRandomV3(
      recipe,
      context,
      seed,
      seedPolicy,
      "gradient-direction",
      recipe.gradient.direction,
    ),
  );
  const isClassicGradient =
    material.family === "classic" && material.treatment === "gradient";
  const isBalancedClassicSolid =
    usesR27ColorBehaviorV3(seedPolicy) &&
    material.family === "classic" &&
    material.treatment === "solid";
  const usesBoundedRandomSolid =
    seedPolicy === "property-streams-r29" &&
    isBuiltinRandomRecipeV3(recipe) &&
    isBalancedClassicSolid &&
    context.target !== "other" &&
    form === "standard";
  let textureScope: TextureScopeV4 = "die-wide";
  if (usesBoundedRandomSolid) {
    textureScope = "bounded-die-wide";
  } else if (
    context.target !== "other" &&
    form === "standard" &&
    (isBalancedClassicSolid ||
      (isClassicGradient && gradientScope === "repeated"))
  ) {
    textureScope = "face-local";
  }
  if (
    isClassicGradient &&
    context.target !== "other" &&
    gradientScope === "repeated" &&
    form !== "standard"
  ) {
    throw new Error(
      "Appearance repeated gradient requires standard polyhedral form",
    );
  }
  const lighting = resolveLightingV3(
    recipe,
    propertySeedV3(
      recipe,
      context,
      seed,
      seedPolicy,
      "lighting",
      recipe.lighting,
    ),
  );
  const surface = contrastSurfaceV3(
    material,
    colors,
    gradientScope,
    gradientDirection,
  );
  const ink = resolveAppearanceInkV2(surface, lighting, context.target);
  return {
    version: 3,
    form,
    appearance: {
      material,
      palette: [...colors.ordered],
      texture: {
        generatorId:
          TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[material.family],
        seed: deriveNamedSeedV4(
          propertySeedV3(recipe, context, seed, seedPolicy, "texture", {
            material,
            ...(recipe.randomization === undefined
              ? {}
              : { randomization: recipe.randomization }),
          }),
          "texture",
        ),
        scale: material.textureScale,
        rotation: isClassicGradient
          ? TEXTURE_ROTATION_BY_DIRECTION_V3[gradientDirection]
          : 0,
        offsetU: 0,
        offsetV: 0,
        scope: textureScope,
      },
      lighting,
      engraving: {
        fontId,
        finish: engravingFinish,
        color: ink.textColor,
      },
      outlineColor: "#000000",
      requiresLocalSeparation: requiresPhysicalSeparationV3(
        ink,
        engravingFinish,
      ),
    },
  };
}
