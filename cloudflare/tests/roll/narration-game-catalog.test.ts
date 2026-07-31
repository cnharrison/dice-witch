import { describe, expect, it } from "vitest";
import {
  NARRATION_GAME_CATALOG_V1,
  type NarrationGameFingerprintV1,
} from "../../packages/roll-domain/src";

const expectedSystemIds = [
  "basic-roleplaying-universal-game-engine-2023",
  "call-of-cthulhu-7e",
  "candela-obscura",
  "cosmere-roleplaying-game",
  "cyberpunk-red",
  "cypher-system-family",
  "daggerheart",
  "delta-green",
  "dragonbane",
  "draw-steel",
  "dungeon-crawl-classics",
  "dungeons-and-dragons-3-5e",
  "dungeons-and-dragons-5e-2014",
  "dungeons-and-dragons-5e-2024",
  "fabula-ultima",
  "fate-core-family",
  "forged-in-the-dark-family",
  "genesys-star-wars-family",
  "gurps-4e",
  "lancer",
  "level-up-advanced-5e",
  "marvel-multiverse-role-playing-game",
  "mothership-1e",
  "old-school-essentials",
  "pathfinder-1e",
  "pathfinder-2e-remaster",
  "pokemon-tabletop-united",
  "powered-by-the-apocalypse-family",
  "savage-worlds",
  "shadowdark",
  "shadowrun-6e-family",
  "star-wars-5e",
  "starfinder",
  "the-dark-eye-5e",
  "tormenta20",
  "traveller-mongoose-2e",
  "two-d20-family",
  "warhammer-40000-imperium-maledictum",
  "warhammer-40000-wrath-and-glory",
  "warhammer-fantasy-roleplay-4e",
  "world-of-darkness-20th-anniversary-family",
  "world-of-darkness-5e-family",
  "year-zero-engine-family",
] as const;

describe("NARRATION_GAME_CATALOG_V1", () => {
  it("provides a versioned initial game-mechanics catalogue", () => {
    expect(NARRATION_GAME_CATALOG_V1.version).toBe(1);
    expect(
      NARRATION_GAME_CATALOG_V1.systems.map(({ id }) => id).sort(),
    ).toEqual(expectedSystemIds);
  });

  it("grounds every fingerprint in a unique authoritative source", () => {
    for (const system of NARRATION_GAME_CATALOG_V1.systems) {
      const sourceIds = new Set(system.sources.map(({ id }) => id));
      const systemTopics = new Set<string>(system.commentaryTopics);
      expect(sourceIds.size, system.id).toBe(system.sources.length);
      expect(
        system.sources.every(
          ({ authority, url }) =>
            url.startsWith("https://") &&
            ["licensed-rules-reference", "official-srd", "publisher"].includes(
              authority,
            ),
        ),
        system.id,
      ).toBe(true);

      for (const fingerprint of system.fingerprints) {
        expect(
          fingerprint.commentaryTopics.every((topic) =>
            systemTopics.has(topic),
          ),
          fingerprint.id,
        ).toBe(true);
        expect(fingerprint.claim, fingerprint.id).toMatch(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
        );
        expect(fingerprint.features.length, fingerprint.id).toBeGreaterThan(0);
        expect(
          new Set(fingerprint.features).size,
          fingerprint.id,
        ).toBe(fingerprint.features.length);
        expect(fingerprint.minimumOccurrences, fingerprint.id).toBeGreaterThan(0);
        expect(
          fingerprint.sourceIds.every((sourceId) => sourceIds.has(sourceId)),
          fingerprint.id,
        ).toBe(true);
      }
    }
  });

  it("recognizes the sourced six-roll ability-generation workflow without calling it certain", () => {
    const system = NARRATION_GAME_CATALOG_V1.systems.find(
      ({ id }) => id === "dungeons-and-dragons-5e-2014",
    );
    const fingerprint = system?.fingerprints.find(
      ({ id }) => id === "six-ability-scores-from-four-d6",
    );

    expect(fingerprint).toEqual({
      id: "six-ability-scores-from-four-d6",
      claim: "ability-score-generation-workflow",
      features: ["four-d6-keep-highest-three"],
      minimumOccurrences: 6,
      evidenceStrength: "strong",
      confidenceCeiling: "strong",
      sourceIds: ["dnd-5e-2014-basic-rules-ability-scores"],
      commentaryTopics: ["ability-score-generation"],
    });
    expect(system?.commentaryTopics).toContain("ability-score-generation");
  });

  it("grounds Mothership percentile claims in the first-edition publisher rules", () => {
    const system = NARRATION_GAME_CATALOG_V1.systems.find(
      ({ id }) => id === "mothership-1e",
    );

    expect(system?.fingerprints).toEqual([
      {
        id: "ordinary-percentile-roll",
        claim: "ordinary-percentile-check",
        features: ["single-percentile-roll"],
        minimumOccurrences: 1,
        evidenceStrength: "weak",
        confidenceCeiling: "weak",
        sourceIds: ["mothership-1e-player-survival-guide"],
        commentaryTopics: ["percentile-checks"],
      },
      {
        id: "percentile-roll-under-stat-or-save",
        claim: "percentile-roll-under-procedure",
        features: ["percentile-roll-under-threshold"],
        minimumOccurrences: 2,
        evidenceStrength: "plausible",
        confidenceCeiling: "plausible",
        sourceIds: ["mothership-1e-player-survival-guide"],
        commentaryTopics: ["percentile-checks", "roll-under"],
      },
    ]);
    expect(system?.confusableWith).toContain("call-of-cthulhu-7e");
  });

  it("caps ubiquitous d20 and percentile patterns below a game claim", () => {
    const fingerprints: Array<
      NarrationGameFingerprintV1 & { systemId: string }
    > = NARRATION_GAME_CATALOG_V1.systems.flatMap(({ fingerprints, id }) =>
      fingerprints.map((fingerprint) => ({ ...fingerprint, systemId: id })),
    );
    const ubiquitous = fingerprints.filter(({ features }) =>
      features.some(
        (feature) =>
          feature === "single-d20-plus-modifier" ||
          feature === "single-percentile-roll",
      ),
    );

    expect(ubiquitous.length).toBeGreaterThanOrEqual(3);
    expect(
      ubiquitous.every(
        ({ confidenceCeiling, evidenceStrength }) =>
          confidenceCeiling === "weak" && evidenceStrength === "weak",
      ),
    ).toBe(true);
  });

  it("records confusable systems and bounded commentary topics", () => {
    for (const system of NARRATION_GAME_CATALOG_V1.systems) {
      expect(system.confusableWith.length, system.id).toBeGreaterThan(0);
      expect(system.commentaryTopics.length, system.id).toBeGreaterThan(0);
      expect(
        system.commentaryTopics.every((topic) =>
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(topic),
        ),
        system.id,
      ).toBe(true);
    }
  });
});
