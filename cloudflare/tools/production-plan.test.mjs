import assert from "node:assert/strict";
import test from "node:test";
import { createProductionPlan } from "./production-plan.mjs";

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
const base = {
  requestedSha: sha,
  headSha: sha,
  gitStatus: "",
  workers: applicationWorkers,
  applyMigrations: false,
  allowGatewayDeploy: true,
  configSummary: { buildSha: sha, frontendOrigin: "https://dicewit.ch" },
};

test("deploys the complete application Worker cohort in dependency order", () => {
  const plan = createProductionPlan(base);
  assert.deepEqual(plan.workers, applicationWorkers);
  assert.equal(plan.applyMigrations, false);
  assert.equal(plan.gatewayDeploymentAcknowledged, true);
});

test("rejects every partial application Worker deployment", () => {
  for (const workers of [
    ["roll", "interactions", "web-api"],
    ["discord-rest", "roll", "interactions", "web-api"],
    ["discord-rest", "gateway", "roll", "web-api"],
  ]) {
    assert.throws(
      () => createProductionPlan({ ...base, workers }),
      /complete application Worker cohort/,
    );
  }
});

test("deploys Data only as part of the complete migration cohort", () => {
  const plan = createProductionPlan({
    ...base,
    workers: allWorkers,
    applyMigrations: true,
  });
  assert.deepEqual(plan.workers, allWorkers);
  assert.equal(plan.applyMigrations, true);

  assert.throws(
    () =>
      createProductionPlan({
        ...base,
        workers: ["data", ...applicationWorkers],
        applyMigrations: false,
      }),
    /migration authorization must match/,
  );
  assert.throws(
    () => createProductionPlan({ ...base, applyMigrations: true }),
    /migration authorization must match/,
  );
});

test("requires exact source, Web API metadata, and Gateway acknowledgement", () => {
  assert.throws(
    () => createProductionPlan({ ...base, headSha: "b".repeat(40) }),
    /does not match HEAD/,
  );
  assert.throws(
    () => createProductionPlan({ ...base, gitStatus: " M unsafe" }),
    /worktree must be clean/,
  );
  assert.throws(
    () => createProductionPlan({ ...base, allowGatewayDeploy: false }),
    /Gateway deployment requires explicit acknowledgement/,
  );
  assert.throws(
    () =>
      createProductionPlan({
        ...base,
        configSummary: { ...base.configSummary, buildSha: "b".repeat(40) },
      }),
    /BUILD_SHA must match/,
  );
});
