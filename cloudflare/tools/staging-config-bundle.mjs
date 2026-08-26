import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
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
const ROLL_LIFECYCLE_TELEMETRY_VERSION = "2";

const BundleSchema = z.record(z.string(), z.json());

function isRecord(value) {
  return z.object({}).passthrough().safeParse(value).success;
}

function decodeBundle(value) {
  const encodedBundle = z.string().safeParse(value);
  if (
    !encodedBundle.success ||
    encodedBundle.data.length === 0 ||
    encodedBundle.data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encodedBundle.data)
  ) {
    throw new Error("Staging configuration bundle is invalid");
  }
  const decoded = Buffer.from(encodedBundle.data, "base64");
  if (decoded.byteLength > MAX_BUNDLE_BYTES) {
    throw new Error("Staging configuration bundle exceeds 64 KiB");
  }
  let bundle;
  try {
    bundle = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("Staging configuration bundle is invalid");
  }
  const parsedBundle = BundleSchema.safeParse(bundle);
  if (!parsedBundle.success) {
    throw new Error("Staging configuration bundle is invalid");
  }
  bundle = parsedBundle.data;
  if (Object.keys(bundle).sort().join(",") !== [...WORKERS].sort().join(",")) {
    throw new Error(
      "Staging configuration bundle must contain exactly the six staging Worker configs",
    );
  }
  for (const worker of WORKERS) {
    if (!z.object({}).passthrough().safeParse(bundle[worker]).success) {
      throw new Error(`${worker} staging configuration must be an object`);
    }
  }
  return bundle;
}

// Structural web-api bindings are repo-owned so a stale secret bundle can
// never deploy without the thumbnail pipeline wiring.
function applyAppearanceThumbsConfiguration(config) {
  const runWorkerFirst = new Set(config.assets?.run_worker_first ?? []);
  runWorkerFirst.add("/api/*");
  runWorkerFirst.add("/interactions");
  runWorkerFirst.add("/thumbs/*");
  config.assets = { ...config.assets, run_worker_first: [...runWorkerFirst] };
  const buckets = config.r2_buckets ?? [];
  if (!buckets.some(({ binding }) => binding === "THUMBS")) {
    buckets.push({
      binding: "THUMBS",
      bucket_name: "dice-witch-appearance-thumbs-staging",
    });
  }
  config.r2_buckets = buckets;
  const secrets = config.secrets_store_secrets ?? [];
  // Staging web-api keeps its Discord client secret outside the bundle; only
  // the bake secret is wired here.
  if (
    !secrets.some(({ binding }) => binding === "APPEARANCE_THUMBS_BAKE_SECRET")
  ) {
    secrets.push({
      binding: "APPEARANCE_THUMBS_BAKE_SECRET",
      store_id: "68e7aff3814e40d0afbcf2a9f4357d8f",
      secret_name: "DICE_WITCH_STAGING_APPEARANCE_THUMBS_BAKE_SECRET",
    });
  }
  config.secrets_store_secrets = secrets;
}

function applyReleaseConfiguration(configs) {
  if (!isRecord(configs.interactions.vars)) {
    throw new Error("Interactions staging vars are required");
  }
  if (!isRecord(configs.roll.vars)) {
    throw new Error("Roll staging vars are required");
  }
  const dataVars = configs.data.vars;
  if (dataVars !== undefined && !isRecord(dataVars)) {
    throw new Error("Data staging vars must be an object when present");
  }
  if (!isRecord(configs["web-api"].vars)) {
    throw new Error("Web API staging vars are required");
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
  configs.data.vars = {
    ...dataVars,
    APPEARANCE_CATALOG_POLICY: "r37",
  };
  configs.roll.vars.ROLL_VIEW_POLICY = "r41";
  configs["web-api"].vars.APPEARANCE_CATALOG_POLICY = "r37";

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
  configs["web-api"].vars.ENVIRONMENT = "staging";
  configs["web-api"].vars.BUILD_SHA = buildSha;
  configs["web-api"].vars.BUILD_TIME = buildTime;
  applyAppearanceThumbsConfiguration(configs["web-api"]);
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
