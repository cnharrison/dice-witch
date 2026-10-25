import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";

export const STAGING_NAMES = Object.freeze({ fixture: "dice-witch-gateway-consolidation-fixture", six: "dice-witch-gateway-consolidation-six", candidate: "dice-witch-gateway-consolidation-candidate" });
export function stagingNames(runId) {
  if (!z.string().regex(/^[a-f0-9]{12}$/).safeParse(runId).success) throw new Error("Invalid staging run identity");
  return Object.fromEntries(Object.entries(STAGING_NAMES).map(([role, name]) => [role, `${name}-${runId}`]));
}
export const APPROVED_ACCOUNT = "dfe6c3ddb987a22c7f17955d1973490e";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.resolve("wrangler"));
const { build } = require("esbuild");

function cleanSourceRevision(directory) {
  if (!path.isAbsolute(directory)) throw new Error("Baseline source root must be absolute");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  if (execFileSync("git", ["status", "--porcelain"], { cwd: directory, encoding: "utf8" }).trim()) throw new Error("Baseline source must be a clean checkout");
  return revision;
}

function fixtureDestinationPlugin(gatewaySourceRoot) {
  return { name: "fixture-only-gateway-destinations", setup(builder) {
    builder.onResolve({ filter: /discord-gateway$/ }, (args) => {
      if (!args.importer.startsWith(path.join(gatewaySourceRoot, "workers/gateway/src/"))) return;
      return { path: path.join(root, "tools/gateway-capacity/staging-policy.ts") };
    });
    if (gatewaySourceRoot !== root) builder.onResolve({ filter: /^\./ }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path);
      const prefix = path.join(root, "workers/gateway/src/");
      if (!resolved.startsWith(prefix)) return;
      return { path: path.join(gatewaySourceRoot, "workers/gateway/src", resolved.slice(prefix.length)) + ".ts" };
    });
  } };
}

export async function prepareStaging({ output, accountId, workersSubdomain, sourceSha, expiresAt, purpose, candidateCapacity, externalFixtureHostname, baselineSourceRoot }) {
  if (accountId !== APPROVED_ACCOUNT || !z.string().regex(/^[a-z0-9-]+$/).safeParse(workersSubdomain).success || !/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Explicit approved account, subdomain, and source SHA are required");
  if (!["typecheck", "local-test", "deploy"].includes(purpose)) throw new Error("Explicit preparation purpose is required");
  if (![7, 9].includes(candidateCapacity)) throw new Error("Explicit candidate capacity must be 7 or 9");
  if (externalFixtureHostname !== undefined && !/^[a-z0-9-]+\.trycloudflare\.com$/.test(externalFixtureHostname)) throw new Error("External fixture must use an explicit temporary tunnel hostname");
  const baselineSourceSha = baselineSourceRoot === undefined ? sourceSha : cleanSourceRevision(baselineSourceRoot);
  function verifySource() {
    if (baselineSourceRoot !== undefined && cleanSourceRevision(baselineSourceRoot) !== baselineSourceSha) throw new Error("Baseline source revision changed during preparation");
    if (purpose !== "deploy") return;
    try {
      if (execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() !== sourceSha || execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() !== "") throw new Error("Source revision or working tree differs");
    } catch (cause) {
      throw new Error("Deployment bundles require clean matching committed source", { cause });
    }
  }
  verifySource();
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 58 * 60_000) throw new Error("Benchmark deadline must be within 58 minutes");
  if (!z.string().safeParse(output).success || !path.isAbsolute(output)) throw new Error("Absolute output directory is required");
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length !== 0) throw new Error("Staging output directory must be empty");
  const runId = randomBytes(6).toString("hex");
  const names = stagingNames(runId);
  const hostname = externalFixtureHostname ?? `${names.fixture}.${workersSubdomain}.workers.dev`;
  const configs = [];
  for (const [role, name] of Object.entries(names)) {
    const fixture = role === "fixture";
    const gatewaySourceRoot = role === "six" && baselineSourceRoot ? baselineSourceRoot : root;
    const capacity = role === "six" ? 6 : candidateCapacity;
    const outfile = path.join(output, `${name}.mjs`);
    const result = await build({
      entryPoints: [path.join(root, "tools/gateway-capacity", fixture ? (externalFixtureHostname ? "staging-external-fixture.mjs" : "staging-fixture.mjs") : "staging-gateway.ts")],
      outfile, bundle: true, format: "esm", platform: "browser", target: "es2022", sourcemap: false,
      external: ["cloudflare:workers", "node:*"], metafile: true,
      nodePaths: [path.join(root, "../node_modules")],
      define: { BENCHMARK_FIXTURE_HOSTNAME: JSON.stringify(hostname) },
      plugins: [fixtureDestinationPlugin(gatewaySourceRoot)],
    });
    if (!fixture && !Object.keys(result.metafile.inputs).some((input) => input.endsWith("staging-policy.ts"))) throw new Error("Benchmark destination enforcement is missing from the bundle");
    const config = {
      name, account_id: accountId, main: outfile, no_bundle: true,
      compatibility_date: "2026-07-10",
      compatibility_flags: fixture ? ["nodejs_compat"] : [],
      workers_dev: true, preview_urls: false, routes: [],
      limits: { cpu_ms: 30_000 },
      observability: { enabled: true, head_sampling_rate: 1, logs: { enabled: true, invocation_logs: true, persist: true } },
      vars: { SOURCE_SHA: sourceSha, GATEWAY_SOURCE_SHA: role === "six" ? baselineSourceSha : sourceSha, EXPIRES_AT: String(expiresAt), ...(fixture ? { FIXTURE_HOSTNAME: hostname } : {
        DISCORD_APPLICATION_ID: "100000000000000001",
        GATEWAY_MODE: "fleet", GATEWAY_COORDINATOR_NAME: "development-generation-1",
        GATEWAY_PARTITION_CAPACITY: String(capacity), GATEWAY_FLEET_CONNECTION_CAPACITY: String(capacity),
        GATEWAY_ROLLOUT_MAX_UNAVAILABLE_SHARDS: String(capacity),
        DISCORD_GATEWAY_BOT_URL: `https://${hostname}/bot`, GATEWAY_ALLOWED_HOSTNAME: hostname,
        GATEWAY_QUEUE_CAPACITY: "10000",
      }) },
      durable_objects: { bindings: fixture ? [{ name: "FIXTURE", class_name: "FixtureController" }] : [
        { name: "GATEWAY_COORDINATOR", class_name: "GatewayCoordinator" },
        { name: "GATEWAY_PARTITION", class_name: "GatewayPartition" },
      ] },
      migrations: [{ tag: "memory-benchmark-v1", new_sqlite_classes: fixture ? ["FixtureController"] : ["GatewayCoordinator", "GatewayPartition"] }],
      services: fixture ? [] : [{ binding: "DATA_SERVICE", service: names.fixture, entrypoint: "FixtureData" }, { binding: "DISCORD_REST", service: names.fixture, entrypoint: "FixtureDiscordRest" }],
    };
    const configPath = path.join(output, `${name}.json`);
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    await writeFile(`${outfile}.meta.json`, `${JSON.stringify(result.metafile, null, 2)}\n`);
    const digest = createHash("sha256").update(await readFile(outfile)).digest("hex");
    const configDigest = createHash("sha256").update(await readFile(configPath)).digest("hex");
    configs.push({ role, name, capacity: fixture ? null : capacity, configPath, configDigest, outfile, digest, url: `https://${name}.${workersSubdomain}.workers.dev` });
  }
  verifySource();
  const manifest = { purpose, runId, accountId, sourceSha, baselineSourceSha, expiresAt, hostname, candidateCapacity, maxActiveObjects: 8 + Math.ceil(25 / candidateCapacity), maxLoadSeconds: 3_600, maxAdditionalCostUsd: 25, configs };
  await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { output: { type: "string" }, "account-id": { type: "string" }, "workers-subdomain": { type: "string" }, "source-sha": { type: "string" }, "expires-at": { type: "string" }, purpose: { type: "string" }, "candidate-capacity": { type: "string" }, "external-fixture-hostname": { type: "string" }, "baseline-source-root": { type: "string" } } });
  const manifest = await prepareStaging({ output: values.output, accountId: values["account-id"], workersSubdomain: values["workers-subdomain"], sourceSha: values["source-sha"], expiresAt: Number(values["expires-at"]), purpose: values.purpose, candidateCapacity: Number(values["candidate-capacity"]), externalFixtureHostname: values["external-fixture-hostname"], baselineSourceRoot: values["baseline-source-root"] });
  console.log(JSON.stringify({ sourceSha: manifest.sourceSha, expiresAt: manifest.expiresAt, scripts: manifest.configs.map(({ name }) => name) }));
}
