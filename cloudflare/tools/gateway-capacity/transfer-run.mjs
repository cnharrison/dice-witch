import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createFixture, FIXTURE_TOKEN, SHARDS } from "./fixture.mjs";

const require = createRequire(import.meta.resolve("wrangler"));
const { Miniflare, convertV4MiniflareOptions, Response, WebSocketPair } = require("miniflare");
const { build } = require("esbuild");
const output = path.resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const fixture = createFixture({ Response, WebSocketPair, guildCount: 250, channelCount: 20,
  heartbeatMs: 1_000, token: FIXTURE_TOKEN, gatewayUrl: "wss://gateway.discord.gg",
  botUrl: "https://discord.com/api/v10/gateway/bot", knownGuilds: false });
const entry = fileURLToPath(new URL("./transfer-worker.ts", import.meta.url));
const bundle = await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "browser",
  external: ["cloudflare:workers"], write: false });
const script = bundle.outputFiles[0].text;
const options = await convertV4MiniflareOptions({ workers: [{
  name: "transfer-fixture", modules: true, script, compatibilityDate: "2026-07-10",
  bindings: { DISCORD_BOT_TOKEN: FIXTURE_TOKEN, GATEWAY_MODE: "fleet", GATEWAY_FLEET_CONNECTION_CAPACITY: "6",
    GATEWAY_ALLOWED_HOSTNAME: "gateway.discord.gg", DISCORD_GATEWAY_BOT_URL: "https://discord.com/api/v10/gateway/bot",
    GATEWAY_PLACEMENT_TRANSFERS_ENABLED: "true" },
  durableObjects: { GATEWAY_PARTITION: { className: "GatewayPartition", useSQLite: true },
    GATEWAY_COORDINATOR: { className: "GatewayCoordinator", useSQLite: true } },
  serviceBindings: { DATA_SERVICE: fixture.data, DISCORD_REST: { name: "transfer-fixture", entrypoint: "FixtureDiscordRest" } },
  outboundService: fixture.outbound,
}] });
options.resourcePersistencePath = path.join(output, "state");
let runtime = new Miniflare(options);
const evidence = { bundleSha256: createHash("sha256").update(script).digest("hex"), shards: SHARDS,
  fixtureSha256: createHash("sha256").update(await readFile(new URL("./fixture.mjs", import.meta.url))).digest("hex"),
  transfers: [], startedAt: new Date().toISOString(), status: "running" };

async function request(route, body) {
  const options = { method: body === undefined ? "GET" : "POST" };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
    options.headers = { "content-type": "application/json" };
  }
  const response = await runtime.dispatchFetch(`http://fixture.local/${route}`, options);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

async function waitFor(predicate, label) {
  // Same 180-second experiment deadline as the existing capacity runner; no production timeout changes.
  const deadline = performance.now() + 180_000;
  while (performance.now() < deadline) {
    assert.deepEqual(fixture.errors, []);
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}

async function healthy() {
  const snapshot = await request("status");
  const shards = snapshot.partitions.flatMap(({ status }) => status.connections);
  return shards.length === SHARDS && shards.every((s) => s.state === "ready" && s.ownershipAcquired && s.lastHeartbeatAckAt !== null);
}

async function finish(transfer) {
  await waitFor(async () => {
    const result = await request(`continue?epoch=${transfer.epoch}`);
    return result.phase === "complete";
  }, `transfer ${transfer.epoch}`);
  await waitFor(healthy, "fleet healthy");
}

async function move(shardId, source, target) {
  const before = fixture.counters.resumes;
  const transfer = await request("transfer", { generation: 1, shardCount: SHARDS, shardId,
    source: `gateway-partition-${source}`, target: `gateway-partition-${target}` });
  await finish(transfer);
  assert.equal(fixture.counters.resumes, before + 1, "Each move must Resume exactly one session");
  evidence.transfers.push({ ...transfer, completedAt: new Date().toISOString() });
  return transfer;
}

try {
  await request("start", {});
  await waitFor(healthy, "baseline ready");
  await fixture.replay({ countPerShard: 10, rate: 250, signal: new AbortController().signal });
  await waitFor(async () => (await request("status")).partitions.flatMap(({ status }) => status.connections)
    .every((s) => s.sequence >= fixture.sequences[s.shardId] && s.initialGuildsPending === 0), "initial events applied");
  const identifies = fixture.counters.identifies;
  const beforeGapSequence = fixture.sequences[24];
  fixture.replayGuildAfterDisconnect(24);
  const canary = await move(24, 4, 3);
  await waitFor(async () => fixture.counters.lifecycle === 251, "dispatch replayed across transfer gap");
  assert.equal(fixture.sequences[24], beforeGapSequence + 2, "Gap dispatch precedes RESUMED");
  evidence.disconnectReplay = { shardId: 24, checkpoint: beforeGapSequence, lifecycleEvents: fixture.counters.lifecycle };
  assert.equal((await request("status")).fleet.partitionCount, 4);
  const reverse = await request(`rollback?epoch=${canary.epoch}`, {});
  await finish(reverse);
  assert.equal((await request("status")).fleet.partitionCount, 5);
  await move(24, 4, 3);
  for (const shard of [6, 7, 8]) await move(shard, 1, 0);
  for (const shard of [12, 13, 14, 15, 16, 17]) await move(shard, 2, 1);
  for (const shard of [18, 19, 20, 21, 22, 23, 24]) await move(shard, 3, 2);
  const consolidated = await request("status");
  assert.deepEqual(consolidated.partitions.map(({ status }) => status.connections.length), [9, 9, 7]);
  assert.equal(fixture.counters.identifies, identifies, "Migration must preserve Resume identities");
  const beforeRestart = fixture.counters.resumes;
  await runtime.dispose();
  runtime = new Miniflare(options);
  await request("recover");
  await waitFor(healthy, "recovery with consolidated placement");
  assert.equal(fixture.counters.resumes, beforeRestart + SHARDS);
  const inventory = await request("inventory");
  assert.equal(inventory.guildIds.length, 250);
  assert.deepEqual(inventory.shards.map(({ shardId }) => shardId), Array.from({ length: SHARDS }, (_, id) => id));
  assert.equal(fixture.counters.identifies, identifies);
  assert.equal(fixture.counters.lifecycle, 251, "Gap replay must apply exactly once through rollback and restart");
  evidence.status = "passed";
  evidence.final = await request("status");
} catch (error) {
  evidence.status = "failed";
  evidence.failure = error.stack;
  throw error;
} finally {
  evidence.counters = fixture.counters;
  evidence.errors = fixture.errors;
  evidence.endedAt = new Date().toISOString();
  fixture.close();
  await runtime.dispose();
  await writeFile(path.join(output, "transfer-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ status: evidence.status, output, counters: evidence.counters }));
}
