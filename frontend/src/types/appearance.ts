import type {
  AppearanceMaterialV4,
  AppearanceProfileV4 as SharedAppearanceProfileV4,
  AppearanceRecipeV3 as SharedAppearanceRecipeV3,
  GuildAppearanceProfileV4 as SharedGuildAppearanceProfileV4,
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

export const APPEARANCE_TARGET_LABELS = {
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
} satisfies Record<AppearanceEditorTarget, string>;

export type AppearanceRecipeV3 = SharedAppearanceRecipeV3;
export type AppearanceProfileV4 = SharedAppearanceProfileV4;
export type GuildAppearanceProfileV4 = SharedGuildAppearanceProfileV4;
export type AppearanceCatalogV3 = AppearancePublicCatalogV3;

export type AppearanceProfileResource<
  Profile extends AppearanceProfileV4 | GuildAppearanceProfileV4 = AppearanceProfileV4,
> = {
  revision: number;
  profile: Profile | null;
  canRestorePreviousMix: boolean;
};

export type AppearancePreviewV4 = {
  version: 4;
  contentType: "image/png";
  width: number;
  height: number;
  base64: string;
};

export type AppearanceMaterialFamily = MaterialFamilyV4;
export type AppearanceMaterial = AppearanceMaterialV4;
export type AppearanceRenderForm = RenderFormV4;
