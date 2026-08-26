import type * as z from "zod";

export type CanonicalJsonInputV4 = z.input<z.ZodUnknown>;
type CanonicalJsonRecordV4 = z.output<
  z.ZodRecord<z.ZodString, z.ZodUnknown>
>;

function isCanonicalJsonRecordV4(
  value: CanonicalJsonInputV4,
): value is CanonicalJsonRecordV4 {
  if (value === null || Object(value) !== value || Array.isArray(value)) {
    return false;
  }
  return (
    Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null
  );
}

function canonicalValue(
  value: CanonicalJsonInputV4,
  ancestors: WeakSet<object>,
): string {
  const valueTag = Object.prototype.toString.call(value);
  if (valueTag === "[object Null]" && value === null) return "null";
  if (Object(value) !== value) {
    if (valueTag === "[object String]" || valueTag === "[object Boolean]") {
      return JSON.stringify(value);
    }
    if (valueTag === "[object Number]") {
      const number = Number(value);
      if (Number.isFinite(number)) {
        return JSON.stringify(Object.is(number, -0) ? 0 : number);
      }
    }
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new Error("Canonical JSON contains an unsupported value");
      }
    }
    if (ancestors.has(value)) {
      throw new Error("Canonical JSON contains a circular reference");
    }
    ancestors.add(value);
    const serialized = value.map((item) => canonicalValue(item, ancestors));
    ancestors.delete(value);
    return `[${serialized.join(",")}]`;
  }

  if (isCanonicalJsonRecordV4(value)) {
    if (ancestors.has(value)) {
      throw new Error("Canonical JSON contains a circular reference");
    }
    ancestors.add(value);
    const serialized = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalValue(value[key], ancestors)}`,
      );
    ancestors.delete(value);
    return `{${serialized.join(",")}}`;
  }

  throw new Error("Canonical JSON contains an unsupported value");
}

export function canonicalJsonV4(value: CanonicalJsonInputV4): string {
  return canonicalValue(value, new WeakSet());
}
