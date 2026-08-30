import path from "node:path";
import { pathToFileURL } from "node:url";

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
import {
  loadStagingConfigs,
  validateForbiddenTargets,
  validateStagingConfigs,
} from "./staging-config.mjs";
import { materializeStagingConfigs } from "./staging-config-bundle.mjs";
import { createStagingPlan } from "./staging-plan.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const WORKERS = [
  "discord-rest",
  "data",
  "gateway",
  "roll",
  "interactions",
  "web-api",
];

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
      `staging-${sha.slice(0, 12)}`,
      "--message",
      `Staging ${sha}`,
      "--config",
      `wrangler.${worker}.jsonc`,
    ],
  };
}

function smokeCommand(plan) {
  const smokeSteps = plan.steps.filter(({ kind }) => kind === "smoke-test");
  if (smokeSteps.length !== 1) {
    throw new Error("Staging deployment plan must contain one smoke test");
  }
  return {
    kind: "smoke-test",
    file: smokeSteps[0].command.run,
    arguments: smokeSteps[0].command.arguments,
  };
}

export async function executeStagingPlan({
  plan,
  configDirectory,
  runRemote,
  runLocal,
}) {
  const smoke = smokeCommand(plan);
  let mutationStarted = false;
  let migrationPhase = "not-started";
  const deployedWorkers = [];

  try {
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
    assertMigrationState({
      output: currentMigrations,
      applyMigrations: false,
    });
    const migrationApplied = pending === 1;
    migrationPhase = "verified-current";

    for (const worker of plan.workers) {
      mutationStarted = true;
      await runRemote(deploymentCommand(worker, plan.sourceSha), configDirectory);
      deployedWorkers.push(worker);
    }
    await runLocal(smoke, configDirectory);

    return { migrationApplied, deployedWorkers };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    if (!mutationStarted) {
      throw new Error(`staging deployment failed before mutation: ${message}`, {
        cause: error,
      });
    }
    throw new Error(
      `staging deployment failed after mutation began; migrationPhase=${migrationPhase}; deployedWorkers=${deployedWorkers.join(",")}; inspect active staging state before retry`,
      { cause: error },
    );
  }
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function deployStaging(input) {
  const configDirectory = await preparePrivateWorkspace(input);
  const credentials = {
    accountId: requireEnvironment("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requireEnvironment("CLOUDFLARE_API_TOKEN"),
  };

  return withPrivateConfiguration(
    configDirectory,
    () =>
      materializeStagingConfigs({
        encodedBundle: requireEnvironment("STAGING_CONFIG_B64"),
        buildSha: input.sha,
        buildTime: input.buildTime,
        configDirectory,
      }),
    async () => {
      const configs = await loadStagingConfigs(configDirectory);
      const summary = validateStagingConfigs(configs);
      validateForbiddenTargets(
        configs,
        requireEnvironment("STAGING_PRODUCTION_DENYLIST_B64"),
      );
      const plan = createStagingPlan({
        requestedSha: input.sha,
        workers: WORKERS,
        applyMigrations: input.applyMigrations,
        allowGatewayDeploy: input.allowGatewayDeploy,
        productionIsolationVerified: true,
        smokeTargets: {
          rollOrigin: requireEnvironment("STAGING_ROLL_ORIGIN"),
          gatewayOrigin: requireEnvironment("STAGING_GATEWAY_ORIGIN"),
        },
        configSummary: summary,
      });

      await buildFrontend(input.workspace, summary, "staging");
      await dryRunPrivateWorkers(configDirectory, "staging");

      const remoteEnvironment = cloudflareChildEnvironment(credentials);
      return executeStagingPlan({
        plan,
        configDirectory,
        runRemote: async (command, cwd) => {
          const result = await runPrivateCommand(
            command.file,
            command.arguments,
            { cwd, env: remoteEnvironment },
            command.worker
              ? `staging ${command.worker} deployment`
              : `staging ${command.kind}`,
          );
          return `${result.stdout}\n${result.stderr}`;
        },
        runLocal: async (command, cwd) => {
          await runPrivateCommand(
            command.file,
            command.arguments,
            { cwd, env: validationChildEnvironment() },
            "staging smoke test",
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
      throw new Error("Dagger staging deployment arguments are invalid");
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
    throw new Error("Dagger staging deployment arguments are invalid");
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
  const result = await deployStaging(parseArguments(process.argv.slice(2)));
  process.stdout.write(
    `${JSON.stringify({ status: "passed", ...result })}\n`,
  );
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
