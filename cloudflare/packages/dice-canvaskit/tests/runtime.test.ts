import { describe, expect, it, vi } from "vitest";
import worker from "./worker";
import { withCanvasKitResourcesV4 } from "../src/resources";
import {
  CANVASKIT_INITIAL_MEMORY_BYTES_V4,
  createCanvasKitRuntimeLoaderV4,
  initializeCanvasKitRuntimeV4,
  loadCanvasKitV4,
  type CanvasKitRuntimeV4,
} from "../src/runtime";

const PROBE_SHADER = `
uniform float2 resolution;
half4 main(float2 xy) {
  float2 p = xy / resolution;
  float checker = mod(floor(p.x * 8.0) + floor(p.y * 8.0), 2.0);
  float3 pink = float3(1.0, 0.04, 0.48);
  float3 cyan = float3(0.02, 0.82, 1.0);
  return half4(mix(pink, cyan, checker), 1.0);
}`;

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function renderProbe(
  canvasKit: CanvasKitRuntimeV4,
): Promise<Uint8Array<ArrayBuffer>> {
  return withCanvasKitResourcesV4((scope) => {
    const surface = scope.own(
      canvasKit.MakeSurface(64, 64),
      "probe surface",
      (owned) => {
        owned.dispose();
      },
    );
    let compilationError = "";
    const effect = scope.own(
      canvasKit.RuntimeEffect.Make(PROBE_SHADER, (error) => {
        compilationError = error;
      }),
      `probe shader (${compilationError})`,
    );
    const shader = scope.own(effect.makeShader([64, 64]), "probe shader");
    const paint = scope.own(new canvasKit.Paint(), "probe paint");
    paint.setAntiAlias(true);
    paint.setShader(shader);
    const canvas = surface.getCanvas();
    canvas.clear(canvasKit.TRANSPARENT);
    canvas.drawRect(canvasKit.XYWHRect(0, 0, 64, 64), paint);
    surface.flush();
    const image = scope.own(surface.makeImageSnapshot(), "probe image");
    const png = image.encodeToBytes(canvasKit.ImageFormat.PNG, 100);
    if (png === null) throw new Error("CanvasKit probe PNG encoding failed");
    return new Uint8Array(png);
  });
}

describe("source-built CanvasKit V4 runtime", () => {
  it("initializes once with the bounded heap", async () => {
    const first = await loadCanvasKitV4();
    const second = await loadCanvasKitV4();
    expect(second).toBe(first);
    expect(first.HEAPU8.buffer.byteLength).toBe(
      CANVASKIT_INITIAL_MEMORY_BYTES_V4,
    );
  });

  it("retries a rejected singleton initialization without duplicating in-flight work", async () => {
    const runtime = await loadCanvasKitV4();
    let initializationCount = 0;
    const load = createCanvasKitRuntimeLoaderV4(() => {
      initializationCount += 1;
      return initializationCount === 1
        ? Promise.reject(new Error("injected initialization failure"))
        : Promise.resolve(runtime);
    });

    const first = load();
    const concurrent = load();
    expect(concurrent).toBe(first);
    await expect(Promise.allSettled([first, concurrent])).resolves.toEqual([
      expect.objectContaining({ status: "rejected" }),
      expect.objectContaining({ status: "rejected" }),
    ]);
    await expect(load()).resolves.toBe(runtime);
    expect(initializationCount).toBe(2);
  });

  it("starts through the local workerd entry point", async () => {
    const response = await worker.fetch();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      wasmMemoryBytes: CANVASKIT_INITIAL_MEMORY_BYTES_V4,
    });
  });

  it("keeps deterministic output and heap size across resource lifecycles", async () => {
    const canvasKit = await loadCanvasKitV4();
    for (let iteration = 0; iteration < 20; iteration += 1) {
      expect(await sha256Hex(await renderProbe(canvasKit))).toBe(
        "ee1c899eea93a97676ea840f222c6e342af6668ba94ccfef068cbb40b72ac0fb",
      );
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    }
  });

  it("reports bounded initialization stages without exposing causes", async () => {
    const secret = "private-initialization-detail";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await expect(
        initializeCanvasKitRuntimeV4({
          loader: () => Promise.reject(new Error(secret)),
        }),
      ).rejects.toThrow("CanvasKit V4 initialization failed");
      await expect(
        initializeCanvasKitRuntimeV4({
          instantiateModule: () => ({ exports: {} }),
          loader: (options) => {
            options?.instantiateWasm?.({}, () => undefined);
            return Promise.reject(new Error(secret));
          },
        }),
      ).rejects.toThrow("CanvasKit V4 initialization failed");
      await expect(
        initializeCanvasKitRuntimeV4({
          instantiateModule: () => ({ exports: {} }),
          loader: (options) => {
            options?.instantiateWasm?.({}, () => {
              throw new Error(secret);
            });
            return Promise.reject(new Error(secret));
          },
        }),
      ).rejects.toThrow("CanvasKit V4 initialization failed");
      await expect(
        initializeCanvasKitRuntimeV4({
          instantiateModule: () => {
            throw new TypeError(secret);
          },
          loader: (options) => {
            options?.instantiateWasm?.({}, () => undefined);
            return Promise.reject(new Error(secret));
          },
        }),
      ).rejects.toThrow("CanvasKit V4 initialization failed");
      const invalidRuntime = new Proxy(await loadCanvasKitV4(), {
        has(target, property) {
          return property === "HEAPU8" ? false : property in target;
        },
      });
      await expect(
        initializeCanvasKitRuntimeV4({
          loader: () => Promise.resolve(invalidRuntime),
        }),
      ).rejects.toThrow("CanvasKit V4 initialization failed");

      const expectedDiagnostics = [
        {
          level: "error",
          message: "CanvasKit V4 initialization failed",
          stage: "loader",
          errorName: "Error",
          expectedHeapBytes: CANVASKIT_INITIAL_MEMORY_BYTES_V4,
        },
        {
          level: "error",
          message: "CanvasKit V4 initialization failed",
          stage: "runtime-initialization",
          errorName: "Error",
          expectedHeapBytes: CANVASKIT_INITIAL_MEMORY_BYTES_V4,
        },
        {
          level: "error",
          message: "CanvasKit V4 initialization failed",
          stage: "runtime-initialization",
          errorName: "Error",
          expectedHeapBytes: CANVASKIT_INITIAL_MEMORY_BYTES_V4,
        },
        {
          level: "error",
          message: "CanvasKit V4 initialization failed",
          stage: "wasm-instantiation",
          errorName: "TypeError",
          expectedHeapBytes: CANVASKIT_INITIAL_MEMORY_BYTES_V4,
        },
        {
          level: "error",
          message: "CanvasKit V4 initialization failed",
          stage: "runtime-contract",
          errorName: "Error",
          expectedHeapBytes: CANVASKIT_INITIAL_MEMORY_BYTES_V4,
        },
      ];
      expect(
        consoleError.mock.calls.map(([entry]) => String(entry)),
      ).toEqual(expectedDiagnostics.map((entry) => JSON.stringify(entry)));
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
    } finally {
      consoleError.mockRestore();
    }
  });
});
