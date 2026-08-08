import {
  CAMERA_AZIMUTH_OFFSETS_R17_V4,
  CAMERA_ELEVATION_DEGREES_R16_V4,
  CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4,
  POSE_AZIMUTHS_R17_V4,
  SPHERE_LABEL_PRESETS_R18_V4,
  createDeterministicRandomV4,
  deriveAppearanceSeedV4,
  deriveNamedSeedV4,
  validateRenderRequestV4,
  type AppearanceRecipeV3,
  type AppearanceTargetV4,
  type IconNameV4,
  type RenderAppearanceV4,
  type RenderCriticalEffectV4,
  type RenderDieV4,
  type RenderRequestV4,
  type RenderViewV4,
} from "@dice-witch/dice-v4-model";
import {
  resolveAppearanceRecipe,
  resolveAppearanceRecipeV2,
  resolveAppearanceRecipeV3,
  type AppearanceFill,
  type AppearanceRecipeV1,
  type AppearanceRecipeV2,
  type AppearanceTarget,
  type ResolvedAppearanceLightingV2,
  type ResolvedAppearanceSurfaceV2,
  type ResolvedAppearanceV3,
} from "../../dice-appearance/src";
import {
  APPEARANCE_FONT_IDS,
  PATTERN_NAMES_V1_V2,
  type IconName,
  type PatternNameV1V2,
  type PatternNameV3,
  type RenderAppearanceFillV2,
  type RenderAppearanceV2,
  type RenderAppearanceV3,
  type RenderDie,
  type RenderDieV2,
  type RenderDieV3,
  type RenderLightingV3,
  type RenderRequest,
  type RenderRequestV2,
  type RenderRequestV3,
  type RenderSurfaceV3,
} from "../../dice-svg/src/types";
import { validateRenderRequestV2 } from "../../dice-svg/src/validateV2";
import { validateRenderRequestV3 } from "../../dice-svg/src/validateV3";
import type {
  RollDie,
  RollExecutionResult,
} from "../../roll-domain/src";
import {
  createDeterministicRandom,
  type DeterministicRandom,
} from "../../roll-domain/src/random";
import { renderableRollOutcomes } from "../../roll-domain/src/execute";

const APPEARANCE_PATTERNS = PATTERN_NAMES_V1_V2;
type AppearancePatternName = PatternNameV1V2;
const APPEARANCE_PATTERN_SET: ReadonlySet<string> = new Set(
  APPEARANCE_PATTERNS,
);

function randomColor(random: DeterministicRandom): string {
  return `#${(random.nextUint32() & 0xff_ffff).toString(16).padStart(6, "0")}`;
}

function textColor(color: string, secondaryColor: string): string {
  const channels = [color, secondaryColor].flatMap((value) => [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ]);
  const brightness =
    channels.reduce((total, channel) => total + channel, 0) / channels.length;
  return brightness < 128 ? "#faf9f6" : "#000000";
}

type RollRenderIcon = IconName & IconNameV4;

function iconsFor(modifiers: readonly string[]): RollRenderIcon[] {
  const modifierSet = new Set(modifiers);
  const icons: RollRenderIcon[] = [];
  if (modifierSet.has("drop")) icons.push("trashcan");
  if (modifierSet.has("penetrate")) icons.push("penetrate");
  else if (modifierSet.has("explode")) icons.push("explosion");
  if (modifierSet.has("critical-success")) icons.push("critical-success");
  if (modifierSet.has("critical-failure")) icons.push("critical-failure");
  if (modifierSet.has("target-success")) icons.push("target-success");
  if (
    modifierSet.has("re-roll") ||
    modifierSet.has("re-roll-once") ||
    modifierSet.has("reroll")
  ) {
    icons.push("recycle");
  }
  if (modifierSet.has("min")) icons.push("chevronUp");
  if (modifierSet.has("max")) icons.push("chevronDown");
  if (modifierSet.has("unique")) icons.push("unique");
  return icons.length <= 3 ? icons : [];
}

function renderedFace(die: RollDie): number {
  const face = die.physicalFace ?? die.rolled;
  if (die.sides === "F" && ![-1, 0, 1].includes(face)) return 0;
  return face;
}

function validateRenderSeed(renderSeed: number): void {
  if (
    !Number.isInteger(renderSeed) ||
    renderSeed < 0 ||
    renderSeed > 0xffff_ffff
  ) {
    throw new Error("Render seed must be an unsigned 32-bit integer");
  }
}

function renderDie(die: RollDie, random: DeterministicRandom): RenderDie {
  const modifiers = new Set(die.modifiers);
  let color = randomColor(random);
  const secondaryColor = randomColor(random);
  if (modifiers.has("critical-success")) color = "#ffcc00";
  else if (modifiers.has("critical-failure")) color = "#ff3333";
  const pattern =
    APPEARANCE_PATTERNS[random.nextUint32() % APPEARANCE_PATTERNS.length];
  const fill =
    random.nextFloat() < 0.4 && pattern !== undefined
      ? { type: "pattern" as const, pattern }
      : { type: "gradient" as const };
  return {
    sides: die.sides,
    rolled: renderedFace(die),
    color,
    secondaryColor,
    textColor: textColor(color, secondaryColor),
    outlineColor: "#000000",
    icons: iconsFor(die.modifiers),
    fill,
  };
}

export function buildRollRenderRequest(
  result: RollExecutionResult,
  renderSeed: number,
): RenderRequest {
  validateRenderSeed(renderSeed);
  const random = createDeterministicRandom(renderSeed);
  const groups = renderableRollOutcomes(result).map(({ outcome }) =>
    outcome.dice.map((die) => renderDie(die, random)),
  );
  if (groups.length === 0) {
    throw new Error("Roll result has no renderable dice");
  }
  return { version: 1, groups };
}

export type EffectiveAppearanceRecipes = Readonly<
  Partial<Record<AppearanceTarget, AppearanceRecipeV1>>
>;

export type EffectiveAppearanceRecipesV2 = Readonly<
  Partial<Record<AppearanceTarget, AppearanceRecipeV2>>
>;

export type EffectiveAppearanceRecipesV3 = Readonly<
  Partial<Record<AppearanceTargetV4, AppearanceRecipeV3>>
>;

const TARGET_BY_SIDES: Partial<Record<number, AppearanceTarget>> = {
  4: "d4",
  6: "d6",
  8: "d8",
  10: "d10",
  12: "d12",
  20: "d20",
};
type AppearanceFontId = RenderAppearanceV2["fontId"];
const APPEARANCE_FONTS: ReadonlySet<string> = new Set(APPEARANCE_FONT_IDS);

function appearanceTarget(die: RollDie): AppearanceTarget {
  if (die.sides === "%") return "percentile";
  if (die.sides === "F") return "fudge";
  return TARGET_BY_SIDES[die.sides] ?? "other";
}

function renderedAppearanceFace(die: RollDie): number {
  const face = renderedFace(die);
  if (die.sides === "F" || die.sides === "%") return face;
  if (die.sides === 10 && face === 0) return 0;
  if (face < 1) {
    throw new Error("Numeric roll result must be positive, except d10 may use zero");
  }
  return ((face - 1) % die.sides) + 1;
}

function isAppearancePatternName(
  value: string,
): value is AppearancePatternName {
  return APPEARANCE_PATTERN_SET.has(value);
}

function renderFillV2(fill: AppearanceFill): RenderAppearanceFillV2 {
  if (fill.type !== "pattern") return { type: fill.type };
  if (!isAppearancePatternName(fill.patternId)) {
    throw new Error("Resolved appearance pattern is not supported by the renderer");
  }
  return { type: "pattern", pattern: fill.patternId };
}

function isAppearanceFontId(value: string): value is AppearanceFontId {
  return APPEARANCE_FONTS.has(value);
}

function criticalEffect(
  modifiers: readonly string[],
): RenderAppearanceV2["effect"] {
  const modifierSet = new Set(modifiers);
  if (modifierSet.has("critical-success")) return "critical-success";
  if (modifierSet.has("critical-failure")) return "critical-failure";
  return null;
}

function renderDieV2(
  die: RollDie,
  renderSeed: number,
  groupIndex: number,
  dieIndex: number,
  recipes: EffectiveAppearanceRecipes,
): RenderDieV2 {
  const target = appearanceTarget(die);
  const recipe = recipes[target];
  if (recipe === undefined) {
    throw new Error(`Effective appearance recipe for ${target} is required`);
  }
  const resolved = resolveAppearanceRecipe(recipe, {
    renderSeed,
    target,
    groupIndex,
    dieIndex,
  });
  if (!isAppearanceFontId(resolved.fontId)) {
    throw new Error("Resolved appearance font is not supported by the renderer");
  }
  const appearance: RenderAppearanceV2 = {
    primaryColor: resolved.primaryColor,
    secondaryColor: resolved.secondaryColor,
    textColor: resolved.textColor,
    outlineColor: resolved.outlineColor,
    fill: renderFillV2(resolved.fill),
    fontId: resolved.fontId,
    effect: criticalEffect(die.modifiers),
    requiresLocalSeparation: resolved.requiresLocalSeparation,
  };
  const result = renderedAppearanceFace(die);
  const icons = iconsFor(die.modifiers);
  if (target === "other") {
    if (typeof die.sides !== "number") {
      throw new Error("Other appearance target requires numeric sides");
    }
    return { target, sides: die.sides, result, appearance, icons };
  }
  return { target, result, appearance, icons };
}

export function buildRollRenderRequestV2(
  result: RollExecutionResult,
  renderSeed: number,
  recipes: EffectiveAppearanceRecipes,
): RenderRequestV2 {
  validateRenderSeed(renderSeed);
  const groups = renderableRollOutcomes(result).map(
    ({ outcome, outcomeIndex }) =>
      outcome.dice.map((die, dieIndex) =>
        renderDieV2(die, renderSeed, outcomeIndex, dieIndex, recipes),
      ),
  );
  if (groups.length === 0) {
    throw new Error("Roll result has no renderable dice");
  }
  return validateRenderRequestV2({ version: 2, groups });
}

function nativePatternName(pattern: AppearancePatternName): PatternNameV3 {
  switch (pattern) {
    case "checkerboard":
      return "checkerboard-v2";
    case "dots":
      return "dots-v2";
    case "stripes":
      return "stripes-v2";
    case "triangles":
      return "triangles-v2";
    case "crosshatch":
      return "crosshatch-v2";
    case "stars":
    case "zigzag":
    case "honeycomb":
    case "circuit":
    case "swirl":
      return pattern;
  }
}

function renderSurfaceV3(
  surface: ResolvedAppearanceSurfaceV2,
  compatibility: AppearanceRecipeV2["compatibility"],
): RenderSurfaceV3 {
  if (surface.type === "solid") {
    return { type: "solid", color: surface.color };
  }
  if (surface.type === "gradient") {
    return {
      type: "gradient",
      colors: [...surface.colors],
      scope: surface.scope,
      direction: surface.direction,
    };
  }
  if (!isAppearancePatternName(surface.patternId)) {
    throw new Error("Resolved appearance pattern is not supported by the renderer");
  }
  return {
    type: "pattern",
    pattern:
      compatibility === "native-v2"
        ? nativePatternName(surface.patternId)
        : surface.patternId,
    primaryColor: surface.primaryColor,
    secondaryColor: surface.secondaryColor,
  };
}

function renderLightingV3(
  lighting: ResolvedAppearanceLightingV2,
): RenderLightingV3 {
  if (lighting.mode === "none") return { mode: "none" };
  if (lighting.mode === "facet") {
    return { mode: "facet", strength: lighting.strength };
  }
  return {
    mode: lighting.mode,
    strength: lighting.strength,
    direction: lighting.direction,
  };
}

function renderDieV3(
  die: RollDie,
  renderSeed: number,
  groupIndex: number,
  dieIndex: number,
  recipes: EffectiveAppearanceRecipesV2,
): RenderDieV3 {
  const target = appearanceTarget(die);
  const recipe = recipes[target];
  if (recipe === undefined) {
    throw new Error(`Effective appearance recipe V2 for ${target} is required`);
  }
  const resolved = resolveAppearanceRecipeV2(recipe, {
    renderSeed,
    target,
    groupIndex,
    dieIndex,
  });
  if (!isAppearanceFontId(resolved.fontId)) {
    throw new Error("Resolved appearance font is not supported by the renderer");
  }
  const appearance: RenderAppearanceV3 = {
    surface: renderSurfaceV3(resolved.surface, resolved.compatibility),
    lighting: renderLightingV3(resolved.lighting),
    textColor: resolved.textColor,
    outlineColor: resolved.outlineColor,
    fontId: resolved.fontId,
    effect: criticalEffect(die.modifiers),
    requiresLocalSeparation: resolved.requiresLocalSeparation,
  };
  const result = renderedAppearanceFace(die);
  const icons = iconsFor(die.modifiers);
  if (target === "other") {
    if (typeof die.sides !== "number") {
      throw new Error("Other appearance target requires numeric sides");
    }
    return { target, sides: die.sides, result, appearance, icons };
  }
  const renderTarget =
    target === "d10" && resolved.compatibility === "native-v2"
      ? "d10-original"
      : target;
  return { target: renderTarget, result, appearance, icons };
}

export function buildRollRenderRequestV3(
  result: RollExecutionResult,
  renderSeed: number,
  recipes: EffectiveAppearanceRecipesV2,
): RenderRequestV3 {
  validateRenderSeed(renderSeed);
  const groups = renderableRollOutcomes(result).map(
    ({ outcome, outcomeIndex }) =>
      outcome.dice.map((die, dieIndex) =>
        renderDieV3(die, renderSeed, outcomeIndex, dieIndex, recipes),
      ),
  );
  if (groups.length === 0) {
    throw new Error("Roll result has no renderable dice");
  }
  return validateRenderRequestV3({ version: 3, groups });
}

/** Returns the physical face represented by a V4 roll die. */
export function renderedRollFaceV4(die: RollDie): number {
  if (
    die.sides === 10 &&
    die.rolled === 0 &&
    die.physicalFace === undefined
  ) {
    return 10;
  }
  return renderedAppearanceFace(die);
}

function criticalEffectV4(
  modifiers: readonly string[],
  material: RenderAppearanceV4["material"],
): RenderCriticalEffectV4 | null {
  const state = criticalEffect(modifiers);
  if (state === null) return null;
  return {
    state,
    treatment: CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4[material.family],
    color: state === "critical-success" ? "#ffd447" : "#ff334f",
    intensity: 72,
  };
}

function renderAppearanceV4(
  resolved: ResolvedAppearanceV3,
  modifiers: readonly string[],
): RenderAppearanceV4 {
  return {
    ...resolved.appearance,
    effect: criticalEffectV4(modifiers, resolved.appearance.material),
  };
}

function logicalPercentileIdentity(
  die: RollDie,
  component: "percentile" | "ones",
): string | undefined {
  if (
    (component === "percentile" && die.sides !== "%") ||
    (component === "ones" && die.sides !== 10)
  ) {
    return undefined;
  }
  const suffix = `:${component}`;
  return die.appearanceDieIdentity?.endsWith(suffix)
    ? die.appearanceDieIdentity.slice(0, -suffix.length)
    : undefined;
}

function selectCameraPreset<Preset>(
  seed: number,
  presets: readonly Preset[],
): Preset {
  const preset = presets[createDeterministicRandomV4(seed).index(presets.length)];
  if (preset === undefined) throw new Error("Camera preset is missing");
  return preset;
}

function renderViewV4(
  target: AppearanceTargetV4,
  form: RenderDieV4["form"],
  recipe: AppearanceRecipeV3,
  renderSeed: number,
  groupIndex: number,
  dieIndex: number,
  groupIdentity: string | undefined,
  dieIdentity: string | undefined,
): RenderViewV4 {
  const scopedSeed = deriveAppearanceSeedV4({
    renderSeed,
    target,
    groupIndex,
    dieIndex,
    variation: "curated",
    varyBy: "die",
    recipe,
    ...(groupIdentity === undefined ? {} : { groupIdentity }),
    ...(dieIdentity === undefined ? {} : { dieIdentity }),
  });
  const cameraSeed = deriveNamedSeedV4(scopedSeed, "camera");
  if (form === "sphere") {
    const preset = selectCameraPreset(
      cameraSeed,
      SPHERE_LABEL_PRESETS_R18_V4,
    );
    return {
      kind: "sphere-surface",
      rotationDegrees: preset.rotationDegrees,
      labelLongitudeDegrees: preset.longitudeDegrees,
      labelLatitudeDegrees: preset.latitudeDegrees,
      labelRotationDegrees: preset.rotationDegrees,
    };
  }
  const azimuthOffsetDegrees = selectCameraPreset(
    cameraSeed,
    CAMERA_AZIMUTH_OFFSETS_R17_V4,
  );
  const poseAzimuthDegrees = selectCameraPreset(
    deriveNamedSeedV4(cameraSeed, "pose"),
    POSE_AZIMUTHS_R17_V4,
  );
  return {
    kind: "camera",
    elevationDegrees: CAMERA_ELEVATION_DEGREES_R16_V4,
    azimuthOffsetDegrees,
    poseAzimuthDegrees,
  };
}

function renderDieV4(
  die: RollDie,
  renderSeed: number,
  groupIndex: number,
  dieIndex: number,
  recipes: EffectiveAppearanceRecipesV3,
  percentileAppearances: Map<string, ResolvedAppearanceV3>,
): RenderDieV4 {
  const target = appearanceTarget(die);
  const recipe = recipes[target];
  if (recipe === undefined) {
    throw new Error(`Effective appearance recipe V3 for ${target} is required`);
  }
  const result = renderedRollFaceV4(die);
  const onesIdentity = logicalPercentileIdentity(die, "ones");
  let resolved: ResolvedAppearanceV3;
  if (onesIdentity === undefined) {
    resolved = resolveAppearanceRecipeV3(recipe, {
      renderSeed,
      target,
      groupIndex,
      dieIndex,
      ...(die.appearanceGroupIdentity === undefined
        ? {}
        : { groupIdentity: die.appearanceGroupIdentity }),
      ...(die.appearanceDieIdentity === undefined
        ? {}
        : { dieIdentity: die.appearanceDieIdentity }),
    });
  } else {
    const percentileAppearance = percentileAppearances.get(onesIdentity);
    if (percentileAppearance === undefined) {
      throw new Error("Percentile ones die is missing its logical appearance");
    }
    resolved = structuredClone(percentileAppearance);
  }
  const percentileIdentity = logicalPercentileIdentity(die, "percentile");
  if (percentileIdentity !== undefined) {
    percentileAppearances.set(percentileIdentity, resolved);
  }
  const view = renderViewV4(
    target,
    resolved.form,
    recipe,
    renderSeed,
    groupIndex,
    dieIndex,
    die.appearanceGroupIdentity,
    die.appearanceDieIdentity,
  );
  if (target === "other") {
    if (typeof die.sides !== "number") {
      throw new Error("Other appearance target requires numeric sides");
    }
    return {
      target,
      sides: die.sides,
      result,
      form: resolved.form,
      appearance: renderAppearanceV4(resolved, die.modifiers),
      icons: iconsFor(die.modifiers),
      view,
    };
  }

  return {
    target,
    result,
    form: resolved.form,
    appearance: renderAppearanceV4(resolved, die.modifiers),
    icons: iconsFor(die.modifiers),
    view,
  };
}

export const ROLL_RENDERER_REVISION_V4 = "canvaskit-v4-r19" as const;

export function buildRollRenderRequestV4(
  result: RollExecutionResult,
  renderSeed: number,
  recipes: EffectiveAppearanceRecipesV3,
): RenderRequestV4 {
  validateRenderSeed(renderSeed);
  const groups = renderableRollOutcomes(result).map(
    ({ outcome, outcomeIndex }) => {
      const percentileAppearances = new Map<string, ResolvedAppearanceV3>();
      return outcome.dice.map((die, dieIndex) =>
        renderDieV4(
          die,
          renderSeed,
          outcomeIndex,
          dieIndex,
          recipes,
          percentileAppearances,
        ),
      );
    },
  );
  if (groups.length === 0) {
    throw new Error("Roll result has no renderable dice");
  }
  return validateRenderRequestV4({
    version: 4,
    rendererRevision: ROLL_RENDERER_REVISION_V4,
    groups,
  });
}
