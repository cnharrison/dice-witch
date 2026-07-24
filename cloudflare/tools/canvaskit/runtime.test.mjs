import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { adaptCanvasKitLoader } from "./adapt-loader.mjs";
import {
  LOADER_LOCATION_MARKER,
  LOADER_LOCATION_REPLACEMENT,
} from "./policy.mjs";
import { verifyCanvasKitRuntime } from "./verify.mjs";
import { patchWasmMemoryLimits } from "./wasm-memory.mjs";

const assetsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../packages/dice-canvaskit/assets",
);

async function temporaryAssets(context) {
  const root = await mkdtemp(join(tmpdir(), "dice-witch-canvaskit-runtime-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const assets = resolve(root, "assets");
  await cp(assetsDirectory, assets, { recursive: true });
  return assets;
}

test("adapts one source-built loader for workerd", () => {
  const source = `prefix ${LOADER_LOCATION_MARKER} instantiateWasm export default CanvasKitInit`;
  const adapted = adaptCanvasKitLoader(source);
  assert.equal(LOADER_LOCATION_REPLACEMENT, 'ea="";');
  assert.equal(adapted.includes(LOADER_LOCATION_MARKER), false);
  assert.equal(adapted.includes(LOADER_LOCATION_REPLACEMENT), true);
  assert.equal(adapted.includes("ea=_scriptName;"), false);
  assert.throws(
    () => adaptCanvasKitLoader(source.replace(LOADER_LOCATION_MARKER, "")),
    /location marker count must be one/,
  );
  assert.throws(
    () => adaptCanvasKitLoader(`${source} require("fs")`),
    /prohibited marker/,
  );
});

test("verifies the committed runtime, hashes, heap, and compressed size", async () => {
  const report = await verifyCanvasKitRuntime();
  assert.equal(report.loaderBytes, 57_592);
  assert.equal(report.wasmBytes, 2_474_302);
  assert.deepEqual(report.memory, {
    flags: 1,
    initialPages: 512,
    maximumPages: 1_024,
  });
  assert.ok(report.compressedBytes < 3 * 1_024 * 1_024);
});

test("fails fast when an artifact hash changes", async (context) => {
  const assets = await temporaryAssets(context);
  const loaderPath = resolve(assets, "canvaskit.mjs");
  const loader = await readFile(loaderPath, "utf8");
  await writeFile(loaderPath, `${loader}\n`);
  await assert.rejects(
    verifyCanvasKitRuntime({ assetsDirectory: assets }),
    /CanvasKit loader SHA-256 changed/,
  );
});

test("fails fast when manifest metadata changes", async (context) => {
  const assets = await temporaryAssets(context);
  const manifestPath = resolve(assets, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.compatibilityFixtures.probePngSha256 = "0".repeat(64);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(
    verifyCanvasKitRuntime({ assetsDirectory: assets }),
    /Expected values to be strictly deep-equal/,
  );
});

test("fails fast when an artifact is missing", async (context) => {
  const assets = await temporaryAssets(context);
  await rm(resolve(assets, "canvaskit.wasm"));
  await assert.rejects(
    verifyCanvasKitRuntime({ assetsDirectory: assets }),
    /ENOENT/,
  );
});

test("fails fast when the declared heap changes", async (context) => {
  const assets = await temporaryAssets(context);
  const wasmPath = resolve(assets, "canvaskit.wasm");
  const wasm = new Uint8Array(await readFile(wasmPath));
  const changed = patchWasmMemoryLimits(wasm, {
    expectedInitialPages: 512,
    expectedMaximumPages: 1_024,
    initialPages: 513,
    maximumPages: 1_024,
  });
  await writeFile(wasmPath, changed);
  await assert.rejects(
    verifyCanvasKitRuntime({ assetsDirectory: assets }),
    /Expected values to be strictly deep-equal/,
  );
});
