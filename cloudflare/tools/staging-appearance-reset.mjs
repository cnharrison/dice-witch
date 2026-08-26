import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  canonicalizePrivateJsonPath,
  createPrivateJsonEvidenceFile,
} from "./private-json-evidence.mjs";
import {
  loadStagingConfigs,
  validateForbiddenTargets,
  validateStagingConfigs,
} from "./staging-config.mjs";

const execFileAsync = promisify(execFile);
const FULL_SHA = /^[0-9a-f]{40}$/;
const ACCOUNT_ID = /^[0-9a-f]{32}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLI_USAGE =
  "Usage: node tools/staging-appearance-reset.mjs (--dry-run | --apply) --environment <staging|poc> --account-id <account-id> --database-id <database-id> --sha <full-sha> --evidence <absolute-private-json-path> [--confirm <typed-confirmation>]";
const PROFILE_TABLES = [
  "user_appearance_profiles",
  "guild_appearance_profiles",
];

export const COUNT_APPEARANCE_PROFILES_SQL =
  "SELECT (SELECT COUNT(*) FROM user_appearance_profiles) AS user_profiles, " +
  "(SELECT COUNT(*) FROM guild_appearance_profiles) AS guild_profiles;";

export const RESET_APPEARANCE_PROFILES_SQL = [
  COUNT_APPEARANCE_PROFILES_SQL,
  "DELETE FROM user_appearance_profiles;",
  "DELETE FROM guild_appearance_profiles;",
  COUNT_APPEARANCE_PROFILES_SQL,
].join("\n");

function normalized(value) {
  const parsed = z.string().safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : "";
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resetConfirmation(environment, databaseId, sourceSha) {
  return `reset-staging-appearance-profiles:${environment}:${databaseId}:${sourceSha}`;
}

export function canonicalizePrivateEvidencePath(
  evidencePath,
  repositoryRoot,
) {
  return canonicalizePrivateJsonPath(
    evidencePath,
    repositoryRoot,
    "Reset evidence",
  );
}

export function validateStagingAppearanceReset(input) {
  if (input?.mode !== "dry-run" && input?.mode !== "apply") {
    throw new Error("Staging appearance reset mode must be dry-run or apply");
  }
  if (
    input.requestedEnvironment !== "staging" &&
    input.requestedEnvironment !== "poc"
  ) {
    throw new Error("Requested reset environment must be staging or poc");
  }
  if (input.configEnvironment !== "staging") {
    throw new Error("Web API configuration environment must be staging");
  }
  if (input.requestedEnvironment !== input.configSuffix) {
    throw new Error("Requested reset environment does not match the staging fleet");
  }

  const requestedAccountId = normalized(input.requestedAccountId);
  const credentialAccountId = normalized(input.credentialAccountId);
  if (!ACCOUNT_ID.test(requestedAccountId)) {
    throw new Error("Requested Cloudflare account id is invalid");
  }
  if (requestedAccountId !== credentialAccountId) {
    throw new Error("Requested Cloudflare account id does not match credentials");
  }
  if (input.apiTokenAvailable !== true) {
    throw new Error("CLOUDFLARE_API_TOKEN is required for an explicit credential mode");
  }

  const requestedDatabaseId = normalized(input.requestedDatabaseId);
  const configDatabaseId = normalized(input.configDatabaseId);
  if (!UUID.test(requestedDatabaseId)) {
    throw new Error("Requested staging D1 database id is invalid");
  }
  if (requestedDatabaseId !== configDatabaseId) {
    throw new Error("Requested staging D1 database id does not match configuration");
  }
  const databaseName = z.string().safeParse(input.databaseName);
  if (
    !databaseName.success ||
    !databaseName.data.toLowerCase().includes(input.requestedEnvironment)
  ) {
    throw new Error("Staging D1 database name does not match the environment");
  }

  if (!FULL_SHA.test(input.requestedSha ?? "")) {
    throw new Error("Requested source SHA must be a full 40-character commit SHA");
  }
  if (input.requestedSha !== input.headSha) {
    throw new Error("Requested source SHA does not match HEAD");
  }
  if (input.requestedSha !== input.configBuildSha) {
    throw new Error("Requested source SHA does not match staging configuration");
  }
  const gitStatus = z.string().safeParse(input.gitStatus);
  if (!gitStatus.success || gitStatus.data.trim() !== "") {
    throw new Error("Staging appearance reset worktree must be clean");
  }
  if (input.productionIsolationVerified !== true) {
    throw new Error("Production-target isolation must be verified");
  }

  const parsedEvidencePath = z.string().safeParse(input.evidencePath);
  if (
    !parsedEvidencePath.success ||
    !path.isAbsolute(parsedEvidencePath.data) ||
    path.extname(parsedEvidencePath.data) !== ".json"
  ) {
    throw new Error("Reset evidence must use an absolute private JSON path");
  }
  const evidencePath = path.resolve(parsedEvidencePath.data);
  const repositoryRoot = path.resolve(input.repositoryRoot);
  if (isInside(repositoryRoot, evidencePath)) {
    throw new Error("Reset evidence must be stored outside the source repository");
  }

  const confirmation = resetConfirmation(
    input.requestedEnvironment,
    requestedDatabaseId,
    input.requestedSha,
  );
  if (input.mode === "apply" && input.confirmation !== confirmation) {
    throw new Error("Staging appearance reset confirmation does not match the exact target");
  }
  if (input.mode === "dry-run" && input.confirmation !== undefined) {
    throw new Error("Dry-run does not accept a mutation confirmation");
  }

  return {
    mode: input.mode,
    environment: input.requestedEnvironment,
    accountId: requestedAccountId,
    databaseId: requestedDatabaseId,
    databaseName: databaseName.data,
    sourceSha: input.requestedSha,
    evidencePath,
    confirmation,
  };
}

function parseWranglerResults(output, expectedLength) {
  let value;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error("Staging appearance reset Wrangler result is invalid");
  }
  const parsed = z.array(
    z.object({ success: z.literal(true) }).passthrough(),
  ).length(expectedLength).safeParse(value);
  if (!parsed.success) {
    throw new Error("Staging appearance reset Wrangler result is invalid");
  }
  return parsed.data;
}

function parseCounts(result) {
  const rows = z.array(z.strictObject({
    user_profiles: z.number().int().nonnegative(),
    guild_profiles: z.number().int().nonnegative(),
  })).length(1).safeParse(result.results);
  if (!rows.success) {
    throw new Error("Staging appearance reset row count result is invalid");
  }
  return {
    userProfiles: rows.data[0].user_profiles,
    guildProfiles: rows.data[0].guild_profiles,
  };
}

function d1ExecuteArguments(configPath, sql, apply) {
  return [
    "d1",
    "execute",
    "DATA",
    "--remote",
    "--config",
    configPath,
    "--command",
    sql,
    "--json",
    ...(apply ? ["--yes"] : []),
  ];
}

export async function executeStagingAppearanceReset({
  mode,
  configPath,
  runWrangler,
}) {
  if (mode === "dry-run") {
    const output = await runWrangler(
      d1ExecuteArguments(configPath, COUNT_APPEARANCE_PROFILES_SQL, false),
    );
    const [countResult] = parseWranglerResults(output, 1);
    return {
      status: "dry-run",
      mutationExecuted: false,
      before: parseCounts(countResult),
      after: null,
      deleted: null,
    };
  }
  if (mode !== "apply") {
    throw new Error("Staging appearance reset mode must be dry-run or apply");
  }

  const output = await runWrangler(
    d1ExecuteArguments(configPath, RESET_APPEARANCE_PROFILES_SQL, true),
  );
  const results = parseWranglerResults(output, 4);
  const before = parseCounts(results[0]);
  const after = parseCounts(results[3]);
  if (after.userProfiles !== 0 || after.guildProfiles !== 0) {
    throw new Error("Staging appearance reset did not empty both profile tables");
  }
  return {
    status: "applied",
    mutationExecuted: true,
    before,
    after,
    deleted: {
      userProfiles: before.userProfiles,
      guildProfiles: before.guildProfiles,
    },
  };
}

export function createResetEvidenceFile(evidencePath, initialEvidence) {
  return createPrivateJsonEvidenceFile(
    evidencePath,
    initialEvidence,
    "Reset evidence",
  );
}

function parseArguments(arguments_) {
  const values = {};
  let mode;
  const seen = new Set();
  const valueFlags = new Set([
    "--environment",
    "--account-id",
    "--database-id",
    "--sha",
    "--evidence",
    "--confirm",
  ]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--dry-run" || argument === "--apply") {
      if (mode !== undefined) throw new Error(CLI_USAGE);
      mode = argument === "--dry-run" ? "dry-run" : "apply";
      continue;
    }
    if (!valueFlags.has(argument) || seen.has(argument)) {
      throw new Error(CLI_USAGE);
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(CLI_USAGE);
    }
    seen.add(argument);
    values[argument] = value;
    index += 1;
  }
  for (const required of [
    "--environment",
    "--account-id",
    "--database-id",
    "--sha",
    "--evidence",
  ]) {
    if (!(required in values)) throw new Error(CLI_USAGE);
  }
  if (mode === undefined) throw new Error(CLI_USAGE);
  return {
    mode,
    requestedEnvironment: values["--environment"],
    requestedAccountId: values["--account-id"],
    requestedDatabaseId: values["--database-id"],
    requestedSha: values["--sha"],
    evidencePath: values["--evidence"],
    confirmation: values["--confirm"],
  };
}

async function git(repositoryRoot, ...arguments_) {
  const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, ...arguments_]);
  return stdout.trimEnd();
}

async function main() {
  const parsedArguments = parseArguments(process.argv.slice(2));
  const cloudflareRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const repositoryRoot = path.resolve(cloudflareRoot, "..");
  const arguments_ = {
    ...parsedArguments,
    evidencePath: await canonicalizePrivateEvidencePath(
      parsedArguments.evidencePath,
      repositoryRoot,
    ),
  };
  const configs = await loadStagingConfigs(cloudflareRoot);
  const configSummary = validateStagingConfigs(configs);
  validateForbiddenTargets(
    configs,
    process.env.STAGING_PRODUCTION_DENYLIST_B64,
  );
  const database = configs.data.d1_databases[0];
  const target = validateStagingAppearanceReset({
    ...arguments_,
    configEnvironment: configs["web-api"].vars.ENVIRONMENT,
    configSuffix: configSummary.suffix,
    credentialAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    configDatabaseId: database.database_id,
    databaseName: database.database_name,
    headSha: await git(repositoryRoot, "rev-parse", "HEAD"),
    configBuildSha: configSummary.buildSha,
    gitStatus: await git(repositoryRoot, "status", "--porcelain"),
    apiTokenAvailable:
      z.string().min(1).safeParse(process.env.CLOUDFLARE_API_TOKEN).success,
    productionIsolationVerified: true,
    repositoryRoot,
  });
  const packageJson = JSON.parse(
    await readFile(path.join(cloudflareRoot, "package.json"), "utf8"),
  );
  const wranglerPath = path.join(
    repositoryRoot,
    "node_modules",
    ".bin",
    "wrangler",
  );
  const { stdout: wranglerVersionOutput } = await execFileAsync(wranglerPath, [
    "--version",
  ]);
  const wranglerVersion = wranglerVersionOutput.trim();
  if (wranglerVersion !== packageJson.devDependencies.wrangler) {
    throw new Error("Installed Wrangler version does not match package.json");
  }
  const startedAt = new Date().toISOString();
  const evidenceBase = {
    version: 1,
    operation: "staging-appearance-profile-reset",
    target: {
      environment: target.environment,
      accountId: target.accountId,
      databaseId: target.databaseId,
      databaseName: target.databaseName,
      sourceSha: target.sourceSha,
    },
    tables: PROFILE_TABLES,
    wranglerVersion,
    startedAt,
  };
  const evidence = await createResetEvidenceFile(target.evidencePath, {
    ...evidenceBase,
    status: "started",
    requestedMode: target.mode,
  });
  const runWrangler = async (wranglerArguments) => {
    const { stdout } = await execFileAsync(wranglerPath, wranglerArguments, {
      cwd: cloudflareRoot,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  };

  let outcome;
  try {
    outcome = await executeStagingAppearanceReset({
      mode: target.mode,
      configPath: path.join(cloudflareRoot, "wrangler.data.jsonc"),
      runWrangler,
    });
  } catch (error) {
    await evidence.fail({
      ...evidenceBase,
      status: "failed",
      requestedMode: target.mode,
      mutationExecuted: target.mode === "apply" ? "unknown" : false,
      failure: "staging_appearance_reset_failed",
      completedAt: new Date().toISOString(),
    });
    throw error;
  }

  const completedEvidence = {
    ...evidenceBase,
    ...outcome,
    completedAt: new Date().toISOString(),
  };
  await evidence.complete(completedEvidence);
  process.stdout.write(`${JSON.stringify(completedEvidence, null, 2)}\n`);
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
