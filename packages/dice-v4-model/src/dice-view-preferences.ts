import type { DiceViewPreferencesV4 } from "./types";

export const DICE_VIEW_MODES_V4 = Object.freeze([
  "normal",
  "legacy",
  "clear",
] as const);

export const DICE_VIEW_AZIMUTH_MODES_V4 = Object.freeze([
  "random",
  "custom",
] as const);

export const DICE_VIEW_ELEVATION_RANGE_V4 = Object.freeze({
  minimum: 30,
  maximum: 55,
  step: 1,
} as const);

export const DICE_VIEW_AZIMUTH_RANGE_V4 = Object.freeze({
  minimum: -45,
  maximum: 45,
  step: 5,
} as const);

export function createDefaultDiceViewPreferencesV4(): DiceViewPreferencesV4 {
  return {
    elevationDegrees: 40,
    mode: "normal",
    azimuth: {
      all: { mode: "random", customDegrees: 0 },
      overrides: {},
    },
  };
}
