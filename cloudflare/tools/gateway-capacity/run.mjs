import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createFixture, FIXTURE_TOKEN, guildPayload, SHARDS } from "./fixture.mjs";

// Use the runtime and bundler owned by the pinned Wrangler, not a second toolchain.
const require = createRequire(import.meta.resolve("wrangler"));
const { Miniflare, convertV4MiniflareOptions, Response, WebSocketPair } = require("miniflare");
const { build } = require("esbuild");
const root = fileURLToPath(new URL("../../", import.meta.url));
const Options = z.strictObject({
  output: z.string().min(1),
  guilds: z.coerce.number().int().min(SHARDS).max(30_000),
  channels: z.coerce.number().int().min(1).max(100),
  rate: z.coerce.number().int().min(24).max(2_400),
  replay: z.coerce.number().int().min(1).max(200),
  "slow-ms": z.coerce.number().int().min(1).max(200),
  "heartbeat-ms": z.coerce.number().int().min(1_000).max(41_250),
  runs: z.coerce.number().int().min(1).max(5),
  capacity: z.enum(["6", "7", "9", "12", "25", "both"]),
});
const SAMPLE_MS = 100;
const PHASE_TIMEOUT_MS = 180_000;

export function assertHealthy(sampleError, fixtureErrors, runtimeErrors) {
  if (sampleError) throw sampleError;
  assert.deepEqual(fixtureErrors, [], "Fixture errors");
  assert.deepEqual(runtimeErrors, [], "Runtime errors");
}

class Inspector {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Inspector disconnected"));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error("Inspector connection timed out")); }, 10_000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Inspector connection failed")); }, { once: true });
    });
    return new Inspector(socket);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

async function runTopology({ options, script, capacity, run }) {
  const fixture = createFixture({ Response, WebSocketPair, guildCount: options.guilds, channelCount: options.channels, heartbeatMs: options["heartbeat-ms"], token: FIXTURE_TOKEN, gatewayUrl: "wss://gateway.discord.gg", botUrl: "https://discord.com/api/v10/gateway/bot", knownGuilds: false });
  const partitionCount = Math.ceil(SHARDS / capacity);
  const names = Array.from({ length: partitionCount }, (_, index) => `gateway-${index}`);
  const errors = [];
  const abort = new AbortController();
  const report = { run, capacity, partitions: partitionCount, startedAt: new Date().toISOString(), phases: [], errors };
  const inspectors = [];
  const samples = [];
  let phase = "baseline";
  let sampling = false;
  let sampleError;
  let sampler;
  const common = {
    modules: true,
    script,
    compatibilityDate: "2026-07-10",
    bindings: {
      DISCORD_BOT_TOKEN: FIXTURE_TOKEN,
      DISCORD_GATEWAY_BOT_URL: "https://discord.com/api/v10/gateway/bot",
      GATEWAY_ALLOWED_HOSTNAME: "gateway.discord.gg",
      GATEWAY_MODE: "fleet",
      GATEWAY_FLEET_CONNECTION_CAPACITY: String(capacity),
      GATEWAY_PARTITION_CAPACITY: String(capacity),
    },
    durableObjects: {
      GATEWAY_PARTITION: { className: "GatewayPartition", useSQLite: true },
      GATEWAY_COORDINATOR: { className: "GatewayCoordinator", scriptName: "coordinator", useSQLite: true },
    },
    serviceBindings: { DATA_SERVICE: fixture.data, DISCORD_REST: { name: "rest", entrypoint: "FixtureDiscordRest" } },
    outboundService: fixture.outbound,
  };
  const statePath = path.join(options.output, `state-${run}-${capacity}`);
  const converted = await convertV4MiniflareOptions({
    host: "127.0.0.1",
    inspectorHost: "127.0.0.1",
    inspectorPort: 0,
    unsafeInspectDurableObjects: true,
    workers: [
      ...names.map((name) => ({ ...common, name })),
      { ...common, name: "coordinator", durableObjects: {
        GATEWAY_COORDINATOR: { className: "GatewayCoordinator", useSQLite: true },
        GATEWAY_PARTITION: { className: "GatewayPartition", scriptName: names[0], useSQLite: true },
      } },
      { name: "rest", modules: true, script, compatibilityDate: "2026-07-10", outboundService: fixture.outbound },
    ],
  });
  converted.resourcePersistencePath = statePath;
  converted.handleStructuredLogs = (log) => {
    if (log.level === "error" || log.level === "warn") errors.push(JSON.stringify(log));
  };
  converted.handleUncaughtError = (error) => errors.push(error.message);
  let mf = new Miniflare(converted);
  const file = path.join(options.output, `run-${run}-capacity-${capacity}.json`);

  async function memory(kind = "sample") {
    const heaps = await Promise.all(inspectors.map(async ({ name, client }) => {
      const heap = await client.send("Runtime.getHeapUsage");
      const estimatedBytes = heap.usedSize + heap.embedderHeapUsedSize + heap.backingStorageSize;
      assert(Number.isFinite(estimatedBytes), "Inspector heap components are missing");
      return { name, ...heap, estimatedBytes };
    }));
    samples.push({ phase, kind, at: performance.now(), heaps });
    return heaps;
  }

  async function request(route) {
    return Promise.all(names.map(async (name, index) => {
      const worker = await mf.getWorker(name);
      const response = await worker.fetch(`http://benchmark.local/${route}?partition=${index}`);
      assert.equal(response.status, 200, `${name}/${route}`);
      return response.json();
    }));
  }

  async function statuses() {
    assertHealthy(sampleError, fixture.errors, errors);
    const shards = (await request("status")).flatMap(({ connections }) => connections);
    report.lastStatus = shards;
    assert(shards.every(({ state, lastError }) => state !== "fatal" && lastError === null), JSON.stringify(shards.filter((s) => s.lastError)));
    return shards;
  }

  async function until(predicate, label) {
    const deadline = performance.now() + PHASE_TIMEOUT_MS;
    while (performance.now() < deadline) {
      if (await predicate(await statuses())) return;
      await delay(200);
    }
    throw new Error(`Timed out: ${label}`);
  }

  async function drained(expectedLifecycle, expectedDirectory) {
    await until((shards) => shards.length === SHARDS && shards.every((s) =>
      s.state === "ready" && s.sequence >= fixture.sequences[s.shardId] && s.initialGuildsPending === 0,
    ) && fixture.counters.lifecycle === expectedLifecycle && fixture.counters.directory === expectedDirectory, "event drain");
  }

  async function verifyHeartbeats() {
    await until((shards) => shards.every((s) =>
      s.lastHeartbeatSentAt !== null && s.lastHeartbeatAckAt !== null &&
      s.lastHeartbeatAckAt >= s.lastHeartbeatSentAt &&
      Date.now() - s.lastHeartbeatAckAt < options["heartbeat-ms"] * 2 &&
      fixture.heartbeatSequences[s.shardId] === fixture.sequences[s.shardId],
    ), "natural heartbeat acknowledgements");
  }

  async function record(name, operation) {
    phase = name;
    const start = performance.now();
    const counters = { ...fixture.counters };
    await operation();
    await memory();
    const clients = inspectors.map(({ client }) => client);
    const collected = Promise.all(clients.map((client) => client.send("HeapProfiler.collectGarbage")));
    // workerd services inspector GC commands when the isolate next runs JavaScript.
    await request("status");
    await collected;
    const retained = await memory("after-gc");
    report.phases.push({ name, milliseconds: performance.now() - start, countersBefore: counters, countersAfter: { ...fixture.counters }, retained });
    console.log(`run=${run} capacity=${capacity} phase=${name} retainedMiB=${retained.map((h) => (h.estimatedBytes / 1024 / 1024).toFixed(1)).join(",")}`);
  }

  async function connectInspectors() {
    await mf.ready;
    const inspectorUrl = await mf.getInspectorURL();
    inspectorUrl.protocol = "http:";
    const targets = await (await fetch(new URL("/json/list", inspectorUrl))).json();
    for (const name of names) {
      const target = targets.find(({ id }) => id === `core:user:${name}`);
      assert(target, `Inspector target missing: ${name}`);
      const client = await Inspector.connect(target.webSocketDebuggerUrl);
      await client.send("HeapProfiler.enable");
      inspectors.push({ name, client });
    }
  }

  function replay(profile) {
    return fixture.replay({ ...profile, signal: abort.signal });
  }

  function startSampler() {
    sampling = true;
    sampler = (async () => {
      while (sampling) {
        try {
          assertHealthy(sampleError, fixture.errors, errors);
          await memory();
        } catch (error) { sampleError = error; abort.abort(error); return; }
        await delay(SAMPLE_MS);
      }
    })();
  }

  try {
    await connectInspectors();
    await memory();
    startSampler();
    await record("startup", async () => {
      await request("start");
      await until((shards) => shards.length === SHARDS && shards.every((s) => s.state === "ready"), "READY");
      await replay({ countPerShard: options.guilds, rate: options.rate });
      await drained(options.guilds, 0);
      await verifyHeartbeats();
    });
    const replayCount = fixture.ids.reduce((sum, ids) => sum + Math.min(ids.length, options.replay), 0);
    await record("slow-replay", async () => {
      fixture.setSlowMs(options["slow-ms"]);
      await replay({ countPerShard: options.replay, rate: 2_400 });
      await replay({ countPerShard: options.replay, rate: 2_400, channelUpdates: true });
      await drained(options.guilds + replayCount, replayCount);
      fixture.setSlowMs(0);
      await verifyHeartbeats();
    });
    await record("reconnect", async () => {
      const before = fixture.counters.resumes;
      fixture.reconnectAll();
      await until((shards) => fixture.counters.resumes === before + SHARDS && shards.every((s) => s.state === "ready"), "all-shard RESUME");
      await replay({ countPerShard: options.replay, rate: 2_400 });
      await drained(options.guilds + replayCount * 2, replayCount);
      await verifyHeartbeats();
    });
    await record("restart", async () => {
      const before = fixture.counters.resumes;
      const activationIds = (await statuses()).map((s) => s.activationId);
      sampling = false;
      await sampler;
      for (const { client } of inspectors) client.close();
      inspectors.length = 0;
      // Restart the runtime, not a graceful suspension: outgoing sockets prevent idle eviction.
      await mf.dispose();
      mf = new Miniflare(converted);
      await connectInspectors();
      startSampler();
      assert.equal((await statuses()).length, SHARDS, "Restart did not restore the persisted shard set");
      await request("recover");
      await until((shards) => fixture.counters.resumes === before + SHARDS && shards.every((s) =>
        s.state === "ready" && s.activationId !== activationIds[s.shardId],
      ), "persisted all-shard recovery");
      await verifyHeartbeats();
    });
    const inventory = (await request("inventory")).flatMap(({ entries }) => entries);
    assert.equal(inventory.length, SHARDS);
    for (const entry of inventory) assert.deepEqual(entry.inventory.guildIds, fixture.ids[entry.status.shardId]);
    sampling = false;
    await sampler;
    assertHealthy(sampleError, fixture.errors, errors);
    await memory();
    report.status = "passed-local-protocol";
  } catch (error) {
    report.status = "failed";
    report.failure = (sampleError ?? error).stack;
    sampling = false;
    if (sampler) await sampler;
    if (inspectors.length > 0) {
      try {
        const collected = Promise.all(inspectors.map(({ client }) => client.send("HeapProfiler.collectGarbage")));
        report.stoppedStatus = (await request("status")).flatMap(({ connections }) => connections);
        await collected;
        report.retainedAfterStop = await memory("after-gc");
      } catch (diagnosticError) {
        report.diagnosticFailure = diagnosticError.message;
      }
    }
    throw sampleError ?? error;
  } finally {
    sampling = false;
    if (sampler) await sampler;
    report.endedAt = new Date().toISOString();
    report.counters = { ...fixture.counters };
    report.samples = samples;
    report.peakEstimatedBytes = Math.max(0, ...samples.flatMap((s) => s.heaps.map((h) => h.estimatedBytes)));
    fixture.close();
    for (const { client } of inspectors) client.close();
    await mf.dispose();
    await rm(statePath, { recursive: true, force: true });
    await writeFile(file, JSON.stringify(report, null, 2), { mode: 0o600 });
  }
  return { file, status: report.status, peakEstimatedBytes: report.peakEstimatedBytes };
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length % 2 === 0, "Options require values");
  assert(args.every((arg, index) => index % 2 !== 0 || /^--[a-z-]+$/.test(arg)), "Invalid option");
  const keys = args.filter((_, index) => index % 2 === 0);
  assert.equal(new Set(keys).size, keys.length, "Duplicate options");
  const options = Options.parse(Object.fromEntries(keys.map((key, index) => [key.slice(2), args[index * 2 + 1]])));
  options.output = path.resolve(options.output);
  await mkdir(options.output, { recursive: true, mode: 0o700 });
  assert.equal((await readdir(options.output)).length, 0, "Evidence directory must be empty");
  const entry = path.join(root, "tools/gateway-capacity/worker.ts");
  const bundle = await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "browser", external: ["cloudflare:workers"], write: false });
  const script = bundle.outputFiles[0].text;
  const manifest = {
    options,
    sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    bundleSha256: createHash("sha256").update(script).digest("hex"),
    fixtureSha256: createHash("sha256").update(await readFile(new URL("./fixture.mjs", import.meta.url))).digest("hex"),
    runnerSha256: createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex"),
    changedPaths: execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).trim().split("\n"),
    guildPayloadBytes: Buffer.byteLength(JSON.stringify(guildPayload("100000000000000000", options.channels))),
    versions: { node: process.version, wrangler: require("wrangler/package.json").version, miniflare: require("miniflare/package.json").version, esbuild: require("esbuild/package.json").version },
    heartbeatMs: options["heartbeat-ms"],
    sampleMs: SAMPLE_MS,
    memoryAssessment: "Observational only. Local V8 heap components and forced GC cannot certify the deployed runtime memory limit; use Cloudflare isolate metrics and resource errors.",
    limitations: [
      "Synthetic guild/channel distribution; no production payloads or credentials.",
      "Separate baseline isolates; production objects can share an isolate.",
      "Heap components are not Cloudflare total isolate-memory telemetry; native runtime/socket memory is not fully measured.",
      "100 ms sampling can miss short allocation peaks; forced GC measures retained heap, not natural GC behavior.",
      "25 identify buckets deliberately create a startup burst; this is not a production Discord rate-limit model.",
      "All guilds require initial lifecycle synchronization, a cold-data stress case rather than normal steady state.",
      "GUILD_CREATE channels add payload size but the application only writes channel directory entries for CHANNEL_UPDATE events.",
      "No production capacity migration is exercised. Local success requires a Cloudflare staging gate.",
    ],
    results: [],
  };
  const manifestFile = path.join(options.output, "manifest.json");
  try {
    for (let run = 1; run <= options.runs; run += 1) {
      // Alternate order to reduce systematic warm-host bias.
      const order = run % 2 === 1 ? [6, 9] : [9, 6];
      const capacities = options.capacity === "both" ? order : [Number(options.capacity)];
      for (const capacity of capacities) {
        try {
          manifest.results.push(await runTopology({ options, script, capacity, run }));
        } catch (error) {
          manifest.results.push({ file: path.join(options.output, `run-${run}-capacity-${capacity}.json`), status: "failed", failure: error.message });
          throw error;
        }
      }
    }
  } finally {
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    console.log(manifestFile);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
