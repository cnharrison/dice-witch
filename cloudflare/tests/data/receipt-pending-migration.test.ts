import { applyD1Migrations } from "cloudflare:test";
import { expect, it } from "vitest";
import { dataTestEnv } from "./test-bindings";

const db = dataTestEnv.DATA;
const id = (n: number) => String(100000000000000000n + BigInt(n));

async function receipt(n: number, state: "delivered" | "accepted" = "delivered") {
  await db.prepare(
    `INSERT INTO roll_lifecycle_receipts (
       interaction_id, revision, request_fingerprint, command_name, scope,
       guild_id, user_id, channel_id, received_at, deferred_at, accepted_at,
       terminal_at, state, attempts, context_json, updated_at
     ) VALUES (?, 1, ?, 'roll', 'guild', ?, ?, ?, ?, ?, ?, ?, ?, 1, '{}', ?)`,
  ).bind(id(n), "a".repeat(64), id(90), id(91), id(92), n, n, n,
    state === "delivered" ? n : null, state, n).run();
}

async function observed(n: number) {
  await db.prepare(
    `INSERT OR IGNORE INTO game_detection_rolls (
       interaction_id, session_id, observed_at, has_title,
       classification, game_id, expires_at, created_at
     ) VALUES (?, 'fixture', ?, 0, 'unknown', NULL, ?, ?)`,
  ).bind(id(n), n, n + 100, n).run();
}

async function skipped(n: number) {
  await db.prepare(
    `INSERT OR IGNORE INTO game_detection_skipped_receipts
       (interaction_id, reason, created_at) VALUES (?, 'fixture', ?)`,
  ).bind(id(n), n).run();
}

async function pendingIds() {
  const result = await db.prepare(
    "SELECT interaction_id FROM roll_lifecycle_receipts WHERE game_detection_pending = 1 ORDER BY received_at, interaction_id",
  ).all<{ interaction_id: string }>();
  return result.results.map(({ interaction_id }) => interaction_id);
}

it("backfills pending work and maintains the old anti-join invariant for legacy writers", async () => {
  const migration = dataTestEnv.TEST_MIGRATIONS.find(({ name }) => name === "0021_receipt_pending_work.sql");
  if (migration === undefined) throw new Error("Pending-work migration is missing");
  await applyD1Migrations(db, dataTestEnv.TEST_MIGRATIONS.filter(({ name }) => name < migration.name));
  await db.prepare("UPDATE game_detection_control SET active_play_started_at = 5").run();
  await db.prepare(
    `INSERT INTO game_detection_sessions (
       session_id, scope, guild_id, channel_id, started_at, last_roll_at,
       roll_count, state, created_at, updated_at
     ) VALUES ('fixture', 'guild', 'guild', 'channel', 0, 10, 3, 'open', 0, 10)`,
  ).run();
  for (const n of [1, 2, 3, 4, 5]) await receipt(n);
  await receipt(6, "accepted");
  await observed(1);
  await skipped(2);
  await observed(3);
  await skipped(3);
  const historySql = "SELECT interaction_id, revision, state, context_json, alert_state, alert_message_id FROM roll_lifecycle_receipts ORDER BY interaction_id";
  const history = await db.prepare(historySql).all();
  await db.batch(migration.queries.map((query) => db.prepare(query)));
  expect((await db.prepare(historySql).all()).results).toEqual(history.results);
  expect(await pendingIds()).toEqual([id(4), id(5)]);
  await expect(db.prepare("SELECT active_play_started_at FROM game_detection_control").first("active_play_started_at"))
    .resolves.toBe(5);

  // These SQL writes use the old schema contract, as an overlapping old Worker would.
  await db.prepare("UPDATE roll_lifecycle_receipts SET state = 'delivered', terminal_at = 6 WHERE interaction_id = ?")
    .bind(id(6)).run();
  await receipt(7);
  await observed(7);
  await observed(7);
  await skipped(5);
  await skipped(5);
  expect(await pendingIds()).toEqual([id(4), id(6)]);
  await db.prepare("DELETE FROM game_detection_rolls WHERE interaction_id = ?").bind(id(3)).run();
  expect(await pendingIds()).toEqual([id(4), id(6)]);
  await db.prepare("DELETE FROM game_detection_skipped_receipts WHERE interaction_id = ?").bind(id(3)).run();
  expect(await pendingIds()).toEqual([id(3), id(4), id(6)]);
  await db.prepare("DELETE FROM game_detection_rolls WHERE interaction_id = ?").bind(id(1)).run();
  await db.prepare("DELETE FROM game_detection_skipped_receipts WHERE interaction_id = ?").bind(id(2)).run();
  await db.prepare("DELETE FROM roll_lifecycle_receipts WHERE interaction_id = ?").bind(id(4)).run();
  await skipped(8);
  await receipt(8);
  await observed(9);
  await receipt(9);
  expect(await pendingIds()).toEqual([id(1), id(2), id(3), id(6)]);
  const differences = await db.prepare(
    `SELECT interaction_id FROM roll_lifecycle_receipts AS r
     WHERE game_detection_pending != (
       state = 'delivered'
       AND NOT EXISTS (SELECT 1 FROM game_detection_rolls WHERE interaction_id = r.interaction_id)
       AND NOT EXISTS (SELECT 1 FROM game_detection_skipped_receipts WHERE interaction_id = r.interaction_id)
     )`,
  ).all();
  expect(differences.results).toEqual([]);
});
