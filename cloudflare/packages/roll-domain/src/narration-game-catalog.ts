import { NARRATION_POPULAR_GAME_SYSTEMS_V1 } from "./narration-popular-game-systems";

export type NarrationGameConfidenceV1 =
  | "weak"
  | "plausible"
  | "strong"
  | "distinctive";

export type NarrationGameSourceAuthorityV1 =
  | "licensed-rules-reference"
  | "official-srd"
  | "publisher";

export type NarrationGameFeatureV1 =
  | "observed-roll-expression"
  | "d6-pool-keep-highest"
  | "exploding-step-die"
  | "exploding-trait-plus-wild-d6-keep-highest"
  | "four-d6-keep-highest-three"
  | "four-fate-dice"
  | "percentile-roll-under-threshold"
  | "single-d20-plus-modifier"
  | "single-percentile-roll"
  | "two-d6-keep-lowest"
  | "d20-roll-under-threshold"
  | "d20-with-accuracy-d6"
  | "d20-with-plot-d6"
  | "dcc-dice-chain"
  | "dcc-diverse-dice-chain"
  | "diverse-uncatalogued-die-sides"
  | "mixed-step-dice-pool"
  | "plain-d10-pool"
  | "plain-d6-pool"
  | "single-d10-plus-modifier"
  | "single-d20-roll"
  | "three-d6"
  | "three-d20"
  | "two-d10-plus-modifier"
  | "two-d12-plus-modifier"
  | "two-d20-roll-under-threshold"
  | "two-d6-plus-modifier";

export type NarrationGameSourceV1 = Readonly<{
  id: string;
  authority: NarrationGameSourceAuthorityV1;
  publisher: string;
  title: string;
  url: `https://${string}`;
  accessedOn: string;
}>;

export type NarrationGameEvidencePolicyV1 =
  | "standalone"
  | "representative"
  | "corroborating";

// Caps a fingerprint when an incompatible episode feature is at least as
// frequent as the configured supporting comparison feature.
export type NarrationGameCounterevidenceV1 = Readonly<{
  feature: NarrationGameFeatureV1;
  atLeastAsFrequentAsFeature: NarrationGameFeatureV1;
  confidenceCeiling: NarrationGameConfidenceV1;
}>;

export type NarrationGameFingerprintV1 = Readonly<{
  id: string;
  claim: string;
  features: readonly NarrationGameFeatureV1[];
  minimumOccurrences: number;
  evidencePolicy: NarrationGameEvidencePolicyV1;
  evidenceStrength: NarrationGameConfidenceV1;
  confidenceCeiling: NarrationGameConfidenceV1;
  counterevidence?: readonly NarrationGameCounterevidenceV1[];
  sourceIds: readonly string[];
  commentaryTopics: readonly string[];
}>;

export type NarrationGameSystemV1 = Readonly<{
  id: string;
  displayName: string;
  aliases: readonly string[];
  legacyRetrievalExcluded?: boolean;
  fingerprints: readonly NarrationGameFingerprintV1[];
  confusableWith: readonly string[];
  commentaryTopics: readonly string[];
  sources: readonly NarrationGameSourceV1[];
}>;

export type NarrationGameCatalogV1 = Readonly<{
  version: 1;
  systems: readonly NarrationGameSystemV1[];
}>;

const ACCESSED_ON = "2026-07-30";

export const NARRATION_GAME_CATALOG_V1 = {
  version: 1,
  systems: [
    {
      id: "basic-roleplaying-universal-game-engine-2023",
      displayName: "Basic Roleplaying: Universal Game Engine (2023)",
      aliases: ["basic-roleplaying", "brp"],
      fingerprints: [
        {
          id: "ordinary-percentile-roll",
          claim: "ordinary-percentile-check",
          features: ["single-percentile-roll"],
          minimumOccurrences: 1,
          evidencePolicy: "corroborating",
          evidenceStrength: "weak",
          confidenceCeiling: "weak",
          sourceIds: ["basic-roleplaying-universal-game-engine-2023"],
          commentaryTopics: ["percentile-checks"],
        },
        {
          id: "percentile-roll-under-target",
          claim: "percentile-roll-under-procedure",
          features: ["percentile-roll-under-threshold"],
          minimumOccurrences: 2,
          evidencePolicy: "representative",
          evidenceStrength: "plausible",
          confidenceCeiling: "plausible",
          sourceIds: ["basic-roleplaying-universal-game-engine-2023"],
          commentaryTopics: ["percentile-checks", "roll-under"],
        },
      ],
      confusableWith: [
        "call-of-cthulhu-7e",
        "mothership-1e",
        "other-percentile-games",
      ],
      commentaryTopics: ["percentile-checks", "roll-under"],
      sources: [
        {
          id: "basic-roleplaying-universal-game-engine-2023",
          authority: "publisher",
          publisher: "Chaosium",
          title: "Basic Roleplaying: Universal Game Engine",
          url: "https://www.chaosium.com/basic-roleplaying-universal-game-engine-hardcover/",
          accessedOn: ACCESSED_ON,
        },
      ],
    },
    {
      id: "dungeons-and-dragons-5e-2014",
      displayName: "Dungeons & Dragons fifth edition (2014)",
      aliases: ["dnd-5e-2014", "dungeons-and-dragons-5e"],
      fingerprints: [
        {
          id: "six-ability-scores-from-four-d6",
          claim: "ability-score-generation-workflow",
          features: ["four-d6-keep-highest-three"],
          minimumOccurrences: 6,
          evidencePolicy: "standalone",
          evidenceStrength: "strong",
          confidenceCeiling: "strong",
          sourceIds: ["dnd-5e-2014-basic-rules-ability-scores"],
          commentaryTopics: ["ability-score-generation"],
        },
        {
          id: "ordinary-d20-check",
          claim: "ordinary-d20-check",
          features: ["single-d20-plus-modifier"],
          minimumOccurrences: 1,
          evidencePolicy: "corroborating",
          evidenceStrength: "weak",
          confidenceCeiling: "weak",
          sourceIds: ["dnd-5e-2014-basic-rules-ability-checks"],
          commentaryTopics: ["d20-checks"],
        },
      ],
      confusableWith: ["pathfinder-2e-remaster", "other-d20-systems"],
      commentaryTopics: ["ability-score-generation", "d20-checks"],
      sources: [
        {
          id: "dnd-5e-2014-basic-rules-ability-scores",
          authority: "publisher",
          publisher: "Wizards of the Coast",
          title: "D&D Basic Rules 2014: Determine Ability Scores",
          url: "https://www.dndbeyond.com/sources/dnd/basic-rules-2014/step-by-step-characters",
          accessedOn: ACCESSED_ON,
        },
        {
          id: "dnd-5e-2014-basic-rules-ability-checks",
          authority: "publisher",
          publisher: "Wizards of the Coast",
          title: "D&D Basic Rules 2014: Using Ability Scores",
          url: "https://www.dndbeyond.com/sources/dnd/basic-rules-2014/using-ability-scores",
          accessedOn: ACCESSED_ON,
        },
      ],
    },
    {
      id: "pathfinder-2e-remaster",
      displayName: "Pathfinder second edition (Remaster)",
      aliases: ["pathfinder-2e", "pf2e"],
      fingerprints: [
        {
          id: "ordinary-d20-check",
          claim: "ordinary-d20-check",
          features: ["single-d20-plus-modifier"],
          minimumOccurrences: 1,
          evidencePolicy: "corroborating",
          evidenceStrength: "weak",
          confidenceCeiling: "weak",
          sourceIds: ["pathfinder-2e-player-core-checks"],
          commentaryTopics: ["d20-checks"],
        },
      ],
      confusableWith: ["dungeons-and-dragons-5e-2014", "other-d20-systems"],
      commentaryTopics: ["d20-checks"],
      sources: [
        {
          id: "pathfinder-2e-player-core-checks",
          authority: "licensed-rules-reference",
          publisher: "Paizo",
          title: "Pathfinder Player Core: Checks",
          url: "https://2e.aonprd.com/Rules.aspx?ID=2278",
          accessedOn: ACCESSED_ON,
        },
      ],
    },
    {
      id: "fate-core-family",
      displayName: "Fate Core family",
      aliases: ["fate-core", "fate-accelerated", "fate-condensed"],
      fingerprints: [
        {
          id: "four-fate-dice",
          claim: "four-fate-dice-roll",
          features: ["four-fate-dice"],
          minimumOccurrences: 1,
          evidencePolicy: "standalone",
          evidenceStrength: "strong",
          confidenceCeiling: "strong",
          sourceIds: ["fate-core-taking-action"],
          commentaryTopics: ["fate-dice", "four-dice"],
        },
      ],
      confusableWith: ["fudge", "other-fate-games"],
      commentaryTopics: ["fate-dice", "four-dice"],
      sources: [
        {
          id: "fate-core-taking-action",
          authority: "official-srd",
          publisher: "Evil Hat Productions",
          title: "Fate Core: Taking Action, Dice, and the Ladder",
          url: "https://fate-srd.com/fate-core/taking-action-dice-ladder",
          accessedOn: ACCESSED_ON,
        },
      ],
    },
    {
      id: "forged-in-the-dark-family",
      displayName: "Forged in the Dark family",
      aliases: ["blades-in-the-dark", "fitd"],
      fingerprints: [
        {
          id: "d6-pool-read-highest",
          claim: "d6-pool-highest-die-procedure",
          features: ["d6-pool-keep-highest"],
          minimumOccurrences: 2,
          evidencePolicy: "representative",
          evidenceStrength: "strong",
          confidenceCeiling: "strong",
          sourceIds: ["blades-in-the-dark-core-system"],
          commentaryTopics: ["d6-pools", "highest-die"],
        },
        {
          id: "zero-rating-two-d6-read-lowest",
          claim: "zero-rating-lowest-die-procedure",
          features: ["two-d6-keep-lowest"],
          minimumOccurrences: 1,
          evidencePolicy: "corroborating",
          evidenceStrength: "strong",
          confidenceCeiling: "strong",
          sourceIds: ["blades-in-the-dark-core-system"],
          commentaryTopics: ["d6-pools", "highest-die"],
        },
      ],
      confusableWith: ["other-forged-in-the-dark-games", "other-d6-pool-games"],
      commentaryTopics: ["d6-pools", "highest-die"],
      sources: [
        {
          id: "blades-in-the-dark-core-system",
          authority: "official-srd",
          publisher: "One Seven Design",
          title: "Blades in the Dark: The Core System",
          url: "https://bladesinthedark.com/core-system",
          accessedOn: ACCESSED_ON,
        },
      ],
    },
    {
      id: "call-of-cthulhu-7e",
      displayName: "Call of Cthulhu seventh edition",
      aliases: ["call-of-cthulhu", "coc-7e"],
      fingerprints: [
        {
          id: "ordinary-percentile-roll",
          claim: "ordinary-percentile-check",
          features: ["single-percentile-roll"],
          minimumOccurrences: 1,
          evidencePolicy: "corroborating",
          evidenceStrength: "weak",
          confidenceCeiling: "weak",
          sourceIds: ["call-of-cthulhu-game-system"],
          commentaryTopics: ["percentile-checks"],
        },
        {
          id: "percentile-roll-under-skill",
          claim: "percentile-roll-under-procedure",
          features: ["percentile-roll-under-threshold"],
          minimumOccurrences: 2,
          evidencePolicy: "representative",
          evidenceStrength: "plausible",
          confidenceCeiling: "plausible",
          sourceIds: ["call-of-cthulhu-game-system"],
          commentaryTopics: ["percentile-checks", "roll-under"],
        },
      ],
      confusableWith: [
        "basic-roleplaying-universal-game-engine-2023",
        "mothership-1e",
        "other-percentile-games",
        "warhammer-roleplay",
      ],
      commentaryTopics: ["percentile-checks", "roll-under"],
      sources: [
        {
          id: "call-of-cthulhu-game-system",
          authority: "publisher",
          publisher: "Chaosium",
          title: "Call of Cthulhu: The Game System",
          url: "https://cthulhuwiki.chaosium.com/rules/game-system.html",
          accessedOn: ACCESSED_ON,
        },
      ],
    },
    {
      id: "mothership-1e",
      displayName: "Mothership first edition",
      aliases: ["mothership", "mothership-rpg"],
      fingerprints: [
        {
          id: "ordinary-percentile-roll",
          claim: "ordinary-percentile-check",
          features: ["single-percentile-roll"],
          minimumOccurrences: 1,
          evidencePolicy: "corroborating",
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
          evidencePolicy: "representative",
          evidenceStrength: "plausible",
          confidenceCeiling: "plausible",
          sourceIds: ["mothership-1e-player-survival-guide"],
          commentaryTopics: ["percentile-checks", "roll-under"],
        },
      ],
      confusableWith: [
        "basic-roleplaying-universal-game-engine-2023",
        "call-of-cthulhu-7e",
        "delta-green",
        "other-percentile-games",
      ],
      commentaryTopics: ["percentile-checks", "roll-under"],
      sources: [
        {
          id: "mothership-1e-player-survival-guide",
          authority: "publisher",
          publisher: "Tuesday Knight Games",
          title: "Mothership: Player's Survival Guide (First Edition)",
          url: "https://www.tuesdayknightgames.com/products/mothership-players-survival-guide",
          accessedOn: ACCESSED_ON,
        },
      ],
    },
    {
      id: "savage-worlds",
      displayName: "Savage Worlds family",
      aliases: ["savage-worlds-adventure-edition", "swade"],
      fingerprints: [
        {
          id: "open-ended-step-die",
          claim: "open-ended-step-die-rolls",
          features: ["exploding-step-die"],
          minimumOccurrences: 2,
          evidencePolicy: "representative",
          evidenceStrength: "plausible",
          confidenceCeiling: "plausible",
          sourceIds: ["savage-worlds-test-drive-2015"],
          commentaryTopics: ["exploding-dice"],
        },
        {
          id: "trait-and-wild-die",
          claim: "trait-and-wild-die-pair",
          features: ["exploding-trait-plus-wild-d6-keep-highest"],
          minimumOccurrences: 2,
          evidencePolicy: "standalone",
          evidenceStrength: "strong",
          confidenceCeiling: "strong",
          sourceIds: ["savage-worlds-test-drive-2015"],
          commentaryTopics: ["exploding-dice", "wild-die"],
        },
      ],
      confusableWith: ["other-exploding-dice-games", "other-step-die-games"],
      commentaryTopics: ["exploding-dice", "wild-die"],
      sources: [
        {
          id: "savage-worlds-test-drive-2015",
          authority: "publisher",
          publisher: "Pinnacle Entertainment Group",
          title: "Savage Worlds Test Drive Rules 2015",
          url: "https://www.peginc.com/wp-content/uploads/2015/07/Test_Drive_2015.pdf",
          accessedOn: ACCESSED_ON,
        },
        {
          id: "savage-worlds-current-test-drive-landing",
          authority: "publisher",
          publisher: "Pinnacle Entertainment Group",
          title: "Savage Worlds Adventure Edition Test Drive",
          url: "https://peginc.com/new-to-savage-worlds-start-here/",
          accessedOn: ACCESSED_ON,
        },
      ],
    },
    ...NARRATION_POPULAR_GAME_SYSTEMS_V1,
  ],
} as const satisfies NarrationGameCatalogV1;
