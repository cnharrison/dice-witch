import { exports } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { dataTestEnv as dataEnv } from "./test-bindings";

type RequestBody = z.output<ReturnType<typeof z.json>>;
const input = {
  interactionId: "100000000000000001",
  guildId: "100000000000000002",
  userId: "100000000000000003",
  username: "fixture-user",
  receivedAt: 1_767_225_600_123,
  accountedAt: 1_767_225_600_133,
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

function account(value: RequestBody): Promise<Response> {
  return exports.default.fetch(
    new Request("https://data.internal/internal/roll-accounting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    }),
  );
}

describe("Data Worker roll accounting service", () => {
  it("accounts a roll and returns an idempotent existing result", async () => {
    const applied = await account(input);
    expect(applied.status).toBe(200);
    await expect(applied.json()).resolves.toEqual({ status: "applied" });

    const existing = await account(input);
    expect(existing.status).toBe(200);
    await expect(existing.json()).resolves.toEqual({ status: "existing" });
    const [guild, user, receipt] = await dataEnv.DATA.batch<{
      count: number;
    }>([
      dataEnv.DATA.prepare(
        "SELECT roll_count AS count FROM guilds WHERE id = ?",
      ).bind(input.guildId),
      dataEnv.DATA.prepare(
        "SELECT roll_count AS count FROM users WHERE id = ?",
      ).bind(input.userId),
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM interaction_receipts",
      ),
    ]);
    expect([
      guild?.results[0]?.count,
      user?.results[0]?.count,
      receipt?.results[0]?.count,
    ]).toEqual([1, 1, 1]);
  });

  it("returns conflict without changing counters", async () => {
    await account(input);

    const response = await account({ ...input, username: "changed-name" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ status: "conflict" });
    const guild = await dataEnv.DATA.prepare(
      "SELECT roll_count FROM guilds WHERE id = ?",
    )
      .bind(input.guildId)
      .first<{ roll_count: number }>();
    expect(guild?.roll_count).toBe(1);
  });

  it("rejects malformed JSON shapes before writing", async () => {
    const response = await account({ ...input, unexpected: true });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Roll accounting request is invalid",
    });
    const receipts = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM interaction_receipts",
    ).first<{ count: number }>();
    expect(receipts?.count).toBe(0);
  });

  it("does not expose a public mutation route for other methods or paths", async () => {
    const [wrongMethod, wrongPath] = await Promise.all([
      exports.default.fetch(
        new Request("https://data.internal/internal/roll-accounting"),
      ),
      exports.default.fetch(
        new Request("https://data.internal/roll-accounting", {
          method: "POST",
        }),
      ),
    ]);

    expect(wrongMethod.status).toBe(404);
    expect(wrongPath.status).toBe(404);
  });
});
