import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataConfigUrl = new URL("../wrangler.data.example.jsonc", import.meta.url);
const rollConfigUrl = new URL("../wrangler.roll.example.jsonc", import.meta.url);
const webApiConfigUrl = new URL(
  "../wrangler.web-api.example.jsonc",
  import.meta.url,
);

test("uses renderer r42 with the r37 production appearance catalog", async () => {
  const [data, roll, webApi] = await Promise.all(
    [dataConfigUrl, rollConfigUrl, webApiConfigUrl].map(async (url) =>
      JSON.parse(await readFile(url, "utf8")),
    ),
  );

  assert.equal(data.vars.APPEARANCE_CATALOG_POLICY, "r37");
  assert.equal(roll.vars.ROLL_RENDER_VERSION, "4");
  assert.equal(roll.vars.ROLL_VIEW_POLICY, "r42");
  assert.equal(webApi.vars.APPEARANCE_CATALOG_POLICY, "r37");
});

test("keeps the Data Worker private to service bindings", async () => {
  const config = JSON.parse(await readFile(dataConfigUrl, "utf8"));

  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal("routes" in config, false);
  assert.equal("route" in config, false);
});
