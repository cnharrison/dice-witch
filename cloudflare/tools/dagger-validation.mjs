import { execFile } from "node:child_process";
import { cp, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { materializeProductionConfigs } from "./production-config.mjs";
import { createProductionPlan } from "./production-plan.mjs";
import {
  loadStagingConfigs,
  validateForbiddenTargets,
  validateStagingConfigs,
} from "./staging-config.mjs";
import { materializeStagingConfigs } from "./staging-config-bundle.mjs";
import { createStagingPlan } from "./staging-plan.mjs";

const execFileAsync = promisify(execFile);
const FULL_SHA = /^[0-9a-f]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PLAN_WORKERS = [
  "discord-rest",
  "data",
  "gateway",
  "roll",
  "interactions",
  "web-api",
];
const DRY_RUN_WORKERS = [
  "data",
  "discord-rest",
  "roll",
  "gateway",
  "interactions",
  "web-api",
];
const CLOUDFLARE_CREDENTIAL_NAMES = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
];
const SECRET_ENVIRONMENT_NAMES = [
  ...CLOUDFLARE_CREDENTIAL_NAMES,
  "PRODUCTION_APPEARANCE_THUMBS_BAKE_SECRET",
  "PRODUCTION_VALUES_B64",
  "STAGING_CONFIG_B64",
  "STAGING_GATEWAY_ORIGIN",
  "STAGING_PRODUCTION_DENYLIST_B64",
  "STAGING_ROLL_ORIGIN",
];

export const PRIVATE_CONFIG_FILES = [
  "wrangler.data.jsonc",
  "wrangler.discord-rest.jsonc",
  "wrangler.gateway.jsonc",
  "wrangler.interactions.jsonc",
  "wrangler.roll.jsonc",
  "wrangler.web-api.jsonc",
];

export function privateDryRunCommands() {
  return DRY_RUN_WORKERS.map((worker) => ({
    worker,
    file: "npx",
    arguments: [
      "--no-install",
      "wrangler",
      "deploy",
      "--dry-run",
      "--config",
      `wrangler.${worker}.jsonc`,
    ],
  }));
}

async function removePrivateConfiguration(configDirectory) {
  await Promise.all(
    PRIVATE_CONFIG_FILES.map((file) =>
      rm(path.join(configDirectory, file), { force: true }),
    ),
  );
}

export async function withPrivateConfiguration(
  configDirectory,
  materialize,
  validate,
) {
  try {
    const result = await materialize();
    return await validate(result);
  } finally {
    await removePrivateConfiguration(configDirectory);
  }
}

function privateChildEnvironment(overrides = {}, allowedNames = []) {
  const allowed = new Set(allowedNames);
  return Object.fromEntries(
    Object.entries({ ...process.env, ...overrides }).filter(
      ([name]) =>
        !SECRET_ENVIRONMENT_NAMES.includes(name) || allowed.has(name),
    ),
  );
}

export function validationChildEnvironment(overrides = {}) {
  return privateChildEnvironment(overrides);
}

export function cloudflareChildEnvironment({ accountId, apiToken }) {
  if (!accountId || !apiToken) {
    throw new Error("Cloudflare deployment credentials are required");
  }
  return privateChildEnvironment(
    {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: apiToken,
    },
    CLOUDFLARE_CREDENTIAL_NAMES,
  );
}

export async function runPrivateCommand(file, arguments_, options, label) {
  try {
    return await execFileAsync(file, arguments_, {
      ...options,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    throw new Error(`${label} failed`);
  }
}

export async function buildFrontend(workspace, summary, environment) {
  await runPrivateCommand(
    "npm",
    ["run", "build"],
    {
      cwd: workspace,
      env: validationChildEnvironment({
        VITE_API_BASE: summary.frontendOrigin,
        VITE_DISCORD_CLIENT_ID: summary.discordApplicationId,
        VITE_ENVIRONMENT: environment,
        VITE_BUILD_SHA: summary.buildSha,
      }),
    },
    `${environment} frontend build`,
  );
}

export async function dryRunPrivateWorkers(configDirectory, environment) {
  for (const command of privateDryRunCommands()) {
    await runPrivateCommand(
      command.file,
      command.arguments,
      { cwd: configDirectory, env: validationChildEnvironment() },
      `${environment} ${command.worker} Worker dry-run`,
    );
  }
}

async function validateStaging({ sha, buildTime, workspace, configDirectory }) {
  await withPrivateConfiguration(
    configDirectory,
    () =>
      materializeStagingConfigs({
        encodedBundle: process.env.STAGING_CONFIG_B64,
        buildSha: sha,
        buildTime,
        configDirectory,
      }),
    async () => {
      const configs = await loadStagingConfigs(configDirectory);
      const summary = validateStagingConfigs(configs);
      validateForbiddenTargets(
        configs,
        process.env.STAGING_PRODUCTION_DENYLIST_B64,
      );
      createStagingPlan({
        requestedSha: sha,
        workers: PLAN_WORKERS,
        applyMigrations: false,
        allowGatewayDeploy: true,
        productionIsolationVerified: true,
        smokeTargets: {
          rollOrigin: process.env.STAGING_ROLL_ORIGIN,
          gatewayOrigin: process.env.STAGING_GATEWAY_ORIGIN,
        },
        configSummary: summary,
      });
      await buildFrontend(workspace, summary, "staging");
      await dryRunPrivateWorkers(configDirectory, "staging");
    },
  );
}

async function validateProduction({ sha, buildTime, workspace, configDirectory }) {
  await withPrivateConfiguration(
    configDirectory,
    () =>
      materializeProductionConfigs({
        encodedValues: process.env.PRODUCTION_VALUES_B64,
        buildSha: sha,
        buildTime,
        templateDirectory: configDirectory,
        configDirectory,
      }),
    async (summary) => {
      createProductionPlan({
        requestedSha: sha,
        workers: PLAN_WORKERS,
        applyMigrations: false,
        allowGatewayDeploy: true,
        configSummary: summary,
      });
      await buildFrontend(workspace, summary, "production");
      await dryRunPrivateWorkers(configDirectory, "production");
    },
  );
}

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) {
      throw new Error("Dagger validation arguments are invalid");
    }
    values.set(flag, value);
  }
  const environment = values.get("--environment");
  const sha = values.get("--sha");
  const buildTime = values.get("--build-time");
  const source = values.get("--source");
  const workspace = values.get("--workspace");
  const nodeModules = values.get("--node-modules");
  if (
    values.size !== 6 ||
    !["staging", "production"].includes(environment) ||
    !FULL_SHA.test(sha ?? "") ||
    !ISO_TIMESTAMP.test(buildTime ?? "") ||
    Number.isNaN(Date.parse(buildTime)) ||
    source === undefined ||
    workspace === undefined ||
    nodeModules === undefined
  ) {
    throw new Error("Dagger validation arguments are invalid");
  }
  return { environment, sha, buildTime, source, workspace, nodeModules };
}

export async function preparePrivateWorkspace({ source, workspace, nodeModules }) {
  await cp(source, workspace, { recursive: true });
  await symlink(nodeModules, path.join(workspace, "node_modules"));
  return path.join(workspace, "cloudflare");
}

async function main() {
  const input = parseArguments(process.argv.slice(2));
  const configDirectory = await preparePrivateWorkspace(input);
  const validation = {
    ...input,
    configDirectory,
  };
  if (input.environment === "staging") await validateStaging(validation);
  else await validateProduction(validation);
  process.stdout.write(`${input.environment} private validation passed\n`);
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
