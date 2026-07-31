import {
  retrieveNarrationGameCandidatesV1,
  retrieveNarrationGameCandidatesV2,
  type NarrationGameCandidateRequestV2,
  type NarrationGameCandidateV1,
} from "./narration-game-candidates";
import type { NarrationGameConfidenceV1 } from "./narration-game-catalog";
import type { NarrationGameRankingRequestV1 } from "./narration-game-ranking";

export type NarrationGameRankingResponseAbstentionReasonV1 =
  | "insufficient-distinguishing-evidence"
  | "confusable-mechanics"
  | "unsupported-inference-required";

export type NarrationGameRankingEvidenceCitationV1 = Readonly<{
  claimId: string;
  sourceIds: readonly string[];
}>;

export type NarrationGameRankingAssessmentV1 = Readonly<{
  confidenceTier: NarrationGameConfidenceV1;
  evidenceCitations: readonly NarrationGameRankingEvidenceCitationV1[];
}>;

export type NarrationGameRankingResponseV1 = Readonly<{
  version: 1;
  disposition: "select" | "abstain";
  selectedSystemId: string | null;
  assessments: Readonly<Record<string, NarrationGameRankingAssessmentV1>>;
  abstentionReason: NarrationGameRankingResponseAbstentionReasonV1 | null;
}>;

export type NarrationGameRankingResponseRejectionReasonV1 =
  | "ranking-not-eligible"
  | "invalid-schema"
  | "candidate-assessments-mismatch"
  | "confidence-exceeds-bound"
  | "unsupported-citation"
  | "duplicate-citation"
  | "citation-does-not-support-confidence"
  | "invalid-decision"
  | "weak-selection";

export type NarrationGameRankingResponseValidationV1 =
  | Readonly<{
      status: "accepted";
      value: NarrationGameRankingResponseV1;
    }>
  | Readonly<{
      status: "rejected";
      reason: NarrationGameRankingResponseRejectionReasonV1;
    }>;

type AssessmentValidation =
  | Readonly<{
      status: "accepted";
      value: NarrationGameRankingAssessmentV1;
    }>
  | Extract<NarrationGameRankingResponseValidationV1, { status: "rejected" }>;

const CONFIDENCE_RANK: Readonly<Record<NarrationGameConfidenceV1, number>> = {
  weak: 1,
  plausible: 2,
  strong: 3,
  distinctive: 4,
};
const CONFIDENCE_TIERS: ReadonlySet<string> = new Set(
  Object.keys(CONFIDENCE_RANK),
);
const ABSTENTION_REASONS: ReadonlySet<string> = new Set([
  "insufficient-distinguishing-evidence",
  "confusable-mechanics",
  "unsupported-inference-required",
]);
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

function isAbstentionReason(
  value: unknown,
): value is NarrationGameRankingResponseAbstentionReasonV1 {
  return typeof value === "string" && ABSTENTION_REASONS.has(value);
}

function candidateConfidenceBound(
  candidate: NarrationGameCandidateV1,
): NarrationGameConfidenceV1 {
  return CONFIDENCE_RANK[candidate.evidenceTier] <=
    CONFIDENCE_RANK[candidate.confidenceCeiling]
    ? candidate.evidenceTier
    : candidate.confidenceCeiling;
}

function reject(
  reason: NarrationGameRankingResponseRejectionReasonV1,
): Extract<NarrationGameRankingResponseValidationV1, { status: "rejected" }> {
  return { status: "rejected", reason };
}

function validateCitation(
  value: unknown,
  candidate: NarrationGameCandidateV1,
):
  | Readonly<{
      status: "accepted";
      value: NarrationGameRankingEvidenceCitationV1;
      evidenceTier: NarrationGameConfidenceV1;
    }>
  | Extract<NarrationGameRankingResponseValidationV1, { status: "rejected" }> {
  const maximumSourceIds = Math.max(
    ...candidate.evidence.map(({ sourceIds }) => sourceIds.length),
  );
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["claimId", "sourceIds"]) ||
    typeof value.claimId !== "string" ||
    !Array.isArray(value.sourceIds) ||
    value.sourceIds.length < 1 ||
    value.sourceIds.length > maximumSourceIds ||
    !value.sourceIds.every((sourceId) => typeof sourceId === "string")
  ) {
    return reject("invalid-schema");
  }

  if (new Set(value.sourceIds).size !== value.sourceIds.length) {
    return reject("duplicate-citation");
  }

  const evidence = candidate.evidence.find(
    ({ claim }) => claim === value.claimId,
  );
  if (
    evidence === undefined ||
    value.sourceIds.length > evidence.sourceIds.length ||
    value.sourceIds.some((sourceId) => !evidence.sourceIds.includes(sourceId))
  ) {
    return reject("unsupported-citation");
  }

  return {
    status: "accepted",
    value: { claimId: value.claimId, sourceIds: value.sourceIds },
    evidenceTier: evidence.evidenceTier,
  };
}

function validateAssessment(
  value: unknown,
  candidate: NarrationGameCandidateV1,
): AssessmentValidation {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["confidenceTier", "evidenceCitations"]) ||
    !isConfidenceTier(value.confidenceTier) ||
    !Array.isArray(value.evidenceCitations) ||
    value.evidenceCitations.length < 1 ||
    value.evidenceCitations.length > candidate.evidence.length
  ) {
    return reject("invalid-schema");
  }

  const confidenceTier = value.confidenceTier;
  if (
    CONFIDENCE_RANK[confidenceTier] >
    CONFIDENCE_RANK[candidateConfidenceBound(candidate)]
  ) {
    return reject("confidence-exceeds-bound");
  }

  const citations: NarrationGameRankingEvidenceCitationV1[] = [];
  const citationTiers: NarrationGameConfidenceV1[] = [];
  const seenClaims = new Set<string>();
  for (const citation of value.evidenceCitations) {
    if (
      isRecord(citation) &&
      typeof citation.claimId === "string" &&
      seenClaims.has(citation.claimId)
    ) {
      return reject("duplicate-citation");
    }
    const validation = validateCitation(citation, candidate);
    if (validation.status === "rejected") return validation;
    seenClaims.add(validation.value.claimId);
    citations.push(validation.value);
    citationTiers.push(validation.evidenceTier);
  }

  if (
    !citationTiers.some(
      (tier) =>
        CONFIDENCE_RANK[tier] >= CONFIDENCE_RANK[confidenceTier],
    )
  ) {
    return reject("citation-does-not-support-confidence");
  }

  return {
    status: "accepted",
    value: {
      confidenceTier,
      evidenceCitations: citations,
    },
  };
}

function hasCanonicalAssessmentKeys(
  value: Record<string, unknown>,
  candidates: readonly NarrationGameCandidateV1[],
): boolean {
  const expected = candidates.map(({ systemId }) => systemId).sort();
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((systemId, index) => systemId === expected[index])
  );
}

export function validateNarrationGameRankingResponseV1(
  value: unknown,
  request: NarrationGameRankingRequestV1 | NarrationGameCandidateRequestV2,
): NarrationGameRankingResponseValidationV1 {
  const candidateResult = request.version === 2
    ? retrieveNarrationGameCandidatesV2(request)
    : retrieveNarrationGameCandidatesV1(request);
  if (
    candidateResult.state !== "candidate-set" ||
    candidateResult.truncated
  ) {
    return reject("ranking-not-eligible");
  }
  const candidates = candidateResult.candidates;

  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "abstentionReason",
      "assessments",
      "disposition",
      "selectedSystemId",
      "version",
    ]) ||
    value.version !== 1 ||
    (value.disposition !== "select" && value.disposition !== "abstain") ||
    (value.selectedSystemId !== null &&
      typeof value.selectedSystemId !== "string") ||
    (value.abstentionReason !== null &&
      !isAbstentionReason(value.abstentionReason)) ||
    !isRecord(value.assessments)
  ) {
    return reject("invalid-schema");
  }

  if (!hasCanonicalAssessmentKeys(value.assessments, candidates)) {
    return reject("candidate-assessments-mismatch");
  }

  const assessments: Record<string, NarrationGameRankingAssessmentV1> = {};
  for (const candidate of candidates) {
    const validation = validateAssessment(
      value.assessments[candidate.systemId],
      candidate,
    );
    if (validation.status === "rejected") return validation;
    assessments[candidate.systemId] = validation.value;
  }

  if (value.disposition === "abstain") {
    if (value.selectedSystemId !== null || value.abstentionReason === null) {
      return reject("invalid-decision");
    }
  } else {
    if (value.selectedSystemId === null || value.abstentionReason !== null) {
      return reject("invalid-decision");
    }
    const selectedCandidate = candidates.find(
      ({ systemId }) => systemId === value.selectedSystemId,
    );
    if (selectedCandidate === undefined) {
      return reject("invalid-decision");
    }
    const selectedAssessment = assessments[value.selectedSystemId];
    if (
      CONFIDENCE_RANK[candidateConfidenceBound(selectedCandidate)] <
        CONFIDENCE_RANK.plausible ||
      selectedAssessment === undefined ||
      CONFIDENCE_RANK[selectedAssessment.confidenceTier] <
        CONFIDENCE_RANK.plausible
    ) {
      return reject("weak-selection");
    }
  }

  return {
    status: "accepted",
    value: {
      version: 1,
      disposition: value.disposition,
      selectedSystemId: value.selectedSystemId,
      assessments,
      abstentionReason: value.abstentionReason,
    },
  };
}
