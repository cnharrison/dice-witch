import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../.github/workflows/deploy-production.yml", import.meta.url),
  "utf8",
);

function job(name, nextName) {
  const start = workflow.indexOf(`  ${name}:`);
  const end = nextName === undefined ? workflow.length : workflow.indexOf(`  ${nextName}:`);
  return workflow.slice(start, end);
}

const preflight = job("preflight", "deploy");
const deploy = job("deploy");

const productionSecrets = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "PRODUCTION_VALUES_B64",
];

test("keeps production deployment manual, protected, serialized, and non-cancelling", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(deploy, /name: production/);
  assert.match(workflow, /group: dice-witch-production-deployment/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /deploy-production/);
  assert.doesNotMatch(workflow, /^\s+(push|schedule):/m);
});

test("keeps production credentials out of unprotected preflight", () => {
  assert.doesNotMatch(
    preflight,
    /PRODUCTION_VALUES_B64|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/,
  );
});

test("requires a successful CI push for the exact SHA without repeating quality gates", () => {
  assert.match(preflight, /actions: read/);
  assert.match(preflight, /Verify successful CI promotion/);
  assert.match(preflight, /node tools\/verify-ci-promotion\.mjs/);
  assert.match(preflight, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(
    preflight,
    /npm ci|npm test|npm run audit:ci|npm run type-check|npm run lint:ci|npm run build/,
  );
});

test("requires exact source and explicit production mutation acknowledgements", () => {
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /DEPLOY_CONFIRMATION.*\n[\s\S]*deploy-production/);
  assert.match(workflow, /ALLOW_GATEWAY_DEPLOY.*\n[\s\S]*== "true"/);
  assert.match(workflow, /APPLY_MIGRATIONS.*\n[\s\S]*"true".*"false"/);
  assert.equal(workflow.match(/uses: actions\/checkout@v5/g)?.length, 2);
  assert.equal(workflow.match(/persist-credentials: false/g)?.length, 2);
  assert.equal(workflow.match(/git rev-parse HEAD/g)?.length, 2);
  assert.equal(workflow.match(/git status --porcelain/g)?.length, 2);
});

test("runs the complete guarded production deployment through pinned Dagger", () => {
  assert.match(
    deploy,
    /uses: dagger\/dagger-for-github@27b130bf0f79a7f6fbbbe0fbca6760dc9bb40a77 # v8\.4\.1/,
  );
  assert.match(deploy, /version: v0\.21\.9/);
  assert.match(
    deploy,
    /call: production-deploy --source=\. --sha=\$\{\{ inputs\.sha \}\} --build-time=\$\{\{ steps\.metadata\.outputs\.build_time \}\} --run-nonce=\$\{\{ github\.run_id \}\}\.\$\{\{ github\.run_attempt \}\} --apply-migrations=\$\{\{ inputs\.apply_migrations \}\} --allow-gateway-deploy=\$\{\{ inputs\.allow_gateway_deploy \}\}/,
  );
  assert.match(deploy, /--values=env:\/\/PRODUCTION_VALUES_B64/);
  assert.match(deploy, /--cloudflare-api-token=env:\/\/CLOUDFLARE_API_TOKEN/);
  assert.match(deploy, /--cloudflare-account-id=env:\/\/CLOUDFLARE_ACCOUNT_ID/);

  const referencedSecrets = [...deploy.matchAll(/\$\{\{ secrets\.([A-Z0-9_]+) \}\}/g)]
    .map((match) => match[1])
    .toSorted();
  assert.deepEqual(referencedSecrets, productionSecrets);
  for (const name of productionSecrets) {
    assert.match(deploy, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
    assert.match(deploy, new RegExp(`env://${name}`));
  }
});

test("removes the legacy runner deployment path and retains protected job identity", () => {
  assert.match(workflow, /^ {2}deploy:/m);
  assert.match(deploy, /timeout-minutes: 45/);
  assert.doesNotMatch(
    deploy,
    /setup-node|npm ci|production:materialize|wrangler |production-plan\.mjs|assert-migration-state\.mjs|verify-audience-snapshot\.mjs|production-active-settings\.mjs|production-smoke\.mjs/,
  );
  assert.doesNotMatch(workflow, /allow_existing_dependencies|allow-existing-dependencies/);
});
