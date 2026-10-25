import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { createFixture, FIXTURE_TOKEN, guildIds, SHARDS } from "./gateway-capacity/fixture.mjs";
import { assertHealthy, benchmarkSourceIdentity } from "./gateway-capacity/run.mjs";
import { APPROVED_ACCOUNT, prepareStaging, stagingNames } from "./gateway-capacity/staging-prepare.mjs";
import { stagingDeadline, stagingGatewayRoles } from "./gateway-capacity/staging-run.mjs";
import { stagingErrorEvidence } from "./gateway-capacity/staging-logs.mjs";
import { startLocalFixture } from "./gateway-capacity/local-fixture.mjs";

const execute = promisify(execFile);

test("persisted staging logs distinguish deliberate crashes and reject incomplete evidence", () => {
  const event = (message) => ({ timestamp: 1, source: { message }, $metadata: { level: "error" }, $workers: { scriptName: "fixture", truncated: false } });
  const result = (events) => ({ events: { events, count: events.length } });
  assert.deepEqual(stagingErrorEvidence(result([event("Benchmark persisted restart")]), ["fixture"]).unexpected, []);
  assert.equal(stagingErrorEvidence(result([event("This script has been upgraded")]), ["fixture"]).unexpected.length, 1);
  const restart = event("POST https://fixture/restart?partition=0");
  Object.assign(restart.$workers, { outcome: "exception", event: { request: { url: "https://fixture/restart?partition=0" } } });
  assert.deepEqual(stagingErrorEvidence(result([restart]), ["fixture"]).unexpected, []);
  assert.throws(() => stagingErrorEvidence(result([event("error")]), ["other"]), /Unexpected Worker/);
  assert.throws(() => stagingErrorEvidence({ events: { events: [], count: 1 } }, ["fixture"]), /truncated/);
  const truncated = event("error");
  truncated.$workers.truncated = true;
  assert.throws(() => stagingErrorEvidence(result([truncated]), ["fixture"]), /truncated/);
});
const fixtureDestinations = { token: FIXTURE_TOKEN, gatewayUrl: "wss://gateway.discord.gg", botUrl: "https://discord.com/api/v10/gateway/bot", knownGuilds: false };

test("capacity health guard rejects late sampler and runtime failures", () => {
  const failure = new Error("Late sampler failure");
  assert.throws(() => assertHealthy(failure, [], []), (error) => error === failure);
  assert.throws(() => assertHealthy(undefined, ["fixture failure"], []), /Fixture errors/);
  assert.throws(() => assertHealthy(undefined, [], ["runtime failure"]), /Runtime errors/);
  assertHealthy(undefined, [], []);
});

test("staging run identities restrict all Workers to the synthetic prefix", () => {
  assert.deepEqual(stagingNames("012345abcdef"), {
    fixture: "dice-witch-gateway-consolidation-fixture-012345abcdef",
    six: "dice-witch-gateway-consolidation-six-012345abcdef",
    candidate: "dice-witch-gateway-consolidation-candidate-012345abcdef",
  });
  for (const runId of [undefined, "", "production", "../production"]) assert.throws(() => stagingNames(runId), /run identity/);
});

test("staging requires explicit baseline-only or baseline-first Gateway selection", () => {
  assert.deepEqual(stagingGatewayRoles("six"), ["six"]);
  assert.deepEqual(stagingGatewayRoles("both"), ["six", "candidate"]);
  for (const selection of [undefined, "", "candidate", "production"]) {
    assert.throws(() => stagingGatewayRoles(selection), /Explicit six or both/);
  }
});

test("staging metrics can arrive after five minutes within the authorized deadline", () => {
  const profileEnd = Date.parse("2026-10-03T18:50:27.388Z");
  const expiresAt = Date.parse("2026-10-03T19:01:12.588Z");
  const delayedMetricsAt = profileEnd + 8 * 60_000;
  const deadline = stagingDeadline(expiresAt, profileEnd);
  assert(delayedMetricsAt < deadline);
  assert.equal(deadline, expiresAt - 120_000);
  assert.equal(stagingDeadline(expiresAt, deadline - 1), deadline);
});

test("staging observation rejects missing timestamps and stops before cleanup time", () => {
  const expiresAt = 1_800_000_000_000;
  for (const invalid of [undefined, null, NaN, Infinity, "1800000000000"]) {
    assert.throws(() => stagingDeadline(invalid, expiresAt - 180_000), /Explicit staging timestamps/);
    assert.throws(() => stagingDeadline(expiresAt, invalid), /Explicit staging timestamps/);
  }
  for (const now of [expiresAt - 120_000, expiresAt - 1, expiresAt + 1]) {
    assert.throws(() => stagingDeadline(expiresAt, now), /deadline safety margin/);
  }
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
  const parameters = { output, accountId: APPROVED_ACCOUNT, workersSubdomain: "cnharrison", sourceSha: "0".repeat(40), expiresAt: Date.now() + 60_000, purpose: "deploy", candidateCapacity: 9 };
  try {
    await assert.rejects(prepareStaging({ ...parameters, accountId: "0".repeat(32) }), /approved account/);
    await assert.rejects(prepareStaging({ ...parameters, workersSubdomain: undefined }), /approved account/);
    await assert.rejects(prepareStaging({ ...parameters, candidateCapacity: undefined }), /Explicit candidate capacity/);
    await assert.rejects(prepareStaging({ ...parameters, candidateCapacity: 8 }), /Explicit candidate capacity/);
    await assert.rejects(prepareStaging({ ...parameters, externalFixtureHostname: "gateway.discord.gg" }), /temporary tunnel hostname/);
    await assert.rejects(prepareStaging(parameters), /clean matching committed source/);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test("staging deployment refuses unavailable Git metadata", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "gateway-staging-no-git-"));
  const parameters = { output, accountId: APPROVED_ACCOUNT, workersSubdomain: "cnharrison", sourceSha: "0".repeat(40), expiresAt: Date.now() + 60_000, purpose: "deploy", candidateCapacity: 9 };
  try {
    await assert.rejects(execute(process.execPath, ["--input-type=module", "-e", `import { prepareStaging } from ${JSON.stringify(new URL("./gateway-capacity/staging-prepare.mjs", import.meta.url).href)}; await prepareStaging(${JSON.stringify(parameters)});`], { env: { ...process.env, GIT_DIR: path.join(output, "missing-git") } }), /clean matching committed source/);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test("staging binding generation requires an explicit source revision", async () => {
  const env = { ...process.env };
  delete env.VITE_BUILD_SHA;
  await assert.rejects(execute(process.execPath, [fileURLToPath(new URL("./gateway-capacity/staging-types.mjs", import.meta.url))], { env }), /VITE_BUILD_SHA must identify the source revision/);
});

test("capacity fixtures close wrong-token authentication with a nonrecoverable code", async () => {
  const require = createRequire(import.meta.resolve("wrangler"));
  const { Response, WebSocketPair } = require("miniflare");
  const fixture = createFixture({ Response, WebSocketPair, guildCount: 24, channelCount: 1, heartbeatMs: 1_000, ...fixtureDestinations });
  const response = await fixture.outbound(new Request("https://gateway.discord.gg/", { headers: { upgrade: "websocket" } }));
  const socket = response.webSocket;
  socket.accept();
  const closed = new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));
  socket.send(JSON.stringify({ op: 2, d: { token: "bad.bad.bad-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", shard: [0, SHARDS] } }));
  const event = await closed;
  assert.equal(event.code, 4004);
  assert.deepEqual(fixture.errors, ["Benchmark received an unexpected bot token"]);
});

test("capacity fixtures acknowledge a peer close so the client does not stall", async () => {
  const require = createRequire(import.meta.resolve("wrangler"));
  const { Response, WebSocketPair } = require("miniflare");
  const fixture = createFixture({ Response, WebSocketPair, guildCount: 24, channelCount: 1, heartbeatMs: 1_000, ...fixtureDestinations });
  const response = await fixture.outbound(new Request("https://gateway.discord.gg/", { headers: { upgrade: "websocket" } }));
  const socket = response.webSocket;
  socket.accept();
  socket.send(JSON.stringify({ op: 2, d: { token: FIXTURE_TOKEN, shard: [0, SHARDS] } }));
  const deadline = Date.now() + 5_000;
  while (fixture.connectedCount() !== 1 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fixture.connectedCount(), 1);
  socket.close(1000, "client-bye");
  while (socket.readyState !== 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(socket.readyState, 3);
  assert.equal(fixture.connectedCount(), 0);
});

test("capacity fixtures retain safe peer-close and Resume diagnostics", async () => {
  const require = createRequire(import.meta.resolve("wrangler"));
  const { Response, WebSocketPair } = require("miniflare");
  const fixture = createFixture({ Response, WebSocketPair, guildCount: 24, channelCount: 1, heartbeatMs: 1_000, ...fixtureDestinations });
  const open = async (message) => {
    const response = await fixture.outbound(new Request("https://gateway.discord.gg/", { headers: { upgrade: "websocket" } }));
    response.webSocket.accept();
    response.webSocket.send(JSON.stringify(message));
    assert.equal(fixture.connectedCount(), 1);
    return response.webSocket;
  };
  const close = async (socket, code, reason) => {
    const closed = new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));
    socket.close(code, reason);
    await closed;
  };
  const first = await open({ op: 2, d: { token: FIXTURE_TOKEN, shard: [0, SHARDS] } });
  await close(first, 4000, "heartbeat-ack-timeout");
  const resumed = await open({ op: 6, d: { token: FIXTURE_TOKEN, session_id: "fixture-session-0", seq: fixture.sequences[0] } });
  await close(resumed, 1000, FIXTURE_TOKEN);
  assert.equal(fixture.diagnostics.closes.length, 2);
  assert.equal(fixture.diagnostics.closes[0].reasonTag, "heartbeat-ack-timeout");
  assert.equal(fixture.diagnostics.closes[1].reasonTag, "unrecognized");
  assert.equal(fixture.diagnostics.closes[0].shardId, 0);
  assert.equal(fixture.diagnostics.closes[0].code, 4000);
  assert.equal(fixture.diagnostics.resumes[0].shardId, 0);
  assert.equal(fixture.diagnostics.resumes[0].sequence, 1);
  assert(Number.isFinite(fixture.diagnostics.resumes[0].at));
  assert(!JSON.stringify(fixture.diagnostics).includes(FIXTURE_TOKEN));
});

test("capacity close diagnostics omit rejected peer-supplied shard data", async () => {
  const require = createRequire(import.meta.resolve("wrangler"));
  const { Response, WebSocketPair } = require("miniflare");
  const fixture = createFixture({ Response, WebSocketPair, guildCount: 24, channelCount: 1, heartbeatMs: 1_000, ...fixtureDestinations });
  const response = await fixture.outbound(new Request("https://gateway.discord.gg/", { headers: { upgrade: "websocket" } }));
  const socket = response.webSocket;
  socket.accept();
  const closed = new Promise((resolve) => socket.addEventListener("close", () => {
    socket.close();
    resolve();
  }, { once: true }));
  socket.send(JSON.stringify({ op: 2, d: { token: FIXTURE_TOKEN, shard: ["private-peer-data", 24] } }));
  await closed;
  assert.equal(fixture.diagnostics.closes[0].shardId, null);
  assert(!JSON.stringify(fixture.diagnostics).includes("private-peer-data"));
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

test("host fixture exposes only authenticated synthetic controls on loopback", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "gateway-host-fixture-"));
  const secretsPath = path.join(output, "secrets.json");
  const secret = "b".repeat(64);
  let local;
  try {
    await writeFile(secretsPath, JSON.stringify({ GATEWAY_CONTROL_TOKEN: secret, DISCORD_BOT_TOKEN: FIXTURE_TOKEN }), { mode: 0o600 });
    const sourceSha = "0".repeat(40);
    const expiresAt = Date.now() + 60_000;
    local = await startLocalFixture({ hostname: "synthetic-fixture.trycloudflare.com", sourceSha, expiresAt, secretsPath, port: 0 });
    assert.equal(local.url.hostname, "127.0.0.1");
    assert.match(local.bundleSha256, /^[a-f0-9]{64}$/);
    assert.equal((await fetch(new URL("/configure", local.url), { method: "POST" })).status, 401);
    const headers = { authorization: `Bearer ${secret}` };
    assert.deepEqual(await (await fetch(new URL("/health", local.url), { headers })).json(), { sourceSha, expiresAt });
    const response = await fetch(new URL("/configure", local.url), { method: "POST", headers, body: JSON.stringify({ runId: "12345678-1234-4234-8234-123456789abc", guilds: 240, channels: 2, heartbeatMs: 1_000, knownGuilds: false }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).connected, 0);
    assert.equal((await fetch(new URL("/stop", local.url), { method: "POST", headers, body: "{}" })).status, 200);
  } finally {
    if (local) await local.runtime.dispose();
    await rm(output, { recursive: true, force: true });
  }
});

for (const external of [false, true]) test(`staging workers preserve synthetic boundaries and authentication (external=${external})`, { timeout: 90_000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "gateway-staging-native-"));
  const require = createRequire(import.meta.resolve("wrangler"));
  const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
  const secret = "a".repeat(64);
  let mf;
  try {
    const manifest = await prepareStaging({ output, accountId: APPROVED_ACCOUNT, workersSubdomain: "cnharrison", sourceSha: "0".repeat(40), expiresAt: Date.now() + 60_000, purpose: "local-test", candidateCapacity: 9, externalFixtureHostname: external ? "synthetic-fixture.trycloudflare.com" : undefined });
    assert.equal(manifest.candidateCapacity, 9);
    assert.equal(manifest.maxActiveObjects, 11);
    assert.deepEqual(manifest.configs.map(({ capacity }) => capacity), [null, 6, 9]);
    const fixtureConfig = manifest.configs[0];
    const options = manifest.configs.map((entry) => {
      const config = JSON.parse(require("node:fs").readFileSync(entry.configPath, "utf8"));
      return {
        name: entry.name, modules: true, modulesRoot: output, scriptPath: entry.outfile,
        compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
        bindings: { ...config.vars, GATEWAY_CONTROL_TOKEN: secret, DISCORD_BOT_TOKEN: FIXTURE_TOKEN },
        durableObjects: Object.fromEntries(config.durable_objects.bindings.map(({ name, class_name }) => [name, { className: class_name, useSQLite: true }])),
        serviceBindings: Object.fromEntries(config.services.map(({ binding, service, entrypoint }) => [binding, { name: service, entrypoint }])),
        outboundService: external ? "external-discord" : fixtureConfig.name,
      };
    });
    if (external) {
      const { build } = require("esbuild");
      const bundle = await build({ entryPoints: [fileURLToPath(new URL("./gateway-capacity/staging-fixture.mjs", import.meta.url))], bundle: true, format: "esm", platform: "browser", external: ["cloudflare:workers", "node:*"], write: false });
      options.push({ ...options[0], name: "external-discord", scriptPath: undefined, script: bundle.outputFiles[0].text, bindings: { ...options[0].bindings } });
    }
    mf = new Miniflare(convertV4MiniflareOptions({ workers: options }));
    await mf.ready;
    let fixture = await mf.getWorker(fixtureConfig.name);
    let gateway = await mf.getWorker(manifest.configs[2].name);
    const send = (worker, route, value) => {
      const options = { method: value === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" } };
      if (value !== undefined) options.body = JSON.stringify(value);
      return worker.fetch(`https://${manifest.hostname}${route}`, options);
    };
    assert.equal((await gateway.fetch(`https://${manifest.hostname}/start`, { method: "POST" })).status, 401);
    assert.equal((await fixture.fetch(`https://${manifest.hostname}/configure`, { method: "POST" })).status, 401);
    assert.equal((await send(fixture, "/configure", { runId: "12345678-1234-4234-8234-123456789abc", guilds: 240, channels: 2, heartbeatMs: 1_000, knownGuilds: true })).status, 200);
    for (const partition of [0, 1, 2]) assert.equal((await send(gateway, `/start?partition=${partition}`, {})).status, 200);
    const deadline = Date.now() + 30_000;
    let stats;
    do { stats = await (await send(fixture, "/stats")).json(); if (stats.connected === SHARDS) break; await new Promise((resolve) => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    assert.equal(stats.connected, SHARDS, JSON.stringify({ stats, status: await (await send(gateway, "/status?partition=0")).json() }));
    assert.equal((await send(fixture, "/replay", { countPerShard: 240, rate: 600, channelUpdates: false })).status, 200);
    let shards;
    do { shards = (await Promise.all([0, 1, 2].map(async (partition) => (await (await send(gateway, `/status?partition=${partition}`)).json()).connections))).flat(); if (shards.every((s) => s.initialGuildsPending === 0)) break; await new Promise((resolve) => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    assert.equal(shards.length, SHARDS);
    assert(shards.every((s) => s.state === "ready" && s.lastError === null && s.initialGuildsPending === 0));
    stats = await (await send(fixture, "/stats")).json();
    assert.equal(stats.counters.lifecycle, 0);
    assert.deepEqual(stats.errors, []);
    // A second pass goes through the data service RPC, unlike initial known-guild synchronization.
    assert.equal((await send(fixture, "/replay", { countPerShard: 240, rate: 600, channelUpdates: false })).status, 200);
    do { stats = await (await send(fixture, "/stats")).json(); if (stats.counters.lifecycle === 240) break; await new Promise((resolve) => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    assert.equal(stats.counters.lifecycle, 240);
    assert.deepEqual(stats.errors, []);
    assert.equal((await send(fixture, "/prepare-restart", {})).status, 200);
    options[0].bindings.TEST_RESTART = "prepared";
    if (external) options[3].bindings.TEST_RESTART = "prepared";
    await mf.setOptions(convertV4MiniflareOptions({ workers: options }));
    fixture = await mf.getWorker(fixtureConfig.name);
    gateway = await mf.getWorker(manifest.configs[2].name);
    const recovered = await (await send(fixture, "/stats")).json();
    assert.equal(recovered.plannedRestarts, 1);
    assert.deepEqual(recovered.sequences, stats.sequences);
    assert.equal(recovered.counters.lifecycle, stats.counters.lifecycle);
    assert.equal((await send(fixture, "/finish-restart", {})).status, 200);
    for (const partition of [0, 1, 2]) assert.equal((await send(gateway, `/stop?partition=${partition}`, {})).status, 200);
    options[0].bindings.TEST_RESTART = "unprepared";
    if (external) options[3].bindings.TEST_RESTART = "unprepared";
    await mf.setOptions(convertV4MiniflareOptions({ workers: options }));
    fixture = await mf.getWorker(fixtureConfig.name);
    await assert.rejects(send(fixture, "/stats"), /Fixture restarted during a profile/);
    assert.equal((await send(fixture, "/stop", {})).status, 200);

    // Reuse the namespace to prove that a different capacity cannot inherit its coordinator state.
    for (const name of ["GATEWAY_PARTITION_CAPACITY", "GATEWAY_FLEET_CONNECTION_CAPACITY", "GATEWAY_ROLLOUT_MAX_UNAVAILABLE_SHARDS"]) options[2].bindings[name] = "25";
    await mf.setOptions(convertV4MiniflareOptions({ workers: options }));
    const nextGateway = await mf.getWorker(manifest.configs[2].name);
    const nextFixture = await mf.getWorker(fixtureConfig.name);
    assert.equal((await send(nextFixture, "/configure", { runId: "12345678-1234-4234-8234-123456789abc", guilds: 240, channels: 2, heartbeatMs: 1_000, knownGuilds: true })).status, 200);
    assert.equal((await send(nextGateway, "/start?partition=0", {})).status, 200);
    assert.equal((await send(nextGateway, "/stop?partition=0", {})).status, 200);
    assert.equal((await send(nextFixture, "/stop", {})).status, 200);
  } finally {
    if (mf) await mf.dispose();
    await rm(output, { recursive: true, force: true });
  }
});

for (const [capacity, layout] of [["both", "shared"], ["7", "separate"]]) test(`capacity benchmark ${capacity}/${layout} checks 25 shards and persisted recovery`, { timeout: 60_000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "gateway-capacity-test-"));
  let passed = false;
  try {
    await execute(process.execPath, [
      new URL("./gateway-capacity/run.mjs", import.meta.url).pathname,
      "--output", output,
      "--guilds", "240", "--channels", "2", "--rate", "600",
      "--replay", "5", "--slow-ms", "10", "--heartbeat-ms", "1000", "--runs", "1", "--capacity", capacity,
      "--isolate-layout", layout,
    ], { timeout: 55_000 });
    const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.results.map((result) => result.status), Array(capacity === "both" ? 2 : 1).fill("passed-local-protocol"));
    for (const result of manifest.results) {
      const report = JSON.parse(await readFile(result.file, "utf8"));
      assert.deepEqual(report.phases.map((phase) => phase.name), ["startup", "slow-replay", "reconnect", "restart"]);
      assert.equal(report.counters.identifies, SHARDS);
      assert.equal(report.counters.resumes, SHARDS * 2);
      assert.equal(report.counters.lifecycle, 490);
      assert.equal(report.counters.directory, 125);
      assert.equal(report.lastStatus.length, SHARDS);
      assert.deepEqual(report.errors, []);
      assert(report.samples.length > 1);
      assert.equal(report.isolateLayout, layout);
      const expectedIsolates = layout === "shared" ? 1 : Math.ceil(SHARDS / report.capacity);
      assert(report.samples.every((sample) => sample.heaps.length === expectedIsolates));
      assert(report.samples.every((sample) => sample.heaps.every((heap) => heap.usedSize > 0 && heap.embedderHeapUsedSize > 0)));
    }
    passed = true;
  } finally {
    if (passed) await rm(output, { recursive: true, force: true });
    else console.error(`Capacity benchmark evidence retained: ${output}`);
  }
});

test("local benchmark records explicit source identity when Git metadata is absent", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gateway-source-"));
  try {
    assert.throws(() => benchmarkSourceIdentity(directory), /Git metadata/);
    assert.throws(() => benchmarkSourceIdentity(directory, "not-a-sha"), /Git metadata/);
    assert.deepEqual(benchmarkSourceIdentity(directory, "a".repeat(40)), {
      sourceSha: "a".repeat(40), changedPaths: null, sourceIdentity: "provided-sha",
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
