import assert from "node:assert/strict";
import test from "node:test";
import { createProductionPlan } from "./production-plan.mjs";

const sha = "a".repeat(40);
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
  workers: allWorkers,
  applyMigrations: false,
  allowGatewayDeploy: true,
  configSummary: { buildSha: sha, frontendOrigin: "https://dicewit.ch" },
};

test("deploys the complete Worker cohort in dependency order", () => {
  const plan = createProductionPlan(base);
  assert.deepEqual(plan.workers, allWorkers);
  assert.equal(plan.applyMigrations, false);
  assert.equal(plan.gatewayDeploymentAcknowledged, true);
});

test("rejects every partial Worker deployment", () => {
  for (const workers of [
    ["roll", "interactions", "web-api"],
    ["discord-rest", "roll", "interactions", "web-api"],
    ["discord-rest", "gateway", "roll", "interactions", "web-api"],
  ]) {
    assert.throws(
      () => createProductionPlan({ ...base, workers }),
      /complete Worker cohort/,
    );
  }
});

test("keeps migration authorization independent from the complete cohort", () => {
  const plan = createProductionPlan({ ...base, applyMigrations: true });
  assert.deepEqual(plan.workers, allWorkers);
  assert.equal(plan.applyMigrations, true);
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
