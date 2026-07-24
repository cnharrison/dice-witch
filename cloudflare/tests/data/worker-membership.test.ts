import { env, exports } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const activeGuildId = "100000000000000001";
const inactiveGuildId = "100000000000000002";
const occurredAt = 1_767_225_600_123;

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare(
      "INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind(userId, occurredAt, occurredAt),
    dataEnv.DATA.prepare(
      `INSERT INTO guilds (id, name, is_active, created_at, updated_at)
       VALUES (?, 'active', 1, ?, ?), (?, 'inactive', 0, ?, ?)`,
    ).bind(
      activeGuildId,
      occurredAt,
      occurredAt,
      inactiveGuildId,
      occurredAt,
      occurredAt,
    ),
  ]);
});

function post(path: string, body: unknown): Promise<Response> {
  return exports.default.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("Data Worker membership service", () => {
  it("filters OAuth guild IDs to active guilds known to the bot", async () => {
    const response = await post("/internal/guilds/filter", {
      guildIds: [inactiveGuildId, activeGuildId],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ guildIds: [activeGuildId] });
  });

  it("returns all known guild IDs for Gateway startup classification", async () => {
    const response = await post("/internal/guilds/existing", {
      guildIds: [inactiveGuildId, activeGuildId],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      guildIds: [inactiveGuildId, activeGuildId],
    });
  });

  it("filters the maximum 200 OAuth guild IDs within D1 query limits", async () => {
    const guildIds = Array.from({ length: 200 }, (_, index) =>
      String(200000000000000000n + BigInt(index)),
    );
    const knownGuildIds = [
      guildIds[0],
      guildIds[99],
      guildIds[100],
      guildIds[199],
    ];
    await dataEnv.DATA.batch(
      knownGuildIds.map((guildId) =>
        dataEnv.DATA
          .prepare(
            `INSERT INTO guilds (id, name, is_active, created_at, updated_at)
             VALUES (?, 'known', 1, ?, ?)`,
          )
          .bind(guildId, occurredAt, occurredAt),
      ),
    );

    const response = await post("/internal/guilds/filter", { guildIds });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ guildIds: knownGuildIds });
  });

  it("keeps the legacy status contract during the snapshot rollout", async () => {
    const response = await post("/internal/status-stats", { shardCount: 2 });
    const expectedCounts = [0, 0];
    const shardId = Number((BigInt(activeGuildId) >> 22n) % 2n);
    expectedCounts[shardId] = 1;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalGuilds: 1,
      totalMembers: null,
      guildCounts: expectedCounts,
    });
  });

  it("reads and updates receipt-backed guild settings", async () => {
    const initial = await post("/internal/guilds/settings", {
      guildId: activeGuildId,
    });
    await expect(initial.json()).resolves.toEqual({
      status: "found",
      settings: { skipDiceDelay: false },
    });

    const updated = await post("/internal/guilds/settings/update", {
      guildId: activeGuildId,
      skipDiceDelay: true,
      mutationId: "web-preference:fixture",
      occurredAt,
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toEqual({
      status: "applied",
      settings: { skipDiceDelay: true },
    });
    const receipt = await dataEnv.DATA.prepare(
      "SELECT payload_json FROM mutation_receipts",
    ).first<{ payload_json: string }>();
    expect(receipt?.payload_json).toBe(JSON.stringify({ skipDiceDelay: true }));
  });

  it("applies strict Gateway guild lifecycle mutations", async () => {
    const response = await post("/internal/guilds/lifecycle", {
      type: "deactivate",
      guildId: activeGuildId,
      mutationId: "gateway-14-44-GUILD_DELETE",
      occurredAt,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "applied",
      guildName: "active",
    });
    const guild = await dataEnv.DATA.prepare(
      "SELECT is_active FROM guilds WHERE id = ?",
    )
      .bind(activeGuildId)
      .first();
    expect(guild).toEqual({ is_active: 0 });
  });

  it("reconciles a complete Discord guild-id set through the private endpoint", async () => {
    const response = await post("/internal/guilds/reconcile", {
      guildIds: [inactiveGuildId],
      runId: "discord-rest-1767225600123",
      occurredAt: occurredAt + 1,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "applied",
      activatedCount: 1,
      deactivatedCount: 1,
    });
    const guilds = await dataEnv.DATA.prepare(
      "SELECT id, is_active FROM guilds ORDER BY id",
    ).all<{ id: string; is_active: number }>();
    expect(guilds.results).toEqual([
      { id: activeGuildId, is_active: 0 },
      { id: inactiveGuildId, is_active: 1 },
    ]);
  });

  it("upserts and lists exact membership permissions", async () => {
    const upsert = await post("/internal/memberships", {
      userId,
      guildId: activeGuildId,
      guildName: "Updated guild",
      guildIcon: "updated-icon",
      guildMutationId: "oauth-guild-profile:fixture",
      isAdmin: true,
      isDiceWitchAdmin: false,
      mutationId: "oauth-membership:fixture",
      occurredAt,
    });
    expect(upsert.status).toBe(200);
    await expect(upsert.json()).resolves.toEqual({
      status: "applied",
      permissions: { isAdmin: true, isDiceWitchAdmin: false },
    });

    const listed = await post("/internal/memberships/list", { userId });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({
      memberships: [
        {
          guild: {
            id: activeGuildId,
            name: "Updated guild",
            icon: "updated-icon",
          },
          isAdmin: true,
          isDiceWitchAdmin: false,
        },
      ],
    });
  });

  it("rejects duplicate, oversized, and malformed guild filters", async () => {
    await expect(
      post("/internal/guilds/filter", {
        guildIds: [activeGuildId, activeGuildId],
      }).then((response) => response.status),
    ).resolves.toBe(400);
    await expect(
      post("/internal/guilds/filter", {
        guildIds: Array.from({ length: 201 }, (_, index) =>
          String(100000000000000000n + BigInt(index)),
        ),
      }).then((response) => response.status),
    ).resolves.toBe(400);
    await expect(
      post("/internal/guilds/filter", { guildIds: ["001"] }).then(
        (response) => response.status,
      ),
    ).resolves.toBe(400);
  });
});
