export type ThreeDrawingBufferLimitsV4 = {
  maxViewportWidth: number;
  maxViewportHeight: number;
  maxRenderbufferSize: number;
};

function requirePositiveSafeIntegerV4(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error("Three.js V4 WebGL drawing-buffer limits are invalid");
  }
  return value as number;
}

export function readThreeDrawingBufferLimitsV4(
  context: WebGLRenderingContext | WebGL2RenderingContext,
): ThreeDrawingBufferLimitsV4 {
  const viewportDimensions: unknown = context.getParameter(
    context.MAX_VIEWPORT_DIMS,
  );
  if (!ArrayBuffer.isView(viewportDimensions)) {
    throw new Error("Three.js V4 WebGL drawing-buffer limits are invalid");
  }
  const dimensions = viewportDimensions as unknown as ArrayLike<number>;
  if (dimensions.length < 2) {
    throw new Error("Three.js V4 WebGL drawing-buffer limits are invalid");
  }
  return {
    maxViewportWidth: requirePositiveSafeIntegerV4(dimensions[0]),
    maxViewportHeight: requirePositiveSafeIntegerV4(dimensions[1]),
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
