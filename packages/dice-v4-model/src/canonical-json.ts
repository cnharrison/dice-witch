function canonicalValue(
  value: unknown,
  ancestors: WeakSet<object>,
): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
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
  if (typeof value === "object") {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Canonical JSON contains an unsupported value");
    }
    if (ancestors.has(value)) {
      throw new Error("Canonical JSON contains a circular reference");
    }
    ancestors.add(value);
    const record = value as Record<string, unknown>;
    const serialized = Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalValue(record[key], ancestors)}`,
      );
    ancestors.delete(value);
    return `{${serialized.join(",")}}`;
  }
  throw new Error("Canonical JSON contains an unsupported value");
}

export function canonicalJsonV4(value: unknown): string {
  return canonicalValue(value, new WeakSet());
}
