import { describe, expect, it } from "vitest";
import {
  scoreNarrationGameRankingResponseV1,
  summarizeNarrationGameRankingScoresV1,
  validateNarrationGameRankingResponseV1,
  type NarrationGameRankingEvaluationExpectationV1,
  type NarrationGameRankingRequestV1,
  type NarrationGameRankingResponseV1,
} from "../../packages/roll-domain/src";

const DND_REQUEST = {
  version: 1,
  features: [{ kind: "four-d6-keep-highest-three", occurrences: 6 }],
} as const satisfies NarrationGameRankingRequestV1;

const PERCENTILE_REQUEST = {
  version: 1,
  features: [
    { kind: "single-percentile-roll", occurrences: 2 },
    { kind: "percentile-roll-under-threshold", occurrences: 2 },
  ],
} as const satisfies NarrationGameRankingRequestV1;

const FATE_WITH_WEAK_ALTERNATIVES_REQUEST = {
  version: 1,
  features: [
    { kind: "four-fate-dice", occurrences: 2 },
    { kind: "single-d20-plus-modifier", occurrences: 4 },
  ],
} as const satisfies NarrationGameRankingRequestV1;

const DND_RESPONSE = {
  version: 1,
  disposition: "select",
  selectedSystemId: "dungeons-and-dragons-5e-2014",
  assessments: {
    "dungeons-and-dragons-5e-2014": {
      confidenceTier: "strong",
      evidenceCitations: [
        {
          claimId: "ability-score-generation-workflow",
          sourceIds: ["dnd-5e-2014-basic-rules-ability-scores"],
        },
      ],
    },
  },
  abstentionReason: null,
} as const satisfies NarrationGameRankingResponseV1;

const PERCENTILE_ASSESSMENTS = {
  "basic-roleplaying-universal-game-engine-2023": {
    confidenceTier: "plausible",
    evidenceCitations: [
      {
        claimId: "percentile-roll-under-procedure",
        sourceIds: ["basic-roleplaying-universal-game-engine-2023"],
      },
    ],
  },
  "call-of-cthulhu-7e": {
    confidenceTier: "plausible",
    evidenceCitations: [
      {
        claimId: "percentile-roll-under-procedure",
        sourceIds: ["call-of-cthulhu-game-system"],
      },
    ],
  },
  "mothership-1e": {
    confidenceTier: "plausible",
    evidenceCitations: [
      {
        claimId: "percentile-roll-under-procedure",
        sourceIds: ["mothership-1e-player-survival-guide"],
      },
    ],
  },
} as const;

const PERCENTILE_ABSTENTION_RESPONSE = {
  version: 1,
  disposition: "abstain",
  selectedSystemId: null,
  assessments: PERCENTILE_ASSESSMENTS,
  abstentionReason: "confusable-mechanics",
} as const satisfies NarrationGameRankingResponseV1;

const DND_EXPECTATION = {
  version: 1,
  expectedDisposition: "select",
  expectedSelectedSystemId: "dungeons-and-dragons-5e-2014",
  targetTiers: [
    {
      systemId: "dungeons-and-dragons-5e-2014",
      targetTier: "strong",
    },
  ],
} as const satisfies NarrationGameRankingEvaluationExpectationV1;

const PERCENTILE_EXPECTATION = {
  version: 1,
  expectedDisposition: "abstain",
  expectedSelectedSystemId: null,
  targetTiers: [
    {
      systemId: "basic-roleplaying-universal-game-engine-2023",
      targetTier: "plausible",
    },
    { systemId: "call-of-cthulhu-7e", targetTier: "plausible" },
    { systemId: "mothership-1e", targetTier: "plausible" },
  ],
} as const satisfies NarrationGameRankingEvaluationExpectationV1;

describe("validateNarrationGameRankingResponseV1", () => {
  it("accepts and canonicalizes a fully grounded bounded selection", () => {
    expect(
      validateNarrationGameRankingResponseV1(DND_RESPONSE, DND_REQUEST),
    ).toEqual({ status: "accepted", value: DND_RESPONSE });
  });

  it("accepts a grounded abstention that preserves every confusable candidate", () => {
    expect(
      validateNarrationGameRankingResponseV1(
        PERCENTILE_ABSTENTION_RESPONSE,
        PERCENTILE_REQUEST,
      ),
    ).toEqual({
      status: "accepted",
      value: PERCENTILE_ABSTENTION_RESPONSE,
    });
  });

  it("rejects malformed response shape and incomplete candidate assessments", () => {
    expect(
      validateNarrationGameRankingResponseV1(
        { ...DND_RESPONSE, explanation: "Trust me" },
        DND_REQUEST,
      ),
    ).toEqual({ status: "rejected", reason: "invalid-schema" });

    expect(
      validateNarrationGameRankingResponseV1(
        {
          ...PERCENTILE_ABSTENTION_RESPONSE,
          assessments: {
            "call-of-cthulhu-7e":
              PERCENTILE_ASSESSMENTS["call-of-cthulhu-7e"],
          },
        },
        PERCENTILE_REQUEST,
      ),
    ).toEqual({
      status: "rejected",
      reason: "candidate-assessments-mismatch",
    });
  });

  it("rejects confidence above deterministic bounds or cited evidence", () => {
    expect(
      validateNarrationGameRankingResponseV1(
        {
          ...DND_RESPONSE,
          assessments: {
            "dungeons-and-dragons-5e-2014": {
              ...DND_RESPONSE.assessments["dungeons-and-dragons-5e-2014"],
              confidenceTier: "distinctive",
            },
          },
        },
        DND_REQUEST,
      ),
    ).toEqual({
      status: "rejected",
      reason: "confidence-exceeds-bound",
    });

    expect(
      validateNarrationGameRankingResponseV1(
        {
          ...PERCENTILE_ABSTENTION_RESPONSE,
          assessments: {
            ...PERCENTILE_ASSESSMENTS,
            "call-of-cthulhu-7e": {
              confidenceTier: "plausible",
              evidenceCitations: [
                {
                  claimId: "ordinary-percentile-check",
                  sourceIds: ["call-of-cthulhu-game-system"],
                },
              ],
            },
          },
        },
        PERCENTILE_REQUEST,
      ),
    ).toEqual({
      status: "rejected",
      reason: "citation-does-not-support-confidence",
    });
  });

  it("rejects invented, cross-candidate, or duplicate citations", () => {
    const invalidCitations = [
      {
        evidenceCitations: [
          {
            claimId: "invented-claim",
            sourceIds: ["dnd-5e-2014-basic-rules-ability-scores"],
          },
        ],
        reason: "unsupported-citation",
      },
      {
        evidenceCitations: [
          {
            claimId: "ability-score-generation-workflow",
            sourceIds: ["fate-core-taking-action"],
          },
        ],
        reason: "unsupported-citation",
      },
      {
        evidenceCitations: [
          {
            claimId: "ability-score-generation-workflow",
            sourceIds: ["dnd-5e-2014-basic-rules-ability-scores"],
          },
          {
            claimId: "ability-score-generation-workflow",
            sourceIds: ["dnd-5e-2014-basic-rules-ability-scores"],
          },
        ],
        reason: "invalid-schema",
      },
      {
        evidenceCitations: [
          {
            claimId: "ability-score-generation-workflow",
            sourceIds: [
              "dnd-5e-2014-basic-rules-ability-scores",
              "dnd-5e-2014-basic-rules-ability-scores",
            ],
          },
        ],
        reason: "invalid-schema",
      },
    ] as const;

    for (const { evidenceCitations, reason } of invalidCitations) {
      const validation = validateNarrationGameRankingResponseV1(
        {
          ...DND_RESPONSE,
          assessments: {
            "dungeons-and-dragons-5e-2014": {
              confidenceTier: "strong",
              evidenceCitations,
            },
          },
        },
        DND_REQUEST,
      );
      expect(validation).toEqual({ status: "rejected", reason });
    }

    expect(
      validateNarrationGameRankingResponseV1(
        {
          ...PERCENTILE_ABSTENTION_RESPONSE,
          assessments: {
            ...PERCENTILE_ASSESSMENTS,
            "call-of-cthulhu-7e": {
              confidenceTier: "weak",
              evidenceCitations: [
                {
                  claimId: "ordinary-percentile-check",
                  sourceIds: ["call-of-cthulhu-game-system"],
                },
                {
                  claimId: "ordinary-percentile-check",
                  sourceIds: ["call-of-cthulhu-game-system"],
                },
              ],
            },
          },
        },
        PERCENTILE_REQUEST,
      ),
    ).toEqual({ status: "rejected", reason: "duplicate-citation" });
  });

  it("rejects incoherent decisions, weak candidates, and weak selected assessments", () => {
    expect(
      validateNarrationGameRankingResponseV1(
        { ...DND_RESPONSE, abstentionReason: "confusable-mechanics" },
        DND_REQUEST,
      ),
    ).toEqual({ status: "rejected", reason: "invalid-decision" });

    const weakAlternativeAssessments = {
      "fate-core-family": {
        confidenceTier: "strong",
        evidenceCitations: [
          {
            claimId: "four-fate-dice-roll",
            sourceIds: ["fate-core-taking-action"],
          },
        ],
      },
      "dungeons-and-dragons-5e-2014": {
        confidenceTier: "weak",
        evidenceCitations: [
          {
            claimId: "ordinary-d20-check",
            sourceIds: ["dnd-5e-2014-basic-rules-ability-checks"],
          },
        ],
      },
      "pathfinder-2e-remaster": {
        confidenceTier: "weak",
        evidenceCitations: [
          {
            claimId: "ordinary-d20-check",
            sourceIds: ["pathfinder-2e-player-core-checks"],
          },
        ],
      },
    } as const;
    expect(
      validateNarrationGameRankingResponseV1(
        {
          version: 1,
          disposition: "select",
          selectedSystemId: "dungeons-and-dragons-5e-2014",
          assessments: weakAlternativeAssessments,
          abstentionReason: null,
        },
        FATE_WITH_WEAK_ALTERNATIVES_REQUEST,
      ),
    ).toEqual({ status: "rejected", reason: "weak-selection" });

    expect(
      validateNarrationGameRankingResponseV1(
        {
          ...DND_RESPONSE,
          assessments: {
            "dungeons-and-dragons-5e-2014": {
              ...DND_RESPONSE.assessments["dungeons-and-dragons-5e-2014"],
              confidenceTier: "weak",
            },
          },
        },
        DND_REQUEST,
      ),
    ).toEqual({ status: "rejected", reason: "weak-selection" });
  });

  it("rejects responses for sessions that deterministically cannot be prompted", () => {
    expect(
      validateNarrationGameRankingResponseV1(DND_RESPONSE, {
        version: 1,
        features: [{ kind: "single-d20-plus-modifier", occurrences: 12 }],
      }),
    ).toEqual({ status: "rejected", reason: "ranking-not-eligible" });
  });
});

describe("scoreNarrationGameRankingResponseV1", () => {
  it("scores decision correctness and qualitative tier alignment without probabilities", () => {
    expect(
      scoreNarrationGameRankingResponseV1(
        DND_RESPONSE,
        DND_REQUEST,
        DND_EXPECTATION,
      ),
    ).toEqual({
      version: 1,
      status: "scored",
      decision: "correct",
      tierAssessments: [
        {
          systemId: "dungeons-and-dragons-5e-2014",
          targetTier: "strong",
          actualTier: "strong",
          alignment: "aligned",
        },
      ],
      responseRejectionReason: null,
    });

    const conservativeResponse = {
      ...DND_RESPONSE,
      assessments: {
        "dungeons-and-dragons-5e-2014": {
          ...DND_RESPONSE.assessments["dungeons-and-dragons-5e-2014"],
          confidenceTier: "plausible",
        },
      },
    } as const;
    expect(
      scoreNarrationGameRankingResponseV1(
        conservativeResponse,
        DND_REQUEST,
        DND_EXPECTATION,
      ),
    ).toMatchObject({
      status: "scored",
      decision: "correct",
      tierAssessments: [{ alignment: "under-target" }],
    });
  });

  it("keeps structurally valid but semantically wrong selections distinct from invalid output", () => {
    const wrongSelection = {
      ...PERCENTILE_ABSTENTION_RESPONSE,
      disposition: "select",
      selectedSystemId: "call-of-cthulhu-7e",
      abstentionReason: null,
    } as const;
    const scoredWrong = scoreNarrationGameRankingResponseV1(
      wrongSelection,
      PERCENTILE_REQUEST,
      PERCENTILE_EXPECTATION,
    );
    const scoredInvalid = scoreNarrationGameRankingResponseV1(
      { ...wrongSelection, invented: true },
      PERCENTILE_REQUEST,
      PERCENTILE_EXPECTATION,
    );

    expect(scoredWrong).toMatchObject({
      status: "scored",
      decision: "incorrect",
      responseRejectionReason: null,
    });
    expect(scoredInvalid).toEqual({
      version: 1,
      status: "invalid-response",
      decision: "not-scored",
      tierAssessments: [],
      responseRejectionReason: "invalid-schema",
    });
    expect(
      summarizeNarrationGameRankingScoresV1([scoredWrong, scoredInvalid]),
    ).toEqual({
      version: 1,
      totalResponses: 2,
      validResponses: 1,
      invalidResponses: 1,
      correctDecisions: 0,
      incorrectDecisions: 1,
      tierAssessments: 3,
      tierAlignment: {
        aligned: 3,
        underTarget: 0,
        overTarget: 0,
      },
    });
  });

  it("fails closed when a hidden scoring key does not match the candidate packet", () => {
    expect(() =>
      scoreNarrationGameRankingResponseV1(
        DND_RESPONSE,
        DND_REQUEST,
        {
          ...DND_EXPECTATION,
          targetTiers: [
            { systemId: "invented-system", targetTier: "strong" },
          ],
        },
      ),
    ).toThrow("Narration game-ranking expectation candidates are noncanonical");
  });
});
