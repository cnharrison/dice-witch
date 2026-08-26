import { describe, expect, it } from "vitest";
import {
  boundedInteger,
  hasExactKeys,
  hexColor,
  isRecord,
  requireExactRecord,
  supportedValue,
} from "../src/validation";

class TaggedRecord {
  value = 1;
}

function withNullPrototype<Value extends object>(value: Value): Value {
  Object.setPrototypeOf(value, null);
  return value;
}

function withCustomPrototype<Value extends object>(value: Value): Value {
  Object.setPrototypeOf(value, {});
  return value;
}

describe("shared model validation", () => {
  it("accepts only plain and null-prototype records without reading fields", () => {
    const nullPrototype = withNullPrototype({ value: 1 });
    const accessor = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => {
        throw new Error("Field was read");
      },
    });

    expect(isRecord({ value: 1 })).toBe(true);
    expect(isRecord(nullPrototype)).toBe(true);
    expect(isRecord(accessor)).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(new TaggedRecord())).toBe(false);
    expect(isRecord(withCustomPrototype({ value: 1 }))).toBe(false);
  });

  it("preserves exact-key checks, object identity, and caller errors", () => {
    const nullPrototype = withNullPrototype({ second: 2, first: 1 });

    expect(hasExactKeys(nullPrototype, ["first", "second"])).toBe(true);
    expect(hasExactKeys(nullPrototype, ["first"])).toBe(false);
    expect(
      requireExactRecord(
        nullPrototype,
        ["second", "first"],
        "Record is invalid",
      ),
    ).toBe(nullPrototype);
    expect(() =>
      requireExactRecord(nullPrototype, ["first"], "Record is invalid"),
    ).toThrow("Record is invalid");
  });

  it("returns supported strings and preserves validation messages", () => {
    const supported = ["first", "second"] as const;

    expect(supportedValue("second", supported, "Value is invalid")).toBe(
      "second",
    );
    expect(() => supportedValue(2, supported, "Value is invalid")).toThrow(
      "Value is invalid",
    );
    expect(() => supportedValue("third", supported, "Value is invalid")).toThrow(
      "Value is invalid",
    );
  });

  it("enforces safe integer bounds and normalizes hex colors", () => {
    expect(boundedInteger(2, 1, 3, "Count")).toBe(2);
    for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 0, 4]) {
      expect(() => boundedInteger(value, 1, 3, "Count")).toThrow(
        "Count must be from 1 through 3",
      );
    }

    expect(hexColor("#Aa00Ff", "Color")).toBe("#aa00ff");
    expect(() => hexColor("aa00ff", "Color")).toThrow(
      "Color must be a six-digit hex color",
    );
  });
});
