import assert from "node:assert/strict";
import test from "node:test";
import { createProductionPlan } from "./production-plan.mjs";

const sha = "a".repeat(40);
const base = {
  requestedSha: sha,
  headSha: sha,
  gitStatus: "",
  workers: ["web-api", "roll"],
  applyMigrations: false,
  allowGatewayDeploy: false,
  allowExistingDependencies: true,
  configSummary: { buildSha: sha, frontendOrigin: "https://dicewit.ch" },
};

test("orders a targeted production rollout with acknowledged active dependencies", () => {
  const plan = createProductionPlan(base);
  assert.deepEqual(plan.workers, ["web-api", "roll"]);
  assert.equal(plan.applyMigrations, false);
  assert.equal(plan.existingDependenciesAcknowledged, true);
  assert.ok(plan.omittedDependencies.includes("roll:gateway"));
  assert.ok(plan.omittedDependencies.includes("web-api:interactions"));
});

test("requires exact source, Web API metadata, and dependency acknowledgement", () => {
  assert.throws(
    () => createProductionPlan({ ...base, headSha: "b".repeat(40) }),
    /does not match HEAD/,
  );
  assert.throws(
    () => createProductionPlan({ ...base, workers: ["roll"] }),
    /must include web-api/,
  );
  assert.throws(
    () => createProductionPlan({ ...base, allowExistingDependencies: false }),
    /dependencies require explicit acknowledgement/,
  );
  assert.throws(
    () => createProductionPlan({ ...base, gitStatus: " M unsafe" }),
    /worktree must be clean/,
  );
});

test("couples Data and Gateway mutations to their explicit authorizations", () => {
  assert.throws(
    () =>
      createProductionPlan({
        ...base,
        workers: ["data", "web-api"],
        applyMigrations: false,
      }),
    /migration authorization must match/,
  );
  assert.throws(
    () =>
      createProductionPlan({
        ...base,
        workers: ["gateway", "web-api"],
        allowGatewayDeploy: false,
      }),
    /Gateway deployment requires explicit acknowledgement/,
  );
  assert.throws(
    () => createProductionPlan({ ...base, applyMigrations: true }),
    /migration authorization must match/,
  );
});
