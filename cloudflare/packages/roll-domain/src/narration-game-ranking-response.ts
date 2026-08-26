import * as z from "zod";
import {
  retrieveNarrationGameCandidatesV1,
  retrieveNarrationGameCandidatesV2,
  retrieveNarrationGameCandidatesV3,
  type NarrationGameCandidateRequestV2,
  type NarrationGameCandidateRequestV3,
  type NarrationGameCandidateResultV1,
  type NarrationGameCandidateV1,
} from "./narration-game-candidates";
import {
  NARRATION_GAME_CONFIDENCES_V1,
  type NarrationGameConfidenceV1,
} from "./narration-game-catalog";
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

const CONFIDENCE_RANK = {
  weak: 1,
  plausible: 2,
  strong: 3,
  distinctive: 4,
} as const satisfies Readonly<Record<NarrationGameConfidenceV1, number>>;
const ABSTENTION_REASONS = [
  "insufficient-distinguishing-evidence",
  "confusable-mechanics",
  "unsupported-inference-required",
] as const satisfies readonly NarrationGameRankingResponseAbstentionReasonV1[];

const NarrationGameRankingCitationSchemaV1 = z.strictObject({
  claimId: z.string(),
  sourceIds: z.array(z.string()),
});
const NarrationGameRankingAssessmentSchemaV1 = z.strictObject({
  confidenceTier: z.enum(NARRATION_GAME_CONFIDENCES_V1),
  evidenceCitations: z.array(NarrationGameRankingCitationSchemaV1),
});
const NarrationGameRankingAssessmentsSchemaV1 = z.record(
  z.string(),
  NarrationGameRankingAssessmentSchemaV1,
);
const NarrationGameRankingProviderResponseInputSchemaV1 = z.unknown();
const NarrationGameRankingResponseSchemaV1 = z.strictObject({
  version: z.literal(1),
  disposition: z.enum(["select", "abstain"]),
  selectedSystemId: z.string().nullable(),
  assessments: NarrationGameRankingAssessmentsSchemaV1,
  abstentionReason: z.enum(ABSTENTION_REASONS).nullable(),
});

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
  citation: z.output<typeof NarrationGameRankingCitationSchemaV1>,
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
    citation.sourceIds.length < 1 ||
    citation.sourceIds.length > maximumSourceIds
  ) {
    return reject("invalid-schema");
  }

  if (new Set(citation.sourceIds).size !== citation.sourceIds.length) {
    return reject("duplicate-citation");
  }

  const evidence = candidate.evidence.find(
    ({ claim }) => claim === citation.claimId,
  );
  if (
    evidence === undefined ||
    citation.sourceIds.length > evidence.sourceIds.length ||
    citation.sourceIds.some((sourceId) => !evidence.sourceIds.includes(sourceId))
  ) {
    return reject("unsupported-citation");
  }

  return {
    status: "accepted",
    value: { claimId: citation.claimId, sourceIds: citation.sourceIds },
    evidenceTier: evidence.evidenceTier,
  };
}

function validateAssessment(
  assessment: z.output<typeof NarrationGameRankingAssessmentSchemaV1>,
  candidate: NarrationGameCandidateV1,
): AssessmentValidation {
  if (
    assessment.evidenceCitations.length < 1 ||
    assessment.evidenceCitations.length > candidate.evidence.length
  ) {
    return reject("invalid-schema");
  }

  const confidenceTier = assessment.confidenceTier;
  if (
    CONFIDENCE_RANK[confidenceTier] >
    CONFIDENCE_RANK[candidateConfidenceBound(candidate)]
  ) {
    return reject("confidence-exceeds-bound");
  }

  const citations: NarrationGameRankingEvidenceCitationV1[] = [];
  const citationTiers: NarrationGameConfidenceV1[] = [];
  const seenClaims = new Set<string>();
  for (const citation of assessment.evidenceCitations) {
    if (seenClaims.has(citation.claimId)) {
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
  assessments: z.output<typeof NarrationGameRankingAssessmentsSchemaV1>,
  candidates: readonly NarrationGameCandidateV1[],
): boolean {
  const expected = candidates.map(({ systemId }) => systemId).sort();
  const actual = Object.keys(assessments).sort();
  return (
    actual.length === expected.length &&
    actual.every((systemId, index) => systemId === expected[index])
  );
}

type NarrationGameRankingValidationRequest =
  | NarrationGameRankingRequestV1
  | NarrationGameCandidateRequestV2
  | NarrationGameCandidateRequestV3;

function retrieveValidationCandidates(
  request: NarrationGameRankingValidationRequest,
): NarrationGameCandidateResultV1 {
  if (request.version === 3) {
    return retrieveNarrationGameCandidatesV3(request);
  }
  if (request.version === 2) {
    return retrieveNarrationGameCandidatesV2(request);
  }
  return retrieveNarrationGameCandidatesV1(request);
}

export function validateNarrationGameRankingResponseV1(
  value: z.input<typeof NarrationGameRankingProviderResponseInputSchemaV1>,
  request: NarrationGameRankingValidationRequest,
): NarrationGameRankingResponseValidationV1 {
  const candidateResult = retrieveValidationCandidates(request);
  if (
    candidateResult.state !== "candidate-set" ||
    candidateResult.truncated
  ) {
    return reject("ranking-not-eligible");
  }
  const candidates = candidateResult.candidates;

  const providerValue =
    NarrationGameRankingProviderResponseInputSchemaV1.parse(value);
  const responseResult = NarrationGameRankingResponseSchemaV1.safeParse(
    providerValue,
  );
  if (!responseResult.success) {
    return reject("invalid-schema");
  }
  const response = responseResult.data;

  if (!hasCanonicalAssessmentKeys(response.assessments, candidates)) {
    return reject("candidate-assessments-mismatch");
  }

  const assessments: Record<string, NarrationGameRankingAssessmentV1> = {};
  for (const candidate of candidates) {
    const assessment = response.assessments[candidate.systemId];
    if (assessment === undefined) {
      return reject("candidate-assessments-mismatch");
    }
    const validation = validateAssessment(assessment, candidate);
    if (validation.status === "rejected") return validation;
    assessments[candidate.systemId] = validation.value;
  }

  if (response.disposition === "abstain") {
    if (response.selectedSystemId !== null || response.abstentionReason === null) {
      return reject("invalid-decision");
    }
  } else {
    if (response.selectedSystemId === null || response.abstentionReason !== null) {
      return reject("invalid-decision");
    }
    const selectedCandidate = candidates.find(
      ({ systemId }) => systemId === response.selectedSystemId,
    );
    if (selectedCandidate === undefined) {
      return reject("invalid-decision");
    }
    const selectedAssessment = assessments[response.selectedSystemId];
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
      disposition: response.disposition,
      selectedSystemId: response.selectedSystemId,
      assessments,
      abstentionReason: response.abstentionReason,
    },
  };
}
