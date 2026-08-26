import type { SchemaInput } from "../../../packages/discord-contracts/src/schema-primitives";
import {
  DISCORD_AUDIENCE_SNAPSHOT_VERSION,
  parseDiscordAudienceCaptureV1,
  parseDiscordAudienceSnapshotV1,
  type DiscordAudienceCaptureV1,
  type DiscordAudienceSnapshotV1,
} from "../../../packages/discord-contracts/src";

export type StoreAudienceSnapshotResult =
  | { status: "applied" | "existing"; snapshot: DiscordAudienceSnapshotV1 }
  | { status: "stale"; snapshot: DiscordAudienceSnapshotV1 }
  | { status: "conflict" };

type AudienceSnapshotRow = {
  version: number;
  captured_at: number;
  live_guilds: number;
  estimated_guild_memberships: number;
  known_dice_witch_users: number;
  shard_count: number;
  guild_counts_by_shard_json: string;
};

function rowToSnapshot(row: AudienceSnapshotRow): DiscordAudienceSnapshotV1 {
  let guildCountsByShard: unknown;
  try {
    guildCountsByShard = JSON.parse(row.guild_counts_by_shard_json);
  } catch {
    throw new Error("Stored Discord audience snapshot is invalid");
  }
  return parseDiscordAudienceSnapshotV1({
    version: row.version,
    capturedAt: row.captured_at,
    liveGuilds: row.live_guilds,
    estimatedGuildMemberships: row.estimated_guild_memberships,
    knownDiceWitchUsers: row.known_dice_witch_users,
    shardCount: row.shard_count,
    guildCountsByShard,
  });
}

function sameCapture(
  snapshot: DiscordAudienceSnapshotV1,
  capture: DiscordAudienceCaptureV1,
): boolean {
  return (
    snapshot.capturedAt === capture.capturedAt &&
    snapshot.liveGuilds === capture.liveGuilds &&
    snapshot.estimatedGuildMemberships === capture.estimatedGuildMemberships &&
    snapshot.shardCount === capture.shardCount &&
    JSON.stringify(snapshot.guildCountsByShard) ===
      JSON.stringify(capture.guildCountsByShard)
  );
}

export class D1AudienceSnapshotRepository {
  constructor(private readonly db: D1Database) {}

  async read(): Promise<DiscordAudienceSnapshotV1 | null> {
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT version, captured_at, live_guilds,
                estimated_guild_memberships, known_dice_witch_users,
                shard_count, guild_counts_by_shard_json
         FROM discord_audience_snapshot
         WHERE singleton = 1`,
      )
      .first<AudienceSnapshotRow>();
    return row === null ? null : rowToSnapshot(row);
  }

  async store(
    value: SchemaInput,
    now = Date.now(),
  ): Promise<StoreAudienceSnapshotResult> {
    const capture = parseDiscordAudienceCaptureV1(value);
    if (!Number.isSafeInteger(now) || now < 0 || capture.capturedAt > now) {
      throw new Error("Discord audience capture is invalid");
    }
    const guildCountsJson = JSON.stringify(capture.guildCountsByShard);
    const stored = await this.db
      .prepare(
        `INSERT INTO discord_audience_snapshot (
           singleton, version, captured_at, live_guilds,
           estimated_guild_memberships, known_dice_witch_users,
           shard_count, guild_counts_by_shard_json
         )
         VALUES (
           1, ?, ?, ?, ?, (SELECT COUNT(*) FROM users), ?, ?
         )
         ON CONFLICT(singleton) DO UPDATE SET
           version = excluded.version,
           captured_at = excluded.captured_at,
           live_guilds = excluded.live_guilds,
           estimated_guild_memberships = excluded.estimated_guild_memberships,
           known_dice_witch_users = excluded.known_dice_witch_users,
           shard_count = excluded.shard_count,
           guild_counts_by_shard_json = excluded.guild_counts_by_shard_json
         WHERE excluded.captured_at > discord_audience_snapshot.captured_at
         RETURNING version, captured_at, live_guilds,
                   estimated_guild_memberships, known_dice_witch_users,
                   shard_count, guild_counts_by_shard_json`,
      )
      .bind(
        DISCORD_AUDIENCE_SNAPSHOT_VERSION,
        capture.capturedAt,
        capture.liveGuilds,
        capture.estimatedGuildMemberships,
        capture.shardCount,
        guildCountsJson,
      )
      .first<AudienceSnapshotRow>();
    if (stored !== null) {
      return { status: "applied", snapshot: rowToSnapshot(stored) };
    }

    const existing = await this.read();
    if (existing === null) {
      throw new Error("Discord audience snapshot write failed");
    }
    if (existing.capturedAt > capture.capturedAt) {
      return { status: "stale", snapshot: existing };
    }
    if (sameCapture(existing, capture)) {
      return { status: "existing", snapshot: existing };
    }
    return { status: "conflict" };
  }
}
