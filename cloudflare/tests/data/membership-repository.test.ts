import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1MembershipRepository } from "../../workers/data/src/membership-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const guildId = "100000000000000002";
const userId = "100000000000000003";
const occurredAt = 1_767_225_600_123;

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM interaction_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
    dataEnv.DATA.prepare("DELETE FROM stats"),
    dataEnv.DATA.prepare(
      `INSERT INTO guilds (id, name, icon, created_at, updated_at)
       VALUES (?, 'Fixture Guild', 'fixture-icon', ?, ?)`,
    ).bind(guildId, occurredAt, occurredAt),
    dataEnv.DATA.prepare(
      `INSERT INTO users (id, username, created_at, updated_at)
       VALUES (?, 'fixture-user', ?, ?)`,
    ).bind(userId, occurredAt, occurredAt),
  ]);
});

describe("D1MembershipRepository", () => {
  it("lists mutual guilds with stored permissions", async () => {
    await dataEnv.DATA.prepare(
      `INSERT INTO users_guilds (
         user_id, guild_id, is_admin, is_dice_witch_admin,
         created_at, updated_at
       ) VALUES (?, ?, 1, 0, ?, ?)`,
    )
      .bind(userId, guildId, occurredAt, occurredAt)
      .run();
    const repository = new D1MembershipRepository(dataEnv.DATA);

    await expect(repository.listMutualGuilds(userId)).resolves.toEqual([
      {
        guild: { id: guildId, name: "Fixture Guild", icon: "fixture-icon" },
        isAdmin: true,
        isDiceWitchAdmin: false,
      },
    ]);
  });

  it("upserts permissions and records their receipt atomically", async () => {
    const repository = new D1MembershipRepository(dataEnv.DATA);
    const permissions = { isAdmin: true, isDiceWitchAdmin: false };

    await expect(
      repository.upsertPermissions({
        userId,
        guildId,
        permissions,
        mutationId: "membership-100000000000000020",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "applied", permissions });
    await expect(repository.listMutualGuilds(userId)).resolves.toEqual([
      {
        guild: { id: guildId, name: "Fixture Guild", icon: "fixture-icon" },
        ...permissions,
      },
    ]);

    const receipt = await dataEnv.DATA.prepare(
      `SELECT entity_type, entity_key, operation, payload_json, occurred_at
       FROM mutation_receipts`,
    ).first();
    expect(receipt).toEqual({
      entity_type: "membership",
      entity_key: `${userId}:${guildId}`,
      operation: "upsert",
      payload_json: JSON.stringify({ guildId, ...permissions, userId }),
      occurred_at: occurredAt,
    });
  });

  it("deduplicates retries and fails closed on conflicting input", async () => {
    const repository = new D1MembershipRepository(dataEnv.DATA);
    const input = {
      userId,
      guildId,
      permissions: { isAdmin: true, isDiceWitchAdmin: false },
      mutationId: "membership-100000000000000021",
      occurredAt,
    };

    await expect(repository.upsertPermissions(input)).resolves.toEqual({
      status: "applied",
      permissions: input.permissions,
    });
    await expect(repository.upsertPermissions(input)).resolves.toEqual({
      status: "existing",
      permissions: input.permissions,
    });
    await expect(
      repository.upsertPermissions({
        ...input,
        permissions: { isAdmin: false, isDiceWitchAdmin: false },
      }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("does not record permissions when the user or guild is missing", async () => {
    await dataEnv.DATA.prepare("DELETE FROM users WHERE id = ?")
      .bind(userId)
      .run();
    const repository = new D1MembershipRepository(dataEnv.DATA);

    await expect(
      repository.upsertPermissions({
        userId,
        guildId,
        permissions: { isAdmin: false, isDiceWitchAdmin: true },
        mutationId: "membership-100000000000000022",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "missing" });
    const count = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM mutation_receipts",
    ).first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it("rejects malformed identifiers and permissions", async () => {
    const repository = new D1MembershipRepository(dataEnv.DATA);

    await expect(
      repository.listMutualGuilds("not-a-snowflake"),
    ).rejects.toThrow("User id is invalid");
    await expect(
      repository.upsertPermissions({
        userId,
        guildId,
        permissions: { isAdmin: true, isDiceWitchAdmin: 1 as never },
        mutationId: "membership-100000000000000023",
        occurredAt,
      }),
    ).rejects.toThrow("Membership permissions are invalid");
  });
});
