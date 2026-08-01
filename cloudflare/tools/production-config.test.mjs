import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  materializeProductionConfigs,
  PRODUCTION_WORKERS,
} from "./production-config.mjs";

const sha = "a".repeat(40);
const buildTime = "2026-07-25T04:21:05.000Z";
const templateDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function values(overrides = {}) {
  return {
    version: 1,
    d1DatabaseName: "dice-witch-production",
    d1DatabaseId: "9a8f7de1-8fa6-400b-8694-609fde81f2db",
    secretsStoreId: "68e7aff3814e40d0afbcf2a9f4357d8f",
    discordApplicationId: "808161585876697108",
    discordTestGuildId: "778373871061434408",
    inviteLink: "https://discord.com/oauth2/authorize",
    supportServerLink: "https://discord.gg/example",
    logOutputChannelId: "809246262888890419",
    rollLifecycleAlertChannelId: "809246262888890420",
    frontendOrigin: "https://dicewit.ch",
    gameDetectionChannelId: "809246262888890421",
    ...overrides,
  };
}

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

test("materializes exact production configs from source templates and bounded values", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dw-production-"));
  const summary = await materializeProductionConfigs({
    encodedValues: encode(values()),
    buildSha: sha,
    buildTime,
    templateDirectory,
    configDirectory: directory,
  });

  assert.equal(summary.buildSha, sha);
  assert.equal(summary.frontendOrigin, "https://dicewit.ch");
  assert.deepEqual(
    summary.workerNames,
    PRODUCTION_WORKERS.map((worker) => `dice-witch-${worker}-production`),
  );
  const web = JSON.parse(
    await readFile(path.join(directory, "wrangler.web-api.jsonc"), "utf8"),
  );
  const gateway = JSON.parse(
    await readFile(path.join(directory, "wrangler.gateway.jsonc"), "utf8"),
  );
  const data = JSON.parse(
    await readFile(path.join(directory, "wrangler.data.jsonc"), "utf8"),
  );
  const discordRest = JSON.parse(
    await readFile(path.join(directory, "wrangler.discord-rest.jsonc"), "utf8"),
  );
  const interactions = JSON.parse(
    await readFile(path.join(directory, "wrangler.interactions.jsonc"), "utf8"),
  );
  const roll = JSON.parse(
    await readFile(path.join(directory, "wrangler.roll.jsonc"), "utf8"),
  );
  assert.equal(web.vars.BUILD_SHA, sha);
  assert.equal(
    data.services.find(({ binding }) => binding === "DISCORD_REST")?.service,
    "dice-witch-discord-rest-production",
  );
  assert.deepEqual(data.triggers, {
    crons: ["* * * * *", "0 3 * * *"],
  });
  assert.equal(
    discordRest.vars.ROLL_LIFECYCLE_ALERT_CHANNEL_ID,
    "809246262888890420",
  );
  assert.equal(
    discordRest.vars.GAME_DETECTION_CHANNEL_ID,
    "809246262888890421",
  );
  assert.deepEqual(data.ai, { binding: "AI" });
  assert.equal(interactions.vars.DISCORD_TEST_GUILD_ID, undefined);
  assert.equal(interactions.vars.ROLL_LIFECYCLE_TELEMETRY_VERSION, "2");
  assert.deepEqual(interactions.observability, {
    enabled: true,
    logs: { invocation_logs: true, head_sampling_rate: 1 },
  });
  assert.deepEqual(interactions.alias, {
    crypto: "./packages/roll-domain/src/worker-crypto.ts",
  });
  assert.equal(
    roll.services.find(({ binding }) => binding === "DISCORD_MESSAGE_PROBE")
      ?.entrypoint,
    "DiscordMessageProbeService",
  );
  assert.equal(web.vars.ENVIRONMENT, "production");
  assert.deepEqual(web.routes, [{ pattern: "dicewit.ch", custom_domain: true }]);
  assert.deepEqual(gateway.triggers, {
    crons: ["0 * * * *", "*/5 * * * *", "30 */4 * * *"],
  });
  assert.equal(
    (await stat(path.join(directory, "wrangler.roll.jsonc"))).mode & 0o777,
    0o600,
  );
});

test("rejects malformed, incomplete, or wrong-target production values", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dw-production-"));
  for (const encodedValues of [
    "not-base64!",
    encode(values({ frontendOrigin: "https://staging.example.com" })),
    encode(values({ d1DatabaseId: "11111111-1111-4111-8111-111111111111" })),
    encode(values({ gameDetectionChannelId: "809246262888890419" })),
    encode(Object.fromEntries(Object.entries(values()).filter(([key]) => key !== "secretsStoreId"))),
    Buffer.alloc(20_000).toString("base64"),
  ]) {
    await assert.rejects(
      materializeProductionConfigs({
        encodedValues,
        buildSha: sha,
        buildTime,
        templateDirectory,
        configDirectory: directory,
      }),
      /Production values bundle/,
    );
  }
});

test("validates every config before publishing any materialized file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dw-production-"));
  const badTemplates = await mkdtemp(path.join(os.tmpdir(), "dw-production-templates-"));
  for (const worker of PRODUCTION_WORKERS) {
    const template = JSON.parse(
      await readFile(
        path.join(templateDirectory, `wrangler.${worker}.staging.example.jsonc`),
        "utf8",
      ),
    );
    if (worker === "roll") {
      template.services = template.services.filter(
        ({ binding }) => binding !== "GATEWAY_STATUS",
      );
    }
    await writeFile(
      path.join(badTemplates, `wrangler.${worker}.staging.example.jsonc`),
      JSON.stringify(template),
    );
  }
  await assert.rejects(
    materializeProductionConfigs({
      encodedValues: encode(values()),
      buildSha: sha,
      buildTime,
      templateDirectory: badTemplates,
      configDirectory: directory,
    }),
    /roll required binding contract is incomplete/,
  );
  await assert.rejects(
    readFile(path.join(directory, "wrangler.roll.jsonc")),
    /ENOENT/,
  );
});
