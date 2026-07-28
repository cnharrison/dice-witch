import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("CI runs for every production-promotion branch", () => {
  assert.match(workflow, /branches: \[master, feature\/next-version-r1\]/);
  assert.match(workflow, /pull_request:/);
});

test("CI preserves every quality gate while running independent tests in parallel", () => {
  assert.match(workflow, /static-validation:/);
  assert.match(workflow, /test-suite:/);
  assert.match(workflow, /worker-dry-runs:/);
  assert.match(workflow, /strategy:\n\s+fail-fast: false\n\s+matrix:/);
  assert.match(workflow, /node --test tools\/\*\.test\.mjs/);

  for (const script of [
    "test:config",
    "test:canvaskit-runtime",
    "test:appearance",
    "test:saved-rolls",
    "test:dice-svg",
    "test:gateway",
    "test:discord-rest",
    "test:interactions",
    "test:roll",
    "test:data",
    "test:web-api",
  ]) {
    assert.match(workflow, new RegExp(`npm run ${script} --workspace=@dice-witch/cloudflare`));
  }

  assert.match(workflow, /npm run test --workspace=@dice-witch\/frontend -- --maxWorkers=1/);
  assert.match(workflow, /npm run test --workspace=@dice-witch\/dice-v4-model -- --maxWorkers=1/);
  assert.match(workflow, /run: npm run audit:ci/);
  assert.match(workflow, /run: npm run type-check/);
  assert.match(workflow, /run: npm run lint:ci/);
  assert.match(workflow, /run: npm run build/);
  assert.doesNotMatch(workflow, /run: npm audit(?:\s|$)/);
});

test("CI builds Web API assets before isolated Worker dry-runs", () => {
  const dryRuns = workflow.slice(
    workflow.indexOf("  worker-dry-runs:"),
    workflow.indexOf("  quality:"),
  );
  const build = dryRuns.indexOf("npm run build --workspace=@dice-witch/frontend");
  const dryRun = dryRuns.indexOf("wrangler deploy");
  assert.notEqual(build, -1);
  assert.ok(build < dryRun);
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

test("CI uses the Node 24 GitHub action runtimes", () => {
  assert.match(workflow, /uses: actions\/checkout@v5/);
  assert.match(workflow, /uses: actions\/setup-node@v5/);
  assert.doesNotMatch(workflow, /uses: actions\/(?:checkout|setup-node)@v4/);
});
