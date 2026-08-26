import * as z from "zod";
import { retrieveNarrationGameCandidatesV1 } from "./narration-game-candidates";
import {
  NARRATION_GAME_CONFIDENCES_V1,
  type NarrationGameConfidenceV1,
} from "./narration-game-catalog";
import type { NarrationGameRankingRequestV1 } from "./narration-game-ranking";
import {
  validateNarrationGameRankingResponseV1,
  type NarrationGameRankingResponseRejectionReasonV1,
} from "./narration-game-ranking-response";

export type NarrationGameRankingEvaluationExpectationV1 = Readonly<{
  version: 1;
  expectedDisposition: "select" | "abstain";
  expectedSelectedSystemId: string | null;
  targetTiers: readonly Readonly<{
    systemId: string;
    targetTier: NarrationGameConfidenceV1;
  }>[];
}>;

export type NarrationGameRankingTierAlignmentV1 =
  "aligned" | "under-target" | "over-target";

export type NarrationGameRankingScoreV1 =
  | Readonly<{
      version: 1;
      status: "scored";
      decision: "correct" | "incorrect";
      tierAssessments: readonly Readonly<{
        systemId: string;
        targetTier: NarrationGameConfidenceV1;
        actualTier: NarrationGameConfidenceV1;
        alignment: NarrationGameRankingTierAlignmentV1;
      }>[];
      responseRejectionReason: null;
    }>
  | Readonly<{
      version: 1;
      status: "invalid-response";
      decision: "not-scored";
      tierAssessments: readonly [];
      responseRejectionReason: NarrationGameRankingResponseRejectionReasonV1;
    }>;

export type NarrationGameRankingScoreSummaryV1 = Readonly<{
  version: 1;
  totalResponses: number;
  validResponses: number;
  invalidResponses: number;
  correctDecisions: number;
  incorrectDecisions: number;
  tierAssessments: number;
  tierAlignment: Readonly<{
    aligned: number;
    underTarget: number;
    overTarget: number;
  }>;
}>;

const CONFIDENCE_RANK = {
  weak: 1,
  plausible: 2,
  strong: 3,
  distinctive: 4,
} as const satisfies Readonly<Record<NarrationGameConfidenceV1, number>>;

const NarrationGameRankingTargetTierSchemaV1 = z.strictObject({
  systemId: z.string(),
  targetTier: z.enum(NARRATION_GAME_CONFIDENCES_V1),
});
const NarrationGameRankingExpectationEnvelopeSchemaV1 = z.strictObject({
  version: z.literal(1),
  expectedDisposition: z.enum(["select", "abstain"]),
  expectedSelectedSystemId: z.string().nullable(),
  targetTiers: z.array(z.unknown()),
});
function validateExpectation(
  expectation: NarrationGameRankingEvaluationExpectationV1,
  request: NarrationGameRankingRequestV1,
): NarrationGameRankingEvaluationExpectationV1 {
  const result = retrieveNarrationGameCandidatesV1(request);
  if (result.state !== "candidate-set" || result.truncated) {
    throw new Error(
      "Narration game-ranking expectation request is not prompt eligible",
    );
  }

  const expectationResult =
    NarrationGameRankingExpectationEnvelopeSchemaV1.safeParse(expectation);
  if (!expectationResult.success) {
    throw new Error("Narration game-ranking expectation is invalid");
  }
  const value = expectationResult.data;
  const candidateIds = result.candidates.map(({ systemId }) => systemId);
  if (value.targetTiers.length !== candidateIds.length) {
    throw new Error(
      "Narration game-ranking expectation candidates are noncanonical",
    );
  }
  const targetTiers: Array<
    z.output<typeof NarrationGameRankingTargetTierSchemaV1>
  > = [];
  for (const target of value.targetTiers) {
    const targetResult =
      NarrationGameRankingTargetTierSchemaV1.safeParse(target);
    if (!targetResult.success) {
      throw new Error("Narration game-ranking expectation tier is invalid");
    }
    targetTiers.push(targetResult.data);
  }
  if (
    targetTiers.some(({ systemId }, index) => systemId !== candidateIds[index])
  ) {
    throw new Error(
      "Narration game-ranking expectation candidates are noncanonical",
    );
  }

  for (const [index, candidate] of result.candidates.entries()) {
    const target = targetTiers[index];
    if (
      target === undefined ||
      CONFIDENCE_RANK[target.targetTier] >
        Math.min(
          CONFIDENCE_RANK[candidate.evidenceTier],
          CONFIDENCE_RANK[candidate.confidenceCeiling],
        )
    ) {
      throw new Error(
        "Narration game-ranking expectation tier exceeds deterministic bounds",
      );
    }
  }

  if (value.expectedDisposition === "abstain") {
    if (value.expectedSelectedSystemId !== null) {
      throw new Error(
        "Narration game-ranking abstention expectation cannot select a system",
      );
    }
    return { ...value, targetTiers };
  }

  if (
    value.expectedSelectedSystemId === null ||
    !candidateIds.includes(value.expectedSelectedSystemId)
  ) {
    throw new Error(
      "Narration game-ranking selection expectation is unsupported",
    );
  }
  const selectedTarget = targetTiers.find(
    ({ systemId }) => systemId === value.expectedSelectedSystemId,
  );
  if (
    selectedTarget === undefined ||
    CONFIDENCE_RANK[selectedTarget.targetTier] < CONFIDENCE_RANK.plausible
  ) {
    throw new Error("Narration game-ranking selection expectation is weak");
  }
  return { ...value, targetTiers };
}

function alignTier(
  actual: NarrationGameConfidenceV1,
  target: NarrationGameConfidenceV1,
): NarrationGameRankingTierAlignmentV1 {
  if (CONFIDENCE_RANK[actual] === CONFIDENCE_RANK[target]) return "aligned";
  return CONFIDENCE_RANK[actual] < CONFIDENCE_RANK[target]
    ? "under-target"
    : "over-target";
}

export function scoreNarrationGameRankingResponseV1(
  value: Parameters<typeof validateNarrationGameRankingResponseV1>[0],
  request: NarrationGameRankingRequestV1,
  expectation: NarrationGameRankingEvaluationExpectationV1,
): NarrationGameRankingScoreV1 {
  const validatedExpectation = validateExpectation(expectation, request);
  const validation = validateNarrationGameRankingResponseV1(value, request);
  if (validation.status === "rejected") {
    return {
      version: 1,
      status: "invalid-response",
      decision: "not-scored",
      tierAssessments: [],
      responseRejectionReason: validation.reason,
    };
  }

  const response = validation.value;
  return {
    version: 1,
    status: "scored",
    decision:
      response.disposition === validatedExpectation.expectedDisposition &&
      response.selectedSystemId ===
        validatedExpectation.expectedSelectedSystemId
        ? "correct"
        : "incorrect",
    tierAssessments: validatedExpectation.targetTiers.map(
      ({ systemId, targetTier }) => {
        const assessment = response.assessments[systemId];
        if (assessment === undefined) {
          throw new Error(
            "Narration game-ranking validated response lost an assessment",
          );
        }
        return {
          systemId,
          targetTier,
          actualTier: assessment.confidenceTier,
          alignment: alignTier(assessment.confidenceTier, targetTier),
        };
      },
    ),
    responseRejectionReason: null,
  };
}

export function summarizeNarrationGameRankingScoresV1(
  scores: readonly NarrationGameRankingScoreV1[],
): NarrationGameRankingScoreSummaryV1 {
  const valid = scores.filter(({ status }) => status === "scored");
  const tiers = valid.flatMap(({ tierAssessments }) => tierAssessments);
  return {
    version: 1,
    totalResponses: scores.length,
    validResponses: valid.length,
    invalidResponses: scores.length - valid.length,
    correctDecisions: valid.filter(({ decision }) => decision === "correct")
      .length,
    incorrectDecisions: valid.filter(({ decision }) => decision === "incorrect")
      .length,
    tierAssessments: tiers.length,
    tierAlignment: {
      aligned: tiers.filter(({ alignment }) => alignment === "aligned").length,
      underTarget: tiers.filter(({ alignment }) => alignment === "under-target")
        .length,
      overTarget: tiers.filter(({ alignment }) => alignment === "over-target")
        .length,
    },
  };
}
