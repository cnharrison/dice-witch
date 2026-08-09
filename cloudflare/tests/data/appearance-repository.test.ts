import { env } from "cloudflare:workers";
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
  APPEARANCE_VALIDATION_CATALOG,
  APPEARANCE_VALIDATION_CATALOG_V3,
  migrateAppearanceProfileV1,
  migrateAppearanceProfileV3ToV4,
  migrateGuildAppearanceProfileV1,
  migrateGuildAppearanceProfileV3ToV4,
  projectAppearanceProfileV4ToV3,
  projectGuildAppearanceProfileV4ToV3,
  type AppearanceProfileV1,
  type AppearanceProfileV2,
  type GuildAppearanceProfileV1,
  type GuildAppearanceProfileV2,
} from "../../packages/dice-appearance/src";
import { D1AppearanceRepository } from "../../workers/data/src/appearance-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const guildId = "100000000000000002";
const occurredAt = 1_767_225_600_123;
const designId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";
const catalog = {
  v1V2: APPEARANCE_VALIDATION_CATALOG,
  v3: APPEARANCE_VALIDATION_CATALOG_V3,
};

function personalProfile(primary = "#123456"): AppearanceProfileV1 {
  return {
    version: 1,
    designs: [
      {
        id: designId,
        name: "Every die",
        recipe: {
          version: 1,
          variation: "fixed",
          varyBy: "roll",
          colors: { mode: "tonal", primary },
          fill: { mode: "fixed", value: { type: "gradient" } },
          font: { mode: "fixed", fontId: "liberation-sans" },
        },
      },
    ],
    assignments: {
      all: { source: "custom", id: designId },
      overrides: {},
    },
  };
}

function guildProfile(): GuildAppearanceProfileV1 {
  return { ...personalProfile("#654321"), mode: "enforced" };
}

function personalProfileV2(primary = "#123456"): AppearanceProfileV2 {
  return {
    version: 2,
    designs: [
      {
        id: designId,
        name: "Every die",
        recipe: {
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
        },
      },
    ],
    assignments: {
      all: { source: "custom", id: designId },
      overrides: {},
    },
  };
}

function guildProfileV2(): GuildAppearanceProfileV2 {
  return { ...personalProfileV2("#654321"), mode: "enforced" };
}

function appearanceRecipeV3(primary = "#123456"): AppearanceRecipeV3 {
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

function personalProfileV3(primary = "#123456"): AppearanceProfileV3 {
  return {
    version: 3,
    designs: [
      {
        id: designId,
        name: "Every die",
        recipe: appearanceRecipeV3(primary),
      },
    ],
    assignments: {
      all: { source: "custom", id: designId },
      overrides: {},
    },
  };
}

function guildProfileV3(): GuildAppearanceProfileV3 {
  return { ...personalProfileV3("#654321"), mode: "enforced" };
}

function personalProfileV4(primary = "#123456"): AppearanceProfileV4 {
  const profile = migrateAppearanceProfileV3ToV4(personalProfileV3(primary));
  profile.diceView.mode = "clear";
  return profile;
}

function guildProfileV4(): GuildAppearanceProfileV4 {
  const profile = migrateGuildAppearanceProfileV3ToV4(guildProfileV3());
  profile.diceView.mode = "legacy";
  return profile;
}

async function storePersonalProfile(
  profile: object,
  revision = 1,
): Promise<void> {
  await dataEnv.DATA.prepare(
    `INSERT INTO user_appearance_profiles (
       user_id, revision, profile_json, updated_at
     ) VALUES (?, ?, ?, ?)`,
  )
    .bind(userId, revision, JSON.stringify(profile), occurredAt)
    .run();
}

async function storeGuildProfile(
  profile: object,
  revision = 1,
  updatedByUserId = userId,
): Promise<void> {
  await dataEnv.DATA.prepare(
    `INSERT INTO guild_appearance_profiles (
       guild_id, revision, profile_json, updated_by_user_id, updated_at
     ) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      guildId,
      revision,
      JSON.stringify(profile),
      updatedByUserId,
      occurredAt,
    )
    .run();
}

async function resetAppearanceRows(): Promise<void> {
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM guild_appearance_profiles"),
    dataEnv.DATA.prepare("DELETE FROM user_appearance_profiles"),
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
  ]);
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

async function insertPrincipals(): Promise<void> {
  await dataEnv.DATA.batch([
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
  ]);
  await insertPrincipals();
});

describe("D1AppearanceRepository", () => {
  it("distinguishes a missing personal profile from a stored revision", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    await expect(repository.getPersonalV1(userId)).resolves.toEqual({
      status: "missing",
    });

    const profile = personalProfile();
    await expect(
      repository.putPersonalV1({
        userId,
        expectedRevision: 0,
        profile,
        mutationId: "appearance-user-create",
        occurredAt,
      }),
    ).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile,
    });
    await expect(repository.getPersonalV1(userId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile,
    });
  });

  it("implements the complete personal V1/V2/V3 read matrix without persisting migrations", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    await expect(repository.getPersonalV1(userId)).resolves.toEqual({
      status: "missing",
    });
    await expect(repository.getPersonalV2(userId)).resolves.toEqual({
      status: "missing",
    });
    await expect(repository.getPersonalV3(userId)).resolves.toEqual({
      status: "missing",
    });

    const v1 = personalProfile();
    await storePersonalProfile(v1);
    const before = await dataEnv.DATA.prepare(
      "SELECT revision, profile_json, updated_at FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first();
    await expect(repository.getPersonalV1(userId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: v1,
    });
    await expect(repository.getPersonalV2(userId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: migrateAppearanceProfileV1(v1),
    });
    await expect(repository.getPersonalV3(userId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    const after = await dataEnv.DATA.prepare(
      "SELECT revision, profile_json, updated_at FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first();
    expect(after).toEqual(before);
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts",
      ).first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });

    await resetAppearanceRows();
    const v2 = personalProfileV2();
    await storePersonalProfile(v2);
    await expect(repository.getPersonalV1(userId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    await expect(repository.getPersonalV2(userId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: v2,
    });
    await expect(repository.getPersonalV3(userId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });

    await resetAppearanceRows();
    const v3 = personalProfileV3();
    await storePersonalProfile(v3);
    await expect(repository.getPersonalV1(userId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    await expect(repository.getPersonalV2(userId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    await expect(repository.getPersonalV3(userId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: v3,
    });
  });

  it("implements the complete personal V1/V2/V3 write matrix", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    const submittedV2 = personalProfileV2("#ABCDEF");
    const createdV2 = personalProfileV2("#abcdef");
    await expect(
      repository.putPersonalV2({
        userId,
        expectedRevision: 0,
        profile: submittedV2,
        mutationId: "appearance-user-v2-create",
        occurredAt,
      }),
    ).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: createdV2,
    });
    const storedProfile = await dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ profile_json: string }>();
    const storedReceipt = await dataEnv.DATA.prepare(
      "SELECT payload_json FROM mutation_receipts WHERE mutation_id = ?",
    )
      .bind("appearance-user-v2-create")
      .first<{ payload_json: string }>();
    if (storedProfile === null || storedReceipt === null) {
      throw new Error("Canonical V2 profile write is missing");
    }
    expect(JSON.parse(storedProfile.profile_json)).toEqual(createdV2);
    expect(JSON.parse(storedReceipt.payload_json)).toEqual({
      expectedRevision: 0,
      profile: createdV2,
    });

    await resetAppearanceRows();
    const v1 = personalProfile();
    await storePersonalProfile(v1);
    const upgraded = personalProfileV2("#abcdef");
    const upgrade = {
      userId,
      expectedRevision: 1,
      profile: upgraded,
      mutationId: "appearance-user-v2-upgrade",
      occurredAt: occurredAt + 1,
    };
    await expect(repository.putPersonalV2(upgrade)).resolves.toEqual({
      status: "applied",
      revision: 2,
      profile: upgraded,
    });
    await expect(repository.putPersonalV2(upgrade)).resolves.toEqual({
      status: "existing",
      revision: 2,
      profile: upgraded,
    });
    await expect(
      repository.putPersonalV1({
        userId,
        expectedRevision: 2,
        profile: personalProfile("#000000"),
        mutationId: "appearance-user-v1-downgrade",
        occurredAt: occurredAt + 2,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });

    const updated = personalProfileV2("#fedcba");
    await expect(
      repository.putPersonalV2({
        userId,
        expectedRevision: 2,
        profile: updated,
        mutationId: "appearance-user-v2-update",
        occurredAt: occurredAt + 3,
      }),
    ).resolves.toEqual({
      status: "applied",
      revision: 3,
      profile: updated,
    });
    await expect(repository.getPersonalV2(userId)).resolves.toEqual({
      status: "found",
      revision: 3,
      profile: updated,
    });
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts",
      ).first<{ count: number }>(),
    ).resolves.toEqual({ count: 2 });
    await expect(
      repository.putPersonalV3({
        userId,
        expectedRevision: 3,
        profile: personalProfileV3(),
        mutationId: "appearance-user-v3-without-reset",
        occurredAt: occurredAt + 4,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });

    await resetAppearanceRows();
    const submittedV3 = personalProfileV3("#ABCDEF");
    const canonicalV3 = personalProfileV3("#abcdef");
    const createV3 = {
      userId,
      expectedRevision: 0,
      profile: submittedV3,
      mutationId: "appearance-user-v3-create",
      occurredAt: occurredAt + 5,
    };
    await expect(repository.putPersonalV3(createV3)).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: canonicalV3,
    });
    await expect(repository.putPersonalV3(createV3)).resolves.toEqual({
      status: "existing",
      revision: 1,
      profile: canonicalV3,
    });
    await expect(
      repository.putPersonalV2({
        userId,
        expectedRevision: 1,
        profile: personalProfileV2(),
        mutationId: "appearance-user-v2-after-v3",
        occurredAt: occurredAt + 6,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    const updatedV3 = personalProfileV3("#fedcba");
    await expect(
      repository.putPersonalV3({
        userId,
        expectedRevision: 1,
        profile: updatedV3,
        mutationId: "appearance-user-v3-update",
        occurredAt: occurredAt + 7,
      }),
    ).resolves.toEqual({
      status: "applied",
      revision: 2,
      profile: updatedV3,
    });
    await expect(repository.getPersonalV3(userId)).resolves.toEqual({
      status: "found",
      revision: 2,
      profile: updatedV3,
    });
  });

  it("implements the complete guild V1/V2/V3 compatibility matrix", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    await expect(repository.getGuildV1(guildId)).resolves.toEqual({
      status: "missing",
    });
    await expect(repository.getGuildV2(guildId)).resolves.toEqual({
      status: "missing",
    });
    await expect(repository.getGuildV3(guildId)).resolves.toEqual({
      status: "missing",
    });

    const v1 = guildProfile();
    await expect(
      repository.putGuildV1({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile: v1,
        mutationId: "appearance-guild-v1-create",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "applied", revision: 1, profile: v1 });
    await expect(repository.getGuildV1(guildId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: v1,
      updatedByUserId: userId,
    });
    await expect(repository.getGuildV2(guildId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: migrateGuildAppearanceProfileV1(v1),
      updatedByUserId: userId,
    });
    await expect(repository.getGuildV3(guildId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });

    const updatedV1: GuildAppearanceProfileV1 = { ...v1, mode: "default" };
    await expect(
      repository.putGuildV1({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 1,
        profile: updatedV1,
        mutationId: "appearance-guild-v1-update",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toEqual({
      status: "applied",
      revision: 2,
      profile: updatedV1,
    });
    await expect(repository.getGuildV2(guildId)).resolves.toMatchObject({
      status: "found",
      revision: 2,
      profile: migrateGuildAppearanceProfileV1(updatedV1),
    });

    const v2 = guildProfileV2();
    await expect(
      repository.putGuildV2({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 2,
        profile: v2,
        mutationId: "appearance-guild-v2-upgrade",
        occurredAt: occurredAt + 2,
      }),
    ).resolves.toEqual({ status: "applied", revision: 3, profile: v2 });
    await expect(repository.getGuildV1(guildId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    await expect(repository.getGuildV2(guildId)).resolves.toEqual({
      status: "found",
      revision: 3,
      profile: v2,
      updatedByUserId: userId,
    });
    await expect(repository.getGuildV3(guildId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    await expect(
      repository.putGuildV1({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 3,
        profile: v1,
        mutationId: "appearance-guild-v1-downgrade",
        occurredAt: occurredAt + 3,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    await expect(
      repository.putGuildV2({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 3,
        profile: { ...v2, mode: "default" },
        mutationId: "appearance-guild-v2-update",
        occurredAt: occurredAt + 4,
      }),
    ).resolves.toMatchObject({ status: "applied", revision: 4 });

    await resetAppearanceRows();
    await expect(
      repository.putGuildV2({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile: v2,
        mutationId: "appearance-guild-v2-create",
        occurredAt: occurredAt + 5,
      }),
    ).resolves.toEqual({ status: "applied", revision: 1, profile: v2 });
    await expect(
      repository.putGuildV3({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 1,
        profile: guildProfileV3(),
        mutationId: "appearance-guild-v3-without-reset",
        occurredAt: occurredAt + 6,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });

    await resetAppearanceRows();
    const v3 = guildProfileV3();
    await expect(
      repository.putGuildV3({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile: v3,
        mutationId: "appearance-guild-v3-create",
        occurredAt: occurredAt + 7,
      }),
    ).resolves.toEqual({ status: "applied", revision: 1, profile: v3 });
    await expect(repository.getGuildV1(guildId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    await expect(repository.getGuildV2(guildId)).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    await expect(repository.getGuildV3(guildId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile: v3,
      updatedByUserId: userId,
    });
  });

  it("reads personal V3 and V4 compatibly while keeping writes version-strict", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    const v3 = personalProfileV3();
    await storePersonalProfile(v3, 7);
    const before = await dataEnv.DATA.prepare(
      "SELECT revision, profile_json, updated_at FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first();

    await expect(repository.getPersonalV4(userId)).resolves.toEqual({
      status: "found",
      revision: 7,
      profile: v3,
    });
    await expect(
      repository.putPersonalV4({
        userId,
        expectedRevision: 7,
        profile: personalProfileV4(),
        mutationId: "appearance-user-v4-against-v3",
        occurredAt,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    expect(
      await dataEnv.DATA.prepare(
        "SELECT revision, profile_json, updated_at FROM user_appearance_profiles WHERE user_id = ?",
      )
        .bind(userId)
        .first(),
    ).toEqual(before);

    await resetAppearanceRows();
    const v4 = personalProfileV4();
    await storePersonalProfile(v4, 7);
    await expect(repository.getPersonalV3(userId)).resolves.toEqual({
      status: "found",
      revision: 7,
      profile: projectAppearanceProfileV4ToV3(v4),
    });
    await expect(repository.getPersonalV4(userId)).resolves.toEqual({
      status: "found",
      revision: 7,
      profile: v4,
    });
    await expect(
      repository.putPersonalV3({
        userId,
        expectedRevision: 7,
        profile: v3,
        mutationId: "appearance-user-v3-against-v4",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    const updated = structuredClone(v4);
    updated.diceView.mode = "legacy";
    await expect(
      repository.putPersonalV4({
        userId,
        expectedRevision: 7,
        profile: updated,
        mutationId: "appearance-user-v4-update",
        occurredAt: occurredAt + 2,
      }),
    ).resolves.toEqual({
      status: "applied",
      revision: 8,
      profile: updated,
    });
  });

  it("reads guild V3 and V4 compatibly while keeping writes version-strict", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    const v3 = guildProfileV3();
    await storeGuildProfile(v3, 4);

    await expect(repository.getGuildV4(guildId)).resolves.toEqual({
      status: "found",
      revision: 4,
      profile: v3,
      updatedByUserId: userId,
    });
    await expect(
      repository.putGuildV4({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 4,
        profile: guildProfileV4(),
        mutationId: "appearance-guild-v4-against-v3",
        occurredAt,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });

    await resetAppearanceRows();
    const v4 = guildProfileV4();
    await storeGuildProfile(v4, 4);
    await expect(repository.getGuildV3(guildId)).resolves.toEqual({
      status: "found",
      revision: 4,
      profile: projectGuildAppearanceProfileV4ToV3(v4),
      updatedByUserId: userId,
    });
    await expect(repository.getGuildV4(guildId)).resolves.toEqual({
      status: "found",
      revision: 4,
      profile: v4,
      updatedByUserId: userId,
    });
    await expect(
      repository.putGuildV3({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 4,
        profile: v3,
        mutationId: "appearance-guild-v3-against-v4",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
  });

  it("creates V4 rows without requiring an older profile", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    const personal = personalProfileV4();
    const guild = guildProfileV4();

    await expect(
      repository.putPersonalV4({
        userId,
        expectedRevision: 0,
        profile: personal,
        mutationId: "appearance-user-v4-create",
        occurredAt,
      }),
    ).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: personal,
    });
    await expect(
      repository.putGuildV4({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile: guild,
        mutationId: "appearance-guild-v4-create",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile: guild,
    });
  });

  it("fails closed for malformed stored versions on reads and writes", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    await storePersonalProfile({ version: 2 });
    await storeGuildProfile({ version: 1 });

    await expect(repository.getPersonalV1(userId)).rejects.toThrow(
      "Stored appearance profile is invalid",
    );
    await expect(repository.getPersonalV2(userId)).rejects.toThrow(
      "Stored appearance profile is invalid",
    );
    await expect(repository.getPersonalV3(userId)).rejects.toThrow(
      "Stored appearance profile is invalid",
    );
    await expect(repository.getGuildV1(guildId)).rejects.toThrow(
      "Stored appearance profile is invalid",
    );
    await expect(repository.getGuildV2(guildId)).rejects.toThrow(
      "Stored appearance profile is invalid",
    );
    await expect(repository.getGuildV3(guildId)).rejects.toThrow(
      "Stored appearance profile is invalid",
    );
    await expect(
      repository.putPersonalV1({
        userId,
        expectedRevision: 1,
        profile: personalProfile(),
        mutationId: "appearance-malformed-personal",
        occurredAt,
      }),
    ).rejects.toThrow("Stored appearance profile is invalid");
    await expect(
      repository.putGuildV2({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 1,
        profile: guildProfileV2(),
        mutationId: "appearance-malformed-guild",
        occurredAt,
      }),
    ).rejects.toThrow("Stored appearance profile is invalid");
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts",
      ).first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });

    await resetAppearanceRows();
    await storePersonalProfile({ version: 3 });
    await expect(repository.getPersonalV2(userId)).rejects.toThrow(
      "Stored appearance profile is invalid",
    );
    await expect(repository.getPersonalV3(userId)).rejects.toThrow(
      "Stored appearance profile is invalid",
    );
    await expect(
      repository.putPersonalV2({
        userId,
        expectedRevision: 1,
        profile: personalProfileV2(),
        mutationId: "appearance-unknown-version",
        occurredAt: occurredAt + 1,
      }),
    ).rejects.toThrow("Stored appearance profile is invalid");
  });

  it("preserves an applied V1 receipt after the row upgrades to V2", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    const original = {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-v1-before-upgrade",
      occurredAt,
    };
    await expect(repository.putPersonalV1(original)).resolves.toMatchObject({
      status: "applied",
      revision: 1,
    });
    await expect(
      repository.putPersonalV2({
        ...original,
        expectedRevision: 1,
        profile: personalProfileV2(),
        mutationId: "appearance-v2-upgrade-after-v1",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toMatchObject({ status: "applied", revision: 2 });

    await expect(repository.putPersonalV1(original)).resolves.toEqual({
      status: "existing",
      revision: 1,
      profile: personalProfile(),
    });
    await expect(repository.getPersonalV2(userId)).resolves.toMatchObject({
      status: "found",
      revision: 2,
      profile: personalProfileV2(),
    });
  });

  it("rejects a V1 downgrade when V2 wins between validation and mutation", async () => {
    await storePersonalProfile(personalProfile());
    const racingDb = databaseWithBatchRace(async () => {
      await dataEnv.DATA.prepare(
        `UPDATE user_appearance_profiles
         SET revision = 2, profile_json = ?, updated_at = ?
         WHERE user_id = ?`,
      )
        .bind(JSON.stringify(personalProfileV2()), occurredAt + 1, userId)
        .run();
    });
    const repository = new D1AppearanceRepository(racingDb, catalog);

    await expect(
      repository.putPersonalV1({
        userId,
        expectedRevision: 1,
        profile: personalProfile("#abcdef"),
        mutationId: "appearance-v1-raced-by-v2",
        occurredAt: occurredAt + 2,
      }),
    ).resolves.toEqual({
      status: "appearance_profile_version_conflict",
    });
    await expect(repository.getPersonalV2(userId)).resolves.toMatchObject({
      status: "found",
      revision: 2,
      profile: personalProfileV2(),
    });
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts WHERE mutation_id = ?",
      )
        .bind("appearance-v1-raced-by-v2")
        .first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });
  });

  it("rejects same-revision raw document races for personal and guild writes", async () => {
    await storePersonalProfile(personalProfile());
    const racedPersonalJson = JSON.stringify(personalProfile("#111111"));
    const personalRepository = new D1AppearanceRepository(
      databaseWithBatchRace(async () => {
        await dataEnv.DATA.prepare(
          `UPDATE user_appearance_profiles
           SET profile_json = ?, updated_at = ?
           WHERE user_id = ?`,
        )
          .bind(racedPersonalJson, occurredAt + 1, userId)
          .run();
      }),
      catalog,
    );
    await expect(
      personalRepository.putPersonalV1({
        userId,
        expectedRevision: 1,
        profile: personalProfile("#222222"),
        mutationId: "appearance-personal-fingerprint-race",
        occurredAt: occurredAt + 2,
      }),
    ).resolves.toEqual({ status: "revision_conflict", revision: 1 });
    const storedPersonal = await dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ profile_json: string }>();
    expect(storedPersonal?.profile_json).toBe(racedPersonalJson);

    await resetAppearanceRows();
    await storeGuildProfile(guildProfile());
    const racedGuild: GuildAppearanceProfileV1 = {
      ...guildProfile(),
      mode: "default",
    };
    const racedGuildJson = JSON.stringify(racedGuild);
    const guildRepository = new D1AppearanceRepository(
      databaseWithBatchRace(async () => {
        await dataEnv.DATA.prepare(
          `UPDATE guild_appearance_profiles
           SET profile_json = ?, updated_at = ?
           WHERE guild_id = ?`,
        )
          .bind(racedGuildJson, occurredAt + 3, guildId)
          .run();
      }),
      catalog,
    );
    await expect(
      guildRepository.putGuildV1({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 1,
        profile: { ...guildProfile(), mode: "off" },
        mutationId: "appearance-guild-fingerprint-race",
        occurredAt: occurredAt + 4,
      }),
    ).resolves.toEqual({ status: "revision_conflict", revision: 1 });
    const storedGuild = await dataEnv.DATA.prepare(
      "SELECT profile_json FROM guild_appearance_profiles WHERE guild_id = ?",
    )
      .bind(guildId)
      .first<{ profile_json: string }>();
    expect(storedGuild?.profile_json).toBe(racedGuildJson);
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts",
      ).first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });
  });

  it("returns the original result for an identical mutation retry", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    const input = {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-user-retry",
      occurredAt,
    };

    await expect(repository.putPersonalV1(input)).resolves.toMatchObject({
      status: "applied",
      revision: 1,
    });
    await expect(repository.putPersonalV1(input)).resolves.toMatchObject({
      status: "existing",
      revision: 1,
    });
    const count = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM mutation_receipts",
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("fails closed for mutation-id reuse and stale profile revisions", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    await repository.putPersonalV1({
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-user-conflict",
      occurredAt,
    });

    await expect(
      repository.putPersonalV1({
        userId,
        expectedRevision: 0,
        profile: personalProfile("#abcdef"),
        mutationId: "appearance-user-conflict",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "mutation_conflict" });
    await expect(
      repository.putPersonalV1({
        userId,
        expectedRevision: 0,
        profile: personalProfile("#abcdef"),
        mutationId: "appearance-user-stale",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toEqual({ status: "revision_conflict", revision: 1 });
    await expect(repository.getPersonalV1(userId)).resolves.toMatchObject({
      revision: 1,
      profile: personalProfile(),
    });
  });

  it("updates only the expected personal revision", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    await repository.putPersonalV1({
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-user-v1",
      occurredAt,
    });
    const profile = personalProfile("#abcdef");

    await expect(
      repository.putPersonalV1({
        userId,
        expectedRevision: 1,
        profile,
        mutationId: "appearance-user-v2",
        occurredAt: occurredAt + 1,
      }),
    ).resolves.toEqual({ status: "applied", revision: 2, profile });
    await expect(repository.getPersonalV1(userId)).resolves.toEqual({
      status: "found",
      revision: 2,
      profile,
    });
  });

  it("serializes concurrent identical creates", async () => {
    const input = {
      userId,
      expectedRevision: 0,
      profile: personalProfile(),
      mutationId: "appearance-user-concurrent",
      occurredAt,
    };
    const results = await Promise.all([
      new D1AppearanceRepository(dataEnv.DATA, catalog).putPersonalV1(input),
      new D1AppearanceRepository(dataEnv.DATA, catalog).putPersonalV1(input),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "applied",
      "existing",
    ]);
  });

  it("stores guild profiles with the author and optimistic revision", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    const profile = guildProfile();

    await expect(
      repository.putGuildV1({
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile,
        mutationId: "appearance-guild-create",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "applied", revision: 1, profile });
    await expect(repository.getGuildV1(guildId)).resolves.toEqual({
      status: "found",
      revision: 1,
      profile,
      updatedByUserId: userId,
    });
    const row = await dataEnv.DATA.prepare(
      "SELECT updated_by_user_id FROM guild_appearance_profiles WHERE guild_id = ?",
    )
      .bind(guildId)
      .first();
    expect(row).toEqual({ updated_by_user_id: userId });
  });

  it("rejects invalid profiles and reports missing parent records", async () => {
    const repository = new D1AppearanceRepository(dataEnv.DATA, catalog);
    const invalid = { ...personalProfile(), unexpected: true };
    await expect(
      repository.putPersonalV1({
        userId,
        expectedRevision: 0,
        profile: invalid,
        mutationId: "appearance-invalid",
        occurredAt,
      }),
    ).rejects.toThrow("Appearance profile has invalid fields");

    await expect(
      repository.putGuildV1({
        guildId: "100000000000000099",
        updatedByUserId: userId,
        expectedRevision: 0,
        profile: guildProfile(),
        mutationId: "appearance-missing-guild",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "missing" });
  });
});
