import {
  parseAppearanceProfileV4,
  parseGuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_VALIDATION_CATALOG_V3,
  BUILTIN_APPEARANCE_STYLES_V3,
} from "../../packages/dice-appearance/src";
import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { expect, it } from "vitest";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

const timestamp = 1_767_225_600_000;
const userId = "100000000000000003";
const guildId = "100000000000000002";
const prismaticGlass = BUILTIN_APPEARANCE_STYLES_V3.find(
  ({ id }) => id === "glass-cannon",
);
if (prismaticGlass === undefined) throw new Error("Prismatic Glass is missing");
const design = {
  id: "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f",
  name: "Production design",
  recipe: prismaticGlass.recipe,
};
const assignments = {
  all: { source: "custom", id: design.id },
  overrides: { d20: { source: "builtin", id: "glass-cannon" } },
};
const diceView = {
  elevationDegrees: 40,
  mode: "normal",
  azimuth: {
    all: { mode: "random", customDegrees: 0 },
    overrides: {},
  },
};

it("upgrades stored Personal and Server V3 profiles to V4 without changing profile metadata", async () => {
  const migration = dataEnv.TEST_MIGRATIONS.find(
    ({ name }) => name === "0015_appearance_profiles_v4.sql",
  );
  if (migration === undefined) throw new Error("Appearance V4 migration is missing");
  await applyD1Migrations(
    dataEnv.DATA,
    dataEnv.TEST_MIGRATIONS.filter(({ name }) => name < migration.name),
  );

  const personalV3 = { version: 3, designs: [design], assignments };
  const guildV3 = { ...personalV3, mode: "enforced" };
  const existingV4 = {
    ...personalV3,
    version: 4,
    diceView: { ...diceView, mode: "clear" },
  };
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare(
      "INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind(userId, timestamp, timestamp),
    dataEnv.DATA.prepare(
      "INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind("100000000000000004", timestamp, timestamp),
    dataEnv.DATA.prepare(
      "INSERT INTO guilds (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind(guildId, timestamp, timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 7, ?, ?)`,
    ).bind(userId, JSON.stringify(personalV3), timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 9, ?, ?)`,
    ).bind("100000000000000004", JSON.stringify(existingV4), timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO guild_appearance_profiles
         (guild_id, revision, profile_json, updated_by_user_id, updated_at)
       VALUES (?, 5, ?, ?, ?)`,
    ).bind(guildId, JSON.stringify(guildV3), userId, timestamp),
  ]);

  await dataEnv.DATA.batch(
    migration.queries.map((query) => dataEnv.DATA.prepare(query)),
  );

  const personal = await dataEnv.DATA.prepare(
    `SELECT revision, profile_json, updated_at
     FROM user_appearance_profiles WHERE user_id = ?`,
  ).bind(userId).first<{
    revision: number;
    profile_json: string;
    updated_at: number;
  }>();
  expect(personal).toMatchObject({ revision: 7, updated_at: timestamp });
  const migratedPersonal: unknown = JSON.parse(
    personal?.profile_json ?? "null",
  );
  expect(
    parseAppearanceProfileV4(
      migratedPersonal,
      APPEARANCE_VALIDATION_CATALOG_V3,
    ),
  ).toEqual({
    version: 4,
    designs: [design],
    assignments,
    diceView,
  });

  const guild = await dataEnv.DATA.prepare(
    `SELECT revision, profile_json, updated_by_user_id, updated_at
     FROM guild_appearance_profiles WHERE guild_id = ?`,
  ).bind(guildId).first<{
    revision: number;
    profile_json: string;
    updated_by_user_id: string;
    updated_at: number;
  }>();
  expect(guild).toMatchObject({
    revision: 5,
    updated_by_user_id: userId,
    updated_at: timestamp,
  });
  const migratedGuild: unknown = JSON.parse(guild?.profile_json ?? "null");
  expect(
    parseGuildAppearanceProfileV4(
      migratedGuild,
      APPEARANCE_VALIDATION_CATALOG_V3,
    ),
  ).toEqual({
    version: 4,
    designs: [design],
    assignments,
    mode: "enforced",
    diceView,
  });

  await expect(
    dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    ).bind("100000000000000004").first("profile_json"),
  ).resolves.toBe(JSON.stringify(existingV4));
});
