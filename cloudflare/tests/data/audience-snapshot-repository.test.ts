import { exports } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { dataTestEnv as dataEnv } from "./test-bindings";
import { D1AudienceSnapshotRepository } from "../../workers/data/src/audience-snapshot-repository";

const capturedAt = 1_767_225_600_123;
const capture = {
  version: 1 as const,
  capturedAt,
  liveGuilds: 3,
  estimatedGuildMemberships: 120,
  shardCount: 2,
  guildCountsByShard: [2, 1],
};

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM discord_audience_snapshot"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare(
      `INSERT INTO users (id, created_at, updated_at)
       VALUES ('100000000000000001', ?, ?),
              ('100000000000000002', ?, ?)`,
    ).bind(capturedAt, capturedAt, capturedAt, capturedAt),
  ]);
});

type RequestBody = z.output<ReturnType<typeof z.json>>;

function request(method: "GET" | "POST", body?: RequestBody): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return exports.default.fetch(
    new Request("https://data.internal/internal/audience-snapshot", init),
  );
}

describe("D1 audience snapshot repository", () => {
  it("stores one authoritative snapshot with the current known-user count", async () => {
    const repository = new D1AudienceSnapshotRepository(dataEnv.DATA);

    await expect(repository.store(capture, capturedAt)).resolves.toEqual({
      status: "applied",
      snapshot: { ...capture, knownDiceWitchUsers: 2 },
    });
    await expect(repository.read()).resolves.toEqual({
      ...capture,
      knownDiceWitchUsers: 2,
    });
    await expect(repository.store(capture, capturedAt)).resolves.toEqual({
      status: "existing",
      snapshot: { ...capture, knownDiceWitchUsers: 2 },
    });
  });

  it("applies newer captures and rejects stale or conflicting timestamps", async () => {
    const repository = new D1AudienceSnapshotRepository(dataEnv.DATA);
    await repository.store(capture, capturedAt);
    const newer = {
      ...capture,
      capturedAt: capturedAt + 1,
      liveGuilds: 4,
      estimatedGuildMemberships: 150,
      guildCountsByShard: [2, 2],
    };

    await expect(
      repository.store(newer, capturedAt + 1),
    ).resolves.toEqual({
      status: "applied",
      snapshot: { ...newer, knownDiceWitchUsers: 2 },
    });
    await expect(
      repository.store(capture, capturedAt + 1),
    ).resolves.toEqual({
      status: "stale",
      snapshot: { ...newer, knownDiceWitchUsers: 2 },
    });
    await expect(
      repository.store(
        { ...newer, estimatedGuildMemberships: 151 },
        capturedAt + 1,
      ),
    ).resolves.toEqual({ status: "conflict" });
    await expect(
      repository.store(
        { ...newer, capturedAt: capturedAt + 2 },
        capturedAt + 1,
      ),
    ).rejects.toThrow("Discord audience capture is invalid");
  });
});

describe("Data Worker audience snapshot service", () => {
  it("exposes strict write and read contracts", async () => {
    const invalid = await request("POST", {
      ...capture,
      guildCountsByShard: [3, 1],
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "Audience snapshot request is invalid",
    });

    const stored = await request("POST", capture);
    expect(stored.status).toBe(200);
    await expect(stored.json()).resolves.toEqual({
      status: "applied",
      snapshot: { ...capture, knownDiceWitchUsers: 2 },
    });

    const read = await request("GET");
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toEqual({
      status: "found",
      snapshot: { ...capture, knownDiceWitchUsers: 2 },
    });
  });
});
