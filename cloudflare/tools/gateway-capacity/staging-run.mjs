import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { guildIds, SHARDS } from "./fixture.mjs";
import { APPROVED_ACCOUNT, STAGING_NAMES } from "./staging-prepare.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const STOP_MARGIN_MS = 120_000;
const SecretFile = z.strictObject({ DISCORD_BOT_TOKEN: z.string().min(50).max(200).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/), GATEWAY_CONTROL_TOKEN: z.string().min(50).max(128) });
const ObjectMetric = z.object({ count: z.number().positive(), avg: z.object({ sampleInterval: z.number().positive() }), dimensions: z.object({ datetime: z.string(), namespaceId: z.string(), objectId: z.string(), name: z.string() }), max: z.object({ memoryUsageBytes: z.number().nonnegative(), activeWebsocketConnections: z.number().nonnegative() }), sum: z.object({ cpuTime: z.number().nonnegative(), duration: z.number().nonnegative(), exceededCpuErrors: z.number().nonnegative(), exceededMemoryErrors: z.number().nonnegative(), fatalInternalErrors: z.number().nonnegative(), inboundWebsocketMsgCount: z.number().nonnegative(), outboundWebsocketMsgCount: z.number().nonnegative(), rowsRead: z.number().nonnegative(), rowsWritten: z.number().nonnegative() }), quantiles: z.object({ memoryUsageBytesP50: z.number().nonnegative(), memoryUsageBytesP99: z.number().nonnegative() }) });

async function privateFile(file) {
  const info = await stat(file);
  if ((info.mode & 0o077) !== 0 || !info.isFile()) throw new Error("Benchmark credential file must be private");
  return readFile(file, "utf8");
}

export function stagingGatewayRoles(selection) {
  assert(selection === "six" || selection === "both", "Explicit six or both Gateway selection is required");
  return selection === "six" ? ["six"] : ["six", "twentyFour"];
}

export function stagingDeadline(expiresAt, now) {
  assert(Number.isSafeInteger(expiresAt) && Number.isSafeInteger(now), "Explicit staging timestamps are required");
  const deadline = expiresAt - STOP_MARGIN_MS;
  assert(now < deadline, "Benchmark deadline safety margin reached");
  return deadline;
}

export async function runStaging({ manifestPath, secretsPath, accountTokenPath, output, profiles, gatewaySelection }) {
  const selectedRoles = stagingGatewayRoles(gatewaySelection);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.purpose, "deploy");
  assert.equal(manifest.accountId, APPROVED_ACCOUNT);
  assert([12, 24].includes(manifest.candidateCapacity), "Invalid candidate capacity");
  assert.equal(manifest.maxActiveObjects, 7 + SHARDS / manifest.candidateCapacity);
  assert.equal(manifest.maxAdditionalCostUsd, 25);
  assert.equal(manifest.sourceSha, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim());
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "", "Staging requires a clean committed source");
  const secrets = SecretFile.parse(JSON.parse(await privateFile(secretsPath)));
  const accountToken = (await privateFile(accountTokenPath)).trim();
  assert(accountToken.length > 0);
  await mkdir(output, { recursive: true, mode: 0o700 });
  assert.equal((await readdir(output)).length, 0, "Benchmark output must be empty");
  const save = (name, value) => writeFile(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  const startedAt = new Date().toISOString();
  const reports = [];
  const tails = [];
  let maximumBillableRows = 0;
  let lastMetricCheck = 0;
  let cleanupFailed = false;
  let lastPoll = null;
  const expectedTokenDigest = createHash("sha256").update(secrets.DISCORD_BOT_TOKEN).digest("hex");

  function withoutTokens(value) {
    if (Array.isArray(value)) return value.map(withoutTokens);
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Recursive redaction inspects arbitrary decoded JSON before selecting object keys.
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).filter(([key]) => !/token/i.test(key)).map(([key, entry]) => [key, withoutTokens(entry)]));
    }
    return value;
  }

  async function api(resource) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${manifest.accountId}/${resource}`, { headers: { authorization: `Bearer ${accountToken}` }, signal: AbortSignal.timeout(30_000), redirect: "error" });
    if (!response.ok) throw new Error(`Staging account inspection returned HTTP ${response.status}`);
    const body = await response.json();
    if (!body.success) throw new Error("Staging account inspection failed");
    return body.result;
  }

  async function graph(namespaceIds, start, end) {
    const query = `query($account: string!, $namespaces: [string!]!, $start: Time!, $end: Time!) { viewer { accounts(filter: {accountTag: $account}) { durableObjectsPeriodicGroups(limit: 1000, filter: {namespaceId_in: $namespaces, datetime_geq: $start, datetime_leq: $end}, orderBy: [datetime_ASC]) { count avg {sampleInterval} dimensions {datetime namespaceId objectId name} max {memoryUsageBytes activeWebsocketConnections} quantiles {memoryUsageBytesP50 memoryUsageBytesP99} sum {cpuTime duration exceededCpuErrors exceededMemoryErrors fatalInternalErrors inboundWebsocketMsgCount outboundWebsocketMsgCount rowsRead rowsWritten} } } } }`;
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { authorization: `Bearer ${accountToken}`, "content-type": "application/json" }, body: JSON.stringify({ query, variables: { account: manifest.accountId, namespaces: namespaceIds, start, end } }), signal: AbortSignal.timeout(30_000), redirect: "error" });
    const body = await response.json();
    if (!response.ok || body.errors?.length) throw new Error("Staging metrics query failed");
    const rows = z.array(ObjectMetric).parse(body.data?.viewer?.accounts?.[0]?.durableObjectsPeriodicGroups);
    if (rows.length >= 1_000) throw new Error("Staging metrics reached the query limit");
    return rows;
  }

  async function request(config, route, data, expectedStatus = 200) {
    assert.equal(config.name, STAGING_NAMES[config.role]);
    assert.equal(config.url, `https://${config.name}.cnharrison.workers.dev`);
    const options = { method: data === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${secrets.GATEWAY_CONTROL_TOKEN}`, "content-type": "application/json" }, signal: AbortSignal.timeout(route.startsWith("/stop") ? 30_000 : 120_000), redirect: "error" };
    if (data !== undefined) options.body = JSON.stringify(data);
    const response = await fetch(`${config.url}${route}`, options);
    if (expectedStatus === "restart-error") {
      assert(response.status >= 500, "Persisted restart did not abort its invocation");
      return { status: response.status };
    }
    assert.equal(response.status, expectedStatus, `${config.name} ${route}`);
    return response.json();
  }

  const fixture = manifest.configs.find(({ role }) => role === "fixture");
  const gateways = manifest.configs.filter(({ role }) => role !== "fixture");
  assert(fixture && gateways.length === 2);
  const allNamespaceIds = [];
  for (const config of manifest.configs) {
    assert.equal(config.name, STAGING_NAMES[config.role]);
    assert.equal(createHash("sha256").update(await readFile(config.outfile)).digest("hex"), config.digest, "Local deployment bundle digest changed");
    const content = await fetch(`https://api.cloudflare.com/client/v4/accounts/${manifest.accountId}/workers/scripts/${config.name}`, { headers: { authorization: `Bearer ${accountToken}` }, signal: AbortSignal.timeout(30_000), redirect: "error" });
    assert(content.ok, "Deployed staging source could not be inspected");
    const parts = await content.formData();
    const moduleResult = z.union([z.string(), z.instanceof(Blob)]).safeParse(parts.get(path.basename(config.outfile)));
    assert(moduleResult.success, "Deployed staging main module is missing");
    const module = moduleResult.data;
    const moduleBytes = module instanceof Blob ? new Uint8Array(await module.arrayBuffer()) : Buffer.from(module);
    assert.equal(createHash("sha256").update(moduleBytes).digest("hex"), config.digest, "Deployed staging code does not match its local bundle");
    assert.equal(createHash("sha256").update(await readFile(config.configPath)).digest("hex"), config.configDigest, "Deployment configuration changed");
    const expected = JSON.parse(await readFile(config.configPath, "utf8"));
    if (config.role === "fixture") assert.equal(config.capacity, null);
    else {
      assert.equal(config.capacity, config.role === "six" ? 6 : manifest.candidateCapacity);
      assert.equal(expected.vars.GATEWAY_FLEET_CONNECTION_CAPACITY, String(config.capacity));
    }
    const settings = await api(`workers/scripts/${config.name}/settings`);
    assert.equal(settings.compatibility_date, expected.compatibility_date);
    assert.deepEqual([...settings.compatibility_flags].sort(), [...expected.compatibility_flags].sort());
    for (const [name, text] of Object.entries(expected.vars)) assert.equal(settings.bindings.find((binding) => binding.name === name && binding.type === "plain_text")?.text, text, `Deployed ${name} mismatch`);
    for (const service of expected.services) {
      const binding = settings.bindings.find(({ name, type }) => name === service.binding && type === "service");
      assert.equal(binding?.service, service.service);
      assert.equal(binding?.entrypoint, service.entrypoint);
    }
    const namespaces = settings.bindings.filter(({ type }) => type === "durable_object_namespace");
    assert.equal(namespaces.length, config.role === "fixture" ? 1 : 2);
    for (const binding of namespaces) {
      assert.match(binding.namespace_id, /^[a-f0-9]{32}$/);
      assert.notEqual(binding.namespace_id, "1a06dbd8204e45dbbfdacf8d3aa58ba3");
      allNamespaceIds.push(binding.namespace_id);
    }
    config.namespaceId = namespaces.find(({ class_name }) => class_name === (config.role === "fixture" ? "FixtureController" : "GatewayPartition"))?.namespace_id;
    assert(config.namespaceId);
    const health = await request(config, "/health");
    assert.equal(health.sourceSha, manifest.sourceSha);
    assert.equal(health.expiresAt, manifest.expiresAt);
    if (config.role !== "fixture") assert.equal(health.capacity, config.capacity);
  }
  assert.equal(new Set(allNamespaceIds).size, 5);
  await save("deployment.json", { ...manifest, startedAt, allNamespaceIds });

  function fleetRequests(config, route, post = false, expectedStatus = 200) {
    const count = SHARDS / config.capacity;
    return Array.from({ length: count }, (_, index) => request(config, `${route}?partition=${index}`, post ? {} : undefined, expectedStatus));
  }

  const fleet = (...args) => Promise.all(fleetRequests(...args));

  async function stop() {
    const results = await Promise.allSettled(gateways.flatMap((config) => fleetRequests(config, "/stop", true)));
    const fixtureResult = await Promise.allSettled([request(fixture, "/stop", {})]);
    const failures = [...results, ...fixtureResult].filter(({ status }) => status === "rejected");
    if (failures.length) {
      cleanupFailed = true;
      throw new Error("Staging shutdown failed");
    }
  }

  async function costAndResourceGuard(force = false) {
    stagingDeadline(manifest.expiresAt, Date.now());
    if (!force && Date.now() - lastMetricCheck < 30_000) return;
    lastMetricCheck = Date.now();
    const rows = await graph(allNamespaceIds, startedAt, new Date().toISOString());
    maximumBillableRows = Math.max(maximumBillableRows, rows.reduce((total, row) => total + row.sum.rowsWritten, 0));
    if (maximumBillableRows > 5_000_000) throw new Error("Benchmark SQLite write budget exceeded");
    if (tails.some(({ failure, child, parser }) => failure || child.exitCode !== null || child.signalCode !== null || parser.exitCode !== null || parser.signalCode !== null)) throw new Error("Staging Tail capture failed");
    if (rows.some(({ sum }) => sum.exceededCpuErrors || sum.exceededMemoryErrors)) throw new Error("Benchmark platform resource limit exceeded");
    await save("current-resource-and-cost-evidence.json", { checkedAt: new Date().toISOString(), maximumBillableRows, rows });
  }

  async function until(config, predicate, label, heartbeatMs) {
    const deadline = Date.now() + 6 * 60_000;
    while (Date.now() < deadline) {
      await costAndResourceGuard();
      const [parts, stats] = await Promise.all([fleet(config, "/status"), request(fixture, "/stats")]);
      const shards = parts.flatMap(({ connections }) => connections);
      lastPoll = { shards, stats, observedAt: new Date().toISOString() };
      assert.deepEqual(stats.errors, [], "Fixture errors");
      assert(shards.every(({ state, lastError }) => state !== "fatal" && lastError === null), "Gateway runtime error");
      const heartbeatHealthy = shards.length === SHARDS && shards.every((s) => s.lastHeartbeatAckAt !== null && s.lastHeartbeatSentAt !== null && s.lastHeartbeatAckAt >= s.lastHeartbeatSentAt && Date.now() - s.lastHeartbeatAckAt < heartbeatMs * 2 && stats.heartbeatSequences[s.shardId] === stats.sequences[s.shardId]);
      if (await predicate({ shards, stats, heartbeatHealthy })) return { shards, stats };
      await delay(1_000);
    }
    throw new Error(`Timed out: ${label}`);
  }

  async function expectActorAgreement(config) {
    const probe = await request(fixture, "/probe");
    assert.equal(probe.sourceSha, manifest.sourceSha, "Fixture actor source mismatch");
    assert.equal(probe.expiresAt, manifest.expiresAt, "Fixture actor deadline mismatch");
    assert(probe.tokenDigest === expectedTokenDigest, "Fixture actor bot-token mismatch");
    if (probe.hasProfile || probe.lostRunId) throw new Error("Fixture actor retains a prior profile");
    const diagnostics = await fleet(config, "/probe");
    for (const diagnostic of diagnostics) {
      assert.equal(diagnostic.sourceSha, manifest.sourceSha, "Gateway actor source mismatch");
      assert.equal(diagnostic.expiresAt, manifest.expiresAt, "Gateway actor deadline mismatch");
      assert(diagnostic.tokenDigest === expectedTokenDigest, "Gateway actor bot-token mismatch");
    }
    return { fixture: withoutTokens(probe), gateways: withoutTokens(diagnostics) };
  }

  async function profile(config, model) {
    const report = { role: config.role, worker: config.name, namespaceId: config.namespaceId, capacity: config.capacity, model, runId: randomUUID(), startedAt: new Date().toISOString(), phases: [] };
    let lifecycle = 0;
    let directory = 0;
    let final;
    const count = Math.min(Math.floor(model.guilds / SHARDS), 100);
    const replayCount = count * SHARDS;
    const phase = async (name, operation) => {
      const start = performance.now();
      const startDate = new Date().toISOString();
      const result = await operation();
      assert(Array.isArray(result.stats.diagnostics.closes) && Array.isArray(result.stats.diagnostics.resumes), "Fixture socket diagnostics are required");
      report.phases.push({ name, start: startDate, end: new Date().toISOString(), milliseconds: performance.now() - start, counters: result.stats.counters, diagnostics: result.stats.diagnostics });
      console.log(`${report.role} ${model.name} ${name} complete`);
      return result;
    };
    const drained = () => until(config, ({ shards, stats, heartbeatHealthy }) => shards.length === SHARDS && shards.every((s) => s.state === "ready" && s.sequence >= stats.sequences[s.shardId] && s.initialGuildsPending === 0) && stats.counters.lifecycle === lifecycle && stats.counters.directory === directory && heartbeatHealthy, "event and heartbeat drain", model.heartbeatMs);
    try {
      await stop();
      lastPoll = null;
      report.actorAgreement = await expectActorAgreement(config);
      await request(fixture, "/configure", { runId: report.runId, guilds: model.guilds, channels: model.channels, heartbeatMs: model.heartbeatMs, knownGuilds: model.knownGuilds });
      await phase("startup", async () => {
        assert(model.startupMode === undefined || model.startupMode === "sequential", "Invalid benchmark startup mode");
        if (model.startupMode === "sequential") {
          const capacity = config.capacity;
          for (let shard = 0; shard < SHARDS; shard++) {
            await request(config, `/start?partition=${Math.floor(shard / capacity)}&shard=${shard}`, {});
            await until(config, ({ shards }) => shards.some((status) => status.shardId === shard && status.state === "ready"), `shard ${shard} READY`, model.heartbeatMs);
          }
        } else {
          await fleet(config, "/start", true);
        }
        await until(config, ({ shards, stats }) => shards.length === SHARDS && shards.every((s) => s.state === "ready") && stats.connected === SHARDS, "READY", model.heartbeatMs);
        await request(fixture, "/replay", { countPerShard: model.guilds, rate: 600, channelUpdates: false });
        lifecycle = model.knownGuilds ? 0 : model.guilds;
        return drained();
      });
      await phase("slow-replay", async () => {
        await request(fixture, "/slow", { milliseconds: 50 });
        await request(fixture, "/replay", { countPerShard: count, rate: 600, channelUpdates: false });
        lifecycle += replayCount;
        await request(fixture, "/replay", { countPerShard: count, rate: 600, channelUpdates: true });
        directory += replayCount;
        const result = await drained();
        await request(fixture, "/slow", { milliseconds: 0 });
        return result;
      });
      await phase("reconnect", async () => {
        const before = await request(fixture, "/stats");
        await request(fixture, "/reconnect", {});
        await until(config, ({ shards, stats }) => stats.counters.resumes === before.counters.resumes + SHARDS && shards.every((s) => s.state === "ready"), "controlled RESUME", model.heartbeatMs);
        return drained();
      });
      await phase("restart", async () => {
        const before = await request(fixture, "/stats");
        const activations = await fleet(config, "/diagnostic");
        await fleet(config, "/restart", true, "restart-error");
        await fleet(config, "/recover", true);
        await until(config, ({ shards, stats }) => stats.counters.resumes === before.counters.resumes + SHARDS && shards.length === SHARDS && shards.every((s) => s.state === "ready"), "persisted recovery", model.heartbeatMs);
        const after = await fleet(config, "/diagnostic");
        assert(after.every((value, index) => value.activationId !== activations[index].activationId), "Actors were not restarted");
        return drained();
      });
      await phase("loaded-observation", async () => {
        const deadline = Date.now() + 120_000;
        do {
          await costAndResourceGuard();
          await request(fixture, "/replay", { countPerShard: model.guilds, rate: 600, channelUpdates: false });
          lifecycle += model.guilds;
        } while (Date.now() < deadline);
        return drained();
      });
      await phase("drained-observation", async () => {
        const deadline = Date.now() + 90_000;
        do { await drained(); await delay(5_000); } while (Date.now() < deadline);
        return drained();
      });
      const inventory = (await fleet(config, "/inventory")).flatMap(({ entries }) => entries);
      assert.equal(inventory.length, SHARDS);
      for (const entry of inventory) assert.deepEqual(entry.inventory.guildIds, guildIds(entry.status.shardId, Math.floor(model.guilds / SHARDS) + Number(entry.status.shardId < model.guilds % SHARDS)));
      final = await drained();
      report.status = "completed-platform-scenario";
    } catch (error) {
      report.status = "failed";
      report.failure = error.message;
      const observed = lastPoll;
      if (observed) {
        report.lastObservedAt = observed.observedAt;
        report.lastFixture = withoutTokens({ counters: observed.stats?.counters, errors: observed.stats?.errors, diagnostics: observed.stats?.diagnostics, connected: observed.stats?.connected, sequences: observed.stats?.sequences, heartbeatSequences: observed.stats?.heartbeatSequences });
        report.lastGateway = withoutTokens(observed.shards);
      }
    } finally {
      report.endedAt = new Date().toISOString();
      if (final) {
        report.counters = final.stats.counters;
        report.lastStatus = final.shards;
        report.diagnostics = final.stats.diagnostics;
      }
      reports.push(report);
      await save(`${reports.length}-${config.role}-${model.name}.json`, report);
      await stop();
    }
    return report;
  }

  try {
    await stop();
    for (const config of manifest.configs) {
      const stream = createWriteStream(path.join(output, `${config.role}-tail.jsonl`), { mode: 0o600 });
      const parser = spawn("python3", [path.join(root, "tools/gateway-capacity/staging-tail.py")], { env: { ...process.env, BENCHMARK_REDACTIONS: JSON.stringify([accountToken, ...Object.values(secrets)]) }, stdio: ["pipe", "pipe", "pipe"] });
      const child = spawn("npm", ["exec", "--no", "--", "wrangler", "tail", config.name, "--format", "json"], { cwd: root, env: { ...process.env, CLOUDFLARE_API_TOKEN: accountToken, CLOUDFLARE_ACCOUNT_ID: manifest.accountId, CI: "true" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
      const tail = { child, parser, stream, role: config.role, attached: false, failure: false, childDone: new Promise((resolve) => child.once("close", resolve)), parserDone: new Promise((resolve) => parser.once("close", resolve)), streamDone: new Promise((resolve) => stream.once("close", resolve)) };
      child.stdout.pipe(parser.stdin);
      parser.stdout.pipe(stream);
      child.stderr.on("data", (data) => { if (/reconnect|connection lost|error|fatal/i.test(data.toString())) tail.failure = true; });
      parser.stderr.on("data", () => { tail.failure = true; });
      child.on("error", () => { tail.failure = true; });
      parser.on("error", () => { tail.failure = true; });
      parser.stdin.on("error", () => { tail.failure = true; });
      stream.on("error", () => { tail.failure = true; });
      createInterface({ input: parser.stdout }).on("line", (line) => {
        try {
          const event = JSON.parse(line);
          if (event.path === "/health") tail.attached = true;
          if (event.truncated || event.outcome === "exceededMemory" || event.outcome === "exceededCpu") tail.failure = true;
          if (event.exceptions.some(({ message }) => !message.includes("Benchmark persisted restart")) || event.logs.some(({ level, message }) => level === "error" && !message.join(" ").includes("Benchmark persisted restart"))) tail.failure = true;
        } catch { tail.failure = true; }
      });
      tails.push(tail);
    }
    const attachmentDeadline = Date.now() + 30_000;
    while (tails.some(({ attached }) => !attached)) {
      if (Date.now() >= attachmentDeadline || tails.some(({ failure, child, parser }) => failure || child.exitCode !== null || parser.exitCode !== null)) throw new Error("Staging Tail did not attach");
      await Promise.all(manifest.configs.map((config) => request(config, "/health")));
      await delay(500);
    }
    for (const model of profiles) {
      for (const config of gateways.filter(({ role }) => selectedRoles.includes(role))) {
        if (tails.some(({ child }) => child.exitCode !== null)) throw new Error("Staging Tail session ended unexpectedly");
        const result = await profile(config, model);
        if (result.status === "failed") throw new Error(`Platform scenario failed: ${result.failure}`);
      }
    }
    await costAndResourceGuard(true);
    for (const report of reports) {
      const deadline = stagingDeadline(manifest.expiresAt, Date.now());
      let rows = [];
      let previous = "";
      let stable = false;
      const expectedObjects = SHARDS / report.capacity;
      const objectCount = (values) => new Set(values.map(({ dimensions }) => dimensions.objectId)).size;
      const covered = (values) => objectCount(values) === expectedObjects && report.phases.filter(({ name }) => name === "loaded-observation" || name === "drained-observation").every((phase) => objectCount(values.filter(({ dimensions }) => Date.parse(dimensions.datetime) >= Date.parse(phase.start) && Date.parse(dimensions.datetime) <= Date.parse(phase.end))) === expectedObjects);
      try {
        while (Date.now() < deadline) {
          if (tails.some(({ failure }) => failure)) throw new Error("Staging Tail failed during metric collection");
          rows = await graph([report.namespaceId], report.startedAt, report.endedAt);
          const current = JSON.stringify(rows);
          stable = covered(rows) && current === previous;
          if (stable) break;
          previous = current;
          await delay(15_000);
        }
        assert(covered(rows), "Platform samples missing during loaded or drained observation");
        assert(stable, "Platform metrics did not stabilize");
        assert(rows.every(({ sum }) => sum.exceededCpuErrors === 0 && sum.exceededMemoryErrors === 0), "Platform resource errors");
        report.metricsStatus = "reconciled";
        report.metrics = rows;
        report.observedMaximumIsolateBytes = Math.max(...rows.map(({ max }) => max.memoryUsageBytes));
      } catch (error) {
        report.metricsStatus = "unreconciled";
        report.metricsError = error.message;
        report.metricsRows = rows;
        await save(`${reports.indexOf(report) + 1}-${report.role}-${report.model.name}.json`, report);
        throw new Error(`Platform metrics unreconciled: ${error.message}`, { cause: error });
      }
      await save(`${reports.indexOf(report) + 1}-${report.role}-${report.model.name}.json`, report);
    }
  } finally {
    try { await stop(); } catch { cleanupFailed = true; }
    for (const tail of tails) {
      const { child, parser, stream } = tail;
      const bounded = async (promise) => Promise.race([promise.then(() => true), delay(5_000).then(() => false)]);
      try {
        if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, "SIGINT");
      } catch { tail.failure = true; }
      if (!await bounded(tail.childDone)) {
        tail.failure = true;
        try { process.kill(-child.pid, "SIGKILL"); } catch { tail.failure = true; }
      }
      if (!await bounded(tail.parserDone)) { tail.failure = true; parser.kill("SIGKILL"); }
      if (parser.exitCode !== 0) tail.failure = true;
      if (!await bounded(tail.streamDone)) { tail.failure = true; stream.destroy(); }
    }
    await save("manifest.json", { sourceSha: manifest.sourceSha, gatewaySelection, startedAt, endedAt: new Date().toISOString(), maximumBillableRows, cleanupFailed, tailFailures: tails.filter(({ failure }) => failure).map(({ role }) => role), reports });
  }
  if (cleanupFailed) throw new Error("Staging shutdown did not complete");
  if (tails.some(({ failure }) => failure)) throw new Error("Staging Tail evidence is incomplete");
  return reports;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { manifest: { type: "string" }, secrets: { type: "string" }, "account-token-file": { type: "string" }, output: { type: "string" }, profile: { type: "string" }, gateways: { type: "string" } } });
  const models = {
    smoke: { name: "smoke", guilds: 240, channels: 2, heartbeatMs: 1_000, knownGuilds: false },
    warm: { name: "warm", guilds: 24_303, channels: 40, heartbeatMs: 41_250, knownGuilds: true },
    cold: { name: "cold", guilds: 24_303, channels: 40, heartbeatMs: 41_250, knownGuilds: false },
  };
  assert(Object.hasOwn(models, values.profile), "Explicit smoke, warm, or cold profile is required");
  await runStaging({ manifestPath: values.manifest, secretsPath: values.secrets, accountTokenPath: values["account-token-file"], output: values.output, profiles: [models[values.profile]], gatewaySelection: values.gateways });
}
