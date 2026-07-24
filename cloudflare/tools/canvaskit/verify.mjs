import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { requireSha256 } from "./hash.mjs";
import {
  BUILD_ARGUMENTS,
  BUILD_HASHES,
  CANVASKIT_VERSION,
  COMPATIBILITY_FIXTURE_HASHES,
  EMSDK_IMAGE,
  EMSDK_VERSION,
  LOADER_LOCATION_MARKER,
  LOADER_LOCATION_REPLACEMENT,
  RENDERER_REVISION,
  SKIA_REVISION,
  SKIA_SOURCE_URL,
  WASM_MEMORY_POLICY,
} from "./policy.mjs";
import { readWasmMemoryLimits } from "./wasm-memory.mjs";

const MAX_COMPRESSED_RUNTIME_BYTES = 3 * 1_024 * 1_024;

function defaultAssetsDirectory() {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../packages/dice-canvaskit/assets",
  );
}

function expectedManifest({ loaderBytes, wasmBytes, typesBytes, licenseBytes }) {
  return {
    version: 1,
    rendererRevision: RENDERER_REVISION,
    canvasKitVersion: CANVASKIT_VERSION,
    skiaRevision: SKIA_REVISION,
    sourceUrl: SKIA_SOURCE_URL,
    emsdkVersion: EMSDK_VERSION,
    emsdkImage: EMSDK_IMAGE,
    buildArguments: BUILD_ARGUMENTS,
    inputs: {
      sourcePatchSha256: BUILD_HASHES.sourcePatch,
      minimalDependenciesSha256: BUILD_HASHES.minimalDependencies,
      rawLoaderSha256: BUILD_HASHES.rawLoader,
    },
    artifacts: {
      loader: { bytes: loaderBytes, sha256: BUILD_HASHES.loader },
      wasm: { bytes: wasmBytes, sha256: BUILD_HASHES.wasm },
      types: { bytes: typesBytes, sha256: BUILD_HASHES.types },
      license: { bytes: licenseBytes, sha256: BUILD_HASHES.license },
    },
    memory: WASM_MEMORY_POLICY,
    compatibilityFixtures: COMPATIBILITY_FIXTURE_HASHES,
  };
}

function assertLoader(loader) {
  for (const prohibited of [
    LOADER_LOCATION_MARKER,
    'require("fs")',
    'require("path")',
    "ENVIRONMENT_IS_NODE",
  ]) {
    assert.equal(
      loader.includes(prohibited),
      false,
      `CanvasKit loader contains prohibited marker ${prohibited}`,
    );
  }
  assert.equal(loader.includes(LOADER_LOCATION_REPLACEMENT), true);
  assert.equal(loader.includes("ea=_scriptName;"), false);
  assert.match(loader, /export default CanvasKitInit/);
  assert.match(loader, /instantiateWasm/);
}

export async function verifyCanvasKitRuntime({
  assetsDirectory = defaultAssetsDirectory(),
} = {}) {
  const [loader, wasmBuffer, types, license, manifestSource] =
    await Promise.all([
      readFile(resolve(assetsDirectory, "canvaskit.mjs"), "utf8"),
      readFile(resolve(assetsDirectory, "canvaskit.wasm")),
      readFile(resolve(assetsDirectory, "canvaskit.d.mts")),
      readFile(resolve(assetsDirectory, "LICENSE.skia")),
      readFile(resolve(assetsDirectory, "manifest.json"), "utf8"),
    ]);
  const wasm = new Uint8Array(wasmBuffer);
  const manifest = JSON.parse(manifestSource);

  assert.equal(WebAssembly.validate(wasm), true);
  assert.deepEqual(readWasmMemoryLimits(wasm), {
    flags: 1,
    initialPages: WASM_MEMORY_POLICY.initialPages,
    maximumPages: WASM_MEMORY_POLICY.maximumPages,
  });
  requireSha256("CanvasKit loader", loader, BUILD_HASHES.loader);
  requireSha256("CanvasKit WebAssembly", wasm, BUILD_HASHES.wasm);
  requireSha256("CanvasKit types", types, BUILD_HASHES.types);
  requireSha256("Skia license", license, BUILD_HASHES.license);
  assertLoader(loader);

  assert.deepEqual(
    manifest,
    expectedManifest({
      loaderBytes: Buffer.byteLength(loader),
      wasmBytes: wasm.byteLength,
      typesBytes: types.byteLength,
      licenseBytes: license.byteLength,
    }),
  );

  const compressedBytes =
    gzipSync(loader, { level: 9 }).byteLength +
    gzipSync(wasm, { level: 9 }).byteLength;
  assert.ok(compressedBytes < MAX_COMPRESSED_RUNTIME_BYTES);
  return {
    assetsDirectory,
    compressedBytes,
    loaderBytes: Buffer.byteLength(loader),
    wasmBytes: wasm.byteLength,
    memory: readWasmMemoryLimits(wasm),
  };
}

const invokedPath =
  process.argv[1] === undefined
    ? null
    : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  const report = await verifyCanvasKitRuntime();
  console.log(JSON.stringify(report, null, 2));
}
