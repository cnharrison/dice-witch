import { describe, expect, it } from "vitest";
import {
  DISCORD_GLOBAL_COMMANDS,
  parseSavedRollInteraction,
} from "../../packages/discord-contracts/src";

const scope = {
  applicationId: "100000000000000001",
  guildId: "100000000000000002",
};

function interaction(
  type: 2 | 3 | 4 | 5,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: "100000000000000010",
    application_id: scope.applicationId,
    type,
    token: "fixture.interaction.token",
    guild_id: scope.guildId,
    guild: { id: scope.guildId, name: "Fixture Guild" },
    channel_id: "100000000000000003",
    channel: {
      id: "100000000000000003",
      guild_id: scope.guildId,
      name: "dice-rolls",
      type: 0,
    },
    member: {
      user: { id: "100000000000000004", username: "alice" },
    },
    data,
  };
}

describe("saved-roll Discord contract", () => {
  it("registers one stable guild-install command for guild and bot-DM contexts", () => {
    expect(DISCORD_GLOBAL_COMMANDS.at(-1)).toEqual({
      type: 1,
      name: "library",
      description: "Runs a roll from your Library",
      integration_types: [0],
      contexts: [0, 1],
      options: [
        {
          name: "name",
          description: "Personal or Server Library roll",
          type: 3,
          required: false,
          autocomplete: true,
        },
      ],
    });
  });

  it("parses picker, opaque direct-run, and autocomplete commands", () => {
    expect(
      parseSavedRollInteraction(
        interaction(2, { name: "library", type: 1 }),
        scope,
      ),
    ).toMatchObject({ kind: "command", selection: null, userId: "100000000000000004" });

    expect(
      parseSavedRollInteraction(
        interaction(2, {
          name: "library",
          type: 1,
          options: [
            {
              name: "name",
              type: 3,
              value: "mine:123e4567-e89b-42d3-a456-426614174000",
            },
          ],
        }),
        scope,
      ),
    ).toMatchObject({
      kind: "command",
      selection: "mine:123e4567-e89b-42d3-a456-426614174000",
    });

    expect(
      parseSavedRollInteraction(
        interaction(4, {
          name: "library",
          type: 1,
          options: [
            { name: "name", type: 3, value: "att", focused: true },
          ],
        }),
        scope,
      ),
    ).toMatchObject({ kind: "autocomplete", query: "att" });

    expect(
      parseSavedRollInteraction(
        interaction(2, { name: "saved-roll", type: 1 }),
        scope,
      ),
    ).toBeNull();
  });

  it("preserves channel metadata when Discord omits the optional guild object", () => {
    const value = interaction(2, { name: "library", type: 1 });
    delete value.guild;

    expect(parseSavedRollInteraction(value, scope)).toMatchObject({
      kind: "command",
      loggingContext: {
        kind: "guild",
        guildId: scope.guildId,
        guildName: null,
        channelId: "100000000000000003",
        channelName: "dice-rolls",
        channelType: 0,
      },
    });
  });

  it("parses actor-bound one-click runs and rejects malformed component values", () => {
    const sessionId = "100000000000000020";
    expect(
      parseSavedRollInteraction(
        interaction(3, {
          custom_id: `saved-roll:v1:${sessionId}:run:server:123e4567-e89b-42d3-a456-426614174000`,
          component_type: 2,
        }),
        scope,
      ),
    ).toMatchObject({
      kind: "component",
      action: "run",
      sessionId,
      selection: "server:123e4567-e89b-42d3-a456-426614174000",
    });

    expect(() =>
      parseSavedRollInteraction(
        interaction(3, {
          custom_id: `saved-roll:v1:${sessionId}:run:server:not-a-uuid`,
          component_type: 2,
        }),
        scope,
      ),
    ).toThrow("Saved roll component selection is invalid");
  });

  it("parses a bounded actor-bound rename modal", () => {
    expect(
      parseSavedRollInteraction(
        interaction(5, {
          custom_id: "saved-roll:v1:100000000000000020:rename",
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "saved-roll-name",
                  value: "Attack copy",
                },
              ],
            },
          ],
        }),
        scope,
      ),
    ).toMatchObject({
      kind: "modal",
      sessionId: "100000000000000020",
      name: "Attack copy",
      userId: "100000000000000004",
    });
  });

  it("allows bot-DM Mine access and rejects unrelated private-channel contexts", () => {
    const dm = interaction(2, { name: "library", type: 1 });
    delete dm.guild_id;
    delete dm.guild;
    delete dm.member;
    dm.user = { id: "100000000000000004", username: "alice" };
    dm.channel = { id: "100000000000000003", type: 1 };
    expect(parseSavedRollInteraction(dm, scope)).toMatchObject({
      kind: "command",
      guildId: null,
    });

    (dm.channel as Record<string, unknown>).type = 3;
    expect(() => parseSavedRollInteraction(dm, scope)).toThrow(
      "Saved roll channel is invalid",
    );
  });
});
