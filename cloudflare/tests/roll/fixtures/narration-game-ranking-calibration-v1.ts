import {
  retrieveNarrationGameCandidatesV1,
  type NarrationGameCandidateV1,
  type NarrationGameConfidenceV1,
  type NarrationGameRankingEvaluationExpectationV1,
  type NarrationGameRankingRequestV1,
  type NarrationGameRankingResponseV1,
} from "../../../packages/roll-domain/src";

export const NARRATION_GAME_RANKING_CALIBRATION_POLICY_V1 = {
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
} as const;

const CONFIDENCE_RANK: Readonly<Record<NarrationGameConfidenceV1, number>> = {
  weak: 1,
  plausible: 2,
  strong: 3,
  distinctive: 4,
};

function promptCandidates(
  request: NarrationGameRankingRequestV1,
): readonly NarrationGameCandidateV1[] {
  const result = retrieveNarrationGameCandidatesV1(request);
  if (result.state !== "candidate-set" || result.truncated) {
    throw new Error("Narration game-ranking calibration case is not prompt ready");
  }
  return result.candidates;
}

function expectationForCandidates(
  candidates: readonly NarrationGameCandidateV1[],
): NarrationGameRankingEvaluationExpectationV1 {
  const highestRank = Math.max(
    ...candidates.map(({ evidenceTier }) => CONFIDENCE_RANK[evidenceTier]),
  );
  const highestCandidates = candidates.filter(
    ({ evidenceTier }) => CONFIDENCE_RANK[evidenceTier] === highestRank,
  );
  let selected: NarrationGameCandidateV1 | null = null;
  if (highestCandidates.length === 1) {
    selected = highestCandidates[0] ?? null;
  }
  if (
    selected !== null &&
    CONFIDENCE_RANK[selected.evidenceTier] < CONFIDENCE_RANK.plausible
  ) {
    throw new Error("Narration game-ranking calibration cannot select weak evidence");
  }

  return {
    version: 1,
    expectedDisposition: selected === null ? "abstain" : "select",
    expectedSelectedSystemId: selected?.systemId ?? null,
    targetTiers: candidates.map(({ systemId, evidenceTier }) => ({
      systemId,
      targetTier: evidenceTier,
    })),
  };
}

export function buildNarrationGameRankingExpectationV1(
  request: NarrationGameRankingRequestV1,
): NarrationGameRankingEvaluationExpectationV1 {
  return expectationForCandidates(promptCandidates(request));
}

export function buildNarrationGameRankingReferenceResponseV1(
  request: NarrationGameRankingRequestV1,
): NarrationGameRankingResponseV1 {
  const candidates = promptCandidates(request);
  const expectation = expectationForCandidates(candidates);
  return {
    version: 1,
    disposition: expectation.expectedDisposition,
    selectedSystemId: expectation.expectedSelectedSystemId,
    assessments: Object.fromEntries(
      candidates.map((candidate) => {
        const evidence = candidate.evidence.find(
          ({ evidenceTier }) => evidenceTier === candidate.evidenceTier,
        );
        if (evidence === undefined) {
          throw new Error(
            "Narration game-ranking calibration evidence tier is missing",
          );
        }
        return [
          candidate.systemId,
          {
            confidenceTier: candidate.evidenceTier,
            evidenceCitations: [
              {
                claimId: evidence.claim,
                sourceIds: evidence.sourceIds,
              },
            ],
          },
        ];
      }),
    ),
    abstentionReason:
      expectation.expectedDisposition === "abstain"
        ? "confusable-mechanics"
        : null,
  };
}
