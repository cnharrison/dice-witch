import { describe, expect, it } from "vitest";
import {
  buildKnowledgeBaseResponse,
  parseKnowledgeBaseInteraction,
} from "../../packages/discord-contracts/src";

const applicationId = "100000000000000001";
const identity = {
  id: "100000000000000001",
  application_id: applicationId,
  token: "fixture.interaction.token",
};
const links = {
  inviteUrl:
    "https://discord.com/api/oauth2/authorize?client_id=100000000000000001&permissions=0&scope=bot%20applications.commands",
  supportUrl: "https://discord.gg/example",
};

describe("knowledgebase interaction contract", () => {
  it("normalizes the registered command topic like the legacy router", () => {
    expect(
      parseKnowledgeBaseInteraction(
        {
          ...identity,
          type: 2,
          data: {
            name: "knowledgebase",
            type: 1,
            options: [{ name: "topic", type: 3, value: " FUDGE " }],
          },
        },
        applicationId,
      ),
    ).toEqual({ topic: "fudge" });
  });

  it("accepts every registered knowledgebase button topic", () => {
    for (const topic of [
      "exploding",
      "reroll",
      "keepdrop",
      "target",
      "crit",
      "math",
      "sort",
      "repeating",
      "unique",
      "fudge",
    ]) {
      expect(
        parseKnowledgeBaseInteraction(
          {
            ...identity,
            type: 3,
            data: { custom_id: `knowledgebase-${topic}`, component_type: 2 },
          },
          applicationId,
        ),
      ).toEqual({ topic });
    }
  });

  it("builds the public V2 Fudge article, topic select, and required links", () => {
    const response = buildKnowledgeBaseResponse("fudge", links) as {
      data: {
        flags: number;
        components: Array<{ type: number; accent_color: number }>;
      };
    };
    expect(response.data.flags).toBe(1 << 15);
    expect(response).not.toHaveProperty("data.embeds");
    expect(response.data.components[0]).toMatchObject({
      type: 17,
      accent_color: 2003199,
    });
    const serialized = JSON.stringify(response.data.components);
    expect(serialized).toContain("## 👩‍🎓 Knowledge base");
    expect(serialized).toContain("### Fate or Fudge dice");
    expect(serialized).toContain('"custom_id":"knowledgebase-topic"');
    expect(serialized).toContain(
      '"value":"fudge","label":"Fate or Fudge dice","default":true',
    );
    expect(serialized).toContain(`"url":"${links.inviteUrl}"`);
    expect(serialized).toContain(`"url":"${links.supportUrl}"`);
  });

  it("parses the V2 topic select while preserving legacy button handling", () => {
    expect(parseKnowledgeBaseInteraction({
      ...identity,
      type: 3,
      data: {
        custom_id: "knowledgebase-topic",
        component_type: 3,
        values: ["fudge"],
      },
    }, applicationId)).toEqual({ topic: "fudge" });
  });

  it("uses the same exhaustive modifier language as the player guide", () => {
    const exploding = JSON.stringify(buildKnowledgeBaseResponse("exploding", links));
    const unique = JSON.stringify(buildKnowledgeBaseResponse("unique", links));
    const critical = JSON.stringify(buildKnowledgeBaseResponse("crit", links));

    expect(exploding).toContain("Compound and penetrate");
    expect(unique).toContain("Reroll each duplicate once");
    expect(critical).toContain(
      "Critical modifiers add a cosmetic illustration showing whether a die is critical.",
    );
  });

  it("rejects malformed command options and ignores unknown button ids", () => {
    expect(() =>
      parseKnowledgeBaseInteraction(
        {
          ...identity,
          type: 2,
          data: { name: "knowledgebase", type: 1, options: [] },
        },
        applicationId,
      ),
    ).toThrow("Knowledgebase options are invalid");
    expect(
      parseKnowledgeBaseInteraction(
        {
          ...identity,
          type: 3,
          data: { custom_id: "knowledgebase-unknown", component_type: 2 },
        },
        applicationId,
      ),
    ).toBeNull();
  });
});
