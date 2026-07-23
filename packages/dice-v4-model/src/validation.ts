const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

export function requireExactRecord(
  value: unknown,
  expected: readonly string[],
  message: string,
): Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, expected)) {
    throw new Error(message);
  }
  return value;
}

export function supportedValue<Value extends string>(
  value: unknown,
  supported: readonly Value[],
  message: string,
): Value {
  if (
    typeof value !== "string" ||
    !supported.includes(value as Value)
  ) {
    throw new Error(message);
  }
  return value as Value;
}

export function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${path} must be from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return value;
}

export function hexColor(value: unknown, path: string): string {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new Error(`${path} must be a six-digit hex color`);
  }
  return value.toLowerCase();
}
