import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PRODUCTION_WORKERS = [
  "data",
  "discord-rest",
  "gateway",
  "interactions",
  "roll",
  "web-api",
];

const FULL_SHA = /^[0-9a-f]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const MAX_VALUES_BYTES = 16 * 1024;
const FRONTEND_ORIGIN = "https://dicewit.ch";
const CRYPTO_ALIAS = "./packages/roll-domain/src/worker-crypto.ts";
const CRYPTO_ALIAS_WORKERS = new Set(["data", "gateway", "interactions", "roll"]);
const DATABASE_NAME = "dice-witch-production";
const DATABASE_ID = "9a8f7de1-8fa6-400b-8694-609fde81f2db";
const SECRETS_STORE_ID = "68e7aff3814e40d0afbcf2a9f4357d8f";
const DISCORD_APPLICATION_ID = "808161585876697108";
const ROLL_LIFECYCLE_TELEMETRY_VERSION = "2";
const PRODUCTION_APPEARANCE_CATALOG_POLICY = "r37";
const PRODUCTION_ROLL_VIEW_POLICY = "r38";
const REQUIRED_VALUE_KEYS = [
  "d1DatabaseId",
  "d1DatabaseName",
  "discordApplicationId",
  "discordTestGuildId",
  "frontendOrigin",
  "gameDetectionChannelId",
  "inviteLink",
  "logOutputChannelId",
  "rollLifecycleAlertChannelId",
  "secretsStoreId",
  "supportServerLink",
  "version",
];
const REQUIRED_BINDINGS = {
  data: {
    AI: "ai",
    APPEARANCE_CATALOG_POLICY: "plain_text",
    DATA: "d1",
    DISCORD_REST: "service",
  },
  "discord-rest": {
    DISCORD_APPLICATION_ID: "plain_text",
    DISCORD_BOT_LIST_KEY: "secrets_store_secret",
    DISCORD_BOT_TOKEN: "secrets_store_secret",
    DISCORD_TEST_GUILD_ID: "plain_text",
    GAME_DETECTION_CHANNEL_ID: "plain_text",
    INVITE_LINK: "plain_text",
    LOG_OUTPUT_CHANNEL_ID: "plain_text",
    ROLL_LIFECYCLE_ALERT_CHANNEL_ID: "plain_text",
    SUPPORT_SERVER_LINK: "plain_text",
    TOPGG_KEY: "secrets_store_secret",
  },
  gateway: {
    DATA_SERVICE: "service",
    DISCORD_APPLICATION_ID: "plain_text",
    DISCORD_BOT_TOKEN: "secrets_store_secret",
    DISCORD_GATEWAY_BOT_URL: "plain_text",
    DISCORD_REST: "service",
    DISCORD_TEST_GUILD_ID: "plain_text",
    GATEWAY_ALLOWED_HOSTNAME: "plain_text",
    GATEWAY_CONTROL_TOKEN: "secrets_store_secret",
    GATEWAY_COORDINATOR: "durable_object_namespace",
    GATEWAY_FLEET_CONNECTION_CAPACITY: "plain_text",
    GATEWAY_MODE: "plain_text",
    GATEWAY_PARTITION: "durable_object_namespace",
    GATEWAY_PARTITION_CAPACITY: "plain_text",
  },
  interactions: {
    DATA_SERVICE: "service",
    DISCORD_APPLICATION_ID: "plain_text",
    DISCORD_PUBLIC_KEY: "secrets_store_secret",
    DISCORD_REST: "service",
    GATEWAY_STATUS: "service",
    INVITE_LINK: "plain_text",
    ROLL_LIFECYCLE_TELEMETRY_VERSION: "plain_text",
    ROLL_WORK: "durable_object_namespace",
    SUPPORT_SERVER_LINK: "plain_text",
    WEB_APP_URL: "plain_text",
    WEB_DELIVERY_WORK: "durable_object_namespace",
  },
  roll: {
    DATA_SERVICE: "service",
    DISCORD_MESSAGE_PROBE: "service",
    DISCORD_REST: "service",
    GATEWAY_STATUS: "service",
    LOG_WORK: "durable_object_namespace",
    ROLL_RENDER_VERSION: "plain_text",
    ROLL_VIEW_POLICY: "plain_text",
    ROLL_WORK: "durable_object_namespace",
    WEB_DELIVERY_WORK: "durable_object_namespace",
  },
  "web-api": {
    APPEARANCE_CATALOG_POLICY: "plain_text",
    ASSETS: "assets",
    BUILD_SHA: "plain_text",
    BUILD_TIME: "plain_text",
    DATA_SERVICE: "service",
    DISCORD_CLIENT_ID: "plain_text",
    DISCORD_CLIENT_SECRET: "secrets_store_secret",
    DISCORD_REDIRECT_URI: "plain_text",
    DISCORD_REST: "service",
    ENVIRONMENT: "plain_text",
    FRONTEND_ORIGIN: "plain_text",
    INTERACTIONS_SERVICE: "service",
    ROLL_WEB: "service",
  },
};
const SECRET_NAMES = {
  "discord-rest": {
    DISCORD_BOT_LIST_KEY: "DICE_WITCH_PRODUCTION_DISCORD_BOT_LIST_KEY",
    DISCORD_BOT_TOKEN: "DICE_WITCH_PRODUCTION_DISCORD_BOT_TOKEN",
    TOPGG_KEY: "DICE_WITCH_PRODUCTION_TOPGG_KEY",
  },
  gateway: {
    DISCORD_BOT_TOKEN: "DICE_WITCH_PRODUCTION_DISCORD_BOT_TOKEN",
    GATEWAY_CONTROL_TOKEN: "DICE_WITCH_PRODUCTION_GATEWAY_CONTROL_TOKEN",
  },
  interactions: {
    DISCORD_PUBLIC_KEY: "DICE_WITCH_PRODUCTION_DISCORD_PUBLIC_KEY",
  },
  "web-api": {
    DISCORD_CLIENT_SECRET: "DICE_WITCH_PRODUCTION_DISCORD_CLIENT_SECRET",
  },
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeValues(encodedValues) {
  if (
    typeof encodedValues !== "string" ||
    encodedValues.length === 0 ||
    encodedValues.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encodedValues)
  ) {
    throw new Error("Production values bundle is invalid");
  }
  const decoded = Buffer.from(encodedValues, "base64");
  if (decoded.byteLength > MAX_VALUES_BYTES) {
    throw new Error("Production values bundle exceeds 16 KiB");
  }
  let values;
  try {
    values = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("Production values bundle is invalid");
  }
  if (
    !isRecord(values) ||
    Object.keys(values).sort().join(",") !== REQUIRED_VALUE_KEYS.join(",") ||
    values.version !== 1 ||
    values.d1DatabaseName !== DATABASE_NAME ||
    values.d1DatabaseId !== DATABASE_ID ||
    values.secretsStoreId !== SECRETS_STORE_ID ||
    values.discordApplicationId !== DISCORD_APPLICATION_ID ||
    !SNOWFLAKE.test(values.discordTestGuildId ?? "") ||
    !SNOWFLAKE.test(values.logOutputChannelId ?? "") ||
    !SNOWFLAKE.test(values.rollLifecycleAlertChannelId ?? "") ||
    !SNOWFLAKE.test(values.gameDetectionChannelId ?? "") ||
    new Set([
      values.logOutputChannelId,
      values.rollLifecycleAlertChannelId,
      values.gameDetectionChannelId,
    ]).size !== 3 ||
    values.frontendOrigin !== FRONTEND_ORIGIN
  ) {
    throw new Error("Production values bundle is invalid");
  }
  for (const key of ["inviteLink", "supportServerLink"]) {
    let url;
    try {
      url = new URL(values[key]);
    } catch {
      throw new Error(`Production ${key} must be a valid HTTPS URL`);
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error(`Production ${key} must be a valid HTTPS URL`);
    }
  }
  return values;
}

function productionName(worker) {
  return `dice-witch-${worker}-production`;
}

function productionServices(services = []) {
  return services.map((service) => ({
    ...service,
    service: service.service.replace(/-staging$/, "-production"),
  }));
}

function productionSecrets(worker, storeId) {
  const names = SECRET_NAMES[worker] ?? {};
  return Object.entries(names).map(([binding, secret_name]) => ({
    binding,
    store_id: storeId,
    secret_name,
  }));
}

function baseConfig(template, worker) {
  return {
    ...structuredClone(template),
    name: productionName(worker),
    workers_dev: false,
    ...(template.services === undefined
      ? {}
      : { services: productionServices(template.services) }),
  };
}

async function loadTemplates(templateDirectory) {
  const entries = await Promise.all(
    PRODUCTION_WORKERS.map(async (worker) => [
      worker,
      JSON.parse(
        await readFile(
          path.join(templateDirectory, `wrangler.${worker}.staging.example.jsonc`),
          "utf8",
        ),
      ),
    ]),
  );
  return Object.fromEntries(entries);
}

function materializeFromTemplates(templates, values, buildSha, buildTime) {
  const configs = Object.fromEntries(
    PRODUCTION_WORKERS.map((worker) => [worker, baseConfig(templates[worker], worker)]),
  );

  configs.data.d1_databases[0] = {
    ...configs.data.d1_databases[0],
    database_name: values.d1DatabaseName,
    database_id: values.d1DatabaseId,
  };

  configs["discord-rest"].vars = {
    DISCORD_APPLICATION_ID: values.discordApplicationId,
    DISCORD_TEST_GUILD_ID: values.discordTestGuildId,
    INVITE_LINK: values.inviteLink,
    SUPPORT_SERVER_LINK: values.supportServerLink,
    LOG_OUTPUT_CHANNEL_ID: values.logOutputChannelId,
    ROLL_LIFECYCLE_ALERT_CHANNEL_ID: values.rollLifecycleAlertChannelId,
    GAME_DETECTION_CHANNEL_ID: values.gameDetectionChannelId,
  };
  configs["discord-rest"].secrets_store_secrets = productionSecrets(
    "discord-rest",
    values.secretsStoreId,
  );

  configs.gateway.triggers = {
    crons: ["0 * * * *", "*/5 * * * *", "30 */4 * * *"],
  };
  configs.gateway.vars = {
    ...configs.gateway.vars,
    DISCORD_APPLICATION_ID: values.discordApplicationId,
    DISCORD_TEST_GUILD_ID: values.discordTestGuildId,
    GATEWAY_PARTITION_CAPACITY: "6",
    GATEWAY_FLEET_CONNECTION_CAPACITY: "6",
  };
  configs.gateway.secrets_store_secrets = productionSecrets(
    "gateway",
    values.secretsStoreId,
  );

  configs.interactions.vars = {
    ROLL_LIFECYCLE_TELEMETRY_VERSION,
    DISCORD_APPLICATION_ID: values.discordApplicationId,
    INVITE_LINK: values.inviteLink,
    SUPPORT_SERVER_LINK: values.supportServerLink,
    WEB_APP_URL: `${values.frontendOrigin}/app`,
  };
  configs.interactions.secrets_store_secrets = productionSecrets(
    "interactions",
    values.secretsStoreId,
  );
  for (const binding of configs.interactions.durable_objects.bindings) {
    binding.script_name = productionName("roll");
  }

  configs.roll.vars = {
    ...configs.roll.vars,
    ROLL_VIEW_POLICY: PRODUCTION_ROLL_VIEW_POLICY,
  };

  configs["web-api"].routes = [
    { pattern: new URL(values.frontendOrigin).hostname, custom_domain: true },
  ];
  configs.data.vars = {
    APPEARANCE_CATALOG_POLICY: PRODUCTION_APPEARANCE_CATALOG_POLICY,
  };

  configs["web-api"].vars = {
    APPEARANCE_CATALOG_POLICY: PRODUCTION_APPEARANCE_CATALOG_POLICY,
    DISCORD_CLIENT_ID: values.discordApplicationId,
    DISCORD_REDIRECT_URI: `${values.frontendOrigin}/api/auth/callback/discord`,
    FRONTEND_ORIGIN: values.frontendOrigin,
    ENVIRONMENT: "production",
    BUILD_SHA: buildSha,
    BUILD_TIME: buildTime,
  };
  configs["web-api"].secrets_store_secrets = productionSecrets(
    "web-api",
    values.secretsStoreId,
  );

  return configs;
}

function bindingNames(bindings = []) {
  return bindings.map(({ binding }) => binding).sort();
}

function configuredBindingTypes(config) {
  const entries = [
    ...Object.keys(config.vars ?? {}).map((name) => [name, "plain_text"]),
    ...(config.services ?? []).map(({ binding }) => [binding, "service"]),
    ...(config.secrets_store_secrets ?? []).map(({ binding }) => [
      binding,
      "secrets_store_secret",
    ]),
    ...(config.durable_objects?.bindings ?? []).map(({ name }) => [
      name,
      "durable_object_namespace",
    ]),
    ...(config.d1_databases ?? []).map(({ binding }) => [binding, "d1"]),
    ...(config.ai?.binding === undefined
      ? []
      : [[config.ai.binding, "ai"]]),
    ...(config.assets?.binding === undefined
      ? []
      : [[config.assets.binding, "assets"]]),
  ];
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

export function validateProductionConfigs(configs, expectedSha) {
  if (!isRecord(configs) || !FULL_SHA.test(expectedSha ?? "")) {
    throw new Error("Production configuration validation input is invalid");
  }
  const errors = [];
  for (const worker of PRODUCTION_WORKERS) {
    const config = configs[worker];
    if (!isRecord(config)) {
      errors.push(`${worker} configuration is required`);
      continue;
    }
    if (config.name !== productionName(worker)) {
      errors.push(`${worker} production name is invalid`);
    }
    if (config.workers_dev !== false || config.preview_urls !== false) {
      errors.push(`${worker} public preview settings are invalid`);
    }
    if (
      CRYPTO_ALIAS_WORKERS.has(worker) &&
      (!isRecord(config.alias) ||
        Object.keys(config.alias).join(",") !== "crypto" ||
        config.alias.crypto !== CRYPTO_ALIAS)
    ) {
      errors.push(`${worker} crypto alias is invalid`);
    }
    if (JSON.stringify(config).includes("REPLACE_WITH_") || JSON.stringify(config).includes("-staging")) {
      errors.push(`${worker} contains a staging value or placeholder`);
    }
    if (
      JSON.stringify(configuredBindingTypes(config)) !==
      JSON.stringify(REQUIRED_BINDINGS[worker])
    ) {
      errors.push(`${worker} required binding contract is incomplete`);
    }
    for (const service of config.services ?? []) {
      if (!service.service?.endsWith("-production")) {
        errors.push(`${worker} service ${service.binding} is not production-scoped`);
      }
    }
    const expectedSecrets = Object.keys(SECRET_NAMES[worker] ?? {}).sort();
    if (bindingNames(config.secrets_store_secrets).join(",") !== expectedSecrets.join(",")) {
      errors.push(`${worker} Secrets Store bindings are incomplete`);
    }
  }
  if (configs.data?.d1_databases?.[0]?.database_name !== DATABASE_NAME) {
    errors.push("Production D1 database name is invalid");
  }
  if (configs.roll?.vars?.ROLL_RENDER_VERSION !== "4") {
    errors.push("Production Roll render version must be 4");
  }
  if (
    configs.roll?.vars?.ROLL_VIEW_POLICY !== PRODUCTION_ROLL_VIEW_POLICY
  ) {
    errors.push(
      `Production Roll view policy must be ${PRODUCTION_ROLL_VIEW_POLICY}`,
    );
  }
  if (
    configs.data?.vars?.APPEARANCE_CATALOG_POLICY !==
    PRODUCTION_APPEARANCE_CATALOG_POLICY
  ) {
    errors.push(
      `Production Data appearance catalog policy must be ${PRODUCTION_APPEARANCE_CATALOG_POLICY}`,
    );
  }
  if (
    configs["web-api"]?.vars?.APPEARANCE_CATALOG_POLICY !==
    PRODUCTION_APPEARANCE_CATALOG_POLICY
  ) {
    errors.push(
      `Production Web API appearance catalog policy must be ${PRODUCTION_APPEARANCE_CATALOG_POLICY}`,
    );
  }
  if (
    configs.interactions?.durable_objects?.bindings?.length !== 2 ||
    configs.interactions.durable_objects.bindings.some(
      (binding) => binding.script_name !== productionName("roll"),
    )
  ) {
    errors.push("Interactions Roll Durable Object targets are invalid");
  }
  if (
    configs.interactions?.vars?.ROLL_LIFECYCLE_TELEMETRY_VERSION !== "1" &&
    configs.interactions?.vars?.ROLL_LIFECYCLE_TELEMETRY_VERSION !== "2"
  ) {
    errors.push("Interactions lifecycle telemetry version is invalid");
  }
  if (configs["web-api"]?.vars?.ENVIRONMENT !== "production") {
    errors.push("Web API environment must be production");
  }
  if (configs["web-api"]?.vars?.BUILD_SHA !== expectedSha) {
    errors.push("Web API BUILD_SHA does not match the requested SHA");
  }
  if (configs["web-api"]?.vars?.FRONTEND_ORIGIN !== FRONTEND_ORIGIN) {
    errors.push("Web API production origin is invalid");
  }
  if (
    JSON.stringify(configs.data?.triggers) !==
    JSON.stringify({ crons: ["* * * * *", "0 3 * * *"] })
  ) {
    errors.push("Production Data lifecycle and retention schedules are invalid");
  }
  if (
    JSON.stringify(configs.gateway?.triggers) !==
    JSON.stringify({
      crons: ["0 * * * *", "*/5 * * * *", "30 */4 * * *"],
    })
  ) {
    errors.push("Production Gateway schedules are invalid");
  }
  if (errors.length > 0) {
    throw new Error(`Production configuration is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
  return {
    buildSha: expectedSha,
    discordApplicationId: configs["discord-rest"].vars.DISCORD_APPLICATION_ID,
    frontendOrigin: configs["web-api"].vars.FRONTEND_ORIGIN,
    workerNames: PRODUCTION_WORKERS.map((worker) => configs[worker].name),
  };
}

export async function materializeProductionConfigs({
  encodedValues,
  buildSha,
  buildTime,
  templateDirectory,
  configDirectory,
}) {
  if (!FULL_SHA.test(buildSha ?? "")) {
    throw new Error("Production build SHA must be a full commit SHA");
  }
  if (!ISO_TIMESTAMP.test(buildTime ?? "") || Number.isNaN(Date.parse(buildTime))) {
    throw new Error("Production build time must be an ISO 8601 timestamp");
  }
  const values = decodeValues(encodedValues);
  const configs = materializeFromTemplates(
    await loadTemplates(templateDirectory),
    values,
    buildSha,
    buildTime,
  );
  validateProductionConfigs(configs, buildSha);

  await mkdir(configDirectory, { recursive: true });
  const temporaryDirectory = path.join(configDirectory, `.production-config-${process.pid}`);
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { mode: 0o700 });
  try {
    for (const worker of PRODUCTION_WORKERS) {
      await writeFile(
        path.join(temporaryDirectory, `wrangler.${worker}.jsonc`),
        `${JSON.stringify(configs[worker], null, 2)}\n`,
        { mode: 0o600 },
      );
    }
    for (const worker of PRODUCTION_WORKERS) {
      await rename(
        path.join(temporaryDirectory, `wrangler.${worker}.jsonc`),
        path.join(configDirectory, `wrangler.${worker}.jsonc`),
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  return validateProductionConfigs(configs, buildSha);
}

async function main() {
  const [flag, value, ...extra] = process.argv.slice(2);
  if (flag !== "--config-dir" || value === undefined || extra.length !== 0) {
    throw new Error("Usage: node tools/production-config.mjs --config-dir <directory>");
  }
  const configDirectory = path.resolve(value);
  const summary = await materializeProductionConfigs({
    encodedValues: process.env.PRODUCTION_VALUES_B64,
    buildSha: process.env.PRODUCTION_BUILD_SHA,
    buildTime: process.env.PRODUCTION_BUILD_TIME,
    templateDirectory: configDirectory,
    configDirectory,
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
