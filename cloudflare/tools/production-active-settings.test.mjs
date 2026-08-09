import assert from "node:assert/strict";
import test from "node:test";
import { verifyProductionActiveSettings } from "./production-active-settings.mjs";

const sha = "a".repeat(40);
const config = {
  compatibility_date: "2026-07-10",
  vars: { ROLL_RENDER_VERSION: "4", ROLL_VIEW_POLICY: "r19" },
  services: [
    { binding: "DATA_SERVICE", service: "dice-witch-data-production" },
  ],
  durable_objects: {
    bindings: [{ name: "ROLL_WORK", class_name: "RollWork" }],
  },
  migrations: [{ tag: "v1", new_sqlite_classes: ["RollWork"] }],
};
const version = {
  id: "11111111-1111-4111-8111-111111111111",
  annotations: { "workers/tag": `production-${sha.slice(0, 12)}` },
  resources: {
    bindings: [
      { name: "ROLL_RENDER_VERSION", type: "plain_text", text: "4" },
      { name: "ROLL_VIEW_POLICY", type: "plain_text", text: "r19" },
      {
        name: "DATA_SERVICE",
        type: "service",
        service: "dice-witch-data-production",
      },
      {
        name: "ROLL_WORK",
        type: "durable_object_namespace",
        class_name: "RollWork",
      },
    ],
    script_runtime: {
      compatibility_date: "2026-07-10",
      migration_tag: "v1",
    },
  },
};

test("verifies the active version identity and complete binding contract", () => {
  assert.deepEqual(
    verifyProductionActiveSettings({ worker: "roll", config, version, sha }),
    {
      worker: "roll",
      versionId: "11111111-1111-4111-8111-111111111111",
      status: "verified",
    },
  );
});

test("rejects missing, redirected, or stale active settings", () => {
  assert.throws(
    () =>
      verifyProductionActiveSettings({
        worker: "roll",
        config,
        version: {
          ...version,
          resources: {
            ...version.resources,
            bindings: version.resources.bindings.slice(1),
          },
        },
        sha,
      }),
    /binding names differ/,
  );
  assert.throws(
    () =>
      verifyProductionActiveSettings({
        worker: "roll",
        config,
        version: {
          ...version,
          resources: {
            ...version.resources,
            bindings: version.resources.bindings.map((binding) =>
              binding.name === "DATA_SERVICE"
                ? { ...binding, service: "dice-witch-data-staging" }
                : binding,
            ),
          },
        },
        sha,
      }),
    /DATA_SERVICE.service differs/,
  );
  assert.throws(
    () =>
      verifyProductionActiveSettings({
        worker: "roll",
        config,
        version: {
          ...version,
          annotations: { "workers/tag": "production-stale" },
        },
        sha,
      }),
    /version tag differs/,
  );
});
