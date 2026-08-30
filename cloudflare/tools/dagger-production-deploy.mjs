import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { assertMigrationState } from "./assert-migration-state.mjs";
import {
  buildFrontend,
  cloudflareChildEnvironment,
  dryRunPrivateWorkers,
  preparePrivateWorkspace,
  runPrivateCommand,
  validationChildEnvironment,
  withPrivateConfiguration,
} from "./dagger-validation.mjs";
import { materializeProductionConfigs } from "./production-config.mjs";
import { createProductionPlan } from "./production-plan.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PRODUCTION_ACCOUNT_ID = "dfe6c3ddb987a22c7f17955d1973490e";
const ACTIVE_VERIFICATION_ATTEMPTS = 6;
const ACTIVE_VERIFICATION_RETRY_MS = 2_000;
const DeploymentsSchema = z.array(z.object({
  created_on: z.string().min(1),
  versions: z.array(z.object({
    percentage: z.number(),
    version_id: z.string().min(1),
  })),
})).min(1);
const WORKERS = [
  "discord-rest",
  "data",
  "gateway",
  "roll",
  "interactions",
  "web-api",
];

function accountCommand() {
  return {
    kind: "account-check",
    file: "npx",
    arguments: [
      "--no-install",
      "wrangler",
      "deployments",
      "list",
      "--name",
      "dice-witch-data-production",
      "--json",
    ],
  };
}

function migrationCommand(kind) {
  const action = kind === "migration-apply" ? "apply" : "list";
  return {
    kind,
    file: "npx",
    arguments: [
      "--no-install",
      "wrangler",
      "d1",
      "migrations",
      action,
      "DATA",
      "--remote",
      "--config",
      "wrangler.data.jsonc",
    ],
  };
}

function audienceCommand() {
  return {
    kind: "audience-check",
    file: "node",
    arguments: [
      "tools/verify-audience-snapshot.mjs",
      "--config",
      "wrangler.data.jsonc",
      "--max-age-ms",
      "43200000",
    ],
  };
}

function deploymentCommand(worker, sha) {
  return {
    kind: "deploy",
    worker,
    file: "npx",
    arguments: [
      "--no-install",
      "wrangler",
      "deploy",
      "--strict",
      "--tag",
      `production-${sha.slice(0, 12)}`,
      "--message",
      `Production ${sha}`,
      "--config",
      `wrangler.${worker}.jsonc`,
    ],
  };
}

function activeDeploymentsCommand(worker) {
  return {
    kind: "active-deployments",
    worker,
    json: true,
    file: "npx",
    arguments: [
      "--no-install",
      "wrangler",
      "deployments",
      "list",
      "--name",
      `dice-witch-${worker}-production`,
      "--json",
    ],
  };
}

function activeVersionCommand(worker, versionId) {
  return {
    kind: "active-version",
    worker,
    json: true,
    file: "npx",
    arguments: [
      "--no-install",
      "wrangler",
      "versions",
      "view",
      versionId,
      "--name",
      `dice-witch-${worker}-production`,
      "--json",
    ],
  };
}

function smokeCommand(sha) {
  return {
    kind: "smoke-test",
    file: "node",
    arguments: [
      "tools/production-smoke.mjs",
      "--web-origin",
      "https://dicewit.ch",
      "--expected-sha",
      sha,
    ],
  };
}

export function activeVersionId(output) {
  let deployments;
  try {
    deployments = DeploymentsSchema.parse(JSON.parse(output));
  } catch {
    throw new Error("Production deployments lookup returned invalid JSON");
  }
  const latest = deployments
    .toSorted((left, right) => left.created_on.localeCompare(right.created_on))
    .at(-1);
  const active = latest?.versions?.filter(({ percentage }) => percentage === 100) ?? [];
  const versionId = active[0]?.version_id;
  if (active.length !== 1 || versionId === undefined) {
    throw new Error("Expected exactly one active production version");
  }
  return versionId;
}

async function verifyActiveWorker({
  worker,
  sha,
  configDirectory,
  runRemote,
  verifyActive,
  wait,
}) {
  for (let attempt = 1; attempt <= ACTIVE_VERIFICATION_ATTEMPTS; attempt += 1) {
    try {
      const deployments = await runRemote(
        activeDeploymentsCommand(worker),
        configDirectory,
      );
      const versionId = activeVersionId(deployments);
      const versionJson = await runRemote(
        activeVersionCommand(worker, versionId),
        configDirectory,
      );
      await verifyActive({ worker, versionJson, sha }, configDirectory);
      return;
    } catch (error) {
      if (attempt === ACTIVE_VERIFICATION_ATTEMPTS) throw error;
      await wait(ACTIVE_VERIFICATION_RETRY_MS);
    }
  }
}

export async function executeProductionPlan({
  plan,
  configDirectory,
  runRemote,
  verifyActive,
  runLocal,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  let mutationStarted = false;
  let migrationPhase = "not-started";
  let workerAttempt = "none";
  let activeObservation = "none";
  const deployedWorkers = [];
  const verifiedWorkers = [];

  try {
    await runRemote(accountCommand(), configDirectory);
    const initialMigrations = await runRemote(
      migrationCommand("migration-list"),
      configDirectory,
    );
    const pending = assertMigrationState({
      output: initialMigrations,
      applyMigrations: plan.applyMigrations,
    });
    if (pending === 1) {
      mutationStarted = true;
      migrationPhase = "apply-started-unverified";
      await runRemote(migrationCommand("migration-apply"), configDirectory);
      migrationPhase = "apply-completed-unverified";
    }

    const currentMigrations = await runRemote(
      migrationCommand("migration-list"),
      configDirectory,
    );
    assertMigrationState({ output: currentMigrations, applyMigrations: false });
    const migrationApplied = pending === 1;
    migrationPhase = "verified-current";

    await runRemote(audienceCommand(), configDirectory);

    for (const worker of plan.workers) {
      mutationStarted = true;
      workerAttempt = `${worker}-started-unverified`;
      await runRemote(deploymentCommand(worker, plan.sourceSha), configDirectory);
      deployedWorkers.push(worker);
      workerAttempt = "none";
    }

    for (const worker of plan.workers) {
      activeObservation = `${worker}-unverified`;
      await verifyActiveWorker({
        worker,
        sha: plan.sourceSha,
        configDirectory,
        runRemote,
        verifyActive,
        wait,
      });
      verifiedWorkers.push(worker);
      activeObservation = "none";
    }

    await runLocal(smokeCommand(plan.sourceSha), configDirectory);
    return { migrationApplied, deployedWorkers, verifiedWorkers };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    if (!mutationStarted) {
      throw new Error(`production deployment failed before mutation: ${message}`, {
        cause: error,
      });
    }
    throw new Error(
      `production deployment failed after mutation began; migrationPhase=${migrationPhase}; workerAttempt=${workerAttempt}; deployedWorkers=${deployedWorkers.join(",")}; activeObservation=${activeObservation}; verifiedWorkers=${verifiedWorkers.join(",")}; inspect active production state before retry`,
      { cause: error },
    );
  }
}

export function validateProductionAccountId(accountId) {
  if (accountId !== PRODUCTION_ACCOUNT_ID) {
    throw new Error("Production Cloudflare account is invalid");
  }
  return accountId;
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function verifyActiveSettings({ worker, versionJson, sha }, configDirectory) {
  const versionPath = path.join(configDirectory, `.active-${worker}-version.json`);
  await writeFile(versionPath, versionJson, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await runPrivateCommand(
      "node",
      [
        "tools/production-active-settings.mjs",
        "--worker",
        worker,
        "--config",
        `wrangler.${worker}.jsonc`,
        "--version-json",
        versionPath,
        "--sha",
        sha,
      ],
      { cwd: configDirectory, env: validationChildEnvironment() },
      `production ${worker} active-settings verification`,
    );
  } finally {
    await rm(versionPath, { force: true });
  }
}

async function deployProduction(input) {
  const configDirectory = await preparePrivateWorkspace(input);
  const credentials = {
    accountId: requireEnvironment("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requireEnvironment("CLOUDFLARE_API_TOKEN"),
  };
  validateProductionAccountId(credentials.accountId);

  return withPrivateConfiguration(
    configDirectory,
    () =>
      materializeProductionConfigs({
        encodedValues: requireEnvironment("PRODUCTION_VALUES_B64"),
        buildSha: input.sha,
        buildTime: input.buildTime,
        templateDirectory: configDirectory,
        configDirectory,
      }),
    async (summary) => {
      const plan = createProductionPlan({
        requestedSha: input.sha,
        workers: WORKERS,
        applyMigrations: input.applyMigrations,
        allowGatewayDeploy: input.allowGatewayDeploy,
        configSummary: summary,
      });

      await buildFrontend(input.workspace, summary, "production");
      await dryRunPrivateWorkers(configDirectory, "production");

      const remoteEnvironment = cloudflareChildEnvironment(credentials);
      return executeProductionPlan({
        plan,
        configDirectory,
        runRemote: async (command, cwd) => {
          const result = await runPrivateCommand(
            command.file,
            command.arguments,
            { cwd, env: remoteEnvironment },
            command.worker
              ? `production ${command.worker} ${command.kind}`
              : `production ${command.kind}`,
          );
          return command.json ? result.stdout : `${result.stdout}\n${result.stderr}`;
        },
        verifyActive: verifyActiveSettings,
        runLocal: async (command, cwd) => {
          await runPrivateCommand(
            command.file,
            command.arguments,
            { cwd, env: validationChildEnvironment() },
            "production smoke test",
          );
        },
      });
    },
  );
}

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) {
      throw new Error("Dagger production deployment arguments are invalid");
    }
    values.set(flag, value);
  }

  const sha = values.get("--sha");
  const buildTime = values.get("--build-time");
  const source = values.get("--source");
  const workspace = values.get("--workspace");
  const nodeModules = values.get("--node-modules");
  const applyMigrations = values.get("--apply-migrations");
  const allowGatewayDeploy = values.get("--allow-gateway-deploy");
  if (
    values.size !== 7 ||
    !FULL_SHA.test(sha ?? "") ||
    !ISO_TIMESTAMP.test(buildTime ?? "") ||
    Number.isNaN(Date.parse(buildTime)) ||
    source === undefined ||
    workspace === undefined ||
    nodeModules === undefined ||
    !["true", "false"].includes(applyMigrations) ||
    !["true", "false"].includes(allowGatewayDeploy)
  ) {
    throw new Error("Dagger production deployment arguments are invalid");
  }

  return {
    sha,
    buildTime,
    source,
    workspace,
    nodeModules,
    applyMigrations: applyMigrations === "true",
    allowGatewayDeploy: allowGatewayDeploy === "true",
  };
}

async function main() {
  const result = await deployProduction(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
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
