import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { createFixture, FIXTURE_TOKEN, guildIds, SHARDS } from "./gateway-capacity/fixture.mjs";
import { assertHealthy } from "./gateway-capacity/run.mjs";
import { APPROVED_ACCOUNT, prepareStaging } from "./gateway-capacity/staging-prepare.mjs";

const execute = promisify(execFile);
const fixtureDestinations = { token: FIXTURE_TOKEN, gatewayUrl: "wss://gateway.discord.gg", botUrl: "https://discord.com/api/v10/gateway/bot", knownGuilds: false };

test("capacity health guard rejects late sampler and runtime failures", () => {
  const failure = new Error("Late sampler failure");
  assert.throws(() => assertHealthy(failure, [], []), (error) => error === failure);
  assert.throws(() => assertHealthy(undefined, ["fixture failure"], []), /Fixture errors/);
  assert.throws(() => assertHealthy(undefined, [], ["runtime failure"]), /Runtime errors/);
  assertHealthy(undefined, [], []);
});

test("capacity fixtures route synthetic guilds to the intended Discord shard", () => {
  const all = new Set();
  for (let shard = 0; shard < SHARDS; shard += 1) {
    for (const id of guildIds(shard, 1_013)) {
      assert.match(id, /^[1-9][0-9]{16,19}$/);
      assert.equal(Number((BigInt(id) >> 22n) % BigInt(SHARDS)), shard);
      assert(!all.has(id));
      all.add(id);
    }
  }
});

test("capacity fixtures block unrecognized outbound destinations", async () => {
  const fixture = createFixture({ Response, guildCount: 24, channelCount: 1, ...fixtureDestinations });
  await assert.rejects(fixture.outbound(new Request("https://example.com/")), /blocked outbound/);
});

test("warm capacity fixtures consume the filter body once", async () => {
  const fixture = createFixture({ Response, guildCount: 24, channelCount: 1, heartbeatMs: 1_000, ...fixtureDestinations, knownGuilds: true });
  const ids = guildIds(0, 1);
  const response = await fixture.data(new Request("https://data.internal/internal/guilds/filter", { method: "POST", body: JSON.stringify({ guildIds: ids }) }));
  assert.deepEqual(await response.json(), { guildIds: ids });
});

test("staging bundle preparation refuses unapproved and dirty deployment inputs", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "gateway-staging-policy-"));
  const parameters = { output, accountId: APPROVED_ACCOUNT, workersSubdomain: "cnharrison", sourceSha: "0".repeat(40), expiresAt: Date.now() + 60_000, purpose: "deploy" };
  try {
    await assert.rejects(prepareStaging({ ...parameters, accountId: "0".repeat(32) }), /approved account/);
    await assert.rejects(prepareStaging({ ...parameters, workersSubdomain: undefined }), /approved account/);
    await assert.rejects(prepareStaging(parameters), /clean matching committed source/);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test("capacity fixtures reject an incorrect persisted RESUME sequence", async () => {
  const require = createRequire(import.meta.resolve("wrangler"));
  const { Response, WebSocketPair } = require("miniflare");
  const fixture = createFixture({ Response, WebSocketPair, guildCount: 24, channelCount: 1, heartbeatMs: 1_000, ...fixtureDestinations });
  const response = await fixture.outbound(new Request("https://gateway.discord.gg/", { headers: { upgrade: "websocket" } }));
  const socket = response.webSocket;
  socket.accept();
  socket.send(JSON.stringify({ op: 6, d: { token: FIXTURE_TOKEN, session_id: "fixture-session-0", seq: 999 } }));
  assert.deepEqual(fixture.errors, ["RESUME did not restore the fixture token and drained sequence"]);
  assert.equal(fixture.counters.resumes, 0);
});

test("staging workers preserve synthetic boundaries and enforce control authentication", { timeout: 90_000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "gateway-staging-native-"));
  const require = createRequire(import.meta.resolve("wrangler"));
  const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
  const secret = "a".repeat(64);
  let mf;
  try {
    const manifest = await prepareStaging({ output, accountId: APPROVED_ACCOUNT, workersSubdomain: "cnharrison", sourceSha: "0".repeat(40), expiresAt: Date.now() + 60_000, purpose: "local-test" });
    const fixtureConfig = manifest.configs[0];
    const options = manifest.configs.map((entry) => {
      const config = JSON.parse(require("node:fs").readFileSync(entry.configPath, "utf8"));
      return {
        name: entry.name, modules: true, modulesRoot: output, scriptPath: entry.outfile,
        compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
        bindings: { ...config.vars, GATEWAY_CONTROL_TOKEN: secret, DISCORD_BOT_TOKEN: FIXTURE_TOKEN },
        durableObjects: Object.fromEntries(config.durable_objects.bindings.map(({ name, class_name }) => [name, { className: class_name, useSQLite: true }])),
        serviceBindings: Object.fromEntries(config.services.map(({ binding, service, entrypoint }) => [binding, { name: service, entrypoint }])),
        outboundService: fixtureConfig.name,
      };
    });
    mf = new Miniflare(convertV4MiniflareOptions({ workers: options }));
    await mf.ready;
    const fixture = await mf.getWorker(fixtureConfig.name);
    const gateway = await mf.getWorker(manifest.configs[2].name);
    const send = (worker, route, value) => worker.fetch(`https://${manifest.hostname}${route}`, { method: value === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    assert.equal((await gateway.fetch(`https://${manifest.hostname}/start`, { method: "POST" })).status, 401);
    assert.equal((await fixture.fetch(`https://${manifest.hostname}/configure`, { method: "POST" })).status, 401);
    assert.equal((await send(fixture, "/configure", { runId: "12345678-1234-4234-8234-123456789abc", guilds: 240, channels: 2, heartbeatMs: 1_000, knownGuilds: true })).status, 200);
    assert.equal((await send(gateway, "/start?partition=0", {})).status, 200);
    const deadline = Date.now() + 30_000;
    let stats;
    do { stats = await (await send(fixture, "/stats")).json(); if (stats.connected === 24) break; await new Promise((resolve) => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    assert.equal(stats.connected, 24, JSON.stringify({ stats, status: await (await send(gateway, "/status?partition=0")).json() }));
    assert.equal((await send(fixture, "/replay", { countPerShard: 240, rate: 600, channelUpdates: false })).status, 200);
    let shards;
    do { shards = (await (await send(gateway, "/status?partition=0")).json()).connections; if (shards.every((s) => s.initialGuildsPending === 0)) break; await new Promise((resolve) => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    assert.equal(shards.length, 24);
    assert(shards.every((s) => s.state === "ready" && s.lastError === null && s.initialGuildsPending === 0));
    stats = await (await send(fixture, "/stats")).json();
    assert.equal(stats.counters.lifecycle, 0);
    assert.deepEqual(stats.errors, []);
    assert.equal((await send(gateway, "/stop?partition=0", {})).status, 200);
    assert.equal((await send(fixture, "/stop", {})).status, 200);
  } finally {
    if (mf) await mf.dispose();
    await rm(output, { recursive: true, force: true });
  }
});

test("capacity benchmark checks 24 shards across both topologies and persisted recovery", { timeout: 60_000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "gateway-capacity-test-"));
  let passed = false;
  try {
    await execute(process.execPath, [
      new URL("./gateway-capacity/run.mjs", import.meta.url).pathname,
      "--output", output,
      "--guilds", "240", "--channels", "2", "--rate", "600",
      "--replay", "5", "--slow-ms", "10", "--heartbeat-ms", "1000", "--runs", "1", "--capacity", "both",
    ], { timeout: 55_000 });
    const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.results.map((result) => result.status), ["passed-local-gate", "passed-local-gate"]);
    for (const result of manifest.results) {
      const report = JSON.parse(await readFile(result.file, "utf8"));
      assert.deepEqual(report.phases.map((phase) => phase.name), ["startup", "slow-replay", "reconnect", "restart"]);
      assert.equal(report.counters.identifies, SHARDS);
      assert.equal(report.counters.resumes, SHARDS * 2);
      assert.equal(report.counters.lifecycle, 480);
      assert.equal(report.counters.directory, 120);
      assert.equal(report.lastStatus.length, SHARDS);
      assert.deepEqual(report.errors, []);
      assert(report.samples.length > 1);
      assert(report.samples.every((sample) => sample.heaps.length === SHARDS / report.capacity));
      assert(report.samples.every((sample) => sample.heaps.every((heap) => heap.usedSize > 0 && heap.embedderHeapUsedSize > 0)));
    }
    passed = true;
  } finally {
    if (passed) await rm(output, { recursive: true, force: true });
    else console.error(`Capacity benchmark evidence retained: ${output}`);
  }
});
