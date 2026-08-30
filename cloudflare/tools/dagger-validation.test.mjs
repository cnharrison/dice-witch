import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cloudflareChildEnvironment,
  PRIVATE_CONFIG_FILES,
  privateDryRunCommands,
  validationChildEnvironment,
  withPrivateConfiguration,
} from "./dagger-validation.mjs";

test("private validation exposes only local Wrangler dry-runs", () => {
  const commands = privateDryRunCommands();

  assert.equal(commands.length, 6);
  assert.deepEqual(
    commands.map(({ worker }) => worker),
    ["data", "discord-rest", "roll", "gateway", "interactions", "web-api"],
  );
  for (const { file, arguments: arguments_ } of commands) {
    assert.equal(file, "npx");
    assert.deepEqual(arguments_.slice(0, 4), [
      "--no-install",
      "wrangler",
      "deploy",
      "--dry-run",
    ]);
    assert.equal(arguments_.includes("--remote"), false);
    assert.equal(arguments_.includes("apply"), false);
  }
});

test("private validation strips every deployment secret from child processes", () => {
  const environment = validationChildEnvironment({ PUBLIC_VALUE: "visible" });

  assert.equal(environment.PUBLIC_VALUE, "visible");
  for (const name of [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "PRODUCTION_VALUES_B64",
    "STAGING_CONFIG_B64",
    "STAGING_GATEWAY_ORIGIN",
    "STAGING_PRODUCTION_DENYLIST_B64",
    "STAGING_ROLL_ORIGIN",
  ]) {
    assert.equal(name in environment, false);
  }
});

test("only remote Cloudflare commands receive Cloudflare credentials", () => {
  const environment = cloudflareChildEnvironment({
    accountId: "account-canary",
    apiToken: "token-canary",
  });

  assert.equal(environment.CLOUDFLARE_ACCOUNT_ID, "account-canary");
  assert.equal(environment.CLOUDFLARE_API_TOKEN, "token-canary");
  assert.equal("STAGING_CONFIG_B64" in environment, false);
  assert.equal("STAGING_PRODUCTION_DENYLIST_B64" in environment, false);
});

test("private configuration is removed after success and failure", async () => {
  for (const shouldFail of [false, true]) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "dw-dagger-private-"));
    const run = () =>
      withPrivateConfiguration(
        directory,
        async () => {
          await Promise.all(
            PRIVATE_CONFIG_FILES.map((file) =>
              writeFile(path.join(directory, file), "private-canary"),
            ),
          );
        },
        async () => {
          assert.equal(
            await readFile(path.join(directory, PRIVATE_CONFIG_FILES[0]), "utf8"),
            "private-canary",
          );
          if (shouldFail) throw new Error("validation failed");
          return "validated";
        },
      );

    if (shouldFail) await assert.rejects(run(), /validation failed/);
    else assert.equal(await run(), "validated");

    for (const file of PRIVATE_CONFIG_FILES) {
      await assert.rejects(readFile(path.join(directory, file)), /ENOENT/);
    }
  }
});
