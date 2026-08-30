import assert from "node:assert/strict";
import test from "node:test";

import { executeStagingPlan } from "./dagger-staging-deploy.mjs";

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
    steps: [
      {
        kind: "smoke-test",
        command: {
          run: "node",
          arguments: [
            "tools/staging-smoke.mjs",
            "--web-origin",
            "https://staging.example.com",
            "--roll-origin",
            "https://roll.example.com",
            "--gateway-origin",
            "https://gateway.example.com",
            "--expected-sha",
            sha,
          ],
        },
      },
    ],
  };
}

test("executes no-migration staging deployment in guarded cohort order", async () => {
  const remoteCommands = [];
  const localCommands = [];
  const result = await executeStagingPlan({
    plan: plan(),
    configDirectory: "/private/cloudflare",
    runRemote: async (command) => {
      remoteCommands.push(command);
      if (command.kind === "migration-list") return "No migrations to apply!";
      return "";
    },
    runLocal: async (command) => {
      localCommands.push(command);
    },
  });

  assert.deepEqual(
    remoteCommands.map(({ kind, worker }) => worker ?? kind),
    ["migration-list", "migration-list", ...workers],
  );
  for (const command of remoteCommands.filter(({ kind }) => kind === "deploy")) {
    assert.deepEqual(command.arguments.slice(0, 4), [
      "--no-install",
      "wrangler",
      "deploy",
      "--strict",
    ]);
    assert.ok(command.arguments.includes("--tag"));
    assert.ok(command.arguments.includes(`staging-${sha.slice(0, 12)}`));
    assert.ok(command.arguments.includes("--message"));
  }
  assert.equal(localCommands.length, 1);
  assert.equal(localCommands[0].kind, "smoke-test");
  assert.deepEqual(result, {
    migrationApplied: false,
    deployedWorkers: workers,
  });
});

test("applies a pending migration only with plan authorization", async () => {
  const kinds = [];
  let migrationChecks = 0;
  const result = await executeStagingPlan({
    plan: plan(true),
    configDirectory: "/private/cloudflare",
    runRemote: async (command) => {
      kinds.push(command.kind);
      if (command.kind !== "migration-list") return "";
      migrationChecks += 1;
      return migrationChecks === 1
        ? "Migrations to be applied:"
        : "No migrations to apply!";
    },
    runLocal: async () => {},
  });

  assert.deepEqual(kinds.slice(0, 3), [
    "migration-list",
    "migration-apply",
    "migration-list",
  ]);
  assert.equal(result.migrationApplied, true);
});

test("blocks unauthorized pending migrations before mutation", async () => {
  await assert.rejects(
    executeStagingPlan({
      plan: plan(),
      configDirectory: "/private/cloudflare",
      runRemote: async () => "Migrations to be applied:",
      runLocal: async () => {},
    }),
    /failed before mutation: Pending D1 migrations require explicit migration authorization/,
  );
});

test("reports migration application as ambiguous until re-verified", async () => {
  await assert.rejects(
    executeStagingPlan({
      plan: plan(true),
      configDirectory: "/private/cloudflare",
      runRemote: async (command) => {
        if (command.kind === "migration-list") return "Migrations to be applied:";
        throw new Error("migration apply failed");
      },
      runLocal: async () => {},
    }),
    /migrationPhase=apply-started-unverified; deployedWorkers=/,
  );

  let migrationChecks = 0;
  await assert.rejects(
    executeStagingPlan({
      plan: plan(true),
      configDirectory: "/private/cloudflare",
      runRemote: async (command) => {
        if (command.kind !== "migration-list") return "";
        migrationChecks += 1;
        return migrationChecks === 1
          ? "Migrations to be applied:"
          : "unrecognized migration output";
      },
      runLocal: async () => {},
    }),
    /migrationPhase=apply-completed-unverified; deployedWorkers=/,
  );
});

test("reports ambiguous state after Worker mutation and never rolls back automatically", async () => {
  const attempted = [];
  await assert.rejects(
    executeStagingPlan({
      plan: plan(),
      configDirectory: "/private/cloudflare",
      runRemote: async (command) => {
        attempted.push(command.worker ?? command.kind);
        if (command.kind === "migration-list") return "No migrations to apply!";
        if (command.worker === "roll") throw new Error("upload failed");
        return "";
      },
      runLocal: async () => {},
    }),
    /failed after mutation began.*migrationPhase=verified-current; deployedWorkers=discord-rest,data,gateway/,
  );
  assert.deepEqual(attempted, [
    "migration-list",
    "migration-list",
    "discord-rest",
    "data",
    "gateway",
    "roll",
  ]);

  await assert.rejects(
    executeStagingPlan({
      plan: plan(),
      configDirectory: "/private/cloudflare",
      runRemote: async () => {
        throw new Error("list failed");
      },
      runLocal: async () => {},
    }),
    /failed before mutation: list failed/,
  );
});

test("reports smoke failure after the complete cohort was deployed", async () => {
  await assert.rejects(
    executeStagingPlan({
      plan: plan(),
      configDirectory: "/private/cloudflare",
      runRemote: async (command) =>
        command.kind === "migration-list" ? "No migrations to apply!" : "",
      runLocal: async () => {
        throw new Error("smoke failed");
      },
    }),
    new RegExp(
      `migrationPhase=verified-current; deployedWorkers=${workers.join(",")}`,
    ),
  );
});
