import assert from "node:assert/strict";
import test from "node:test";
import { validateAudienceSnapshotRows } from "./verify-audience-snapshot.mjs";

const now = 1_767_225_600_123;
const row = {
  version: 1,
  captured_at: now - 1_000,
  live_guilds: 3,
  estimated_guild_memberships: 120,
  known_dice_witch_users: 7,
  shard_count: 2,
  guild_counts_by_shard_json: "[2,1]",
};

test("accepts one fresh internally consistent audience snapshot", () => {
  assert.deepEqual(validateAudienceSnapshotRows([row], now, 10_000), {
    version: 1,
    capturedAt: now - 1_000,
    liveGuilds: 3,
    estimatedGuildMemberships: 120,
    knownDiceWitchUsers: 7,
    shardCount: 2,
    guildCountsByShard: [2, 1],
  });
});

test("rejects missing, stale, future, and inconsistent snapshots", () => {
  for (const rows of [
    [],
    [{ ...row, captured_at: now - 10_001 }],
    [{ ...row, captured_at: now + 1 }],
    [{ ...row, guild_counts_by_shard_json: "[3,1]" }],
  ]) {
    assert.throws(
      () => validateAudienceSnapshotRows(rows, now, 10_000),
      /Audience snapshot gate failed/,
    );
  }
});
