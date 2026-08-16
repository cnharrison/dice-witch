import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WORKERS = [
  "data",
  "discord-rest",
  "gateway",
  "interactions",
  "roll",
  "web-api",
];
const MAIN_MODULES = {
  data: "workers/data/src/index.ts",
  "discord-rest": "workers/discord-rest/src/index.ts",
  gateway: "workers/gateway/src/index.ts",
  interactions: "workers/interactions/src/index.ts",
  roll: "workers/roll/src/index.ts",
  "web-api": "workers/web-api/src/index.ts",
};
const COMMON_CONFIG_KEYS = [
  "$schema",
  "name",
  "main",
  "compatibility_date",
  "workers_dev",
  "preview_urls",
  "observability",
];
const WORKER_CONFIG_KEYS = {
  data: [
    ...COMMON_CONFIG_KEYS,
    "triggers",
    "alias",
    "ai",
    "d1_databases",
    "services",
    "vars",
  ],
  "discord-rest": [
    ...COMMON_CONFIG_KEYS,
    "vars",
    "secrets_store_secrets",
  ],
  gateway: [
    ...COMMON_CONFIG_KEYS,
    "triggers",
    "alias",
    "vars",
    "services",
    "secrets_store_secrets",
    "durable_objects",
    "migrations",
  ],
  interactions: [
    ...COMMON_CONFIG_KEYS,
    "alias",
    "vars",
    "services",
    "secrets_store_secrets",
    "durable_objects",
  ],
  roll: [
    ...COMMON_CONFIG_KEYS,
    "alias",
    "vars",
    "rules",
    "services",
    "durable_objects",
    "migrations",
  ],
  "web-api": [
    ...COMMON_CONFIG_KEYS,
    "vars",
    "routes",
    "assets",
    "services",
    "secrets_store_secrets",
  ],
};
const WORKER_VAR_NAMES = {
  data: ["APPEARANCE_CATALOG_POLICY"],
  "discord-rest": [
    "DISCORD_APPLICATION_ID",
    "DISCORD_TEST_GUILD_ID",
    "GAME_DETECTION_CHANNEL_ID",
    "INVITE_LINK",
    "SUPPORT_SERVER_LINK",
    "LOG_OUTPUT_CHANNEL_ID",
    "ROLL_LIFECYCLE_ALERT_CHANNEL_ID",
  ],
  gateway: [
    "DISCORD_APPLICATION_ID",
    "DISCORD_TEST_GUILD_ID",
    "DISCORD_GATEWAY_BOT_URL",
    "GATEWAY_MODE",
    "GATEWAY_ALLOWED_HOSTNAME",
    "GATEWAY_PARTITION_CAPACITY",
    "GATEWAY_FLEET_CONNECTION_CAPACITY",
  ],
  interactions: [
    "DISCORD_APPLICATION_ID",
    "DISCORD_TEST_GUILD_ID",
    "INVITE_LINK",
    "SUPPORT_SERVER_LINK",
    "WEB_APP_URL",
    "ROLL_LIFECYCLE_TELEMETRY_VERSION",
  ],
  roll: ["ROLL_RENDER_VERSION", "ROLL_VIEW_POLICY"],
  "web-api": [
    "APPEARANCE_CATALOG_POLICY",
    "DISCORD_CLIENT_ID",
    "DISCORD_REDIRECT_URI",
    "FRONTEND_ORIGIN",
    "ENVIRONMENT",
    "BUILD_SHA",
    "BUILD_TIME",
  ],
};
const STAGING_SECRET_NAMES = {
  "discord-rest": {
    DISCORD_BOT_TOKEN: "DICE_WITCH_STAGING_DISCORD_BOT_TOKEN",
    TOPGG_KEY: "DICE_WITCH_STAGING_TOPGG_KEY",
    DISCORD_BOT_LIST_KEY: "DICE_WITCH_STAGING_DISCORD_BOT_LIST_KEY",
  },
  gateway: {
    DISCORD_BOT_TOKEN: "DICE_WITCH_STAGING_DISCORD_BOT_TOKEN",
    GATEWAY_CONTROL_TOKEN: "DICE_WITCH_STAGING_GATEWAY_CONTROL_TOKEN",
  },
  interactions: {
    DISCORD_PUBLIC_KEY: "DICE_WITCH_STAGING_DISCORD_PUBLIC_KEY",
  },
  "web-api": {
    DISCORD_CLIENT_SECRET: "DICE_WITCH_STAGING_DISCORD_CLIENT_SECRET",
  },
};
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/;
const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function workerName(worker, suffix) {
  return `dice-witch-${worker}-${suffix}`;
}

function service(config, binding) {
  return Array.isArray(config?.services)
    ? config.services.find((candidate) => candidate?.binding === binding)
    : undefined;
}

function durableBinding(config, name) {
  const bindings = config?.durable_objects?.bindings;
  return Array.isArray(bindings)
    ? bindings.find((candidate) => candidate?.name === name)
    : undefined;
}

function requireService(errors, config, owner, binding, target, entrypoint) {
  const configured = service(config, binding);
  if (configured?.service !== target) {
    errors.push(`${owner} ${binding} must target ${target}`);
  }
  if (entrypoint !== undefined && configured?.entrypoint !== entrypoint) {
    errors.push(`${owner} ${binding} must use ${entrypoint}`);
  }
}

function parseFrontendOrigin(errors, webConfig) {
  const value = webConfig?.vars?.FRONTEND_ORIGIN;
  if (typeof value !== "string") {
    errors.push("Web API FRONTEND_ORIGIN is required");
    return null;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== value ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      errors.push("Web API FRONTEND_ORIGIN must be an HTTPS origin");
      return null;
    }
    return url.origin;
  } catch {
    errors.push("Web API FRONTEND_ORIGIN must be a valid URL");
    return null;
  }
}

function validateDiscordIdentity(errors, configs, frontendOrigin) {
  const applicationId = configs["discord-rest"]?.vars?.DISCORD_APPLICATION_ID;
  if (typeof applicationId !== "string" || !SNOWFLAKE.test(applicationId)) {
    errors.push("Discord REST application id must be a Discord snowflake");
    return;
  }
  if (configs.gateway?.vars?.DISCORD_APPLICATION_ID !== applicationId) {
    errors.push("Gateway Discord application id must match Discord REST");
  }
  if (configs.interactions?.vars?.DISCORD_APPLICATION_ID !== applicationId) {
    errors.push("Interactions Discord application id must match Discord REST");
  }
  if (configs["web-api"]?.vars?.DISCORD_CLIENT_ID !== applicationId) {
    errors.push("Web API Discord client id must match Discord REST");
  }

  const logOutputChannelId =
    configs["discord-rest"]?.vars?.LOG_OUTPUT_CHANNEL_ID;
  const rollLifecycleAlertChannelId =
    configs["discord-rest"]?.vars?.ROLL_LIFECYCLE_ALERT_CHANNEL_ID;
  const gameDetectionChannelId =
    configs["discord-rest"]?.vars?.GAME_DETECTION_CHANNEL_ID;
  const channelIds = [
    logOutputChannelId,
    rollLifecycleAlertChannelId,
    gameDetectionChannelId,
  ];
  if (
    channelIds.some((channelId) =>
      typeof channelId !== "string" || !SNOWFLAKE.test(channelId)
    )
  ) {
    errors.push("Discord telemetry channels must be snowflakes");
  } else if (
    gameDetectionChannelId !== rollLifecycleAlertChannelId ||
    logOutputChannelId === rollLifecycleAlertChannelId
  ) {
    errors.push(
      "Staging game detection must use the lifecycle alert channel, separate from roll logs",
    );
  }

  const guildId = configs["discord-rest"]?.vars?.DISCORD_TEST_GUILD_ID;
  if (typeof guildId !== "string" || !SNOWFLAKE.test(guildId)) {
    errors.push("Discord staging test guild id must be a Discord snowflake");
  } else {
    for (const worker of ["gateway", "interactions"]) {
      if (configs[worker]?.vars?.DISCORD_TEST_GUILD_ID !== guildId) {
        errors.push(`${worker} test guild id must match Discord REST`);
      }
    }
  }

  if (frontendOrigin !== null) {
    const expectedRedirect = `${frontendOrigin}/api/auth/callback/discord`;
    if (configs["web-api"]?.vars?.DISCORD_REDIRECT_URI !== expectedRedirect) {
      errors.push(`DISCORD_REDIRECT_URI must equal ${expectedRedirect}`);
    }
    const expectedWebApp = `${frontendOrigin}/app`;
    if (configs.interactions?.vars?.WEB_APP_URL !== expectedWebApp) {
      errors.push(`WEB_APP_URL must equal ${expectedWebApp}`);
    }
  }
}

function validateSecretsStoreBindings(errors, worker, config) {
  const bindings = config?.secrets_store_secrets;
  if (bindings === undefined) return;
  const expected = STAGING_SECRET_NAMES[worker];
  if (!Array.isArray(bindings) || expected === undefined) {
    errors.push(`${worker} Secrets Store bindings are invalid`);
    return;
  }
  const configuredBindings = bindings.map((binding) => binding?.binding).sort();
  const expectedBindings = Object.keys(expected).sort();
  const storeIds = new Set(bindings.map((binding) => binding?.store_id));
  if (
    configuredBindings.join(",") !== expectedBindings.join(",") ||
    storeIds.size !== 1 ||
    bindings.some(
      (binding) =>
        !isRecord(binding) ||
        Object.keys(binding).sort().join(",") !==
          "binding,secret_name,store_id" ||
        !/^[0-9a-f]{32}$/i.test(binding.store_id ?? "") ||
        binding.secret_name !== expected[binding.binding],
    )
  ) {
    errors.push(`${worker} Secrets Store bindings are invalid`);
  }
}

function validateStaticWorkerConfiguration(errors, configs) {
  if (configs.interactions?.workers_dev !== true) {
    errors.push("Staging Interactions Worker must enable workers_dev");
  }

  for (const worker of ["data", "gateway", "interactions", "roll"]) {
    const alias = configs[worker]?.alias;
    if (
      !isRecord(alias) ||
      Object.keys(alias).join(",") !== "crypto" ||
      alias.crypto !== "./packages/roll-domain/src/worker-crypto.ts"
    ) {
      errors.push(`${worker} crypto alias is invalid`);
    }
  }

  if (configs.roll?.vars?.ROLL_RENDER_VERSION !== "4") {
    errors.push("Staging Roll ROLL_RENDER_VERSION must equal 4");
  }
  if (configs.roll?.vars?.ROLL_VIEW_POLICY !== "r40") {
    errors.push("Staging Roll ROLL_VIEW_POLICY must equal r40");
  }
  if (configs.data?.vars?.APPEARANCE_CATALOG_POLICY !== "r37") {
    errors.push("Staging Data appearance catalog policy must equal r37");
  }
  if (configs["web-api"]?.vars?.APPEARANCE_CATALOG_POLICY !== "r37") {
    errors.push("Staging Web API appearance catalog policy must equal r37");
  }

  if (
    configs.interactions?.vars?.ROLL_LIFECYCLE_TELEMETRY_VERSION !== "1" &&
    configs.interactions?.vars?.ROLL_LIFECYCLE_TELEMETRY_VERSION !== "2"
  ) {
    errors.push("Interactions lifecycle telemetry version is invalid");
  }
  if (
    JSON.stringify(configs.interactions?.observability) !==
    JSON.stringify({
      enabled: true,
      logs: { invocation_logs: true, head_sampling_rate: 1 },
    })
  ) {
    errors.push("Interactions invocation logs are invalid");
  }

  const rules = configs.roll?.rules;
  const expectedRules = [
    {
      type: "CompiledWasm",
      globs: ["**/*.wasm"],
      fallthrough: true,
    },
    { type: "Data", globs: ["**/*.ttf"], fallthrough: true },
  ];
  if (JSON.stringify(rules) !== JSON.stringify(expectedRules)) {
    errors.push("Roll asset rules are invalid");
  }

  if (
    JSON.stringify(configs.data?.triggers) !==
    JSON.stringify({ crons: ["* * * * *", "0 3 * * *"] })
  ) {
    errors.push("Data lifecycle and retention schedules are invalid");
  }

  if (
    JSON.stringify(configs.gateway?.triggers) !==
    JSON.stringify({ crons: ["0 * * * *", "*/5 * * * *"] })
  ) {
    errors.push("Gateway recommendation and audience schedules are invalid");
  }

  const expectedGatewayMigrations = [
    { tag: "v1", new_sqlite_classes: ["GatewayPartition"] },
    { tag: "v2", new_sqlite_classes: ["GatewayCoordinator"] },
  ];
  if (
    JSON.stringify(configs.gateway?.migrations) !==
    JSON.stringify(expectedGatewayMigrations)
  ) {
    errors.push("Gateway Durable Object migrations are invalid");
  }
  const expectedRollMigrations = [
    { tag: "v1", new_sqlite_classes: ["RollWork"] },
    { tag: "v2", new_sqlite_classes: ["LogWork"] },
    { tag: "v3", new_sqlite_classes: ["WebDeliveryWork"] },
  ];
  if (
    JSON.stringify(configs.roll?.migrations) !==
    JSON.stringify(expectedRollMigrations)
  ) {
    errors.push("Roll Durable Object migrations are invalid");
  }

  const assets = configs["web-api"]?.assets;
  if (
    !isRecord(assets) ||
    Object.keys(assets).sort().join(",") !==
      "binding,directory,not_found_handling,run_worker_first" ||
    assets.directory !== "../frontend/dist" ||
    assets.binding !== "ASSETS" ||
    assets.not_found_handling !== "single-page-application" ||
    !Array.isArray(assets.run_worker_first) ||
    assets.run_worker_first.join(",") !== "/api/*,/interactions"
  ) {
    errors.push("Web API static asset configuration is invalid");
  }
}

function validateBuildMetadata(errors, webConfig) {
  const vars = webConfig?.vars;
  if (vars?.ENVIRONMENT !== "staging") {
    errors.push("Web API ENVIRONMENT must equal staging");
  }
  if (!FULL_SHA.test(vars?.BUILD_SHA ?? "")) {
    errors.push("Web API BUILD_SHA must be a full commit SHA");
  }
  if (
    !ISO_TIMESTAMP.test(vars?.BUILD_TIME ?? "") ||
    Number.isNaN(Date.parse(vars.BUILD_TIME))
  ) {
    errors.push("Web API BUILD_TIME must be an ISO 8601 timestamp");
  }
}

function validateData(errors, config) {
  if (config?.workers_dev !== false) {
    errors.push("Staging Data Worker must disable workers_dev");
  }
  if ("route" in config || "routes" in config) {
    errors.push("Staging Data Worker must not define public routes");
  }
  if (
    !isRecord(config?.ai) ||
    Object.keys(config.ai).join(",") !== "binding" ||
    config.ai.binding !== "AI"
  ) {
    errors.push("Staging Data Worker requires an AI binding named AI");
  }
  const databases = config?.d1_databases;
  if (!Array.isArray(databases) || databases.length !== 1) {
    errors.push("Staging Data Worker requires exactly one D1 binding");
    return null;
  }
  const database = databases[0];
  if (
    database?.binding !== "DATA" ||
    typeof database.database_name !== "string" ||
    database.database_name.length === 0 ||
    !UUID.test(database.database_id ?? "") ||
    database.migrations_dir !== "migrations/data"
  ) {
    errors.push("Staging D1 binding is invalid");
    return null;
  }
  return database.database_name;
}

function requireExactKeys(errors, owner, value, expected, label) {
  const configured = isRecord(value) ? Object.keys(value).sort() : [];
  const required = [...expected].sort();
  if (configured.join(",") !== required.join(",")) {
    errors.push(`${owner} ${label} must be exactly ${required.join(", ")}`);
  }
}

function requireExactBindings(errors, owner, bindings, expected) {
  const configured = Array.isArray(bindings)
    ? bindings.map(({ binding }) => binding).sort()
    : [];
  const required = [...expected].sort();
  if (configured.join(",") !== required.join(",")) {
    errors.push(`${owner} service bindings must be exactly ${required.join(", ")}`);
  }
}

function requireExactDurableObjects(errors, owner, config, expected) {
  const bindings = config?.durable_objects?.bindings;
  const configured = Array.isArray(bindings)
    ? bindings.map(({ name }) => name).sort()
    : [];
  const required = [...expected].sort();
  if (configured.join(",") !== required.join(",")) {
    errors.push(
      `${owner} Durable Object bindings must be exactly ${required.join(", ")}`,
    );
  }
}

function validateTopology(errors, configs, suffix) {
  const names = Object.fromEntries(
    WORKERS.map((worker) => [worker, workerName(worker, suffix)]),
  );
  requireExactBindings(errors, "data", configs.data?.services, [
    "DISCORD_REST",
  ]);
  requireExactBindings(errors, "roll", configs.roll?.services, [
    "DATA_SERVICE",
    "DISCORD_REST",
    "DISCORD_MESSAGE_PROBE",
    "GATEWAY_STATUS",
  ]);
  requireExactBindings(errors, "gateway", configs.gateway?.services, [
    "DATA_SERVICE",
    "DISCORD_REST",
  ]);
  requireExactBindings(
    errors,
    "interactions",
    configs.interactions?.services,
    ["DATA_SERVICE", "DISCORD_REST", "GATEWAY_STATUS"],
  );
  requireExactBindings(errors, "web-api", configs["web-api"]?.services, [
    "DATA_SERVICE",
    "DISCORD_REST",
    "INTERACTIONS_SERVICE",
    "ROLL_WEB",
  ]);
  requireExactDurableObjects(errors, "gateway", configs.gateway, [
    "GATEWAY_COORDINATOR",
    "GATEWAY_PARTITION",
  ]);
  requireExactDurableObjects(errors, "interactions", configs.interactions, [
    "ROLL_WORK",
    "WEB_DELIVERY_WORK",
  ]);
  requireExactDurableObjects(errors, "roll", configs.roll, [
    "LOG_WORK",
    "ROLL_WORK",
    "WEB_DELIVERY_WORK",
  ]);

  requireService(
    errors,
    configs.data,
    "data",
    "DISCORD_REST",
    names["discord-rest"],
    "DiscordRestService",
  );
  requireService(
    errors,
    configs.roll,
    "roll",
    "DATA_SERVICE",
    names.data,
  );
  requireService(
    errors,
    configs.roll,
    "roll",
    "DISCORD_REST",
    names["discord-rest"],
    "DiscordRestService",
  );
  requireService(
    errors,
    configs.roll,
    "roll",
    "DISCORD_MESSAGE_PROBE",
    names["discord-rest"],
    "DiscordMessageProbeService",
  );
  requireService(
    errors,
    configs.roll,
    "roll",
    "GATEWAY_STATUS",
    names.gateway,
    "GatewayStatusService",
  );
  requireService(
    errors,
    configs.gateway,
    "gateway",
    "DATA_SERVICE",
    names.data,
  );
  requireService(
    errors,
    configs.gateway,
    "gateway",
    "DISCORD_REST",
    names["discord-rest"],
    "DiscordRestService",
  );
  requireService(
    errors,
    configs.interactions,
    "interactions",
    "DATA_SERVICE",
    names.data,
  );
  requireService(
    errors,
    configs.interactions,
    "interactions",
    "GATEWAY_STATUS",
    names.gateway,
    "GatewayStatusService",
  );
  requireService(
    errors,
    configs.interactions,
    "interactions",
    "DISCORD_REST",
    names["discord-rest"],
    "DiscordRestService",
  );
  requireService(
    errors,
    configs["web-api"],
    "web-api",
    "DATA_SERVICE",
    names.data,
  );
  requireService(
    errors,
    configs["web-api"],
    "web-api",
    "DISCORD_REST",
    names["discord-rest"],
    "DiscordRestService",
  );
  requireService(
    errors,
    configs["web-api"],
    "web-api",
    "ROLL_WEB",
    names.roll,
    "WebRollService",
  );
  requireService(
    errors,
    configs["web-api"],
    "web-api",
    "INTERACTIONS_SERVICE",
    names.interactions,
  );

  const partition = durableBinding(configs.gateway, "GATEWAY_PARTITION");
  const coordinator = durableBinding(configs.gateway, "GATEWAY_COORDINATOR");
  if (
    partition?.class_name !== "GatewayPartition" ||
    partition?.script_name !== undefined ||
    coordinator?.class_name !== "GatewayCoordinator" ||
    coordinator?.script_name !== undefined
  ) {
    errors.push("Gateway Durable Object bindings are invalid");
  }
  const interactionRollWork = durableBinding(configs.interactions, "ROLL_WORK");
  if (
    interactionRollWork?.class_name !== "RollWork" ||
    interactionRollWork?.script_name !== names.roll
  ) {
    errors.push(`Interactions ROLL_WORK must target ${names.roll}`);
  }
  const interactionWebDeliveryWork = durableBinding(
    configs.interactions,
    "WEB_DELIVERY_WORK",
  );
  if (
    interactionWebDeliveryWork?.class_name !== "WebDeliveryWork" ||
    interactionWebDeliveryWork?.script_name !== names.roll
  ) {
    errors.push(`Interactions WEB_DELIVERY_WORK must target ${names.roll}`);
  }
  const rollWork = durableBinding(configs.roll, "ROLL_WORK");
  if (
    rollWork?.class_name !== "RollWork" ||
    rollWork?.script_name !== undefined
  ) {
    errors.push("Roll ROLL_WORK binding is invalid");
  }
  const logWork = durableBinding(configs.roll, "LOG_WORK");
  if (
    logWork?.class_name !== "LogWork" ||
    logWork?.script_name !== undefined
  ) {
    errors.push("Roll LOG_WORK binding is invalid");
  }
  const webDeliveryWork = durableBinding(configs.roll, "WEB_DELIVERY_WORK");
  if (
    webDeliveryWork?.class_name !== "WebDeliveryWork" ||
    webDeliveryWork?.script_name !== undefined
  ) {
    errors.push("Roll WEB_DELIVERY_WORK binding is invalid");
  }
}

export function validateStagingConfigs(configs) {
  const errors = [];
  if (!isRecord(configs)) {
    throw new Error("Staging configuration is invalid: configuration map required");
  }
  for (const worker of WORKERS) {
    const config = configs[worker];
    if (!isRecord(config)) {
      errors.push(`${worker} configuration is required`);
      continue;
    }
    for (const key of Object.keys(config)) {
      if (!WORKER_CONFIG_KEYS[worker].includes(key)) {
        errors.push(`${worker} contains unsupported configuration key: ${key}`);
      }
    }
    if (worker in WORKER_VAR_NAMES) {
      requireExactKeys(
        errors,
        worker,
        config.vars,
        WORKER_VAR_NAMES[worker],
        "vars",
      );
    }
    if (config.main !== MAIN_MODULES[worker]) {
      errors.push(`${worker} main module must be ${MAIN_MODULES[worker]}`);
    }
    if (typeof config.workers_dev !== "boolean") {
      errors.push(`${worker} must set workers_dev explicitly`);
    }
    if (config.preview_urls !== false) {
      errors.push(`${worker} must disable preview URLs`);
    }
    if (JSON.stringify(config).includes("REPLACE_WITH_")) {
      errors.push(`${worker} contains unresolved placeholders`);
    }
    validateSecretsStoreBindings(errors, worker, config);
  }

  const dataName = configs.data?.name;
  const prefix = "dice-witch-data-";
  const suffix =
    typeof dataName === "string" && dataName.startsWith(prefix)
      ? dataName.slice(prefix.length)
      : "";
  if (suffix !== "staging" && suffix !== "poc") {
    errors.push("Staging Worker suffix must be staging or poc");
  } else {
    for (const worker of WORKERS) {
      const expected = workerName(worker, suffix);
      if (configs[worker]?.name !== expected) {
        errors.push(`${worker} Worker name must be ${expected}`);
      }
    }
    validateTopology(errors, configs, suffix);
  }

  const d1DatabaseName = isRecord(configs.data)
    ? validateData(errors, configs.data)
    : null;
  if (
    suffix !== "" &&
    d1DatabaseName !== null &&
    !d1DatabaseName.toLowerCase().includes(suffix.toLowerCase())
  ) {
    errors.push("Staging D1 database name must include the Worker suffix");
  }
  const frontendOrigin = parseFrontendOrigin(errors, configs["web-api"]);
  if (suffix !== "" && frontendOrigin !== null) {
    const frontendHostname = new URL(frontendOrigin).hostname.toLowerCase();
    const hostnameMarkers = suffix === "poc" ? ["poc", "staging"] : [suffix];
    if (!hostnameMarkers.some((marker) => frontendHostname.includes(marker))) {
      errors.push("Staging frontend hostname must include a staging marker");
    }
    const routes = configs["web-api"]?.routes;
    if (
      routes !== undefined &&
      (!Array.isArray(routes) ||
        routes.length !== 1 ||
        !isRecord(routes[0]) ||
        Object.keys(routes[0]).sort().join(",") !==
          "custom_domain,pattern" ||
        routes[0].custom_domain !== true ||
        routes[0].pattern !== frontendHostname)
    ) {
      errors.push("Web API route must match the staging frontend hostname");
    }
  }
  validateDiscordIdentity(errors, configs, frontendOrigin);
  validateBuildMetadata(errors, configs["web-api"]);
  validateStaticWorkerConfiguration(errors, configs);

  if (errors.length > 0) {
    throw new Error(
      `Staging configuration is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
  return {
    suffix,
    frontendOrigin,
    d1DatabaseName,
    discordApplicationId: configs["discord-rest"].vars.DISCORD_APPLICATION_ID,
    buildSha: configs["web-api"].vars.BUILD_SHA,
    buildTime: configs["web-api"].vars.BUILD_TIME,
    workerNames: WORKERS.map((worker) => configs[worker].name).sort(),
  };
}

export function decodeForbiddenTargets(encodedDenylist) {
  if (
    typeof encodedDenylist !== "string" ||
    encodedDenylist.length === 0 ||
    encodedDenylist.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encodedDenylist)
  ) {
    throw new Error("Production-target denylist is required and must be base64 JSON");
  }
  const decoded = Buffer.from(encodedDenylist, "base64");
  if (decoded.byteLength > 16 * 1024) {
    throw new Error("Production-target denylist exceeds 16 KiB");
  }
  let denylist;
  try {
    denylist = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("Production-target denylist is invalid");
  }
  const fields = [
    "d1DatabaseIds",
    "workerNames",
    "origins",
    "discordApplicationIds",
    "secretsStoreSecretNames",
  ];
  if (
    !isRecord(denylist) ||
    Object.keys(denylist).sort().join(",") !== [...fields].sort().join(",") ||
    fields.some(
      (field) =>
        !Array.isArray(denylist[field]) ||
        denylist[field].length === 0 ||
        new Set(denylist[field]).size !== denylist[field].length ||
        denylist[field].some(
          (value) => typeof value !== "string" || value.length === 0,
        ),
    ) ||
    denylist.workerNames.length < WORKERS.length ||
    denylist.d1DatabaseIds.some((value) => !UUID.test(value)) ||
    denylist.workerNames.some((value) => !value.startsWith("dice-witch-")) ||
    denylist.discordApplicationIds.some((value) => !SNOWFLAKE.test(value)) ||
    denylist.secretsStoreSecretNames.some((value) => !SECRET_NAME.test(value))
  ) {
    throw new Error("Production-target denylist is invalid");
  }
  for (const origin of denylist.origins) {
    try {
      if (new URL(origin).origin !== origin || !origin.startsWith("https://")) {
        throw new Error();
      }
    } catch {
      throw new Error("Production-target denylist is invalid");
    }
  }
  return denylist;
}

export function validateForbiddenTargets(configs, encodedDenylist) {
  const denylist = decodeForbiddenTargets(encodedDenylist);
  const databaseId = configs.data?.d1_databases?.[0]?.database_id;
  if (denylist.d1DatabaseIds.includes(databaseId)) {
    throw new Error("Staging D1 binding targets a forbidden database");
  }
  if (
    WORKERS.some((worker) =>
      denylist.workerNames.includes(configs[worker]?.name),
    )
  ) {
    throw new Error("Staging configuration targets a forbidden Worker");
  }
  if (denylist.origins.includes(configs["web-api"]?.vars?.FRONTEND_ORIGIN)) {
    throw new Error("Staging configuration targets a forbidden origin");
  }
  if (
    denylist.discordApplicationIds.includes(
      configs["discord-rest"]?.vars?.DISCORD_APPLICATION_ID,
    )
  ) {
    throw new Error("Staging configuration targets a forbidden Discord application");
  }
  const configuredSecretNames = WORKERS.flatMap((worker) =>
    Array.isArray(configs[worker]?.secrets_store_secrets)
      ? configs[worker].secrets_store_secrets.map(({ secret_name }) => secret_name)
      : [],
  );
  if (
    configuredSecretNames.some((secretName) =>
      denylist.secretsStoreSecretNames.includes(secretName),
    )
  ) {
    throw new Error(
      "Staging configuration targets a forbidden Secrets Store secret",
    );
  }
}

export async function loadStagingConfigs(configDirectory) {
  const entries = await Promise.all(
    WORKERS.map(async (worker) => {
      const file = path.join(configDirectory, `wrangler.${worker}.jsonc`);
      let config;
      try {
        config = JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        throw new Error(`Unable to read ${file}: ${error.message}`, {
          cause: error,
        });
      }
      return [worker, config];
    }),
  );
  return Object.fromEntries(entries);
}

async function main() {
  const [flag, value, ...extra] = process.argv.slice(2);
  if (flag !== "--config-dir" || value === undefined || extra.length > 0) {
    throw new Error("Usage: node tools/staging-config.mjs --config-dir <directory>");
  }
  const configs = await loadStagingConfigs(path.resolve(value));
  const summary = validateStagingConfigs(configs);
  process.stdout.write(
    `${JSON.stringify({ status: "valid", ...summary }, null, 2)}\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
