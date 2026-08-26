import { describe, expect, it } from "vitest";
import { canonicalJsonV4, type CanonicalJsonInputV4 } from "../src/canonical-json";

class TaggedRecord {
  value = 1;
}

type CanonicalCycleFixture = {
  self?: CanonicalJsonInputV4;
};

function withNullPrototype<Value extends object>(value: Value): Value {
  Object.setPrototypeOf(value, null);
  return value;
}

function withCustomPrototype<Value extends object>(value: Value): Value {
  Object.setPrototypeOf(value, {});
  return value;
}

const UNSUPPORTED_VALUE_ERROR = "Canonical JSON contains an unsupported value";
const CIRCULAR_REFERENCE_ERROR =
  "Canonical JSON contains a circular reference";

describe("canonical JSON V4", () => {
  it("sorts plain and null-prototype records and normalizes negative zero", () => {
    const nullPrototype = withNullPrototype({
      z: -0,
      a: [true, null, "value"],
    });

    expect(canonicalJsonV4(nullPrototype)).toBe(
      '{"a":[true,null,"value"],"z":0}',
    );
    expect(canonicalJsonV4({ z: 2, a: 1 })).toBe('{"a":1,"z":2}');
  });

  it("rejects unsupported primitives, numbers, and object prototypes", () => {
    for (const value of [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1n,
      Symbol("value"),
      () => undefined,
      new Date(0),
      new TaggedRecord(),
      withCustomPrototype({ value: 1 }),
    ]) {
      expect(() => canonicalJsonV4(value)).toThrow(UNSUPPORTED_VALUE_ERROR);
    }
  });

  it("rejects sparse arrays and unsupported nested values", () => {
    const sparse: string[] = [];
    sparse.length = 1;

    expect(() => canonicalJsonV4(sparse)).toThrow(UNSUPPORTED_VALUE_ERROR);
    expect(() => canonicalJsonV4({ value: undefined })).toThrow(
      UNSUPPORTED_VALUE_ERROR,
    );
  });

  it("distinguishes circular references while allowing shared descendants", () => {
    const cyclicObject: CanonicalCycleFixture = {};
    cyclicObject.self = cyclicObject;
    const cyclicArray: CanonicalJsonInputV4[] = [];
    cyclicArray.push(cyclicArray);
    const shared = { value: 1 };

    expect(() => canonicalJsonV4(cyclicObject)).toThrow(
      CIRCULAR_REFERENCE_ERROR,
    );
    expect(() => canonicalJsonV4(cyclicArray)).toThrow(
      CIRCULAR_REFERENCE_ERROR,
    );
    expect(canonicalJsonV4({ first: shared, second: shared })).toBe(
      '{"first":{"value":1},"second":{"value":1}}',
    );
  });

  it("reads enumerable fields once during serialization", () => {
    let reads = 0;
    const record = {};
    Object.defineProperty(record, "value", {
      enumerable: true,
      get: () => {
        reads += 1;
        return 1;
      },
    });

    expect(canonicalJsonV4(record)).toBe('{"value":1}');
    expect(reads).toBe(1);
  });
});
