import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataConfigUrl = new URL("../wrangler.data.example.jsonc", import.meta.url);

test("keeps the Data Worker private to service bindings", async () => {
  const config = JSON.parse(await readFile(dataConfigUrl, "utf8"));

  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal("routes" in config, false);
  assert.equal("route" in config, false);
});
