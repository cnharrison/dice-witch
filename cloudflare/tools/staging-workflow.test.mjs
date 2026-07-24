import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../../.github/workflows/deploy-staging.yml",
  import.meta.url,
);

test("keeps staging deployment manual, serialized, and approval-gated", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /group: dice-witch-staging-deployment/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /deploy-staging/);
  assert.match(workflow, /APPLY_MIGRATIONS/);
  assert.doesNotMatch(workflow, /^\s+schedule:/m);
});

test("requires migration authorization only when Data is selected", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(
    workflow,
    /if \[\[ ",\$\{SELECTED_WORKERS\}," == \*",data,"\* \]\]; then/,
  );
  assert.match(workflow, /if: \$\{\{ inputs\.apply_migrations == true \}\}/);
});

test("uses the expiring dependency-audit policy", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /npm run audit:ci/);
  assert.doesNotMatch(workflow, /npm audit --audit-level/);
});

test("does not expose deployment credentials to dependency or quality steps", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const qualityIndex = workflow.indexOf("Run quality gates without deployment credentials");
  const materializeIndex = workflow.indexOf("Materialize private staging configuration");
  const firstTokenIndex = workflow.indexOf("CLOUDFLARE_API_TOKEN");
  const stepsIndex = workflow.indexOf("    steps:");

  assert.ok(qualityIndex > stepsIndex);
  assert.ok(materializeIndex > qualityIndex);
  assert.ok(firstTokenIndex > materializeIndex);
  assert.doesNotMatch(workflow.slice(0, stepsIndex), /STAGING_CONFIG_B64|CLOUDFLARE_API_TOKEN/);
});

test("enforces producer-only rollout before snapshot consumers", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /audience_producer_only:/);
  assert.match(workflow, /--audience-producer-only/);
  assert.match(workflow, /Verify audience snapshot before consumer deployment/);
  assert.match(workflow, /verify-audience-snapshot\.mjs/);
  assert.match(workflow, /inputs\.audience_producer_only == false/);
});

test("requires exact-SHA planning and explicit Gateway acknowledgement", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /staging-plan\.mjs/);
  assert.match(workflow, /--allow-gateway-deploy/);
  assert.match(workflow, /STAGING_PRODUCTION_DENYLIST_B64/);
  assert.match(workflow, /--expected-sha/);
});
