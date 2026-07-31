import { describe, expect, it } from "vitest";
import {
  extractNarrationGameFeaturesV1,
  type NarrationGameFeatureRequestV1,
} from "../../packages/roll-domain/src";

describe("extractNarrationGameFeaturesV1", () => {
  it("normalizes equivalent four-d6 ability-score expressions", () => {
    expect(
      extractNarrationGameFeaturesV1({
        version: 1,
        rolls: [
          { notation: ["4d6kh3"], repetitions: 2 },
          { notation: ["4D6k3"], repetitions: 2 },
          { notation: ["4d6 dl1"], repetitions: 2 },
        ],
      }),
    ).toEqual({
      version: 1,
      features: [
        {
          kind: "four-d6-keep-highest-three",
          occurrences: 6,
        },
      ],
    });
  });

  it("recognizes mechanics without exposing notation or exact results", () => {
    const result = extractNarrationGameFeaturesV1({
      version: 1,
      rolls: [
        { notation: ["1d20+7", "d100", "1d100<=55"], repetitions: 1 },
        { notation: ["4dF+2", "3d6kh1", "2d6kl1"], repetitions: 1 },
      ],
    });

    expect(result.features).toEqual([
      { kind: "d6-pool-keep-highest", occurrences: 1 },
      { kind: "four-fate-dice", occurrences: 1 },
      { kind: "percentile-roll-under-threshold", occurrences: 1 },
      { kind: "single-d20-plus-modifier", occurrences: 1 },
      { kind: "single-d20-roll", occurrences: 1 },
      { kind: "single-percentile-roll", occurrences: 2 },
      { kind: "two-d6-keep-lowest", occurrences: 1 },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/1d20|d100|55|result|total/iu);
  });

  it("counts repeated expressions as repeated mechanical observations", () => {
    expect(
      extractNarrationGameFeaturesV1({
        version: 1,
        rolls: [{ notation: ["4d6kh3"], repetitions: 6 }],
      }).features,
    ).toContainEqual({
      kind: "four-d6-keep-highest-three",
      occurrences: 6,
    });
  });

  it("returns feature labels without copying raw notation into the feature result", () => {
    const result = extractNarrationGameFeaturesV1({
      version: 1,
      rolls: [{
        notation: [
          "d10+7",
          "2d6+2",
          "2d10+3",
          "3d6",
          "3d20",
          "2d12+1",
          "8d6",
          "8d10",
          "2d20<13",
          "d20<=14",
          "{d20,2d6kh1}",
          "{d20,d6}",
          "{d8,d10}",
          "d14",
        ],
        repetitions: 1,
      }],
    });

    expect(result.features).toEqual([
      { kind: "d20-roll-under-threshold", occurrences: 1 },
      { kind: "d20-with-accuracy-d6", occurrences: 1 },
      { kind: "d20-with-plot-d6", occurrences: 1 },
      { kind: "dcc-dice-chain", occurrences: 1 },
      { kind: "mixed-step-dice-pool", occurrences: 1 },
      { kind: "plain-d10-pool", occurrences: 1 },
      { kind: "plain-d6-pool", occurrences: 2 },
      { kind: "single-d10-plus-modifier", occurrences: 1 },
      { kind: "single-d20-roll", occurrences: 1 },
      { kind: "three-d20", occurrences: 1 },
      { kind: "three-d6", occurrences: 1 },
      { kind: "two-d10-plus-modifier", occurrences: 1 },
      { kind: "two-d12-plus-modifier", occurrences: 1 },
      { kind: "two-d20-roll-under-threshold", occurrences: 1 },
      { kind: "two-d6-plus-modifier", occurrences: 1 },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/d10\+7|2d20|d14|notation/iu);
  });

  it("ignores unsupported notation instead of manufacturing a feature", () => {
    expect(
      extractNarrationGameFeaturesV1({
        version: 1,
        rolls: [{ notation: ["not dice"], repetitions: 1 }],
      }),
    ).toEqual({ version: 1, features: [] });
  });

  it("rejects malformed, oversized, and sensitive input shapes", () => {
    const valid: NarrationGameFeatureRequestV1 = {
      version: 1,
      rolls: [{ notation: ["4d6kh3"], repetitions: 6 }],
    };

    const roll = valid.rolls[0];
    if (roll === undefined) throw new Error("Missing valid game feature roll");

    expect(() =>
      extractNarrationGameFeaturesV1({
        ...valid,
        userId: "123",
      } as unknown as NarrationGameFeatureRequestV1),
    ).toThrow("Narration game feature request contains an unsupported field");
    expect(() =>
      extractNarrationGameFeaturesV1({
        ...valid,
        rolls: [{ ...roll, results: [18, 17, 16] }],
      } as unknown as NarrationGameFeatureRequestV1),
    ).toThrow("Narration game feature roll contains an unsupported field");
    expect(() =>
      extractNarrationGameFeaturesV1({ ...valid, rolls: [] }),
    ).toThrow("Narration game feature request requires 1 through 256 rolls");
    expect(() =>
      extractNarrationGameFeaturesV1({
        ...valid,
        rolls: Array.from({ length: 257 }, () => roll),
      }),
    ).toThrow("Narration game feature request requires 1 through 256 rolls");
  });
});
