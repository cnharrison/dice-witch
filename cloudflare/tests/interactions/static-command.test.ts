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

type StaticCommandFixture = {
  id: string;
  application_id: string;
  type: number;
  token: string;
  guild_id?: string;
  data: {
    name: string;
    type: number;
    options?: Array<{ name: string }>;
  };
};

function interaction(name: string, inGuild = true): StaticCommandFixture {
  const value: StaticCommandFixture = {
    id: "100000000000000001",
    application_id: applicationId,
    type: 2,
    token: "fixture.interaction.token",
    data: { name, type: 1 },
  };
  if (inGuild) value.guild_id = guildId;
  return value;
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

  it("builds the exact ephemeral V2 web response hierarchy", () => {
    expect(
      buildStaticCommandResponse("web", links, "https://example.com/app"),
    ).toMatchObject({
      type: 4,
      data: {
        flags: (1 << 15) | 64,
        allowed_mentions: { parse: [] },
        components: [
          {
            type: 17,
            accent_color: 16711935,
            components: [
              {
                type: 9,
                components: [
                  {
                    type: 10,
                    content: "## Dice Witch Web Interface\nControl Dice Witch from the web: https://example.com/app",
                  },
                ],
                accessory: {
                  type: 11,
                  media: { url: "https://i.imgur.com/tBfG2pP.png" },
                  description: "Dice Witch",
                },
              },
              {
                type: 1,
                components: [
                  expect.objectContaining({ label: "Invite me", url: links.inviteUrl }),
                  expect.objectContaining({
                    label: "Questions? Join the support server",
                    url: links.supportUrl,
                  }),
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("links the prefs command directly to Preferences", () => {
    const response = buildStaticCommandResponse(
      "prefs",
      links,
      "https://example.com/app",
    );

    expect(JSON.stringify(response)).toContain(
      "Set user preferences and control Dice Witch from the web: https://example.com/app/preferences",
    );
  });

  it("routes unrelated applications before recognized-payload validation", () => {
    expect(
      parseStaticInteractionCommand(
        { application_id: "100000000000000099", type: 2 },
        applicationId,
        guildId,
      ),
    ).toBeNull();
    expect(() =>
      parseStaticInteractionCommand(
        { application_id: applicationId, type: 2, data: { name: "web" } },
        applicationId,
        guildId,
      )
    ).toThrow("Static command interaction is invalid");
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
