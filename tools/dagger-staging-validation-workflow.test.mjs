import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/dagger-staging-validation.yml", import.meta.url),
  "utf8",
);

const stagingSecrets = [
  "STAGING_CONFIG_B64",
  "STAGING_GATEWAY_ORIGIN",
  "STAGING_PRODUCTION_DENYLIST_B64",
  "STAGING_ROLL_ORIGIN",
];

test("Dagger staging validation is manual, protected, and non-mutating", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n    inputs:\n      sha:/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.match(workflow, /^permissions:\n  actions: read\n  contents: read$/m);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /group: dice-witch-staging-validation/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.doesNotMatch(
    workflow,
    /CLOUDFLARE_|apply[_-]migrations|wrangler deploy|deploy-staging|staging-smoke/,
  );
});

test("Dagger staging validation admits only an exact successful CI source", () => {
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.equal(workflow.match(/uses: actions\/checkout@v5/g)?.length, 2);
  assert.equal(workflow.match(/persist-credentials: false/g)?.length, 2);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /ref: \$\{\{ inputs\.sha \}\}/);
  assert.match(workflow, /node tools\/verify-ci-promotion\.mjs --sha "\$REQUESTED_SHA"/);

  const promotion = workflow.indexOf("verify-ci-promotion.mjs");
  const exactCheckout = workflow.indexOf("Check out validated source");
  const dagger = workflow.indexOf("Validate private staging configuration through Dagger");
  assert.ok(promotion < exactCheckout && exactCheckout < dagger);
  assert.equal(workflow.match(/git rev-parse HEAD/g)?.length, 2);
  assert.equal(workflow.match(/git status --porcelain/g)?.length, 2);
});

test("Dagger staging validation exposes only bounded secret inputs", () => {
  assert.match(workflow, /uses: dagger\/dagger-for-github@v8\.4\.1/);
  assert.match(workflow, /version: v0\.21\.9/);
  assert.match(
    workflow,
    /call: staging-validate --source=\. --sha=\$\{\{ inputs\.sha \}\} --build-time=\$\{\{ steps\.metadata\.outputs\.build_time \}\} --run-nonce=\$\{\{ github\.run_id \}\}\.\$\{\{ github\.run_attempt \}\}/,
  );

  const referencedSecrets = [...workflow.matchAll(/\$\{\{ secrets\.([A-Z0-9_]+) \}\}/g)]
    .map((match) => match[1])
    .toSorted();
  assert.deepEqual(referencedSecrets, stagingSecrets);

  for (const name of stagingSecrets) {
    assert.match(workflow, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
    assert.match(workflow, new RegExp(`env://${name}`));
  }

  assert.equal(workflow.match(/GITHUB_TOKEN:/g)?.length, 1);
  assert.doesNotMatch(workflow, /cloud-token:|staging-validate[^\n]*GITHUB_TOKEN/);
});
