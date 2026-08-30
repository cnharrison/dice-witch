import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../.github/workflows/deploy-staging.yml", import.meta.url),
  "utf8",
);

const deploymentSecrets = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "STAGING_CONFIG_B64",
  "STAGING_GATEWAY_ORIGIN",
  "STAGING_PRODUCTION_DENYLIST_B64",
  "STAGING_ROLL_ORIGIN",
];

test("keeps staging deployment manual, protected, serialized, and non-cancelling", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /^ {2}deploy:$/m);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /group: dice-witch-staging-deployment/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /deploy-staging/);
  assert.doesNotMatch(workflow, /^\s+(?:push|schedule):/m);
});

test("admits only an authorized exact SHA with successful required CI", () => {
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /ALLOW_GATEWAY_DEPLOY.*true/);
  assert.equal(workflow.match(/uses: actions\/checkout@v5/g)?.length, 2);
  assert.equal(workflow.match(/persist-credentials: false/g)?.length, 2);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /ref: \$\{\{ inputs\.sha \}\}/);
  assert.match(workflow, /node tools\/verify-ci-promotion\.mjs --sha "\$REQUESTED_SHA"/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
});

test("runs complete quality gates through Dagger before deployment credentials", () => {
  const quality = workflow.indexOf("Run complete quality gates through Dagger");
  const deployment = workflow.indexOf("Deploy staging through Dagger");
  const firstCredential = Math.min(
    ...deploymentSecrets.map((name) => workflow.indexOf(`${name}:`)),
  );

  assert.ok(quality > 0 && quality < deployment);
  assert.ok(firstCredential > quality);
  assert.match(
    workflow,
    /call: ci --source=\. --sha=\$\{\{ inputs\.sha \}\} --run-nonce=\$\{\{ github\.run_id \}\}\.\$\{\{ github\.run_attempt \}\}\.staging-quality/,
  );
});

test("passes only bounded secrets and authorizations to stagingDeploy", () => {
  assert.equal(workflow.match(/uses: dagger\/dagger-for-github@v8\.4\.1/g)?.length, 2);
  assert.equal(workflow.match(/version: v0\.21\.9/g)?.length, 2);
  assert.match(
    workflow,
    /call: staging-deploy --source=\. --sha=\$\{\{ inputs\.sha \}\} --build-time=\$\{\{ steps\.metadata\.outputs\.build_time \}\} --run-nonce=\$\{\{ github\.run_id \}\}\.\$\{\{ github\.run_attempt \}\}\.staging-deploy/,
  );
  assert.match(workflow, /--apply-migrations=\$\{\{ inputs\.apply_migrations \}\}/);
  assert.match(workflow, /--allow-gateway-deploy=\$\{\{ inputs\.allow_gateway_deploy \}\}/);

  const referencedSecrets = [...workflow.matchAll(/\$\{\{ secrets\.([A-Z0-9_]+) \}\}/g)]
    .map((match) => match[1])
    .toSorted();
  assert.deepEqual(referencedSecrets, deploymentSecrets);
  for (const name of deploymentSecrets) {
    assert.match(workflow, new RegExp(`env://${name}`));
  }

  assert.doesNotMatch(
    workflow,
    /wrangler (?:deploy|d1)|staging:materialize|staging-plan\.mjs|staging-smoke\.mjs|actions\/setup-node/,
  );
});

test("exposes no partial cohort or audience-snapshot deployment path", () => {
  assert.doesNotMatch(workflow, /^ {6}workers:/m);
  assert.doesNotMatch(workflow, /audience_producer_only|audience-producer-only/);
  assert.doesNotMatch(workflow, /verify-audience-snapshot\.mjs/);
});
