import { describe, expect, it } from "vitest";
import {
  parseRollRenderVersion,
  parseRollViewPolicy,
} from "../../workers/roll/src/render-version";

describe("Roll render-version configuration", () => {
  it.each([
    ["3", 3],
    ["4", 4],
  ] as const)("accepts explicit version %s", (configured, expected) => {
    expect(parseRollRenderVersion(configured)).toBe(expected);
  });

  it.each([undefined, null, "", "2", "5", 4])(
    "fails closed for %j",
    (configured) => {
      expect(() => parseRollRenderVersion(configured)).toThrow(
        "ROLL_RENDER_VERSION must be 3 or 4",
      );
    },
  );

  it.each(["r19", "r20"] as const)(
    "accepts explicit view policy %s",
    (configured) => {
      expect(parseRollViewPolicy(configured)).toBe(configured);
    },
  );

  it.each([undefined, null, "", "r18", "R20"])(
    "fails closed for view policy %j",
    (configured) => {
      expect(() => parseRollViewPolicy(configured)).toThrow(
        "ROLL_VIEW_POLICY must be r19 or r20",
      );
    },
  );
});
