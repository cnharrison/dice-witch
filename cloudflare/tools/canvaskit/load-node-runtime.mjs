import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import CanvasKitInit from "../../packages/dice-canvaskit/assets/canvaskit.mjs";

const assetsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../packages/dice-canvaskit/assets",
);

export async function loadNodeCanvasKitRuntime() {
  const wasmBytes = await readFile(resolve(assetsDirectory, "canvaskit.wasm"));
  const wasm = await WebAssembly.compile(Uint8Array.from(wasmBytes));
  return CanvasKitInit({
    instantiateWasm(imports, successCallback) {
      const instance = new WebAssembly.Instance(wasm, imports);
      successCallback(instance);
      return instance.exports;
    },
  });
}
