import { DiceRoll, NumberGenerator } from "@dice-roller/rpg-dice-roller";
import { afterEach, describe, expect, it } from "vitest";
import { randomBytes } from "../../packages/roll-domain/src/worker-crypto";

type NumberGeneratorEngine = { next(): number };

function fixedEngine() {
  return { next: () => 1 };
}

afterEach(() => {
  NumberGenerator.generator.engine = fixedEngine();
});

describe("Worker crypto adapter", () => {
  it("returns the requested Web Crypto bytes", () => {
    const bytes = randomBytes(32);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(32);
  });

  it.each([-1, 1.5, Number.NaN])("rejects invalid byte count %s", (size) => {
    expect(() => randomBytes(size)).toThrow(
      "Random byte count must be a non-negative safe integer",
    );
  });

  it("satisfies the parser bundle's dormant Node crypto engine", () => {
    // SAFETY: The package runtime export supplies next(), and this test verifies it by executing DiceRoll.
    const nodeCryptoEngine = NumberGenerator.engines
      .nodeCrypto as NumberGeneratorEngine;
    NumberGenerator.generator.engine = nodeCryptoEngine;

    const roll = new DiceRoll("4d6");

    expect(roll.total).toBeGreaterThanOrEqual(4);
    expect(roll.total).toBeLessThanOrEqual(24);
  });
});
