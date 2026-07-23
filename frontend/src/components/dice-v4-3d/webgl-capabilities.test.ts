import { describe, expect, it } from "vitest";
import {
  assertThreeDrawingBufferSizeV4,
  readThreeDrawingBufferLimitsV4,
} from "./webgl-capabilities";

function context(
  viewport: unknown,
  renderbuffer: unknown,
): WebGLRenderingContext {
  return {
    MAX_RENDERBUFFER_SIZE: 1,
    MAX_VIEWPORT_DIMS: 2,
    getParameter(parameter: number) {
      return parameter === 2 ? viewport : renderbuffer;
    },
  } as unknown as WebGLRenderingContext;
}

describe("V4 Three.js WebGL drawing-buffer capabilities", () => {
  it("reads and accepts limits that contain the maximum icon grid", () => {
    const limits = readThreeDrawingBufferLimitsV4(
      context(new Int32Array([16_384, 16_384]), 16_384),
    );

    expect(limits).toEqual({
      maxViewportWidth: 16_384,
      maxViewportHeight: 16_384,
      maxRenderbufferSize: 16_384,
    });
    expect(() =>
      assertThreeDrawingBufferSizeV4(1_500, 9_350, limits),
    ).not.toThrow();
  });

  it("fails closed when the maximum icon grid exceeds a WebGL limit", () => {
    expect(() =>
      assertThreeDrawingBufferSizeV4(1_500, 9_350, {
        maxViewportWidth: 16_384,
        maxViewportHeight: 8_192,
        maxRenderbufferSize: 16_384,
      }),
    ).toThrow("Three.js V4 grid exceeds WebGL drawing-buffer limits");
    expect(() =>
      assertThreeDrawingBufferSizeV4(1_500, 9_350, {
        maxViewportWidth: 16_384,
        maxViewportHeight: 16_384,
        maxRenderbufferSize: 8_192,
      }),
    ).toThrow("Three.js V4 grid exceeds WebGL drawing-buffer limits");
  });

  it("rejects malformed capability values", () => {
    expect(() =>
      readThreeDrawingBufferLimitsV4(context([16_384, 16_384], 16_384)),
    ).toThrow("Three.js V4 WebGL drawing-buffer limits are invalid");
    expect(() =>
      readThreeDrawingBufferLimitsV4(
        context(new Int32Array([16_384]), 16_384),
      ),
    ).toThrow("Three.js V4 WebGL drawing-buffer limits are invalid");
    expect(() =>
      assertThreeDrawingBufferSizeV4(0, 150, {
        maxViewportWidth: 16_384,
        maxViewportHeight: 16_384,
        maxRenderbufferSize: 16_384,
      }),
    ).toThrow("Three.js V4 WebGL drawing-buffer limits are invalid");
  });
});
