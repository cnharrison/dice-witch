import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/;
const WORKERS = ["data", "discord-rest", "gateway", "interactions", "roll", "web-api"];
const CLI_USAGE =
  "Usage: node tools/production-active-settings.mjs --worker <name> --config <path> --version-json <path> --sha <full-sha>";

function expectedBindings(config) {
  const bindings = new Map();
  for (const [name, text] of Object.entries(config.vars ?? {})) {
    bindings.set(name, { type: "plain_text", text });
  }
  for (const value of config.services ?? []) {
    bindings.set(value.binding, {
      type: "service",
      service: value.service,
      ...(value.entrypoint === undefined ? {} : { entrypoint: value.entrypoint }),
    });
  }
  for (const value of config.secrets_store_secrets ?? []) {
    bindings.set(value.binding, {
      type: "secrets_store_secret",
      store_id: value.store_id,
      secret_name: value.secret_name,
    });
  }
  for (const value of config.durable_objects?.bindings ?? []) {
    bindings.set(value.name, {
      type: "durable_object_namespace",
      class_name: value.class_name,
    });
  }
  for (const value of config.d1_databases ?? []) {
    bindings.set(value.binding, { type: "d1", id: value.database_id });
  }
  if (config.ai?.binding !== undefined) {
    bindings.set(config.ai.binding, { type: "ai" });
  }
  if (config.assets?.binding !== undefined) {
    bindings.set(config.assets.binding, { type: "assets" });
  }
  return bindings;
}

function actualBindings(version) {
  return new Map(
    version.resources.bindings.map((binding) => [binding.name, binding]),
  );
}

export function verifyProductionActiveSettings({ worker, config, version, sha }) {
  if (!WORKERS.includes(worker) || !FULL_SHA.test(sha ?? "")) {
    throw new Error("Production active-settings verification input is invalid");
  }
  const expected = expectedBindings(config);
  const actual = actualBindings(version);
  if (
    [...expected.keys()].sort().join(",") !==
    [...actual.keys()].sort().join(",")
  ) {
    throw new Error(`${worker} active binding names differ from production config`);
  }
  for (const [name, expectedBinding] of expected) {
    const active = actual.get(name);
    for (const [key, value] of Object.entries(expectedBinding)) {
      if (active?.[key] !== value) {
        throw new Error(`${worker} active binding ${name}.${key} differs from production config`);
      }
    }
  }
  if (
    version.resources.script_runtime.compatibility_date !==
    config.compatibility_date
  ) {
    throw new Error(`${worker} active compatibility date differs from production config`);
  }
  const migrations = config.migrations ?? [];
  const expectedMigration = migrations.at(-1)?.tag;
  if (
    expectedMigration !== undefined &&
    version.resources.script_runtime.migration_tag !== expectedMigration
  ) {
    throw new Error(`${worker} active migration tag differs from production config`);
  }
  if (version.annotations?.["workers/tag"] !== `production-${sha.slice(0, 12)}`) {
    throw new Error(`${worker} active version tag differs from requested SHA`);
  }
  return { worker, versionId: version.id, status: "verified" };
}

function parseArguments(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!flag?.startsWith("--") || value === undefined) throw new Error(CLI_USAGE);
    values[flag.slice(2)] = value;
  }
  if (Object.keys(values).sort().join(",") !== "config,sha,version-json,worker") {
    throw new Error(CLI_USAGE);
  }
  return values;
}

async function main() {
  const values = parseArguments(process.argv.slice(2));
  const result = verifyProductionActiveSettings({
    worker: values.worker,
    config: JSON.parse(await readFile(path.resolve(values.config), "utf8")),
    version: JSON.parse(await readFile(path.resolve(values["version-json"]), "utf8")),
    sha: values.sha,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
