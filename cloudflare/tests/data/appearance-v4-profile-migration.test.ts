import {
  parseAppearanceProfileV4,
  parseGuildAppearanceProfileV4,
  type AppearanceAssignmentsV3,
  type AppearanceProfileV3,
  type AppearanceProfileV4,
  type DiceViewPreferencesV4,
  type GuildAppearanceProfileV3,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_VALIDATION_CATALOG_V3,
  BUILTIN_APPEARANCE_STYLES_V3,
} from "../../packages/dice-appearance/src";
import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { expect, it } from "vitest";
import { z } from "zod";

const TestMigrationsBindingSchema = z.object({
  TEST_MIGRATIONS: z.array(z.strictObject({
    name: z.string(),
    queries: z.array(z.string()),
  })),
});
const PersonalProfileRowSchema = z.strictObject({
  revision: z.number().int(),
  profile_json: z.string(),
  updated_at: z.number().int(),
});
const GuildProfileRowSchema = PersonalProfileRowSchema.extend({
  updated_by_user_id: z.string(),
});
const JsonDocumentSchema = z.json();
const dataEnv = {
  DATA: env.DATA,
  ...TestMigrationsBindingSchema.parse(env),
} satisfies { DATA: D1Database; TEST_MIGRATIONS: D1Migration[] };

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
} satisfies AppearanceAssignmentsV3;
const diceView = {
  elevationDegrees: 40,
  mode: "normal",
  azimuth: {
    all: { mode: "random", customDegrees: 0 },
    overrides: {},
  },
} satisfies DiceViewPreferencesV4;

it("upgrades stored Personal and Server V3 profiles to V4 without changing profile metadata", async () => {
  const migration = dataEnv.TEST_MIGRATIONS.find(
    ({ name }) => name === "0015_appearance_profiles_v4.sql",
  );
  if (migration === undefined) throw new Error("Appearance V4 migration is missing");
  await applyD1Migrations(
    dataEnv.DATA,
    dataEnv.TEST_MIGRATIONS.filter(({ name }) => name < migration.name),
  );

  const personalV3 = {
    version: 3,
    designs: [design],
    assignments,
  } satisfies AppearanceProfileV3;
  const guildV3 = {
    ...personalV3,
    mode: "enforced",
  } satisfies GuildAppearanceProfileV3;
  const existingV4 = {
    ...personalV3,
    version: 4,
    diceView: { ...diceView, mode: "clear" },
  } satisfies AppearanceProfileV4;
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

  const personal = PersonalProfileRowSchema.parse(
    await dataEnv.DATA.prepare(
      `SELECT revision, profile_json, updated_at
       FROM user_appearance_profiles WHERE user_id = ?`,
    ).bind(userId).first(),
  );
  expect(personal).toMatchObject({ revision: 7, updated_at: timestamp });
  const migratedPersonal = JsonDocumentSchema.parse(
    JSON.parse(personal.profile_json),
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

  const guild = GuildProfileRowSchema.parse(
    await dataEnv.DATA.prepare(
      `SELECT revision, profile_json, updated_by_user_id, updated_at
       FROM guild_appearance_profiles WHERE guild_id = ?`,
    ).bind(guildId).first(),
  );
  expect(guild).toMatchObject({
    revision: 5,
    updated_by_user_id: userId,
    updated_at: timestamp,
  });
  const migratedGuild = JsonDocumentSchema.parse(
    JSON.parse(guild.profile_json),
  );
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
