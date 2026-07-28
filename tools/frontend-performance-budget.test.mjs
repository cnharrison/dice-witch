import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertFrontendPerformanceBudget,
  measureFrontendEntry,
} from "./frontend-performance-budget.mjs";

async function fixture({ javascript, externalStylesheets = [] }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "frontend-budget-"));
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "assets", "entry.js"), javascript);
  await writeFile(path.join(directory, "assets", "entry.css"), "body{color:#fff}");
  await writeFile(
    path.join(directory, "assets", "banner-a1b2c3.webp"),
    randomBytes(1_024),
  );
  await writeFile(
    path.join(directory, "assets", "display-a1b2c3.woff2"),
    randomBytes(1_024),
  );
  await writeFile(
    path.join(directory, "index.html"),
    `<!doctype html><script type="module" src="/assets/entry.js"></script>
     <link rel="stylesheet" href="/assets/entry.css">
     <link rel="preload" as="image" href="/assets/banner-a1b2c3.webp">
     <link rel="preload" as="font" href="/assets/display-a1b2c3.woff2">
     ${externalStylesheets.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")}`,
  );
  return directory;
}

test("accepts a bounded initial route and reports its transfer composition", async () => {
  const directory = await fixture({
    javascript: "console.log('bounded')",
    externalStylesheets: ["https://fonts.example/style.css"],
  });
  const measurement = await measureFrontendEntry(directory);

  assert.doesNotThrow(() => assertFrontendPerformanceBudget(measurement));
  assert.equal(measurement.assets.length, 4);
  assert.deepEqual(measurement.thirdPartyOrigins, ["https://fonts.example"]);
  assert.ok(measurement.initialTransferBytes > measurement.htmlBytes);
});

test("rejects oversized JavaScript and additional third-party origins", async () => {
  const directory = await fixture({
    javascript: randomBytes(100 * 1024),
    externalStylesheets: [
      "https://fonts.example/style.css",
      "https://analytics.example/script.css",
    ],
  });
  const measurement = await measureFrontendEntry(directory);

  assert.throws(
    () => assertFrontendPerformanceBudget(measurement),
    /initial JavaScript budget exceeded; third-party origin budget exceeded/,
  );
});
