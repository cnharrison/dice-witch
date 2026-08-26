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
const VersionRowsSchema = z.array(z.strictObject({
  scope: z.enum(["personal", "server"]),
  version: z.number().int(),
  count: z.number().int().nonnegative(),
}));
const dataEnv = {
  DATA: env.DATA,
  ...TestMigrationsBindingSchema.parse(env),
} satisfies { DATA: D1Database; TEST_MIGRATIONS: D1Migration[] };

const timestamp = 1_767_225_600_000;
const userIds = {
  legacy: "100000000000000003",
  migrated: "100000000000000004",
  current: "100000000000000005",
} as const;
const guildId = "100000000000000002";
const assignments = { all: null, overrides: {} };
const diceView = {
  elevationDegrees: 40,
  mode: "normal",
  azimuth: {
    all: { mode: "random", customDegrees: 0 },
    overrides: {},
  },
};
const profileV3 = { version: 3, designs: [], assignments };
const profileV4 = { ...profileV3, version: 4, diceView };

it("upgrades race-created V3 profiles and rejects every non-V4 write", async () => {
  const migration = dataEnv.TEST_MIGRATIONS.find(
    ({ name }) => name === "0016_enforce_appearance_profiles_v4.sql",
  );
  if (migration === undefined) throw new Error("Appearance V4 guard is missing");
  await applyD1Migrations(
    dataEnv.DATA,
    dataEnv.TEST_MIGRATIONS.filter(({ name }) => name < migration.name),
  );

  await dataEnv.DATA.batch([
    ...Object.values(userIds).map((userId) =>
      dataEnv.DATA.prepare(
        "INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)",
      ).bind(userId, timestamp, timestamp)),
    dataEnv.DATA.prepare(
      "INSERT INTO guilds (id, created_at, updated_at) VALUES (?, ?, ?)",
    ).bind(guildId, timestamp, timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 1, ?, ?)`,
    ).bind(userIds.legacy, JSON.stringify({ version: 2 }), timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 2, ?, ?)`,
    ).bind(userIds.migrated, JSON.stringify(profileV3), timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 3, ?, ?)`,
    ).bind(userIds.current, JSON.stringify(profileV4), timestamp),
    dataEnv.DATA.prepare(
      `INSERT INTO guild_appearance_profiles
         (guild_id, revision, profile_json, updated_by_user_id, updated_at)
       VALUES (?, 4, ?, ?, ?)`,
    ).bind(
      guildId,
      JSON.stringify({ ...profileV3, mode: "enforced" }),
      userIds.current,
      timestamp,
    ),
  ]);

  await expect(
    dataEnv.DATA.batch(
      migration.queries.map((query) => dataEnv.DATA.prepare(query)),
    ),
  ).rejects.toThrow();
  await expect(
    dataEnv.DATA.prepare(
      "SELECT json_extract(profile_json, '$.version') AS version FROM user_appearance_profiles WHERE user_id = ?",
    ).bind(userIds.migrated).first("version"),
  ).resolves.toBe(3);

  await dataEnv.DATA.prepare(
    "DELETE FROM user_appearance_profiles WHERE user_id = ?",
  ).bind(userIds.legacy).run();
  await dataEnv.DATA.batch(
    migration.queries.map((query) => dataEnv.DATA.prepare(query)),
  );

  const versionsResult = await dataEnv.DATA.prepare(
    `SELECT 'personal' AS scope,
            json_extract(profile_json, '$.version') AS version,
            COUNT(*) AS count
     FROM user_appearance_profiles GROUP BY version
     UNION ALL
     SELECT 'server' AS scope,
            json_extract(profile_json, '$.version') AS version,
            COUNT(*) AS count
     FROM guild_appearance_profiles GROUP BY version
     ORDER BY scope, version`,
  ).all();
  const versions = VersionRowsSchema.parse(versionsResult.results);
  expect(versions).toEqual([
    { scope: "personal", version: 4, count: 2 },
    { scope: "server", version: 4, count: 1 },
  ]);

  await expect(
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 1, ?, ?)`,
    ).bind(userIds.legacy, JSON.stringify(profileV3), timestamp).run(),
  ).rejects.toThrow("Appearance profiles must use version 4");
  await expect(
    dataEnv.DATA.prepare(
      "UPDATE guild_appearance_profiles SET profile_json = ? WHERE guild_id = ?",
    ).bind(
      JSON.stringify({ ...profileV3, mode: "enforced" }),
      guildId,
    ).run(),
  ).rejects.toThrow("Appearance profiles must use version 4");

  await expect(
    dataEnv.DATA.prepare(
      `INSERT INTO user_appearance_profiles
         (user_id, revision, profile_json, updated_at)
       VALUES (?, 1, ?, ?)`,
    ).bind(userIds.legacy, JSON.stringify(profileV4), timestamp).run(),
  ).resolves.toMatchObject({ success: true });
});
