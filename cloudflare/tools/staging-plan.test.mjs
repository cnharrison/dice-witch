import assert from "node:assert/strict";
import test from "node:test";
import { createStagingPlan } from "./staging-plan.mjs";

const sha = "a".repeat(40);
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
    workers: ["web-api", "data", "roll"],
    allowGatewayDeploy: false,
    productionIsolationVerified: true,
    smokeTargets: {
      rollOrigin: "https://roll.example.com",
      gatewayOrigin: "https://gateway.example.com",
    },
    configSummary,
    ...overrides,
  };
}

test("creates an exact-SHA deployment plan in dependency order", () => {
  const plan = createStagingPlan(input());

  assert.equal(plan.sourceSha, sha);
  assert.deepEqual(plan.workers, ["data", "roll", "web-api"]);
  assert.deepEqual(
    plan.steps.filter(({ kind }) => kind === "deploy").map(({ worker }) => worker),
    ["data", "roll", "web-api"],
  );
  assert.equal(plan.steps[0].kind, "quality-gate");
  assert.equal(plan.steps[1].kind, "migration-list");
  assert.equal(plan.steps[2].kind, "migration-apply");
  assert.equal(plan.steps.at(-1).kind, "smoke-test");
});

test("rejects a dirty worktree or a different requested SHA", () => {
  assert.throws(
    () => createStagingPlan(input({ gitStatus: " M cloudflare/package.json" })),
    /worktree must be clean/,
  );
  assert.throws(
    () => createStagingPlan(input({ requestedSha: "b".repeat(40) })),
    /does not match HEAD/,
  );
  assert.throws(
    () =>
      createStagingPlan(
        input({
          configSummary: { ...configSummary, buildSha: "b".repeat(40) },
        }),
      ),
    /Web API BUILD_SHA must match the requested source SHA/,
  );
});

test("requires a separate acknowledgement for Gateway deployment", () => {
  assert.throws(
    () => createStagingPlan(input({ workers: ["gateway", "web-api"] })),
    /Gateway deployment requires --allow-gateway-deploy/,
  );

  const plan = createStagingPlan(
    input({
      workers: ["gateway", "web-api"],
      allowGatewayDeploy: true,
    }),
  );
  assert.deepEqual(plan.workers, ["gateway", "web-api"]);
});

test("requires verified production isolation", () => {
  assert.throws(
    () => createStagingPlan(input({ productionIsolationVerified: false })),
    /Production-target isolation must be verified/,
  );
});

test("rejects unknown, empty, or unversioned worker selections", () => {
  assert.throws(
    () => createStagingPlan(input({ workers: [] })),
    /At least one staging Worker/,
  );
  assert.throws(
    () => createStagingPlan(input({ workers: ["data", "roll"] })),
    /Every staging deployment must include web-api/,
  );
  assert.throws(
    () => createStagingPlan(input({ workers: ["data", "unknown"] })),
    /Unknown staging Worker: unknown/,
  );
});
