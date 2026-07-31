import { retrieveNarrationGameCandidatesV1 } from "./narration-game-candidates";
import type { NarrationGameConfidenceV1 } from "./narration-game-catalog";
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
  | "aligned"
  | "under-target"
  | "over-target";

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

const CONFIDENCE_RANK: Readonly<Record<NarrationGameConfidenceV1, number>> = {
  weak: 1,
  plausible: 2,
  strong: 3,
  distinctive: 4,
};
const CONFIDENCE_TIERS: ReadonlySet<string> = new Set(
  Object.keys(CONFIDENCE_RANK),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isConfidenceTier(
  value: unknown,
): value is NarrationGameConfidenceV1 {
  return typeof value === "string" && CONFIDENCE_TIERS.has(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function validateExpectation(
  value: unknown,
  request: NarrationGameRankingRequestV1,
): asserts value is NarrationGameRankingEvaluationExpectationV1 {
  const result = retrieveNarrationGameCandidatesV1(request);
  if (result.state !== "candidate-set" || result.truncated) {
    throw new Error(
      "Narration game-ranking expectation request is not prompt eligible",
    );
  }

  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "expectedDisposition",
      "expectedSelectedSystemId",
      "targetTiers",
      "version",
    ]) ||
    value.version !== 1 ||
    (value.expectedDisposition !== "select" &&
      value.expectedDisposition !== "abstain") ||
    (value.expectedSelectedSystemId !== null &&
      typeof value.expectedSelectedSystemId !== "string") ||
    !isUnknownArray(value.targetTiers)
  ) {
    throw new Error("Narration game-ranking expectation is invalid");
  }

  const candidateIds = result.candidates.map(({ systemId }) => systemId);
  if (value.targetTiers.length !== candidateIds.length) {
    throw new Error(
      "Narration game-ranking expectation candidates are noncanonical",
    );
  }
  const targetTiers: Array<{
    systemId: string;
    targetTier: NarrationGameConfidenceV1;
  }> = [];
  for (const target of value.targetTiers) {
    if (
      !isRecord(target) ||
      !hasExactKeys(target, ["systemId", "targetTier"]) ||
      typeof target.systemId !== "string" ||
      !isConfidenceTier(target.targetTier)
    ) {
      throw new Error("Narration game-ranking expectation tier is invalid");
    }
    targetTiers.push({
      systemId: target.systemId,
      targetTier: target.targetTier,
    });
  }
  if (
    targetTiers.some(
      ({ systemId }, index) => systemId !== candidateIds[index],
    )
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
    return;
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
  value: unknown,
  request: NarrationGameRankingRequestV1,
  expectation: NarrationGameRankingEvaluationExpectationV1,
): NarrationGameRankingScoreV1 {
  validateExpectation(expectation, request);
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
      response.disposition === expectation.expectedDisposition &&
      response.selectedSystemId === expectation.expectedSelectedSystemId
        ? "correct"
        : "incorrect",
    tierAssessments: expectation.targetTiers.map(
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
