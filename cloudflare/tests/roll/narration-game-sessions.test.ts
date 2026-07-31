import { describe, expect, it } from "vitest";
import {
  executeRoll,
  extractNarrationGameFeaturesV1,
  retrieveNarrationGameCandidatesV1,
} from "../../packages/roll-domain/src";
import {
  NARRATION_GAME_SESSION_FIXTURE_PROVENANCE_V1,
  NARRATION_GAME_SESSION_FIXTURES_V1,
} from "./fixtures/narration-game-sessions-v1";

describe("narration game session fixtures v1", () => {
  it("is synthetic, identifier-free, and human reviewed", () => {
    expect(NARRATION_GAME_SESSION_FIXTURE_PROVENANCE_V1).toEqual({
      version: 1,
      status: "source-backed-synthetic-human-reviewed",
      containsProductionData: false,
      containsIdentifiers: false,
      containsExactResults: false,
      humanApproved: true,
    });
  });

  it("freezes distinctive, ambiguous, conflicting, and abstention behavior", () => {
    for (const fixture of NARRATION_GAME_SESSION_FIXTURES_V1) {
      for (const roll of fixture.request.rolls) {
        const execution = executeRoll({ notation: roll.notation, seed: 0 });
        if ("notationIsValid" in fixture) {
          expect(
            execution.errors.length,
            `${fixture.id} remains invalid notation`,
          ).toBeGreaterThan(0);
        } else {
          expect(
            execution.errors,
            `${fixture.id} uses supported Dice Witch notation`,
          ).toEqual([]);
        }
      }

      const features = extractNarrationGameFeaturesV1(fixture.request);
      const result = retrieveNarrationGameCandidatesV1(features);

      expect(result.state, fixture.id).toBe(fixture.expected.state);
      expect(
        result.candidates.map(({ systemId }) => systemId),
        fixture.id,
      ).toEqual(fixture.expected.candidateIds);
      if ("topEvidenceTier" in fixture.expected) {
        expect(result.candidates[0]?.evidenceTier, fixture.id).toBe(
          fixture.expected.topEvidenceTier,
        );
      }
      if (result.state === "conflicting-evidence") {
        expect(result.conflict, fixture.id).toEqual({
          kind: "multiple-strong-system-workflows",
          disposition: "abstain",
          systemIds: fixture.expected.candidateIds,
        });
      } else {
        expect(result.conflict, fixture.id).toBeNull();
      }

      expect(JSON.stringify(result), fixture.id).not.toMatch(
        /occurrences|notation|results|frequency|sequenceLength|guildId|userId/iu,
      );
    }
  });
});
