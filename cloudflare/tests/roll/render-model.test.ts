import {
  validateRenderRequestV4,
  type AppearanceRecipeV3,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_TARGETS,
  migrateAppearanceRecipeV1,
  type AppearanceRecipeV1,
  type AppearanceRecipeV2,
  type AppearanceTarget,
} from "../../packages/dice-appearance/src";
import { validateRenderRequest } from "../../packages/dice-svg/src/validate";
import { validateRenderRequestV2 } from "../../packages/dice-svg/src/validateV2";
import { validateRenderRequestV3 } from "../../packages/dice-svg/src/validateV3";
import {
  buildRollRenderRequest,
  buildRollRenderRequestV2,
  buildRollRenderRequestV3,
  buildRollRenderRequestV4,
  type EffectiveAppearanceRecipes,
  type EffectiveAppearanceRecipesV2,
  type EffectiveAppearanceRecipesV3,
} from "../../packages/roll-render-model/src";
import {
  executeRoll,
  type RollExecutionResult,
} from "../../packages/roll-domain/src";

function outcome(notation: string[], seed = 0) {
  return executeRoll({ notation, seed });
}

function appearanceRecipe(
  overrides: Partial<AppearanceRecipeV1> = {},
): AppearanceRecipeV1 {
  return {
    version: 1,
    variation: "curated",
    varyBy: "die",
    colors: {
      mode: "palette",
      colors: ["#5426a8", "#c93ee8", "#f2d95c"],
    },
    fill: {
      mode: "allowlist",
      values: [
        { type: "gradient" },
        { type: "pattern", patternId: "honeycomb" },
      ],
    },
    font: {
      mode: "allowlist",
      fontIds: ["liberation-sans", "new-rocker"],
    },
    ...overrides,
  };
}

function effectiveRecipes(
  recipe: AppearanceRecipeV1 = appearanceRecipe(),
): EffectiveAppearanceRecipes {
  return Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, recipe]),
  );
}

function appearanceRecipeV2(
  overrides: Partial<AppearanceRecipeV2> = {},
): AppearanceRecipeV2 {
  return {
    version: 2,
    compatibility: "native-v2",
    variation: "fixed",
    varyBy: "die",
    colors: {
      mode: "palette",
      colors: ["#5426a8", "#c93ee8", "#f2d95c"],
    },
    fill: { mode: "fixed", value: { type: "gradient" } },
    font: { mode: "fixed", fontId: "liberation-sans" },
    gradient: {
      colorSource: "full-palette",
      scope: { mode: "fixed", value: "die-wide" },
      direction: {
        mode: "fixed",
        value: "upper-left-to-lower-right",
      },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
    ...overrides,
  };
}

function effectiveRecipesV2(
  recipe: AppearanceRecipeV2 = appearanceRecipeV2(),
): EffectiveAppearanceRecipesV2 {
  return Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, recipe]),
  );
}

function appearanceRecipeV3(
  overrides: Partial<AppearanceRecipeV3> = {},
): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "fixed",
    varyBy: "die",
    colors: {
      mode: "palette",
      colors: ["#5426a8", "#c93ee8", "#f2d95c"],
    },
    material: {
      mode: "fixed",
      value: {
        family: "classic",
        treatment: "gradient",
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
      direction: { mode: "fixed", value: "lower-left-to-upper-right" },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
    ...overrides,
  };
}

function effectiveRecipesV3(
  recipe: AppearanceRecipeV3 = appearanceRecipeV3(),
): EffectiveAppearanceRecipesV3 {
  return Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, recipe]),
  );
}

describe("buildRollRenderRequest", () => {
  it("reproduces every visual choice from the persisted render seed", () => {
    const roll = outcome(["4d6k3", "d%", "4dF"]);

    const first = buildRollRenderRequest(roll, 0x1234_abcd);
    const replay = buildRollRenderRequest(roll, 0x1234_abcd);

    expect(replay).toEqual(first);
    expect(() => validateRenderRequest(first)).not.toThrow();
    expect(first.groups.map((group) => group.length)).toEqual([4, 2, 4]);
  });

  it("changes styling, but not faces or icons, with a different render seed", () => {
    const roll = outcome(["10d6!", "4d20min10"]);
    const first = buildRollRenderRequest(roll, 1);
    const second = buildRollRenderRequest(roll, 2);

    expect(second).not.toEqual(first);
    expect(
      second.groups.map((group) =>
        group.map(({ sides, rolled, icons }) => ({ sides, rolled, icons })),
      ),
    ).toEqual(
      first.groups.map((group) =>
        group.map(({ sides, rolled, icons }) => ({ sides, rolled, icons })),
      ),
    );
  });

  it("maps production modifier names to renderer icons in legacy order", () => {
    const roll = outcome([
      "4d1k2",
      "1d1cs=1",
      "1d1cf=1",
      "10d6!p",
      "4d20min10",
      "4d20max10",
      "10d6=6",
      "8d6u",
    ]);
    const request = buildRollRenderRequest(roll, 1);
    const icons = request.groups.flatMap((group) =>
      group.flatMap((die) => die.icons),
    );

    expect(icons).toContain("trashcan");
    expect(icons).toContain("critical-success");
    expect(icons).toContain("critical-failure");
    expect(icons).toContain("penetrate");
    expect(icons).not.toContain("explosion");
    expect(icons).toContain("chevronUp");
    expect(icons).toContain("chevronDown");
    expect(icons).toContain("target-success");
    expect(icons).toContain("unique");
  });

  it("uses legacy critical colors regardless of the render seed", () => {
    const request = buildRollRenderRequest(
      outcome(["1d1cs=1", "1d1cf=1"]),
      1,
    );

    expect(request.groups[0]?.[0]?.color).toBe("#ffcc00");
    expect(request.groups[1]?.[0]?.color).toBe("#ff3333");
  });

  it("keeps compound Fudge results renderable with legacy blank overflow faces", () => {
    const roll = outcome(["4dF!!"], 2);
    const request = buildRollRenderRequest(roll, 1);

    expect(() => validateRenderRequest(request)).not.toThrow();
  });

  it("rejects a roll result without renderable dice", () => {
    expect(() =>
      buildRollRenderRequest(outcome(["not-dice"]), 1),
    ).toThrow("Roll result has no renderable dice");
  });
});

describe("buildRollRenderRequestV2", () => {
  it("maps every physical die to its appearance target", () => {
    const request = buildRollRenderRequestV2(
      outcome(["d4", "d6", "d8", "d10", "d12", "d20", "d%", "dF", "d7"]),
      0x1234_abcd,
      effectiveRecipes(),
    );

    expect(request.groups.flatMap((group) => group.map(({ target }) => target))).toEqual([
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d20",
      "percentile",
      "d10",
      "fudge",
      "other",
    ]);
    expect(request.groups[6]?.[1]).toMatchObject({ target: "d10" });
    expect(request.groups[8]?.[0]).toMatchObject({ target: "other", sides: 7 });
    expect(() => validateRenderRequestV2(request)).not.toThrow();
  });

  it("preserves a zero on the percentile ones die", () => {
    const roll: RollExecutionResult = {
      version: 1,
      seed: 0,
      outcomes: [
        {
          notation: "d%",
          output: "[100]",
          total: 100,
          dice: [
            { sides: "%", rolled: 0, modifiers: [] },
            { sides: 10, rolled: 0, modifiers: [] },
          ],
        },
      ],
      errors: [],
    };
    const request = buildRollRenderRequestV2(roll, 1, effectiveRecipes());

    expect(request.groups[0]?.map(({ result }) => result)).toEqual([0, 0]);
  });

  it("reproduces a fully resolved snapshot from the same inputs", () => {
    const roll = outcome(["4d6k3", "d%", "4dF"]);
    const recipes = effectiveRecipes();
    const first = buildRollRenderRequestV2(roll, 0x1234_abcd, recipes);
    const replay = buildRollRenderRequestV2(roll, 0x1234_abcd, recipes);

    expect(replay).toEqual(first);
    expect(first.version).toBe(2);
    expect(first.groups.map((group) => group.length)).toEqual([4, 2, 4]);
  });

  it("maps critical modifiers to both icons and outline effects", () => {
    const request = buildRollRenderRequestV2(
      outcome(["1d1cs=1", "1d1cf=1"]),
      1,
      effectiveRecipes(),
    );

    expect(request.groups[0]?.[0]).toMatchObject({
      icons: ["critical-success"],
      appearance: { effect: "critical-success" },
    });
    expect(request.groups[1]?.[0]).toMatchObject({
      icons: ["critical-failure"],
      appearance: { effect: "critical-failure" },
    });
  });

  it("carries contrast resolution into the persisted request", () => {
    const recipe = appearanceRecipe({
      variation: "fixed",
      colors: {
        mode: "palette",
        colors: ["#000000", "#ffffff"],
      },
      fill: {
        mode: "fixed",
        value: { type: "pattern", patternId: "checkerboard" },
      },
    });
    const request = buildRollRenderRequestV2(
      outcome(["d20"]),
      1,
      effectiveRecipes(recipe),
    );

    expect(request.groups[0]?.[0]?.appearance).toMatchObject({
      textColor: "#111111",
      fill: { type: "pattern", pattern: "checkerboard" },
      requiresLocalSeparation: true,
    });
  });

  it("requires an effective recipe for every rendered target", () => {
    const recipes: Partial<Record<AppearanceTarget, AppearanceRecipeV1>> = {
      ...effectiveRecipes(),
    };
    delete recipes.d20;

    expect(() =>
      buildRollRenderRequestV2(
        outcome(["d20"]),
        1,
        recipes as EffectiveAppearanceRecipes,
      ),
    ).toThrow("Effective appearance recipe for d20 is required");
  });

  it("rejects recipe assets unsupported by the renderer", () => {
    const recipe = appearanceRecipe({
      variation: "fixed",
      fill: {
        mode: "fixed",
        value: { type: "pattern", patternId: "unsupported-pattern" },
      },
    });

    expect(() =>
      buildRollRenderRequestV2(
        outcome(["d6"]),
        1,
        effectiveRecipes(recipe),
      ),
    ).toThrow("Resolved appearance pattern is not supported by the renderer");
  });

  it("does not retain live references to mutable recipes", () => {
    const recipe = appearanceRecipe({ variation: "fixed" });
    const request = buildRollRenderRequestV2(
      outcome(["d20"]),
      1,
      effectiveRecipes(recipe),
    );
    const snapshot = structuredClone(request);
    recipe.colors = { mode: "tonal", primary: "#ffffff" };

    expect(request).toEqual(snapshot);
  });
});

describe("buildRollRenderRequestV3", () => {
  it("maps every physical die and validates the immutable V3 snapshot", () => {
    const request = buildRollRenderRequestV3(
      outcome(["d4", "d6", "d8", "d10", "d12", "d20", "d%", "dF", "d7"]),
      0x1234_abcd,
      effectiveRecipesV2(),
    );

    expect(request.version).toBe(3);
    expect(
      request.groups.flatMap((group) =>
        group.map(({ target }) => target),
      ),
    ).toEqual([
      "d4",
      "d6",
      "d8",
      "d10-original",
      "d12",
      "d20",
      "percentile",
      "d10-original",
      "fudge",
      "other",
    ]);
    expect(request.groups[8]?.[0]).toMatchObject({
      target: "other",
      sides: 7,
    });
    expect(validateRenderRequestV3(request)).toEqual(request);
  });

  it("uses readable native pattern assets without rewriting compatibility snapshots", () => {
    const revisions = [
      ["checkerboard", "checkerboard-v2"],
      ["dots", "dots-v2"],
      ["stripes", "stripes-v2"],
      ["triangles", "triangles-v2"],
      ["crosshatch", "crosshatch-v2"],
    ] as const;
    const roll = outcome(["d20"]);

    for (const [patternId, nativePattern] of revisions) {
      const native = buildRollRenderRequestV3(
        roll,
        1,
        effectiveRecipesV2(
          appearanceRecipeV2({
            fill: {
              mode: "fixed",
              value: { type: "pattern", patternId },
            },
          }),
        ),
      );
      const compatibility = buildRollRenderRequestV3(
        roll,
        1,
        effectiveRecipesV2(
          migrateAppearanceRecipeV1(
            appearanceRecipe({
              variation: "fixed",
              fill: {
                mode: "fixed",
                value: { type: "pattern", patternId },
              },
            }),
          ),
        ),
      );

      expect(native.groups[0]?.[0]?.appearance.surface).toMatchObject({
        type: "pattern",
        pattern: nativePattern,
      });
      expect(compatibility.groups[0]?.[0]?.appearance.surface).toMatchObject({
        type: "pattern",
        pattern: patternId,
      });
    }
  });

  it("preserves zero on both percentile dice", () => {
    const roll: RollExecutionResult = {
      version: 1,
      seed: 0,
      outcomes: [
        {
          notation: "d%",
          output: "[100]",
          total: 100,
          dice: [
            { sides: "%", rolled: 0, modifiers: [] },
            { sides: 10, rolled: 0, modifiers: [] },
          ],
        },
      ],
      errors: [],
    };
    const request = buildRollRenderRequestV3(
      roll,
      1,
      effectiveRecipesV2(),
    );

    expect(request.groups[0]?.map(({ result }) => result)).toEqual([0, 0]);
  });

  it("copies every resolved material and lighting discriminant", () => {
    const recipes: EffectiveAppearanceRecipesV2 = {
      ...effectiveRecipesV2(),
      d4: appearanceRecipeV2({
        fill: { mode: "fixed", value: { type: "solid" } },
        lighting: {
          mode: { mode: "fixed", value: "none" },
          strength: { mode: "fixed", value: "subtle" },
          direction: { mode: "fixed", value: "upper-left" },
        },
      }),
      d6: appearanceRecipeV2({
        fill: {
          mode: "fixed",
          value: { type: "pattern", patternId: "checkerboard" },
        },
        lighting: {
          mode: { mode: "fixed", value: "facet" },
          strength: { mode: "fixed", value: "strong" },
          direction: { mode: "fixed", value: "upper-left" },
        },
      }),
      d8: appearanceRecipeV2({
        lighting: {
          mode: { mode: "fixed", value: "directional" },
          strength: { mode: "fixed", value: "subtle" },
          direction: { mode: "fixed", value: "right" },
        },
      }),
    };
    const request = buildRollRenderRequestV3(
      outcome(["d4", "d6", "d8", "d10"]),
      1,
      recipes,
    );

    expect(request.groups[0]?.[0]?.appearance).toMatchObject({
      surface: { type: "solid", color: "#5426a8" },
      lighting: { mode: "none" },
    });
    expect(request.groups[1]?.[0]?.appearance).toMatchObject({
      surface: {
        type: "pattern",
        pattern: "checkerboard-v2",
        primaryColor: "#5426a8",
        secondaryColor: "#c93ee8",
      },
      lighting: { mode: "facet", strength: "strong" },
    });
    expect(request.groups[2]?.[0]?.appearance).toMatchObject({
      surface: {
        type: "gradient",
        colors: ["#5426a8", "#c93ee8", "#f2d95c"],
        scope: "die-wide",
        direction: "upper-left-to-lower-right",
      },
      lighting: {
        mode: "directional",
        strength: "subtle",
        direction: "right",
      },
    });
    expect(request.groups[3]?.[0]?.appearance.lighting).toEqual({
      mode: "combined",
      strength: "subtle",
      direction: "upper-left",
    });
  });

  it("snapshots legacy compatibility recipes without upgrading them", () => {
    const legacy = appearanceRecipe({
      variation: "fixed",
      colors: {
        mode: "palette",
        colors: ["#5426a8", "#c93ee8", "#f2d95c"],
      },
      fill: { mode: "fixed", value: { type: "gradient" } },
      font: { mode: "fixed", fontId: "liberation-sans" },
    });
    const request = buildRollRenderRequestV3(
      outcome(["d20"]),
      1,
      effectiveRecipesV2(migrateAppearanceRecipeV1(legacy)),
    );
    const resolved = request.groups[0]?.[0]?.appearance;

    expect(resolved).toMatchObject({
      surface: {
        type: "gradient",
        colors: ["#5426a8", "#c93ee8"],
        scope: "repeated",
        direction: "top-to-bottom",
      },
      lighting: { mode: "facet", strength: "subtle" },
    });
    expect(resolved).not.toHaveProperty("compatibility");
  });

  it("is deterministic and detaches every mutable recipe value", () => {
    const recipe = appearanceRecipeV2();
    const recipes = effectiveRecipesV2(recipe);
    const roll = outcome(["4d6k3", "d%", "4dF"]);
    const first = buildRollRenderRequestV3(roll, 0x1234_abcd, recipes);
    const replay = buildRollRenderRequestV3(roll, 0x1234_abcd, recipes);
    const snapshot = structuredClone(first);

    expect(replay).toEqual(first);
    if (recipe.colors.mode !== "palette") {
      throw new Error("Palette fixture is missing");
    }
    recipe.colors.colors[0] = "#ffffff";
    recipe.gradient.scope = { mode: "fixed", value: "repeated" };
    recipe.lighting.mode = { mode: "fixed", value: "none" };
    expect(first).toEqual(snapshot);
  });

  it("preserves a valid native random-color collision", () => {
    const initialRecipe = appearanceRecipeV2({
      variation: "curated",
      colors: { mode: "random", primary: "#000000" },
    });
    const initial = buildRollRenderRequestV3(
      outcome(["d20"]),
      0x1234_abcd,
      effectiveRecipesV2(initialRecipe),
    ).groups[0]?.[0]?.appearance.surface;
    if (initial?.type !== "gradient") {
      throw new Error("Gradient fixture is missing");
    }
    const collisionColor = initial.colors[1];
    const collision = buildRollRenderRequestV3(
      outcome(["d20"]),
      0x1234_abcd,
      effectiveRecipesV2(
        appearanceRecipeV2({
          variation: "curated",
          colors: { mode: "random", primary: collisionColor },
        }),
      ),
    ).groups[0]?.[0]?.appearance.surface;

    expect(collision).toMatchObject({
      type: "gradient",
      colors: [collisionColor, collisionColor],
    });
  });

  it("maps critical modifiers to snapshot effects and icons", () => {
    const request = buildRollRenderRequestV3(
      outcome(["1d1cs=1", "1d1cf=1"]),
      1,
      effectiveRecipesV2(),
    );

    expect(request.groups[0]?.[0]).toMatchObject({
      icons: ["critical-success"],
      appearance: { effect: "critical-success" },
    });
    expect(request.groups[1]?.[0]).toMatchObject({
      icons: ["critical-failure"],
      appearance: { effect: "critical-failure" },
    });
  });

  it("fails explicitly for missing or unsupported resolved assets", () => {
    const missing = { ...effectiveRecipesV2() };
    delete missing.d20;
    expect(() =>
      buildRollRenderRequestV3(
        outcome(["d20"]),
        1,
        missing as EffectiveAppearanceRecipesV2,
      ),
    ).toThrow("Effective appearance recipe V2 for d20 is required");

    const unsupportedPattern = appearanceRecipeV2({
      fill: {
        mode: "fixed",
        value: { type: "pattern", patternId: "unsupported-pattern" },
      },
    });
    expect(() =>
      buildRollRenderRequestV3(
        outcome(["d6"]),
        1,
        effectiveRecipesV2(unsupportedPattern),
      ),
    ).toThrow("Resolved appearance pattern is not supported by the renderer");

    const unsupportedFont = appearanceRecipeV2({
      font: { mode: "fixed", fontId: "unsupported-font" },
    });
    expect(() =>
      buildRollRenderRequestV3(
        outcome(["d6"]),
        1,
        effectiveRecipesV2(unsupportedFont),
      ),
    ).toThrow("Resolved appearance font is not supported by the renderer");
  });

  it("rejects an empty roll result and invalid render seed", () => {
    expect(() =>
      buildRollRenderRequestV3(
        outcome(["not-dice"]),
        1,
        effectiveRecipesV2(),
      ),
    ).toThrow("Roll result has no renderable dice");
    expect(() =>
      buildRollRenderRequestV3(
        outcome(["d20"]),
        -1,
        effectiveRecipesV2(),
      ),
    ).toThrow("Render seed must be an unsigned 32-bit integer");
  });
});

describe("buildRollRenderRequestV4", () => {
  it("maps every physical die into a validated renderer-revision snapshot", () => {
    const request = buildRollRenderRequestV4(
      executeRoll({
        notation: ["d4", "d6", "d8", "d10", "d12", "d20", "d%", "dF", "d7"],
        seed: 0,
        stableAppearanceIdentities: true,
      }),
      0x1234_abcd,
      effectiveRecipesV3(
        appearanceRecipeV3({
          variation: "wild",
          colors: { mode: "vivid-random-pair" },
        }),
      ),
    );

    expect(request.version).toBe(4);
    expect(request.rendererRevision).toBe("canvaskit-v4-r9");
    expect(
      request.groups.flatMap((group) =>
        group.map(({ target }) => target),
      ),
    ).toEqual([
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d20",
      "percentile",
      "d10",
      "fudge",
      "other",
    ]);
    expect(request.groups[8]?.[0]).toMatchObject({
      target: "other",
      sides: 7,
      form: "sphere",
    });
    expect(request.groups[6]?.[0]?.appearance).toEqual(
      request.groups[6]?.[1]?.appearance,
    );
    expect(request.groups[6]?.[0]?.form).toBe(request.groups[6]?.[1]?.form);
    expect(validateRenderRequestV4(request)).toEqual(request);
  });

  it("normalizes a percentile ones-die zero to physical d10 face ten", () => {
    const roll: RollExecutionResult = {
      version: 1,
      seed: 0,
      outcomes: [
        {
          notation: "d%",
          output: "[100]",
          total: 100,
          dice: [
            { sides: "%", rolled: 0, modifiers: [] },
            { sides: 10, rolled: 0, modifiers: [] },
          ],
        },
      ],
      errors: [],
    };
    const request = buildRollRenderRequestV4(
      roll,
      1,
      effectiveRecipesV3(),
    );

    expect(request.groups[0]?.map(({ result }) => result)).toEqual([0, 10]);
  });

  it("renders a penetrating zero contribution on its physical d2 face", () => {
    const roll = executeRoll({
      notation: ["15d2!p"],
      seed: 0,
      stableAppearanceIdentities: true,
    });
    const request = buildRollRenderRequestV4(
      roll,
      1,
      effectiveRecipesV3(),
    );
    const zeroIndexes = roll.outcomes[0]?.dice
      .map(({ rolled }, index) => (rolled === 0 ? index : -1))
      .filter((index) => index >= 0) ?? [];

    expect(zeroIndexes.length).toBeGreaterThan(0);
    expect(zeroIndexes.map((index) => request.groups[0]?.[index]?.result)).toEqual(
      zeroIndexes.map(() => 1),
    );
  });

  it("owns approved material-aware critical effects and modifier icons", () => {
    const request = buildRollRenderRequestV4(
      outcome(["1d1cs=1", "1d1cf=1"]),
      1,
      effectiveRecipesV3(),
    );

    expect(request.groups[0]?.[0]).toMatchObject({
      icons: ["critical-success"],
      appearance: {
        effect: {
          state: "critical-success",
          treatment: "classic-glow",
          color: "#ffd447",
          intensity: 72,
        },
      },
    });
    expect(request.groups[1]?.[0]).toMatchObject({
      icons: ["critical-failure"],
      appearance: {
        effect: {
          state: "critical-failure",
          treatment: "classic-glow",
          color: "#ff334f",
          intensity: 72,
        },
      },
    });
  });

  it("resolves each die deterministically and detaches mutable recipes", () => {
    const recipe = appearanceRecipeV3({ variation: "wild" });
    const recipes = effectiveRecipesV3(recipe);
    const roll = outcome(["2d6", "d7"]);
    const request = buildRollRenderRequestV4(roll, 7, recipes);
    const replay = buildRollRenderRequestV4(roll, 7, recipes);
    const snapshot = structuredClone(request);

    if (recipe.colors.mode !== "palette" || recipe.material.mode !== "fixed") {
      throw new Error("Mutable V3 fixture is invalid");
    }
    recipe.colors.colors[0] = "#ffffff";
    recipe.material.value.textureScale = 200;
    expect(request).toEqual(snapshot);
    expect(replay).toEqual(snapshot);
    expect(
      new Set(
        request.groups.flatMap((group) =>
          group.map(({ appearance: value }) => value.texture.seed),
        ),
      ).size,
    ).toBe(3);
  });

  it("fails explicitly for empty rolls, invalid seeds, missing recipes, and unmappable scope", () => {
    expect(() =>
      buildRollRenderRequestV4(
        outcome(["not-dice"]),
        1,
        effectiveRecipesV3(),
      ),
    ).toThrow("Roll result has no renderable dice");
    expect(() =>
      buildRollRenderRequestV4(
        outcome(["d20"]),
        -1,
        effectiveRecipesV3(),
      ),
    ).toThrow("Render seed must be an unsigned 32-bit integer");

    const missing = { ...effectiveRecipesV3() };
    delete missing.d20;
    expect(() =>
      buildRollRenderRequestV4(
        outcome(["d20"]),
        1,
        missing,
      ),
    ).toThrow("Effective appearance recipe V3 for d20 is required");

    const unmappable = appearanceRecipeV3({
      form: {
        polyhedral: { mode: "fixed", value: "sharp" },
        other: "sphere",
      },
      gradient: {
        scope: { mode: "fixed", value: "repeated" },
        direction: { mode: "fixed", value: "left-to-right" },
      },
    });
    expect(() =>
      buildRollRenderRequestV4(
        outcome(["d20"]),
        1,
        effectiveRecipesV3(unmappable),
      ),
    ).toThrow(
      "Appearance repeated gradient requires standard polyhedral form",
    );
  });
});
