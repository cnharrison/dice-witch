import assert from "node:assert/strict";
import test from "node:test";
import {
  validateForbiddenTargets,
  validateStagingConfigs,
} from "./staging-config.mjs";

const applicationId = "100000000000000001";
const testGuildId = "100000000000000002";
const origin = "https://staging.example.com";

function baseConfig(name, main) {
  return {
    name,
    main,
    compatibility_date: "2026-07-10",
    workers_dev: false,
    preview_urls: false,
    observability: { enabled: true },
  };
}

function service(binding, serviceName, entrypoint) {
  return {
    binding,
    service: serviceName,
    ...(entrypoint === undefined ? {} : { entrypoint }),
  };
}

function validConfigs() {
  const dataName = "dice-witch-data-staging";
  const restName = "dice-witch-discord-rest-staging";
  const rollName = "dice-witch-roll-staging";
  const gatewayName = "dice-witch-gateway-staging";
  const interactionsName = "dice-witch-interactions-staging";
  return {
    data: {
      ...baseConfig(dataName, "workers/data/src/index.ts"),
      d1_databases: [
        {
          binding: "DATA",
          database_name: "dice-witch-staging",
          database_id: "123e4567-e89b-42d3-a456-426614174000",
          migrations_dir: "migrations/data",
        },
      ],
    },
    "discord-rest": {
      ...baseConfig(restName, "workers/discord-rest/src/index.ts"),
      vars: {
        DISCORD_APPLICATION_ID: applicationId,
        DISCORD_TEST_GUILD_ID: testGuildId,
        INVITE_LINK: `https://discord.com/api/oauth2/authorize?client_id=${applicationId}`,
        SUPPORT_SERVER_LINK: "https://example.com/support",
        LOG_OUTPUT_CHANNEL_ID: "100000000000000003",
      },
    },
    roll: {
      ...baseConfig(rollName, "workers/roll/src/index.ts"),
      alias: { crypto: "./packages/roll-domain/src/worker-crypto.ts" },
      vars: { ROLL_RENDER_VERSION: "4" },
      services: [
        service("DATA_SERVICE", dataName),
        service("DISCORD_REST", restName, "DiscordRestService"),
        service("GATEWAY_STATUS", gatewayName, "GatewayStatusService"),
      ],
      durable_objects: {
        bindings: [
          { name: "ROLL_WORK", class_name: "RollWork" },
          { name: "LOG_WORK", class_name: "LogWork" },
          { name: "WEB_DELIVERY_WORK", class_name: "WebDeliveryWork" },
        ],
      },
      migrations: [
        { tag: "v1", new_sqlite_classes: ["RollWork"] },
        { tag: "v2", new_sqlite_classes: ["LogWork"] },
        { tag: "v3", new_sqlite_classes: ["WebDeliveryWork"] },
      ],
      rules: [
        {
          type: "CompiledWasm",
          globs: ["**/*.wasm"],
          fallthrough: true,
        },
        { type: "Data", globs: ["**/*.ttf"], fallthrough: true },
      ],
    },
    gateway: {
      ...baseConfig(gatewayName, "workers/gateway/src/index.ts"),
      workers_dev: true,
      triggers: { crons: ["*/5 * * * *"] },
      alias: { crypto: "./packages/roll-domain/src/worker-crypto.ts" },
      vars: {
        DISCORD_APPLICATION_ID: applicationId,
        DISCORD_TEST_GUILD_ID: testGuildId,
        DISCORD_GATEWAY_BOT_URL: "https://discord.com/api/v10/gateway/bot",
        GATEWAY_MODE: "fleet",
        GATEWAY_ALLOWED_HOSTNAME: "gateway.discord.gg",
        GATEWAY_PARTITION_CAPACITY: "2",
        GATEWAY_FLEET_CONNECTION_CAPACITY: "6",
      },
      services: [
        service("DATA_SERVICE", dataName),
        service("DISCORD_REST", restName, "DiscordRestService"),
      ],
      durable_objects: {
        bindings: [
          { name: "GATEWAY_PARTITION", class_name: "GatewayPartition" },
          { name: "GATEWAY_COORDINATOR", class_name: "GatewayCoordinator" },
        ],
      },
      migrations: [
        { tag: "v1", new_sqlite_classes: ["GatewayPartition"] },
        { tag: "v2", new_sqlite_classes: ["GatewayCoordinator"] },
      ],
    },
    interactions: {
      ...baseConfig(interactionsName, "workers/interactions/src/index.ts"),
      workers_dev: true,
      vars: {
        DISCORD_APPLICATION_ID: applicationId,
        DISCORD_TEST_GUILD_ID: testGuildId,
        INVITE_LINK: `https://discord.com/api/oauth2/authorize?client_id=${applicationId}`,
        SUPPORT_SERVER_LINK: "https://example.com/support",
        WEB_APP_URL: `${origin}/app`,
      },
      services: [
        service("DATA_SERVICE", dataName),
        service("GATEWAY_STATUS", gatewayName, "GatewayStatusService"),
      ],
      durable_objects: {
        bindings: [
          {
            name: "ROLL_WORK",
            class_name: "RollWork",
            script_name: rollName,
          },
        ],
      },
    },
    "web-api": {
      ...baseConfig(
        "dice-witch-web-api-staging",
        "workers/web-api/src/index.ts",
      ),
      workers_dev: true,
      vars: {
        DISCORD_CLIENT_ID: applicationId,
        DISCORD_REDIRECT_URI: `${origin}/api/auth/callback/discord`,
        FRONTEND_ORIGIN: origin,
        ENVIRONMENT: "staging",
        BUILD_SHA: "b".repeat(40),
        BUILD_TIME: "2026-07-15T12:00:00.000Z",
      },
      assets: {
        directory: "../frontend/dist",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*", "/interactions"],
      },
      services: [
        service("DATA_SERVICE", dataName),
        service("DISCORD_REST", restName, "DiscordRestService"),
        service("ROLL_WEB", rollName, "WebRollService"),
        service("INTERACTIONS_SERVICE", interactionsName),
      ],
    },
  };
}

test("accepts an isolated and internally consistent staging fleet", () => {
  const summary = validateStagingConfigs(validConfigs());

  assert.equal(summary.suffix, "staging");
  assert.equal(summary.frontendOrigin, origin);
  assert.equal(summary.d1DatabaseName, "dice-witch-staging");
  assert.equal(summary.buildSha, "b".repeat(40));
  assert.deepEqual(summary.workerNames, [
    "dice-witch-data-staging",
    "dice-witch-discord-rest-staging",
    "dice-witch-gateway-staging",
    "dice-witch-interactions-staging",
    "dice-witch-roll-staging",
    "dice-witch-web-api-staging",
  ]);
});

test("allows only the staging suffix or an adopted poc suffix", () => {
  const adopted = JSON.parse(
    JSON.stringify(validConfigs()).replaceAll("-staging", "-poc"),
  );
  assert.doesNotThrow(() => validateStagingConfigs(adopted));

  const invalid = JSON.parse(
    JSON.stringify(validConfigs()).replaceAll("-staging", "-production-copy"),
  );
  assert.throws(
    () => validateStagingConfigs(invalid),
    /Staging Worker suffix must be staging or poc/,
  );
});

test("rejects routes, unsafe Crons, and undeclared bindings outside the staging contract", () => {
  const routed = validConfigs();
  routed["web-api"].routes = [
    { pattern: "www.example.com", custom_domain: true },
  ];
  assert.throws(
    () => validateStagingConfigs(routed),
    /Web API route must match the staging frontend hostname/,
  );

  const scheduled = validConfigs();
  scheduled.gateway.triggers = { crons: ["0 * * * *"] };
  assert.throws(
    () => validateStagingConfigs(scheduled),
    /Gateway audience snapshot schedule is invalid/,
  );

  const extraBinding = validConfigs();
  extraBinding.roll.services.push({
    binding: "EXTRA_DATA",
    service: "dice-witch-data-production",
  });
  assert.throws(
    () => validateStagingConfigs(extraBinding),
    /roll service bindings must be exactly DATA_SERVICE, DISCORD_REST, GATEWAY_STATUS/,
  );

  const legacyRollEmission = validConfigs();
  legacyRollEmission.roll.vars.ROLL_RENDER_VERSION = "3";
  assert.throws(
    () => validateStagingConfigs(legacyRollEmission),
    /Staging Roll ROLL_RENDER_VERSION must equal 4/,
  );

  const unsafeAssetRule = validConfigs();
  unsafeAssetRule.roll.rules = [
    { type: "Text", globs: ["../.env"], fallthrough: true },
  ];
  assert.throws(
    () => validateStagingConfigs(unsafeAssetRule),
    /Roll asset rules are invalid/,
  );

  const transferredClass = validConfigs();
  transferredClass.roll.migrations.push({
    tag: "v2",
    transferred_classes: [
      {
        from: "RollWork",
        from_script: "dice-witch-roll-production",
        to: "RollWork",
      },
    ],
  });
  assert.throws(
    () => validateStagingConfigs(transferredClass),
    /Roll Durable Object migrations are invalid/,
  );

  const extraDurableObject = validConfigs();
  extraDurableObject.interactions.durable_objects.bindings.push({
    name: "PRODUCTION_WORK",
    class_name: "RollWork",
    script_name: "dice-witch-roll-production",
  });
  assert.throws(
    () => validateStagingConfigs(extraDurableObject),
    /interactions Durable Object bindings must be exactly ROLL_WORK/,
  );
});

test("rejects a service binding that escapes the staging fleet", () => {
  const configs = validConfigs();
  configs.roll.services[0].service = "dice-witch-data";

  assert.throws(
    () => validateStagingConfigs(configs),
    /roll DATA_SERVICE must target dice-witch-data-staging/,
  );
});

test("rejects non-canonical origins before exporting workflow environment values", () => {
  const configs = validConfigs();
  configs["web-api"].vars.FRONTEND_ORIGIN = `${origin}\nINJECTED=value`;

  assert.throws(
    () => validateStagingConfigs(configs),
    /Web API FRONTEND_ORIGIN must be an HTTPS origin/,
  );
});

test("rejects inconsistent Discord and browser identities", () => {
  const configs = validConfigs();
  configs.gateway.vars.DISCORD_APPLICATION_ID = "100000000000000099";
  configs.interactions.vars.WEB_APP_URL = "https://wrong.example.com/app";

  assert.throws(
    () => validateStagingConfigs(configs),
    /Gateway Discord application id must match|WEB_APP_URL must equal/,
  );
});

test("keeps the Data Worker private", () => {
  const configs = validConfigs();
  configs.data.workers_dev = true;

  assert.throws(
    () => validateStagingConfigs(configs),
    /Staging Data Worker must disable workers_dev/,
  );
});

test("accepts only complete staging Secrets Store binding sets", () => {
  const configs = validConfigs();
  configs["web-api"].secrets_store_secrets = [
    {
      binding: "DISCORD_CLIENT_SECRET",
      store_id: "d".repeat(32),
      secret_name: "DICE_WITCH_PRODUCTION_DISCORD_CLIENT_SECRET",
    },
  ];

  assert.throws(
    () => validateStagingConfigs(configs),
    /web-api Secrets Store bindings are invalid/,
  );
});

test("requires a private production-target denylist before deployment", () => {
  const configs = validConfigs();
  const denylist = {
    d1DatabaseIds: ["223e4567-e89b-42d3-a456-426614174000"],
    workerNames: [
      "dice-witch-data-production",
      "dice-witch-discord-rest-production",
      "dice-witch-gateway-production",
      "dice-witch-interactions-production",
      "dice-witch-roll-production",
      "dice-witch-web-api-production",
    ],
    origins: ["https://www.example.com"],
    discordApplicationIds: ["100000000000000099"],
    secretsStoreSecretNames: ["DICE_WITCH_PRODUCTION_DISCORD_CLIENT_SECRET"],
  };
  const encoded = Buffer.from(JSON.stringify(denylist)).toString("base64");

  assert.doesNotThrow(() => validateForbiddenTargets(configs, encoded));

  configs["web-api"].secrets_store_secrets = [
    {
      binding: "DISCORD_CLIENT_SECRET",
      store_id: "c".repeat(32),
      secret_name: "DICE_WITCH_STAGING_DISCORD_CLIENT_SECRET",
    },
  ];
  assert.doesNotThrow(() => validateForbiddenTargets(configs, encoded));
  configs["web-api"].secrets_store_secrets[0].secret_name =
    denylist.secretsStoreSecretNames[0];
  assert.throws(
    () => validateForbiddenTargets(configs, encoded),
    /Staging configuration targets a forbidden Secrets Store secret/,
  );

  configs["web-api"].secrets_store_secrets = undefined;
  configs.data.d1_databases[0].database_id = denylist.d1DatabaseIds[0];
  assert.throws(
    () => validateForbiddenTargets(configs, encoded),
    /Staging D1 binding targets a forbidden database/,
  );
});

test("requires exact staging build metadata", () => {
  const configs = validConfigs();
  configs["web-api"].vars.ENVIRONMENT = "production";
  configs["web-api"].vars.BUILD_SHA = "short";
  configs["web-api"].vars.BUILD_TIME = "tomorrow";

  assert.throws(
    () => validateStagingConfigs(configs),
    /ENVIRONMENT must equal staging|BUILD_SHA must be a full commit SHA|BUILD_TIME must be an ISO 8601 timestamp/,
  );
});
