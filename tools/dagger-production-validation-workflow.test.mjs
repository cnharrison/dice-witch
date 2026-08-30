import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/dagger-production-validation.yml", import.meta.url),
  "utf8",
);

test("Dagger production validation is manual, protected, and non-mutating", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n    inputs:\n      sha:/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.match(workflow, /^permissions:\n  actions: read\n  contents: read$/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: dice-witch-production-validation/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.doesNotMatch(
    workflow,
    /CLOUDFLARE_|apply[_-]migrations|wrangler deploy|deploy-production|production-smoke|production-active-settings/,
  );
});

test("Dagger production validation admits only an exact successful CI source", () => {
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.equal(workflow.match(/uses: actions\/checkout@v5/g)?.length, 2);
  assert.equal(workflow.match(/persist-credentials: false/g)?.length, 2);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /ref: \$\{\{ inputs\.sha \}\}/);
  assert.match(workflow, /node tools\/verify-ci-promotion\.mjs --sha "\$REQUESTED_SHA"/);

  const promotion = workflow.indexOf("verify-ci-promotion.mjs");
  const exactCheckout = workflow.indexOf("Check out validated source");
  const dagger = workflow.indexOf("Validate private production configuration through Dagger");
  assert.ok(promotion < exactCheckout && exactCheckout < dagger);
  assert.equal(workflow.match(/git rev-parse HEAD/g)?.length, 2);
  assert.equal(workflow.match(/git status --porcelain/g)?.length, 2);
});

test("Dagger production validation exposes only the production values secret", () => {
  assert.match(workflow, /uses: dagger\/dagger-for-github@v8\.4\.1/);
  assert.match(workflow, /version: v0\.21\.9/);
  assert.match(
    workflow,
    /call: production-validate --source=\. --sha=\$\{\{ inputs\.sha \}\} --build-time=\$\{\{ steps\.metadata\.outputs\.build_time \}\} --run-nonce=\$\{\{ github\.run_id \}\}\.\$\{\{ github\.run_attempt \}\} --values=env:\/\/PRODUCTION_VALUES_B64/,
  );

  const referencedSecrets = [...workflow.matchAll(/\$\{\{ secrets\.([A-Z0-9_]+) \}\}/g)]
    .map((match) => match[1])
    .toSorted();
  assert.deepEqual(referencedSecrets, ["PRODUCTION_VALUES_B64"]);
  assert.match(
    workflow,
    /PRODUCTION_VALUES_B64: \$\{\{ secrets\.PRODUCTION_VALUES_B64 \}\}/,
  );
  assert.equal(workflow.match(/GITHUB_TOKEN:/g)?.length, 1);
  assert.doesNotMatch(workflow, /cloud-token:|production-validate[^\n]*GITHUB_TOKEN/);
});
