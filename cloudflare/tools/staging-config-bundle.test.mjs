import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeStagingConfigs } from "./staging-config-bundle.mjs";

const workers = [
  "data",
  "discord-rest",
  "gateway",
  "interactions",
  "roll",
  "web-api",
];
const sha = "a".repeat(40);
const buildTime = "2026-07-15T20:00:00.000Z";

function bundle() {
  return Object.fromEntries(
    workers.map((worker) => {
      const config = { name: `dice-witch-${worker}-staging` };
      if (worker === "web-api") {
        config.vars = { BUILD_SHA: "old", BUILD_TIME: "old" };
      } else if (worker === "interactions") {
        config.vars = {};
      }
      if (worker === "roll") {
        config.vars = { ROLL_RENDER_VERSION: "4" };
        config.services = [];
      }
      return [worker, config];
    }),
  );
}

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

test("materializes only known configs and stamps exact build metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dw-staging-"));
  await materializeStagingConfigs({
    encodedBundle: encode(bundle()),
    buildSha: sha,
    buildTime,
    configDirectory: directory,
    validate: () => ({ status: "valid" }),
  });

  const web = JSON.parse(
    await readFile(path.join(directory, "wrangler.web-api.jsonc"), "utf8"),
  );
  const interactions = JSON.parse(
    await readFile(path.join(directory, "wrangler.interactions.jsonc"), "utf8"),
  );
  const roll = JSON.parse(
    await readFile(path.join(directory, "wrangler.roll.jsonc"), "utf8"),
  );
  assert.equal(web.vars.ENVIRONMENT, "staging");
  assert.equal(web.vars.BUILD_SHA, sha);
  assert.equal(web.vars.BUILD_TIME, buildTime);
  assert.equal(interactions.vars.ROLL_LIFECYCLE_TELEMETRY_VERSION, "2");
  assert.deepEqual(interactions.observability, {
    enabled: true,
    logs: { invocation_logs: true, head_sampling_rate: 1 },
  });
  assert.deepEqual(roll.vars, {
    ROLL_RENDER_VERSION: "4",
    ROLL_VIEW_POLICY: "r35",
  });
  assert.deepEqual(roll.services, [
    {
      binding: "DISCORD_MESSAGE_PROBE",
      service: "dice-witch-discord-rest-staging",
      entrypoint: "DiscordMessageProbeService",
    },
  ]);
  assert.equal((await stat(path.join(directory, "wrangler.data.jsonc"))).mode & 0o777, 0o600);
});

test("rejects missing, extra, oversized, or malformed bundles", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dw-staging-"));
  const missing = bundle();
  delete missing.gateway;
  const extra = { ...bundle(), production: {} };

  await assert.rejects(
    materializeStagingConfigs({
      encodedBundle: encode(missing),
      buildSha: sha,
      buildTime,
      configDirectory: directory,
      validate: () => ({}),
    }),
    /exactly the six staging Worker configs/,
  );
  await assert.rejects(
    materializeStagingConfigs({
      encodedBundle: encode(extra),
      buildSha: sha,
      buildTime,
      configDirectory: directory,
      validate: () => ({}),
    }),
    /exactly the six staging Worker configs/,
  );
  await assert.rejects(
    materializeStagingConfigs({
      encodedBundle: "not-base64!",
      buildSha: sha,
      buildTime,
      configDirectory: directory,
      validate: () => ({}),
    }),
    /bundle is invalid/,
  );
  await assert.rejects(
    materializeStagingConfigs({
      encodedBundle: Buffer.alloc(70_000).toString("base64"),
      buildSha: sha,
      buildTime,
      configDirectory: directory,
      validate: () => ({}),
    }),
    /bundle exceeds 64 KiB/,
  );
});

test("validates before writing any config", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dw-staging-"));
  await assert.rejects(
    materializeStagingConfigs({
      encodedBundle: encode(bundle()),
      buildSha: sha,
      buildTime,
      configDirectory: directory,
      validate: () => {
        throw new Error("unsafe binding");
      },
    }),
    /unsafe binding/,
  );
  await assert.rejects(
    readFile(path.join(directory, "wrangler.data.jsonc")),
    /ENOENT/,
  );
});
