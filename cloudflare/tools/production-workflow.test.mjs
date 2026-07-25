import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../../.github/workflows/deploy-production.yml",
  import.meta.url,
);

async function workflow() {
  return readFile(workflowUrl, "utf8");
}

test("keeps production deployment manual, protected, serialized, and non-cancelling", async () => {
  const value = await workflow();
  assert.match(value, /workflow_dispatch:/);
  assert.match(value, /name: production/);
  assert.match(value, /group: dice-witch-production-deployment/);
  assert.match(value, /cancel-in-progress: false/);
  assert.match(value, /deploy-production/);
  assert.doesNotMatch(value, /^\s+(push|schedule):/m);
});

test("keeps production credentials out of unprotected preflight", async () => {
  const value = await workflow();
  const preflight = value.slice(value.indexOf("  preflight:"), value.indexOf("  deploy:"));
  assert.doesNotMatch(
    preflight,
    /PRODUCTION_VALUES_B64|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/,
  );
  assert.match(preflight, /Run quality gates without production credentials/);
  assert.match(preflight, /npm run audit:ci/);
});

test("requires exact SHA, source-derived config, explicit mutation acknowledgements, and strict deploys", async () => {
  const value = await workflow();
  assert.match(value, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(value, /PRODUCTION_VALUES_B64/);
  assert.match(value, /production:materialize/);
  assert.match(value, /production-plan\.mjs/);
  assert.match(value, /--apply-migrations/);
  assert.match(value, /--allow-gateway-deploy/);
  assert.match(value, /--allow-existing-dependencies/);
  assert.match(value, /--strict/);
  assert.match(value, /dfe6c3ddb987a22c7f17955d1973490e/);
  assert.match(value, /Verify production account and credential scope/);
  assert.match(value, /production-active-settings\.mjs/);
  assert.match(value, /wrangler deployments list/);
  assert.match(value, /wrangler versions view/);
  assert.match(value, /production-smoke\.mjs/);
});

test("uses Node 24 actions and removes materialized production config on every outcome", async () => {
  const value = await workflow();
  assert.match(value, /actions\/checkout@v5/);
  assert.match(value, /actions\/setup-node@v5/);
  assert.match(value, /node-version: 24\.13\.0/);
  assert.match(value, /if: always\(\)/);
  assert.match(
    value,
    /rm -f wrangler\.\{data,discord-rest,gateway,interactions,roll,web-api\}\.jsonc/,
  );
});
