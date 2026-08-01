import { describe, expect, it } from "vitest";
import {
  prepareNarrationGameRankingV2,
  prepareNarrationGameRankingV3,
  type NarrationGameRankingRequestV1,
} from "../../packages/roll-domain/src";
import { buildNarrationGameRankingExpectationV1 } from "./fixtures/narration-game-ranking-calibration-v1";

const UNIQUE_PLAUSIBLE_REQUEST = {
  version: 1,
  features: [
    { kind: "observed-roll-expression", occurrences: 2 },
    { kind: "exploding-step-die", occurrences: 2 },
  ],
} as const satisfies NarrationGameRankingRequestV1;

function promptFor(
  preparation: ReturnType<typeof prepareNarrationGameRankingV2> | ReturnType<typeof prepareNarrationGameRankingV3>,
) {
  if (preparation.state !== "prompt-ready") {
    throw new Error(`Expected a game-ranking prompt, received ${preparation.reason}`);
  }
  return preparation.prompt;
}

describe("prepareNarrationGameRankingV3", () => {
  it("clarifies the frozen unique-plausible policy without changing packet data or schema", () => {
    const v2 = promptFor(prepareNarrationGameRankingV2(UNIQUE_PLAUSIBLE_REQUEST));
    const v3 = promptFor(prepareNarrationGameRankingV3(UNIQUE_PLAUSIBLE_REQUEST));

    expect(v3).toMatchObject({
      version: 3,
      systemPromptRevision: "dice-witch-game-ranking-v3",
    });
    expect(v3.messages[1]).toEqual(v2.messages[1]);
    expect(v3.responseSchema).toEqual(v2.responseSchema);
    expect(v3.messages[0].content).toContain(
      "exactly one supplied candidate has the uniquely highest non-weak evidence tier, select it",
    );
    expect(v3.messages[0].content).toContain(
      "A plausible selection is a qualified hypothesis, not a claim of certainty",
    );
    expect(v3.messages[0].content).toContain(
      "If multiple supplied candidates share the highest non-weak tier, abstain",
    );
  });

  it("retains the approved qualified suggestion expectation and deterministic abstentions", () => {
    expect(
      buildNarrationGameRankingExpectationV1(UNIQUE_PLAUSIBLE_REQUEST),
    ).toEqual({
      version: 1,
      expectedDisposition: "select",
      expectedSelectedSystemId: "savage-worlds",
      targetTiers: [
        { systemId: "savage-worlds", targetTier: "plausible" },
      ],
    });
    expect(
      prepareNarrationGameRankingV3({ version: 1, features: [] }),
    ).toMatchObject({
      version: 3,
      state: "deterministic-abstention",
      disposition: "abstain",
      reason: "insufficient-evidence",
    });
  });
});
