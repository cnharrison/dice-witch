import * as z from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type ValidationInput = z.input<z.ZodUnknown>;
export type BoundaryRecord = z.output<
  z.ZodRecord<z.ZodString, z.ZodUnknown>
>;

const nonRecordValueSchema = z.union([
  z.null(),
  z.undefined(),
  z.string(),
  z.number(),
  z.nan(),
  z.literal(Number.POSITIVE_INFINITY),
  z.literal(Number.NEGATIVE_INFINITY),
  z.boolean(),
  z.bigint(),
  z.symbol(),
  z.function(),
]);
const objectValueSchema = z.custom<object>(
  (value) =>
    !nonRecordValueSchema.safeParse(value).success && !Array.isArray(value),
);
const boundaryRecordSchema = z.custom<BoundaryRecord>((value) => {
  const objectValue = objectValueSchema.safeParse(value);
  if (!objectValue.success) return false;
  const prototype = Reflect.getPrototypeOf(objectValue.data);
  return prototype === Object.prototype || prototype === null;
});
const safeIntegerSchema = z.number().int();
const hexColorSchema = z.string().regex(HEX_COLOR).transform((value) =>
  value.toLowerCase()
);

export function isRecord(value: ValidationInput): value is BoundaryRecord {
  return boundaryRecordSchema.safeParse(value).success;
}

export function hasExactKeys(
  value: BoundaryRecord,
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
  value: ValidationInput,
  expected: readonly string[],
  message: string,
): BoundaryRecord {
  if (!isRecord(value) || !hasExactKeys(value, expected)) {
    throw new Error(message);
  }
  return value;
}

export function supportedValue<Value extends string>(
  value: ValidationInput,
  supported: readonly Value[],
  message: string,
): Value {
  const parsed = z.enum(supported).safeParse(value);
  if (!parsed.success) throw new Error(message);
  return parsed.data;
}

export function boundedInteger(
  value: ValidationInput,
  minimum: number,
  maximum: number,
  path: string,
): number {
  const parsed = safeIntegerSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data < minimum ||
    parsed.data > maximum
  ) {
    throw new Error(
      `${path} must be from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return parsed.data;
}

export function hexColor(value: ValidationInput, path: string): string {
  const parsed = hexColorSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${path} must be a six-digit hex color`);
  }
  return parsed.data;
}
