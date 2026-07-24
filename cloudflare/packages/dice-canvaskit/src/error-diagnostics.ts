const SAFE_CANVASKIT_FAILURE_NAMES_V4 = [
  "AggregateError",
  "BindingError",
  "CompileError",
  "Error",
  "InternalError",
  "LinkError",
  "RangeError",
  "ReferenceError",
  "RuntimeError",
  "SyntaxError",
  "TypeError",
] as const;

export type CanvasKitFailureNameV4 =
  | (typeof SAFE_CANVASKIT_FAILURE_NAMES_V4)[number]
  | "UnknownError";

export function canvasKitFailureNameV4(
  error: unknown,
): CanvasKitFailureNameV4 {
  try {
    if (!(error instanceof Error)) return "UnknownError";
    return (
      SAFE_CANVASKIT_FAILURE_NAMES_V4.find(
        (name) => name === error.name,
      ) ?? "UnknownError"
    );
  } catch {
    return "UnknownError";
  }
}
