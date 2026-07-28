import { describe, expect, it } from "vitest";
import {
  checkRollLimits,
  parseNotationArgs,
} from "../../packages/roll-domain/src";

describe("parseNotationArgs", () => {
  it.each([
    ["", []],
    ["   ", []],
    ["1d20", ["1d20"]],
    ["  2d20 + 5  ", ["2d20 + 5"]],
    ["floor(1d6 / 2)", ["floor(1d6 / 2)"]],
    ["2d20 1d10", ["2d20", "1d10"]],
    ["1d100cf>=78cs<=15 4d6+1", ["1d100cf>=78cs<=15", "4d6+1"]],
    ["notdice at all", ["notdice", "at", "all"]],
  ])("parses %j as legacy-compatible roll arguments", (input, expected) => {
    expect(parseNotationArgs(input)).toEqual(expected);
  });
});

describe("checkRollLimits", () => {
  it("accepts the maximum supported dice count and sides", () => {
    expect(checkRollLimits(["50d999"])).toEqual({
      allowed: true,
      containsDice: true,
    });
  });

  it.each([
    {
      notation: ["51d6"],
      code: "TOO_MANY_DICE",
      message: "Dice notation exceeds the 50 dice limit",
    },
    {
      notation: ["1d1000"],
      code: "TOO_MANY_SIDES",
      message: "Dice notation exceeds the 999 sides limit",
    },
  ] as const)("rejects $code", ({ notation, code, message }) => {
    expect(checkRollLimits(notation)).toEqual({
      allowed: false,
      containsDice: true,
      code,
      message,
    });
  });

  it("counts each percentile result as two rendered dice", () => {
    expect(checkRollLimits(["25d100"])).toEqual({
      allowed: true,
      containsDice: true,
    });
    expect(checkRollLimits(["26d100"])).toMatchObject({
      allowed: false,
      code: "TOO_MANY_DICE",
    });
  });

  it("rejects repetitions whose rendered base dice exceed the image limit", () => {
    expect(checkRollLimits(["10d6"], 6)).toMatchObject({
      allowed: false,
      code: "TOO_MANY_DICE",
    });
  });

  it("reports input without dice separately from invalid dice notation", () => {
    expect(checkRollLimits(["notdice"])).toEqual({
      allowed: true,
      containsDice: false,
    });
    expect(checkRollLimits(["1d6", "notdice"])).toEqual({
      allowed: true,
      containsDice: true,
    });
  });

  it.each(["d100!>0", "10d100!>1", "d2!!>0", "d1!!"])(
    "rejects an unsafe exploding expression: %s",
    (notation) => {
      expect(checkRollLimits([notation])).toMatchObject({
        allowed: false,
        containsDice: true,
        code: "UNSAFE_EXPLOSION",
      });
    },
  );

  it.each(["1d6!", "1d6!!"])(
    "accepts a bounded explosion: %s",
    (notation) => {
      expect(checkRollLimits([notation])).toEqual({
        allowed: true,
        containsDice: true,
      });
    },
  );

  it("accounts for repetitions in expected explosion size", () => {
    expect(checkRollLimits(["10d6!"], 5)).toMatchObject({
      allowed: false,
      code: "UNSAFE_EXPLOSION",
    });
  });
});
