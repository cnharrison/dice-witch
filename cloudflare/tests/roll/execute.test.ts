import { describe, expect, it } from "vitest";
import { executeRoll } from "../../packages/roll-domain/src";

const seed = 0x1234_abcd;

describe("executeRoll", () => {
  it("reproduces the complete outcome from the same persisted seed", () => {
    const request = {
      notation: ["4d6k3", "d%", "4dF"],
      seed,
    };

    const first = executeRoll(request);
    const replay = executeRoll(request);

    expect(replay).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first).toMatchObject({
      version: 1,
      seed,
      errors: [],
      outcomes: [
        { notation: "4d6k3" },
        { notation: "d%" },
        { notation: "4dF" },
      ],
    });
  });

  it("produces a different deterministic sequence for a different seed", () => {
    const first = executeRoll({ notation: ["20d100"], seed: 1 });
    const second = executeRoll({ notation: ["20d100"], seed: 2 });

    expect(second.outcomes[0]?.dice).not.toEqual(first.outcomes[0]?.dice);
  });

  it("preserves visual modifier semantics in plain die data", () => {
    const result = executeRoll({
      notation: ["4d1k2", "1d1cs=1", "1d1cf=1"],
      seed,
    });

    expect(result.errors).toEqual([]);
    expect(
      result.outcomes[0]?.dice.filter((die) =>
        die.modifiers.includes("drop"),
      ),
    ).toHaveLength(2);
    expect(result.outcomes[1]?.dice[0]).toMatchObject({
      sides: 1,
      rolled: 1,
      modifiers: ["critical-success"],
    });
    expect(result.outcomes[2]?.dice[0]).toMatchObject({
      sides: 1,
      rolled: 1,
      modifiers: ["critical-failure"],
    });
  });

  it.each([
    ["10d6!", "explode", 2],
    ["10d6!p", "penetrate", 2],
    ["10d6r=1", "re-roll", 3],
    ["8d6u", "unique", 3],
    ["4d20min10", "min", 2],
    ["4d20max10", "max", 2],
    ["10d6=6", "target-success", 2],
  ] as const)(
    "preserves %s results marked with %s",
    (notation, modifier, expectedCount) => {
      const result = executeRoll({ notation: [notation], seed: 0 });
      const matchingDice = result.outcomes[0]?.dice.filter((die) =>
        die.modifiers.includes(modifier),
      );

      expect(result.errors).toEqual([]);
      expect(matchingDice).toHaveLength(expectedCount);
    },
  );

  it("expands percentile results and preserves Fudge faces", () => {
    const result = executeRoll({ notation: ["d%", "4df"], seed });
    const percentile = result.outcomes[0]?.dice;
    const fudge = result.outcomes[1]?.dice;

    expect(percentile).toHaveLength(2);
    expect(percentile?.map((die) => die.sides)).toEqual(["%", 10]);
    expect([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]).toContain(
      percentile?.[0]?.rolled,
    );
    expect(percentile?.[1]?.rolled).toBeGreaterThanOrEqual(0);
    expect(percentile?.[1]?.rolled).toBeLessThanOrEqual(9);
    expect(fudge).toHaveLength(4);
    expect(fudge?.every((die) => [-1, 0, 1].includes(die.rolled))).toBe(true);
    expect(result.outcomes[1]?.notation).toBe("4dF");
  });

  it("repeats the normalized notation sequence in legacy order", () => {
    const result = executeRoll({
      notation: ["1d1", "2d1"],
      repetitions: 2,
      seed,
    });

    expect(result.outcomes.map((outcome) => outcome.notation)).toEqual([
      "1d1",
      "2d1",
      "1d1",
      "2d1",
    ]);
  });

  it("returns partial valid outcomes with sanitized notation errors", () => {
    const result = executeRoll({
      notation: ["1d1", "not-dice"],
      seed,
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.errors).toEqual([
      { code: "INVALID_NOTATION", notation: "not-dice" },
    ]);
  });

  it("rejects an actual explosion that exceeds the rendered-dice limit", () => {
    const result = executeRoll({ notation: ["25d2!"], seed: 2 });

    expect(result.outcomes).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "TOO_MANY_DICE" }),
    ]);
  });

  it.each([
    {
      notation: ["51d6"],
      code: "TOO_MANY_DICE",
    },
    {
      notation: ["hello"],
      code: "NO_DICE",
    },
  ] as const)("rejects unsafe input with $code", ({ notation, code }) => {
    const result = executeRoll({ notation: [...notation], seed });

    expect(result.outcomes).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({ code }),
    ]);
  });

  it.each([0, -1, 51, 1.5, Number.NaN])(
    "rejects invalid repetition count %s",
    (repetitions) => {
      expect(() =>
        executeRoll({
          notation: ["1d6 invalid"],
          repetitions,
          seed,
        }),
      ).toThrow("Roll repetitions must be an integer from 1 through 50");
    },
  );

  it("rejects notation beyond the Discord input ceiling", () => {
    expect(() =>
      executeRoll({ notation: [`1d6${" ".repeat(6_000)}`], seed }),
    ).toThrow("Roll notation must not exceed 6000 characters");
  });

  it("rejects more notation expressions than the renderer can represent", () => {
    expect(() =>
      executeRoll({ notation: Array.from({ length: 51 }, () => "invalid"), seed }),
    ).toThrow("Roll request cannot contain more than 50 notation expressions");
  });

  it.each([-1, 0x1_0000_0000, 1.5, Number.NaN])(
    "rejects invalid persisted seed %s",
    (invalidSeed) => {
      expect(() =>
        executeRoll({ notation: ["1d6"], seed: invalidSeed }),
      ).toThrow("Roll seed must be an unsigned 32-bit integer");
    },
  );
});
