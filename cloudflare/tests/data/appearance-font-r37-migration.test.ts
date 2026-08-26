import {
  parseAppearanceProfileV4,
  parseGuildAppearanceProfileV4,
  type AppearanceProfileV4,
  type AppearanceRecipeV3,
  type AppearanceSelection,
  type FontIdV4,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_VALIDATION_CATALOG_V3,
  BUILTIN_APPEARANCE_RECIPES_R34_V3,
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
const userId = "100000000000000031";
const secondUserId = "100000000000000032";
const conflictingUserId = "100000000000000034";
const malformedUserId = "100000000000000035";
const guildId = "100000000000000033";
const designIds = [
  "00000000-0000-4000-8000-000000000031",
  "00000000-0000-4000-8000-000000000032",
  "00000000-0000-4000-8000-000000000033",
  "00000000-0000-4000-8000-000000000034",
] as const;
const diceView = {
  elevationDegrees: 40,
  mode: "normal" as const,
  azimuth: {
    all: { mode: "random" as const, customDegrees: 0 },
    overrides: {},
  },
};

function migration(): D1Migration {
  const candidate = dataEnv.TEST_MIGRATIONS.find(
    ({ name }) => name === "0018_appearance_profile_fonts_r37.sql",
  );
  if (candidate === undefined) throw new Error("r37 font migration is missing");
  return candidate;
}

async function applyEarlierMigrations(target: D1Migration): Promise<void> {
  await applyD1Migrations(
    dataEnv.DATA,
    dataEnv.TEST_MIGRATIONS.filter(({ name }) => name < target.name),
  );
}

function solidRecipe(
  font: AppearanceSelection<FontIdV4>,
): AppearanceRecipeV3 {
  const recipe = BUILTIN_APPEARANCE_RECIPES_R34_V3.solid?.recipe;
  if (recipe === undefined) throw new Error("Historical Solid recipe is missing");
  return { ...structuredClone(recipe), font };
}

function personalProfile(): AppearanceProfileV4 {
  return {
    version: 4,
    designs: [
      {
        id: designIds[0],
        name: "Fixed Liberation",
        recipe: solidRecipe({ mode: "fixed", value: "liberation-sans" }),
      },
      {
        id: designIds[1],
        name: "Fixed Barlow",
        recipe: solidRecipe({ mode: "fixed", value: "barlow-condensed" }),
      },
      {
        id: designIds[2],
        name: "Allowed fonts",
        recipe: solidRecipe({
          mode: "allowlist",
          values: ["liberation-sans", "barlow-condensed", "new-rocker"],
        }),
      },
      {
        id: designIds[3],
        name: "Weighted fonts",
        recipe: solidRecipe({
          mode: "weighted",
          options: [
            { value: "liberation-sans", weight: 60 },
            { value: "barlow-condensed", weight: 40 },
          ],
        }),
      },
    ],
    assignments: {
      all: { source: "custom", id: designIds[0] },
      overrides: { d20: { source: "custom", id: designIds[3] } },
    },
    diceView,
  };
}

it("migrates saved Personal and Server font slots without changing metadata", async () => {
  const target = migration();
  await applyEarlierMigrations(target);

  const personal = personalProfile();
  const guild: GuildAppearanceProfileV4 = {
    ...structuredClone(personal),
    mode: "enforced",
  };
  const unrelated: AppearanceProfileV4 = {
    ...structuredClone(personal),
    designs: [
      {
        id: designIds[0],
        name: "Unrelated font",
        recipe: solidRecipe({ mode: "fixed", value: "new-rocker" }),
      },
    ],
    assignments: { all: null, overrides: {} },
  };
  const conflicting: AppearanceProfileV4 = {
    ...structuredClone(personal),
    designs: [
      {
        id: designIds[0],
        name: "Conflicting fonts",
        recipe: solidRecipe({
          mode: "allowlist",
          values: ["barlow-condensed", "jetbrains-mono"],
        }),
      },
    ],
    assignments: { all: null, overrides: {} },
  };
  const malformedBase = structuredClone(personal);
  const malformedDesign = malformedBase.designs[1];
  if (malformedDesign === undefined) {
    throw new Error("Malformed design fixture is missing");
  }
  const { font: omittedFont, ...malformedRecipe } = malformedDesign.recipe;
  void omittedFont;
  const malformed = {
    ...malformedBase,
    designs: malformedBase.designs.map((candidate) =>
      candidate.id === malformedDesign.id
        ? { ...candidate, recipe: malformedRecipe }
        : candidate),
  };

  const personalJson = JSON.stringify(personal);
  const guildJson = JSON.stringify(guild);
  const unrelatedJson = JSON.stringify(unrelated);
  const conflictingJson = JSON.stringify(conflicting);
  const malformedJson = JSON.stringify(malformed);

  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare(
      "INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind(userId, timestamp, timestamp),
    dataEnv.DATA.prepare(
      "INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind(secondUserId, timestamp, timestamp),
    dataEnv.DATA.prepare(
      "INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind(conflictingUserId, timestamp, timestamp),
    dataEnv.DATA.prepare(
      "INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind(malformedUserId, timestamp, timestamp),
    dataEnv.DATA.prepare(
      "INSERT INTO guilds (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind(guildId, timestamp, timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 7, ?, ?)`,
    ).bind(userId, personalJson, timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 3, ?, ?)`,
    ).bind(secondUserId, unrelatedJson, timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO guild_appearance_profiles
         (guild_id, revision, profile_json, updated_by_user_id, updated_at)
       VALUES (?, 5, ?, ?, ?)`,
    ).bind(guildId, guildJson, userId, timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 1, ?, ?)`,
    ).bind(malformedUserId, malformedJson, timestamp),
  ]);

  await expect(applyD1Migrations(dataEnv.DATA, [target])).rejects.toThrow();
  await expect(
    dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    ).bind(userId).first("profile_json"),
  ).resolves.toBe(personalJson);
  await expect(
    dataEnv.DATA.prepare(
      "SELECT profile_json FROM guild_appearance_profiles WHERE guild_id = ?",
    ).bind(guildId).first("profile_json"),
  ).resolves.toBe(guildJson);
  await expect(
    dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    ).bind(malformedUserId).first("profile_json"),
  ).resolves.toBe(malformedJson);
  await dataEnv.DATA.prepare(
    "DELETE FROM user_appearance_profiles WHERE user_id = ?",
  ).bind(malformedUserId).run();

  await dataEnv.DATA.prepare(
    `INSERT INTO user_appearance_profiles
       (user_id, revision, profile_json, updated_at)
     VALUES (?, 1, ?, ?)`,
  ).bind(conflictingUserId, conflictingJson, timestamp).run();
  await expect(applyD1Migrations(dataEnv.DATA, [target])).rejects.toThrow();
  await expect(
    dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    ).bind(userId).first("profile_json"),
  ).resolves.toBe(personalJson);
  await expect(
    dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    ).bind(conflictingUserId).first("profile_json"),
  ).resolves.toBe(conflictingJson);
  await dataEnv.DATA.prepare(
    "DELETE FROM user_appearance_profiles WHERE user_id = ?",
  ).bind(conflictingUserId).run();

  await applyD1Migrations(dataEnv.DATA, [target]);

  const personalRow = PersonalProfileRowSchema.parse(
    await dataEnv.DATA.prepare(
      `SELECT revision, profile_json, updated_at
       FROM user_appearance_profiles WHERE user_id = ?`,
    ).bind(userId).first(),
  );
  expect(personalRow).toMatchObject({ revision: 7, updated_at: timestamp });
  const migratedPersonal = parseAppearanceProfileV4(
    JsonDocumentSchema.parse(JSON.parse(personalRow.profile_json)),
    APPEARANCE_VALIDATION_CATALOG_V3,
  );
  expect(migratedPersonal.designs.map(({ recipe }) => recipe.font)).toEqual([
    { mode: "fixed", value: "barlow-condensed" },
    { mode: "fixed", value: "barlow-condensed" },
    {
      mode: "allowlist",
      values: ["barlow-condensed", "jetbrains-mono", "new-rocker"],
    },
    {
      mode: "weighted",
      options: [
        { value: "barlow-condensed", weight: 60 },
        { value: "jetbrains-mono", weight: 40 },
      ],
    },
  ]);
  expect(migratedPersonal.assignments).toEqual(personal.assignments);
  expect(migratedPersonal.diceView).toEqual(personal.diceView);

  const guildRow = GuildProfileRowSchema.parse(
    await dataEnv.DATA.prepare(
      `SELECT revision, profile_json, updated_by_user_id, updated_at
       FROM guild_appearance_profiles WHERE guild_id = ?`,
    ).bind(guildId).first(),
  );
  expect(guildRow).toMatchObject({
    revision: 5,
    updated_by_user_id: userId,
    updated_at: timestamp,
  });
  expect(
    parseGuildAppearanceProfileV4(
      JsonDocumentSchema.parse(JSON.parse(guildRow.profile_json)),
      APPEARANCE_VALIDATION_CATALOG_V3,
    ).designs.map(({ recipe }) => recipe.font),
  ).toEqual(migratedPersonal.designs.map(({ recipe }) => recipe.font));

  await expect(
    dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    ).bind(secondUserId).first("profile_json"),
  ).resolves.toBe(unrelatedJson);

  const firstMigratedJson = personalRow.profile_json;
  await applyD1Migrations(dataEnv.DATA, [target]);
  await expect(
    dataEnv.DATA.prepare(
      "SELECT profile_json FROM user_appearance_profiles WHERE user_id = ?",
    ).bind(userId).first("profile_json"),
  ).resolves.toBe(firstMigratedJson);
});
