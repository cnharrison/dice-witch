import {
  DiceRoll,
  NumberGenerator,
} from "@dice-roller/rpg-dice-roller";
import { afterEach, describe, expect, it } from "vitest";

const compatibilityCases = [
  {
    notation: "2d6 + 1d4 - 1",
    output: "2d6 + 1d4 - 1: [3, 4]+[1]-1 = 7",
    total: 7,
  },
  {
    notation: "floor(1d6 / 2)",
    output: "floor(1d6 / 2): floor([3]/2) = 1",
    total: 1,
  },
  {
    notation: "{4d6k2}+{3d10!>8}",
    output: "{4d6k2}+{3d10!>8}: {[3d, 4, 5, 3d]}+{[4, 1, 9!, 1]} = 24",
    total: 24,
  },
  {
    notation: "4d20s!!=17k2min10cs=20cf=1+9",
    output: "4d20s!!=17k2min10cs=20cf=1+9: [10^d, 10^d, 10^, 11]+9 = 30",
    total: 30,
  },
  {
    notation: "d%",
    output: "d%: [31] = 31",
    total: 31,
  },
  {
    notation: "4dF.1",
    output: "4dF.1: [0, 0, 0, 0] = 0",
    total: 0,
  },
] as const;

function seededEngine(seed: number): { next(): number } {
  let state = seed | 0;
  return {
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state | 0;
    },
  };
}

afterEach(() => {
  NumberGenerator.generator.engine = seededEngine(1);
});

describe("patched production notation parser", () => {
  it.each(compatibilityCases)(
    "preserves the seeded legacy result for $notation",
    ({ notation, output, total }) => {
      NumberGenerator.generator.engine = seededEngine(12_345);

      const roll = new DiceRoll(notation);

      expect(roll.output).toBe(output);
      expect(roll.total).toBe(total);
    },
  );
});
