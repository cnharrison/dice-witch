import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/dagger-ci-shadow.yml", import.meta.url),
  "utf8",
);

const suites = [
  "CLOUDFLARE_CONFIGURATION",
  "CANVAS_KIT_RUNTIME",
  "APPEARANCE",
  "SAVED_ROLLS",
  "SVG_RENDERER",
  "GATEWAY",
  "DISCORD_REST",
  "INTERACTIONS",
  "ROLL",
  "DATA",
  "WEB_API",
  "FRONTEND",
  "V_4_MODEL",
];

test("Dagger CI shadow is manual, read-only, and non-deploying", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  (?:pull_request|push|schedule):/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(workflow, /\b(?:environment|secrets):/);
  assert.doesNotMatch(workflow, /(?:staging|production)-validate/);
});

test("Dagger CI shadow uses the pinned engine through the official action", () => {
  assert.match(workflow, /uses: dagger\/dagger-for-github@v8\.4\.1/);
  assert.match(workflow, /version: v0\.21\.9/);
  assert.doesNotMatch(workflow, /cloud-token:/);
});

test("Dagger CI shadow preserves current CI fan-out", () => {
  assert.match(workflow, /^  static-validation:$/m);
  assert.match(workflow, /^  test-suite:$/m);
  assert.match(workflow, /^  worker-dry-runs:$/m);
  assert.match(workflow, /strategy:\n      fail-fast: false\n      matrix:/);

  for (const suite of suites) {
    assert.match(workflow, new RegExp(`suite: ${suite}(?:\\s|$)`));
  }

  assert.match(
    workflow,
    /call: static-validation --source=\. --sha=\$\{\{ github\.sha \}\} --run-nonce=\$\{\{ github\.run_id \}\}\.\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(
    workflow,
    /call: test-suite --source=\. --suite=\$\{\{ matrix\.suite \}\} --sha=\$\{\{ github\.sha \}\}/,
  );
  assert.match(
    workflow,
    /call: worker-dry-runs --source=\. --sha=\$\{\{ github\.sha \}\}/,
  );
});

test("Every shadow execution verifies source identity and fails closed", () => {
  assert.equal(workflow.match(/uses: actions\/checkout@v5/g)?.length, 3);
  assert.equal(workflow.match(/persist-credentials: false/g)?.length, 3);
  assert.equal(workflow.match(/git rev-parse HEAD/g)?.length, 3);
  assert.equal(workflow.match(/git status --porcelain/g)?.length, 3);

  const quality = workflow.slice(workflow.indexOf("  shadow-quality:"));
  assert.match(quality, /needs: \[static-validation, test-suite, worker-dry-runs\]/);
  assert.match(quality, /if: \$\{\{ always\(\) \}\}/);
  assert.match(quality, /needs\.static-validation\.result/);
  assert.match(quality, /needs\.test-suite\.result/);
  assert.match(quality, /needs\.worker-dry-runs\.result/);
  assert.match(quality, /exit 1/);
});
