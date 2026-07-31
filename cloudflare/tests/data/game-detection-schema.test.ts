import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

const now = 1_767_225_600_000;

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM game_detections"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_rank_jobs"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_rolls"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_sessions"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_daily_aggregates"),
  ]);
});

async function insertSession(): Promise<void> {
  await dataEnv.DATA.prepare(
    `INSERT INTO game_detection_sessions (
       session_id, scope, guild_id, channel_id, started_at, last_roll_at,
       roll_count, state, created_at, updated_at
     ) VALUES (?, 'guild', ?, ?, ?, ?, 1, 'open', ?, ?)`,
  )
    .bind("session-1", "guild-1", "channel-1", now, now, now, now)
    .run();
}

describe("game-detection telemetry schema", () => {
  it("creates strict session, roll, rank, detection, and aggregate tables", async () => {
    const tables = await dataEnv.DATA.prepare("PRAGMA table_list").all<{
      name: string;
      strict: number;
    }>();

    for (const name of [
      "game_detection_control",
      "game_detection_sessions",
      "game_detection_rolls",
      "game_detection_rank_jobs",
      "game_detections",
      "game_detection_daily_aggregates",
    ]) {
      expect(tables.results).toContainEqual(
        expect.objectContaining({ name, strict: 1 }),
      );
    }
  });

  it("records a deployment-time ingestion boundary instead of backfilling old rolls", async () => {
    const row = await dataEnv.DATA.prepare(
      "SELECT singleton, started_at FROM game_detection_control",
    ).first<{ singleton: number; started_at: number }>();

    expect(row?.singleton).toBe(1);
    expect(row?.started_at).toBeGreaterThan(0);
  });

  it("permits only one open session per channel", async () => {
    await insertSession();

    await expect(
      dataEnv.DATA.prepare(
        `INSERT INTO game_detection_sessions (
           session_id, scope, guild_id, channel_id, started_at, last_roll_at,
           roll_count, state, created_at, updated_at
         ) VALUES (?, 'guild', ?, ?, ?, ?, 1, 'open', ?, ?)`,
      )
        .bind(
          "session-2",
          "guild-1",
          "channel-1",
          now + 1,
          now + 1,
          now + 1,
          now + 1,
        )
        .run(),
    ).rejects.toThrow(/unique/i);
  });

  it("requires in-game rolls to carry a game and anonymous aggregates not to", async () => {
    await insertSession();

    await expect(
      dataEnv.DATA.prepare(
        `INSERT INTO game_detection_rolls (
           interaction_id, session_id, observed_at, has_title,
           classification, game_id, expires_at, created_at
         ) VALUES (?, ?, ?, 1, 'in-game', NULL, ?, ?)`,
      )
        .bind("interaction-1", "session-1", now, now + 1, now)
        .run(),
    ).rejects.toThrow(/constraint/i);

    await expect(
      dataEnv.DATA.prepare(
        `INSERT INTO game_detection_daily_aggregates (
           day, classification, game_id_key, roll_count, titled_roll_count
         ) VALUES ('2026-01-01', 'unknown', 'dnd-5e', 1, 1)`,
      ).run(),
    ).rejects.toThrow(/constraint/i);
  });

  it("enforces a single model attempt for each rank job", async () => {
    await insertSession();
    const signature = "a".repeat(64);

    await expect(
      dataEnv.DATA.prepare(
        `INSERT INTO game_detection_rank_jobs (
           session_id, candidate_signature, feature_request_json, state,
           attempt_count, created_at, started_at
         ) VALUES (?, ?, ?, 'processing', 2, ?, ?)`,
      )
        .bind("session-1", signature, '{"version":1,"features":[]}', now, now)
        .run(),
    ).rejects.toThrow(/constraint/i);
  });
});
