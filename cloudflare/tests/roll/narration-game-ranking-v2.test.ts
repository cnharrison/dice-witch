import { describe, expect, it } from "vitest";
import {
  extractNarrationGameFeaturesV1,
  MAX_NARRATION_GAME_RANKING_PACKET_BYTES,
  prepareNarrationGameRankingV1,
  prepareNarrationGameRankingV2,
  validateNarrationGameRankingResponseV1,
  type NarrationGameRankingRequestV1,
} from "../../packages/roll-domain/src";
import { buildNarrationGameRankingReferenceResponseV1 } from "./fixtures/narration-game-ranking-calibration-v1";
import { NARRATION_GAME_SESSION_FIXTURES_V1 } from "./fixtures/narration-game-sessions-v1";

const PERCENTILE_REQUEST = {
  version: 1,
  features: [
    { kind: "single-percentile-roll", occurrences: 2 },
    { kind: "percentile-roll-under-threshold", occurrences: 2 },
  ],
} as const satisfies NarrationGameRankingRequestV1;

function promptForV2(request: NarrationGameRankingRequestV1) {
  const preparation = prepareNarrationGameRankingV2(request);
  if (preparation.state !== "prompt-ready") {
    throw new Error(`Expected a game-ranking prompt, received ${preparation.reason}`);
  }
  return preparation.prompt;
}

describe("prepareNarrationGameRankingV2", () => {
  it("preserves the frozen v1 prompt while producing a combinator-free provider schema", () => {
    const v1 = prepareNarrationGameRankingV1(PERCENTILE_REQUEST);
    const v2 = prepareNarrationGameRankingV2(PERCENTILE_REQUEST);
    expect(v1.state).toBe("prompt-ready");
    expect(v2.state).toBe("prompt-ready");
    if (v1.state !== "prompt-ready" || v2.state !== "prompt-ready") return;

    expect(v2.prompt).toMatchObject({
      version: 2,
      systemPromptRevision: "dice-witch-game-ranking-v2",
    });
    expect(v2.prompt.messages[0].content).toContain(
      "observed mechanics and occurrence counts",
    );
    const v1Packet = JSON.parse(v1.prompt.messages[1].content) as {
      candidates: unknown;
    };
    const v2Packet = JSON.parse(v2.prompt.messages[1].content) as {
      version: number;
      evidenceScope: string;
      observedMechanics: unknown;
      candidates: unknown;
    };
    expect(v2Packet).toMatchObject({
      version: 2,
      evidenceScope: "current-session-observed-mechanics",
      observedMechanics: [
        { kind: "percentile-roll-under-threshold", occurrences: 2 },
        { kind: "single-percentile-roll", occurrences: 2 },
      ],
    });
    expect(v2Packet.candidates).toEqual(v1Packet.candidates);
    expect(
      prepareNarrationGameRankingV2({
        ...PERCENTILE_REQUEST,
        features: [...PERCENTILE_REQUEST.features].reverse(),
      }),
    ).toEqual(v2);
    expect(v1.prompt.responseSchema).toHaveProperty("oneOf");
    const serializedSchema = JSON.stringify(v2.prompt.responseSchema);
    for (const keyword of [
      "oneOf",
      "anyOf",
      "allOf",
      "if",
      "then",
      "else",
      "$ref",
    ]) {
      expect(serializedSchema).not.toContain(`"${keyword}"`);
    }
    expect(v2.prompt.responseSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: [
        "version",
        "disposition",
        "selectedSystemId",
        "assessments",
        "abstentionReason",
      ],
    });
  });

  it("keeps every candidate assessment bounded while weak alternatives remain non-selectable", () => {
    const prompt = promptForV2({
      version: 1,
      features: [
        { kind: "four-fate-dice", occurrences: 2 },
        { kind: "single-d20-plus-modifier", occurrences: 4 },
      ],
    });
    const schema = prompt.responseSchema as {
      properties: {
        selectedSystemId: { enum: Array<string | null> };
        assessments: {
          required: string[];
          properties: Record<
            string,
            {
              properties: {
                confidenceTier: { enum: string[] };
                evidenceCitations: {
                  items: {
                    properties: {
                      claimId: { enum: string[] };
                      sourceIds: { items: { enum: string[] } };
                    };
                  };
                };
              };
            }
          >;
        };
      };
    };

    expect(schema.properties.selectedSystemId.enum).toEqual([
      "fate-core-family",
      null,
    ]);
    expect(schema.properties.assessments.required).toEqual([
      "fate-core-family",
      "dungeons-and-dragons-5e-2014",
      "pathfinder-2e-remaster",
    ]);
    expect(
      schema.properties.assessments.properties["dungeons-and-dragons-5e-2014"]
        ?.properties.confidenceTier.enum,
    ).toEqual(["weak"]);
    expect(
      schema.properties.assessments.properties["fate-core-family"]?.properties
        .evidenceCitations.items.properties.claimId.enum,
    ).toEqual(["four-fate-dice-roll"]);
    expect(
      schema.properties.assessments.properties["fate-core-family"]?.properties
        .evidenceCitations.items.properties.sourceIds.items.enum,
    ).toEqual(["fate-core-taking-action"]);
  });

  it("retains strict semantic validation and deterministic abstention outside the provider schema", () => {
    const reference = buildNarrationGameRankingReferenceResponseV1(
      PERCENTILE_REQUEST,
    );
    expect(
      validateNarrationGameRankingResponseV1(reference, PERCENTILE_REQUEST),
    ).toMatchObject({ status: "accepted" });
    expect(
      prepareNarrationGameRankingV2({ version: 1, features: [] }),
    ).toMatchObject({
      version: 2,
      state: "deterministic-abstention",
      disposition: "abstain",
      reason: "insufficient-evidence",
    });
  });

  it("keeps all seven eligible reviewed packets bounded and prompt-ready", () => {
    let promptReady = 0;
    for (const fixture of NARRATION_GAME_SESSION_FIXTURES_V1) {
      const request = extractNarrationGameFeaturesV1(fixture.request);
      const preparation = prepareNarrationGameRankingV2(request);
      if (preparation.state !== "prompt-ready") continue;
      promptReady += 1;
      const dataPacket = preparation.prompt.messages[1].content;
      expect(new TextEncoder().encode(dataPacket).byteLength).toBeLessThanOrEqual(
        MAX_NARRATION_GAME_RANKING_PACKET_BYTES,
      );
    }
    expect(promptReady).toBe(7);
  });
});
