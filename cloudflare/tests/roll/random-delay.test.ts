import { describe, expect, it } from "vitest";
import {
  MAX_ROLL_DELAY_MS,
  MIN_ROLL_DELAY_MS,
  selectRollDelayMs,
} from "../../packages/roll-domain/src";

describe("legacy randomized roll delay", () => {
  it.each([
    [0, 1],
    [0.5, 2_501],
    [1 - Number.EPSILON, 5_000],
  ])("maps unit random value %s to %s ms", (randomUnit, expected) => {
    expect(selectRollDelayMs(randomUnit)).toBe(expected);
  });

  it("preserves the inclusive legacy boundaries", () => {
    expect(MIN_ROLL_DELAY_MS).toBe(1);
    expect(MAX_ROLL_DELAY_MS).toBe(5_000);
  });

  it.each([-Number.EPSILON, 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid unit random value %s",
    (randomUnit) => {
      expect(() => selectRollDelayMs(randomUnit)).toThrow(
        "Roll delay random value must be in [0, 1)",
      );
    },
  );
});
