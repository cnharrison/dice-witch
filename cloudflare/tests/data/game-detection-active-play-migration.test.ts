import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { expect, it } from "vitest";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

it("starts a clean active-play policy epoch without deleting prior telemetry", async () => {
  const migration = dataEnv.TEST_MIGRATIONS.find(
    ({ name }) => name === "0012_game_detection_active_play.sql",
  );
  if (migration === undefined) {
    throw new Error("Active-play migration is missing");
  }
  await applyD1Migrations(
    dataEnv.DATA,
    dataEnv.TEST_MIGRATIONS.filter(({ name }) => name < migration.name),
  );

  const timestamp = 1_767_225_600_000;
  const sessionId = "100000000000000011";
  await dataEnv.DATA.prepare(
    `INSERT INTO game_detection_sessions (
       session_id, scope, guild_id, channel_id, started_at, last_roll_at,
       roll_count, state, closed_at, current_game_id, current_confidence,
       current_game_detected_at, last_candidate_signature,
       last_candidate_disposition, created_at, updated_at,
       guild_name, channel_name, channel_type, channel_context_checked_at
     ) VALUES (?, 'guild', ?, ?, ?, ?, 2, 'open', NULL,
               'the-dark-eye-5e', 'strong', ?, ?, 'selected', ?, ?,
               'Stored Guild', 'general', 0, ?)`,
  ).bind(
    sessionId,
    "100000000000000003",
    "100000000000000004",
    timestamp,
    timestamp + 1,
    timestamp,
    "a".repeat(64),
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
    sessionId,
    sessionId,
    timestamp,
    timestamp + 90 * 24 * 60 * 60 * 1_000,
    timestamp,
  ).run();
  await dataEnv.DATA.prepare(
    `INSERT INTO game_detection_rolls (
       interaction_id, session_id, observed_at, has_title,
       classification, game_id, expires_at, created_at
     ) VALUES (?, ?, ?, 0, 'in-game', 'the-dark-eye-5e', ?, ?)`,
  ).bind(
    "100000000000000012",
    sessionId,
    timestamp + 1,
    timestamp + 90 * 24 * 60 * 60 * 1_000,
    timestamp,
  ).run();
  await dataEnv.DATA.prepare(
    `INSERT INTO game_detection_rank_jobs (
       session_id, candidate_signature, feature_request_json, state,
       attempt_count, created_at
     ) VALUES (?, ?, ?, 'pending', 0, ?)`,
  ).bind(
    sessionId,
    "b".repeat(64),
    JSON.stringify({ version: 1, features: [] }),
    timestamp,
  ).run();
  await dataEnv.DATA.prepare(
    `INSERT INTO game_detections (
       detection_id, session_id, previous_game_id, game_id, confidence,
       candidate_signature, evidence_json, detected_at, model_id,
       prompt_revision, announcement_state, next_announcement_at
     ) VALUES (?, ?, NULL, 'the-dark-eye-5e', 'strong', ?, '[]', ?,
               '@cf/zai-org/glm-5.2', 'dice-witch-game-detection-v2',
               'pending', ?)`,
  ).bind(`${sessionId}:legacy`, sessionId, "c".repeat(64), timestamp, timestamp).run();

  await dataEnv.DATA.batch(
    migration.queries.map((query) => dataEnv.DATA.prepare(query)),
  );

  const control = await dataEnv.DATA.prepare(
    `SELECT started_at, active_play_started_at
     FROM game_detection_control WHERE singleton = 1`,
  ).first<{ started_at: number; active_play_started_at: number }>();
  expect(control?.started_at).toBe(Number.MAX_SAFE_INTEGER);
  expect(control?.active_play_started_at).toBeGreaterThan(0);
  await expect(
    dataEnv.DATA.prepare(
      `SELECT active_play_state, active_play_path,
              active_episode_started_at, active_play_updated_at,
              active_play_policy_revision, current_game_id
       FROM game_detection_sessions WHERE session_id = ?`,
    ).bind(sessionId).first(),
  ).resolves.toEqual({
    active_play_state: "isolated",
    active_play_path: null,
    active_episode_started_at: null,
    active_play_updated_at: control?.active_play_started_at,
    active_play_policy_revision: "active-play:v1",
    current_game_id: null,
  });
  await expect(
    dataEnv.DATA.prepare(
      `SELECT interaction_id, classification, game_id
       FROM game_detection_rolls ORDER BY interaction_id`,
    ).all(),
  ).resolves.toMatchObject({
    results: [
      { interaction_id: sessionId, classification: "unknown", game_id: null },
      {
        interaction_id: "100000000000000012",
        classification: "in-game",
        game_id: "the-dark-eye-5e",
      },
    ],
  });
  await expect(
    dataEnv.DATA.prepare(
      `SELECT state, attempt_count, result, detail,
              active_episode_started_at
       FROM game_detection_rank_jobs WHERE session_id = ?`,
    ).bind(sessionId).first(),
  ).resolves.toEqual({
    state: "completed",
    attempt_count: 1,
    result: "failed",
    detail: "active-play-policy-upgraded",
    active_episode_started_at: null,
  });
  await expect(
    dataEnv.DATA.prepare(
      `SELECT game_id, announcement_state, announcement_attempts,
              announcement_failure, active_episode_started_at
       FROM game_detections WHERE detection_id = ?`,
    ).bind(`${sessionId}:legacy`).first(),
  ).resolves.toEqual({
    game_id: "the-dark-eye-5e",
    announcement_state: "failed",
    announcement_attempts: 1,
    announcement_failure: "active-play-policy-upgraded",
    active_episode_started_at: null,
  });
  await expect(
    dataEnv.DATA.prepare(
      `SELECT COUNT(*) AS count FROM game_detection_sessions`,
    ).first("count"),
  ).resolves.toBe(1);
});
