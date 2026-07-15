import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1RollAccountingRepository } from "../../workers/data/src/roll-accounting-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const interactionId = "100000000000000001";
const guildId = "100000000000000002";
const userId = "100000000000000003";
const receivedAt = 1_767_225_600_123;
const accountedAt = receivedAt + 10;
const input = {
  interactionId,
  guildId,
  userId,
  username: "fixture-user",
  receivedAt,
  accountedAt,
};

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM interaction_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
    dataEnv.DATA.prepare("DELETE FROM stats"),
  ]);
});

async function counts(): Promise<{
  guild: number | null;
  user: number | null;
}> {
  const [guild, user] = await dataEnv.DATA.batch<{
    roll_count: number | null;
  }>([
    dataEnv.DATA.prepare(
      "SELECT roll_count FROM guilds WHERE id = ?",
    ).bind(guildId),
    dataEnv.DATA.prepare(
      "SELECT roll_count FROM users WHERE id = ?",
    ).bind(userId),
  ]);
  return {
    guild: guild?.results[0]?.roll_count ?? null,
    user: user?.results[0]?.roll_count ?? null,
  };
}

describe("D1RollAccountingRepository", () => {
  it("accounts a roll atomically across its receipt and counters", async () => {
    const repository = new D1RollAccountingRepository(dataEnv.DATA);

    await expect(repository.account(input)).resolves.toEqual({
      status: "applied",
    });
    await expect(counts()).resolves.toEqual({ guild: 1, user: 1 });

    const receipt = await dataEnv.DATA.prepare(
      `SELECT command_name, guild_id, user_id, received_at, accounted_at
       FROM interaction_receipts WHERE interaction_id = ?`,
    )
      .bind(interactionId)
      .first();
    expect(receipt).toEqual({
      command_name: "roll",
      guild_id: guildId,
      user_id: userId,
      received_at: receivedAt,
      accounted_at: accountedAt,
    });

  });

  it("increments existing non-null counters and refreshes the username", async () => {
    await dataEnv.DATA.batch([
      dataEnv.DATA.prepare(
        `INSERT INTO guilds (id, name, roll_count, created_at, updated_at)
         VALUES (?, 'Existing Guild', 7, ?, ?)`,
      ).bind(guildId, receivedAt - 1, receivedAt - 1),
      dataEnv.DATA.prepare(
        `INSERT INTO users (
           id, username, roll_count, created_at, updated_at
         ) VALUES (?, 'old-name', 11, ?, ?)`,
      ).bind(userId, receivedAt - 1, receivedAt - 1),
    ]);
    const repository = new D1RollAccountingRepository(dataEnv.DATA);

    await expect(repository.account(input)).resolves.toEqual({
      status: "applied",
    });
    await expect(counts()).resolves.toEqual({ guild: 8, user: 12 });
    const rows = await dataEnv.DATA.batch([
      dataEnv.DATA.prepare(
        "SELECT name, created_at, updated_at FROM guilds WHERE id = ?",
      ).bind(guildId),
      dataEnv.DATA.prepare(
        "SELECT username, created_at, updated_at FROM users WHERE id = ?",
      ).bind(userId),
    ]);
    expect(rows[0]?.results[0]).toEqual({
      name: "Existing Guild",
      created_at: receivedAt - 1,
      updated_at: accountedAt,
    });
    expect(rows[1]?.results[0]).toEqual({
      username: "fixture-user",
      created_at: receivedAt - 1,
      updated_at: accountedAt,
    });
  });

  it("preserves legacy null counters when incrementing existing rows", async () => {
    await dataEnv.DATA.batch([
      dataEnv.DATA.prepare(
        `INSERT INTO guilds (id, roll_count, created_at, updated_at)
         VALUES (?, NULL, ?, ?)`,
      ).bind(guildId, receivedAt, receivedAt),
      dataEnv.DATA.prepare(
        `INSERT INTO users (id, roll_count, created_at, updated_at)
         VALUES (?, NULL, ?, ?)`,
      ).bind(userId, receivedAt, receivedAt),
    ]);

    await new D1RollAccountingRepository(dataEnv.DATA).account(input);

    await expect(counts()).resolves.toEqual({ guild: null, user: null });
  });

  it("deduplicates identical retries without incrementing twice", async () => {
    const repository = new D1RollAccountingRepository(dataEnv.DATA);

    await expect(repository.account(input)).resolves.toEqual({
      status: "applied",
    });
    await expect(repository.account(input)).resolves.toEqual({
      status: "existing",
    });
    await expect(counts()).resolves.toEqual({ guild: 1, user: 1 });
    const receiptCount = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM interaction_receipts",
    ).first<{ count: number }>();
    expect(receiptCount?.count).toBe(1);
  });

  it("serializes concurrent duplicate accounting", async () => {
    const results = await Promise.all([
      new D1RollAccountingRepository(dataEnv.DATA).account(input),
      new D1RollAccountingRepository(dataEnv.DATA).account(input),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "applied",
      "existing",
    ]);
    await expect(counts()).resolves.toEqual({ guild: 1, user: 1 });
  });

  it("fails closed when an interaction id is reused with different input", async () => {
    const repository = new D1RollAccountingRepository(dataEnv.DATA);
    await repository.account(input);

    await expect(
      repository.account({ ...input, username: "changed-name" }),
    ).resolves.toEqual({ status: "conflict" });
    await expect(counts()).resolves.toEqual({ guild: 1, user: 1 });
  });

  it("rejects malformed accounting input before writing", async () => {
    const repository = new D1RollAccountingRepository(dataEnv.DATA);

    await expect(
      repository.account({ ...input, interactionId: "invalid" }),
    ).rejects.toThrow("Interaction id is invalid");
    await expect(
      repository.account({ ...input, accountedAt: receivedAt - 1 }),
    ).rejects.toThrow("Roll accounting timestamps are invalid");
    const receiptCount = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM interaction_receipts",
    ).first<{ count: number }>();
    expect(receiptCount?.count).toBe(0);
  });
});
