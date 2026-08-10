import { describe, expect, it } from "vitest";
import {
  CANONICAL_FACE_VALUES_V4,
  FACE_LABEL_LAYOUT_BY_TARGET_V4,
  formatFaceLabelV4,
  getOppositeFaceValueV4,
  requiresOrientationMarkV4,
} from "../src";

describe("V4 face and label semantics", () => {
  it("pins canonical face values and target layouts", () => {
    expect(CANONICAL_FACE_VALUES_V4.d4).toEqual([1, 2, 3, 4]);
    expect(CANONICAL_FACE_VALUES_V4.d10).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(CANONICAL_FACE_VALUES_V4.percentile).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90,
    ]);
    expect(CANONICAL_FACE_VALUES_V4.fudge).toEqual([-1, -1, 0, 0, 1, 1]);
    expect(FACE_LABEL_LAYOUT_BY_TARGET_V4.d4).toBe("vertex-triplet");
    expect(FACE_LABEL_LAYOUT_BY_TARGET_V4.other).toBe("sphere-front");
    expect(FACE_LABEL_LAYOUT_BY_TARGET_V4.d20).toBe("face-centered");
  });

  it("formats numeric, percentile, and Fudge labels explicitly", () => {
    expect(formatFaceLabelV4("d10", 10)).toBe("10");
    expect(formatFaceLabelV4("d10", 10, "percentile-ones")).toBe("0");
    expect(
      CANONICAL_FACE_VALUES_V4.d10.map((value) =>
        formatFaceLabelV4("d10", value, "percentile-ones"),
      ),
    ).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
    expect(formatFaceLabelV4("percentile", 0)).toBe("00");
    expect(formatFaceLabelV4("percentile", 90)).toBe("90");
    expect(formatFaceLabelV4("fudge", -1)).toBe("−");
    expect(formatFaceLabelV4("fudge", 0)).toBe("");
    expect(formatFaceLabelV4("fudge", 1)).toBe("+");
    expect(formatFaceLabelV4("other", 999)).toBe("999");
    expect(() => formatFaceLabelV4("percentile", 85)).toThrow(
      "Percentile face value must be a multiple of 10 from 0 through 90",
    );
    expect(() =>
      formatFaceLabelV4("d20", 20, "percentile-ones"),
    ).toThrow("Face label set is invalid for target");
  });

  it("marks only standalone six and nine labels", () => {
    expect(requiresOrientationMarkV4("d6", 6)).toBe(true);
    expect(requiresOrientationMarkV4("d10", 9)).toBe(true);
    expect(requiresOrientationMarkV4("other", 9)).toBe(true);
    expect(requiresOrientationMarkV4("other", 69)).toBe(false);
    expect(requiresOrientationMarkV4("percentile", 90)).toBe(false);
  });

  it("pins conventional opposite-face relationships", () => {
    expect(getOppositeFaceValueV4("d6", 1)).toBe(6);
    expect(getOppositeFaceValueV4("d8", 3)).toBe(6);
    expect(getOppositeFaceValueV4("d10", 10)).toBe(1);
    expect(getOppositeFaceValueV4("d12", 5)).toBe(8);
    expect(getOppositeFaceValueV4("d20", 20)).toBe(1);
    expect(getOppositeFaceValueV4("percentile", 20)).toBe(70);
    expect(getOppositeFaceValueV4("d4", 1)).toBeNull();
    expect(getOppositeFaceValueV4("fudge", 1)).toBeNull();
    expect(getOppositeFaceValueV4("other", 1)).toBeNull();
  });
});
