import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const secondUserId = "100000000000000004";
const guildId = "100000000000000002";
const timestamp = 1_767_225_600_123;

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM saved_rolls"),
    dataEnv.DATA.prepare("DELETE FROM guild_saved_roll_lists"),
    dataEnv.DATA.prepare("DELETE FROM user_saved_roll_lists"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
  ]);
  for (const id of [userId, secondUserId]) {
    await dataEnv.DATA.prepare(
      `INSERT INTO users (
         id, username, email, last_web_login, flags, discriminator, avatar,
         roll_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 0, '0', NULL, 0, ?, ?)`,
    )
      .bind(id, `user-${id.at(-1)}`, `${id}@example.com`, timestamp, timestamp, timestamp)
      .run();
  }
  await dataEnv.DATA.prepare(
    `INSERT INTO guilds (
       id, name, owner_id, member_count, approximate_member_count,
       preferred_locale, joined_timestamp, created_at, updated_at
     ) VALUES (?, 'Guild', ?, 2, 2, 'en-US', ?, ?, ?)`,
  )
    .bind(guildId, userId, timestamp, timestamp, timestamp)
    .run();
});

type SavedRollOwner = { userId: string; guildId?: never } | { guildId: string; userId?: never };

async function insertSavedRoll(
  id: string,
  owner: SavedRollOwner,
  comparisonKey = "fireball",
  manualOrder = 0,
  pinned = false,
): Promise<void> {
  await dataEnv.DATA.prepare(
    `INSERT INTO saved_rolls (
       id, user_id, guild_id, display_name, comparison_key, notation, title,
       repetitions, pinned, manual_order, revision, created_by_user_id,
       updated_by_user_id, created_at, updated_at
     ) VALUES (?, ?, ?, 'Fireball', ?, '8d6', NULL, 1, ?, ?, 1, ?, ?, ?, ?)`, 
  )
    .bind(
      id,
      owner.userId ?? null,
      owner.guildId ?? null,
      comparisonKey,
      pinned ? 1 : 0,
      manualOrder,
      userId,
      userId,
      timestamp,
      timestamp,
    )
    .run();
}

describe("saved-roll schema", () => {
  it("creates strict list-revision and saved-roll tables", async () => {
    const tables = await dataEnv.DATA.prepare("PRAGMA table_list").all<{
      name: string;
      strict: number;
    }>();
    for (const name of [
      "guild_saved_roll_lists",
      "saved_rolls",
      "user_saved_roll_lists",
    ]) {
      expect(tables.results).toContainEqual(
        expect.objectContaining({ name, strict: 1 }),
      );
    }

    const columns = await dataEnv.DATA.prepare(
      "PRAGMA table_info(saved_rolls)",
    ).all<{ name: string }>();
    expect(columns.results.map(({ name }) => name)).toEqual([
      "id",
      "user_id",
      "guild_id",
      "display_name",
      "comparison_key",
      "notation",
      "title",
      "repetitions",
      "pinned",
      "manual_order",
      "revision",
      "created_by_user_id",
      "updated_by_user_id",
      "created_at",
      "updated_at",
      "name_color",
    ]);
  });

  it("accepts only nullable uppercase Library roll name colors", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    await insertSavedRoll(id, { userId });

    await expect(
      dataEnv.DATA.prepare("UPDATE saved_rolls SET name_color = '#A1B2C3' WHERE id = ?")
        .bind(id)
        .run(),
    ).resolves.toBeDefined();
    await expect(
      dataEnv.DATA.prepare("UPDATE saved_rolls SET name_color = '#a1b2c3' WHERE id = ?")
        .bind(id)
        .run(),
    ).rejects.toThrow(/constraint/i);
    await expect(
      dataEnv.DATA.prepare("UPDATE saved_rolls SET name_color = '#A1B2C' WHERE id = ?")
        .bind(id)
        .run(),
    ).rejects.toThrow(/constraint/i);
    await expect(
      dataEnv.DATA.prepare("UPDATE saved_rolls SET name_color = NULL WHERE id = ?")
        .bind(id)
        .run(),
    ).resolves.toBeDefined();
  });

  it("requires exactly one valid owner and a UUIDv4 opaque id", async () => {
    await insertSavedRoll(
      "00000000-0000-4000-8000-000000000001",
      { userId },
    );
    await expect(
      insertSavedRoll("not-an-id", { userId }, "other", 1),
    ).rejects.toThrow(/constraint/i);
    await expect(
      insertSavedRoll(
        "00000000-0000-4000-8000-000000000002",
        { userId: "100000000000000099" },
        "other",
        1,
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      dataEnv.DATA.prepare(
        `INSERT INTO saved_rolls (
           id, user_id, guild_id, display_name, comparison_key, notation,
           repetitions, pinned, manual_order, revision, created_by_user_id,
           updated_by_user_id, created_at, updated_at
         ) VALUES (?, ?, ?, 'Both', 'both', '1d20', 1, 0, 2, 1, ?, ?, ?, ?)`,
      )
        .bind(
          "00000000-0000-4000-8000-000000000003",
          userId,
          guildId,
          userId,
          userId,
          timestamp,
          timestamp,
        )
        .run(),
    ).rejects.toThrow(/constraint/i);
  });

  it("enforces names and manual order per owner while keeping scopes independent", async () => {
    await insertSavedRoll(
      "00000000-0000-4000-8000-000000000001",
      { userId },
    );
    await expect(
      insertSavedRoll(
        "00000000-0000-4000-8000-000000000002",
        { userId },
        "fireball",
        1,
      ),
    ).rejects.toThrow(/unique/i);
    await expect(
      insertSavedRoll(
        "00000000-0000-4000-8000-000000000003",
        { userId },
        "other",
        0,
      ),
    ).rejects.toThrow(/unique/i);

    await insertSavedRoll(
      "00000000-0000-4000-8000-000000000004",
      { guildId },
    );
    await insertSavedRoll(
      "00000000-0000-4000-8000-000000000005",
      { userId: secondUserId },
    );
  });

  it("cascades records and list revisions with their owner", async () => {
    await dataEnv.DATA.batch([
      dataEnv.DATA.prepare(
        "INSERT INTO user_saved_roll_lists (user_id, revision, updated_at) VALUES (?, 1, ?)",
      ).bind(secondUserId, timestamp),
      dataEnv.DATA.prepare(
        "INSERT INTO guild_saved_roll_lists (guild_id, revision, updated_at) VALUES (?, 1, ?)",
      ).bind(guildId, timestamp),
    ]);
    await insertSavedRoll(
      "00000000-0000-4000-8000-000000000001",
      { userId: secondUserId },
    );
    await insertSavedRoll(
      "00000000-0000-4000-8000-000000000002",
      { guildId },
    );

    await dataEnv.DATA.prepare("DELETE FROM guilds WHERE id = ?").bind(guildId).run();
    await dataEnv.DATA.prepare("DELETE FROM users WHERE id = ?").bind(secondUserId).run();

    const remaining = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM saved_rolls",
    ).first<{ count: number }>();
    expect(remaining?.count).toBe(0);
  });

  it("backfills pinned-first order without changing record edit timestamps", async () => {
    await dataEnv.DATA.batch([
      dataEnv.DATA.prepare("DROP TRIGGER saved_rolls_disable_pinning_after_insert"),
      dataEnv.DATA.prepare("DROP TRIGGER saved_rolls_disable_pinning_after_update"),
      dataEnv.DATA.prepare(
        "INSERT INTO user_saved_roll_lists (user_id, revision, updated_at) VALUES (?, 7, ?)",
      ).bind(userId, timestamp),
    ]);
    await insertSavedRoll(
      "00000000-0000-4000-8000-000000000001",
      { userId },
      "first",
      0,
      false,
    );
    await insertSavedRoll(
      "00000000-0000-4000-8000-000000000002",
      { userId },
      "second",
      1,
      true,
    );

    const migration = dataEnv.TEST_MIGRATIONS.find(
      ({ name }) => name === "0007_saved_roll_manual_order.sql",
    );
    if (migration === undefined) throw new Error("Ordering migration is missing");
    await dataEnv.DATA.batch(
      migration.queries.map((query) => dataEnv.DATA.prepare(query)),
    );

    const rows = await dataEnv.DATA.prepare(
      `SELECT id, pinned, manual_order, updated_at
       FROM saved_rolls
       WHERE user_id = ?
       ORDER BY manual_order`,
    ).bind(userId).all<{
      id: string;
      pinned: number;
      manual_order: number;
      updated_at: number;
    }>();
    expect(rows.results).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000002",
        pinned: 0,
        manual_order: 0,
        updated_at: timestamp,
      },
      {
        id: "00000000-0000-4000-8000-000000000001",
        pinned: 0,
        manual_order: 1,
        updated_at: timestamp,
      },
    ]);
    expect(
      await dataEnv.DATA.prepare(
        "SELECT revision FROM user_saved_roll_lists WHERE user_id = ?",
      ).bind(userId).first<{ revision: number }>(),
    ).toEqual({ revision: 8 });
  });

  it("keeps the retired pin field inert for rollback-compatible workers", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    await insertSavedRoll(id, { userId }, "fireball", 0, true);

    expect(
      await dataEnv.DATA.prepare("SELECT pinned FROM saved_rolls WHERE id = ?")
        .bind(id)
        .first<{ pinned: number }>(),
    ).toEqual({ pinned: 0 });

    await dataEnv.DATA.prepare("UPDATE saved_rolls SET pinned = 1 WHERE id = ?")
      .bind(id)
      .run();
    expect(
      await dataEnv.DATA.prepare("SELECT pinned FROM saved_rolls WHERE id = ?")
        .bind(id)
        .first<{ pinned: number }>(),
    ).toEqual({ pinned: 0 });
  });

  it("creates owner-name, owner-order, and sorted-list indexes", async () => {
    const indexes = await dataEnv.DATA.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'index'",
    ).all<{ name: string }>();
    expect(indexes.results.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "idx_saved_rolls_guild_list",
        "idx_saved_rolls_guild_name",
        "idx_saved_rolls_guild_order",
        "idx_saved_rolls_user_list",
        "idx_saved_rolls_user_name",
        "idx_saved_rolls_user_order",
      ]),
    );
  });
});
