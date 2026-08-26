import * as z from "zod";

export type ThreeDrawingBufferLimitsV4 = {
  maxViewportWidth: number;
  maxViewportHeight: number;
  maxRenderbufferSize: number;
};

export type ThreeDrawingBufferContextV4 = Pick<
  WebGLRenderingContext,
  "MAX_RENDERBUFFER_SIZE" | "MAX_VIEWPORT_DIMS" | "getParameter"
>;

const positiveSafeIntegerSchema = z.number().int().positive();
const viewportDimensionsSchema = z
  .custom<ArrayLike<number>>(ArrayBuffer.isView)
  .refine((value) => value.length >= 2);

function requirePositiveSafeIntegerV4<Value>(value: Value): number {
  const parsed = positiveSafeIntegerSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Three.js V4 WebGL drawing-buffer limits are invalid");
  }
  return parsed.data;
}

export function readThreeDrawingBufferLimitsV4(
  context: ThreeDrawingBufferContextV4,
): ThreeDrawingBufferLimitsV4 {
  const dimensions = viewportDimensionsSchema.safeParse(
    context.getParameter(context.MAX_VIEWPORT_DIMS),
  );
  if (!dimensions.success) {
    throw new Error("Three.js V4 WebGL drawing-buffer limits are invalid");
  }
  return {
    maxViewportWidth: requirePositiveSafeIntegerV4(dimensions.data[0]),
    maxViewportHeight: requirePositiveSafeIntegerV4(dimensions.data[1]),
    maxRenderbufferSize: requirePositiveSafeIntegerV4(
      context.getParameter(context.MAX_RENDERBUFFER_SIZE),
    ),
  };
}

export function assertThreeDrawingBufferSizeV4(
  width: number,
  height: number,
  limits: ThreeDrawingBufferLimitsV4,
): void {
  const requestedWidth = requirePositiveSafeIntegerV4(width);
  const requestedHeight = requirePositiveSafeIntegerV4(height);
  const maxViewportWidth = requirePositiveSafeIntegerV4(
    limits.maxViewportWidth,
  );
  const maxViewportHeight = requirePositiveSafeIntegerV4(
    limits.maxViewportHeight,
  );
  const maxRenderbufferSize = requirePositiveSafeIntegerV4(
    limits.maxRenderbufferSize,
  );
  if (
    requestedWidth > maxViewportWidth ||
    requestedHeight > maxViewportHeight ||
    requestedWidth > maxRenderbufferSize ||
    requestedHeight > maxRenderbufferSize
  ) {
    throw new Error("Three.js V4 grid exceeds WebGL drawing-buffer limits");
  }
}
