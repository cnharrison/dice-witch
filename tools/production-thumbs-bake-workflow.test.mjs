import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/production-thumbs-bake.yml", import.meta.url),
  "utf8",
);

test("production thumbnail bake is manual, protected, and non-cancelling", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^ {2}(?:push|pull_request|schedule):/m);
  assert.match(workflow, /name: production/);
  assert.match(workflow, /group: dice-witch-production-thumbnail-bake/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /bake-production-thumbnails/);
  assert.match(workflow, /^permissions:\n  actions: read\n  contents: read$/m);
});

test("production thumbnail bake trusts workflow source and exact deployed SHA", () => {
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.equal(
    workflow.match(
      /uses: actions\/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5/g,
    )?.length,
    1,
  );
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /node tools\/verify-ci-promotion\.mjs --sha "\$REQUESTED_SHA"/);
  assert.match(workflow, /https:\/\/dicewit\.ch\/api\/meta/);
  assert.match(workflow, /test "\$deployed_sha" = "\$REQUESTED_SHA"/);

  const source = workflow.indexOf("Verify workflow source");
  const promotion = workflow.indexOf("Require successful exact-SHA CI");
  const deployed = workflow.indexOf("Verify exact production build");
  const bake = workflow.indexOf("Bake production thumbnails through Dagger");
  assert.ok(source < promotion && promotion < deployed && deployed < bake);
});

test("production thumbnail bake uses pinned Dagger and one bounded secret", () => {
  assert.match(
    workflow,
    /uses: dagger\/dagger-for-github@27b130bf0f79a7f6fbbbe0fbca6760dc9bb40a77 # v8\.4\.1/,
  );
  assert.match(workflow, /version: v0\.21\.9/);
  assert.match(
    workflow,
    /call: production-thumbs-bake --source=\. --sha=\$\{\{ inputs\.sha \}\} --run-nonce=\$\{\{ github\.run_id \}\}\.\$\{\{ github\.run_attempt \}\} --bake-secret=env:\/\/PRODUCTION_APPEARANCE_THUMBS_BAKE_SECRET/,
  );

  const secrets = [...workflow.matchAll(/\$\{\{ secrets\.([A-Z0-9_]+) \}\}/g)]
    .map((match) => match[1]);
  assert.deepEqual(secrets, ["PRODUCTION_APPEARANCE_THUMBS_BAKE_SECRET"]);
  assert.equal(workflow.match(/GITHUB_TOKEN:/g)?.length, 1);
  assert.doesNotMatch(
    workflow,
    /CLOUDFLARE_|wrangler deploy|production-deploy|apply[_-]migrations|GITHUB_TOKEN[^\n]*production-thumbs-bake/,
  );
});
