import {
  isDiscordRollChannelType,
  type DiscordChannelContextSourceV1,
  type DiscordChannelDirectoryMutationV1,
  type DiscordRollChannelType,
} from "../../../packages/discord-contracts/src";

export const DISCORD_CHANNEL_DIRECTORY_TTL_MS = 24 * 60 * 60 * 1_000;

export type DiscordChannelDirectoryLookup =
  | Readonly<{
      status: "resolved";
      channelName: string;
      channelType: DiscordRollChannelType;
      source: DiscordChannelContextSourceV1;
      observedAt: number;
    }>
  | Readonly<{
      status: "deleted";
      source: DiscordChannelContextSourceV1;
      observedAt: number;
    }>;

export type DiscordChannelDirectoryMutationResult = Readonly<{
  status: "applied" | "existing";
}>;

type DirectoryRow = {
  channel_name: string | null;
  channel_type: number | null;
  source: DiscordChannelContextSourceV1;
  is_deleted: number;
  observed_at: number;
};

export class D1DiscordChannelDirectoryRepository {
  constructor(private readonly db: D1Database) {}

  async apply(
    mutation: DiscordChannelDirectoryMutationV1,
    receivedAt: number,
  ): Promise<DiscordChannelDirectoryMutationResult> {
    const deleted = mutation.operation === "delete";
    const result = await this.db.prepare(
      `INSERT INTO discord_channel_directory (
         channel_id, guild_id, channel_name, channel_type, source,
         is_deleted, observed_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET
         guild_id = excluded.guild_id,
         channel_name = excluded.channel_name,
         channel_type = excluded.channel_type,
         source = excluded.source,
         is_deleted = excluded.is_deleted,
         observed_at = excluded.observed_at,
         expires_at = excluded.expires_at
       WHERE excluded.observed_at > discord_channel_directory.observed_at
          OR (
            excluded.observed_at = discord_channel_directory.observed_at
            AND (
              excluded.is_deleted = 1
              OR discord_channel_directory.is_deleted = 0
            )
          )`,
    ).bind(
      mutation.channelId,
      mutation.guildId,
      deleted ? null : mutation.channelName,
      deleted ? null : mutation.channelType,
      mutation.source,
      deleted ? 1 : 0,
      mutation.observedAt,
      receivedAt + DISCORD_CHANNEL_DIRECTORY_TTL_MS,
    ).run();
    return { status: result.meta.changes === 1 ? "applied" : "existing" };
  }

  async find(
    guildId: string,
    channelId: string,
    now: number,
  ): Promise<DiscordChannelDirectoryLookup | null> {
    const row = await this.db.prepare(
      `SELECT channel_name, channel_type, source, is_deleted, observed_at
       FROM discord_channel_directory
       WHERE channel_id = ? AND guild_id = ? AND expires_at > ?`,
    ).bind(channelId, guildId, now).first<DirectoryRow>();
    if (row === null) return null;
    if (row.is_deleted === 1) {
      return {
        status: "deleted",
        source: row.source,
        observedAt: row.observed_at,
      };
    }
    if (
      row.is_deleted !== 0 ||
      row.channel_name === null ||
      !isDiscordRollChannelType(row.channel_type)
    ) {
      throw new Error("Discord channel directory row is invalid");
    }
    return {
      status: "resolved",
      channelName: row.channel_name,
      channelType: row.channel_type,
      source: row.source,
      observedAt: row.observed_at,
    };
  }

  async deleteExpired(now: number): Promise<number> {
    const result = await this.db.prepare(
      "DELETE FROM discord_channel_directory WHERE expires_at <= ?",
    ).bind(now).run();
    return result.meta.changes;
  }
}
