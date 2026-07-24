import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  loadStagingConfigs,
  validateForbiddenTargets,
  validateStagingConfigs,
} from "./staging-config.mjs";

const execFileAsync = promisify(execFile);
const DEPLOYMENT_ORDER = [
  "data",
  "discord-rest",
  "roll",
  "gateway",
  "interactions",
  "web-api",
];
const AUDIENCE_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1_000;
const FULL_SHA = /^[0-9a-f]{40}$/;
const CLI_USAGE =
  "Usage: node tools/staging-plan.mjs --sha <full-sha> --workers <comma-list> --roll-origin <url> --gateway-origin <url> [--allow-gateway-deploy] [--audience-producer-only]";

function configFile(worker) {
  return `wrangler.${worker}.jsonc`;
}

function command(run, arguments_, extra = {}) {
  return { run, arguments: arguments_, ...extra };
}

function requireHttpsOrigin(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`${name} must be an HTTPS origin`);
  }
  return url.origin;
}

function smokeOrigins(configSummary, targets) {
  return {
    web: configSummary.frontendOrigin,
    roll: requireHttpsOrigin("roll smoke origin", targets?.rollOrigin),
    gateway: requireHttpsOrigin("gateway smoke origin", targets?.gatewayOrigin),
  };
}

function audienceSnapshotGateCommand() {
  return command("node", [
    "tools/verify-audience-snapshot.mjs",
    "--config",
    configFile("data"),
    "--max-age-ms",
    String(AUDIENCE_SNAPSHOT_MAX_AGE_MS),
  ]);
}

function qualityGateCommands(configSummary) {
  const commands = [
    command("npm", ["ci"]),
    command("npm", ["audit", "--audit-level=high"]),
    command("npm", ["run", "type-check"]),
    command("npm", ["run", "lint:ci"]),
    command("npm", ["test"]),
    command("npm", ["run", "build"], {
      environment: {
        VITE_API_BASE: configSummary.frontendOrigin,
        VITE_DISCORD_CLIENT_ID: configSummary.discordApplicationId,
        VITE_ENVIRONMENT: "staging",
        VITE_BUILD_SHA: configSummary.buildSha,
      },
    }),
  ];
  for (const worker of DEPLOYMENT_ORDER) {
    commands.push(
      command("npx", [
        "--no-install",
        "wrangler",
        "deploy",
        "--dry-run",
        "--config",
        configFile(worker),
      ]),
    );
  }
  return commands;
}

export function createStagingPlan(input) {
  if (!FULL_SHA.test(input?.requestedSha ?? "")) {
    throw new Error("Requested source SHA must be a full 40-character commit SHA");
  }
  if (input.requestedSha !== input.headSha) {
    throw new Error(
      `Requested source SHA ${input.requestedSha} does not match HEAD ${input.headSha}`,
    );
  }
  if (input.gitStatus.trim() !== "") {
    throw new Error("Staging deployment worktree must be clean");
  }
  if (!Array.isArray(input.workers) || input.workers.length === 0) {
    throw new Error("At least one staging Worker must be selected");
  }
  const selected = new Set(input.workers);
  for (const worker of selected) {
    if (!DEPLOYMENT_ORDER.includes(worker)) {
      throw new Error(`Unknown staging Worker: ${worker}`);
    }
  }
  const audienceProducerOnly = input.audienceProducerOnly === true;
  if (audienceProducerOnly) {
    const expected = ["data", "discord-rest", "gateway"];
    if (
      selected.size !== expected.length ||
      !expected.every((worker) => selected.has(worker))
    ) {
      throw new Error(
        "Audience producer rollout requires exactly data, discord-rest, and gateway",
      );
    }
  } else if (!selected.has("web-api")) {
    throw new Error("Every staging deployment must include web-api for exact-SHA metadata");
  }
  if (selected.has("roll") && !selected.has("discord-rest")) {
    throw new Error(
      "Roll deployment requires the compatible Discord REST Worker",
    );
  }
  if (selected.has("roll") && !selected.has("gateway")) {
    throw new Error("Roll deployment requires the compatible Gateway Worker");
  }
  if (
    !audienceProducerOnly &&
    selected.has("web-api") &&
    (!selected.has("roll") || !selected.has("discord-rest"))
  ) {
    throw new Error(
      "Web API deployment requires compatible Roll and Discord REST Workers",
    );
  }
  if (selected.has("gateway") && input.allowGatewayDeploy !== true) {
    throw new Error("Gateway deployment requires --allow-gateway-deploy");
  }
  if (input.productionIsolationVerified !== true) {
    throw new Error("Production-target isolation must be verified");
  }
  if (typeof input.configSummary !== "object" || input.configSummary === null) {
    throw new Error("Validated staging configuration summary is required");
  }
  if (input.configSummary.buildSha !== input.requestedSha) {
    throw new Error("Web API BUILD_SHA must match the requested source SHA");
  }

  const workers = DEPLOYMENT_ORDER.filter((worker) => selected.has(worker));
  const origins = audienceProducerOnly
    ? null
    : smokeOrigins(input.configSummary, input.smokeTargets);
  const steps = [
    {
      kind: "quality-gate",
      commands: qualityGateCommands(input.configSummary),
    },
    {
      kind: "migration-list",
      command: command("npx", [
        "--no-install",
        "wrangler",
        "d1",
        "migrations",
        "list",
        "DATA",
        "--remote",
        "--config",
        configFile("data"),
      ]),
    },
    {
      kind: "migration-apply",
      approvalRequired: true,
      mutation: true,
      command: command("npx", [
        "--no-install",
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "DATA",
        "--remote",
        "--config",
        configFile("data"),
      ]),
    },
  ];
  if (!audienceProducerOnly) {
    steps.push({
      kind: "audience-snapshot-gate",
      command: audienceSnapshotGateCommand(),
    });
  }
  for (const worker of workers) {
    steps.push({
      kind: "deploy",
      worker,
      approvalRequired: true,
      mutation: true,
      command: command("npx", [
        "--no-install",
        "wrangler",
        "deploy",
        "--config",
        configFile(worker),
      ]),
    });
  }
  if (audienceProducerOnly) {
    steps.push({ kind: "await-audience-snapshot" });
  } else {
    steps.push({
      kind: "smoke-test",
      command: command("node", [
        "tools/staging-smoke.mjs",
        "--web-origin",
        origins.web,
        "--roll-origin",
        origins.roll,
        "--gateway-origin",
        origins.gateway,
        "--expected-sha",
        input.requestedSha,
      ]),
    });
  }

  return {
    version: 2,
    environmentSuffix: input.configSummary.suffix,
    sourceSha: input.requestedSha,
    d1DatabaseName: input.configSummary.d1DatabaseName,
    workers,
    gatewayDeploymentAcknowledged: selected.has("gateway"),
    audienceProducerOnly,
    steps,
  };
}

function parseArguments(arguments_) {
  let requestedSha;
  let workers;
  let rollOrigin;
  let gatewayOrigin;
  let allowGatewayDeploy = false;
  let audienceProducerOnly = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--allow-gateway-deploy") {
      allowGatewayDeploy = true;
      continue;
    }
    if (argument === "--audience-producer-only") {
      audienceProducerOnly = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (
      ["--sha", "--workers", "--roll-origin", "--gateway-origin"].includes(
        argument,
      ) &&
      value
    ) {
      if (argument === "--sha") requestedSha = value;
      else if (argument === "--workers") {
        workers = value.split(",").filter(Boolean);
      } else if (argument === "--roll-origin") rollOrigin = value;
      else gatewayOrigin = value;
      index += 1;
      continue;
    }
    throw new Error(CLI_USAGE);
  }
  if (
    requestedSha === undefined ||
    workers === undefined ||
    rollOrigin === undefined ||
    gatewayOrigin === undefined
  ) {
    throw new Error(CLI_USAGE);
  }
  return {
    requestedSha,
    workers,
    allowGatewayDeploy,
    audienceProducerOnly,
    smokeTargets: { rollOrigin, gatewayOrigin },
  };
}

async function git(repositoryRoot, ...arguments_) {
  const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, ...arguments_]);
  return stdout.trimEnd();
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const cloudflareRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const repositoryRoot = path.resolve(cloudflareRoot, "..");
  const configs = await loadStagingConfigs(cloudflareRoot);
  const configSummary = validateStagingConfigs(configs);
  validateForbiddenTargets(
    configs,
    process.env.STAGING_PRODUCTION_DENYLIST_B64,
  );
  const plan = createStagingPlan({
    ...arguments_,
    productionIsolationVerified: true,
    headSha: await git(repositoryRoot, "rev-parse", "HEAD"),
    gitStatus: await git(repositoryRoot, "status", "--porcelain"),
    configSummary,
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
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
