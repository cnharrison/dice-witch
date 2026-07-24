import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COUNT_APPEARANCE_PROFILES_SQL,
  RESET_APPEARANCE_PROFILES_SQL,
  canonicalizePrivateEvidencePath,
  createResetEvidenceFile,
  executeStagingAppearanceReset,
  resetConfirmation,
  validateStagingAppearanceReset,
} from "./staging-appearance-reset.mjs";

const sha = "a".repeat(40);
const accountId = "b".repeat(32);
const databaseId = "123e4567-e89b-42d3-a456-426614174000";

function request(overrides = {}) {
  return {
    mode: "dry-run",
    requestedEnvironment: "staging",
    configEnvironment: "staging",
    configSuffix: "staging",
    requestedAccountId: accountId,
    credentialAccountId: accountId,
    requestedDatabaseId: databaseId,
    configDatabaseId: databaseId,
    databaseName: "dice-witch-staging",
    requestedSha: sha,
    headSha: sha,
    configBuildSha: sha,
    gitStatus: "",
    apiTokenAvailable: true,
    productionIsolationVerified: true,
    evidencePath: "/private/evidence/reset.json",
    repositoryRoot: "/workspace/dice-witch",
    ...overrides,
  };
}

function result(results, changes = 0) {
  return { success: true, results, meta: { changes } };
}

function counts(userProfiles, guildProfiles) {
  return [{ user_profiles: userProfiles, guild_profiles: guildProfiles }];
}

test("validates an exact staging reset target and dynamic confirmation", () => {
  const confirmation = resetConfirmation("staging", databaseId, sha);
  const validated = validateStagingAppearanceReset(
    request({ mode: "apply", confirmation }),
  );

  assert.equal(validated.environment, "staging");
  assert.equal(validated.accountId, accountId);
  assert.equal(validated.databaseId, databaseId);
  assert.equal(validated.sourceSha, sha);
  assert.equal(validated.confirmation, confirmation);
});

test("rejects ambiguous, production-adjacent, or uncredentialed targets", () => {
  const invalid = [
    { requestedEnvironment: "production" },
    { requestedEnvironment: "poc" },
    { configEnvironment: "production" },
    { credentialAccountId: "c".repeat(32) },
    { configDatabaseId: "223e4567-e89b-42d3-a456-426614174000" },
    { configBuildSha: "d".repeat(40) },
    { headSha: "e".repeat(40) },
    { gitStatus: " M cloudflare/package.json" },
    { apiTokenAvailable: false },
    { productionIsolationVerified: false },
    { evidencePath: "/workspace/dice-witch/reset.json" },
  ];
  for (const override of invalid) {
    assert.throws(() => validateStagingAppearanceReset(request(override)));
  }

  assert.throws(
    () =>
      validateStagingAppearanceReset(
        request({
          mode: "apply",
          confirmation: "reset-staging-appearance-profiles",
        }),
      ),
    /confirmation does not match/,
  );
});

test("dry-run reads bounded row counts without issuing a delete", async () => {
  const calls = [];
  const outcome = await executeStagingAppearanceReset({
    mode: "dry-run",
    configPath: "/private/wrangler.data.jsonc",
    runWrangler: async (arguments_) => {
      calls.push(arguments_);
      return JSON.stringify([result(counts(7, 5))]);
    },
  });

  assert.deepEqual(outcome, {
    status: "dry-run",
    mutationExecuted: false,
    before: { userProfiles: 7, guildProfiles: 5 },
    after: null,
    deleted: null,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][calls[0].indexOf("--command") + 1], COUNT_APPEARANCE_PROFILES_SQL);
  assert.doesNotMatch(calls[0].join(" "), /DELETE/i);
});

test("apply deletes exactly both profile tables in one remote operation", async () => {
  const calls = [];
  const outcome = await executeStagingAppearanceReset({
    mode: "apply",
    configPath: "/private/wrangler.data.jsonc",
    runWrangler: async (arguments_) => {
      calls.push(arguments_);
      return JSON.stringify([
        result(counts(7, 5)),
        result([], 7),
        result([], 5),
        result(counts(0, 0)),
      ]);
    },
  });

  assert.deepEqual(outcome, {
    status: "applied",
    mutationExecuted: true,
    before: { userProfiles: 7, guildProfiles: 5 },
    after: { userProfiles: 0, guildProfiles: 0 },
    deleted: { userProfiles: 7, guildProfiles: 5 },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][calls[0].indexOf("--command") + 1], RESET_APPEARANCE_PROFILES_SQL);
  assert.deepEqual(
    [...RESET_APPEARANCE_PROFILES_SQL.matchAll(/DELETE FROM ([a-z_]+)/g)].map(
      ([, table]) => table,
    ),
    ["user_appearance_profiles", "guild_appearance_profiles"],
  );
});

test("apply fails closed on malformed results or non-empty after counts", async () => {
  await assert.rejects(
    executeStagingAppearanceReset({
      mode: "apply",
      configPath: "/private/wrangler.data.jsonc",
      runWrangler: async () => JSON.stringify([result(counts(1, 1))]),
    }),
    /result is invalid/,
  );
  await assert.rejects(
    executeStagingAppearanceReset({
      mode: "apply",
      configPath: "/private/wrangler.data.jsonc",
      runWrangler: async () =>
        JSON.stringify([
          result(counts(1, 1)),
          result([], 1),
          result([], 1),
          result(counts(1, 0)),
        ]),
    }),
    /did not empty both profile tables/,
  );
});

test("evidence path canonicalization rejects a symlink back into the repository", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dw-reset-path-"));
  const repositoryRoot = path.join(directory, "repository");
  const linkedRepository = path.join(directory, "private-link");
  try {
    await mkdir(repositoryRoot);
    await symlink(repositoryRoot, linkedRepository, "dir");

    await assert.rejects(
      canonicalizePrivateEvidencePath(
        path.join(linkedRepository, "reset.json"),
        repositoryRoot,
      ),
      /outside the source repository/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("evidence is reserved before execution, mode 0600, and never overwritten", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dw-reset-evidence-"));
  const evidencePath = path.join(directory, "reset.json");
  try {
    const evidence = await createResetEvidenceFile(evidencePath, {
      version: 1,
      operation: "staging-appearance-profile-reset",
      status: "started",
    });
    await evidence.complete({
      version: 1,
      operation: "staging-appearance-profile-reset",
      status: "dry-run",
    });

    assert.equal((await stat(evidencePath)).mode & 0o777, 0o600);
    assert.equal(
      JSON.parse(await readFile(evidencePath, "utf8")).status,
      "dry-run",
    );
    await assert.rejects(
      createResetEvidenceFile(evidencePath, { status: "started" }),
      /already exists/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
