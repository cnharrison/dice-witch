import {
  createDefaultDiceViewPreferencesV4,
  type AppearanceProfileV4,
  type AppearanceRecipeV3,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { APPEARANCE_VALIDATION_CATALOG_V3 } from "../../packages/dice-appearance/src";
import { D1AppearanceRepository } from "../../workers/data/src/appearance-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const secondUserId = "100000000000000004";
const guildId = "100000000000000002";
const occurredAt = 1_767_225_600_123;
const designId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";

function recipe(primary = "#123456"): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "fixed",
    varyBy: "roll",
    colors: { mode: "tonal", primary },
    material: {
      mode: "fixed",
      value: {
        family: "classic",
        treatment: "gradient",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
    },
    form: {
      polyhedral: { mode: "fixed", value: "standard" },
      other: "sphere",
    },
    font: { mode: "fixed", value: "liberation-sans" },
    engraving: { mode: "fixed", value: "matte-ink" },
    gradient: {
      scope: { mode: "fixed", value: "die-wide" },
      direction: { mode: "fixed", value: "upper-left-to-lower-right" },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

function personalProfile(primary = "#123456"): AppearanceProfileV4 {
  return {
    version: 4,
    designs: [{ id: designId, name: "Every die", recipe: recipe(primary) }],
    assignments: {
      all: { source: "custom", id: designId },
      overrides: {},
    },
    diceView: createDefaultDiceViewPreferencesV4(),
  };
}

function guildProfile(primary = "#654321"): GuildAppearanceProfileV4 {
  return { ...personalProfile(primary), mode: "enforced" };
}

function repository(db = dataEnv.DATA): D1AppearanceRepository {
  return new D1AppearanceRepository(db, APPEARANCE_VALIDATION_CATALOG_V3);
}

function databaseWithBatchRace(race: () => Promise<void>): D1Database {
  let pending = true;
  return {
    prepare: dataEnv.DATA.prepare.bind(dataEnv.DATA),
    withSession: dataEnv.DATA.withSession.bind(dataEnv.DATA),
    batch: async (statements: D1PreparedStatement[]) => {
      if (pending) {
        pending = false;
        await race();
      }
      return dataEnv.DATA.batch(statements);
    },
  } as D1Database;
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
      "INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(secondUserId, "second-user", occurredAt, occurredAt),
    dataEnv.DATA.prepare(
      "INSERT INTO guilds (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(guildId, "Fixture Guild", occurredAt, occurredAt),
  ]);
});

describe("D1AppearanceRepository V4", () => {
  it("creates, reads, and updates a personal profile", async () => {
    const store = repository();
    const first = personalProfile();
    const second = personalProfile("#abcdef");

    await expect(store.getPersonalV4(userId)).resolves.toEqual({
      status: "missing",
    });
    await expect(
      store.putPersonalV4({
        userId,
        expectedRevision: 0,
        profile: first,
        mutationId: "appearance-personal-create",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "applied", revision: 1, profile: first });
    await expect(store.getPersonalV4(userId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: first,
    });
    await expect(
      store.putPersonalV4({
        userId,
        expectedRevision: 1,
        profile: second,
        mutationId: "appearance-personal-update",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toEqual({ status: "applied", revision: 2, profile: second });
  });

  it("stores a guild profile with its author", async () => {
    const profile = guildProfile();
    await expect(
      repository().putGuildV4({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile,
        mutationId: "appearance-guild-create",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "applied", revision: 1, profile });
    await expect(repository().getGuildV4(guildId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile,
      updatedByUserId: userId,
    });
  });

  it("preserves idempotency and rejects mutation-id reuse", async () => {
    const store = repository();
    const input = {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-personal-retry",
      occurredAt,
    };
    await expect(store.putPersonalV4(input)).resolves.toMatchObject({
      status: "applied",
      revision: 1,
    });
    await expect(store.putPersonalV4(input)).resolves.toMatchObject({
      status: "existing",
      revision: 1,
    });
    await expect(
      store.putPersonalV4({ ...input, profile: personalProfile("#abcdef") }),
    ).resolves.toEqual({ status: "mutation_conflict" });
  });

  it("returns revision conflicts without changing stored data", async () => {
    const store = repository();
    const original = personalProfile();
    await store.putPersonalV4({
      userId,
      expectedRevision: 0,
      profile: original,
      mutationId: "appearance-revision-create",
      occurredAt,
    });
    await expect(
      store.putPersonalV4({
        userId,
        expectedRevision: 0,
        profile: personalProfile("#abcdef"),
        mutationId: "appearance-revision-stale",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toEqual({ status: "revision_conflict", revision: 1 });
    await expect(store.getPersonalV4(userId)).resolves.toMatchObject({
      status: "found",
      revision: 1,
      profile: original,
    });
  });

  it("rejects same-revision raw document races", async () => {
    const original = personalProfile();
    await repository().putPersonalV4({
      userId,
      expectedRevision: 0,
      profile: original,
      mutationId: "appearance-race-create",
      occurredAt,
    });
    const raced = personalProfile("#111111");
    const racingStore = repository(
      databaseWithBatchRace(async () => {
        await dataEnv.DATA.prepare(
          "UPDATE user_appearance_profiles SET profile_json = ? WHERE user_id = ?",
        ).bind(JSON.stringify(raced), userId).run();
      }),
    );

    await expect(
      racingStore.putPersonalV4({
        userId,
        expectedRevision: 1,
        profile: personalProfile("#abcdef"),
        mutationId: "appearance-race-update",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toEqual({ status: "revision_conflict", revision: 1 });
    await expect(repository().getPersonalV4(userId)).resolves.toMatchObject({
      status: "found",
      profile: raced,
    });
  });

  it("serializes concurrent identical creates", async () => {
    const input = {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-concurrent-create",
      occurredAt,
    };
    const results = await Promise.all([
      repository().putPersonalV4(input),
      repository().putPersonalV4(input),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([
      "applied",
      "existing",
    ]);
  });

  it("fails closed for invalid profiles, stored corruption, and missing parents", async () => {
    await expect(
      repository().putPersonalV4({
        userId,
        expectedRevision: 0,
        profile: { version: 3 },
        mutationId: "appearance-invalid",
        occurredAt,
      }),
    ).rejects.toThrow();
    await expect(
      repository().putPersonalV4({
        userId: "100000000000000009",
        expectedRevision: 0,
        profile: personalProfile(),
        mutationId: "appearance-missing-user",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "missing" });

    await dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 1, ?, ?)`,
    ).bind(userId, JSON.stringify({ version: 4 }), occurredAt).run();
    await expect(repository().getPersonalV4(userId)).rejects.toThrow(
      "Stored appearance profile is invalid",
    );
  });
});
