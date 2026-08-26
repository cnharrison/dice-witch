import CanvasKitInit from "../assets/canvaskit.mjs";
import canvasKitWasm from "../assets/canvaskit.wasm";
import type {
  CanvasKit,
  CanvasKitInitOptions,
} from "canvaskit-wasm";
import { canvasKitFailureNameV4 } from "./error-diagnostics";

export const CANVASKIT_INITIAL_MEMORY_BYTES_V4 = 32 * 1_024 * 1_024;

export type CanvasKitRuntimeV4 = CanvasKit & {
  HEAPU8: Uint8Array;
};

export type CanvasKitLoaderV4 = (
  options?: CanvasKitInitOptions,
) => Promise<CanvasKit>;

export type CanvasKitInitializationOptionsV4 = {
  loader?: CanvasKitLoaderV4;
  wasm?: WebAssembly.Module;
  instantiateModule?: (
    wasm: WebAssembly.Module,
    imports: WebAssembly.Imports,
  ) => WebAssembly.Instance;
};

type CanvasKitInitializationStageV4 =
  | "loader"
  | "wasm-instantiation"
  | "runtime-initialization"
  | "runtime-contract";

function requireCanvasKitRuntime(runtime: CanvasKit): CanvasKitRuntimeV4 {
  if (!("HEAPU8" in runtime)) {
    throw new Error("CanvasKit V4 runtime contract is invalid");
  }
  if (
    !(runtime.HEAPU8 instanceof Uint8Array) ||
    runtime.HEAPU8.buffer.byteLength !==
      CANVASKIT_INITIAL_MEMORY_BYTES_V4 ||
    !(runtime.MakeSurface instanceof Function) ||
    !(runtime.Paint instanceof Function) ||
    !(runtime.RuntimeEffect.Make instanceof Function)
  ) {
    throw new Error("CanvasKit V4 runtime contract is invalid");
  }
  // SAFETY: The CanvasKit FFI heap and callable runtime entry points were checked above.
  return runtime as CanvasKitRuntimeV4;
}

export async function initializeCanvasKitRuntimeV4({
  loader = CanvasKitInit,
  wasm = canvasKitWasm,
  instantiateModule = (module, imports) =>
    new WebAssembly.Instance(module, imports),
}: CanvasKitInitializationOptionsV4 = {}): Promise<CanvasKitRuntimeV4> {
  let stage: CanvasKitInitializationStageV4 = "loader";
  try {
    const runtime = await loader({
      instantiateWasm(imports, successCallback) {
        stage = "wasm-instantiation";
        const instance = instantiateModule(wasm, imports);
        stage = "runtime-initialization";
        successCallback(instance);
        return instance.exports;
      },
    });
    stage = "runtime-contract";
    return requireCanvasKitRuntime(runtime);
  } catch (cause) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "CanvasKit V4 initialization failed",
        stage,
        errorName: canvasKitFailureNameV4(cause),
        expectedHeapBytes: CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      }),
    );
    throw new Error("CanvasKit V4 initialization failed", { cause });
  }
}

export function createCanvasKitRuntimeLoaderV4(
  initialize: () => Promise<CanvasKitRuntimeV4>,
): () => Promise<CanvasKitRuntimeV4> {
  let runtimePromise: Promise<CanvasKitRuntimeV4> | null = null;
  return () => {
    runtimePromise ??= initialize().catch((cause: unknown) => {
      runtimePromise = null;
      throw cause;
    });
    return runtimePromise;
  };
}

const loadCanvasKitRuntimeV4 = createCanvasKitRuntimeLoaderV4(() =>
  initializeCanvasKitRuntimeV4(),
);

export function loadCanvasKitV4(): Promise<CanvasKitRuntimeV4> {
  return loadCanvasKitRuntimeV4();
}
