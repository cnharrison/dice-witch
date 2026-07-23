import { describe, expect, it } from "vitest";
import { parseRollRenderVersion } from "../../workers/roll/src/render-version";

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
});
