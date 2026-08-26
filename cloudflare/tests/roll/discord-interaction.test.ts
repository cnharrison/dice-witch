import { describe, expect, it } from "vitest";
import {
  parseRollInteraction,
  parseRollLoggingContext,
  rollInteractionContextMissingReasons,
} from "../../packages/discord-contracts/src";

const applicationId = "100000000000000001";
const guildId = "100000000000000002";

type InteractionFixtureOverrides = Partial<{
  application_id: string;
  guild_id: string | undefined;
  channel_id: string;
  channel:
    | {
        id: string;
        guild_id?: string;
        name?: string;
        type?: number;
      }
    | undefined;
  guild: { id: string; name: string } | undefined;
  type: number;
  token: string;
  member:
    | { user?: { id: string; username: string } }
    | undefined;
  user: { id: string; username: string };
  data: {
    id?: string;
    name: string;
    type: number;
    options?: Array<{
      name: string;
      type: number;
      value: string;
    }>;
  };
}>;

function interaction(overrides: InteractionFixtureOverrides = {}) {
  return {
    id: "1400000000000000000",
    application_id: applicationId,
    guild_id: guildId,
    channel_id: "1400000000000000002",
    channel: {
      id: "1400000000000000002",
      guild_id: guildId,
      name: "dice-rolls",
      type: 0,
    },
    guild: { id: guildId, name: "Fixture Guild" },
    type: 2,
    token: "interaction-token-value",
    member: {
      user: { id: "1400000000000000003", username: "roller" },
    },
    data: {
      id: "1400000000000000001",
      name: "roll",
      type: 1,
      options: [
        { name: "notation", type: 3, value: " 2d20 + 5 " },
        { name: "title", type: 3, value: "enchanted sword" },
        { name: "times", type: 3, value: "3" },
      ],
    },
    ...overrides,
  };
}

describe("parseRollInteraction", () => {
  it("validates and normalizes a controlled guild roll command", () => {
    expect(
      parseRollInteraction(interaction(), {
        applicationId,
        guildId,
      }),
    ).toEqual({
      id: "1400000000000000000",
      applicationId,
      guildId,
      channelId: "1400000000000000002",
      loggingContext: {
        kind: "guild",
        guildId,
        guildName: "Fixture Guild",
        channelId: "1400000000000000002",
        channelName: "dice-rolls",
        channelType: 0,
      },
      userId: "1400000000000000003",
      username: "roller",
      token: "interaction-token-value",
      notation: "2d20 + 5",
      title: "enchanted sword",
      repetitions: 3,
      ephemeral: true,
    });
  });

  it.each([2, 13, 15, 16])(
    "accepts supported Discord guild channel type %i",
    (channelType) => {
      const parsed = parseRollInteraction(
        interaction({
          channel: {
            id: "1400000000000000002",
            guild_id: guildId,
            name: "dice-rolls",
            type: channelType,
          },
        }),
        { applicationId, guildId },
      );

      expect(parsed?.loggingContext).toMatchObject({
        kind: "guild",
        channelType,
      });
    },
  );

  it("accepts a direct-message command alongside the configured guild", () => {
    const dm = interaction({
      guild_id: undefined,
      guild: undefined,
      channel: { id: "1400000000000000002", type: 1 },
      member: undefined,
      user: { id: "1400000000000000003", username: "roller" },
      data: {
        id: "1400000000000000001",
        name: "roll",
        type: 1,
        options: [{ name: "notation", type: 3, value: "2d20 1d10" }],
      },
    });

    expect(parseRollInteraction(dm, { applicationId, guildId })).toMatchObject({
      guildId: null,
      loggingContext: {
        kind: "dm",
        channelId: "1400000000000000002",
      },
      userId: "1400000000000000003",
      username: "roller",
      notation: "2d20 1d10",
      title: null,
      repetitions: 1,
    });

    expect(
      parseRollInteraction(
        { ...dm, channel: { id: "1400000000000000002" } },
        { applicationId, guildId },
      )?.loggingContext,
    ).toEqual({ kind: "dm", channelId: "1400000000000000002" });
  });

  it("preserves routing and first-error precedence", () => {
    expect(() =>
      parseRollInteraction(null, { applicationId, guildId })
    ).toThrow("Interaction must be an object");
    expect(() =>
      parseRollInteraction(
        interaction({ application_id: "bad", token: "" }),
        { applicationId, guildId },
      )
    ).toThrow("Interaction application_id must be a Discord Snowflake");
    expect(
      parseRollInteraction(
        interaction({
          application_id: "100000000000000004",
          token: "",
        }),
        { applicationId, guildId },
      ),
    ).toBeNull();
    expect(
      parseRollInteraction(
        interaction({
          token: "",
          data: { name: "status", type: 1 },
        }),
        { applicationId, guildId },
      ),
    ).toBeNull();
    expect(() =>
      parseRollInteraction(interaction({ token: "" }), {
        applicationId,
        guildId,
      })
    ).toThrow("Interaction token is invalid");
  });

  it("keeps logging contexts strict and guild/DM consistent", () => {
    expect(() =>
      parseRollLoggingContext(
        {
          kind: "dm",
          channelId: "1400000000000000002",
          extra: true,
        },
        null,
        "1400000000000000002",
      )
    ).toThrow("Roll logging context is invalid");
    expect(() =>
      parseRollLoggingContext(
        { kind: "dm", channelId: "1400000000000000002" },
        guildId,
        "1400000000000000002",
      )
    ).toThrow("Roll logging context is invalid");
    expect(() =>
      parseRollLoggingContext(
        {
          kind: "guild",
          guildId,
          guildName: "Fixture Guild",
          channelId: "1400000000000000002",
          channelName: "dice-rolls",
          channelType: 0,
        },
        null,
        "1400000000000000002",
      )
    ).toThrow("Roll logging context is invalid");
  });

  it.each([
    { application_id: "100000000000000004" },
    { guild_id: "100000000000000003" },
    { type: 3 },
    { data: { id: "1400000000000000001", name: "status", type: 1 } },
  ])("ignores interactions outside the configured command scope", (overrides) => {
    expect(
      parseRollInteraction(interaction(overrides), {
        applicationId,
        guildId,
      }),
    ).toBeNull();
  });

  it.each([
    {
      overrides: { guild: undefined },
      expected: {
        guildName: null,
        channelName: "dice-rolls",
        channelType: 0,
      },
      reasons: ["guild-object-missing"],
    },
    {
      overrides: {
        channel: {
          id: "1400000000000000002",
          guild_id: guildId,
        },
      },
      expected: {
        guildName: "Fixture Guild",
        channelName: null,
        channelType: null,
      },
      reasons: ["channel-name-missing", "channel-type-missing"],
    },
    {
      overrides: { channel: undefined },
      expected: {
        guildName: "Fixture Guild",
        channelName: null,
        channelType: null,
      },
      reasons: ["channel-object-missing"],
    },
    {
      overrides: { guild: undefined, channel: undefined },
      expected: {
        guildName: null,
        channelName: null,
        channelType: null,
      },
      reasons: ["guild-object-missing", "channel-object-missing"],
    },
  ])(
    "preserves independently available guild interaction metadata %#",
    ({ overrides, expected, reasons }) => {
      const value = interaction(overrides);
      expect(
        parseRollInteraction(value, {
          applicationId,
          guildId,
        })?.loggingContext,
      ).toEqual({
        kind: "guild",
        guildId,
        channelId: "1400000000000000002",
        ...expected,
      });
      expect(rollInteractionContextMissingReasons(value, guildId)).toEqual(
        reasons,
      );
    },
  );

  it.each([
    { token: "" },
    { channel_id: "not-a-snowflake" },
    { channel: { id: "1400000000000000009", name: "other", type: 0 } },
    { guild: { id: "100000000000000003", name: "Other Guild" } },
    { member: {} },
    {
      member: {
        user: { id: "1400000000000000003", username: "" },
      },
    },
    { data: { id: "1400000000000000001", name: "roll", type: 1 } },
    {
      data: {
        id: "1400000000000000001",
        name: "roll",
        type: 1,
        options: [{ name: "notation", type: 3, value: "" }],
      },
    },
    {
      data: {
        id: "1400000000000000001",
        name: "roll",
        type: 1,
        options: [
          { name: "notation", type: 3, value: "1d6" },
          { name: "times", type: 3, value: "abc" },
        ],
      },
    },
    {
      data: {
        id: "1400000000000000001",
        name: "roll",
        type: 1,
        options: [
          { name: "notation", type: 3, value: "1d6" },
          { name: "timestorepeat", type: 3, value: "3" },
        ],
      },
    },
    {
      data: {
        id: "1400000000000000001",
        name: "roll",
        type: 1,
        options: [
          { name: "notation", type: 3, value: "1d6" },
          { name: "unknown", type: 3, value: "value" },
        ],
      },
    },
  ])("rejects malformed controlled roll data", (overrides) => {
    expect(() =>
      parseRollInteraction(interaction(overrides), {
        applicationId,
        guildId,
      }),
    ).toThrow();
  });
});
