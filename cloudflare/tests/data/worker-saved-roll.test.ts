import { env, exports } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { handleSavedRollRequest } from "../../workers/data/src/saved-roll-service";

const dataEnv = env as unknown as { DATA: D1Database; TEST_MIGRATIONS: D1Migration[] };
const userId = "100000000000000003";
const timestamp = 1_767_225_600_123;
const savedRollId = "00000000-0000-4000-8000-000000000001";

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM saved_rolls"),
    dataEnv.DATA.prepare("DELETE FROM guild_saved_roll_lists"),
    dataEnv.DATA.prepare("DELETE FROM user_saved_roll_lists"),
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
  ]);
  await dataEnv.DATA.prepare(
    `INSERT INTO users (
       id, username, email, last_web_login, flags, discriminator,
       roll_count, created_at, updated_at
     ) VALUES (?, 'witch', 'witch@example.com', ?, 0, '0', 0, ?, ?)`,
  ).bind(userId, timestamp, timestamp, timestamp).run();
});

function post(path: string, body: unknown): Promise<Response> {
  return exports.default.fetch(
    new Request(`https://data.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const createBody = {
  owner: { type: "user", userId },
  actorUserId: userId,
  authorizationUpdatedAt: null,
  id: savedRollId,
  expectedListRevision: 0,
  draft: {
    version: 1,
    name: "Fireball",
    notation: "8d6",
    title: null,
    repetitions: 1,
  },
  pinned: false,
  mutationId: "create-1",
  occurredAt: timestamp,
};

describe("saved-roll Data service", () => {
  it("ensures a Discord user through an exact non-destructive route", async () => {
    const missingUserId = "100000000000000099";
    const ensured = await post("/internal/saved-rolls/v1/ensure-user", {
      userId: missingUserId,
      username: "new-user",
      occurredAt: timestamp,
    });
    expect(ensured.status).toBe(200);
    await expect(ensured.json()).resolves.toEqual({ status: "applied" });

    const invalid = await post("/internal/saved-rolls/v1/ensure-user", {
      userId: missingUserId,
      username: "new-user",
      occurredAt: timestamp,
      unexpected: true,
    });
    expect(invalid.status).toBe(400);
  });

  it("creates and lists a personal saved roll through exact V1 routes", async () => {
    const created = await post("/internal/saved-rolls/v1/create", createBody);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      status: "applied",
      listRevision: 1,
      savedRoll: { id: savedRollId, displayName: "Fireball" },
    });

    const listed = await post("/internal/saved-rolls/v1/list", {
      owner: { type: "user", userId },
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      status: "found",
      listRevision: 1,
      savedRolls: [{ id: savedRollId }],
    });

    const libraries = await post("/internal/saved-rolls/v1/libraries", {
      userId,
    });
    await expect(libraries.json()).resolves.toEqual({
      status: "found",
      libraries: [],
    });

    const searched = await post("/internal/saved-rolls/v1/search", {
      userId,
      guildIds: [],
      query: "fire",
      offset: 0,
      sort: "name",
      direction: "asc",
    });
    expect(searched.status).toBe(200);
    await expect(searched.json()).resolves.toMatchObject({
      status: "found",
      entries: [{ savedRoll: { id: savedRollId }, listRevision: 1 }],
      hasMore: false,
    });
  });

  it("projects colored V2 records without changing the exact V1 response", async () => {
    const created = await post("/internal/saved-rolls/v2/create", {
      ...createBody,
      draft: {
        ...createBody.draft,
        version: 2,
        nameColor: "#A1B2C3",
      },
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      savedRoll: { version: 2, nameColor: "#A1B2C3" },
    });

    const owner = { owner: { type: "user", userId } };
    const listedV1 = await post("/internal/saved-rolls/v1/list", owner);
    const valueV1: { savedRolls: Record<string, unknown>[] } = await listedV1.json();
    expect(valueV1.savedRolls[0]?.version).toBe(1);
    expect(valueV1.savedRolls[0]).not.toHaveProperty("nameColor");

    const listedV2 = await post("/internal/saved-rolls/v2/list", owner);
    await expect(listedV2.json()).resolves.toMatchObject({
      savedRolls: [{ version: 2, nameColor: "#A1B2C3" }],
    });
  });

  it("updates, reorders, and deletes through exact mutation routes", async () => {
    await post("/internal/saved-rolls/v1/create", createBody);
    const updated = await post("/internal/saved-rolls/v1/update", {
      ...createBody,
      expectedListRevision: 1,
      expectedRecordRevision: 1,
      draft: { ...createBody.draft, name: "Greater Fireball" },
      pinned: true,
      mutationId: "update-1",
      occurredAt: timestamp + 1,
    });
    expect(await updated.json()).toEqual({
      status: "applied",
      listRevision: 2,
      recordRevision: 2,
    });
    const reordered = await post("/internal/saved-rolls/v1/reorder", {
      owner: createBody.owner,
      actorUserId: userId,
      authorizationUpdatedAt: null,
      expectedListRevision: 2,
      orderedIds: [savedRollId],
      mutationId: "reorder-1",
      occurredAt: timestamp + 2,
    });
    expect(await reordered.json()).toEqual({
      status: "applied",
      listRevision: 3,
    });
    const removed = await post("/internal/saved-rolls/v1/delete", {
      owner: createBody.owner,
      actorUserId: userId,
      authorizationUpdatedAt: null,
      id: savedRollId,
      expectedListRevision: 3,
      expectedRecordRevision: 2,
      mutationId: "delete-1",
      occurredAt: timestamp + 3,
    });
    expect(await removed.json()).toEqual({
      status: "applied",
      listRevision: 4,
    });
  });

  it("copies an immutable input snapshot as an independent record", async () => {
    await post("/internal/saved-rolls/v1/create", createBody);
    const copied = await post("/internal/saved-rolls/v1/copy", {
      ...createBody,
      id: "00000000-0000-4000-8000-000000000002",
      expectedListRevision: 1,
      draft: { ...createBody.draft, name: "Ice", notation: "2d8" },
      mutationId: "copy-1",
    });
    expect(copied.status).toBe(200);
    expect(await copied.json()).toMatchObject({
      status: "applied",
      listRevision: 2,
      savedRoll: { displayName: "Ice", notation: "2d8" },
    });
    const replay = await post("/internal/saved-rolls/v1/copy", {
      ...createBody,
      id: "00000000-0000-4000-8000-000000000002",
      expectedListRevision: 1,
      draft: { ...createBody.draft, name: "Ice", notation: "2d8" },
      mutationId: "copy-1",
    });
    expect(await replay.json()).toMatchObject({ status: "existing" });
  });

  it("rejects unknown fields and unsupported owner shapes", async () => {
    const extra = await post("/internal/saved-rolls/v1/create", {
      ...createBody,
      unexpected: true,
    });
    expect(extra.status).toBe(400);
    const owner = await post("/internal/saved-rolls/v1/list", {
      owner: { type: "user", userId, guildId: "100000000000000002" },
    });
    expect(owner.status).toBe(400);
  });

  it("distinguishes invalid requests from internal storage failures", async () => {
    const response = await handleSavedRollRequest(
      new Request("https://data.test/internal/saved-rolls/v1/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: { type: "user", userId } }),
      }),
      {} as D1Database,
    );
    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({
      error: "Saved roll request failed",
    });
  });

  it("does not expose saved-roll routes to other methods", async () => {
    const response = await exports.default.fetch(
      new Request("https://data.test/internal/saved-rolls/v1/list"),
    );
    expect(response.status).toBe(404);
  });
});
