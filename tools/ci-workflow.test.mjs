import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("CI uses the repository dependency-audit policy", () => {
  assert.match(workflow, /run: npm run audit:ci/);
  assert.doesNotMatch(workflow, /run: npm audit(?:\s|$)/);
});
