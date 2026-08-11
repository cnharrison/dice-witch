import { describe, expect, it } from "vitest";
import {
  createDefaultDiceViewPreferencesV4,
  type AppearanceProfileV3,
  type AppearanceProfileV4,
  type AppearanceRecipeV3,
  type DiceViewModeV4,
  type GuildAppearanceProfileV3,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_TARGETS,
  BUILTIN_APPEARANCE_RECIPES_V3,
  resolveEffectiveAppearanceRecipes,
  resolveEffectiveAppearanceRecipesV3,
  resolveEffectiveAppearanceV4,
  type AppearanceBuiltinRecipesV3,
  type AppearanceProfileV1,
  type AppearanceRecipeV1,
  type GuildAppearanceProfileV1,
} from "../../packages/dice-appearance/src";

const personalDesignId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";
const personalD20Id = "c69e0632-9a4b-4677-9dbc-dce2c98acb28";
const guildDesignId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function recipe(primary: string): AppearanceRecipeV1 {
  return {
    version: 1,
    variation: "fixed",
    varyBy: "roll",
    colors: { mode: "tonal", primary },
    fill: { mode: "fixed", value: { type: "gradient" } },
    font: { mode: "fixed", fontId: "liberation-sans" },
  };
}

const builtins = {
  chaotic: recipe("#111111"),
  "guild-blue": recipe("#0000aa"),
};

function personalProfile(): AppearanceProfileV1 {
  return {
    version: 1,
    designs: [
      {
        id: personalDesignId,
        name: "Personal all",
        recipe: recipe("#aa0000"),
      },
      {
        id: personalD20Id,
        name: "Personal d20",
        recipe: recipe("#00aa00"),
      },
    ],
    assignments: {
      all: { source: "custom", id: personalDesignId },
      overrides: {
        d20: { source: "custom", id: personalD20Id },
      },
    },
  };
}

function guildProfile(
  mode: GuildAppearanceProfileV1["mode"],
): GuildAppearanceProfileV1 {
  return {
    version: 1,
    mode,
    designs: [
      {
        id: guildDesignId,
        name: "Guild d20",
        recipe: recipe("#aa00aa"),
      },
    ],
    assignments: {
      all: null,
      overrides: {
        d20: { source: "custom", id: guildDesignId },
      },
    },
  };
}

function primary(
  recipes: ReturnType<typeof resolveEffectiveAppearanceRecipes>,
  target: keyof typeof recipes,
): string {
  const colors = recipes[target].colors;
  if (colors.mode === "palette") return colors.colors[0] ?? "";
  return colors.primary;
}

function recipeV3(primary: string): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "fixed",
    varyBy: "roll",
    colors: { mode: "tonal", primary },
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
      direction: { mode: "fixed", value: "upper-left-to-lower-right" },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

function profileV3(styleId: string): AppearanceProfileV3 {
  return {
    version: 3,
    designs: [],
    assignments: {
      all: { source: "builtin", id: styleId },
      overrides: {},
    },
  };
}

function profileV4(
  styleId: string,
  mode: DiceViewModeV4,
  elevationDegrees: number,
): AppearanceProfileV4 {
  return {
    ...profileV3(styleId),
    version: 4,
    diceView: {
      ...createDefaultDiceViewPreferencesV4(),
      mode,
      elevationDegrees,
    },
  };
}

function guildProfileV4(
  mode: GuildAppearanceProfileV4["mode"],
  viewMode: DiceViewModeV4,
): GuildAppearanceProfileV4 {
  return {
    ...profileV4("collector", viewMode, 55),
    mode,
  };
}

describe("appearance precedence", () => {
  it("uses target overrides before apply-to-all within one profile", () => {
    const resolved = resolveEffectiveAppearanceRecipes({
      personalProfile: personalProfile(),
      guildProfile: null,
      builtins,
    });

    expect(primary(resolved, "d6")).toBe("#aa0000");
    expect(primary(resolved, "d20")).toBe("#00aa00");
    expect(Object.keys(resolved)).toHaveLength(APPEARANCE_TARGETS.length);
  });

  it("uses Chaotic for an unconfigured DM", () => {
    const resolved = resolveEffectiveAppearanceRecipes({
      personalProfile: null,
      guildProfile: null,
      builtins,
    });

    expect(primary(resolved, "d4")).toBe("#111111");
    expect(primary(resolved, "other")).toBe("#111111");
  });

  it("ignores guild assignments while guild styling is Off", () => {
    const resolved = resolveEffectiveAppearanceRecipes({
      personalProfile: personalProfile(),
      guildProfile: guildProfile("off"),
      builtins,
    });

    expect(primary(resolved, "d20")).toBe("#00aa00");
  });

  it("uses personal, then guild, then Chaotic in Default mode", () => {
    const personal = personalProfile();
    const personalAll = personal.assignments.all;
    if (personalAll === null) throw new Error("Personal fixture is missing");
    personal.assignments = { all: null, overrides: { d6: personalAll } };
    const guild = guildProfile("default");
    guild.assignments.all = { source: "builtin", id: "guild-blue" };
    const resolved = resolveEffectiveAppearanceRecipes({
      personalProfile: personal,
      guildProfile: guild,
      builtins,
    });

    expect(primary(resolved, "d6")).toBe("#aa0000");
    expect(primary(resolved, "d20")).toBe("#aa00aa");
    expect(primary(resolved, "d8")).toBe("#0000aa");
  });

  it("lets configured guild targets override personal targets in Enforced mode", () => {
    const resolved = resolveEffectiveAppearanceRecipes({
      personalProfile: personalProfile(),
      guildProfile: guildProfile("enforced"),
      builtins,
    });

    expect(primary(resolved, "d20")).toBe("#aa00aa");
    expect(primary(resolved, "d6")).toBe("#aa0000");
  });

  it("makes guild Apply to all complete in Enforced mode", () => {
    const guild = guildProfile("enforced");
    guild.assignments = {
      all: { source: "builtin", id: "guild-blue" },
      overrides: {},
    };
    const resolved = resolveEffectiveAppearanceRecipes({
      personalProfile: personalProfile(),
      guildProfile: guild,
      builtins,
    });

    for (const target of APPEARANCE_TARGETS) {
      expect(primary(resolved, target)).toBe("#0000aa");
    }
  });

  it("fails when a required built-in recipe is missing", () => {
    expect(() =>
      resolveEffectiveAppearanceRecipes({
        personalProfile: null,
        guildProfile: null,
        builtins: {},
      }),
    ).toThrow("Built-in appearance recipe chaotic is required");
  });
});

describe("appearance V3 precedence", () => {
  const builtins: AppearanceBuiltinRecipesV3 = {
    chaotic: { recipe: recipeV3("#111111") },
    collector: {
      recipe: recipeV3("#224466"),
      overrides: { d20: recipeV3("#aa00aa") },
    },
  };

  it("resolves target-authored built-in variants", () => {
    const resolved = resolveEffectiveAppearanceRecipesV3({
      personalProfile: profileV3("collector"),
      guildProfile: null,
      builtins,
    });

    expect(resolved.d6.colors).toEqual({
      mode: "tonal",
      primary: "#224466",
    });
    expect(resolved.d20.colors).toEqual({
      mode: "tonal",
      primary: "#aa00aa",
    });
  });

  it("preserves r32 recipes while applying personal and enforced precedence", () => {
    const sand = BUILTIN_APPEARANCE_RECIPES_V3["elemental-sand"]?.recipe;
    if (sand === undefined) throw new Error("Sand recipe is missing");
    const runicSand: AppearanceRecipeV3 = {
      ...structuredClone(sand),
      font: { mode: "fixed", value: "alcarin-tengwar" },
    };
    const personal: AppearanceProfileV3 = {
      version: 3,
      designs: [{ id: personalDesignId, name: "Runic sand", recipe: runicSand }],
      assignments: {
        all: { source: "custom", id: personalDesignId },
        overrides: {},
      },
    };
    const guild = (mode: GuildAppearanceProfileV3["mode"]): GuildAppearanceProfileV3 => ({
      version: 3,
      mode,
      designs: [],
      assignments: {
        all: { source: "builtin", id: "collector" },
        overrides: {},
      },
    });

    const personalFirst = resolveEffectiveAppearanceRecipesV3({
      personalProfile: personal,
      guildProfile: guild("default"),
      builtins,
    });
    expect(personalFirst.d6.material).toEqual(runicSand.material);
    expect(personalFirst.d6.font).toEqual(runicSand.font);

    const guildFirst = resolveEffectiveAppearanceRecipesV3({
      personalProfile: personal,
      guildProfile: guild("enforced"),
      builtins,
    });
    expect(guildFirst.d6).toEqual(builtins.collector?.recipe);
  });

  it("requires both the Random default and referenced built-ins", () => {
    expect(() =>
      resolveEffectiveAppearanceRecipesV3({
        personalProfile: null,
        guildProfile: null,
        builtins: {},
      }),
    ).toThrow("Built-in appearance recipe chaotic is required");
    expect(() =>
      resolveEffectiveAppearanceRecipesV3({
        personalProfile: profileV3("missing"),
        guildProfile: null,
        builtins,
      }),
    ).toThrow("Built-in appearance recipe missing is required");
  });
});

describe("appearance V4 dice-view precedence", () => {
  const builtins: AppearanceBuiltinRecipesV3 = {
    chaotic: { recipe: recipeV3("#111111") },
    collector: { recipe: recipeV3("#224466") },
  };

  it("returns explicit normal defaults when no profile exists", () => {
    const resolved = resolveEffectiveAppearanceV4({
      personalProfile: null,
      guildProfile: null,
      builtins,
    });

    expect(resolved.version).toBe(4);
    expect(resolved.diceView).toEqual(createDefaultDiceViewPreferencesV4());
    expect(resolved.recipes.d6.colors).toEqual({
      mode: "tonal",
      primary: "#111111",
    });
  });

  it("ignores guild views when Off and lets personal win in Default", () => {
    const personal = profileV4("chaotic", "legacy", 30);

    expect(
      resolveEffectiveAppearanceV4({
        personalProfile: personal,
        guildProfile: guildProfileV4("off", "clear"),
        builtins,
      }).diceView,
    ).toEqual(personal.diceView);
    expect(
      resolveEffectiveAppearanceV4({
        personalProfile: personal,
        guildProfile: guildProfileV4("default", "clear"),
        builtins,
      }).diceView,
    ).toEqual(personal.diceView);
  });

  it("uses guild views when Default has no personal profile or is Enforced", () => {
    const guildDefault = guildProfileV4("default", "clear");
    expect(
      resolveEffectiveAppearanceV4({
        personalProfile: null,
        guildProfile: guildDefault,
        builtins,
      }).diceView,
    ).toEqual(guildDefault.diceView);

    const guildEnforced = guildProfileV4("enforced", "clear");
    expect(
      resolveEffectiveAppearanceV4({
        personalProfile: profileV4("chaotic", "legacy", 30),
        guildProfile: guildEnforced,
        builtins,
      }).diceView,
    ).toEqual(guildEnforced.diceView);
  });

  it("returns a detached complete preference object", () => {
    const personal = profileV4("chaotic", "normal", 40);
    personal.diceView.azimuth.overrides.d20 = {
      mode: "custom",
      customDegrees: -35,
    };
    const resolved = resolveEffectiveAppearanceV4({
      personalProfile: personal,
      guildProfile: null,
      builtins,
    });

    const resolvedD20 = resolved.diceView.azimuth.overrides.d20;
    if (resolvedD20 === undefined) {
      throw new Error("Resolved d20 preference fixture is missing");
    }
    resolvedD20.customDegrees = 45;
    expect(personal.diceView.azimuth.overrides.d20.customDegrees).toBe(-35);
  });
});
