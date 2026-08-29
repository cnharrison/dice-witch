import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

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

test("CI preserves its required triggers, permissions, and concurrency", () => {
  assert.match(workflow, /branches: \[master, feature\/next-version-r1\]/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /group: ci-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test("CI runs every quality gate through pinned Dagger jobs", () => {
  assert.match(workflow, /^  static-validation:$/m);
  assert.match(workflow, /^  test-suite:$/m);
  assert.match(workflow, /^  worker-dry-runs:$/m);
  assert.match(workflow, /strategy:\n      fail-fast: false\n      matrix:/);
  assert.equal(workflow.match(/^            suite: /gm)?.length, suites.length);

  for (const suite of suites) {
    assert.match(workflow, new RegExp(`suite: ${suite}(?:\\s|$)`));
  }

  assert.equal(workflow.match(/uses: dagger\/dagger-for-github@v8\.4\.1/g)?.length, 3);
  assert.equal(workflow.match(/version: v0\.21\.9/g)?.length, 3);
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
  assert.doesNotMatch(workflow, /actions\/setup-node|npm ci|wrangler deploy|cloud-token:/);
});

test("Every required Dagger job verifies exact clean source without persisted credentials", () => {
  assert.equal(workflow.match(/uses: actions\/checkout@v5/g)?.length, 3);
  assert.equal(workflow.match(/persist-credentials: false/g)?.length, 3);
  assert.equal(workflow.match(/git rev-parse HEAD/g)?.length, 3);
  assert.equal(workflow.match(/git status --porcelain/g)?.length, 3);
});

test("CI retains one fail-closed required quality result", () => {
  const quality = workflow.slice(workflow.indexOf("  quality:"));
  assert.match(quality, /needs: \[static-validation, test-suite, worker-dry-runs\]/);
  assert.match(quality, /if: \$\{\{ always\(\) \}\}/);
  assert.match(quality, /needs\.static-validation\.result/);
  assert.match(quality, /needs\.test-suite\.result/);
  assert.match(quality, /needs\.worker-dry-runs\.result/);
  assert.match(quality, /exit 1/);
});
