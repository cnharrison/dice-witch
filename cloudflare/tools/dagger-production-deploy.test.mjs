import assert from "node:assert/strict";
import test from "node:test";

import {
  activeVersionId,
  executeProductionPlan,
  validateProductionAccountId,
} from "./dagger-production-deploy.mjs";

const sha = "a".repeat(40);
const workers = [
  "discord-rest",
  "data",
  "gateway",
  "roll",
  "interactions",
  "web-api",
];

function plan(applyMigrations = false) {
  return {
    sourceSha: sha,
    workers,
    applyMigrations,
  };
}

function deployments(worker) {
  return JSON.stringify([
    {
      created_on: "2026-08-30T00:00:00.000Z",
      versions: [{ percentage: 100, version_id: `version-${worker}` }],
    },
  ]);
}

function successfulRemote(commands) {
  return async (command) => {
    commands.push(command);
    if (command.kind === "migration-list") return "No migrations to apply!";
    if (command.kind === "active-deployments") return deployments(command.worker);
    if (command.kind === "active-version") {
      return JSON.stringify({ id: `version-${command.worker}` });
    }
    return "";
  };
}

test("requires the exact production account and one active latest version", () => {
  assert.equal(
    validateProductionAccountId("dfe6c3ddb987a22c7f17955d1973490e"),
    "dfe6c3ddb987a22c7f17955d1973490e",
  );
  assert.throws(
    () => validateProductionAccountId("another-account"),
    /Production Cloudflare account is invalid/,
  );
  assert.equal(
    activeVersionId(JSON.stringify([
      {
        created_on: "2026-08-29T00:00:00.000Z",
        versions: [{ percentage: 100, version_id: "old" }],
      },
      {
        created_on: "2026-08-30T00:00:00.000Z",
        versions: [{ percentage: 100, version_id: "current" }],
      },
    ])),
    "current",
  );
  assert.throws(
    () => activeVersionId(JSON.stringify([{
      created_on: "2026-08-30T00:00:00.000Z",
      versions: [
        { percentage: 50, version_id: "left" },
        { percentage: 50, version_id: "right" },
      ],
    }])),
    /exactly one active production version/,
  );
});

test("executes the guarded production deployment and verification sequence", async () => {
  const remoteCommands = [];
  const activeVerifications = [];
  const localCommands = [];
  const result = await executeProductionPlan({
    plan: plan(),
    configDirectory: "/private/cloudflare",
    runRemote: successfulRemote(remoteCommands),
    verifyActive: async (input) => activeVerifications.push(input),
    runLocal: async (command) => localCommands.push(command),
  });

  assert.deepEqual(
    remoteCommands.map(({ kind, worker }) => worker ? `${kind}:${worker}` : kind),
    [
      "account-check",
      "migration-list",
      "migration-list",
      "audience-check",
      ...workers.map((worker) => `deploy:${worker}`),
      ...workers.flatMap((worker) => [
        `active-deployments:${worker}`,
        `active-version:${worker}`,
      ]),
    ],
  );
  for (const command of remoteCommands.filter(({ kind }) => kind === "deploy")) {
    assert.deepEqual(command.arguments.slice(0, 4), [
      "--no-install",
      "wrangler",
      "deploy",
      "--strict",
    ]);
    assert.ok(command.arguments.includes(`production-${sha.slice(0, 12)}`));
    assert.ok(command.arguments.includes(`Production ${sha}`));
  }
  assert.deepEqual(
    activeVerifications.map(({ worker, versionJson }) => [worker, JSON.parse(versionJson).id]),
    workers.map((worker) => [worker, `version-${worker}`]),
  );
  assert.equal(localCommands.length, 1);
  assert.equal(localCommands[0].kind, "smoke-test");
  assert.deepEqual(result, {
    migrationApplied: false,
    deployedWorkers: workers,
    verifiedWorkers: workers,
  });
});

test("applies pending migrations only with authorization and re-verifies them", async () => {
  const kinds = [];
  let migrationChecks = 0;
  const result = await executeProductionPlan({
    plan: plan(true),
    configDirectory: "/private/cloudflare",
    runRemote: async (command) => {
      kinds.push(command.kind);
      if (command.kind === "migration-list") {
        migrationChecks += 1;
        return migrationChecks === 1
          ? "Migrations to be applied:"
          : "No migrations to apply!";
      }
      if (command.kind === "active-deployments") return deployments(command.worker);
      if (command.kind === "active-version") return "{}";
      return "";
    },
    verifyActive: async () => {},
    runLocal: async () => {},
  });

  assert.deepEqual(kinds.slice(0, 5), [
    "account-check",
    "migration-list",
    "migration-apply",
    "migration-list",
    "audience-check",
  ]);
  assert.equal(result.migrationApplied, true);
});

test("blocks unauthorized pending migrations before mutation", async () => {
  await assert.rejects(
    executeProductionPlan({
      plan: plan(),
      configDirectory: "/private/cloudflare",
      runRemote: async (command) =>
        command.kind === "migration-list" ? "Migrations to be applied:" : "",
      verifyActive: async () => {},
      runLocal: async () => {},
    }),
    /failed before mutation: Pending D1 migrations require explicit migration authorization/,
  );
});

test("reports migration application as ambiguous until re-verified", async () => {
  await assert.rejects(
    executeProductionPlan({
      plan: plan(true),
      configDirectory: "/private/cloudflare",
      runRemote: async (command) => {
        if (command.kind === "migration-list") return "Migrations to be applied:";
        if (command.kind === "migration-apply") throw new Error("apply failed");
        return "";
      },
      verifyActive: async () => {},
      runLocal: async () => {},
    }),
    /migrationPhase=apply-started-unverified; workerAttempt=none; deployedWorkers=; activeObservation=none; verifiedWorkers=/,
  );

  let migrationChecks = 0;
  await assert.rejects(
    executeProductionPlan({
      plan: plan(true),
      configDirectory: "/private/cloudflare",
      runRemote: async (command) => {
        if (command.kind !== "migration-list") return "";
        migrationChecks += 1;
        return migrationChecks === 1
          ? "Migrations to be applied:"
          : "unrecognized migration output";
      },
      verifyActive: async () => {},
      runLocal: async () => {},
    }),
    /migrationPhase=apply-completed-unverified; workerAttempt=none; deployedWorkers=; activeObservation=none; verifiedWorkers=/,
  );
});

test("reports an attempted Worker as unverified without rollback", async () => {
  const attempted = [];
  await assert.rejects(
    executeProductionPlan({
      plan: plan(),
      configDirectory: "/private/cloudflare",
      runRemote: async (command) => {
        attempted.push(command.worker ?? command.kind);
        if (command.kind === "migration-list") return "No migrations to apply!";
        if (command.worker === "roll") throw new Error("upload failed");
        return "";
      },
      verifyActive: async () => {},
      runLocal: async () => {},
    }),
    /failed after mutation began.*migrationPhase=verified-current; workerAttempt=roll-started-unverified; deployedWorkers=discord-rest,data,gateway; activeObservation=none; verifiedWorkers=/,
  );
  assert.deepEqual(attempted, [
    "account-check",
    "migration-list",
    "migration-list",
    "audience-check",
    "discord-rest",
    "data",
    "gateway",
    "roll",
  ]);
});

test("reports active verification and smoke failures after the full cohort", async () => {
  let gatewayAttempts = 0;
  await assert.rejects(
    executeProductionPlan({
      plan: plan(),
      configDirectory: "/private/cloudflare",
      runRemote: successfulRemote([]),
      verifyActive: async ({ worker }) => {
        if (worker === "gateway") {
          gatewayAttempts += 1;
          throw new Error("settings differ");
        }
      },
      runLocal: async () => {},
      wait: async () => {},
    }),
    new RegExp(
      `workerAttempt=none; deployedWorkers=${workers.join(",")}; activeObservation=gateway-unverified; verifiedWorkers=discord-rest,data`,
    ),
  );
  assert.equal(gatewayAttempts, 6);

  await assert.rejects(
    executeProductionPlan({
      plan: plan(),
      configDirectory: "/private/cloudflare",
      runRemote: successfulRemote([]),
      verifyActive: async () => {},
      runLocal: async () => {
        throw new Error("smoke failed");
      },
    }),
    new RegExp(
      `workerAttempt=none; deployedWorkers=${workers.join(",")}; activeObservation=none; verifiedWorkers=${workers.join(",")}`,
    ),
  );
});
