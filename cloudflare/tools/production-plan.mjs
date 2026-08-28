import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PRODUCTION_WORKERS,
  validateProductionConfigs,
} from "./production-config.mjs";

const execFileAsync = promisify(execFile);
const FULL_SHA = /^[0-9a-f]{40}$/;
const DEPLOYMENT_ORDER = [
  "discord-rest",
  "data",
  "gateway",
  "roll",
  "interactions",
  "web-api",
];
const CLI_USAGE =
  "Usage: node tools/production-plan.mjs --sha <full-sha> --workers <comma-list> [--apply-migrations] [--allow-gateway-deploy]";

export function validateProductionSource(input) {
  if (!FULL_SHA.test(input?.requestedSha ?? "")) {
    throw new Error("Requested source SHA must be a full 40-character commit SHA");
  }
  if (input.requestedSha !== input.headSha) {
    throw new Error("Requested source SHA does not match HEAD");
  }
  if (input.gitStatus.trim() !== "") {
    throw new Error("Production deployment worktree must be clean");
  }
}

export function createProductionPlan(input) {
  if (!FULL_SHA.test(input?.requestedSha ?? "")) {
    throw new Error("Requested source SHA must be a full 40-character commit SHA");
  }
  if (!Array.isArray(input.workers) || input.workers.length === 0) {
    throw new Error("At least one production Worker must be selected");
  }
  const selected = new Set(input.workers);
  if (selected.size !== input.workers.length) {
    throw new Error("Production Worker selection contains duplicates");
  }
  for (const worker of selected) {
    if (!PRODUCTION_WORKERS.includes(worker)) {
      throw new Error(`Unknown production Worker: ${worker}`);
    }
  }
  if (
    selected.size !== DEPLOYMENT_ORDER.length ||
    DEPLOYMENT_ORDER.some((worker) => !selected.has(worker))
  ) {
    throw new Error("Production deployment must include the complete Worker cohort");
  }
  if (input.allowGatewayDeploy !== true) {
    throw new Error("Gateway deployment requires explicit acknowledgement");
  }
  if (input.configSummary?.buildSha !== input.requestedSha) {
    throw new Error("Validated Web API BUILD_SHA must match the requested SHA");
  }
  if (input.configSummary?.frontendOrigin !== "https://dicewit.ch") {
    throw new Error("Validated production origin is invalid");
  }
  return {
    version: 1,
    sourceSha: input.requestedSha,
    workers: DEPLOYMENT_ORDER.filter((worker) => selected.has(worker)),
    applyMigrations: input.applyMigrations === true,
    gatewayDeploymentAcknowledged: true,
  };
}

function parseArguments(arguments_) {
  let requestedSha;
  let workers;
  let applyMigrations = false;
  let allowGatewayDeploy = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply-migrations") applyMigrations = true;
    else if (argument === "--allow-gateway-deploy") allowGatewayDeploy = true;
    else if (argument === "--sha" || argument === "--workers") {
      const value = arguments_[index + 1];
      if (!value) throw new Error(CLI_USAGE);
      if (argument === "--sha") requestedSha = value;
      else workers = value.split(",").filter(Boolean);
      index += 1;
    } else throw new Error(CLI_USAGE);
  }
  if (requestedSha === undefined || workers === undefined) {
    throw new Error(CLI_USAGE);
  }
  return {
    requestedSha,
    workers,
    applyMigrations,
    allowGatewayDeploy,
  };
}

async function loadConfigs(configDirectory) {
  return Object.fromEntries(
    await Promise.all(
      PRODUCTION_WORKERS.map(async (worker) => [
        worker,
        JSON.parse(
          await readFile(path.join(configDirectory, `wrangler.${worker}.jsonc`), "utf8"),
        ),
      ]),
    ),
  );
}

async function git(repositoryRoot, ...arguments_) {
  const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, ...arguments_]);
  return stdout.trimEnd();
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const cloudflareRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repositoryRoot = path.resolve(cloudflareRoot, "..");
  const configs = await loadConfigs(cloudflareRoot);
  const configSummary = validateProductionConfigs(configs, arguments_.requestedSha);
  const input = {
    ...arguments_,
    headSha: await git(repositoryRoot, "rev-parse", "HEAD"),
    gitStatus: await git(repositoryRoot, "status", "--porcelain"),
    configSummary,
  };
  validateProductionSource(input);
  const plan = createProductionPlan(input);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
