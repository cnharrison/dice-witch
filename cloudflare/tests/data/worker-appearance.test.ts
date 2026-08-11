import { env, exports } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type AppearanceProfileV3,
  type AppearanceProfileV4,
  type AppearanceRecipeV3,
  type GuildAppearanceProfileV3,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import {
  BUILTIN_APPEARANCE_RECIPES,
  BUILTIN_APPEARANCE_RECIPES_V2,
  BUILTIN_APPEARANCE_RECIPES_V3,
  CHAOTIC_APPEARANCE_STYLE_ID,
  migrateAppearanceProfileV1,
  migrateAppearanceProfileV3ToV4,
  migrateGuildAppearanceProfileV1,
  migrateGuildAppearanceProfileV3ToV4,
  projectAppearanceProfileV4ToV3,
  type AppearanceProfileV1,
  type AppearanceProfileV2,
  type AppearanceRecipeV2,
  type GuildAppearanceProfileV1,
  type GuildAppearanceProfileV2,
} from "../../packages/dice-appearance/src";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const guildId = "100000000000000002";
const occurredAt = 1_767_225_600_123;
const personalDesignId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";
const guildDesignId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function fixedRecipe(primary: string) {
  return {
    version: 1 as const,
    variation: "fixed" as const,
    varyBy: "roll" as const,
    colors: { mode: "tonal" as const, primary },
    fill: { mode: "fixed" as const, value: { type: "gradient" as const } },
    font: { mode: "fixed" as const, fontId: "liberation-sans" },
  };
}

function fixedRecipeV2(primary: string): AppearanceRecipeV2 {
  return {
    version: 2,
    compatibility: "native-v2",
    variation: "fixed",
    varyBy: "roll",
    colors: { mode: "tonal", primary },
    fill: { mode: "fixed", value: { type: "gradient" } },
    font: { mode: "fixed", fontId: "liberation-sans" },
    gradient: {
      colorSource: "full-palette",
      scope: { mode: "fixed", value: "die-wide" },
      direction: {
        mode: "fixed",
        value: "upper-left-to-lower-right",
      },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

function personalProfile(primary = "#aa0000"): AppearanceProfileV1 {
  return {
    version: 1,
    designs: [
      {
        id: personalDesignId,
        name: "Personal",
        recipe: fixedRecipe(primary),
      },
    ],
    assignments: {
      all: { source: "custom", id: personalDesignId },
      overrides: {},
    },
  };
}

function personalProfileV2(primary = "#aa0000"): AppearanceProfileV2 {
  return {
    version: 2,
    designs: [
      {
        id: personalDesignId,
        name: "Personal",
        recipe: fixedRecipeV2(primary),
      },
    ],
    assignments: {
      all: { source: "custom", id: personalDesignId },
      overrides: {},
    },
  };
}

function guildProfile(): GuildAppearanceProfileV1 {
  return {
    version: 1,
    mode: "enforced",
    designs: [
      {
        id: guildDesignId,
        name: "Guild d20",
        recipe: fixedRecipe("#aa00aa"),
      },
    ],
    assignments: {
      all: null,
      overrides: {
        d20: { source: "custom", id: guildDesignId },
      },
    },
  };
}

function guildProfileV2(): GuildAppearanceProfileV2 {
  return {
    version: 2,
    mode: "enforced",
    designs: [
      {
        id: guildDesignId,
        name: "Guild d20",
        recipe: fixedRecipeV2("#aa00aa"),
      },
    ],
    assignments: {
      all: null,
      overrides: {
        d20: { source: "custom", id: guildDesignId },
      },
    },
  };
}

function fixedRecipeV3(primary: string): AppearanceRecipeV3 {
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

function personalProfileV3(primary = "#aa0000"): AppearanceProfileV3 {
  return {
    version: 3,
    designs: [
      {
        id: personalDesignId,
        name: "Personal",
        recipe: fixedRecipeV3(primary),
      },
    ],
    assignments: {
      all: { source: "custom", id: personalDesignId },
      overrides: {},
    },
  };
}

function builtinProfileV3(styleId: string): AppearanceProfileV3 {
  return {
    version: 3,
    designs: [],
    assignments: {
      all: { source: "builtin", id: styleId },
      overrides: {},
    },
  };
}

function guildProfileV3(): GuildAppearanceProfileV3 {
  return {
    version: 3,
    mode: "enforced",
    designs: [
      {
        id: guildDesignId,
        name: "Guild d20",
        recipe: fixedRecipeV3("#aa00aa"),
      },
    ],
    assignments: {
      all: null,
      overrides: {
        d20: { source: "custom", id: guildDesignId },
      },
    },
  };
}

function personalProfileV4(primary = "#aa0000"): AppearanceProfileV4 {
  const profile = migrateAppearanceProfileV3ToV4(personalProfileV3(primary));
  profile.diceView.mode = "clear";
  return profile;
}

function guildProfileV4(): GuildAppearanceProfileV4 {
  const profile = migrateGuildAppearanceProfileV3ToV4(guildProfileV3());
  profile.diceView.mode = "legacy";
  return profile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    dataEnv.DATA
      .prepare(
        "INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .bind(userId, "fixture-user", occurredAt, occurredAt),
    dataEnv.DATA
      .prepare(
        "INSERT INTO guilds (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .bind(guildId, "Fixture Guild", occurredAt, occurredAt),
  ]);
});

describe("Data Worker appearance service", () => {
  it("reads and writes a personal profile through strict internal routes", async () => {
    const missing = await post("/internal/appearance/personal/get", { userId });
    expect(missing.status).toBe(200);
    await expect(missing.json()).resolves.toEqual({ status: "missing" });

    const profile = personalProfile();
    const written = await post("/internal/appearance/personal/put", {
      userId,
      expectedRevision: 0,
      profile,
      mutationId: "appearance-personal-v1",
      occurredAt,
    });
    expect(written.status).toBe(200);
    await expect(written.json()).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile,
    });

    const found = await post("/internal/appearance/personal/get", { userId });
    expect(found.headers.get("cache-control")).toBe("no-store");
    await expect(found.json()).resolves.toEqual({
      status: "found",
      revision: 1,
      profile,
    });
  });

  it("maps stale revisions and mutation conflicts to HTTP 409", async () => {
    const initial = {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-personal-conflict",
      occurredAt,
    };
    await post("/internal/appearance/personal/put", initial);

    const mutationConflict = await post("/internal/appearance/personal/put", {
      ...initial,
      profile: personalProfile("#abcdef"),
    });
    expect(mutationConflict.status).toBe(409);
    await expect(mutationConflict.json()).resolves.toEqual({
      status: "mutation_conflict",
    });

    const revisionConflict = await post("/internal/appearance/personal/put", {
      ...initial,
      profile: personalProfile("#abcdef"),
      mutationId: "appearance-personal-stale",
      occurredAt: occurredAt + 1,
    });
    expect(revisionConflict.status).toBe(409);
    await expect(revisionConflict.json()).resolves.toEqual({
      status: "revision_conflict",
      revision: 1,
    });
  });

  it("returns an explicit conflict when a V1 route encounters stored V2", async () => {
    const personalProfileJson = JSON.stringify(
      migrateAppearanceProfileV1(personalProfile()),
    );
    await dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles (
         user_id, revision, profile_json, updated_at
       ) VALUES (?, 1, ?, ?)`,
    )
      .bind(userId, personalProfileJson, occurredAt)
      .run();

    const responses = await Promise.all([
      post("/internal/appearance/personal/get", { userId }),
      post("/internal/appearance/personal/put", {
        userId,
        expectedRevision: 1,
        profile: personalProfile("#abcdef"),
        mutationId: "appearance-v1-cannot-downgrade",
        occurredAt: occurredAt + 1,
      }),
      post("/internal/appearance/effective", { userId, guildId: null }),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "appearance_profile_version_conflict",
      });
    }
    const storedPersonal = await dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ profile_json: string }>();
    expect(storedPersonal?.profile_json).toBe(personalProfileJson);

    await dataEnv.DATA.prepare(
      "DELETE FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .run();
    const guildProfileJson = JSON.stringify(
      migrateGuildAppearanceProfileV1(guildProfile()),
    );
    await dataEnv.DATA.prepare(
      `INSERT INTO guild_appearance_profiles (
         guild_id, revision, profile_json, updated_by_user_id, updated_at
       ) VALUES (?, 1, ?, ?, ?)`,
    )
      .bind(guildId, guildProfileJson, userId, occurredAt)
      .run();
    const guildResponses = await Promise.all([
      post("/internal/appearance/guild/get", { guildId }),
      post("/internal/appearance/guild/put", {
        guildId,
        updatedByUserId: userId,
        expectedRevision: 1,
        profile: guildProfile(),
        mutationId: "appearance-v1-cannot-downgrade-guild",
        occurredAt: occurredAt + 2,
      }),
      post("/internal/appearance/effective", { userId, guildId }),
    ]);
    for (const response of guildResponses) {
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "appearance_profile_version_conflict",
      });
    }
    const storedGuild = await dataEnv.DATA.prepare(
      "SELECT profile_json FROM guild_appearance_profiles WHERE guild_id = ?",
    )
      .bind(guildId)
      .first<{ profile_json: string }>();
    expect(storedGuild?.profile_json).toBe(guildProfileJson);
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts",
      ).first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });
  });

  it("reads, migrates, and canonically writes personal V2 profiles", async () => {
    const missing = await post("/internal/appearance/v2/personal/get", {
      userId,
    });
    expect(missing.status).toBe(200);
    await expect(missing.json()).resolves.toEqual({ status: "missing" });

    await post("/internal/appearance/personal/put", {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-v2-personal-seed-v1",
      occurredAt,
    });
    const before = await dataEnv.DATA.prepare(
      "SELECT revision, profile_json, updated_at FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first();
    const migrated = await post("/internal/appearance/v2/personal/get", {
      userId,
    });
    expect(migrated.status).toBe(200);
    await expect(migrated.json()).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: migrateAppearanceProfileV1(personalProfile()),
    });
    const after = await dataEnv.DATA.prepare(
      "SELECT revision, profile_json, updated_at FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first();
    expect(after).toEqual(before);

    const canonical = personalProfileV2("#abcdef");
    const written = await post("/internal/appearance/v2/personal/put", {
      userId,
      expectedRevision: 1,
      profile: personalProfileV2("#ABCDEF"),
      mutationId: "appearance-v2-personal-upgrade",
      occurredAt: occurredAt + 1,
    });
    expect(written.status).toBe(200);
    await expect(written.json()).resolves.toEqual({
      status: "applied",
      revision: 2,
      profile: canonical,
    });
    const found = await post("/internal/appearance/v2/personal/get", {
      userId,
    });
    await expect(found.json()).resolves.toEqual({
      status: "found",
      revision: 2,
      profile: canonical,
    });
    const staleV1 = await post("/internal/appearance/personal/get", { userId });
    expect(staleV1.status).toBe(409);
    await expect(staleV1.json()).resolves.toEqual({
      error: "appearance_profile_version_conflict",
    });
  });

  it("reads, migrates, and writes attributed guild V2 profiles", async () => {
    const missing = await post("/internal/appearance/v2/guild/get", { guildId });
    expect(missing.status).toBe(200);
    await expect(missing.json()).resolves.toEqual({ status: "missing" });

    await post("/internal/appearance/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: 0,
      profile: guildProfile(),
      mutationId: "appearance-v2-guild-seed-v1",
      occurredAt,
    });
    const migrated = await post("/internal/appearance/v2/guild/get", {
      guildId,
    });
    await expect(migrated.json()).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: migrateGuildAppearanceProfileV1(guildProfile()),
      updatedByUserId: userId,
    });

    const profile = guildProfileV2();
    const written = await post("/internal/appearance/v2/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: 1,
      profile,
      mutationId: "appearance-v2-guild-upgrade",
      occurredAt: occurredAt + 1,
    });
    expect(written.status).toBe(200);
    await expect(written.json()).resolves.toEqual({
      status: "applied",
      revision: 2,
      profile,
    });
    const found = await post("/internal/appearance/v2/guild/get", { guildId });
    await expect(found.json()).resolves.toEqual({
      status: "found",
      revision: 2,
      profile,
      updatedByUserId: userId,
    });
    const staleV1 = await post("/internal/appearance/guild/get", { guildId });
    expect(staleV1.status).toBe(409);
  });

  it("reads and writes exact personal and guild V3 profiles", async () => {
    const personalMissing = await post("/internal/appearance/v3/personal/get", {
      userId,
    });
    const guildMissing = await post("/internal/appearance/v3/guild/get", {
      guildId,
    });
    await expect(personalMissing.json()).resolves.toEqual({ status: "missing" });
    await expect(guildMissing.json()).resolves.toEqual({ status: "missing" });

    const submittedPersonal = personalProfileV3("#ABCDEF");
    const canonicalPersonal = personalProfileV3("#abcdef");
    const personalInput = {
      userId,
      expectedRevision: 0,
      profile: submittedPersonal,
      mutationId: "appearance-v3-personal-create",
      occurredAt,
    };
    const personalWrite = await post(
      "/internal/appearance/v3/personal/put",
      personalInput,
    );
    expect(personalWrite.status).toBe(200);
    await expect(personalWrite.json()).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: canonicalPersonal,
    });
    const guild = guildProfileV3();
    const guildWrite = await post("/internal/appearance/v3/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: 0,
      profile: guild,
      mutationId: "appearance-v3-guild-create",
      occurredAt: occurredAt + 1,
    });
    expect(guildWrite.status).toBe(200);
    await expect(guildWrite.json()).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: guild,
    });

    const personalFound = await post(
      "/internal/appearance/v3/personal/get",
      { userId },
    );
    await expect(personalFound.json()).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: canonicalPersonal,
    });
    const guildFound = await post("/internal/appearance/v3/guild/get", {
      guildId,
    });
    await expect(guildFound.json()).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: guild,
      updatedByUserId: userId,
    });

    for (const response of await Promise.all([
      post("/internal/appearance/v2/personal/get", { userId }),
      post("/internal/appearance/v2/guild/get", { guildId }),
    ])) {
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "appearance_profile_version_conflict",
      });
    }
  });

  it("reads and writes exact personal and guild V4 profiles", async () => {
    const personal = personalProfileV4();
    const guild = guildProfileV4();
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
    const guildWrite = await post("/internal/appearance/v4/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: 0,
      profile: guild,
      mutationId: "appearance-v4-guild-create",
      occurredAt: occurredAt + 1,
    });

    expect(personalWrite.status).toBe(200);
    await expect(personalWrite.json()).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: personal,
    });
    expect(guildWrite.status).toBe(200);
    await expect(guildWrite.json()).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: guild,
    });
    await expect(
      (
        await post("/internal/appearance/v4/personal/get", { userId })
      ).json(),
    ).resolves.toEqual({ status: "found", revision: 1, profile: personal });
    await expect(
      (
        await post("/internal/appearance/v4/guild/get", { guildId })
      ).json(),
    ).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: guild,
      updatedByUserId: userId,
    });
    const effective: unknown = await (
      await post("/internal/appearance/v4/effective", { userId, guildId })
    ).json();
    if (!isRecord(effective)) {
      throw new Error("Effective appearance V4 response is invalid");
    }
    expect(effective.diceView).toEqual(guild.diceView);

    const invalid = structuredClone(personal);
    Object.assign(invalid.diceView, { mode: "sometimes" });
    const invalidWrite = await post(
      "/internal/appearance/v4/personal/put",
      {
        userId,
        expectedRevision: 1,
        profile: invalid,
        mutationId: "appearance-v4-personal-invalid",
        occurredAt: occurredAt + 2,
      },
    );
    expect(invalidWrite.status).toBe(400);
  });

  it("supports mixed V3/V4 reads but rejects cross-version writes", async () => {
    const v3 = personalProfileV3();
    await post("/internal/appearance/v3/personal/put", {
      userId,
      expectedRevision: 0,
      profile: v3,
      mutationId: "appearance-v4-seed-v3",
      occurredAt,
    });
    const before = await dataEnv.DATA.prepare(
      "SELECT revision, profile_json, updated_at FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first();
    await expect(
      (
        await post("/internal/appearance/v4/personal/get", { userId })
      ).json(),
    ).resolves.toEqual({ status: "found", revision: 1, profile: v3 });
    const v4AgainstV3 = await post(
      "/internal/appearance/v4/personal/put",
      {
        userId,
        expectedRevision: 1,
        profile: personalProfileV4(),
        mutationId: "appearance-v4-against-v3",
        occurredAt: occurredAt + 1,
      },
    );
    expect(v4AgainstV3.status).toBe(409);

    await dataEnv.DATA.prepare(
      "UPDATE user_appearance_profiles SET profile_json = ? WHERE user_id = ?",
    )
      .bind(JSON.stringify(personalProfileV4()), userId)
      .run();
    const v3Read = await post("/internal/appearance/v3/personal/get", { userId });
    await expect(v3Read.json()).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: projectAppearanceProfileV4ToV3(personalProfileV4()),
    });
    const v3AgainstV4 = await post(
      "/internal/appearance/v3/personal/put",
      {
        userId,
        expectedRevision: 1,
        profile: v3,
        mutationId: "appearance-v3-against-v4",
        occurredAt: occurredAt + 2,
      },
    );
    expect(v3AgainstV4.status).toBe(409);
    expect(before).not.toBeNull();
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts WHERE mutation_id IN (?, ?)",
      )
        .bind("appearance-v4-against-v3", "appearance-v3-against-v4")
        .first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });
  });

  it("resolves V4 defaults from V3 without persisting a migration", async () => {
    const v3 = personalProfileV3();
    await post("/internal/appearance/v3/personal/put", {
      userId,
      expectedRevision: 0,
      profile: v3,
      mutationId: "appearance-v4-effective-v3",
      occurredAt,
    });
    const before = await dataEnv.DATA.prepare(
      "SELECT revision, profile_json, updated_at FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first();

    const response = await post("/internal/appearance/v4/effective", {
      userId,
      guildId: null,
    });
    expect(response.status).toBe(200);
    const effective: unknown = await response.json();
    if (!isRecord(effective)) {
      throw new Error("Effective appearance V4 response is invalid");
    }
    expect(effective.version).toBe(4);
    expect(effective.diceView).toEqual({
      elevationDegrees: 40,
      mode: "normal",
      azimuth: {
        all: { mode: "random", customDegrees: 0 },
        overrides: {},
      },
    });
    expect(
      await dataEnv.DATA.prepare(
        "SELECT revision, profile_json, updated_at FROM user_appearance_profiles WHERE user_id = ?",
      )
        .bind(userId)
        .first(),
    ).toEqual(before);
  });

  it("returns V3 version conflicts without migrating older rows", async () => {
    const personalV2 = personalProfileV2();
    const profileJson = JSON.stringify(personalV2);
    await dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles (
         user_id, revision, profile_json, updated_at
       ) VALUES (?, 1, ?, ?)`,
    )
      .bind(userId, profileJson, occurredAt)
      .run();

    const get = await post("/internal/appearance/v3/personal/get", { userId });
    const put = await post("/internal/appearance/v3/personal/put", {
      userId,
      expectedRevision: 1,
      profile: personalProfileV3(),
      mutationId: "appearance-v3-requires-reset",
      occurredAt: occurredAt + 1,
    });
    for (const response of [get, put]) {
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "appearance_profile_version_conflict",
      });
    }
    const stored = await dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ profile_json: string }>();
    expect(stored?.profile_json).toBe(profileJson);
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts",
      ).first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });

    const mixed = await post("/internal/appearance/v3/personal/put", {
      userId,
      expectedRevision: 1,
      profile: personalProfileV2(),
      mutationId: "appearance-v3-rejects-v2",
      occurredAt: occurredAt + 2,
    });
    expect(mixed.status).toBe(400);
  });

  it("resolves all-target V3 special forms only after successful lookups", async () => {
    const empty = await post("/internal/appearance/v3/effective", {
      userId,
      guildId: null,
    });
    expect(empty.status).toBe(200);
    const emptyValue: unknown = await empty.json();
    if (!isRecord(emptyValue) || !isRecord(emptyValue.recipes)) {
      throw new Error("Effective appearance V3 response is invalid");
    }
    expect(emptyValue.version).toBe(3);
    expect(emptyValue.recipes.d4).toEqual(
      BUILTIN_APPEARANCE_RECIPES_V3[CHAOTIC_APPEARANCE_STYLE_ID]?.recipe,
    );

    await post("/internal/appearance/v3/personal/put", {
      userId,
      expectedRevision: 0,
      profile: builtinProfileV3("hollow-victory"),
      mutationId: "appearance-v3-effective-personal",
      occurredAt,
    });
    const response = await post("/internal/appearance/v3/effective", {
      userId,
      guildId: null,
    });
    expect(response.status).toBe(200);
    const value: unknown = await response.json();
    if (!isRecord(value) || !isRecord(value.recipes)) {
      throw new Error("Effective appearance V3 response is invalid");
    }
    expect(Object.values(value.recipes)).toHaveLength(9);
    expect(value.recipes.d6).toMatchObject({
      material: {
        mode: "fixed",
        value: { family: "hollow-metal", metal: "brass" },
      },
      form: { polyhedral: { mode: "fixed", value: "hollow-cage" } },
    });
    expect(value.recipes.d20).toMatchObject({
      material: { mode: "fixed", value: { family: "hollow-metal" } },
      form: { polyhedral: { mode: "fixed", value: "hollow-cage" } },
    });
    expect(value.recipes.other).toMatchObject({
      material: { mode: "fixed", value: { family: "hollow-metal" } },
      form: { other: "sphere" },
    });
  });

  it("returns a V3 effective conflict for older stored profiles", async () => {
    const profileJson = JSON.stringify(personalProfileV2());
    await dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles (
         user_id, revision, profile_json, updated_at
       ) VALUES (?, 1, ?, ?)`,
    )
      .bind(userId, profileJson, occurredAt)
      .run();

    const response = await post("/internal/appearance/v3/effective", {
      userId,
      guildId: null,
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "appearance_profile_version_conflict",
    });
    const stored = await dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ profile_json: string }>();
    expect(stored?.profile_json).toBe(profileJson);
  });

  it("resolves only V2 recipes through the additive effective route", async () => {
    const empty = await post("/internal/appearance/v2/effective", {
      userId,
      guildId: null,
    });
    expect(empty.status).toBe(200);
    const emptyValue: unknown = await empty.json();
    if (!isRecord(emptyValue) || !isRecord(emptyValue.recipes)) {
      throw new Error("Effective appearance V2 response is invalid");
    }
    expect(emptyValue.version).toBe(2);
    expect(emptyValue.recipes.d4).toEqual(
      BUILTIN_APPEARANCE_RECIPES_V2[CHAOTIC_APPEARANCE_STYLE_ID],
    );

    await post("/internal/appearance/v2/personal/put", {
      userId,
      expectedRevision: 0,
      profile: personalProfileV2(),
      mutationId: "appearance-v2-effective-personal",
      occurredAt,
    });
    await post("/internal/appearance/v2/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: 0,
      profile: guildProfileV2(),
      mutationId: "appearance-v2-effective-guild",
      occurredAt,
    });
    const response = await post("/internal/appearance/v2/effective", {
      userId,
      guildId,
    });
    expect(response.status).toBe(200);
    const value: unknown = await response.json();
    if (!isRecord(value) || !isRecord(value.recipes)) {
      throw new Error("Effective appearance V2 response is invalid");
    }
    expect(value.version).toBe(2);
    expect(Object.values(value.recipes)).toHaveLength(9);
    for (const recipe of Object.values(value.recipes)) {
      expect(recipe).toMatchObject({ version: 2 });
    }
    expect(value.recipes).toMatchObject({
      d6: { colors: { mode: "tonal", primary: "#aa0000" } },
      d20: { colors: { mode: "tonal", primary: "#aa00aa" } },
    });
  });

  it("rejects invalid V2 route contracts and malformed stored profiles", async () => {
    const unknown = await post("/internal/appearance/v2/personal/get", {
      userId,
      unexpected: true,
    });
    expect(unknown.status).toBe(400);
    const mixedVersion = await post("/internal/appearance/v2/personal/put", {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-v2-mixed-profile",
      occurredAt,
    });
    expect(mixedVersion.status).toBe(400);

    await dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles (
         user_id, revision, profile_json, updated_at
       ) VALUES (?, 1, ?, ?)`,
    )
      .bind(userId, JSON.stringify({ version: 2 }), occurredAt)
      .run();
    const get = await post("/internal/appearance/v2/personal/get", { userId });
    expect(get.status).toBe(500);
    const effective = await post("/internal/appearance/v2/effective", {
      userId,
      guildId: null,
    });
    expect(effective.status).toBe(500);
  });

  it("reads and writes an attributed guild profile", async () => {
    const profile = guildProfile();
    const written = await post("/internal/appearance/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: 0,
      profile,
      mutationId: "appearance-guild-v1",
      occurredAt,
    });
    expect(written.status).toBe(200);
    await expect(written.json()).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile,
    });

    const found = await post("/internal/appearance/guild/get", { guildId });
    await expect(found.json()).resolves.toEqual({
      status: "found",
      revision: 1,
      profile,
      updatedByUserId: userId,
    });
  });

  it("resolves personal and enforced guild precedence in one required lookup", async () => {
    await post("/internal/appearance/personal/put", {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-effective-personal",
      occurredAt,
    });
    await post("/internal/appearance/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: 0,
      profile: guildProfile(),
      mutationId: "appearance-effective-guild",
      occurredAt,
    });

    const response = await post("/internal/appearance/effective", {
      userId,
      guildId,
    });
    expect(response.status).toBe(200);
    const value: unknown = await response.json();
    if (!isRecord(value) || !isRecord(value.recipes)) {
      throw new Error("Effective appearance response is invalid");
    }
    expect(value.version).toBe(1);
    expect(value.recipes).toMatchObject({
      d6: { colors: { mode: "tonal", primary: "#aa0000" } },
      d20: { colors: { mode: "tonal", primary: "#aa00aa" } },
    });
  });

  it("returns Chaotic only when a successful lookup has no assignment", async () => {
    const response = await post("/internal/appearance/effective", {
      userId,
      guildId: null,
    });
    expect(response.status).toBe(200);
    const value: unknown = await response.json();
    if (!isRecord(value) || !isRecord(value.recipes)) {
      throw new Error("Effective appearance response is invalid");
    }
    expect(value.recipes.d4).toEqual(
      BUILTIN_APPEARANCE_RECIPES[CHAOTIC_APPEARANCE_STYLE_ID],
    );
    expect(value.recipes.other).toEqual(
      BUILTIN_APPEARANCE_RECIPES[CHAOTIC_APPEARANCE_STYLE_ID],
    );
  });

  it("fails instead of substituting Chaotic when stored data is invalid", async () => {
    await dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles (
         user_id, revision, profile_json, updated_at
       ) VALUES (?, 1, '{}', ?)`,
    )
      .bind(userId, occurredAt)
      .run();

    const response = await post("/internal/appearance/effective", {
      userId,
      guildId: null,
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Effective appearance lookup failed",
    });
  });

  it("rejects unknown fields, non-JSON bodies, and oversized bodies", async () => {
    const unknown = await post("/internal/appearance/personal/get", {
      userId,
      unexpected: true,
    });
    expect(unknown.status).toBe(400);

    const nonJson = await exports.default.fetch(
      new Request("https://data.internal/internal/appearance/personal/get", {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    );
    expect(nonJson.status).toBe(400);

    const oversized = await exports.default.fetch(
      new Request("https://data.internal/internal/appearance/personal/put", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(100_000) }),
      }),
    );
    expect(oversized.status).toBe(400);
  });
});
