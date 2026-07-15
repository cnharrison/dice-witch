import { describe, expect, it } from "vitest";
import {
  buildStatusCommandResponse,
  parseStatusCommandInteraction,
} from "../../packages/discord-contracts/src";

const applicationId = "100000000000000001";
const guildId = "100000000000000002";
const createdAt = 1_783_800_000_000;
const interactionId = String(
  (BigInt(createdAt) - 1_420_070_400_000n) << 22n,
);
const links = {
  inviteUrl:
    "https://discord.com/api/oauth2/authorize?client_id=100000000000000001&permissions=0&scope=bot%20applications.commands",
  supportUrl: "https://discord.gg/example",
};

describe("HTTP status command contract", () => {
  it("accepts the status command in the guild and bot DMs", () => {
    for (const scope of [{ guild_id: guildId }, {}]) {
      expect(
        parseStatusCommandInteraction(
          {
            id: interactionId,
            application_id: applicationId,
            type: 2,
            token: "fixture.interaction.token",
            ...scope,
            data: { name: "status", type: 1 },
          },
          applicationId,
          guildId,
        ),
      ).toEqual({ createdAt });
    }
  });

  it("builds the legacy public status embed from private snapshots", () => {
    expect(
      buildStatusCommandResponse(
        { createdAt },
        {
          phase: "idle",
          shardCount: 2,
          shards: [
            { id: 0, state: "ready", ping: 25 },
            { id: 1, state: "connecting", ping: -1 },
          ],
        },
        {
          totalGuilds: 3,
          totalMembers: 50,
          guildCounts: [2, 1],
        },
        links,
        createdAt + 30,
      ),
    ).toMatchObject({
      type: 4,
      data: {
        embeds: [
          {
            color: 10066329,
            title: "Status",
            description:
              "Latency: **30ms**\nI'm in **3** discord servers with **50** users 😈\n\n__Shard Status:__\n🟢 Shard 0: Online (2 servers, 25ms)\n🟢 Shard 1: Online (1 servers, unknown)\n",
          },
        ],
      },
    });
  });

  it("fails closed on an incomplete shard snapshot", () => {
    expect(() =>
      buildStatusCommandResponse(
        { createdAt },
        { phase: "idle", shardCount: 2, shards: [] },
        { totalGuilds: 0, totalMembers: 0, guildCounts: [0, 0] },
        links,
        createdAt,
      ),
    ).toThrow("Status response input is invalid");
  });
});
