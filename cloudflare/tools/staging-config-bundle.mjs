import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateStagingConfigs } from "./staging-config.mjs";

const WORKERS = [
  "data",
  "discord-rest",
  "gateway",
  "interactions",
  "roll",
  "web-api",
];
const MAX_BUNDLE_BYTES = 64 * 1024;
const FULL_SHA = /^[0-9a-f]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ROLL_LIFECYCLE_TELEMETRY_VERSION = "1";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBundle(encodedBundle) {
  if (
    typeof encodedBundle !== "string" ||
    encodedBundle.length === 0 ||
    encodedBundle.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encodedBundle)
  ) {
    throw new Error("Staging configuration bundle is invalid");
  }
  const decoded = Buffer.from(encodedBundle, "base64");
  if (decoded.byteLength > MAX_BUNDLE_BYTES) {
    throw new Error("Staging configuration bundle exceeds 64 KiB");
  }
  let bundle;
  try {
    bundle = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("Staging configuration bundle is invalid");
  }
  if (!isRecord(bundle)) {
    throw new Error("Staging configuration bundle is invalid");
  }
  if (Object.keys(bundle).sort().join(",") !== [...WORKERS].sort().join(",")) {
    throw new Error(
      "Staging configuration bundle must contain exactly the six staging Worker configs",
    );
  }
  for (const worker of WORKERS) {
    if (!isRecord(bundle[worker])) {
      throw new Error(`${worker} staging configuration must be an object`);
    }
  }
  return bundle;
}

function applyReleaseConfiguration(configs) {
  if (!isRecord(configs.interactions.vars)) {
    throw new Error("Interactions staging vars are required");
  }
  if (!Array.isArray(configs.roll.services)) {
    throw new Error("Roll staging services are required");
  }

  configs.interactions.vars.ROLL_LIFECYCLE_TELEMETRY_VERSION =
    ROLL_LIFECYCLE_TELEMETRY_VERSION;
  configs.interactions.observability = {
    enabled: true,
    logs: { invocation_logs: true, head_sampling_rate: 1 },
  };

  const messageProbe = configs.roll.services.find(
    ({ binding }) => binding === "DISCORD_MESSAGE_PROBE",
  );
  if (messageProbe === undefined) {
    configs.roll.services.push({
      binding: "DISCORD_MESSAGE_PROBE",
      service: configs["discord-rest"].name,
      entrypoint: "DiscordMessageProbeService",
    });
  }
}

export async function materializeStagingConfigs({
  encodedBundle,
  buildSha,
  buildTime,
  configDirectory,
  validate = validateStagingConfigs,
}) {
  if (!FULL_SHA.test(buildSha ?? "")) {
    throw new Error("Staging build SHA must be a full commit SHA");
  }
  if (
    !ISO_TIMESTAMP.test(buildTime ?? "") ||
    Number.isNaN(Date.parse(buildTime))
  ) {
    throw new Error("Staging build time must be an ISO 8601 timestamp");
  }
  const configs = decodeBundle(encodedBundle);
  applyReleaseConfiguration(configs);
  if (!isRecord(configs["web-api"].vars)) {
    throw new Error("Web API staging vars are required");
  }
  configs["web-api"].vars.ENVIRONMENT = "staging";
  configs["web-api"].vars.BUILD_SHA = buildSha;
  configs["web-api"].vars.BUILD_TIME = buildTime;
  validate(configs);

  await mkdir(configDirectory, { recursive: true });
  const temporaryDirectory = path.join(
    configDirectory,
    `.staging-config-${process.pid}`,
  );
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { mode: 0o700 });
  try {
    for (const worker of WORKERS) {
      await writeFile(
        path.join(temporaryDirectory, `wrangler.${worker}.jsonc`),
        `${JSON.stringify(configs[worker], null, 2)}\n`,
        { mode: 0o600 },
      );
    }
    for (const worker of WORKERS) {
      await rename(
        path.join(temporaryDirectory, `wrangler.${worker}.jsonc`),
        path.join(configDirectory, `wrangler.${worker}.jsonc`),
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const [flag, value, ...extra] = process.argv.slice(2);
  if (flag !== "--config-dir" || value === undefined || extra.length !== 0) {
    throw new Error(
      "Usage: node tools/staging-config-bundle.mjs --config-dir <directory>",
    );
  }
  await materializeStagingConfigs({
    encodedBundle: process.env.STAGING_CONFIG_B64,
    buildSha: process.env.STAGING_BUILD_SHA,
    buildTime: process.env.STAGING_BUILD_TIME,
    configDirectory: path.resolve(value),
  });
  process.stdout.write("Staging configuration materialized and validated.\n");
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
