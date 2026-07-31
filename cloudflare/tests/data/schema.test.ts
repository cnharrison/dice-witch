import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

const guildId = "100000000000000002";
const userId = "100000000000000003";
const timestamp = 1_767_225_600_123;

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM game_detections"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_rank_jobs"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_rolls"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_sessions"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_daily_aggregates"),
    dataEnv.DATA.prepare("DELETE FROM discord_audience_snapshot"),
    dataEnv.DATA.prepare("DELETE FROM saved_rolls"),
    dataEnv.DATA.prepare("DELETE FROM guild_saved_roll_lists"),
    dataEnv.DATA.prepare("DELETE FROM user_saved_roll_lists"),
    dataEnv.DATA.prepare("DELETE FROM guild_appearance_profiles"),
    dataEnv.DATA.prepare("DELETE FROM user_appearance_profiles"),
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM interaction_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
    dataEnv.DATA.prepare("DELETE FROM stats"),
  ]);
});

async function tableNames(): Promise<string[]> {
  const result = await dataEnv.DATA.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
  ).all<{ name: string }>();
  return result.results.map((row) => row.name);
}

async function insertGuild(id = guildId): Promise<void> {
  await dataEnv.DATA.prepare(
    `INSERT INTO guilds (
       id, name, icon, owner_id, member_count, approximate_member_count,
       preferred_locale, joined_timestamp, roll_count, skip_dice_delay,
       created_at, updated_at, is_active
     ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      "Fixture Guild",
      "100000000000000005",
      42,
      42,
      "en-US",
      timestamp,
      7,
      0,
      timestamp,
      timestamp,
      1,
    )
    .run();
}

async function insertUser(id = userId): Promise<void> {
  await dataEnv.DATA.prepare(
    `INSERT INTO users (
       id, username, email, last_web_login, flags, discriminator, avatar,
       roll_count, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      "fixture-user",
      "fixture@example.com",
      timestamp,
      64,
      "0",
      null,
      11,
      timestamp,
      timestamp,
    )
    .run();
}

describe("D1 business schema migration", () => {
  it("creates the business and idempotency tables as STRICT tables", async () => {
    expect(await tableNames()).toEqual(
      expect.arrayContaining([
        "discord_audience_snapshot",
        "game_detection_control",
        "game_detection_daily_aggregates",
        "game_detection_rank_jobs",
        "game_detection_rolls",
        "game_detection_sessions",
        "game_detections",
        "guild_appearance_profiles",
        "guilds",
        "mutation_receipts",
        "interaction_receipts",
        "oauth_states",
        "stats",
        "user_appearance_profiles",
        "users",
        "users_guilds",
        "web_sessions",
      ]),
    );

    const tableList = await dataEnv.DATA.prepare("PRAGMA table_list").all<{
      name: string;
      strict: number;
    }>();
    for (const name of [
      "discord_audience_snapshot",
      "game_detection_control",
      "game_detection_daily_aggregates",
      "game_detection_rank_jobs",
      "game_detection_rolls",
      "game_detection_sessions",
      "game_detections",
      "guild_appearance_profiles",
      "guilds",
      "mutation_receipts",
      "interaction_receipts",
      "oauth_states",
      "stats",
      "user_appearance_profiles",
      "users",
      "users_guilds",
      "web_sessions",
    ]) {
      expect(tableList.results).toContainEqual(
        expect.objectContaining({ name, strict: 1 }),
      );
    }
  });

  it("preserves retained business columns with explicit SQLite names", async () => {
    async function columns(table: string): Promise<string[]> {
      const result = await dataEnv.DATA.prepare(
        `PRAGMA table_info(${table})`,
      ).all<{ name: string }>();
      return result.results.map((row) => row.name);
    }

    await expect(columns("discord_audience_snapshot")).resolves.toEqual([
      "singleton",
      "version",
      "captured_at",
      "live_guilds",
      "estimated_guild_memberships",
      "known_dice_witch_users",
      "shard_count",
      "guild_counts_by_shard_json",
    ]);
    await expect(columns("guilds")).resolves.toEqual([
      "id",
      "name",
      "icon",
      "owner_id",
      "member_count",
      "approximate_member_count",
      "preferred_locale",
      "joined_timestamp",
      "roll_count",
      "skip_dice_delay",
      "created_at",
      "updated_at",
      "is_active",
    ]);
    await expect(columns("users")).resolves.toEqual([
      "id",
      "username",
      "email",
      "last_web_login",
      "flags",
      "discriminator",
      "avatar",
      "roll_count",
      "created_at",
      "updated_at",
    ]);
    await expect(columns("users_guilds")).resolves.toEqual([
      "id",
      "user_id",
      "guild_id",
      "is_admin",
      "is_dice_witch_admin",
      "created_at",
      "updated_at",
    ]);
    await expect(columns("stats")).resolves.toEqual([
      "id",
      "rolls",
      "dice",
      "users",
      "total_count",
      "created_at",
      "updated_at",
    ]);
    await expect(columns("web_sessions")).resolves.toEqual([
      "token_hash",
      "user_id",
      "created_at",
      "expires_at",
      "revoked_at",
    ]);
    await expect(columns("oauth_states")).resolves.toEqual([
      "state_hash",
      "created_at",
      "expires_at",
      "consumed_at",
    ]);
    await expect(columns("user_appearance_profiles")).resolves.toEqual([
      "user_id",
      "revision",
      "profile_json",
      "updated_at",
    ]);
    await expect(columns("guild_appearance_profiles")).resolves.toEqual([
      "guild_id",
      "revision",
      "profile_json",
      "updated_by_user_id",
      "updated_at",
    ]);
  });

  it("stores V1 and V2 appearance documents in the existing JSON columns", async () => {
    await insertUser();
    await insertGuild();
    await dataEnv.DATA.batch([
      dataEnv.DATA.prepare(
        `INSERT INTO user_appearance_profiles (
           user_id, revision, profile_json, updated_at
         ) VALUES (?, 1, ?, ?)`,
      ).bind(userId, JSON.stringify({ version: 1 }), timestamp),
      dataEnv.DATA.prepare(
        `INSERT INTO guild_appearance_profiles (
           guild_id, revision, profile_json, updated_by_user_id, updated_at
         ) VALUES (?, 1, ?, ?, ?)`,
      ).bind(
        guildId,
        JSON.stringify({ version: 2 }),
        userId,
        timestamp,
      ),
    ]);

    const versions = await dataEnv.DATA.prepare(
      `SELECT 'personal' AS owner,
              json_extract(profile_json, '$.version') AS version
       FROM user_appearance_profiles
       UNION ALL
       SELECT 'guild' AS owner,
              json_extract(profile_json, '$.version') AS version
       FROM guild_appearance_profiles
       ORDER BY owner DESC`,
    ).all<{ owner: string; version: number }>();
    expect(versions.results).toEqual([
      { owner: "personal", version: 1 },
      { owner: "guild", version: 2 },
    ]);
  });

  it("applies the versioned migration idempotently", async () => {
    await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);

    const applied = await dataEnv.DATA.prepare(
      "SELECT name FROM d1_migrations ORDER BY id",
    ).all<{ name: string }>();
    expect(applied.results).toEqual([
      { name: "0001_initial_business_schema.sql" },
      { name: "0002_web_sessions.sql" },
      { name: "0003_mutation_receipts.sql" },
      { name: "0004_appearance_profiles.sql" },
      { name: "0005_discord_audience_snapshot.sql" },
      { name: "0006_saved_rolls.sql" },
      { name: "0007_saved_roll_manual_order.sql" },
      { name: "0008_saved_roll_name_color.sql" },
      { name: "0009_roll_lifecycle_receipts.sql" },
      { name: "0010_game_detection_telemetry.sql" },
      { name: "0011_game_detection_display_context.sql" },
      { name: "0012_game_detection_active_play.sql" },
    ]);
  });

  it("applies legacy boolean and timestamp defaults", async () => {
    await dataEnv.DATA.prepare("INSERT INTO guilds (id) VALUES (?)")
      .bind(guildId)
      .run();
    const guild = await dataEnv.DATA.prepare(
      "SELECT skip_dice_delay, is_active, typeof(created_at) AS timestamp_type FROM guilds WHERE id = ?",
    )
      .bind(guildId)
      .first<{
        skip_dice_delay: number;
        is_active: number;
        timestamp_type: string;
      }>();
    expect(guild).toEqual({
      skip_dice_delay: 0,
      is_active: 1,
      timestamp_type: "integer",
    });
  });

  it("preserves representative guild, user, membership, and nullable fields", async () => {
    await insertGuild();
    await insertUser();
    await dataEnv.DATA.prepare(
      `INSERT INTO users_guilds (
         user_id, guild_id, is_admin, is_dice_witch_admin, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userId, guildId, 1, 0, timestamp, timestamp)
      .run();
    await dataEnv.DATA.prepare(
      "INSERT INTO stats (rolls, dice, users, total_count, created_at, updated_at) VALUES (NULL, NULL, NULL, NULL, ?, ?)",
    )
      .bind(timestamp, timestamp)
      .run();

    const guild = await dataEnv.DATA.prepare(
      "SELECT * FROM guilds WHERE id = ?",
    )
      .bind(guildId)
      .first();
    expect(guild).toMatchObject({
      id: guildId,
      icon: null,
      owner_id: "100000000000000005",
      roll_count: 7,
      skip_dice_delay: 0,
      is_active: 1,
      created_at: timestamp,
    });

    const membership = await dataEnv.DATA.prepare(
      "SELECT user_id, guild_id, is_admin, is_dice_witch_admin FROM users_guilds",
    ).first();
    expect(membership).toEqual({
      user_id: userId,
      guild_id: guildId,
      is_admin: 1,
      is_dice_witch_admin: 0,
    });
  });

  it("keeps retained legacy identifiers as text", async () => {
    await insertGuild();
    const row = await dataEnv.DATA.prepare(
      "SELECT id, typeof(id) AS storage_type FROM guilds WHERE id = ?",
    )
      .bind(guildId)
      .first<{ id: string; storage_type: string }>();

    expect(row).toEqual({ id: guildId, storage_type: "text" });
  });

  it("enforces boolean, length, uniqueness, and foreign-key constraints", async () => {
    await insertGuild();
    await insertUser();

    await expect(
      insertUser("100000000000000004"),
    ).rejects.toThrow(/unique/i);
    await expect(
      dataEnv.DATA.prepare(
        "UPDATE guilds SET skip_dice_delay = 2 WHERE id = ?",
      )
        .bind(guildId)
        .run(),
    ).rejects.toThrow(/constraint/i);
    await expect(
      dataEnv.DATA.prepare("UPDATE guilds SET name = ? WHERE id = ?")
        .bind("x".repeat(256), guildId)
        .run(),
    ).rejects.toThrow(/constraint/i);

    const membership = dataEnv.DATA.prepare(
      "INSERT INTO users_guilds (user_id, guild_id) VALUES (?, ?)",
    );
    await membership.bind(userId, guildId).run();
    await expect(membership.bind(userId, guildId).run()).rejects.toThrow(
      /unique/i,
    );
    await expect(
      membership.bind("100000000000000099", guildId).run(),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      dataEnv.DATA.prepare("DELETE FROM guilds WHERE id = ?")
        .bind(guildId)
        .run(),
    ).rejects.toThrow(/foreign key/i);
  });

  it("preserves nullable legacy membership semantics", async () => {
    const insert = dataEnv.DATA.prepare(
      "INSERT INTO users_guilds (user_id, guild_id) VALUES (NULL, NULL)",
    );
    await insert.run();
    await insert.run();

    const count = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM users_guilds",
    ).first<{ count: number }>();
    expect(count?.count).toBe(2);
  });

  it("supports non-negative counter updates", async () => {
    await insertGuild();
    await dataEnv.DATA.prepare(
      "UPDATE guilds SET roll_count = roll_count + 1, updated_at = ? WHERE id = ?",
    )
      .bind(timestamp + 1, guildId)
      .run();

    const guild = await dataEnv.DATA.prepare(
      "SELECT roll_count, updated_at FROM guilds WHERE id = ?",
    )
      .bind(guildId)
      .first<{ roll_count: number; updated_at: number }>();
    expect(guild).toEqual({ roll_count: 8, updated_at: timestamp + 1 });
    await expect(
      dataEnv.DATA.prepare("UPDATE guilds SET roll_count = -1 WHERE id = ?")
        .bind(guildId)
        .run(),
    ).rejects.toThrow(/constraint/i);
  });

  it("deduplicates interaction and mutation receipts", async () => {
    await dataEnv.DATA.prepare(
      `INSERT INTO interaction_receipts (
         interaction_id, command_name, guild_id, user_id, received_at, accounted_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "100000000000000010",
        "roll",
        guildId,
        userId,
        timestamp,
        timestamp,
      )
      .run();

    await expect(
      dataEnv.DATA.prepare(
        "INSERT INTO interaction_receipts (interaction_id, command_name, received_at) VALUES (?, ?, ?)",
      )
        .bind("100000000000000010", "roll", timestamp)
        .run(),
    ).rejects.toThrow(/unique/i);

    const receipt = dataEnv.DATA.prepare(
      `INSERT INTO mutation_receipts (
         mutation_id, entity_type, entity_key, operation,
         payload_json, occurred_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    await receipt
      .bind(
        "100000000000000010:guild",
        "guild",
        guildId,
        "upsert",
        JSON.stringify({ isActive: true }),
        timestamp,
      )
      .run();
    await expect(
      receipt.bind(
        "100000000000000011:guild",
        "guild",
        guildId,
        "upsert",
        "not-json",
        timestamp,
      ).run(),
    ).rejects.toThrow(/constraint/i);
  });

  it("creates the indexes required by application queries", async () => {
    const indexes = await dataEnv.DATA.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'index'",
    ).all<{ name: string }>();
    expect(indexes.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "idx_guilds_active",
        "idx_interaction_receipts_unaccounted",
        "idx_oauth_states_unconsumed_expiry",
        "idx_users_guilds_guild_id",
        "idx_web_sessions_active_expiry",
      ]),
    );
  });
});
