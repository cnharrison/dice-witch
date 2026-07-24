import type {
  AppearanceColorsV3,
  AppearanceMaterialV4,
  AppearanceProfileV3,
  AppearanceRecipeV3,
  AppearanceTargetV4,
  AppearanceVariationScopeV3,
  AppearanceVariationV3,
  EngravingFinishV4,
  FontIdV4,
  GradientScopeV4,
  GuildAppearanceProfileV3,
  LightingDirectionV4,
  LightingModeV4,
  LightingStrengthV4,
  LinearDirectionV4,
  MaterialFamilyV4,
  PatternIdV4,
  RenderAppearanceV4,
  RenderFormV4,
} from "@dice-witch/dice-v4-model";

export const APPEARANCE_TARGETS = [
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
  "percentile",
  "fudge",
  "other",
] as const;

export type AppearanceTarget = (typeof APPEARANCE_TARGETS)[number];
export type AppearanceVariation = "fixed" | "curated" | "wild";
export type AppearanceVariationScope = "die" | "group" | "roll";

export const APPEARANCE_RECIPE_COMPATIBILITIES = [
  "legacy-v1",
  "native-v2",
] as const;
export const APPEARANCE_GRADIENT_COLOR_SOURCES = [
  "resolved-pair",
  "full-palette",
] as const;
export const APPEARANCE_GRADIENT_SCOPES = [
  "repeated",
  "die-wide",
] as const;
export const APPEARANCE_LINEAR_DIRECTIONS = [
  "top-to-bottom",
  "upper-right-to-lower-left",
  "right-to-left",
  "lower-right-to-upper-left",
  "bottom-to-top",
  "lower-left-to-upper-right",
  "left-to-right",
  "upper-left-to-lower-right",
] as const;
export const APPEARANCE_LIGHTING_MODES = [
  "none",
  "facet",
  "directional",
  "combined",
] as const;
export const APPEARANCE_LIGHTING_STRENGTHS = [
  "gentle",
  "subtle",
  "strong",
] as const;
export const APPEARANCE_LIGHTING_DIRECTIONS = [
  "top",
  "upper-left",
  "upper-right",
  "left",
  "right",
] as const;

export type AppearanceGradientScope =
  (typeof APPEARANCE_GRADIENT_SCOPES)[number];
export type AppearanceLinearDirection =
  (typeof APPEARANCE_LINEAR_DIRECTIONS)[number];
export type AppearanceLightingMode =
  (typeof APPEARANCE_LIGHTING_MODES)[number];
export type AppearanceLightingStrength =
  (typeof APPEARANCE_LIGHTING_STRENGTHS)[number];
export type AppearanceLightingDirection =
  (typeof APPEARANCE_LIGHTING_DIRECTIONS)[number];
export type AppearanceRecipeCompatibility =
  (typeof APPEARANCE_RECIPE_COMPATIBILITIES)[number];
export type AppearanceGradientColorSource =
  (typeof APPEARANCE_GRADIENT_COLOR_SOURCES)[number];

export type AppearanceWeightedValueOption<Value> = {
  value: Value;
  weight: number;
};

export type AppearanceSelection<Value> =
  | { mode: "fixed"; value: Value }
  | { mode: "allowlist"; values: Value[] }
  | {
      mode: "weighted";
      options: AppearanceWeightedValueOption<Value>[];
    };

export type AppearanceCatalog = {
  builtinStyleIds: readonly string[];
  fontIds: readonly string[];
  patternIds: readonly string[];
};

export type AppearanceCatalogOption = {
  id: string;
  name: string;
};

export type AppearanceBuiltinStyleV1 = AppearanceCatalogOption & {
  description: string;
  recipe: AppearanceRecipeV1;
};

export type AppearanceBuiltinStyleV2 = AppearanceCatalogOption & {
  description: string;
  recipe: AppearanceRecipeV2;
};

export type AppearanceBuiltinStyleV3 = AppearanceCatalogOption &
  AppearanceBuiltinRecipeV3 & {
    description: string;
  };

export type AppearancePublicCatalogV1 = {
  version: 1;
  defaultStyleId: string;
  styles: AppearanceBuiltinStyleV1[];
  patterns: AppearanceCatalogOption[];
  fonts: AppearanceCatalogOption[];
};

export type AppearancePublicCatalogV2 = {
  version: 2;
  defaultStyleId: string;
  styles: AppearanceBuiltinStyleV2[];
  patterns: AppearanceCatalogOption[];
  fonts: AppearanceCatalogOption[];
};

export type AppearanceCatalogOptionV3<Id extends string> = Readonly<{
  id: Id;
  name: string;
}>;

export type AppearanceIntegerRangeV3 = Readonly<{
  minimum: number;
  maximum: number;
  step: 1;
}>;

type MaterialV3<Family extends MaterialFamilyV4> = Extract<
  AppearanceMaterialV4,
  { family: Family }
>;

export type AppearanceMaterialCatalogV3 =
  | Readonly<{
      family: "classic";
      name: string;
      defaultValue: MaterialV3<"classic">;
      treatments: readonly AppearanceCatalogOptionV3<
        MaterialV3<"classic">["treatment"]
      >[];
      opacities: readonly AppearanceCatalogOptionV3<
        MaterialV3<"classic">["opacity"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"classic">["finish"]
      >[];
      textureScale: AppearanceIntegerRangeV3;
    }>
  | Readonly<{
      family: "sharp-resin";
      name: string;
      defaultValue: MaterialV3<"sharp-resin">;
      styles: readonly AppearanceCatalogOptionV3<
        MaterialV3<"sharp-resin">["style"]
      >[];
      inclusions: readonly AppearanceCatalogOptionV3<
        MaterialV3<"sharp-resin">["inclusion"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"sharp-resin">["finish"]
      >[];
      clarity: AppearanceIntegerRangeV3;
      inclusionDensity: AppearanceIntegerRangeV3;
      textureScale: AppearanceIntegerRangeV3;
    }>
  | Readonly<{
      family: "liquid-core";
      name: string;
      defaultValue: MaterialV3<"liquid-core">;
      cores: readonly AppearanceCatalogOptionV3<
        MaterialV3<"liquid-core">["core"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"liquid-core">["finish"]
      >[];
      clarity: AppearanceIntegerRangeV3;
      particleDensity: AppearanceIntegerRangeV3;
      textureScale: AppearanceIntegerRangeV3;
    }>
  | Readonly<{
      family: "gemstone";
      name: string;
      defaultValue: MaterialV3<"gemstone">;
      stones: readonly AppearanceCatalogOptionV3<
        MaterialV3<"gemstone">["stone"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"gemstone">["finish"]
      >[];
      veinDensity: AppearanceIntegerRangeV3;
      textureScale: AppearanceIntegerRangeV3;
    }>
  | Readonly<{
      family: "glass";
      name: string;
      defaultValue: MaterialV3<"glass">;
      styles: readonly AppearanceCatalogOptionV3<
        MaterialV3<"glass">["style"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"glass">["finish"]
      >[];
      clarity: AppearanceIntegerRangeV3;
      textureScale: AppearanceIntegerRangeV3;
    }>
  | Readonly<{
      family: "stone";
      name: string;
      defaultValue: MaterialV3<"stone">;
      stones: readonly AppearanceCatalogOptionV3<
        MaterialV3<"stone">["stone"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"stone">["finish"]
      >[];
      grainDensity: AppearanceIntegerRangeV3;
      textureScale: AppearanceIntegerRangeV3;
    }>
  | Readonly<{
      family: "metal";
      name: string;
      defaultValue: MaterialV3<"metal">;
      metals: readonly AppearanceCatalogOptionV3<
        MaterialV3<"metal">["metal"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"metal">["finish"]
      >[];
      patinaStrength: AppearanceIntegerRangeV3;
      textureScale: AppearanceIntegerRangeV3;
    }>
  | Readonly<{
      family: "hollow-metal";
      name: string;
      defaultValue: MaterialV3<"hollow-metal">;
      constructions: readonly AppearanceCatalogOptionV3<
        MaterialV3<"hollow-metal">["construction"]
      >[];
      metals: readonly AppearanceCatalogOptionV3<
        MaterialV3<"hollow-metal">["metal"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"hollow-metal">["finish"]
      >[];
      openness: AppearanceIntegerRangeV3;
      textureScale: AppearanceIntegerRangeV3;
    }>
  | Readonly<{
      family: "wood";
      name: string;
      defaultValue: MaterialV3<"wood">;
      woods: readonly AppearanceCatalogOptionV3<
        MaterialV3<"wood">["wood"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"wood">["finish"]
      >[];
      grainDensity: AppearanceIntegerRangeV3;
      textureScale: AppearanceIntegerRangeV3;
    }>
  | Readonly<{
      family: "fantasy";
      name: string;
      defaultValue: MaterialV3<"fantasy">;
      essences: readonly AppearanceCatalogOptionV3<
        MaterialV3<"fantasy">["essence"]
      >[];
      finishes: readonly AppearanceCatalogOptionV3<
        MaterialV3<"fantasy">["finish"]
      >[];
      intensity: AppearanceIntegerRangeV3;
      textureScale: AppearanceIntegerRangeV3;
    }>;

export type AppearanceFormCatalogV3 = Readonly<{
  id: RenderFormV4;
  name: string;
  targets: readonly AppearanceTargetV4[];
  materialFamilies: readonly MaterialFamilyV4[];
}>;

export type AppearancePublicCatalogV3 = Readonly<{
  version: 3;
  defaultStyleId: string;
  editorDefaults: Readonly<{
    primaryColor: string;
    palette: readonly [string, string, ...string[]];
    patternId: PatternIdV4;
  }>;
  featuredStyleIds: readonly string[];
  collectorStyleIds: readonly string[];
  featuredPatternIds: readonly PatternIdV4[];
  styles: readonly AppearanceBuiltinStyleV3[];
  targets: readonly AppearanceCatalogOptionV3<AppearanceTargetV4>[];
  patterns: readonly AppearanceCatalogOptionV3<PatternIdV4>[];
  fonts: readonly AppearanceCatalogOptionV3<FontIdV4>[];
  engravingFinishes: readonly AppearanceCatalogOptionV3<EngravingFinishV4>[];
  variations: readonly AppearanceCatalogOptionV3<AppearanceVariationV3>[];
  variationScopes: readonly AppearanceCatalogOptionV3<
    AppearanceVariationScopeV3
  >[];
  colorModes: readonly AppearanceCatalogOptionV3<
    AppearanceColorsV3["mode"]
  >[];
  selectionModes: readonly AppearanceCatalogOptionV3<
    "fixed" | "allowlist" | "weighted"
  >[];
  materials: readonly AppearanceMaterialCatalogV3[];
  forms: readonly AppearanceFormCatalogV3[];
  gradient: Readonly<{
    scopes: readonly AppearanceCatalogOptionV3<GradientScopeV4>[];
    directions: readonly AppearanceCatalogOptionV3<LinearDirectionV4>[];
  }>;
  lighting: Readonly<{
    modes: readonly AppearanceCatalogOptionV3<LightingModeV4>[];
    strengths: readonly AppearanceCatalogOptionV3<LightingStrengthV4>[];
    directions: readonly AppearanceCatalogOptionV3<LightingDirectionV4>[];
  }>;
  bounds: Readonly<{
    paletteColors: Readonly<{ minimum: 2; maximum: 6 }>;
    percentage: AppearanceIntegerRangeV3;
    textureScale: AppearanceIntegerRangeV3;
    selectionWeight: AppearanceIntegerRangeV3;
    maximumTotalSelectionWeight: number;
    maximumMaterialOptions: number;
    maximumDesigns: number;
    maximumDesignNameCharacters: number;
    maximumProfileJsonCharacters: number;
  }>;
}>;

export type DesignReference =
  | { source: "builtin"; id: string }
  | { source: "custom"; id: string };

export type AppearanceColors =
  | { mode: "tonal"; primary: string }
  | { mode: "random"; primary: string }
  | { mode: "palette"; colors: string[] };

export type AppearanceColorsV2 =
  | AppearanceColors
  | { mode: "random-pair" }
  | { mode: "vivid-random-pair" };

export type AppearanceFill =
  | { type: "solid" }
  | { type: "gradient" }
  | { type: "pattern"; patternId: string };

export type AppearanceWeightedFillOption = {
  value: AppearanceFill;
  weight: number;
};

export type AppearanceFillSelection =
  | { mode: "fixed"; value: AppearanceFill }
  | { mode: "allowlist"; values: AppearanceFill[] }
  | { mode: "weighted"; options: AppearanceWeightedFillOption[] };

export type AppearanceWeightedFontOption = {
  fontId: string;
  weight: number;
};

export type AppearanceFontSelection =
  | { mode: "fixed"; fontId: string }
  | { mode: "allowlist"; fontIds: string[] }
  | { mode: "weighted"; options: AppearanceWeightedFontOption[] };

export type AppearanceRecipeV1 = {
  version: 1;
  variation: AppearanceVariation;
  varyBy: AppearanceVariationScope;
  colors: AppearanceColors;
  fill: AppearanceFillSelection;
  font: AppearanceFontSelection;
};

export type AppearanceGradientV2 = {
  colorSource: AppearanceGradientColorSource;
  scope: AppearanceSelection<AppearanceGradientScope>;
  direction: AppearanceSelection<AppearanceLinearDirection>;
};

export type AppearanceLightingV2 = {
  mode: AppearanceSelection<AppearanceLightingMode>;
  strength: AppearanceSelection<AppearanceLightingStrength>;
  direction: AppearanceSelection<AppearanceLightingDirection>;
};

export type AppearanceRecipeV2 = {
  version: 2;
  compatibility: AppearanceRecipeCompatibility;
  variation: AppearanceVariation;
  varyBy: AppearanceVariationScope;
  colors: AppearanceColorsV2;
  fill: AppearanceFillSelection;
  font: AppearanceFontSelection;
  gradient: AppearanceGradientV2;
  lighting: AppearanceLightingV2;
};

export type CustomDesignV1 = {
  id: string;
  name: string;
  recipe: AppearanceRecipeV1;
};

export type CustomDesignV2 = {
  id: string;
  name: string;
  recipe: AppearanceRecipeV2;
};

export type AppearanceAssignmentsV1 = {
  all: DesignReference | null;
  overrides: Partial<Record<AppearanceTarget, DesignReference>>;
};
export type AppearanceAssignmentsV2 = AppearanceAssignmentsV1;

export type AppearanceProfileV1 = {
  version: 1;
  designs: CustomDesignV1[];
  assignments: AppearanceAssignmentsV1;
};

export type AppearanceProfileV2 = {
  version: 2;
  designs: CustomDesignV2[];
  assignments: AppearanceAssignmentsV2;
};

export type GuildAppearanceMode = "off" | "default" | "enforced";
export type GuildAppearanceProfileV1 = AppearanceProfileV1 & {
  mode: GuildAppearanceMode;
};
export type GuildAppearanceProfileV2 = AppearanceProfileV2 & {
  mode: GuildAppearanceMode;
};

export type EffectiveAppearanceRecipesV1 = Record<
  AppearanceTarget,
  AppearanceRecipeV1
>;
export type EffectiveAppearanceRecipesV2 = Record<
  AppearanceTarget,
  AppearanceRecipeV2
>;

export type AppearanceBuiltinRecipeV3 = Readonly<{
  recipe: AppearanceRecipeV3;
  overrides?: Readonly<
    Partial<Record<AppearanceTargetV4, AppearanceRecipeV3>>
  >;
}>;

export type AppearanceBuiltinRecipesV3 = Readonly<
  Partial<Record<string, AppearanceBuiltinRecipeV3>>
>;

export type EffectiveAppearanceRecipesV3 = Record<
  AppearanceTargetV4,
  AppearanceRecipeV3
>;

export type AppearanceResolutionContextV3 = {
  renderSeed: number;
  target: AppearanceTargetV4;
  groupIndex: number;
  dieIndex: number;
  groupIdentity?: string;
  dieIdentity?: string;
};

export type ResolvedAppearanceV3 = {
  version: 3;
  form: RenderFormV4;
  appearance: Omit<RenderAppearanceV4, "effect">;
};

export type EffectiveAppearanceRecipeInput = {
  personalProfile: AppearanceProfileV1 | null;
  guildProfile: GuildAppearanceProfileV1 | null;
  builtins: Readonly<Partial<Record<string, AppearanceRecipeV1>>>;
};

export type EffectiveAppearanceRecipeInputV2 = {
  personalProfile: AppearanceProfileV2 | null;
  guildProfile: GuildAppearanceProfileV2 | null;
  builtins: Readonly<Partial<Record<string, AppearanceRecipeV2>>>;
};

export type EffectiveAppearanceRecipeInputV3 = {
  personalProfile: AppearanceProfileV3 | null;
  guildProfile: GuildAppearanceProfileV3 | null;
  builtins: AppearanceBuiltinRecipesV3;
};

export type AppearanceResolutionContext = {
  renderSeed: number;
  target: AppearanceTarget;
  groupIndex: number;
  dieIndex: number;
};

export type ResolvedAppearanceV1 = {
  version: 1;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  outlineColor: "#000000";
  fill: AppearanceFill;
  fontId: string;
  requiresLocalSeparation: boolean;
};

export type ResolvedAppearanceSurfaceV2 =
  | { type: "solid"; color: string }
  | {
      type: "gradient";
      colors: [string, string, ...string[]];
      scope: AppearanceGradientScope;
      direction: AppearanceLinearDirection;
    }
  | {
      type: "pattern";
      patternId: string;
      primaryColor: string;
      secondaryColor: string;
    };

export type ResolvedAppearanceLightingV2 =
  | { mode: "none" }
  | { mode: "facet"; strength: AppearanceLightingStrength }
  | {
      mode: "directional" | "combined";
      strength: AppearanceLightingStrength;
      direction: AppearanceLightingDirection;
    };

export type ResolvedAppearanceV2 = {
  version: 2;
  compatibility: AppearanceRecipeCompatibility;
  surface: ResolvedAppearanceSurfaceV2;
  lighting: ResolvedAppearanceLightingV2;
  textColor: "#111111" | "#faf9f6";
  outlineColor: "#000000";
  fontId: string;
  requiresLocalSeparation: boolean;
};
