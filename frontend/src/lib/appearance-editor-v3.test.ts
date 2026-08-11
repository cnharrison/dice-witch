import type {
  AppearanceProfileV3,
  AppearanceRecipeV3,
  GuildAppearanceProfileV3,
} from "@dice-witch/dice-v4-model";
import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import { describe, expect, it } from "vitest";
import {
  applyAppearanceReferenceV3,
  assertAppearanceRecipeSupportsTargetV3,
  beginAppearanceRecipeEditV3,
  clearAppearanceTargetOverrideV3,
  compatibleMaterialFamiliesV3,
  compatibleRenderFormsV3,
  createDefaultAppearanceMaterialV3,
  createEmptyAppearanceProfileV3,
  createVividAppearancePaletteV3,
  deleteAppearanceDesignV3,
  materialSelectionValuesV3,
  nextPresetEditNameV3,
  withAutomaticMaterialFormsV3,
  resolveAppearanceEditorSelectionV3,
  setGuildAppearanceModeV3,
  updateAppearanceDesignV3,
  upsertAppearanceDesignV3,
} from "./appearance-editor-v3";

const designId = "6aab98d5-c3f9-40e4-8df8-92cb2871466d";

function styleRecipe(styleId: string): AppearanceRecipeV3 {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return structuredClone(style.recipe);
}

function personalProfile(): AppearanceProfileV3 {
  return {
    version: 3,
    designs: [],
    assignments: {
      all: { source: "builtin", id: "chaotic" },
      overrides: { d20: { source: "builtin", id: "hex-appeal" } },
    },
  };
}

describe("appearance editor V3 draft operations", () => {
  it("numbers preset-derived edits without changing existing names", () => {
    const designs = [
      { id: designId, name: "Edit 1", recipe: styleRecipe("pride") },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "My resin",
        recipe: styleRecipe("pride"),
      },
    ];

    expect(nextPresetEditNameV3(designs)).toBe("Edit 2");
    expect(designs.map(({ name }) => name)).toEqual([
      "Edit 1",
      "My resin",
    ]);
  });

  it("creates distinct vivid palettes with the requested color count", () => {
    const palette = createVividAppearancePaletteV3(
      4,
      new Uint32Array([0, 1, 2, 3, 4]),
    );

    expect(palette).toHaveLength(4);
    expect(new Set(palette)).toHaveLength(4);
    expect(palette.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
    expect(() =>
      createVividAppearancePaletteV3(1, new Uint32Array([0, 1])),
    ).toThrow("Vivid palette must contain from two through six colors");
  });

  it("creates every material family from catalog-owned editor defaults", () => {
    for (const metadata of APPEARANCE_CATALOG_V3.materials) {
      const material = createDefaultAppearanceMaterialV3(
        metadata.family,
        APPEARANCE_CATALOG_V3,
      );
      expect(material).toEqual(metadata.defaultValue);
      expect(material).not.toBe(metadata.defaultValue);
    }
  });

  it("resolves built-in target overrides and detaches the first edit", () => {
    const profile = personalProfile();
    const selection = resolveAppearanceEditorSelectionV3(
      profile,
      "d20",
      APPEARANCE_CATALOG_V3,
    );
    expect(selection.styleId).toBe("hex-appeal");
    expect(selection.recipe.form.polyhedral).toEqual({
      mode: "fixed",
      value: "crystal-cut",
    });

    const next = structuredClone(selection.recipe);
    next.colors = { mode: "tonal", primary: "#123456" };
    const edited = beginAppearanceRecipeEditV3(selection.recipe, next, true);
    expect(edited.variation).toBe("fixed");
    expect(edited.lighting.strength).toEqual({
      mode: "fixed",
      value: "gentle",
    });
    expect(edited.colors).toEqual({ mode: "tonal", primary: "#123456" });
    expect(edited.form.policy).toBe("material-default-v1");
    expect(selection.recipe.colors).not.toEqual(edited.colors);

    const explicitLighting = {
      ...selection.recipe,
      lighting: {
        ...selection.recipe.lighting,
        strength: { mode: "fixed" as const, value: "strong" as const },
      },
    };
    expect(
      beginAppearanceRecipeEditV3(
        selection.recipe,
        explicitLighting,
        true,
      ).lighting.strength,
    ).toEqual({ mode: "fixed", value: "strong" });

    const custom = beginAppearanceRecipeEditV3(edited, {
      ...edited,
      lighting: {
        ...edited.lighting,
        strength: { mode: "fixed", value: "strong" },
      },
    }, false);
    expect(custom.lighting.strength).toEqual({
      mode: "fixed",
      value: "strong",
    });

    const random = styleRecipe("chaotic");
    expect(random.randomization).toBe("full-spectrum-v2");
    const editedRandom = beginAppearanceRecipeEditV3(
      random,
      {
        ...random,
        colors: {
          mode: "palette",
          colors: ["#123456", "#abcdef"],
        },
      },
      true,
    );
    expect(editedRandom.randomization).toBeUndefined();
    expect(editedRandom.colors).toEqual({
      mode: "palette",
      colors: ["#123456", "#abcdef"],
    });
  });

  it("makes material-driven forms automatic without rewriting the stored manual selection", () => {
    const recipe = styleRecipe("glass-cannon");
    const automatic = withAutomaticMaterialFormsV3(recipe);

    expect(automatic.form.policy).toBe("material-default-v1");
    expect(automatic.form.polyhedral).toEqual(recipe.form.polyhedral);
    expect(recipe.form.policy).toBeUndefined();
    expect(() => assertAppearanceRecipeSupportsTargetV3(automatic, "all"))
      .not.toThrow();
  });

  it("preserves All dice and target override assignment semantics", () => {
    const profile = personalProfile();
    const d20 = applyAppearanceReferenceV3(
      profile,
      "d20",
      { source: "builtin", id: "pride" },
      APPEARANCE_CATALOG_V3,
    );
    expect(d20.assignments).toEqual({
      all: { source: "builtin", id: "chaotic" },
      overrides: { d20: { source: "builtin", id: "pride" } },
    });
    expect(profile.assignments.overrides.d20?.id).toBe("hex-appeal");

    const inherited = clearAppearanceTargetOverrideV3(
      d20,
      "d20",
      APPEARANCE_CATALOG_V3,
    );
    expect(inherited.assignments.overrides).toEqual({});

    const all = applyAppearanceReferenceV3(
      profile,
      "all",
      { source: "builtin", id: "dice-witch" },
      APPEARANCE_CATALOG_V3,
    );
    expect(all.assignments).toEqual({
      all: { source: "builtin", id: "dice-witch" },
      overrides: { d20: { source: "builtin", id: "hex-appeal" } },
    });
  });

  it("upserts detached custom designs without changing weighted semantics", () => {
    const recipe = styleRecipe("chaotic");
    const profile = upsertAppearanceDesignV3(
      createEmptyAppearanceProfileV3("personal"),
      "all",
      { id: designId, name: "Wild garden", recipe },
      APPEARANCE_CATALOG_V3,
    );
    expect(profile.designs).toEqual([{ id: designId, name: "Wild garden", recipe }]);
    expect(profile.designs[0]?.recipe).not.toBe(recipe);
    expect(profile.designs[0]?.recipe.material).toEqual(recipe.material);
    expect(profile.assignments).toEqual({
      all: { source: "custom", id: designId },
      overrides: {},
    });

    const renamed = upsertAppearanceDesignV3(
      profile,
      "d20",
      { id: designId, name: "Wild garden II", recipe },
      APPEARANCE_CATALOG_V3,
    );
    expect(renamed.designs).toHaveLength(1);
    expect(renamed.designs[0]?.name).toBe("Wild garden II");
    expect(renamed.assignments.overrides.d20).toEqual({
      source: "custom",
      id: designId,
    });
  });

  it("updates a shared design without changing its target assignments", () => {
    const recipe = styleRecipe("pride");
    const assigned = upsertAppearanceDesignV3(
      personalProfile(),
      "all",
      { id: designId, name: "Shared", recipe },
      APPEARANCE_CATALOG_V3,
    );
    const nextRecipe = structuredClone(recipe);
    nextRecipe.colors = { mode: "tonal", primary: "#123456" };

    const updated = updateAppearanceDesignV3(
      assigned,
      { id: designId, name: "Shared", recipe: nextRecipe },
      APPEARANCE_CATALOG_V3,
    );

    expect(updated.assignments).toEqual(assigned.assignments);
    expect(updated.designs[0]?.id).toBe(designId);
    expect(updated.designs[0]?.recipe.colors).toEqual({
      mode: "tonal",
      primary: "#123456",
    });
    expect(assigned.designs[0]?.recipe.colors).toEqual(recipe.colors);
  });

  it("rejects design and material-option limits without mutating drafts", () => {
    const recipe = styleRecipe("pride");
    const designs = Array.from({ length: 10 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
      name: `Design ${index + 1}`,
      recipe,
    }));
    const full: AppearanceProfileV3 = {
      version: 3,
      designs,
      assignments: { all: null, overrides: {} },
    };
    expect(() =>
      upsertAppearanceDesignV3(
        full,
        "all",
        { id: designId, name: "Eleventh", recipe },
        APPEARANCE_CATALOG_V3,
      ),
    ).toThrow("Appearance profile must contain at most ten designs");
    expect(full.designs).toHaveLength(10);

    const excessiveMaterials = structuredClone(recipe);
    const material = materialSelectionValuesV3(excessiveMaterials)[0];
    if (material === undefined) throw new Error("Material fixture is missing");
    excessiveMaterials.material = {
      mode: "weighted",
      options: Array.from({ length: 26 }, () => ({
        value: structuredClone(material),
        weight: 1,
      })),
    };
    expect(() =>
      upsertAppearanceDesignV3(
        createEmptyAppearanceProfileV3("personal"),
        "all",
        { id: designId, name: "Too many materials", recipe: excessiveMaterials },
        APPEARANCE_CATALOG_V3,
      ),
    ).toThrow("Appearance recipe material selection is invalid");
  });

  it("deletes assigned designs explicitly and preserves guild modes", () => {
    const guild = upsertAppearanceDesignV3(
      createEmptyAppearanceProfileV3("guild"),
      "all",
      {
        id: designId,
        name: "Server glass",
        recipe: styleRecipe("glass-cannon"),
      },
      APPEARANCE_CATALOG_V3,
    ) as GuildAppearanceProfileV3;
    const enforced = setGuildAppearanceModeV3(
      guild,
      "enforced",
      APPEARANCE_CATALOG_V3,
    );
    expect(enforced.mode).toBe("enforced");

    const deleted = deleteAppearanceDesignV3(
      enforced,
      designId,
      APPEARANCE_CATALOG_V3,
    );
    expect(deleted.designs).toEqual([]);
    expect(deleted.assignments).toEqual({ all: null, overrides: {} });
    expect((deleted as GuildAppearanceProfileV3).mode).toBe("enforced");
  });

  it("filters material and form controls without substituting invalid choices", () => {
    const glass = styleRecipe("glass-cannon");
    expect(
      compatibleRenderFormsV3(
        glass,
        "d20",
        APPEARANCE_CATALOG_V3,
      ).map(({ id }) => id),
    ).toEqual(["standard", "sharp", "crystal-cut"]);
    expect(
      compatibleRenderFormsV3(
        glass,
        "d6",
        APPEARANCE_CATALOG_V3,
      ).map(({ id }) => id),
    ).toEqual(["standard", "crystal-cut"]);
    const crystalGlass = structuredClone(glass);
    crystalGlass.form.polyhedral = {
      mode: "fixed",
      value: "crystal-cut",
    };
    expect(
      compatibleMaterialFamiliesV3(
        crystalGlass,
        "d20",
        APPEARANCE_CATALOG_V3,
      ).map(({ family }) => family),
    ).toEqual(["sharp-resin", "gemstone", "glass", "fantasy"]);

    expect(() =>
      assertAppearanceRecipeSupportsTargetV3(crystalGlass, "d6"),
    ).not.toThrow();
    const unsupported = structuredClone(glass);
    unsupported.form.polyhedral = { mode: "fixed", value: "sharp" };
    expect(() => assertAppearanceRecipeSupportsTargetV3(unsupported, "d6"))
      .toThrow("Appearance form sharp is not implemented for d6");
    expect(unsupported.form.polyhedral).toEqual({
      mode: "fixed",
      value: "sharp",
    });

    const repeated = styleRecipe("pride");
    repeated.material = {
      mode: "fixed",
      value: {
        family: "classic",
        treatment: "gradient",
        opacity: "opaque",
        finish: "matte",
        textureScale: 100,
      },
    };
    repeated.form.polyhedral = { mode: "fixed", value: "standard" };
    repeated.gradient.scope = { mode: "fixed", value: "repeated" };
    expect(
      compatibleRenderFormsV3(
        repeated,
        "d20",
        APPEARANCE_CATALOG_V3,
      ).map(({ id }) => id),
    ).toEqual(["standard"]);
    expect(
      compatibleMaterialFamiliesV3(
        repeated,
        "d20",
        APPEARANCE_CATALOG_V3,
      ).map(({ family }) => family),
    ).toEqual(["classic"]);
  });
});
