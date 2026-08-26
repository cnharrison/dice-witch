import { describe, expect, it } from "vitest";
import {
  APPEARANCE_CATALOG_V3,
  APPEARANCE_THUMB_CACHE_REVISION_V3,
  appearanceThumbObjectKeyV3,
  appearanceThumbPreviewRequestV3,
  APPEARANCE_THUMB_SEED_V3,
  appearanceThumbnailManifestV3,
  R32_MATERIAL_PALETTES_V3,
  parseAppearancePreviewRequestV4,
} from "../../packages/dice-appearance/src";

const RENDERER_REVISION = "canvaskit-v4-r41" as const;

describe("appearanceThumbnailManifestV3", () => {
  const manifest = appearanceThumbnailManifestV3(
    APPEARANCE_CATALOG_V3,
    RENDERER_REVISION,
  );
  const byKind = (kind: string) =>
    manifest.filter((spec) => spec.kind === kind);

  it("derives one preset tile per builtin style", () => {
    expect(byKind("preset").map(({ id }) => id)).toEqual(
      APPEARANCE_CATALOG_V3.styles.map(({ id }) => id),
    );
  });

  it("derives one material tile per family using family defaults", () => {
    const materials = byKind("material");
    expect(materials.map(({ id }) => id)).toEqual(
      APPEARANCE_CATALOG_V3.materials.map(({ family }) => family),
    );
    for (const spec of materials) {
      expect(spec.recipe.material).toMatchObject({
        mode: "fixed",
        value: { family: spec.id },
      });
    }
  });

  it("derives one font tile per catalog font as a fixed selection", () => {
    const fonts = byKind("font");
    expect(fonts.map(({ id }) => id)).toEqual(
      APPEARANCE_CATALOG_V3.fonts.map(({ id }) => id),
    );
    for (const spec of fonts) {
      expect(spec.recipe.font).toEqual({ mode: "fixed", value: spec.id });
    }
  });

  it("derives one ink tile per engraving finish as a fixed selection", () => {
    const inks = byKind("ink");
    expect(inks.map(({ id }) => id)).toEqual(
      APPEARANCE_CATALOG_V3.engravingFinishes.map(({ id }) => id),
    );
    for (const spec of inks) {
      expect(spec.recipe.engraving).toEqual({
        mode: "fixed",
        value: spec.id,
      });
    }
  });

  it("produces unique specs with deterministic order", () => {
    const keys = manifest.map(({ kind, id }) => `${kind}/${id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(manifest).toEqual(
      appearanceThumbnailManifestV3(APPEARANCE_CATALOG_V3, RENDERER_REVISION),
    );
  });

  it("every tile produces a valid preview request", () => {
    for (const spec of manifest) {
      expect(() =>
        parseAppearancePreviewRequestV4(appearanceThumbPreviewRequestV3(spec)),
      ).not.toThrow();
    }
  });

  it("bakes Lava with its canonical crust-first palette", () => {
    const lava = manifest.find(
      ({ kind, id }) => kind === "preset" && id === "elemental-lava-r33",
    );
    if (lava === undefined) throw new Error("Lava thumbnail spec is missing");

    expect(lava.recipe.colors).toEqual({
      mode: "palette",
      colors: [...R32_MATERIAL_PALETTES_V3["elemental-lava"]],
    });
    expect(lava.recipe.material).toMatchObject({
      mode: "fixed",
      value: { family: "elemental", style: "lava" },
    });
    expect(APPEARANCE_THUMB_CACHE_REVISION_V3).toBe(5);
  });
});

describe("appearanceThumbObjectKeyV3", () => {
  it("keys objects by catalog version and renderer revision", () => {
    expect(
      appearanceThumbObjectKeyV3(
        { catalogVersion: APPEARANCE_CATALOG_V3.version, rendererRevision: RENDERER_REVISION },
        { kind: "material", id: "glass" },
      ),
    ).toBe(`thumbs/${APPEARANCE_CATALOG_V3.version}-${RENDERER_REVISION}/material/glass.png`);
  });
});

describe("appearanceThumbPreviewRequestV3", () => {
  it("uses the fixed thumb seed and normal state by default", () => {
    const manifest = appearanceThumbnailManifestV3(
      APPEARANCE_CATALOG_V3,
      RENDERER_REVISION,
    );
    const [spec] = manifest;
    if (!spec) throw new Error("Thumbnail manifest must not be empty");
    const request = appearanceThumbPreviewRequestV3(spec);
    expect(request.seed).toBe(APPEARANCE_THUMB_SEED_V3);
    expect(request.state).toBe("normal");
  });
});
