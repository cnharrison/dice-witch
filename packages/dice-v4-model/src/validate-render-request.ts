import { isAuthoredRenderViewV4 } from "./authored-views";
import {
  isMaterialFormCompatibleV4,
  isPolyhedralFormImplementedForTargetV4,
} from "./compatibility";
import {
  DICE_VIEW_AZIMUTH_RANGE_V4,
  DICE_VIEW_ELEVATION_RANGE_V4,
} from "./dice-view-preferences";
import {
  APPEARANCE_PERCENTAGE_RANGE_V4,
  APPEARANCE_TEXTURE_SCALE_RANGE_V4,
} from "./limits";
import {
  APPEARANCE_TARGETS_V4,
  CLASSIC_FINISHES_V4,
  CLASSIC_OPACITIES_V4,
  CLASSIC_TREATMENTS_V4,
  CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4,
  CRITICAL_TREATMENTS_V4,
  ENGRAVING_FINISHES_V4,
  FANTASY_ESSENCES_V4,
  FANTASY_FINISHES_V4,
  FONT_IDS_V4,
  GEMSTONE_FINISHES_V4,
  GEMSTONE_STYLES_V4,
  GLASS_FINISHES_V4,
  GLASS_STYLES_V4,
  HOLLOW_METAL_CONSTRUCTIONS_V4,
  ICON_NAMES_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_STRENGTHS_V4,
  LIQUID_CORE_STYLES_V4,
  MATERIAL_FAMILIES_V4,
  METALS_V4,
  METAL_FINISHES_V4,
  PATTERN_IDS_V4,
  POLYHEDRAL_FORMS_V4,
  RENDERER_REVISIONS_V4,
  RESIN_FINISHES_V4,
  RESIN_INCLUSIONS_V4,
  SHARP_RESIN_STYLES_V4,
  STONE_FINISHES_V4,
  STONE_STYLES_V4,
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  TEXTURE_GENERATOR_IDS_V4,
  TEXTURE_SCOPES_V4,
  WOOD_FINISHES_V4,
  WOOD_STYLES_V4,
} from "./registries";
import { rendererRevisionPolicyV4 } from "./renderer-revision";
import {
  CAMERA_AZIMUTH_OFFSETS_R16_V4,
  CAMERA_AZIMUTH_OFFSETS_R17_V4,
  CAMERA_ELEVATION_DEGREES_R16_V4,
  D4_POSE_AZIMUTHS_R16_V4,
  POSE_AZIMUTHS_R17_V4,
  SPHERE_LABEL_PRESETS_R18_V4,
  SPHERE_ROTATIONS_R17_V4,
} from "./geometry";
import type {
  AppearanceMaterialV4,
  AppearanceTargetV4,
  ClassicMaterialV4,
  FantasyMaterialV4,
  GemstoneMaterialV4,
  GlassMaterialV4,
  HollowMetalMaterialV4,
  IconNameV4,
  LiquidCoreMaterialV4,
  MetalMaterialV4,
  RenderAppearanceV4,
  RenderCriticalEffectV4,
  RenderDieV4,
  RenderEngravingV4,
  RenderFormV4,
  RenderLightingV4,
  RenderRequestV4,
  RenderTextureV4,
  RenderViewV4,
  RendererRevisionV4,
  SharpResinMaterialV4,
  StoneMaterialV4,
  WoodMaterialV4,
} from "./types";
import {
  boundedInteger,
  hasExactKeys,
  hexColor,
  isRecord,
  requireExactRecord,
  supportedValue,
} from "./validation";

const REQUEST_KEYS = ["groups", "rendererRevision", "version"] as const;
const DIE_KEYS = ["appearance", "form", "icons", "result", "target"] as const;
const DIE_WITH_VIEW_KEYS = [...DIE_KEYS, "view"] as const;
const OTHER_DIE_KEYS = [...DIE_KEYS, "sides"] as const;
const OTHER_DIE_WITH_VIEW_KEYS = [...OTHER_DIE_KEYS, "view"] as const;
const CAMERA_VIEW_KEYS = [
  "azimuthOffsetDegrees",
  "elevationDegrees",
  "kind",
  "poseAzimuthDegrees",
] as const;
const ORIENTED_CAMERA_VIEW_KEYS = [
  "azimuthOffsetDegrees",
  "elevationDegrees",
  "kind",
  "mode",
  "resultRotation",
] as const;
const SPHERE_VIEW_KEYS = ["kind", "rotationDegrees"] as const;
const POSITIONED_SPHERE_VIEW_KEYS = [
  ...SPHERE_VIEW_KEYS,
  "labelLatitudeDegrees",
  "labelLongitudeDegrees",
  "labelRotationDegrees",
] as const;
const TEXTURE_KEYS_R1 = [
  "generatorId",
  "offsetU",
  "offsetV",
  "rotation",
  "scale",
  "seed",
] as const;
const TEXTURE_KEYS_R2 = [...TEXTURE_KEYS_R1, "scope"] as const;
const APPEARANCE_KEYS = [
  "effect",
  "engraving",
  "lighting",
  "material",
  "outlineColor",
  "palette",
  "requiresLocalSeparation",
  "texture",
] as const;
const TARGET_SIDES: Partial<Record<AppearanceTargetV4, number>> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};
function parseTextureScale(value: unknown, path: string): number {
  return boundedInteger(
    value,
    APPEARANCE_TEXTURE_SCALE_RANGE_V4.minimum,
    APPEARANCE_TEXTURE_SCALE_RANGE_V4.maximum,
    path,
  );
}

function parsePercentage(value: unknown, path: string): number {
  return boundedInteger(
    value,
    APPEARANCE_PERCENTAGE_RANGE_V4.minimum,
    APPEARANCE_PERCENTAGE_RANGE_V4.maximum,
    path,
  );
}

function parseClassicMaterial(
  value: Record<string, unknown>,
  path: string,
): ClassicMaterialV4 {
  const treatment = supportedValue(
    value.treatment,
    CLASSIC_TREATMENTS_V4,
    `${path}.treatment is not supported`,
  );
  const expected =
    treatment === "pattern"
      ? [
          "family",
          "finish",
          "opacity",
          "patternId",
          "textureScale",
          "treatment",
        ]
      : ["family", "finish", "opacity", "textureScale", "treatment"];
  if (!hasExactKeys(value, expected)) {
    throw new Error(`${path} has invalid fields`);
  }
  const common = {
    family: "classic" as const,
    opacity: supportedValue(
      value.opacity,
      CLASSIC_OPACITIES_V4,
      `${path}.opacity is not supported`,
    ),
    finish: supportedValue(
      value.finish,
      CLASSIC_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
  if (treatment === "pattern") {
    return {
      ...common,
      treatment,
      patternId: supportedValue(
        value.patternId,
        PATTERN_IDS_V4,
        `${path}.patternId is not supported`,
      ),
    };
  }
  return { ...common, treatment };
}

function parseSharpResinMaterial(
  value: Record<string, unknown>,
  path: string,
): SharpResinMaterialV4 {
  if (
    !hasExactKeys(value, [
      "clarity",
      "family",
      "finish",
      "inclusion",
      "inclusionDensity",
      "style",
      "textureScale",
    ])
  ) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    family: "sharp-resin",
    style: supportedValue(
      value.style,
      SHARP_RESIN_STYLES_V4,
      `${path}.style is not supported`,
    ),
    inclusion: supportedValue(
      value.inclusion,
      RESIN_INCLUSIONS_V4,
      `${path}.inclusion is not supported`,
    ),
    clarity: parsePercentage(value.clarity, `${path}.clarity`),
    inclusionDensity: parsePercentage(
      value.inclusionDensity,
      `${path}.inclusionDensity`,
    ),
    finish: supportedValue(
      value.finish,
      RESIN_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
}

function parseLiquidCoreMaterial(
  value: Record<string, unknown>,
  path: string,
): LiquidCoreMaterialV4 {
  if (
    !hasExactKeys(value, [
      "clarity",
      "core",
      "family",
      "finish",
      "particleDensity",
      "textureScale",
    ])
  ) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    family: "liquid-core",
    core: supportedValue(
      value.core,
      LIQUID_CORE_STYLES_V4,
      `${path}.core is not supported`,
    ),
    clarity: parsePercentage(value.clarity, `${path}.clarity`),
    particleDensity: parsePercentage(
      value.particleDensity,
      `${path}.particleDensity`,
    ),
    finish: supportedValue(
      value.finish,
      RESIN_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
}

function parseGemstoneMaterial(
  value: Record<string, unknown>,
  path: string,
): GemstoneMaterialV4 {
  if (
    !hasExactKeys(value, [
      "family",
      "finish",
      "stone",
      "textureScale",
      "veinDensity",
    ])
  ) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    family: "gemstone",
    stone: supportedValue(
      value.stone,
      GEMSTONE_STYLES_V4,
      `${path}.stone is not supported`,
    ),
    veinDensity: parsePercentage(value.veinDensity, `${path}.veinDensity`),
    finish: supportedValue(
      value.finish,
      GEMSTONE_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
}

function parseGlassMaterial(
  value: Record<string, unknown>,
  path: string,
): GlassMaterialV4 {
  if (
    !hasExactKeys(value, [
      "clarity",
      "family",
      "finish",
      "style",
      "textureScale",
    ])
  ) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    family: "glass",
    style: supportedValue(
      value.style,
      GLASS_STYLES_V4,
      `${path}.style is not supported`,
    ),
    clarity: parsePercentage(value.clarity, `${path}.clarity`),
    finish: supportedValue(
      value.finish,
      GLASS_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
}

function parseStoneMaterial(
  value: Record<string, unknown>,
  path: string,
): StoneMaterialV4 {
  if (
    !hasExactKeys(value, [
      "family",
      "finish",
      "grainDensity",
      "stone",
      "textureScale",
    ])
  ) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    family: "stone",
    stone: supportedValue(
      value.stone,
      STONE_STYLES_V4,
      `${path}.stone is not supported`,
    ),
    grainDensity: parsePercentage(value.grainDensity, `${path}.grainDensity`),
    finish: supportedValue(
      value.finish,
      STONE_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
}

function parseMetalMaterial(
  value: Record<string, unknown>,
  path: string,
): MetalMaterialV4 {
  if (
    !hasExactKeys(value, [
      "family",
      "finish",
      "metal",
      "patinaStrength",
      "textureScale",
    ])
  ) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    family: "metal",
    metal: supportedValue(
      value.metal,
      METALS_V4,
      `${path}.metal is not supported`,
    ),
    finish: supportedValue(
      value.finish,
      METAL_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    patinaStrength: parsePercentage(
      value.patinaStrength,
      `${path}.patinaStrength`,
    ),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
}

function parseHollowMetalMaterial(
  value: Record<string, unknown>,
  path: string,
): HollowMetalMaterialV4 {
  if (
    !hasExactKeys(value, [
      "construction",
      "family",
      "finish",
      "metal",
      "openness",
      "textureScale",
    ])
  ) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    family: "hollow-metal",
    construction: supportedValue(
      value.construction,
      HOLLOW_METAL_CONSTRUCTIONS_V4,
      `${path}.construction is not supported`,
    ),
    metal: supportedValue(
      value.metal,
      METALS_V4,
      `${path}.metal is not supported`,
    ),
    finish: supportedValue(
      value.finish,
      METAL_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    openness: parsePercentage(value.openness, `${path}.openness`),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
}

function parseWoodMaterial(
  value: Record<string, unknown>,
  path: string,
): WoodMaterialV4 {
  if (
    !hasExactKeys(value, [
      "family",
      "finish",
      "grainDensity",
      "textureScale",
      "wood",
    ])
  ) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    family: "wood",
    wood: supportedValue(
      value.wood,
      WOOD_STYLES_V4,
      `${path}.wood is not supported`,
    ),
    finish: supportedValue(
      value.finish,
      WOOD_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    grainDensity: parsePercentage(value.grainDensity, `${path}.grainDensity`),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
}

function parseFantasyMaterial(
  value: Record<string, unknown>,
  path: string,
): FantasyMaterialV4 {
  if (
    !hasExactKeys(value, [
      "essence",
      "family",
      "finish",
      "intensity",
      "textureScale",
    ])
  ) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    family: "fantasy",
    essence: supportedValue(
      value.essence,
      FANTASY_ESSENCES_V4,
      `${path}.essence is not supported`,
    ),
    intensity: parsePercentage(value.intensity, `${path}.intensity`),
    finish: supportedValue(
      value.finish,
      FANTASY_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    textureScale: parseTextureScale(value.textureScale, `${path}.textureScale`),
  };
}

export function parseAppearanceMaterialV4(
  value: unknown,
  path = "Appearance material",
): AppearanceMaterialV4 {
  if (!isRecord(value)) throw new Error(`${path} has invalid fields`);
  const family = supportedValue(
    value.family,
    MATERIAL_FAMILIES_V4,
    `${path}.family is not supported`,
  );
  switch (family) {
    case "classic":
      return parseClassicMaterial(value, path);
    case "sharp-resin":
      return parseSharpResinMaterial(value, path);
    case "liquid-core":
      return parseLiquidCoreMaterial(value, path);
    case "gemstone":
      return parseGemstoneMaterial(value, path);
    case "glass":
      return parseGlassMaterial(value, path);
    case "stone":
      return parseStoneMaterial(value, path);
    case "metal":
      return parseMetalMaterial(value, path);
    case "hollow-metal":
      return parseHollowMetalMaterial(value, path);
    case "wood":
      return parseWoodMaterial(value, path);
    case "fantasy":
      return parseFantasyMaterial(value, path);
  }
}

function parsePalette(value: unknown, path: string): [string, string, ...string[]] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    throw new Error(`${path} is invalid`);
  }
  const colors = value.map((color, index) =>
    hexColor(color, `${path}[${String(index)}]`),
  );
  if (new Set(colors).size < 2) throw new Error(`${path} is invalid`);
  const first = colors[0];
  const second = colors[1];
  if (first === undefined || second === undefined) {
    throw new Error(`${path} is invalid`);
  }
  return [first, second, ...colors.slice(2)];
}

function usesExplicitTextureScope(
  rendererRevision: RendererRevisionV4,
): boolean {
  return rendererRevisionPolicyV4(rendererRevision).explicitTextureScope;
}

function parseTexture(
  value: unknown,
  path: string,
  rendererRevision: RendererRevisionV4,
): RenderTextureV4 {
  const texture = requireExactRecord(
    value,
    usesExplicitTextureScope(rendererRevision)
      ? TEXTURE_KEYS_R2
      : TEXTURE_KEYS_R1,
    `${path} has invalid fields`,
  );
  const parsed: RenderTextureV4 = {
    generatorId: supportedValue(
      texture.generatorId,
      TEXTURE_GENERATOR_IDS_V4,
      `${path}.generatorId is not supported`,
    ),
    seed: boundedInteger(texture.seed, 0, 0xffff_ffff, `${path}.seed`),
    scale: parseTextureScale(texture.scale, `${path}.scale`),
    rotation: boundedInteger(texture.rotation, 0, 359, `${path}.rotation`),
    offsetU: boundedInteger(texture.offsetU, 0, 65_535, `${path}.offsetU`),
    offsetV: boundedInteger(texture.offsetV, 0, 65_535, `${path}.offsetV`),
  };
  if (usesExplicitTextureScope(rendererRevision)) {
    parsed.scope = supportedValue(
      texture.scope,
      TEXTURE_SCOPES_V4,
      `${path}.scope is not supported`,
    );
  }
  return parsed;
}

function parseLighting(value: unknown, path: string): RenderLightingV4 {
  if (!isRecord(value) || typeof value.mode !== "string") {
    throw new Error(`${path} is invalid`);
  }
  if (value.mode === "none" && hasExactKeys(value, ["mode"])) {
    return { mode: "none" };
  }
  if (value.mode === "facet" && hasExactKeys(value, ["mode", "strength"])) {
    return {
      mode: "facet",
      strength: supportedValue(
        value.strength,
        LIGHTING_STRENGTHS_V4,
        `${path}.strength is not supported`,
      ),
    };
  }
  if (
    (value.mode === "directional" || value.mode === "combined") &&
    hasExactKeys(value, ["direction", "mode", "strength"])
  ) {
    return {
      mode: value.mode,
      strength: supportedValue(
        value.strength,
        LIGHTING_STRENGTHS_V4,
        `${path}.strength is not supported`,
      ),
      direction: supportedValue(
        value.direction,
        LIGHTING_DIRECTIONS_V4,
        `${path}.direction is not supported`,
      ),
    };
  }
  throw new Error(`${path} is invalid`);
}

function parseEngraving(value: unknown, path: string): RenderEngravingV4 {
  const engraving = requireExactRecord(
    value,
    ["color", "finish", "fontId"],
    `${path} has invalid fields`,
  );
  return {
    fontId: supportedValue(
      engraving.fontId,
      FONT_IDS_V4,
      `${path}.fontId is not supported`,
    ),
    finish: supportedValue(
      engraving.finish,
      ENGRAVING_FINISHES_V4,
      `${path}.finish is not supported`,
    ),
    color: hexColor(engraving.color, `${path}.color`),
  };
}

function parseEffect(
  value: unknown,
  path: string,
): RenderCriticalEffectV4 | null {
  if (value === null) return null;
  const effect = requireExactRecord(
    value,
    ["color", "intensity", "state", "treatment"],
    `${path} has invalid fields`,
  );
  if (
    effect.state !== "critical-success" &&
    effect.state !== "critical-failure"
  ) {
    throw new Error(`${path}.state is not supported`);
  }
  return {
    state: effect.state,
    treatment: supportedValue(
      effect.treatment,
      CRITICAL_TREATMENTS_V4,
      `${path}.treatment is not supported`,
    ),
    color: hexColor(effect.color, `${path}.color`),
    intensity: parsePercentage(effect.intensity, `${path}.intensity`),
  };
}

function parseOutlineColor(value: unknown, path: string): "#000000" {
  if (hexColor(value, path) !== "#000000") {
    throw new Error(`${path} must be #000000`);
  }
  return "#000000";
}

function validateMaterialAssets(
  appearance: RenderAppearanceV4,
  path: string,
): void {
  const family = appearance.material.family;
  if (
    appearance.texture.generatorId !==
    TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[family]
  ) {
    throw new Error(
      `${path}.texture.generatorId does not match ${family} material`,
    );
  }
  if (appearance.texture.scale !== appearance.material.textureScale) {
    throw new Error(
      `${path}.texture.scale does not match material textureScale`,
    );
  }
  if (
    appearance.effect !== null &&
    appearance.effect.treatment !==
      CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4[family]
  ) {
    throw new Error(
      `${path}.effect.treatment does not match ${family} material`,
    );
  }
}

function parseAppearance(
  value: unknown,
  path: string,
  rendererRevision: RendererRevisionV4,
): RenderAppearanceV4 {
  const appearance = requireExactRecord(
    value,
    APPEARANCE_KEYS,
    `${path} has invalid fields`,
  );
  if (typeof appearance.requiresLocalSeparation !== "boolean") {
    throw new Error(`${path}.requiresLocalSeparation must be a boolean`);
  }
  const parsed: RenderAppearanceV4 = {
    material: parseAppearanceMaterialV4(
      appearance.material,
      `${path}.material`,
    ),
    palette: parsePalette(appearance.palette, `${path}.palette`),
    texture: parseTexture(
      appearance.texture,
      `${path}.texture`,
      rendererRevision,
    ),
    lighting: parseLighting(appearance.lighting, `${path}.lighting`),
    engraving: parseEngraving(appearance.engraving, `${path}.engraving`),
    outlineColor: parseOutlineColor(
      appearance.outlineColor,
      `${path}.outlineColor`,
    ),
    requiresLocalSeparation: appearance.requiresLocalSeparation,
    effect: parseEffect(appearance.effect, `${path}.effect`),
  };
  validateMaterialAssets(parsed, path);
  return parsed;
}

function parseIcons(value: unknown, path: string): IconNameV4[] {
  if (!Array.isArray(value) || value.length > 3) {
    throw new Error(`${path} must contain at most three icons`);
  }
  const icons = value.map((icon, index) =>
    supportedValue(
      icon,
      ICON_NAMES_V4,
      `${path}[${String(index)}] is not supported`,
    ),
  );
  if (new Set(icons).size !== icons.length) {
    throw new Error(`${path} must not contain duplicate icons`);
  }
  return icons;
}

function validateCriticalState(
  appearance: RenderAppearanceV4,
  icons: readonly IconNameV4[],
  path: string,
): void {
  const criticalIcons = icons.filter(
    (icon) => icon === "critical-success" || icon === "critical-failure",
  );
  if (
    criticalIcons.length !== (appearance.effect === null ? 0 : 1) ||
    (appearance.effect !== null && criticalIcons[0] !== appearance.effect.state)
  ) {
    throw new Error(`${path} critical effect does not match modifier icons`);
  }
}

function parseResult(
  value: unknown,
  target: AppearanceTargetV4,
  sides: number | undefined,
  path: string,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${path}.result must be an integer`);
  }
  const fixedSides = TARGET_SIDES[target];
  const minimum = 1;
  if (fixedSides !== undefined && (value < minimum || value > fixedSides)) {
    throw new Error(
      `${path}.result must be from ${String(minimum)} through ${String(fixedSides)}`,
    );
  }
  if (target === "percentile" && (value < 0 || value > 90 || value % 10 !== 0)) {
    throw new Error(
      `${path}.result must be a multiple of 10 from 0 through 90`,
    );
  }
  if (target === "fudge" && ![-1, 0, 1].includes(value)) {
    throw new Error(`${path}.result must be -1, 0, or 1`);
  }
  if (target === "other") {
    if (sides === undefined) throw new Error(`${path}.sides is required`);
    if (value < 1 || value > sides) {
      throw new Error(`${path}.result must be from 1 through ${String(sides)}`);
    }
  }
  return value;
}

function parseForm(
  value: unknown,
  target: AppearanceTargetV4,
  material: AppearanceMaterialV4,
  path: string,
): RenderFormV4 {
  if (target === "other") {
    if (value !== "sphere") {
      throw new Error(`${path}.form is invalid for other`);
    }
    return "sphere";
  }
  const form = supportedValue(
    value,
    POLYHEDRAL_FORMS_V4,
    `${path}.form is invalid for ${target}`,
  );
  if (!isPolyhedralFormImplementedForTargetV4(target, form)) {
    throw new Error(`${path}.form is not implemented for ${target}`);
  }
  const family = material.family;
  if (!isMaterialFormCompatibleV4(family, form)) {
    throw new Error(`${path}.form is incompatible with ${family} material`);
  }
  return form;
}

function validateTextureScopeForDie(
  appearance: RenderAppearanceV4,
  target: AppearanceTargetV4,
  form: RenderFormV4,
): void {
  if (appearance.texture.scope !== "face-local") return;
  if (
    appearance.texture.offsetU !== 0 ||
    appearance.texture.offsetV !== 0
  ) {
    throw new Error("face-local texture scope does not support offsets");
  }
  if (target === "other") {
    throw new Error("face-local texture scope is invalid for other");
  }
  const material = appearance.material;
  if (material.family !== "classic" || material.treatment !== "gradient") {
    throw new Error(
      "face-local texture scope requires classic gradient material",
    );
  }
  if (form !== "standard") {
    throw new Error("face-local texture scope requires standard form");
  }
}

function finiteViewNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be finite`);
  }
  return value;
}

function parseView(
  value: unknown,
  path: string,
  target: AppearanceTargetV4,
  form: RenderFormV4,
  result: number,
  rendererRevision: RendererRevisionV4,
): RenderViewV4 | undefined {
  const { cameraAngles, resolvedViews } =
    rendererRevisionPolicyV4(rendererRevision);
  if (cameraAngles === "legacy") {
    if (value !== undefined) throw new Error(`${path} is not supported`);
    return undefined;
  }
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  if (form === "sphere") {
    const positioned =
      cameraAngles === "presets-r18" || cameraAngles === "preferences-r20";
    const keys = positioned ? POSITIONED_SPHERE_VIEW_KEYS : SPHERE_VIEW_KEYS;
    if (!hasExactKeys(value, keys) || value.kind !== "sphere-surface") {
      throw new Error(`${path} is invalid for ${target} sphere`);
    }
    const rotationDegrees = finiteViewNumber(
      value.rotationDegrees,
      `${path}.rotationDegrees`,
    );
    const rotations: readonly number[] =
      cameraAngles === "presets-r16"
        ? CAMERA_AZIMUTH_OFFSETS_R16_V4
        : SPHERE_ROTATIONS_R17_V4;
    if (!rotations.includes(rotationDegrees)) {
      throw new Error(`${path}.rotationDegrees is invalid`);
    }
    if (!positioned) return { kind: "sphere-surface", rotationDegrees };
    const labelLongitudeDegrees = finiteViewNumber(
      value.labelLongitudeDegrees,
      `${path}.labelLongitudeDegrees`,
    );
    const labelLatitudeDegrees = finiteViewNumber(
      value.labelLatitudeDegrees,
      `${path}.labelLatitudeDegrees`,
    );
    const labelRotationDegrees = finiteViewNumber(
      value.labelRotationDegrees,
      `${path}.labelRotationDegrees`,
    );
    const isPreset = SPHERE_LABEL_PRESETS_R18_V4.some(
      (preset) =>
        preset.longitudeDegrees === labelLongitudeDegrees &&
        preset.latitudeDegrees === labelLatitudeDegrees &&
        preset.rotationDegrees === labelRotationDegrees,
    );
    const isCenteredAuthoredView =
      resolvedViews &&
      rotationDegrees === 0 &&
      labelLongitudeDegrees === 0 &&
      labelLatitudeDegrees === 0 &&
      labelRotationDegrees === 0;
    const isPreferenceView =
      cameraAngles === "preferences-r20" &&
      Number.isSafeInteger(labelLongitudeDegrees) &&
      labelLongitudeDegrees >= DICE_VIEW_AZIMUTH_RANGE_V4.minimum &&
      labelLongitudeDegrees <= DICE_VIEW_AZIMUTH_RANGE_V4.maximum &&
      labelLongitudeDegrees % DICE_VIEW_AZIMUTH_RANGE_V4.step === 0 &&
      rotationDegrees === labelRotationDegrees &&
      SPHERE_LABEL_PRESETS_R18_V4.some(
        (preset) =>
          preset.latitudeDegrees === labelLatitudeDegrees &&
          preset.rotationDegrees === labelRotationDegrees,
      );
    if (!isPreset && !isCenteredAuthoredView && !isPreferenceView) {
      throw new Error(`${path} sphere label preset is invalid`);
    }
    return {
      kind: "sphere-surface",
      rotationDegrees,
      labelLongitudeDegrees,
      labelLatitudeDegrees,
      labelRotationDegrees,
    };
  }
  if (value.kind === "oriented-camera") {
    if (
      !resolvedViews ||
      !hasExactKeys(value, ORIENTED_CAMERA_VIEW_KEYS) ||
      (value.mode !== "legacy" && value.mode !== "clear")
    ) {
      throw new Error(`${path} is invalid for ${target}`);
    }
    const elevationDegrees = boundedInteger(
      value.elevationDegrees,
      1,
      89,
      `${path}.elevationDegrees`,
    );
    const azimuthOffsetDegrees = boundedInteger(
      value.azimuthOffsetDegrees,
      -180,
      180,
      `${path}.azimuthOffsetDegrees`,
    );
    if (
      !Array.isArray(value.resultRotation) ||
      value.resultRotation.length !== 4
    ) {
      throw new Error(`${path}.resultRotation must contain four numbers`);
    }
    const resultRotation = value.resultRotation.map((component, index) =>
      finiteViewNumber(component, `${path}.resultRotation[${index}]`),
    ) as [number, number, number, number];
    if (Math.abs(Math.hypot(...resultRotation) - 1) > 1e-9) {
      throw new Error(`${path}.resultRotation must be normalized`);
    }
    const view: RenderViewV4 = {
      kind: "oriented-camera",
      mode: value.mode,
      elevationDegrees,
      azimuthOffsetDegrees,
      resultRotation,
    };
    if (!isAuthoredRenderViewV4(view, { target, form, result })) {
      throw new Error(`${path} does not match an authored ${target} view`);
    }
    return view;
  }
  if (!hasExactKeys(value, CAMERA_VIEW_KEYS) || value.kind !== "camera") {
    throw new Error(`${path} is invalid for ${target}`);
  }
  const elevationDegrees = finiteViewNumber(
    value.elevationDegrees,
    `${path}.elevationDegrees`,
  );
  const azimuthOffsetDegrees = finiteViewNumber(
    value.azimuthOffsetDegrees,
    `${path}.azimuthOffsetDegrees`,
  );
  const poseAzimuthDegrees = finiteViewNumber(
    value.poseAzimuthDegrees,
    `${path}.poseAzimuthDegrees`,
  );
  const hasPreferenceCamera = cameraAngles === "preferences-r20";
  if (
    hasPreferenceCamera
      ? !Number.isSafeInteger(elevationDegrees) ||
        elevationDegrees < DICE_VIEW_ELEVATION_RANGE_V4.minimum ||
        elevationDegrees > DICE_VIEW_ELEVATION_RANGE_V4.maximum
      : elevationDegrees !== CAMERA_ELEVATION_DEGREES_R16_V4
  ) {
    throw new Error(`${path}.elevationDegrees is invalid`);
  }
  const azimuths: readonly number[] =
    cameraAngles === "presets-r16"
      ? CAMERA_AZIMUTH_OFFSETS_R16_V4
      : CAMERA_AZIMUTH_OFFSETS_R17_V4;
  if (
    hasPreferenceCamera
      ? !Number.isSafeInteger(azimuthOffsetDegrees) ||
        azimuthOffsetDegrees < DICE_VIEW_AZIMUTH_RANGE_V4.minimum ||
        azimuthOffsetDegrees > DICE_VIEW_AZIMUTH_RANGE_V4.maximum ||
        azimuthOffsetDegrees % DICE_VIEW_AZIMUTH_RANGE_V4.step !== 0
      : !azimuths.includes(azimuthOffsetDegrees)
  ) {
    throw new Error(`${path}.azimuthOffsetDegrees is invalid`);
  }
  const poseAzimuths: readonly number[] =
    cameraAngles === "presets-r16"
      ? target === "d4"
        ? D4_POSE_AZIMUTHS_R16_V4
        : [0]
      : POSE_AZIMUTHS_R17_V4;
  if (!poseAzimuths.includes(poseAzimuthDegrees)) {
    throw new Error(`${path}.poseAzimuthDegrees is invalid`);
  }
  return {
    kind: "camera",
    elevationDegrees,
    azimuthOffsetDegrees,
    poseAzimuthDegrees,
  };
}

function parseDie(
  value: unknown,
  path: string,
  rendererRevision: RendererRevisionV4,
): RenderDieV4 {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  const target = supportedValue(
    value.target,
    APPEARANCE_TARGETS_V4,
    `${path}.target is not supported`,
  );
  const withView =
    rendererRevisionPolicyV4(rendererRevision).cameraAngles !== "legacy";
  const expected = target === "other"
    ? withView
      ? OTHER_DIE_WITH_VIEW_KEYS
      : OTHER_DIE_KEYS
    : withView
      ? DIE_WITH_VIEW_KEYS
      : DIE_KEYS;
  if (!hasExactKeys(value, expected)) {
    throw new Error(`${path} has invalid fields`);
  }
  const appearance = parseAppearance(
    value.appearance,
    `${path}.appearance`,
    rendererRevision,
  );
  const icons = parseIcons(value.icons, `${path}.icons`);
  validateCriticalState(appearance, icons, path);
  if (target === "other") {
    const sides = boundedInteger(value.sides, 1, 999, `${path}.sides`);
    const form = parseForm(value.form, target, appearance.material, path);
    const result = parseResult(value.result, target, sides, path);
    validateTextureScopeForDie(appearance, target, form);
    const view = parseView(
      value.view,
      `${path}.view`,
      target,
      form,
      result,
      rendererRevision,
    );
    return {
      target,
      sides,
      result,
      form,
      appearance,
      icons,
      ...(view === undefined ? {} : { view }),
    };
  }
  const form = parseForm(value.form, target, appearance.material, path);
  const result = parseResult(value.result, target, undefined, path);
  validateTextureScopeForDie(appearance, target, form);
  const view = parseView(
    value.view,
    `${path}.view`,
    target,
    form,
    result,
    rendererRevision,
  );
  return {
    target,
    result,
    form,
    appearance,
    icons,
    ...(view === undefined ? {} : { view }),
  };
}

function parseRendererRevision(value: unknown): RendererRevisionV4 {
  return supportedValue(
    value,
    RENDERER_REVISIONS_V4,
    "Render request rendererRevision is not supported",
  );
}

export function validateRenderRequestV4(value: unknown): RenderRequestV4 {
  if (!isRecord(value) || !hasExactKeys(value, REQUEST_KEYS)) {
    throw new Error("Render request V4 has invalid fields");
  }
  if (value.version !== 4) {
    throw new Error("Render request version must be 4");
  }
  if (!Array.isArray(value.groups) || value.groups.length === 0) {
    throw new Error("Render request groups must be a non-empty array");
  }
  const rendererRevision = parseRendererRevision(value.rendererRevision);
  let diceCount = 0;
  const groups = value.groups.map((group, groupIndex) => {
    if (!Array.isArray(group) || group.length === 0) {
      throw new Error(
        `Render request groups[${String(groupIndex)}] must be a non-empty array`,
      );
    }
    diceCount += group.length;
    if (diceCount > 50) throw new Error("Render request exceeds 50 dice");
    return group.map((die, dieIndex) =>
      parseDie(
        die,
        `Render request groups[${String(groupIndex)}][${String(dieIndex)}]`,
        rendererRevision,
      ),
    );
  });
  return {
    version: 4,
    rendererRevision,
    groups,
  };
}
