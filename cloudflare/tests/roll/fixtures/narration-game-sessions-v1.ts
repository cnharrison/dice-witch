import type {
  NarrationGameCandidateResultV1,
  NarrationGameConfidenceV1,
  NarrationGameFeatureRequestV1,
} from "../../../packages/roll-domain/src";

export type NarrationGameSessionFixtureV1 = Readonly<{
  id: string;
  description: string;
  request: NarrationGameFeatureRequestV1;
  notationIsValid?: false;
  expected: Readonly<{
    state: NarrationGameCandidateResultV1["state"];
    candidateIds: readonly string[];
    topEvidenceTier?: NarrationGameConfidenceV1;
  }>;
}>;

export const NARRATION_GAME_SESSION_FIXTURE_PROVENANCE_V1 = {
  version: 1,
  status: "source-backed-synthetic-human-reviewed",
  containsProductionData: false,
  containsIdentifiers: false,
  containsExactResults: false,
  humanApproved: true,
} as const;

export const NARRATION_GAME_SESSION_FIXTURES_V1 = [
  {
    id: "abstain-unsupported-common-pool",
    description: "A common unselected 2d6 roll supports no catalogue fingerprint.",
    request: {
      version: 1,
      rolls: [{ notation: ["2d6"], repetitions: 4 }],
    },
    expected: { state: "insufficient-evidence", candidateIds: [] },
  },
  {
    id: "abstain-malformed-notation",
    description: "Malformed notation cannot manufacture a mechanics fingerprint.",
    request: {
      version: 1,
      rolls: [{ notation: ["2d6+"], repetitions: 6 }],
    },
    notationIsValid: false,
    expected: { state: "insufficient-evidence", candidateIds: [] },
  },
  {
    id: "ambiguous-generic-d20",
    description: "Repeated d20 checks remain shared weak evidence.",
    request: {
      version: 1,
      rolls: [{ notation: ["d20+5"], repetitions: 12 }],
    },
    expected: {
      state: "weak-only",
      candidateIds: [
        "dungeons-and-dragons-5e-2014",
        "pathfinder-2e-remaster",
      ],
      topEvidenceTier: "weak",
    },
  },
  {
    id: "ambiguous-generic-percentile",
    description: "Repeated plain percentile rolls remain weak evidence.",
    request: {
      version: 1,
      rolls: [{ notation: ["d100"], repetitions: 9 }],
    },
    expected: {
      state: "weak-only",
      candidateIds: [
        "basic-roleplaying-universal-game-engine-2023",
        "call-of-cthulhu-7e",
        "mothership-1e",
      ],
      topEvidenceTier: "weak",
    },
  },
  {
    id: "candidate-dnd-ability-generation",
    description: "Six four-d6 keep-highest-three rolls support the sourced workflow.",
    request: {
      version: 1,
      rolls: [{ notation: ["4d6dl1"], repetitions: 6 }],
    },
    expected: {
      state: "candidate-set",
      candidateIds: ["dungeons-and-dragons-5e-2014"],
      topEvidenceTier: "strong",
    },
  },
  {
    id: "candidate-fate-dice",
    description: "Four Fate dice support the Fate family while retaining confusables.",
    request: {
      version: 1,
      rolls: [{ notation: ["4dF+2"], repetitions: 3 }],
    },
    expected: {
      state: "candidate-set",
      candidateIds: ["fate-core-family"],
      topEvidenceTier: "strong",
    },
  },
  {
    id: "candidate-fitd-highest-die",
    description: "Repeated selected d6 pools support a highest-die d6-pool family.",
    request: {
      version: 1,
      rolls: [{ notation: ["3d6kh1"], repetitions: 2 }],
    },
    expected: {
      state: "candidate-set",
      candidateIds: ["forged-in-the-dark-family"],
      topEvidenceTier: "strong",
    },
  },
  {
    id: "abstain-fitd-below-minimum",
    description: "One selected d6 pool is below the catalogue evidence minimum.",
    request: {
      version: 1,
      rolls: [{ notation: ["3d6kh1"], repetitions: 1 }],
    },
    expected: { state: "insufficient-evidence", candidateIds: [] },
  },
  {
    id: "candidate-percentile-roll-under-confusables",
    description: "Repeated percentile roll-under checks preserve plausible confusable candidates.",
    request: {
      version: 1,
      rolls: [{ notation: ["d100<=55"], repetitions: 2 }],
    },
    expected: {
      state: "candidate-set",
      candidateIds: [
        "basic-roleplaying-universal-game-engine-2023",
        "call-of-cthulhu-7e",
        "mothership-1e",
      ],
      topEvidenceTier: "plausible",
    },
  },
  {
    id: "candidate-savage-worlds-trait-wild-pair",
    description: "Repeated exploding trait and Wild Die pairs support Savage Worlds.",
    request: {
      version: 1,
      rolls: [{ notation: ["{d8!,d6!}kh1"], repetitions: 2 }],
    },
    expected: {
      state: "candidate-set",
      candidateIds: ["savage-worlds"],
      topEvidenceTier: "strong",
    },
  },
  {
    id: "candidate-savage-worlds-open-ended-step-die",
    description: "Repeated exploding step dice provide plausible but not strong evidence.",
    request: {
      version: 1,
      rolls: [{ notation: ["d8!"], repetitions: 2 }],
    },
    expected: {
      state: "candidate-set",
      candidateIds: ["savage-worlds"],
      topEvidenceTier: "plausible",
    },
  },
  {
    id: "conflict-dnd-and-fate-strong",
    description: "Two different strong workflows in one window require abstention.",
    request: {
      version: 1,
      rolls: [
        { notation: ["4d6kh3"], repetitions: 6 },
        { notation: ["4dF"], repetitions: 2 },
      ],
    },
    expected: {
      state: "conflicting-evidence",
      candidateIds: ["dungeons-and-dragons-5e-2014", "fate-core-family"],
      topEvidenceTier: "strong",
    },
  },
  {
    id: "candidate-fate-with-weak-d20-alternatives",
    description: "One strong workflow outranks unrelated weak generic alternatives.",
    request: {
      version: 1,
      rolls: [
        { notation: ["4dF"], repetitions: 2 },
        { notation: ["d20+4"], repetitions: 4 },
      ],
    },
    expected: {
      state: "candidate-set",
      candidateIds: [
        "fate-core-family",
        "dungeons-and-dragons-5e-2014",
        "pathfinder-2e-remaster",
      ],
      topEvidenceTier: "strong",
    },
  },
  {
    id: "conflict-fitd-and-savage-worlds-strong",
    description: "Concurrent strong d6-pool families require mixed-system abstention.",
    request: {
      version: 1,
      rolls: [
        { notation: ["3d6kh1"], repetitions: 2 },
        { notation: ["{d10!,d6!}kh1"], repetitions: 2 },
      ],
    },
    expected: {
      state: "conflicting-evidence",
      candidateIds: ["savage-worlds", "forged-in-the-dark-family"],
      topEvidenceTier: "strong",
    },
  },
] as const satisfies readonly NarrationGameSessionFixtureV1[];
