import { describe, expect, it } from "vitest";
import {
  createDefaultDiceViewPreferencesV4,
  parseAppearanceProfileV3,
  parseAppearanceProfileV4,
  parseDiceViewPreferencesV4,
  parseGuildAppearanceProfileV4,
  type AppearanceProfileV4,
} from "../src";

const catalog = { builtinStyleIds: ["chaotic"] } as const;

function profile(): AppearanceProfileV4 {
  return {
    version: 4,
    designs: [],
    assignments: {
      all: { source: "builtin", id: "chaotic" },
      overrides: {},
    },
    diceView: createDefaultDiceViewPreferencesV4(),
  };
}

describe("Appearance Profile V4 dice views", () => {
  it("accepts and canonicalizes every explicit view mode", () => {
    for (const mode of ["normal", "legacy", "clear"] as const) {
      const value = profile();
      value.diceView = {
        elevationDegrees: 55,
        mode,
        azimuth: {
          all: { mode: "custom", customDegrees: -45 },
          overrides: {
            d4: { mode: "random", customDegrees: 45 },
            percentile: { mode: "custom", customDegrees: 0 },
            other: { mode: "custom", customDegrees: 5 },
          },
        },
      };

      expect(parseAppearanceProfileV4(value, catalog)).toEqual(value);
      expect(
        parseGuildAppearanceProfileV4(
          { ...value, mode: "enforced" },
          catalog,
        ),
      ).toEqual({ ...value, mode: "enforced" });
    }
  });

  it("creates independent explicit defaults", () => {
    const first = createDefaultDiceViewPreferencesV4();
    const second = createDefaultDiceViewPreferencesV4();
    first.azimuth.all.customDegrees = 45;

    expect(second).toEqual({
      elevationDegrees: 40,
      mode: "normal",
      azimuth: {
        all: { mode: "random", customDegrees: 0 },
        overrides: {},
      },
    });
  });

  it("rejects malformed elevations, modes, azimuths, and overrides", () => {
    const invalidDiceViews = [
      { ...createDefaultDiceViewPreferencesV4(), elevationDegrees: 29 },
      { ...createDefaultDiceViewPreferencesV4(), elevationDegrees: 55.5 },
      { ...createDefaultDiceViewPreferencesV4(), mode: "standard" },
      {
        ...createDefaultDiceViewPreferencesV4(),
        azimuth: {
          all: { mode: "custom", customDegrees: 46 },
          overrides: {},
        },
      },
      {
        ...createDefaultDiceViewPreferencesV4(),
        azimuth: {
          all: { mode: "custom", customDegrees: 3 },
          overrides: {},
        },
      },
      {
        ...createDefaultDiceViewPreferencesV4(),
        azimuth: {
          all: { mode: "sometimes", customDegrees: 0 },
          overrides: {},
        },
      },
      {
        ...createDefaultDiceViewPreferencesV4(),
        azimuth: {
          all: { mode: "random", customDegrees: 0 },
          overrides: {
            d1000: { mode: "custom", customDegrees: 0 },
          },
        },
      },
      {
        ...createDefaultDiceViewPreferencesV4(),
        extra: true,
      },
    ];

    for (const diceView of invalidDiceViews) {
      expect(() => parseDiceViewPreferencesV4(diceView)).toThrow();
    }
  });

  it("requires the exact V4 profile and guild fields", () => {
    const value = profile();
    const withoutDiceView: Partial<AppearanceProfileV4> = { ...value };
    delete withoutDiceView.diceView;

    expect(() => parseAppearanceProfileV4(withoutDiceView, catalog)).toThrow(
      "Appearance profile V4 has invalid fields",
    );
    expect(() =>
      parseAppearanceProfileV4({ ...value, extra: true }, catalog),
    ).toThrow("Appearance profile V4 has invalid fields");
    expect(() =>
      parseGuildAppearanceProfileV4(
        { ...value, mode: "sometimes" },
        catalog,
      ),
    ).toThrow("Guild appearance mode is invalid");
  });

  it("leaves the strict V3 contract unchanged", () => {
    const value = profile();
    expect(() =>
      parseAppearanceProfileV3(
        {
          version: 3,
          designs: value.designs,
          assignments: value.assignments,
          diceView: value.diceView,
        },
        catalog,
      ),
    ).toThrow("Appearance profile V3 has invalid fields");
    expect(() => parseAppearanceProfileV4({ ...value, version: 3 }, catalog)).toThrow(
      "Appearance profile version must be 4",
    );
  });
});
