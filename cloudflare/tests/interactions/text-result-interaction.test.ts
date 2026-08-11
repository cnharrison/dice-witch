import { describe, expect, it } from "vitest";
import {
  buildTextResultCustomId,
  buildTextResultResponse,
  parseTextResultInteraction,
  parseTextResultIntent,
  ROLL_SAVE_INTENT_RETENTION_MS,
} from "../../packages/discord-contracts/src";

const applicationId = "100000000000000001";
const source = { kind: "discord" as const, id: "1400000000000000000" };
const baseInteraction = {
  type: 3,
  id: "1400000000000000001",
  application_id: applicationId,
  token: "interaction-token-value",
  guild_id: "1400000000000000002",
  channel_id: "1400000000000000003",
  message: { id: "1400000000000000004" },
  member: {
    user: {
      id: "1400000000000000005",
      username: "reader",
    },
  },
};

function interaction(customId: string) {
  return {
    ...baseInteraction,
    data: { component_type: 2, custom_id: customId },
  };
}

describe("Text result interaction contract", () => {
  it("round-trips Discord and web sources with message context", () => {
    const discordCustomId = buildTextResultCustomId(source);
    expect(discordCustomId).toBe("text-result:v1:d:1400000000000000000");
    expect(
      parseTextResultInteraction(interaction(discordCustomId), {
        applicationId,
      }),
    ).toMatchObject({
      source,
      guildId: baseInteraction.guild_id,
      channelId: baseInteraction.channel_id,
      messageId: baseInteraction.message.id,
      userId: baseInteraction.member.user.id,
    });

    const webSource = {
      kind: "web" as const,
      id: "123e4567-e89b-42d3-a456-426614174000",
      userId: "1400000000000000006",
    };
    const webCustomId = buildTextResultCustomId(webSource);
    expect(webCustomId).toBe(
      "text-result:v1:w:1400000000000000006.123e4567-e89b-42d3-a456-426614174000",
    );
    expect(
      parseTextResultInteraction(interaction(webCustomId), { applicationId }),
    ).toMatchObject({ source: webSource });
  });

  it("rejects malformed, unbound, cross-application, and direct-message clicks", () => {
    expect(() =>
      buildTextResultCustomId({ kind: "discord", id: "invalid" })
    ).toThrow("Text result source is invalid");

    const customId = buildTextResultCustomId(source);
    expect(
      parseTextResultInteraction(
        { ...interaction(customId), application_id: "100000000000000009" },
        { applicationId },
      ),
    ).toBeNull();
    expect(
      parseTextResultInteraction(
        { ...interaction(customId), guild_id: undefined },
        { applicationId },
      ),
    ).toBeNull();
    expect(
      parseTextResultInteraction(
        { ...interaction(customId), message: undefined },
        { applicationId },
      ),
    ).toBeNull();
    expect(
      parseTextResultInteraction(
        { ...interaction(customId), data: { component_type: 3, custom_id: customId } },
        { applicationId },
      ),
    ).toBeNull();
  });

  it("validates a message-bound 90-day result intent", () => {
    const createdAt = 1_800_000_000_000;
    const value = {
      version: 1,
      resultText: "1d20 = 17",
      applicationId,
      guildId: baseInteraction.guild_id,
      channelId: baseInteraction.channel_id,
      messageId: null,
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    };
    expect(parseTextResultIntent(value)).toEqual(value);
    expect(
      parseTextResultIntent({ ...value, messageId: baseInteraction.message.id }),
    ).toEqual({ ...value, messageId: baseInteraction.message.id });
    expect(() =>
      parseTextResultIntent({ ...value, expiresAt: value.expiresAt - 1 })
    ).toThrow("Text result intent is invalid");
    expect(() =>
      parseTextResultIntent({ ...value, resultText: "x".repeat(4_001) })
    ).toThrow("Text result intent is invalid");
  });

  it("returns the exact result ephemerally without mention expansion", () => {
    const resultText = `${"x".repeat(3_990)}\n${"y".repeat(9)}`;
    expect(buildTextResultResponse(resultText)).toEqual({
      type: 4,
      data: {
        flags: (1 << 15) | (1 << 6),
        allowed_mentions: { parse: [] },
        components: [{ type: 10, content: resultText }],
      },
    });
  });
});
