import type { CanvasKit } from "canvaskit-wasm";

export function loadNodeCanvasKitRuntime(): Promise<
  CanvasKit & { HEAPU8: Uint8Array }
>;
