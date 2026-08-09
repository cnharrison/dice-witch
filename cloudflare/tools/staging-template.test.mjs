import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workers = [
  "data",
  "discord-rest",
  "gateway",
  "interactions",
  "roll",
  "web-api",
];

async function loadTemplates() {
  const entries = await Promise.all(
    workers.map(async (worker) => [
      worker,
      JSON.parse(
        await readFile(
          new URL(`../wrangler.${worker}.staging.example.jsonc`, import.meta.url),
          "utf8",
        ),
      ),
    ]),
  );
  return Object.fromEntries(entries);
}

test("uses isolated staging Worker and service names", async () => {
  const configs = await loadTemplates();

  for (const worker of workers) {
    assert.equal(configs[worker].name, `dice-witch-${worker}-staging`);
    assert.equal(configs[worker].preview_urls, false);
    assert.doesNotMatch(JSON.stringify(configs[worker]), /-production|dicewit\.ch/);
  }
  for (const config of Object.values(configs)) {
    for (const binding of config.services ?? []) {
      assert.match(binding.service, /^dice-witch-.+-staging$/);
    }
  }
});

test("keeps staging Data private with lifecycle and audience schedules", async () => {
  const configs = await loadTemplates();

  assert.equal(configs.data.workers_dev, false);
  assert.equal(configs.interactions.workers_dev, true);
  assert.equal("route" in configs.data, false);
  assert.equal("routes" in configs.data, false);
  assert.deepEqual(configs.data.triggers, {
    crons: ["* * * * *", "0 3 * * *"],
  });
  assert.deepEqual(configs.gateway.triggers, {
    crons: ["0 * * * *", "*/5 * * * *"],
  });
  assert.equal(configs.roll.vars.ROLL_RENDER_VERSION, "4");
  assert.equal(configs.roll.vars.ROLL_VIEW_POLICY, "r25");
});

test("requires local resource identifiers and build metadata", async () => {
  const configs = await loadTemplates();
  const serialized = JSON.stringify(configs);

  assert.match(serialized, /REPLACE_WITH_STAGING_D1_DATABASE_NAME/);
  assert.match(serialized, /REPLACE_WITH_STAGING_SECRETS_STORE_ID/);
  assert.equal(configs["web-api"].vars.ENVIRONMENT, "staging");
  assert.equal(
    configs["web-api"].vars.BUILD_SHA,
    "REPLACE_WITH_FULL_STAGING_BUILD_SHA",
  );
});
