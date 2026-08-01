import { describe, expect, it } from "vitest";
import {
  extractNarrationGameFeaturesV1,
  prepareNarrationGameRankingV1,
  scoreNarrationGameRankingResponseV1,
  summarizeNarrationGameRankingScoresV1,
} from "../../packages/roll-domain/src";
import {
  buildNarrationGameRankingExpectationV1,
  buildNarrationGameRankingReferenceResponseV1,
  NARRATION_GAME_RANKING_CALIBRATION_POLICY_V1,
} from "./fixtures/narration-game-ranking-calibration-v1";
import { NARRATION_GAME_SESSION_FIXTURES_V1 } from "./fixtures/narration-game-sessions-v1";

function promptReadyCases() {
  return NARRATION_GAME_SESSION_FIXTURES_V1.flatMap((fixture) => {
    const features = extractNarrationGameFeaturesV1(fixture.request);
    const preparation = prepareNarrationGameRankingV1(features);
    return preparation.state === "prompt-ready"
      ? [{ fixture, request: features, preparation }]
      : [];
  });
}

describe("narration game-ranking calibration v1", () => {
  it("freezes qualitative rules without probabilities, thresholds, or inference", () => {
    expect(NARRATION_GAME_RANKING_CALIBRATION_POLICY_V1).toEqual({
      version: 1,
      status: "synthetic-human-reviewed-protocol-no-inference",
      rawPercentagesAreConfidenceTiers: false,
      confidenceTiersAreQualitativeOnly: true,
      targetTierSource: "human-approved-deterministic-evidence-tier",
      decisionRule:
        "select-the-unique-highest-nonweak-candidate-otherwise-abstain",
      tierAlignment: ["under-target", "aligned", "over-target"],
      productionPassThresholdsSelected: false,
      modelCalls: 0,
    });
  });

  it("partitions the reviewed corpus into seven bounded selections and one abstention", () => {
    const cases = promptReadyCases();
    const expectations = cases.map(({ request }) =>
      buildNarrationGameRankingExpectationV1(request),
    );

    expect(cases).toHaveLength(8);
    expect(
      expectations.filter(
        ({ expectedDisposition }) => expectedDisposition === "select",
      ),
    ).toHaveLength(7);
    expect(
      expectations.filter(
        ({ expectedDisposition }) => expectedDisposition === "abstain",
      ),
    ).toHaveLength(1);
    expect(
      cases.find(
        ({ fixture }) =>
          fixture.id === "candidate-percentile-roll-under-confusables",
      )?.request,
    ).toBeDefined();
    expect(
      expectations.find(
        ({ expectedDisposition }) => expectedDisposition === "abstain",
      )?.expectedSelectedSystemId,
    ).toBeNull();
  });

  it("scores the eight reference decisions and thirteen candidate tiers exactly", () => {
    const scores = promptReadyCases().map(({ request }) =>
      scoreNarrationGameRankingResponseV1(
        buildNarrationGameRankingReferenceResponseV1(request),
        request,
        buildNarrationGameRankingExpectationV1(request),
      ),
    );

    expect(summarizeNarrationGameRankingScoresV1(scores)).toEqual({
      version: 1,
      totalResponses: 8,
      validResponses: 8,
      invalidResponses: 0,
      correctDecisions: 8,
      incorrectDecisions: 0,
      tierAssessments: 13,
      tierAlignment: {
        aligned: 13,
        underTarget: 0,
        overTarget: 0,
      },
    });
  });

  it("keeps blinded prompts free of fixture IDs and expected decisions", () => {
    for (const { fixture, preparation } of promptReadyCases()) {
      const serialized = JSON.stringify(preparation.prompt);
      expect(serialized).not.toContain(fixture.id);
      for (const expectedField of [
        "expectedDisposition",
        "expectedSelectedSystemId",
        "targetTier",
      ]) {
        expect(serialized).not.toContain(expectedField);
      }
    }
  });
});
