import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  createDeterministicRandomV4,
  deriveAppearanceSeedV4,
  deriveNamedSeedV4,
} from "../src";

describe("V4 deterministic random", () => {
  it("pins the unsigned integer stream", () => {
    const random = createDeterministicRandomV4(0x51ce_b00c);
    expect(Array.from({ length: 6 }, () => random.nextUint32())).toEqual([
      2_643_007_131,
      3_409_718_027,
      1_431_653_817,
      1_816_819_345,
      2_362_573_474,
      3_004_149_436,
    ]);
    expect(() => createDeterministicRandomV4(-1)).toThrow(
      "Deterministic seed must be an unsigned 32-bit integer",
    );
    expect(() => random.index(0)).toThrow(
      "Deterministic selection must be a non-empty safe length",
    );
  });

  it("derives stable roll, group, die, and fixed scopes", () => {
    const context = {
      renderSeed: 0x1234_5678,
      target: "d20" as const,
      groupIndex: 2,
      dieIndex: 7,
    };
    const recipe = { family: "classic", treatment: "solid" };

    expect(
      deriveAppearanceSeedV4({
        ...context,
        recipe,
        variation: "wild",
        varyBy: "group",
      }),
    ).toBe(4_269_731_937);
    expect(
      deriveAppearanceSeedV4({
        ...context,
        recipe,
        variation: "wild",
        varyBy: "die",
      }),
    ).toBe(2_514_595_199);

    const rollSeed = deriveAppearanceSeedV4({
      ...context,
      recipe,
      variation: "curated",
      varyBy: "roll",
    });
    expect(rollSeed).toBe(
      deriveAppearanceSeedV4({
        ...context,
        groupIndex: 99,
        dieIndex: 99,
        target: "other",
        recipe,
        variation: "curated",
        varyBy: "roll",
      }),
    );

    const identifiedSeed = deriveAppearanceSeedV4({
      ...context,
      groupIdentity: "expression:0:repeat:0",
      dieIdentity: "expression:0:repeat:0:definition:20:0:die:0",
      recipe,
      variation: "wild",
      varyBy: "die",
    });
    expect(identifiedSeed).toBe(
      deriveAppearanceSeedV4({
        ...context,
        groupIndex: 99,
        dieIndex: 99,
        groupIdentity: "expression:0:repeat:0",
        dieIdentity: "expression:0:repeat:0:definition:20:0:die:0",
        recipe,
        variation: "wild",
        varyBy: "die",
      }),
    );

    const fixedSeed = deriveAppearanceSeedV4({
      ...context,
      recipe,
      variation: "fixed",
      varyBy: "die",
    });
    expect(fixedSeed).toBe(
      deriveAppearanceSeedV4({
        ...context,
        renderSeed: 0,
        groupIndex: 0,
        dieIndex: 0,
        target: "d4",
        recipe: { treatment: "solid", family: "classic" },
        variation: "fixed",
        varyBy: "roll",
      }),
    );
  });

  it("canonicalizes semantic objects and isolates named streams", () => {
    expect(
      canonicalJsonV4({
        z: [3, { y: true, x: null }],
        a: "value",
      }),
    ).toBe('{"a":"value","z":[3,{"x":null,"y":true}]}');
    expect(canonicalJsonV4({ b: 2, a: 1 })).toBe(
      canonicalJsonV4({ a: 1, b: 2 }),
    );
    expect(() => canonicalJsonV4({ invalid: Number.NaN })).toThrow(
      "Canonical JSON contains an unsupported value",
    );
    expect(() => canonicalJsonV4(new Array(1))).toThrow(
      "Canonical JSON contains an unsupported value",
    );

    expect(deriveNamedSeedV4(123, "material")).toBe(2_641_807_242);
    expect(deriveNamedSeedV4(123, "material")).not.toBe(
      deriveNamedSeedV4(123, "font"),
    );
    expect(() => deriveNamedSeedV4(123, "")).toThrow(
      "Deterministic stream name must be from 1 through 64 characters",
    );
  });
});
