import type {
  APPEARANCE_FORM_POLICIES_V3,
  APPEARANCE_RANDOMIZATION_POLICIES_V3,
  APPEARANCE_TARGETS_V4,
  APPEARANCE_VARIATIONS_V3,
  APPEARANCE_VARIATION_SCOPES_V3,
  CLASSIC_FINISHES_V4,
  CLASSIC_OPACITIES_V4,
  CRITICAL_TREATMENTS_V4,
  ELEMENTAL_STYLES_V4,
  ENGRAVING_FINISHES_V4,
  FANTASY_ESSENCES_V4,
  FANTASY_FINISHES_V4,
  FONT_IDS_V4,
  GEMSTONE_FINISHES_V4,
  GEMSTONE_STYLES_V4,
  GLASS_FINISHES_V4,
  GLASS_STYLES_V4,
  GRADIENT_SCOPES_V4,
  HOLLOW_METAL_CONSTRUCTIONS_V4,
  ICON_NAMES_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_MODES_V4,
  LIGHTING_STRENGTHS_V4,
  LINEAR_DIRECTIONS_V4,
  LIQUID_CORE_STYLES_V4,
  MATERIAL_FAMILIES_V4,
  METALS_V4,
  METAL_FINISHES_V4,
  PAINT_STYLES_V4,
  PATTERN_IDS_V4,
  POLYHEDRAL_FORMS_V4,
  RENDERER_REVISIONS_V4,
  RENDER_FORMS_V4,
  RESIN_FINISHES_V4,
  RESIN_INCLUSIONS_V4,
  SHARP_RESIN_STYLES_V4,
  STONE_FINISHES_V4,
  STONE_STYLES_V4,
  TEXTURE_GENERATOR_IDS_V4,
  TEXTURE_SCOPES_V4,
  WOOD_FINISHES_V4,
  WOOD_STYLES_V4,
} from "./registries";

export type AppearanceTargetV4 = (typeof APPEARANCE_TARGETS_V4)[number];
export type AppearanceVariationV3 =
  (typeof APPEARANCE_VARIATIONS_V3)[number];
export type AppearanceVariationScopeV3 =
  (typeof APPEARANCE_VARIATION_SCOPES_V3)[number];
export type AppearanceRandomizationPolicyV3 =
  (typeof APPEARANCE_RANDOMIZATION_POLICIES_V3)[number];
export type AppearanceFormPolicyV3 =
  (typeof APPEARANCE_FORM_POLICIES_V3)[number];
export type MaterialFamilyV4 = (typeof MATERIAL_FAMILIES_V4)[number];
export type PatternIdV4 = (typeof PATTERN_IDS_V4)[number];
export type FontIdV4 = (typeof FONT_IDS_V4)[number];
export type EngravingFinishV4 = (typeof ENGRAVING_FINISHES_V4)[number];
export type PolyhedralFormV4 = (typeof POLYHEDRAL_FORMS_V4)[number];
export type RenderFormV4 = (typeof RENDER_FORMS_V4)[number];
export type GradientScopeV4 = (typeof GRADIENT_SCOPES_V4)[number];
export type LinearDirectionV4 = (typeof LINEAR_DIRECTIONS_V4)[number];
export type LightingModeV4 = (typeof LIGHTING_MODES_V4)[number];
export type LightingStrengthV4 = (typeof LIGHTING_STRENGTHS_V4)[number];
export type LightingDirectionV4 = (typeof LIGHTING_DIRECTIONS_V4)[number];
export type IconNameV4 = (typeof ICON_NAMES_V4)[number];
export type TextureGeneratorIdV4 =
  (typeof TEXTURE_GENERATOR_IDS_V4)[number];
export type TextureScopeV4 = (typeof TEXTURE_SCOPES_V4)[number];
export type CriticalTreatmentV4 = (typeof CRITICAL_TREATMENTS_V4)[number];
export type RendererRevisionV4 = (typeof RENDERER_REVISIONS_V4)[number];

export type HexColor = string;

export type WeightedSelectionOption<Value> = {
  value: Value;
  weight: number;
};

export type AppearanceSelection<Value> =
  | { mode: "fixed"; value: Value }
  | { mode: "allowlist"; values: Value[] }
  | { mode: "weighted"; options: WeightedSelectionOption<Value>[] };

export type AppearanceColorsV3 =
  | { mode: "solid" | "tonal" | "random"; primary: HexColor }
  | { mode: "palette"; colors: HexColor[] }
  | { mode: "random-pair" | "vivid-random-pair" };

export type ClassicMaterialV4 =
  | {
      family: "classic";
      treatment: "solid" | "gradient";
      opacity: (typeof CLASSIC_OPACITIES_V4)[number];
      finish: (typeof CLASSIC_FINISHES_V4)[number];
      textureScale: number;
    }
  | {
      family: "classic";
      treatment: "pattern";
      patternId: PatternIdV4;
      opacity: (typeof CLASSIC_OPACITIES_V4)[number];
      finish: (typeof CLASSIC_FINISHES_V4)[number];
      textureScale: number;
    };

export type SharpResinMaterialV4 = {
  family: "sharp-resin";
  style: (typeof SHARP_RESIN_STYLES_V4)[number];
  inclusion: (typeof RESIN_INCLUSIONS_V4)[number];
  clarity: number;
  inclusionDensity: number;
  finish: (typeof RESIN_FINISHES_V4)[number];
  textureScale: number;
};

export type LiquidCoreMaterialV4 = {
  family: "liquid-core";
  core: (typeof LIQUID_CORE_STYLES_V4)[number];
  clarity: number;
  particleDensity: number;
  finish: (typeof RESIN_FINISHES_V4)[number];
  textureScale: number;
};

export type GemstoneMaterialV4 = {
  family: "gemstone";
  stone: (typeof GEMSTONE_STYLES_V4)[number];
  veinDensity: number;
  finish: (typeof GEMSTONE_FINISHES_V4)[number];
  textureScale: number;
};

export type GlassMaterialV4 = {
  family: "glass";
  style: (typeof GLASS_STYLES_V4)[number];
  clarity: number;
  finish: (typeof GLASS_FINISHES_V4)[number];
  textureScale: number;
};

export type StoneMaterialV4 = {
  family: "stone";
  stone: (typeof STONE_STYLES_V4)[number];
  grainDensity: number;
  finish: (typeof STONE_FINISHES_V4)[number];
  textureScale: number;
};

export type MetalMaterialV4 = {
  family: "metal";
  metal: (typeof METALS_V4)[number];
  finish: (typeof METAL_FINISHES_V4)[number];
  patinaStrength: number;
  textureScale: number;
};

export type HollowMetalMaterialV4 = {
  family: "hollow-metal";
  construction: (typeof HOLLOW_METAL_CONSTRUCTIONS_V4)[number];
  metal: (typeof METALS_V4)[number];
  finish: (typeof METAL_FINISHES_V4)[number];
  openness: number;
  textureScale: number;
};

export type WoodMaterialV4 = {
  family: "wood";
  wood: (typeof WOOD_STYLES_V4)[number];
  finish: (typeof WOOD_FINISHES_V4)[number];
  grainDensity: number;
  textureScale: number;
};

export type FantasyMaterialV4 = {
  family: "fantasy";
  essence: (typeof FANTASY_ESSENCES_V4)[number];
  intensity: number;
  finish: (typeof FANTASY_FINISHES_V4)[number];
  textureScale: number;
};

export type ElementalMaterialV4 =
  | {
      family: "elemental";
      style: Extract<(typeof ELEMENTAL_STYLES_V4)[number], "lava">;
      fissureDensity: number;
      glowIntensity: number;
      textureScale: number;
    }
  | {
      family: "elemental";
      style: Extract<(typeof ELEMENTAL_STYLES_V4)[number], "sand">;
      grainSize: number;
      windDirection: number;
      textureScale: number;
    }
  | {
      family: "elemental";
      style: Extract<
        (typeof ELEMENTAL_STYLES_V4)[number],
        "blue-sky" | "sunset"
      >;
      cloudCover: number;
      horizonHeight: number;
      textureScale: number;
    };

export type PaintMaterialV4 = {
  family: "paint";
  style: (typeof PAINT_STYLES_V4)[number];
  dropDensity: number;
  streakLength: number;
  textureScale: number;
};

export type AppearanceMaterialV4 =
  | ClassicMaterialV4
  | SharpResinMaterialV4
  | LiquidCoreMaterialV4
  | GemstoneMaterialV4
  | GlassMaterialV4
  | StoneMaterialV4
  | MetalMaterialV4
  | HollowMetalMaterialV4
  | WoodMaterialV4
  | FantasyMaterialV4
  | ElementalMaterialV4
  | PaintMaterialV4;

export type AppearanceLightingV3 = {
  mode: AppearanceSelection<LightingModeV4>;
  strength: AppearanceSelection<LightingStrengthV4>;
  direction: AppearanceSelection<LightingDirectionV4>;
};

export type AppearanceGradientV3 = {
  scope: AppearanceSelection<GradientScopeV4>;
  direction: AppearanceSelection<LinearDirectionV4>;
};

export type AppearanceRecipeV3 = {
  version: 3;
  variation: AppearanceVariationV3;
  varyBy: AppearanceVariationScopeV3;
  randomization?: AppearanceRandomizationPolicyV3;
  colors: AppearanceColorsV3;
  material: AppearanceSelection<AppearanceMaterialV4>;
  form: {
    policy?: AppearanceFormPolicyV3;
    polyhedral: AppearanceSelection<PolyhedralFormV4>;
    other: "sphere";
  };
  font: AppearanceSelection<FontIdV4>;
  engraving: AppearanceSelection<EngravingFinishV4>;
  gradient: AppearanceGradientV3;
  lighting: AppearanceLightingV3;
};

export type AppearanceDesignReferenceV3 =
  | { source: "builtin"; id: string }
  | { source: "custom"; id: string };

export type CustomAppearanceDesignV3 = {
  id: string;
  name: string;
  recipe: AppearanceRecipeV3;
};

export type AppearanceAssignmentsV3 = {
  all: AppearanceDesignReferenceV3 | null;
  overrides: Partial<Record<AppearanceTargetV4, AppearanceDesignReferenceV3>>;
};

export type AppearanceProfileV3 = {
  version: 3;
  designs: CustomAppearanceDesignV3[];
  assignments: AppearanceAssignmentsV3;
};

export type GuildAppearanceProfileV3 = AppearanceProfileV3 & {
  mode: "off" | "default" | "enforced";
};

export type DiceViewModeV4 = "normal" | "legacy" | "clear";

export type DiceViewAzimuthV4 = {
  mode: "random" | "custom";
  customDegrees: number;
};

export type DiceViewPreferencesV4 = {
  elevationDegrees: number;
  mode: DiceViewModeV4;
  azimuth: {
    all: DiceViewAzimuthV4;
    overrides: Partial<Record<AppearanceTargetV4, DiceViewAzimuthV4>>;
  };
};

export type AppearanceProfileV4 = {
  version: 4;
  designs: CustomAppearanceDesignV3[];
  assignments: AppearanceAssignmentsV3;
  diceView: DiceViewPreferencesV4;
};

export type GuildAppearanceProfileV4 = AppearanceProfileV4 & {
  mode: "off" | "default" | "enforced";
};

export type AppearanceValidationCatalogV3 = {
  builtinStyleIds: readonly string[];
};

export type RenderLightingV4 =
  | { mode: "none" }
  | { mode: "facet"; strength: LightingStrengthV4 }
  | {
      mode: "directional" | "combined";
      strength: LightingStrengthV4;
      direction: LightingDirectionV4;
    };

export type RenderTextureV4 = {
  generatorId: TextureGeneratorIdV4;
  seed: number;
  scale: number;
  rotation: number;
  offsetU: number;
  offsetV: number;
  scope?: TextureScopeV4;
};

export type TexturePlacementV4 = Readonly<
  Pick<RenderTextureV4, "rotation" | "offsetU" | "offsetV">
>;

export type RenderEngravingV4 = {
  fontId: FontIdV4;
  finish: EngravingFinishV4;
  color: HexColor;
};

export type RenderCriticalEffectV4 = {
  state: "critical-success" | "critical-failure";
  treatment: CriticalTreatmentV4;
  color: HexColor;
  intensity: number;
};

export type RenderAppearanceV4 = {
  material: AppearanceMaterialV4;
  palette: [HexColor, HexColor, ...HexColor[]];
  texture: RenderTextureV4;
  lighting: RenderLightingV4;
  engraving: RenderEngravingV4;
  outlineColor: "#000000";
  requiresLocalSeparation: boolean;
  effect: RenderCriticalEffectV4 | null;
};

export type RenderViewV4 =
  | {
      kind: "camera";
      elevationDegrees: number;
      azimuthOffsetDegrees: number;
      poseAzimuthDegrees: number;
    }
  | {
      kind: "oriented-camera";
      mode: "legacy" | "clear";
      elevationDegrees: number;
      azimuthOffsetDegrees: number;
      resultRotation: readonly [number, number, number, number];
    }
  | {
      kind: "sphere-surface";
      rotationDegrees: number;
      labelLongitudeDegrees?: number;
      labelLatitudeDegrees?: number;
      labelRotationDegrees?: number;
    };

export type FaceLabelSetV4 = "percentile-ones";

type RenderDieV4Base = {
  result: number;
  form: RenderFormV4;
  appearance: RenderAppearanceV4;
  icons: IconNameV4[];
  view?: RenderViewV4;
};

export type RenderDieV4 =
  | (RenderDieV4Base & {
      target: "d10";
      faceLabelSet?: FaceLabelSetV4;
    })
  | (RenderDieV4Base & {
      target: Exclude<AppearanceTargetV4, "d10" | "other">;
    })
  | (RenderDieV4Base & {
      target: "other";
      sides: number;
    });

export type RenderRequestV4 = {
  version: 4;
  rendererRevision: RendererRevisionV4;
  groups: RenderDieV4[][];
};

export type PublicRenderModelV4 = RenderRequestV4;
