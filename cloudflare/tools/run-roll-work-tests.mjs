import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEST_FILE = "tests/roll/work.test.ts";
const BATCH_SIZE = 20;
const source = readFileSync(new URL(`../${TEST_FILE}`, import.meta.url), "utf8");
const names = [...source.matchAll(/\bit\("((?:[^"\\]|\\.)*)"/g)].map(
  ([, name]) => JSON.parse(`"${name}"`),
);

if (names.length === 0 || new Set(names).size !== names.length) {
  throw new Error("RollWork test names must be present and unique");
}

const vitest = new URL("../../node_modules/vitest/vitest.mjs", import.meta.url);
for (let offset = 0; offset < names.length; offset += BATCH_SIZE) {
  const pattern = names
    .slice(offset, offset + BATCH_SIZE)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const result = spawnSync(
    process.execPath,
    [vitest.pathname, "run", "--config", "vitest.roll.config.ts", TEST_FILE, "-t", pattern],
    { cwd: new URL("..", import.meta.url), stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
