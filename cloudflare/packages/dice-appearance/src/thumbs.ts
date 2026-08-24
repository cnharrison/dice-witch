import {
  createDefaultDiceViewPreferencesV4,
  materialDefaultPolyhedralFormV4,
  type AppearanceMaterialV4,
  type AppearanceRecipeV3,
  type DiceViewPreferencesV4,
  type RendererRevisionV4,
} from "@dice-witch/dice-v4-model";
import type {
  AppearanceBuiltinStyleV3,
  AppearancePublicCatalogV3,
  AppearanceTarget,
} from "./types";
import type { AppearancePreviewRequestV4 } from "./preview";

export type AppearanceThumbKind = "preset" | "material" | "font" | "ink";

export type AppearanceThumbSpec = Readonly<{
  kind: AppearanceThumbKind;
  id: string;
  target: AppearanceTarget;
  recipe: AppearanceRecipeV3;
}>;

export type AppearanceThumbVersionParts = Readonly<{
  catalogVersion: number;
  rendererRevision: RendererRevisionV4;
}>;

// Distinct from the editor preview default seed so baked tiles are visually
// stable across deploys regardless of editor state.
export const APPEARANCE_THUMB_SEED_V3 = 0x51ce_b00d;
export const APPEARANCE_THUMB_CACHE_REVISION_V3 = 2;

const APPEARANCE_THUMB_TARGET_V3 = "d20" as const;
const APPEARANCE_THUMB_NEUTRAL_STYLE_ID_V3 = "solid";

function neutralRecipeV3(catalog: AppearancePublicCatalogV3): AppearanceRecipeV3 {
  const style = catalog.styles.find(
    ({ id }) => id === APPEARANCE_THUMB_NEUTRAL_STYLE_ID_V3,
  );
  if (!style) {
    throw new Error("Appearance thumb neutral style is missing");
  }
  return structuredClone(style.recipe);
}

function presetSpecV3(
  style: AppearanceBuiltinStyleV3,
): AppearanceThumbSpec {
  // Styles may carry per-target overrides; a thumbnail must show what the
  // chosen render target actually resolves to.
  const override = style.overrides?.[APPEARANCE_THUMB_TARGET_V3];
  return {
    kind: "preset",
    id: style.id,
    target: APPEARANCE_THUMB_TARGET_V3,
    recipe: structuredClone(override ?? style.recipe),
  };
}

export function appearanceThumbnailManifestV3(
  catalog: AppearancePublicCatalogV3,
  rendererRevision: RendererRevisionV4,
): readonly AppearanceThumbSpec[] {
  const base = neutralRecipeV3(catalog);
  return [
    ...catalog.styles.map(presetSpecV3),
    ...catalog.materials.map((entry): AppearanceThumbSpec => {
      const value: AppearanceMaterialV4 = structuredClone(entry.defaultValue);
      return {
        kind: "material" as const,
        id: entry.family,
        target: APPEARANCE_THUMB_TARGET_V3,
        recipe: {
          ...base,
          material: { mode: "fixed", value },
          // Each family renders in its natural form so a crystal-cut family
          // never shows up wearing an incompatible standard die.
          form: {
            ...base.form,
            polyhedral: {
              mode: "fixed" as const,
              value: materialDefaultPolyhedralFormV4(
                value.family,
                APPEARANCE_THUMB_TARGET_V3,
                rendererRevision,
              ),
            },
          },
        },
      };
    }),
    ...catalog.fonts.map(({ id }): AppearanceThumbSpec => ({
      kind: "font" as const,
      id,
      target: APPEARANCE_THUMB_TARGET_V3,
      recipe: { ...base, font: { mode: "fixed", value: id } },
    })),
    ...catalog.engravingFinishes.map(({ id }): AppearanceThumbSpec => ({
      kind: "ink" as const,
      id,
      target: APPEARANCE_THUMB_TARGET_V3,
      recipe: { ...base, engraving: { mode: "fixed", value: id } },
    })),
  ];
}

export function appearanceThumbObjectKeyV3(
  parts: AppearanceThumbVersionParts,
  spec: Pick<AppearanceThumbSpec, "kind" | "id">,
): string {
  return `thumbs/${parts.catalogVersion}-${parts.rendererRevision}/${spec.kind}/${spec.id}.png`;
}

export function appearanceThumbPreviewRequestV3(
  spec: AppearanceThumbSpec,
  diceView: DiceViewPreferencesV4 = createDefaultDiceViewPreferencesV4(),
): AppearancePreviewRequestV4 {
  return {
    target: spec.target,
    recipe: structuredClone(spec.recipe),
    seed: APPEARANCE_THUMB_SEED_V3,
    state: "normal",
    diceView,
  };
}
