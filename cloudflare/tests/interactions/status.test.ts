import { describe, expect, it } from "vitest";
import {
  buildStatusCommandResponse,
  DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS,
  parseStatusCommandInteraction,
} from "../../packages/discord-contracts/src";

const applicationId = "100000000000000001";
const guildId = "100000000000000002";
const createdAt = 1_783_800_000_000;
const snapshotCapturedAt = createdAt - 1_000;
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

  it("builds public status from one versioned audience snapshot", () => {
    const response = buildStatusCommandResponse(
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
        version: 1,
        capturedAt: snapshotCapturedAt,
        liveGuilds: 3,
        estimatedGuildMemberships: 50,
        knownDiceWitchUsers: 7,
        shardCount: 2,
        guildCountsByShard: [2, 1],
      },
      links,
      createdAt + 30,
    );
    expect(response).toMatchObject({
      type: 4,
      data: { flags: 1 << 15 },
    });
    expect(JSON.stringify(response)).toContain(
      "## Status\\nLatency: **30ms**\\nI'm in **3** discord servers with **7** users 😈\\n\\n__Shard Status:__\\n🟢 Shard 0: Online (2 servers, 25ms)\\n🟢 Shard 1: Online (1 servers, unknown)\\n",
    );
  });

  it("rejects audience snapshots beyond the freshness window", () => {
    expect(() =>
      buildStatusCommandResponse(
        { createdAt },
        {
          phase: "idle",
          shardCount: 1,
          shards: [{ id: 0, state: "ready", ping: 25 }],
        },
        {
          version: 1,
          capturedAt:
            createdAt - DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS - 1,
          liveGuilds: 1,
          estimatedGuildMemberships: 42,
          knownDiceWitchUsers: 7,
          shardCount: 1,
          guildCountsByShard: [1],
        },
        links,
        createdAt,
      ),
    ).toThrow("Status response input is invalid");
  });

  it("fails closed on an incomplete shard snapshot", () => {
    expect(() =>
      buildStatusCommandResponse(
        { createdAt },
        { phase: "idle", shardCount: 2, shards: [] },
        {
          version: 1,
          capturedAt: snapshotCapturedAt,
          liveGuilds: 0,
          estimatedGuildMemberships: 0,
          knownDiceWitchUsers: 0,
          shardCount: 2,
          guildCountsByShard: [0, 0],
        },
        links,
        createdAt,
      ),
    ).toThrow("Status response input is invalid");
  });
});
