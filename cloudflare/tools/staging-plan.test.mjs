import assert from "node:assert/strict";
import test from "node:test";
import { createStagingPlan } from "./staging-plan.mjs";

const sha = "a".repeat(40);
const applicationWorkers = [
  "discord-rest",
  "gateway",
  "roll",
  "interactions",
  "web-api",
];
const allWorkers = [
  "discord-rest",
  "data",
  "gateway",
  "roll",
  "interactions",
  "web-api",
];
const configSummary = {
  suffix: "staging",
  frontendOrigin: "https://staging.example.com",
  d1DatabaseName: "dice-witch-staging",
  discordApplicationId: "100000000000000001",
  buildSha: sha,
  buildTime: "2026-07-15T12:00:00.000Z",
  workerNames: [
    "dice-witch-data-staging",
    "dice-witch-discord-rest-staging",
    "dice-witch-gateway-staging",
    "dice-witch-interactions-staging",
    "dice-witch-roll-staging",
    "dice-witch-web-api-staging",
  ],
};

function input(overrides = {}) {
  return {
    requestedSha: sha,
    headSha: sha,
    gitStatus: "",
    workers: applicationWorkers,
    applyMigrations: false,
    allowGatewayDeploy: true,
    productionIsolationVerified: true,
    smokeTargets: {
      rollOrigin: "https://roll.example.com",
      gatewayOrigin: "https://gateway.example.com",
    },
    configSummary,
    ...overrides,
  };
}

test("deploys the complete application Worker cohort in dependency order", () => {
  const plan = createStagingPlan(input());

  assert.equal(plan.sourceSha, sha);
  assert.deepEqual(plan.workers, applicationWorkers);
  assert.equal(plan.applyMigrations, false);
  assert.equal(plan.gatewayDeploymentAcknowledged, true);
  assert.deepEqual(
    plan.steps.filter(({ kind }) => kind === "deploy").map(({ worker }) => worker),
    applicationWorkers,
  );
  assert.equal(plan.steps[0].kind, "quality-gate");
  assert.equal(plan.steps[1].kind, "audience-snapshot-gate");
  assert.equal(plan.steps.at(-1).kind, "smoke-test");
});

test("rejects every partial application Worker deployment", () => {
  for (const workers of [
    ["roll", "interactions", "web-api"],
    ["discord-rest", "roll", "interactions", "web-api"],
    ["discord-rest", "gateway", "roll", "web-api"],
  ]) {
    assert.throws(
      () => createStagingPlan(input({ workers })),
      /complete application Worker cohort/,
    );
  }
});

test("deploys Data only as part of the complete migration cohort", () => {
  const plan = createStagingPlan(
    input({ workers: allWorkers, applyMigrations: true }),
  );

  assert.deepEqual(plan.workers, allWorkers);
  assert.equal(plan.applyMigrations, true);
  assert.equal(plan.steps[1].kind, "migration-list");
  assert.equal(plan.steps[2].kind, "migration-apply");
  assert.equal(plan.steps[3].kind, "audience-snapshot-gate");

  assert.throws(
    () =>
      createStagingPlan(
        input({ workers: allWorkers, applyMigrations: false }),
      ),
    /migration authorization must match/,
  );
  assert.throws(
    () => createStagingPlan(input({ applyMigrations: true })),
    /migration authorization must match/,
  );
});

test("requires exact source, valid configuration, isolation, and Gateway acknowledgement", () => {
  assert.throws(
    () => createStagingPlan(input({ requestedSha: "b".repeat(40) })),
    /does not match HEAD/,
  );
  assert.throws(
    () => createStagingPlan(input({ gitStatus: " M cloudflare/package.json" })),
    /worktree must be clean/,
  );
  assert.throws(
    () => createStagingPlan(input({ allowGatewayDeploy: false })),
    /Gateway deployment requires explicit acknowledgement/,
  );
  assert.throws(
    () => createStagingPlan(input({ productionIsolationVerified: false })),
    /Production-target isolation must be verified/,
  );
  assert.throws(
    () =>
      createStagingPlan(
        input({
          configSummary: { ...configSummary, buildSha: "b".repeat(40) },
        }),
      ),
    /BUILD_SHA must match/,
  );
});

test("rejects duplicate, unknown, and empty Worker cohorts", () => {
  assert.throws(
    () => createStagingPlan(input({ workers: [] })),
    /At least one staging Worker/,
  );
  assert.throws(
    () =>
      createStagingPlan(
        input({ workers: [...applicationWorkers, "web-api"] }),
      ),
    /contains duplicates/,
  );
  assert.throws(
    () => createStagingPlan(input({ workers: ["unknown"] })),
    /Unknown staging Worker: unknown/,
  );
});
