import { applyD1Migrations } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { dataTestEnv } from "./test-bindings";
import { D1GameDetectionRepository } from "../../workers/data/src/game-detection-repository";
import { D1RollLifecycleRepository } from "../../workers/data/src/roll-lifecycle-repository";

const db = dataTestEnv.DATA;
const now = 1_800_000_000_000;

async function measure(sql: string, params: number[]) {
  const result = await db.prepare(sql).bind(...params).all();
  const plan = await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...params)
    .all<{ detail: string }>();
  return {
    rowsRead: result.meta.rows_read,
    rowsWritten: result.meta.rows_written,
    returned: result.results.length,
    plan: plan.results.map(({ detail }) => detail),
  };
}

it("keeps idle receipt polling independent of processed history", async () => {
  await applyD1Migrations(db, dataTestEnv.TEST_MIGRATIONS);
  await db.prepare(
    "UPDATE game_detection_control SET active_play_started_at = 0",
  ).run();
  const samples = [];
  for (const history of [1_000, 250_000]) {
    await db.prepare("DELETE FROM roll_lifecycle_receipts").run();
    await db.prepare("DELETE FROM game_detection_skipped_receipts").run();
    await db.prepare("DELETE FROM game_detection_rolls").run();
    await db.prepare("DELETE FROM game_detection_sessions").run();
    await db.prepare(
      `INSERT INTO game_detection_sessions (
         session_id, scope, guild_id, channel_id, started_at, last_roll_at,
         roll_count, state, closed_at, created_at, updated_at
       ) VALUES ('history', 'guild', 'guild', 'channel', 0, ?, ?, 'closed', ?, 0, ?)`,
    ).bind(history, history, history, history).run();
    await db.prepare(
      `WITH RECURSIVE sequence(n) AS (
         SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < ?
       )
       INSERT INTO roll_lifecycle_receipts (
         interaction_id, revision, request_fingerprint, command_name, scope,
         guild_id, user_id, channel_id, received_at, deferred_at, accepted_at,
         terminal_at, state, attempts, context_json, updated_at
       )
       SELECT CAST(100000000000000000 + n AS TEXT), 1, ?, 'roll', 'guild',
              '100000000000000001', '100000000000000002', '100000000000000003',
              n, n, n, n, 'delivered', 1, '{}', n FROM sequence`,
    ).bind(history, "a".repeat(64)).run();
    await db.prepare(
      `INSERT INTO game_detection_rolls (
         interaction_id, session_id, observed_at, has_title,
         classification, game_id, expires_at, created_at
       ) SELECT interaction_id, 'history', received_at, 0, 'unknown', NULL,
                received_at + 1, received_at FROM roll_lifecycle_receipts
         WHERE received_at % 100 != 0`,
    ).run();
    await db.prepare(
      `INSERT INTO game_detection_skipped_receipts
         (interaction_id, reason, created_at)
       SELECT interaction_id, 'fixture', received_at FROM roll_lifecycle_receipts
       WHERE received_at % 100 = 0`,
    ).run();

    const queries: string[] = [];
    const prepare = db.prepare.bind(db);
    const spy = vi.spyOn(db, "prepare").mockImplementation((sql) => {
      queries.push(sql);
      return prepare(sql);
    });
    try {
      await expect(new D1GameDetectionRepository(db).ingestDeliveredRolls(now))
        .resolves.toMatchObject({ ingested: 0, skipped: 0, backlog: false });
      await expect(new D1RollLifecycleRepository(db).claimAlerts(now, 120_000, 60_000, 25))
        .resolves.toEqual([]);
    } finally {
      spy.mockRestore();
    }
    const findQuery = (prefix: string) => {
      const query = queries.find((sql) => sql.startsWith(prefix));
      if (query === undefined) throw new Error(`Missing polling query: ${prefix}`);
      return query;
    };
    const detectionQuery = findQuery("SELECT r.interaction_id");
    const backlogQuery = findQuery("SELECT EXISTS");
    const alertQuery = findQuery("SELECT interaction_id");
    const alertParams = [now, now - 120_000, 25];
    const idle = {
      detection: await measure(detectionQuery, [25]),
      backlog: await measure(backlogQuery, []),
      alerts: await measure(alertQuery, alertParams),
    };
    await db.prepare("DELETE FROM game_detection_rolls WHERE observed_at > ?")
      .bind(history - 25).run();
    await db.prepare("DELETE FROM game_detection_skipped_receipts WHERE created_at > ?")
      .bind(history - 25).run();
    const batch = {
      detection: await measure(detectionQuery, [25]),
      backlog: await measure(backlogQuery, []),
    };
    await db.prepare(
      `UPDATE roll_lifecycle_receipts
       SET state = 'failed', failure_phase = 'fixture', failure_code = 'fixture'
       WHERE received_at > ?`,
    ).bind(history - 25).run();
    const alerts = await measure(alertQuery, alertParams);
    samples.push({ history, idle, batch, alerts });
  }
  console.log("receipt-polling-cost", JSON.stringify(samples));
  for (const sample of samples) {
    expect(sample.idle.detection.rowsRead).toBeLessThanOrEqual(2);
    expect(sample.idle.backlog.rowsRead).toBeLessThanOrEqual(2);
    expect(sample.idle.alerts.rowsRead).toBeLessThanOrEqual(1);
    expect(sample.batch.detection.returned).toBe(25);
    expect(sample.batch.detection.rowsRead).toBeLessThanOrEqual(27);
    expect(sample.batch.backlog.rowsRead).toBeLessThanOrEqual(3);
    expect(sample.alerts.returned).toBe(25);
    expect(sample.alerts.rowsRead).toBeLessThanOrEqual(26);
    expect(sample.batch.detection.plan.join(" ")).toContain("idx_game_detection_pending_receipts");
    expect(sample.alerts.plan.join(" ")).toContain("idx_roll_lifecycle_alert_candidates");
    expect(sample.batch.detection.plan.join(" ")).not.toContain("TEMP B-TREE");
    expect(sample.alerts.plan.join(" ")).not.toContain("TEMP B-TREE");
  }
}, 120_000);
