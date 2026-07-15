import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1GuildRepository } from "../../workers/data/src/guild-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const guildId = "100000000000000002";
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
  ]);
});

async function insertGuild(skipDiceDelay = false): Promise<void> {
  await dataEnv.DATA.prepare(
    `INSERT INTO guilds (
       id, name, skip_dice_delay, created_at, updated_at, is_active
     ) VALUES (?, ?, ?, ?, ?, 1)`,
  )
    .bind(
      guildId,
      "Fixture Guild",
      skipDiceDelay ? 1 : 0,
      occurredAt,
      occurredAt,
    )
    .run();
}

describe("D1GuildRepository", () => {
  it("distinguishes a missing guild from an explicit false preference", async () => {
    const repository = new D1GuildRepository(dataEnv.DATA);

    await expect(repository.getSettings(guildId)).resolves.toEqual({
      status: "missing",
    });
    await insertGuild(false);
    await expect(repository.getSettings(guildId)).resolves.toEqual({
      status: "found",
      settings: { skipDiceDelay: false },
    });
  });

  it("upserts lifecycle metadata and deactivates a removed guild idempotently", async () => {
    const repository = new D1GuildRepository(dataEnv.DATA);
    const profile = {
      id: guildId,
      name: "Lifecycle Guild",
      icon: "lifecycle-icon",
      ownerId: "100000000000000003",
      memberCount: 42,
      approximateMemberCount: 43,
      preferredLocale: "en-US",
      joinedTimestamp: occurredAt - 10_000,
      isActive: true as const,
    };

    await expect(
      repository.applyLifecycle({
        mutationId: "gateway-13-42-GUILD_CREATE",
        occurredAt,
        type: "upsert",
        guild: profile,
      }),
    ).resolves.toEqual({ status: "applied" });
    await expect(
      repository.applyLifecycle({
        mutationId: "gateway-13-42-GUILD_CREATE",
        occurredAt,
        type: "upsert",
        guild: profile,
      }),
    ).resolves.toEqual({ status: "existing" });
    await expect(
      repository.applyLifecycle({
        mutationId: "gateway-13-43-GUILD_DELETE",
        occurredAt: occurredAt + 1,
        type: "deactivate",
        guildId,
      }),
    ).resolves.toEqual({ status: "applied" });

    const guild = await dataEnv.DATA.prepare(
      `SELECT name, icon, owner_id, member_count, approximate_member_count,
              preferred_locale, joined_timestamp, is_active
       FROM guilds WHERE id = ?`,
    )
      .bind(guildId)
      .first();
    expect(guild).toEqual({
      name: "Lifecycle Guild",
      icon: "lifecycle-icon",
      owner_id: "100000000000000003",
      member_count: 42,
      approximate_member_count: 43,
      preferred_locale: "en-US",
      joined_timestamp: occurredAt - 10_000,
      is_active: 0,
    });
    const receipts = await dataEnv.DATA.prepare(
      `SELECT mutation_id, payload_json
       FROM mutation_receipts ORDER BY occurred_at`,
    ).all<{ mutation_id: string; payload_json: string }>();
    expect(receipts.results).toEqual([
      {
        mutation_id: "gateway-13-42-GUILD_CREATE",
        payload_json: JSON.stringify(profile),
      },
      {
        mutation_id: "gateway-13-43-GUILD_DELETE",
        payload_json: JSON.stringify({ isActive: false }),
      },
    ]);
  });

  it("deactivates only active guilds absent from a complete reconciliation set", async () => {
    const currentGuildId = guildId;
    const removedGuildId = "100000000000000004";
    const alreadyInactiveGuildId = "100000000000000005";
    await dataEnv.DATA.batch([
      dataEnv.DATA
        .prepare(
          `INSERT INTO guilds (id, name, created_at, updated_at, is_active)
           VALUES (?, 'Current', ?, ?, 1)`,
        )
        .bind(currentGuildId, occurredAt, occurredAt),
      dataEnv.DATA
        .prepare(
          `INSERT INTO guilds (id, name, created_at, updated_at, is_active)
           VALUES (?, 'Removed', ?, ?, 1)`,
        )
        .bind(removedGuildId, occurredAt, occurredAt),
      dataEnv.DATA
        .prepare(
          `INSERT INTO guilds (id, name, created_at, updated_at, is_active)
           VALUES (?, 'Inactive', ?, ?, 0)`,
        )
        .bind(alreadyInactiveGuildId, occurredAt, occurredAt),
    ]);
    const repository = new D1GuildRepository(dataEnv.DATA);
    const input = {
      guildIds: [currentGuildId],
      runId: "discord-rest-1767225600123",
      occurredAt: occurredAt + 1,
    };

    await expect(repository.reconcileActiveGuilds(input)).resolves.toEqual({
      status: "applied",
      activatedCount: 0,
      deactivatedCount: 1,
    });
    await expect(repository.reconcileActiveGuilds(input)).resolves.toEqual({
      status: "applied",
      activatedCount: 0,
      deactivatedCount: 0,
    });

    const guilds = await dataEnv.DATA.prepare(
      "SELECT id, is_active FROM guilds ORDER BY id",
    ).all<{ id: string; is_active: number }>();
    expect(guilds.results).toEqual([
      { id: currentGuildId, is_active: 1 },
      { id: removedGuildId, is_active: 0 },
      { id: alreadyInactiveGuildId, is_active: 0 },
    ]);
    const receipts = await dataEnv.DATA.prepare(
      `SELECT mutation_id, entity_key, payload_json
       FROM mutation_receipts`,
    ).all();
    expect(receipts.results).toEqual([
      {
        mutation_id: `${input.runId}:${removedGuildId}`,
        entity_key: removedGuildId,
        payload_json: JSON.stringify({ isActive: false }),
      },
    ]);
  });

  it("does not overwrite lifecycle changes newer than the inventory cutoff", async () => {
    const recentlyRemovedId = "100000000000000006";
    const recentlyRejoinedId = "100000000000000007";
    const cutoff = occurredAt + 10;
    await dataEnv.DATA.batch([
      dataEnv.DATA
        .prepare(
          `INSERT INTO guilds (id, name, created_at, updated_at, is_active)
           VALUES (?, 'Recent Active', ?, ?, 1)`,
        )
        .bind(recentlyRemovedId, occurredAt, cutoff),
      dataEnv.DATA
        .prepare(
          `INSERT INTO guilds (id, name, created_at, updated_at, is_active)
           VALUES (?, 'Recent Inactive', ?, ?, 0)`,
        )
        .bind(recentlyRejoinedId, occurredAt, cutoff),
    ]);

    await expect(
      new D1GuildRepository(dataEnv.DATA).reconcileActiveGuilds({
        guildIds: [recentlyRejoinedId],
        runId: "gateway-race-guard",
        occurredAt: cutoff,
      }),
    ).resolves.toEqual({
      status: "applied",
      activatedCount: 0,
      deactivatedCount: 0,
    });

    const guilds = await dataEnv.DATA.prepare(
      "SELECT id, is_active FROM guilds ORDER BY id",
    ).all<{ id: string; is_active: number }>();
    expect(guilds.results).toEqual([
      { id: recentlyRemovedId, is_active: 1 },
      { id: recentlyRejoinedId, is_active: 0 },
    ]);
  });

  it("updates display metadata and writes an idempotency receipt", async () => {
    await insertGuild();
    const repository = new D1GuildRepository(dataEnv.DATA);

    await expect(
      repository.setDisplayProfile({
        guildId,
        profile: { name: "Updated Guild", icon: "updated-icon" },
        mutationId: "guild-profile-100000000000000020",
        occurredAt,
      }),
    ).resolves.toEqual({
      status: "applied",
      profile: { name: "Updated Guild", icon: "updated-icon" },
    });
    const guild = await dataEnv.DATA.prepare(
      "SELECT name, icon FROM guilds WHERE id = ?",
    )
      .bind(guildId)
      .first();
    expect(guild).toEqual({ name: "Updated Guild", icon: "updated-icon" });
    const receipt = await dataEnv.DATA.prepare(
      "SELECT operation, payload_json FROM mutation_receipts",
    ).first();
    expect(receipt).toEqual({
      operation: "upsert",
      payload_json: JSON.stringify({
        name: "Updated Guild",
        icon: "updated-icon",
      }),
    });
  });

  it("updates skipDiceDelay and writes the mutation receipt atomically", async () => {
    await insertGuild();
    const repository = new D1GuildRepository(dataEnv.DATA);

    await expect(
      repository.setSkipDiceDelay({
        guildId,
        skipDiceDelay: true,
        mutationId: "preference-100000000000000020",
        occurredAt,
      }),
    ).resolves.toEqual({
      status: "applied",
      settings: { skipDiceDelay: true },
    });
    await expect(repository.getSettings(guildId)).resolves.toEqual({
      status: "found",
      settings: { skipDiceDelay: true },
    });

    const receipt = await dataEnv.DATA.prepare(
      `SELECT mutation_id, entity_type, entity_key, operation, payload_json,
              occurred_at
       FROM mutation_receipts`,
    ).first();
    expect(receipt).toEqual({
      mutation_id: "preference-100000000000000020",
      entity_type: "guild",
      entity_key: guildId,
      operation: "upsert",
      payload_json: JSON.stringify({ skipDiceDelay: true }),
      occurred_at: occurredAt,
    });
  });

  it("returns the same result for an identical mutation retry", async () => {
    await insertGuild();
    const repository = new D1GuildRepository(dataEnv.DATA);
    const input = {
      guildId,
      skipDiceDelay: true,
      mutationId: "preference-100000000000000021",
      occurredAt,
    };

    const first = await repository.setSkipDiceDelay(input);
    const retry = await repository.setSkipDiceDelay(input);

    expect(first).toEqual({
      status: "applied",
      settings: { skipDiceDelay: true },
    });
    expect(retry).toEqual({
      status: "existing",
      settings: { skipDiceDelay: true },
    });
    const receiptCount = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM mutation_receipts",
    ).first<{ count: number }>();
    expect(receiptCount?.count).toBe(1);
  });

  it("serializes concurrent identical mutations to one receipt row", async () => {
    await insertGuild();
    const input = {
      guildId,
      skipDiceDelay: true,
      mutationId: "preference-100000000000000024",
      occurredAt,
    };

    const results = await Promise.all([
      new D1GuildRepository(dataEnv.DATA).setSkipDiceDelay(input),
      new D1GuildRepository(dataEnv.DATA).setSkipDiceDelay(input),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "applied",
      "existing",
    ]);
    const receiptCount = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM mutation_receipts",
    ).first<{ count: number }>();
    expect(receiptCount?.count).toBe(1);
  });

  it("fails closed when a mutation id is reused for different input", async () => {
    await insertGuild();
    const repository = new D1GuildRepository(dataEnv.DATA);
    const mutationId = "preference-100000000000000022";
    await repository.setSkipDiceDelay({
      guildId,
      skipDiceDelay: true,
      mutationId,
      occurredAt,
    });

    await expect(
      repository.setSkipDiceDelay({
        guildId,
        skipDiceDelay: false,
        mutationId,
        occurredAt,
      }),
    ).resolves.toEqual({ status: "conflict" });
    await expect(repository.getSettings(guildId)).resolves.toEqual({
      status: "found",
      settings: { skipDiceDelay: true },
    });
  });

  it("does not record a preference mutation for a missing guild", async () => {
    const repository = new D1GuildRepository(dataEnv.DATA);

    await expect(
      repository.setSkipDiceDelay({
        guildId,
        skipDiceDelay: true,
        mutationId: "preference-100000000000000023",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "missing" });
    const receiptCount = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM mutation_receipts",
    ).first<{ count: number }>();
    expect(receiptCount?.count).toBe(0);
  });

  it("rejects malformed repository input before querying", async () => {
    const repository = new D1GuildRepository(dataEnv.DATA);

    await expect(repository.getSettings("not-a-snowflake")).rejects.toThrow(
      "Guild id is invalid",
    );
    await expect(
      repository.setSkipDiceDelay({
        guildId,
        skipDiceDelay: true,
        mutationId: "",
        occurredAt,
      }),
    ).rejects.toThrow("Mutation id is invalid");
  });
});
