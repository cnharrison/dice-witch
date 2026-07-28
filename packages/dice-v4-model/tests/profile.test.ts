import { describe, expect, it } from "vitest";
import {
  APPEARANCE_TARGETS_V4,
  ENGRAVING_FINISHES_V4,
  FONT_IDS_V4,
  GRADIENT_SCOPES_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_MODES_V4,
  LIGHTING_STRENGTHS_V4,
  LINEAR_DIRECTIONS_V4,
  MAX_MATERIAL_SELECTION_OPTIONS_V3,
  POLYHEDRAL_FORMS_V4,
  parseAppearanceProfileV3,
  parseAppearanceRecipeV3,
  parseGuildAppearanceProfileV3,
  type AppearanceMaterialV4,
  type AppearanceProfileV3,
  type AppearanceRecipeV3,
} from "../src";

const catalog = {
  builtinStyleIds: ["chaotic", "dice-witch", "pride"],
} as const;

function recipe(): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "wild",
    varyBy: "die",
    colors: { mode: "palette", colors: ["#123456", "#abcdef"] },
    material: {
      mode: "fixed",
      value: {
        family: "classic",
        treatment: "pattern",
        patternId: "checkerboard",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
    },
    form: {
      polyhedral: { mode: "fixed", value: "standard" },
      other: "sphere",
    },
    font: { mode: "fixed", value: "liberation-sans" },
    engraving: { mode: "fixed", value: "matte-ink" },
    gradient: {
      scope: { mode: "fixed", value: "die-wide" },
      direction: { mode: "fixed", value: "upper-left-to-lower-right" },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

function profile(): AppearanceProfileV3 {
  return {
    version: 3,
    designs: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "  Test design  ",
        recipe: recipe(),
      },
    ],
    assignments: {
      all: {
        source: "custom",
        id: "00000000-0000-4000-8000-000000000001",
      },
      overrides: {
        d20: { source: "builtin", id: "chaotic" },
      },
    },
  };
}

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

function firstDesign(value: AppearanceProfileV3) {
  const design = value.designs[0];
  if (design === undefined) throw new Error("Test design is missing");
  return design;
}

function fixedMaterial(value: AppearanceRecipeV3): AppearanceMaterialV4 {
  if (value.material.mode !== "fixed") {
    throw new Error("Test material selection is not fixed");
  }
  return value.material.value;
}

describe("Appearance Profile V3", () => {
  it("canonicalizes personal and guild profiles", () => {
    const value = profile();
    firstDesign(value).recipe.colors = {
      mode: "palette",
      colors: ["#ABCDEF", "#123456", "#ABCDEF"],
    };
    const parsed = parseAppearanceProfileV3(value, catalog);
    expect(parsed.designs[0]?.name).toBe("Test design");
    expect(parsed.designs[0]?.recipe.colors).toEqual({
      mode: "palette",
      colors: ["#abcdef", "#123456", "#abcdef"],
    });
    expect(parsed.assignments).toEqual(value.assignments);

    expect(
      parseGuildAppearanceProfileV3(
        { ...value, mode: "enforced" },
        catalog,
      ),
    ).toMatchObject({ version: 3, mode: "enforced" });
  });

  it("accepts fixed, allowlist, and weighted selections with bounded weights", () => {
    const value = recipe();
    const baseMaterial = fixedMaterial(value);
    value.material = {
      mode: "weighted",
      options: [
        { value: baseMaterial, weight: 900 },
        {
          value: {
            family: "gemstone",
            stone: "obsidian",
            veinDensity: 35,
            finish: "polished",
            textureScale: 125,
          },
          weight: 100,
        },
      ],
    };
    value.form.polyhedral = {
      mode: "allowlist",
      values: ["standard", "crystal-cut"],
    };
    value.font = {
      mode: "weighted",
      options: [
        { value: "liberation-sans", weight: 700 },
        { value: "new-rocker", weight: 300 },
      ],
    };
    value.engraving = {
      mode: "allowlist",
      values: ["matte-ink", "metallic"],
    };
    expect(parseAppearanceRecipeV3(value)).toEqual(value);

    const duplicate = clone(value);
    duplicate.form.polyhedral = {
      mode: "allowlist",
      values: ["standard", "standard"],
    };
    expect(() => parseAppearanceRecipeV3(duplicate)).toThrow(
      "Appearance form values must be distinct",
    );

    const badWeight = clone(value);
    if (badWeight.font.mode !== "weighted") {
      throw new Error("Test font selection is not weighted");
    }
    const firstFontOption = badWeight.font.options[0];
    if (firstFontOption === undefined) throw new Error("Test font is missing");
    firstFontOption.weight = 0;
    expect(() => parseAppearanceRecipeV3(badWeight)).toThrow(
      "Appearance selection weight must be from 1 through 1000",
    );

    const excessiveTotal = clone(value);
    excessiveTotal.material = {
      mode: "weighted",
      options: Array.from({ length: 11 }, (_, index) => ({
        value: { ...baseMaterial, textureScale: 100 + index },
        weight: 1_000,
      })),
    };
    expect(() => parseAppearanceRecipeV3(excessiveTotal)).toThrow(
      "Appearance selection weights must total at most 10000",
    );
  });

  it("accepts only explicit additive randomization and form policies", () => {
    for (const randomization of [
      "full-spectrum-v1",
      "full-spectrum-v2",
    ] as const) {
      const randomized = { ...recipe(), randomization };
      expect(parseAppearanceRecipeV3(randomized)).toEqual(randomized);
    }
    expect(() =>
      parseAppearanceRecipeV3({
        ...recipe(),
        randomization: "unversioned-random",
      }),
    ).toThrow("Appearance randomization policy is not supported");
    expect(() =>
      parseAppearanceRecipeV3({
        ...recipe(),
        randomization: undefined,
      }),
    ).toThrow("Appearance randomization policy is not supported");

    const automaticForms = recipe();
    Object.assign(automaticForms.form, { policy: "material-default-v1" });
    expect(parseAppearanceRecipeV3(automaticForms)).toEqual(automaticForms);
    expect(() =>
      parseAppearanceRecipeV3({
        ...recipe(),
        form: { ...recipe().form, policy: "unversioned-automatic" },
      }),
    ).toThrow("Appearance form policy is not supported");
  });

  it("rejects malformed colors, materials, and treatment fields", () => {
    for (const colors of [
      { mode: "palette", colors: ["#123456", "#123456"] },
      { mode: "palette", colors: ["red", "#123456"] },
      { mode: "vivid-random-pair", primary: "#123456" },
    ]) {
      expect(() =>
        parseAppearanceRecipeV3({ ...recipe(), colors }),
      ).toThrow("Appearance colors are invalid");
    }

    const badMaterial = recipe();
    badMaterial.material = {
      mode: "fixed",
      value: { ...fixedMaterial(badMaterial), textureScale: 401 },
    };
    expect(() => parseAppearanceRecipeV3(badMaterial)).toThrow(
      "Appearance recipe material.textureScale must be from 25 through 400",
    );

    expect(() =>
      parseAppearanceRecipeV3({ ...recipe(), extra: true }),
    ).toThrow("Appearance recipe V3 has invalid fields");
    expect(() =>
      parseAppearanceRecipeV3({ ...recipe(), version: 2 }),
    ).toThrow("Appearance recipe version must be 3");
    expect(() =>
      parseAppearanceRecipeV3({
        ...recipe(),
        form: { ...recipe().form, other: "standard" },
      }),
    ).toThrow("Appearance Other form must be sphere");

    const incompatibleForm = recipe();
    incompatibleForm.form.polyhedral = {
      mode: "fixed",
      value: "crystal-cut",
    };
    expect(() => parseAppearanceRecipeV3(incompatibleForm)).toThrow(
      "Appearance material selection has no compatible polyhedral form",
    );

    const repeatedSharp = recipe();
    repeatedSharp.material = {
      mode: "fixed",
      value: {
        family: "classic",
        treatment: "gradient",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
    };
    repeatedSharp.form.polyhedral = { mode: "fixed", value: "sharp" };
    repeatedSharp.gradient.scope = { mode: "fixed", value: "repeated" };
    expect(() => parseAppearanceRecipeV3(repeatedSharp)).toThrow(
      "Appearance repeated gradient requires standard polyhedral form",
    );

    const incompatibleHollow = recipe();
    incompatibleHollow.material = {
      mode: "fixed",
      value: {
        family: "hollow-metal",
        construction: "filigree",
        metal: "silver",
        finish: "polished",
        openness: 60,
        textureScale: 100,
      },
    };
    expect(() => parseAppearanceRecipeV3(incompatibleHollow)).toThrow(
      "Appearance material selection has no compatible polyhedral form",
    );
  });

  it("enforces design ownership, catalog ids, targets, names, and limits", () => {
    const missingDesign = profile();
    missingDesign.assignments.all = {
      source: "custom",
      id: "00000000-0000-4000-8000-000000000099",
    };
    expect(() => parseAppearanceProfileV3(missingDesign, catalog)).toThrow(
      "Appearance custom design reference is missing",
    );

    const missingBuiltin = profile();
    missingBuiltin.assignments.overrides.d20 = {
      source: "builtin",
      id: "missing",
    };
    expect(() => parseAppearanceProfileV3(missingBuiltin, catalog)).toThrow(
      "Appearance built-in style id is not supported",
    );

    const badTargetBase = profile();
    const badTarget = {
      ...badTargetBase,
      assignments: {
        ...badTargetBase.assignments,
        overrides: {
          ...badTargetBase.assignments.overrides,
          d1000: { source: "builtin", id: "chaotic" },
        },
      },
    };
    expect(() => parseAppearanceProfileV3(badTarget, catalog)).toThrow(
      "Appearance override target is not supported",
    );

    for (const name of [" ", "Invalid\u0000name"]) {
      const badName = profile();
      firstDesign(badName).name = name;
      expect(() => parseAppearanceProfileV3(badName, catalog)).toThrow(
        "Appearance design name is invalid",
      );
    }

    const tooMany = profile();
    tooMany.designs = Array.from({ length: 11 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `Design ${String(index + 1)}`,
      recipe: recipe(),
    }));
    tooMany.assignments = { all: null, overrides: {} };
    expect(() => parseAppearanceProfileV3(tooMany, catalog)).toThrow(
      "Appearance profile must contain at most ten designs",
    );
  });

  it("rejects custom special forms on targets without authored geometry", () => {
    const assignedToAll = profile();
    firstDesign(assignedToAll).recipe.form.polyhedral = {
      mode: "fixed",
      value: "sharp",
    };
    expect(() => parseAppearanceProfileV3(assignedToAll, catalog)).toThrow(
      "Appearance custom design form is not implemented for d4",
    );

    assignedToAll.assignments = {
      all: null,
      overrides: {
        d20: {
          source: "custom",
          id: firstDesign(assignedToAll).id,
        },
      },
    };
    expect(() => parseAppearanceProfileV3(assignedToAll, catalog)).not.toThrow();

    assignedToAll.assignments.overrides = {
      other: {
        source: "custom",
        id: firstDesign(assignedToAll).id,
      },
    };
    expect(() => parseAppearanceProfileV3(assignedToAll, catalog)).not.toThrow();
  });

  it("keeps the maximum ten-design profile within the D1 limit", () => {
    const weighted = <Value>(values: readonly Value[], weight = 1) => ({
      mode: "weighted" as const,
      options: values.map((value) => ({ value, weight })),
    });
    const maximalRecipe = {
      ...recipe(),
      variation: "curated" as const,
      varyBy: "group" as const,
      colors: {
        mode: "palette" as const,
        colors: [
          "#000000",
          "#333333",
          "#666666",
          "#999999",
          "#cccccc",
          "#ffffff",
        ],
      },
      material: weighted(
        Array.from(
          { length: MAX_MATERIAL_SELECTION_OPTIONS_V3 },
          (_, inclusionDensity) =>
            inclusionDensity === MAX_MATERIAL_SELECTION_OPTIONS_V3 - 1
              ? ({
                  family: "hollow-metal",
                  construction: "filigree",
                  metal: "silver",
                  finish: "enamel-inlaid",
                  openness: 100,
                  textureScale: 400,
                } as const)
              : ({
                  family: "sharp-resin",
                  style: "layered",
                  inclusion: "botanical",
                  clarity: 100,
                  inclusionDensity,
                  finish: "polished",
                  textureScale: 400,
                } as const),
        ),
      ),
      form: {
        polyhedral: weighted(POLYHEDRAL_FORMS_V4, 1_000),
        other: "sphere" as const,
      },
      font: weighted(FONT_IDS_V4, 1_000),
      engraving: weighted(ENGRAVING_FINISHES_V4, 1_000),
      gradient: {
        scope: weighted(GRADIENT_SCOPES_V4, 1_000),
        direction: weighted(LINEAR_DIRECTIONS_V4, 1_000),
      },
      lighting: {
        mode: weighted(LIGHTING_MODES_V4, 1_000),
        strength: weighted(LIGHTING_STRENGTHS_V4, 1_000),
        direction: weighted(LIGHTING_DIRECTIONS_V4, 1_000),
      },
    };
    const builtinId = "a".repeat(64);
    const reference = { source: "builtin" as const, id: builtinId };
    const maximalProfile = {
      version: 3,
      designs: Array.from({ length: 10 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name: "\\".repeat(50),
        recipe: maximalRecipe,
      })),
      assignments: {
        all: reference,
        overrides: Object.fromEntries(
          APPEARANCE_TARGETS_V4.map((target) => [target, reference]),
        ),
      },
    };
    const sizeCatalog = { builtinStyleIds: [builtinId] };
    const parsed = parseAppearanceProfileV3(maximalProfile, sizeCatalog);
    const size = JSON.stringify(parsed).length;
    expect(size).toBeGreaterThan(63_000);
    expect(size).toBeLessThanOrEqual(65_536);
    const guild = parseGuildAppearanceProfileV3(
      { ...maximalProfile, mode: "enforced" },
      sizeCatalog,
    );
    expect(JSON.stringify(guild).length).toBeLessThanOrEqual(65_536);
  });

  it("rejects older profile versions, extra fields, and invalid guild modes", () => {
    expect(() =>
      parseAppearanceProfileV3({ ...profile(), version: 2 }, catalog),
    ).toThrow("Appearance profile version must be 3");
    expect(() =>
      parseAppearanceProfileV3({ ...profile(), extra: true }, catalog),
    ).toThrow("Appearance profile V3 has invalid fields");
    expect(() =>
      parseGuildAppearanceProfileV3(
        { ...profile(), mode: "sometimes" },
        catalog,
      ),
    ).toThrow("Guild appearance mode is invalid");
  });
});
