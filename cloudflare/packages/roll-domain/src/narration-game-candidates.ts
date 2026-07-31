import {
  NARRATION_GAME_CATALOG_V1,
  type NarrationGameConfidenceV1,
  type NarrationGameFeatureV1,
  type NarrationGameFingerprintV1,
  type NarrationGameSystemV1,
} from "./narration-game-catalog";
import type { NarrationGameFeatureObservationV1 } from "./narration-game-features";

export const MAX_NARRATION_GAME_CANDIDATES_V1 = 3;

export type NarrationGameCandidateRequestV1 = Readonly<{
  version: 1;
  features: readonly NarrationGameFeatureObservationV1[];
}>;

export type NarrationGameCandidateRequestV2 = Readonly<{
  version: 2;
  features: readonly NarrationGameFeatureObservationV1[];
  context: readonly string[];
}>;

export type NarrationGameCandidateContextV3 = Readonly<{
  locationNames: readonly string[];
  rollLabels: readonly string[];
}>;

export type NarrationGameCandidateRequestV3 = Readonly<{
  version: 3;
  features: readonly NarrationGameFeatureObservationV1[];
  context: NarrationGameCandidateContextV3;
}>;

export type NarrationGameCandidateEvidenceV1 = Readonly<{
  claim: string;
  evidenceTier: NarrationGameConfidenceV1;
  sourceIds: readonly string[];
}>;

export type NarrationGameCandidateSourceV1 = Readonly<{
  id: string;
  title: string;
  url: `https://${string}`;
}>;

export type NarrationGameCandidateV1 = Readonly<{
  systemId: string;
  displayName: string;
  evidenceTier: NarrationGameConfidenceV1;
  confidenceCeiling: NarrationGameConfidenceV1;
  evidence: readonly NarrationGameCandidateEvidenceV1[];
  sources: readonly NarrationGameCandidateSourceV1[];
  confusableWith: readonly string[];
  commentaryTopics: readonly string[];
}>;

export type NarrationGameCandidateConflictV1 = Readonly<{
  kind: "multiple-strong-system-workflows";
  disposition: "abstain";
  systemIds: readonly string[];
}>;

export type NarrationGameCandidateResultV1 = Readonly<{
  version: 1;
  state:
    | "insufficient-evidence"
    | "weak-only"
    | "candidate-set"
    | "conflicting-evidence";
  conflict: NarrationGameCandidateConflictV1 | null;
  truncated: boolean;
  candidates: readonly NarrationGameCandidateV1[];
}>;

type RankedCandidate = Readonly<{
  candidate: NarrationGameCandidateV1;
  strongestEvidenceCount: number;
  contextMatched: boolean;
  locationMatched: boolean;
  rollLabelMatched: boolean;
}>;

const CONFIDENCE_RANK: Readonly<Record<NarrationGameConfidenceV1, number>> = {
  weak: 1,
  plausible: 2,
  strong: 3,
  distinctive: 4,
};

const CATALOG_SYSTEMS: readonly NarrationGameSystemV1[] =
  NARRATION_GAME_CATALOG_V1.systems;
const CATALOG_FEATURES = new Set<NarrationGameFeatureV1>(
  CATALOG_SYSTEMS.flatMap(({ fingerprints }) =>
    fingerprints.flatMap(({ features }) => features),
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === fields.length &&
    actual.every((field) => fields.includes(field))
  );
}

function lowerConfidence(
  left: NarrationGameConfidenceV1,
  right: NarrationGameConfidenceV1,
): NarrationGameConfidenceV1 {
  return CONFIDENCE_RANK[left] <= CONFIDENCE_RANK[right] ? left : right;
}

function highestConfidence(
  values: readonly NarrationGameConfidenceV1[],
): NarrationGameConfidenceV1 {
  const first = values[0];
  if (first === undefined) {
    throw new Error("Narration game candidate confidence evidence is empty");
  }
  return values.reduce((highest, value) =>
    CONFIDENCE_RANK[value] > CONFIDENCE_RANK[highest] ? value : highest,
  );
}

function validateFeatures(
  value: unknown,
): readonly NarrationGameFeatureObservationV1[] {
  if (!Array.isArray(value) || value.length > CATALOG_FEATURES.size) {
    throw new Error("Narration game candidate features are invalid");
  }

  const seen = new Set<NarrationGameFeatureV1>();
  return value.map((feature) => {
    if (!isRecord(feature) || !hasExactFields(feature, ["kind", "occurrences"])) {
      throw new Error(
        "Narration game candidate feature contains an unsupported field",
      );
    }
    if (
      typeof feature.kind !== "string" ||
      !CATALOG_FEATURES.has(feature.kind as NarrationGameFeatureV1)
    ) {
      throw new Error("Narration game candidate feature kind is unsupported");
    }
    const kind = feature.kind as NarrationGameFeatureV1;
    if (seen.has(kind)) {
      throw new Error("Narration game candidate features must be unique");
    }
    seen.add(kind);

    if (
      typeof feature.occurrences !== "number" ||
      !Number.isSafeInteger(feature.occurrences) ||
      feature.occurrences < 1
    ) {
      throw new Error(
        "Narration game candidate feature occurrences are invalid",
      );
    }
    return { kind, occurrences: feature.occurrences };
  });
}

function matchesFingerprint(
  fingerprint: NarrationGameFingerprintV1,
  observations: ReadonlyMap<NarrationGameFeatureV1, number>,
): boolean {
  return fingerprint.features.every(
    (feature) =>
      (observations.get(feature) ?? 0) >= fingerprint.minimumOccurrences,
  );
}

function buildCandidate(
  system: NarrationGameSystemV1,
  observations: ReadonlyMap<NarrationGameFeatureV1, number>,
): RankedCandidate | undefined {
  const fingerprints = system.fingerprints.filter((fingerprint) =>
    matchesFingerprint(fingerprint, observations),
  );
  if (fingerprints.length === 0) return undefined;

  const evidence = fingerprints.map(
    ({ claim, confidenceCeiling, evidenceStrength, sourceIds }) => ({
      claim,
      evidenceTier: lowerConfidence(evidenceStrength, confidenceCeiling),
      sourceIds,
    }),
  );
  const evidenceTier = highestConfidence(
    evidence.map(({ evidenceTier: tier }) => tier),
  );
  const confidenceCeiling = highestConfidence(
    fingerprints.map(({ confidenceCeiling: ceiling }) => ceiling),
  );
  const sourceIds = new Set(evidence.flatMap(({ sourceIds: ids }) => ids));
  const matchedTopics = new Set(
    fingerprints.flatMap(({ commentaryTopics }) => commentaryTopics),
  );

  return {
    candidate: {
      systemId: system.id,
      displayName: system.displayName,
      evidenceTier,
      confidenceCeiling,
      evidence,
      sources: system.sources
        .filter(({ id }) => sourceIds.has(id))
        .map(({ id, title, url }) => ({ id, title, url })),
      confusableWith: system.confusableWith,
      commentaryTopics: system.commentaryTopics.filter((topic) =>
        matchedTopics.has(topic),
      ),
    },
    strongestEvidenceCount: evidence.filter(
      ({ evidenceTier: tier }) => tier === evidenceTier,
    ).length,
    contextMatched: false,
    locationMatched: false,
    rollLabelMatched: false,
  };
}

function normalizeContext(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function validateContextTerms(
  value: unknown,
  maximumTerms: number,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > maximumTerms ||
    !value.every(
      (term) =>
        typeof term === "string" && term.length >= 1 && term.length <= 512,
    )
  ) {
    throw new Error("Narration game candidate context is invalid");
  }
  const normalized = value
    .map((term) => normalizeContext(String(term)))
    .filter(Boolean);
  return [...new Set(normalized)];
}

function validateContext(value: unknown): readonly string[] {
  return validateContextTerms(value, 64);
}

export function normalizeNarrationGameCandidateContextV3(
  value: unknown,
): NarrationGameCandidateContextV3 {
  if (
    !isRecord(value) ||
    !hasExactFields(value, ["locationNames", "rollLabels"])
  ) {
    throw new Error("Narration game candidate context is invalid");
  }
  return {
    locationNames: validateContextTerms(value.locationNames, 2),
    rollLabels: validateContextTerms(value.rollLabels, 32),
  };
}

function matchesContextAlias(
  system: NarrationGameSystemV1,
  context: readonly string[],
): boolean {
  const aliases = [system.displayName, ...system.aliases].map(normalizeContext);
  return context.some((term) =>
    aliases.some((alias) => ` ${term} `.includes(` ${alias} `)),
  );
}

function addContextEvidence(
  system: NarrationGameSystemV1,
  ranked: RankedCandidate | undefined,
  definition: Readonly<{
    claim: string;
    evidenceTier: NarrationGameConfidenceV1;
    locationMatched: boolean;
    rollLabelMatched: boolean;
  }> = {
    claim: "explicit-system-name-in-session-context",
    evidenceTier: "plausible",
    locationMatched: false,
    rollLabelMatched: false,
  },
): RankedCandidate {
  const source = system.sources[0];
  if (source === undefined) {
    throw new Error(`Narration game system ${system.id} has no source`);
  }
  const contextEvidence: NarrationGameCandidateEvidenceV1 = {
    claim: definition.claim,
    evidenceTier: definition.evidenceTier,
    sourceIds: [source.id],
  };
  const combinedEvidence = [
    ...(ranked?.candidate.evidence ?? []),
    contextEvidence,
  ];
  const evidenceTier = highestConfidence(
    combinedEvidence.map(({ evidenceTier: tier }) => tier),
  );
  const sources = ranked?.candidate.sources ?? [];

  return {
    candidate: {
      systemId: system.id,
      displayName: system.displayName,
      evidenceTier,
      confidenceCeiling: highestConfidence([
        ranked?.candidate.confidenceCeiling ?? definition.evidenceTier,
        definition.evidenceTier,
      ]),
      evidence: combinedEvidence,
      sources: sources.some(({ id }) => id === source.id)
        ? sources
        : [...sources, { id: source.id, title: source.title, url: source.url }],
      confusableWith: system.confusableWith,
      commentaryTopics:
        ranked?.candidate.commentaryTopics ?? system.commentaryTopics,
    },
    strongestEvidenceCount: combinedEvidence.filter(
      ({ evidenceTier: tier }) => tier === evidenceTier,
    ).length,
    contextMatched: true,
    locationMatched: definition.locationMatched,
    rollLabelMatched: definition.rollLabelMatched,
  };
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate): number {
  const tierDifference =
    CONFIDENCE_RANK[right.candidate.evidenceTier] -
    CONFIDENCE_RANK[left.candidate.evidenceTier];
  if (tierDifference !== 0) return tierDifference;

  if (left.locationMatched !== right.locationMatched) {
    return left.locationMatched ? -1 : 1;
  }
  if (left.rollLabelMatched !== right.rollLabelMatched) {
    return left.rollLabelMatched ? -1 : 1;
  }
  if (left.contextMatched !== right.contextMatched) {
    return left.contextMatched ? -1 : 1;
  }

  const strongestDifference =
    right.strongestEvidenceCount - left.strongestEvidenceCount;
  if (strongestDifference !== 0) return strongestDifference;

  const evidenceDifference =
    right.candidate.evidence.length - left.candidate.evidence.length;
  if (evidenceDifference !== 0) return evidenceDifference;

  return left.candidate.systemId.localeCompare(right.candidate.systemId);
}

function buildCandidateConflict(
  matches: readonly RankedCandidate[],
): NarrationGameCandidateConflictV1 | null {
  const topMatch = matches[0];
  if (topMatch === undefined) {
    throw new Error("Narration game candidate ranking is unexpectedly empty");
  }
  const topTier = topMatch.candidate.evidenceTier;
  if (CONFIDENCE_RANK[topTier] < CONFIDENCE_RANK.strong) return null;

  const conflictingSystemIds = matches
    .filter(({ candidate }) => candidate.evidenceTier === topTier)
    .slice(0, MAX_NARRATION_GAME_CANDIDATES_V1)
    .map(({ candidate }) => candidate.systemId);
  if (conflictingSystemIds.length < 2) return null;

  return {
    kind: "multiple-strong-system-workflows",
    disposition: "abstain",
    systemIds: conflictingSystemIds,
  };
}

function determineCandidateState(
  matches: readonly RankedCandidate[],
  conflict: NarrationGameCandidateConflictV1 | null,
): NarrationGameCandidateResultV1["state"] {
  if (conflict !== null) return "conflicting-evidence";

  const topMatch = matches[0];
  if (topMatch === undefined) {
    throw new Error("Narration game candidate ranking is unexpectedly empty");
  }
  return topMatch.candidate.evidenceTier === "weak"
    ? "weak-only"
    : "candidate-set";
}

export function retrieveNarrationGameCandidatesV1(
  request: NarrationGameCandidateRequestV1,
): NarrationGameCandidateResultV1;
export function retrieveNarrationGameCandidatesV1(
  request: unknown,
): NarrationGameCandidateResultV1 {
  if (
    !isRecord(request) ||
    !hasExactFields(request, ["version", "features"])
  ) {
    throw new Error(
      "Narration game candidate request contains an unsupported field",
    );
  }
  if (request.version !== 1) {
    throw new Error("Narration game candidate request version must be 1");
  }

  const features = validateFeatures(request.features);
  const observations = new Map(
    features.map(({ kind, occurrences }) => [kind, occurrences]),
  );
  const matches = CATALOG_SYSTEMS.filter(
    ({ legacyRetrievalExcluded }) => legacyRetrievalExcluded !== true,
  ).map((system) => buildCandidate(system, observations))
    .filter((candidate): candidate is RankedCandidate => candidate !== undefined)
    .sort(compareCandidates);

  if (matches.length === 0) {
    return {
      version: 1,
      state: "insufficient-evidence",
      conflict: null,
      truncated: false,
      candidates: [],
    };
  }

  const conflict = buildCandidateConflict(matches);
  return {
    version: 1,
    state: determineCandidateState(matches, conflict),
    conflict,
    truncated: matches.length > MAX_NARRATION_GAME_CANDIDATES_V1,
    candidates: matches
      .slice(0, MAX_NARRATION_GAME_CANDIDATES_V1)
      .map(({ candidate }) => candidate),
  };
}

export function retrieveNarrationGameCandidatesV2(
  request: NarrationGameCandidateRequestV2,
): NarrationGameCandidateResultV1;
export function retrieveNarrationGameCandidatesV2(
  request: unknown,
): NarrationGameCandidateResultV1 {
  if (
    !isRecord(request) ||
    !hasExactFields(request, ["version", "features", "context"])
  ) {
    throw new Error(
      "Narration game candidate request contains an unsupported field",
    );
  }
  if (request.version !== 2) {
    throw new Error("Narration game candidate request version must be 2");
  }

  const features = validateFeatures(request.features);
  const context = validateContext(request.context);
  const observations = new Map(
    features.map(({ kind, occurrences }) => [kind, occurrences]),
  );
  const matches = CATALOG_SYSTEMS.map((system) => {
    const ranked = buildCandidate(system, observations);
    return matchesContextAlias(system, context)
      ? addContextEvidence(system, ranked)
      : ranked;
  })
    .filter((candidate): candidate is RankedCandidate => candidate !== undefined)
    .sort(compareCandidates);

  if (matches.length === 0) {
    return {
      version: 1,
      state: "insufficient-evidence",
      conflict: null,
      truncated: false,
      candidates: [],
    };
  }

  const required = matches.filter(
    ({ candidate, contextMatched }) =>
      contextMatched ||
      CONFIDENCE_RANK[candidate.evidenceTier] >= CONFIDENCE_RANK.strong,
  );
  const selected = [...required];
  for (const match of matches) {
    if (selected.length >= MAX_NARRATION_GAME_CANDIDATES_V1) break;
    if (!selected.includes(match)) selected.push(match);
  }
  const bounded = selected
    .sort(compareCandidates)
    .slice(0, MAX_NARRATION_GAME_CANDIDATES_V1);
  const conflict = buildCandidateConflict(bounded);

  return {
    version: 1,
    state: determineCandidateState(bounded, conflict),
    conflict,
    truncated:
      required.length > MAX_NARRATION_GAME_CANDIDATES_V1 ||
      (required.length === 0 &&
        matches.length > MAX_NARRATION_GAME_CANDIDATES_V1),
    candidates: bounded.map(({ candidate }) => candidate),
  };
}

export function retrieveNarrationGameCandidatesV3(
  request: NarrationGameCandidateRequestV3,
): NarrationGameCandidateResultV1;
export function retrieveNarrationGameCandidatesV3(
  request: unknown,
): NarrationGameCandidateResultV1 {
  if (
    !isRecord(request) ||
    !hasExactFields(request, ["version", "features", "context"])
  ) {
    throw new Error(
      "Narration game candidate request contains an unsupported field",
    );
  }
  if (request.version !== 3) {
    throw new Error("Narration game candidate request version must be 3");
  }

  const features = validateFeatures(request.features);
  const context = normalizeNarrationGameCandidateContextV3(request.context);
  const observations = new Map(
    features.map(({ kind, occurrences }) => [kind, occurrences]),
  );
  const matches = CATALOG_SYSTEMS.map((system) => {
    let ranked = buildCandidate(system, observations);
    const locationMatched = matchesContextAlias(system, context.locationNames);
    const rollLabelMatched = matchesContextAlias(system, context.rollLabels);

    if (locationMatched) {
      ranked = addContextEvidence(system, ranked, {
        claim: "explicit-system-name-in-location-context",
        evidenceTier: "plausible",
        locationMatched: true,
        rollLabelMatched: false,
      });
    }
    if (rollLabelMatched && ranked !== undefined) {
      ranked = addContextEvidence(system, ranked, {
        claim: "explicit-system-name-in-roll-label-context",
        evidenceTier: "weak",
        locationMatched,
        rollLabelMatched: true,
      });
    }
    return ranked;
  })
    .filter((candidate): candidate is RankedCandidate => candidate !== undefined)
    .sort(compareCandidates);

  if (matches.length === 0) {
    return {
      version: 1,
      state: "insufficient-evidence",
      conflict: null,
      truncated: false,
      candidates: [],
    };
  }

  const required = matches.filter(
    ({ candidate, locationMatched }) =>
      locationMatched ||
      CONFIDENCE_RANK[candidate.evidenceTier] >= CONFIDENCE_RANK.strong,
  );
  const selected = [...required];
  for (const match of matches) {
    if (selected.length >= MAX_NARRATION_GAME_CANDIDATES_V1) break;
    if (!selected.includes(match)) selected.push(match);
  }
  const bounded = selected
    .sort(compareCandidates)
    .slice(0, MAX_NARRATION_GAME_CANDIDATES_V1);
  const conflict = buildCandidateConflict(bounded);

  return {
    version: 1,
    state: determineCandidateState(bounded, conflict),
    conflict,
    truncated:
      required.length > MAX_NARRATION_GAME_CANDIDATES_V1 ||
      (required.length === 0 &&
        matches.length > MAX_NARRATION_GAME_CANDIDATES_V1),
    candidates: bounded.map(({ candidate }) => candidate),
  };
}
