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
const dataEnv = {
  DATA: env.DATA,
  ...TestMigrationsBindingSchema.parse(env),
} satisfies { DATA: D1Database; TEST_MIGRATIONS: D1Migration[] };

it("backfills deployed game-detection sessions from the stored guild profile", async () => {
  const migration = dataEnv.TEST_MIGRATIONS.find(
    ({ name }) => name === "0011_game_detection_display_context.sql",
  );
  if (migration === undefined) {
    throw new Error("Display-context migration is missing");
  }
  await applyD1Migrations(
    dataEnv.DATA,
    dataEnv.TEST_MIGRATIONS.filter(({ name }) => name !== migration.name),
  );

  const timestamp = 1_767_225_600_000;
  const interactionId = "100000000000000011";
  const guildId = "100000000000000003";
  const channelId = "100000000000000004";
  await dataEnv.DATA.prepare(
    `INSERT INTO guilds (id, name, created_at, updated_at)
     VALUES (?, 'Stored Migration Guild', ?, ?)`,
  ).bind(guildId, timestamp, timestamp).run();
  await dataEnv.DATA.prepare(
    `INSERT INTO roll_lifecycle_receipts (
       interaction_id, revision, request_fingerprint, command_name, scope,
       guild_id, user_id, channel_id, received_at, deferred_at, accepted_at,
       delivery_started_at, terminal_at, state, attempts, http_status,
       failure_phase, failure_code, context_json, updated_at
     ) VALUES (?, 4, ?, 'roll', 'guild', ?, ?, ?, ?, ?, ?, ?, ?,
               'delivered', 1, 200, NULL, NULL, ?, ?)`,
  ).bind(
    interactionId,
    "a".repeat(64),
    guildId,
    "100000000000000002",
    channelId,
    timestamp,
    timestamp + 1,
    timestamp + 2,
    timestamp + 3,
    timestamp + 4,
    JSON.stringify({
      title: "Migration roll",
      guildName: null,
      channelName: null,
      channelType: null,
      notation: "4d6kh3",
    }),
    timestamp + 4,
  ).run();
  await dataEnv.DATA.prepare(
    `INSERT INTO game_detection_sessions (
       session_id, scope, guild_id, channel_id, started_at, last_roll_at,
       roll_count, state, closed_at, created_at, updated_at
     ) VALUES (?, 'guild', ?, ?, ?, ?, 1, 'open', NULL, ?, ?)`,
  ).bind(
    interactionId,
    guildId,
    channelId,
    timestamp,
    timestamp,
    timestamp,
    timestamp,
  ).run();
  await dataEnv.DATA.prepare(
    `INSERT INTO game_detection_rolls (
       interaction_id, session_id, observed_at, has_title,
       classification, game_id, expires_at, created_at
     ) VALUES (?, ?, ?, 1, 'pending', NULL, ?, ?)`,
  ).bind(
    interactionId,
    interactionId,
    timestamp,
    timestamp + 90 * 24 * 60 * 60 * 1_000,
    timestamp,
  ).run();

  await dataEnv.DATA.batch(
    migration.queries.map((query) => dataEnv.DATA.prepare(query)),
  );

  await expect(
    dataEnv.DATA.prepare(
      `SELECT guild_name, channel_name, channel_context_checked_at
       FROM game_detection_sessions`,
    ).first(),
  ).resolves.toEqual({
    guild_name: "Stored Migration Guild",
    channel_name: null,
    channel_context_checked_at: null,
  });
  await expect(
    dataEnv.DATA.prepare(
      `SELECT title, guild_name, channel_name
       FROM game_detection_titled_rolls_90d`,
    ).first(),
  ).resolves.toEqual({
    title: "Migration roll",
    guild_name: "Stored Migration Guild",
    channel_name: null,
  });
});
