import { describe, expect, it } from "vitest";
import { parseRollInteraction } from "../../packages/discord-contracts/src";
import { buildRollDeliveryPayload } from "../../packages/discord-contracts/src";

const applicationId = "100000000000000001";
const guildId = "100000000000000002";

function interaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "1400000000000000000",
    application_id: applicationId,
    guild_id: guildId,
    type: 2,
    token: "interaction-token-value",
    data: { id: "1400000000000000001", name: "status", type: 1 },
    ...overrides,
  };
}

describe("buildRollDeliveryPayload", () => {
  it("passes only delivery-required fields to the roll Worker", () => {
    const parsed = parseRollInteraction(
      {
        ...interaction(),
        channel_id: "1400000000000000002",
        member: {
          user: { id: "1400000000000000003", username: "roller" },
        },
        data: {
          id: "1400000000000000001",
          name: "roll",
          type: 1,
          options: [
            { name: "notation", type: 3, value: "2d20 1d10" },
            { name: "title", type: 3, value: "Initiative" },
          ],
        },
      },
      { applicationId, guildId },
    );
    if (parsed === null) throw new Error("Roll interaction was ignored");

    expect(buildRollDeliveryPayload(parsed, 1_753_856_410_750)).toEqual({
      interaction: {
        id: "1400000000000000000",
        applicationId,
        token: "interaction-token-value",
      },
      request: { notation: "2d20 1d10", repetitions: 1 },
      message: { title: "Initiative", username: "roller" },
      accounting: {
        guildId,
        userId: "1400000000000000003",
        receivedAt: 1_753_856_410_742,
      },
      deferredAt: 1_753_856_410_750,
      logging: {
        source: "discord",
        channelId: "1400000000000000002",
        notation: "2d20 1d10",
      },
      responseMode: "followup",
    });
  });
});
