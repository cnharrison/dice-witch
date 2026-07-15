import { describe, expect, it } from "vitest";
import { executeRoll } from "../../packages/roll-domain/src";

const documentedNotation = [
  "4d6min3",
  "4d10max5",
  "10d20max15min5",
  "2d6!=5",
  "2d6!>4",
  "4d10!<=3",
  "2d6!!=5",
  "2d6!p=5",
  "6d8u",
  "8d10u=5",
  "10d10u>7",
  "1d10r",
  "4d10r<=3",
  "4d10k2",
  "4d10kl2",
  "4d10d1",
  "4d10dh1",
  "2d6=6",
  "6d10<=4",
  "1d20cs=20",
  "5d20cs>=16",
  "1d20cf=1",
  "4d6s",
  "4d6sa",
  "4d6sd",
  "d6*5",
  "2d10/d20",
  "3d20^4",
  "(4-2)d10",
  "sqrt(4d10/3)",
  "4dF",
  "4dF+2",
  "4dFk2",
  "4dFkl2",
  "4dFd1",
  "4dFdh1",
  "4dF!",
  "4dFr-1",
  "4dFro-1",
  "3dFu",
  "4dF!k2",
  "4dFcs=1",
  "4dFcf=-1",
  "{4dF, 2d6}",
  "4dF!!",
  "4dF!p",
] as const;

describe("production notation parity", () => {
  it.each(documentedNotation)("executes documented notation %s", (notation) => {
    const result = executeRoll({ notation: [notation], seed: 0 });

    expect(result.errors).toEqual([]);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]?.dice.length).toBeGreaterThan(0);
    expect(Number.isFinite(result.outcomes[0]?.total)).toBe(true);
  });

  it("keeps and drops the correct dice without changing displayed faces", () => {
    const result = executeRoll({ notation: ["6d20k3"], seed: 0 });
    const dice = result.outcomes[0]?.dice ?? [];
    const kept = dice.filter((die) => !die.modifiers.includes("drop"));
    const dropped = dice.filter((die) => die.modifiers.includes("drop"));

    expect(kept).toHaveLength(3);
    expect(dropped).toHaveLength(3);
    expect(result.outcomes[0]?.total).toBe(
      kept.reduce((total, die) => total + die.rolled, 0),
    );
    expect(Math.min(...kept.map((die) => die.rolled))).toBeGreaterThanOrEqual(
      Math.max(...dropped.map((die) => die.rolled)),
    );
  });

  it("sorts ascending and descending without changing totals", () => {
    const ascending = executeRoll({ notation: ["8d20sa"], seed: 0 });
    const descending = executeRoll({ notation: ["8d20sd"], seed: 0 });
    const ascendingValues = ascending.outcomes[0]?.dice.map((die) => die.rolled) ?? [];
    const descendingValues = descending.outcomes[0]?.dice.map((die) => die.rolled) ?? [];

    expect(ascendingValues).toEqual([...ascendingValues].sort((a, b) => a - b));
    expect(descendingValues).toEqual([...descendingValues].sort((a, b) => b - a));
    expect(ascending.outcomes[0]?.total).toBe(descending.outcomes[0]?.total);
  });

  it("applies min and max values to displayed and calculated results", () => {
    const minimum = executeRoll({ notation: ["8d20min10"], seed: 0 });
    const maximum = executeRoll({ notation: ["8d20max10"], seed: 0 });

    expect(minimum.outcomes[0]?.dice.every((die) => die.rolled >= 10)).toBe(true);
    expect(maximum.outcomes[0]?.dice.every((die) => die.rolled <= 10)).toBe(true);
  });

  it("counts target successes while retaining every displayed die", () => {
    const result = executeRoll({ notation: ["10d6=6"], seed: 0 });
    const dice = result.outcomes[0]?.dice ?? [];
    const successes = dice.filter((die) =>
      die.modifiers.includes("target-success"),
    );

    expect(dice).toHaveLength(10);
    expect(result.outcomes[0]?.total).toBe(successes.length);
  });

  it("produces distinct kept values for a satisfiable unique roll", () => {
    const result = executeRoll({ notation: ["4d6u"], seed: 0 });
    const values = result.outcomes[0]?.dice.map((die) => die.rolled) ?? [];

    expect(new Set(values).size).toBe(values.length);
  });

  it("preserves all die types in mixed grouped notation", () => {
    const result = executeRoll({ notation: ["{4dF, 2d6, d%}"], seed: 0 });
    const sides = result.outcomes[0]?.dice.map((die) => die.sides) ?? [];

    expect(sides.filter((side) => side === "F")).toHaveLength(4);
    expect(sides.filter((side) => side === 6)).toHaveLength(2);
    expect(sides.slice(-2)).toEqual(["%", 10]);
  });
});
