import {
  createDefaultDiceViewPreferencesV4,
  type AppearanceProfileV4,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import { env, exports } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const guildId = "100000000000000002";
const occurredAt = 1_767_225_600_123;

function personalProfile(styleId = "solid"): AppearanceProfileV4 {
  return {
    version: 4,
    designs: [],
    assignments: {
      all: { source: "builtin", id: styleId },
      overrides: {},
    },
    diceView: createDefaultDiceViewPreferencesV4(),
  };
}

function guildProfile(): GuildAppearanceProfileV4 {
  return {
    version: 4,
    mode: "enforced",
    designs: [],
    assignments: {
      all: null,
      overrides: {
        d20: { source: "builtin", id: "glass-cannon" },
      },
    },
    diceView: {
      ...createDefaultDiceViewPreferencesV4(),
      mode: "clear",
    },
  };
}

function post(path: string, body: unknown): Promise<Response> {
  return exports.default.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM guild_appearance_profiles"),
    dataEnv.DATA.prepare("DELETE FROM user_appearance_profiles"),
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM interaction_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
    dataEnv.DATA.prepare("DELETE FROM stats"),
    dataEnv.DATA.prepare(
      "INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(userId, "fixture-user", occurredAt, occurredAt),
    dataEnv.DATA.prepare(
      "INSERT INTO guilds (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(guildId, "Fixture Guild", occurredAt, occurredAt),
  ]);
});

describe("Data Worker V4 appearance service", () => {
  it("reads and writes exact Personal and Server profiles", async () => {
    const personal = personalProfile();
    const guild = guildProfile();

    await expect(
      (await post("/internal/appearance/v4/personal/get", { userId })).json(),
    ).resolves.toEqual({ status: "missing" });
    const personalWrite = await post(
      "/internal/appearance/v4/personal/put",
      {
        userId,
        expectedRevision: 0,
        profile: personal,
        mutationId: "appearance-v4-personal-create",
        occurredAt,
      },
    );
    expect(personalWrite.status).toBe(200);
    await expect(personalWrite.json()).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: personal,
    });

    const guildWrite = await post("/internal/appearance/v4/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: 0,
      profile: guild,
      mutationId: "appearance-v4-guild-create",
      occurredAt,
    });
    expect(guildWrite.status).toBe(200);
    await expect(guildWrite.json()).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: guild,
    });
    await expect(
      (await post("/internal/appearance/v4/guild/get", { guildId })).json(),
    ).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: guild,
      updatedByUserId: userId,
    });
  });

  it("maps stale revisions and mutation reuse to HTTP 409", async () => {
    const input = {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-v4-conflict",
      occurredAt,
    };
    expect(
      (await post("/internal/appearance/v4/personal/put", input)).status,
    ).toBe(200);

    const mutationConflict = await post(
      "/internal/appearance/v4/personal/put",
      { ...input, profile: personalProfile("rainbow") },
    );
    expect(mutationConflict.status).toBe(409);
    await expect(mutationConflict.json()).resolves.toEqual({
      status: "mutation_conflict",
    });

    const revisionConflict = await post(
      "/internal/appearance/v4/personal/put",
      {
        ...input,
        mutationId: "appearance-v4-stale",
        profile: personalProfile("rainbow"),
        occurredAt: occurredAt + 1,
      },
    );
    expect(revisionConflict.status).toBe(409);
    await expect(revisionConflict.json()).resolves.toEqual({
      status: "revision_conflict",
      revision: 1,
    });
  });

  it("resolves V4 defaults and enforced Server precedence", async () => {
    const defaults = await post("/internal/appearance/v4/effective", {
      userId,
      guildId: null,
    });
    expect(defaults.status).toBe(200);
    await expect(defaults.json()).resolves.toMatchObject({
      version: 4,
      diceView: { mode: "normal" },
    });

    await post("/internal/appearance/v4/personal/put", {
      userId,
      expectedRevision: 0,
      profile: personalProfile("solid"),
      mutationId: "appearance-v4-effective-personal",
      occurredAt,
    });
    await post("/internal/appearance/v4/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: 0,
      profile: guildProfile(),
      mutationId: "appearance-v4-effective-guild",
      occurredAt: occurredAt + 1,
    });

    const response = await post("/internal/appearance/v4/effective", {
      userId,
      guildId,
    });
    expect(response.status).toBe(200);
    const value: unknown = await response.json();
    expect(value).toMatchObject({
      version: 4,
      diceView: { mode: "clear" },
      recipes: {
        d6: {
          material: {
            mode: "fixed",
            value: { family: "classic" },
          },
        },
        d20: {
          material: {
            mode: "fixed",
            value: { family: "glass" },
          },
        },
      },
    });
  });

  it("rejects invalid V4 requests and profile versions", async () => {
    const invalidLookup = await post(
      "/internal/appearance/v4/personal/get",
      { userId, extra: true },
    );
    expect(invalidLookup.status).toBe(400);

    const invalidProfile = await post(
      "/internal/appearance/v4/personal/put",
      {
        userId,
        expectedRevision: 0,
        profile: { version: 3, designs: [], assignments: { all: null, overrides: {} } },
        mutationId: "appearance-v4-invalid-profile",
        occurredAt,
      },
    );
    expect(invalidProfile.status).toBe(400);
    await expect(invalidProfile.json()).resolves.toEqual({
      error: "Personal appearance update is invalid",
    });
  });

  it.each([
    "/internal/appearance/personal/get",
    "/internal/appearance/v2/personal/get",
    "/internal/appearance/v3/personal/get",
    "/internal/appearance/effective",
    "/internal/appearance/v2/effective",
    "/internal/appearance/v3/effective",
  ])("returns 404 for removed route %s", async (path) => {
    const response = await post(path, { userId, guildId: null });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
