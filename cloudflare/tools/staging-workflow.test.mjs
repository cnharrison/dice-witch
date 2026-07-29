import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../../.github/workflows/deploy-staging.yml",
  import.meta.url,
);

async function workflow() {
  return readFile(workflowUrl, "utf8");
}

test("keeps staging deployment manual, serialized, and approval-gated", async () => {
  const value = await workflow();

  assert.match(value, /workflow_dispatch:/);
  assert.match(value, /environment: staging/);
  assert.match(value, /group: dice-witch-staging-deployment/);
  assert.match(value, /cancel-in-progress: false/);
  assert.match(value, /deploy-staging/);
  assert.doesNotMatch(value, /^\s+schedule:/m);
});

test("derives a complete Worker cohort and exposes no partial-deployment path", async () => {
  const value = await workflow();

  assert.doesNotMatch(value, /^ {6}workers:/m);
  assert.doesNotMatch(value, /audience_producer_only|audience-producer-only/);
  assert.match(
    value,
    /workers="discord-rest,gateway,roll,interactions,web-api"/,
  );
  assert.match(
    value,
    /workers="discord-rest,data,gateway,roll,interactions,web-api"/,
  );
  assert.match(value, /--workers "\$workers"/);
});

test("couples Data deployment to migration authorization", async () => {
  const value = await workflow();

  assert.match(value, /if \[\[ "\$APPLY_MIGRATIONS" == "true" \]\]; then/);
  assert.match(value, /if: \$\{\{ inputs\.apply_migrations == true \}\}/);
  assert.match(value, /--apply-migrations/);
});

test("uses the expiring dependency-audit policy", async () => {
  const value = await workflow();

  assert.match(value, /npm run audit:ci/);
  assert.doesNotMatch(value, /npm audit --audit-level/);
});

test("does not expose deployment credentials to dependency or quality steps", async () => {
  const value = await workflow();
  const qualityIndex = value.indexOf("Run quality gates without deployment credentials");
  const materializeIndex = value.indexOf("Materialize private staging configuration");
  const firstTokenIndex = value.indexOf("CLOUDFLARE_API_TOKEN");
  const stepsIndex = value.indexOf("    steps:");

  assert.ok(qualityIndex > stepsIndex);
  assert.ok(materializeIndex > qualityIndex);
  assert.ok(firstTokenIndex > materializeIndex);
  assert.doesNotMatch(
    value.slice(0, stepsIndex),
    /STAGING_CONFIG_B64|CLOUDFLARE_API_TOKEN/,
  );
});

test("requires exact SHA, isolation, snapshot verification, and Gateway acknowledgement", async () => {
  const value = await workflow();

  assert.match(value, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(value, /staging-plan\.mjs/);
  assert.match(value, /--allow-gateway-deploy/);
  assert.match(value, /STAGING_PRODUCTION_DENYLIST_B64/);
  assert.match(value, /Verify audience snapshot before deployment/);
  assert.match(value, /verify-audience-snapshot\.mjs/);
  assert.match(value, /--expected-sha/);
});
