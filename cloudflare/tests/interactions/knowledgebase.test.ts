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

  it("builds the exact public Fudge article and required link row", () => {
    expect(buildKnowledgeBaseResponse("fudge", links)).toEqual({
      type: 4,
      data: {
        embeds: [
          {
            color: 2003199,
            title: "👩‍🎓 Knowledge base",
            fields: [
              {
                name: "Fate or Fudge dice",
                value:
                  "Fate or Fudge dice have six faces: two plus (+), two minus (-), and two blank (0).\n\n`/roll notation:4dF`: Roll four Fate or Fudge dice.\n`/roll notation:4dF+2`: Roll four and add 2.",
                inline: false,
              },
              {
                name: "Read the results",
                value:
                  "Each + adds 1, each - subtracts 1, and each blank is 0.\n\n`[+, -, 0, +] = +1`\n`[-, -, +, 0] = -1`",
                inline: false,
              },
            ],
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "Invite me",
                url: links.inviteUrl,
              },
              {
                type: 2,
                style: 5,
                label: "Questions? Join the support server",
                url: links.supportUrl,
              },
            ],
          },
        ],
        allowed_mentions: { parse: [] },
      },
    });
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
