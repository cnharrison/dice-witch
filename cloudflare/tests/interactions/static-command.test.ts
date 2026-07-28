import { describe, expect, it } from "vitest";
import {
  buildStaticCommandResponse,
  parseStaticInteractionCommand,
} from "../../packages/discord-contracts/src";

const applicationId = "100000000000000001";
const guildId = "100000000000000002";
const links = {
  inviteUrl:
    "https://discord.com/api/oauth2/authorize?client_id=100000000000000001&permissions=0&scope=bot%20applications.commands",
  supportUrl: "https://discord.gg/example",
};

function interaction(name: string, inGuild = true): Record<string, unknown> {
  return {
    id: "100000000000000001",
    application_id: applicationId,
    type: 2,
    token: "fixture.interaction.token",
    ...(inGuild ? { guild_id: guildId } : {}),
    data: { name, type: 1 },
  };
}

describe("static Discord command contract", () => {
  it("accepts web and prefs in the development guild and bot DMs", () => {
    expect(
      parseStaticInteractionCommand(interaction("web"), applicationId, guildId),
    ).toBe("web");
    expect(
      parseStaticInteractionCommand(
        interaction("prefs", false),
        applicationId,
        guildId,
      ),
    ).toBe("prefs");
  });

  it("builds the exact ephemeral web response", () => {
    expect(
      buildStaticCommandResponse("web", links, "https://example.com/app"),
    ).toEqual({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          {
            color: 16711935,
            title: "Dice Witch Web Interface",
            description: "Control Dice Witch from the web: https://example.com/app",
            thumbnail: { url: "https://i.imgur.com/tBfG2pP.png" },
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

  it("links the prefs command directly to Preferences", () => {
    const response = buildStaticCommandResponse(
      "prefs",
      links,
      "https://example.com/app",
    ) as { data: { embeds: Array<{ description: string }> } };

    expect(response.data.embeds[0]?.description).toBe(
      "Set user preferences and control Dice Witch from the web: https://example.com/app/preferences",
    );
  });

  it("rejects options and ignores unrelated commands", () => {
    expect(
      parseStaticInteractionCommand(
        interaction("status"),
        applicationId,
        guildId,
      ),
    ).toBeNull();
    expect(() =>
      parseStaticInteractionCommand(
        {
          ...interaction("web"),
          data: { name: "web", type: 1, options: [{ name: "unexpected" }] },
        },
        applicationId,
        guildId,
      ),
    ).toThrow("Static command options are invalid");
  });
});
