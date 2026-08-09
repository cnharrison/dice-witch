import {
  APPEARANCE_TARGETS_V4,
  createDefaultDiceViewPreferencesV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it, vi } from "vitest";
import {
  BUILTIN_APPEARANCE_RECIPES_V3,
  CHAOTIC_APPEARANCE_STYLE_ID,
} from "../../packages/dice-appearance/src";
import {
  loadEffectiveAppearanceV4,
  parseEffectiveAppearanceV4,
} from "../../workers/roll/src/appearance";

function effectiveAppearance() {
  const recipe =
    BUILTIN_APPEARANCE_RECIPES_V3[CHAOTIC_APPEARANCE_STYLE_ID]?.recipe;
  if (recipe === undefined) throw new Error("Chaotic recipe is missing");
  return {
    version: 4 as const,
    recipes: Object.fromEntries(
      APPEARANCE_TARGETS_V4.map((target) => [target, recipe]),
    ),
    diceView: createDefaultDiceViewPreferencesV4(),
  };
}

describe("roll worker effective appearance V4", () => {
  it("parses the exact complete response", () => {
    const value = effectiveAppearance();
    expect(parseEffectiveAppearanceV4(value)).toEqual(value);
  });

  it("rejects missing targets, malformed preferences, and extra fields", () => {
    const missingTarget = structuredClone(effectiveAppearance());
    delete missingTarget.recipes.d20;
    const invalidPreference = structuredClone(effectiveAppearance());
    invalidPreference.diceView.azimuth.all.customDegrees = 3;

    for (const value of [
      missingTarget,
      invalidPreference,
      { ...effectiveAppearance(), extra: true },
    ]) {
      expect(() => parseEffectiveAppearanceV4(value)).toThrow();
    }
  });

  it("loads only the explicit V4 effective route", async () => {
    const value = effectiveAppearance();
    const fetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(
        "/internal/appearance/v4/effective",
      );
      await expect(request.json()).resolves.toEqual({
        userId: "100000000000000003",
        guildId: null,
      });
      return Response.json(value);
    });

    await expect(
      loadEffectiveAppearanceV4(
        { fetch },
        "100000000000000003",
        null,
      ),
    ).resolves.toEqual(value);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
