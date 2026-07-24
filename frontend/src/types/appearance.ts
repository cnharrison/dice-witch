import type {
  AppearanceMaterialV4,
  AppearanceProfileV3 as SharedAppearanceProfileV3,
  AppearanceRecipeV3 as SharedAppearanceRecipeV3,
  GuildAppearanceProfileV3 as SharedGuildAppearanceProfileV3,
  MaterialFamilyV4,
  RenderFormV4,
} from "@dice-witch/dice-v4-model";
import type { AppearancePublicCatalogV3 } from "../../../cloudflare/packages/dice-appearance/src/types";

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
export type AppearanceEditorTarget = AppearanceTarget | "all";

export const APPEARANCE_TARGET_LABELS: Record<
  AppearanceEditorTarget,
  string
> = {
  all: "All dice",
  d4: "d4",
  d6: "d6",
  d8: "d8",
  d10: "d10",
  d12: "d12",
  d20: "d20",
  percentile: "Percentile",
  fudge: "Fudge",
  other: "Other",
};
export type AppearanceVariation = "fixed" | "curated" | "wild";
export type AppearanceVariationScope = "die" | "group" | "roll";
export type AppearanceRecipeCompatibility = "legacy-v1" | "native-v2";
export type AppearanceGradientColorSource =
  | "resolved-pair"
  | "full-palette";
export type AppearanceGradientScope = "repeated" | "die-wide";
export type AppearanceLinearDirection =
  | "top-to-bottom"
  | "upper-right-to-lower-left"
  | "right-to-left"
  | "lower-right-to-upper-left"
  | "bottom-to-top"
  | "lower-left-to-upper-right"
  | "left-to-right"
  | "upper-left-to-lower-right";
export type AppearanceLightingMode =
  | "none"
  | "facet"
  | "directional"
  | "combined";
export type AppearanceLightingStrength = "gentle" | "subtle" | "strong";
export type AppearanceLightingDirection =
  | "top"
  | "upper-left"
  | "upper-right"
  | "left"
  | "right";

export type AppearanceSelection<Value> =
  | { mode: "fixed"; value: Value }
  | { mode: "allowlist"; values: Value[] }
  | { mode: "weighted"; options: Array<{ value: Value; weight: number }> };
export type AppearanceFill =
  | { type: "solid" }
  | { type: "gradient" }
  | { type: "pattern"; patternId: string };

export type AppearanceColors =
  | { mode: "tonal" | "random"; primary: string }
  | { mode: "palette"; colors: string[] };

export type AppearanceColorsV2 =
  | AppearanceColors
  | { mode: "random-pair" }
  | { mode: "vivid-random-pair" };

export type AppearanceFillSelection =
  | { mode: "fixed"; value: AppearanceFill }
  | { mode: "allowlist"; values: AppearanceFill[] }
  | {
      mode: "weighted";
      options: Array<{ value: AppearanceFill; weight: number }>;
    };

export type AppearanceFontSelection =
  | { mode: "fixed"; fontId: string }
  | { mode: "allowlist"; fontIds: string[] }
  | {
      mode: "weighted";
      options: Array<{ fontId: string; weight: number }>;
    };

export type AppearanceRecipeV1 = {
  version: 1;
  variation: AppearanceVariation;
  varyBy: AppearanceVariationScope;
  colors: AppearanceColors;
  fill: AppearanceFillSelection;
  font: AppearanceFontSelection;
};

export type AppearanceRecipeV2 = {
  version: 2;
  compatibility: AppearanceRecipeCompatibility;
  variation: AppearanceVariation;
  varyBy: AppearanceVariationScope;
  colors: AppearanceColorsV2;
  fill: AppearanceFillSelection;
  font: AppearanceFontSelection;
  gradient: {
    colorSource: AppearanceGradientColorSource;
    scope: AppearanceSelection<AppearanceGradientScope>;
    direction: AppearanceSelection<AppearanceLinearDirection>;
  };
  lighting: {
    mode: AppearanceSelection<AppearanceLightingMode>;
    strength: AppearanceSelection<AppearanceLightingStrength>;
    direction: AppearanceSelection<AppearanceLightingDirection>;
  };
};

export type DesignReference =
  | { source: "builtin"; id: string }
  | { source: "custom"; id: string };

export type AppearanceDesignV1 = {
  id: string;
  name: string;
  recipe: AppearanceRecipeV1;
};

export type AppearanceDesignV2 = {
  id: string;
  name: string;
  recipe: AppearanceRecipeV2;
};

export type AppearanceProfileV1 = {
  version: 1;
  designs: AppearanceDesignV1[];
  assignments: {
    all: DesignReference | null;
    overrides: Partial<Record<AppearanceTarget, DesignReference>>;
  };
};

export type GuildAppearanceProfileV1 = AppearanceProfileV1 & {
  mode: "off" | "default" | "enforced";
};

export type AppearanceProfileV2 = {
  version: 2;
  designs: AppearanceDesignV2[];
  assignments: AppearanceProfileV1["assignments"];
};

export type GuildAppearanceProfileV2 = AppearanceProfileV2 & {
  mode: "off" | "default" | "enforced";
};

export type AppearanceCatalogV1 = {
  version: 1;
  defaultStyleId: string;
  styles: Array<{
    id: string;
    name: string;
    description: string;
    recipe: AppearanceRecipeV1;
  }>;
  patterns: Array<{ id: string; name: string }>;
  fonts: Array<{ id: string; name: string }>;
};

export type AppearanceCatalogV2 = {
  version: 2;
  defaultStyleId: string;
  styles: Array<{
    id: string;
    name: string;
    description: string;
    recipe: AppearanceRecipeV2;
  }>;
  patterns: Array<{ id: string; name: string }>;
  fonts: Array<{ id: string; name: string }>;
};

export type AppearanceRecipeV3 = SharedAppearanceRecipeV3;
export type AppearanceProfileV3 = SharedAppearanceProfileV3;
export type GuildAppearanceProfileV3 = SharedGuildAppearanceProfileV3;

export type AppearanceCatalogV3 = AppearancePublicCatalogV3;

export type AppearanceProfileResource<
  Profile extends AppearanceProfileV2 | AppearanceProfileV3 = AppearanceProfileV2,
> = {
  revision: number;
  profile: Profile | null;
};

export type AppearancePreview = {
  version: 2;
  contentType: "image/png";
  width: number;
  height: number;
  base64: string;
};

export type AppearancePreviewV3 = Omit<AppearancePreview, "version"> & {
  version: 3;
};

export type AppearanceMaterialFamily = MaterialFamilyV4;
export type AppearanceMaterial = AppearanceMaterialV4;
export type AppearanceRenderForm = RenderFormV4;
