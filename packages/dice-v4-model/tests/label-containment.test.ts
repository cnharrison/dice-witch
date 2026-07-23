import { describe, expect, it } from "vitest";
import { minimumConvexPolygonClearanceV4 } from "../src";

const triangle = [
  [0, 0],
  [10, 0],
  [5, 10],
] as const;

describe("browser-neutral V4 label containment", () => {
  it("measures positive, edge, and outside clearance independent of winding", () => {
    const inside = [[5, 4]] as const;
    const edge = [[5, 0]] as const;
    const outside = [[5, -1]] as const;

    expect(minimumConvexPolygonClearanceV4(triangle, inside)).toBeGreaterThan(0);
    expect(minimumConvexPolygonClearanceV4(triangle, edge)).toBeCloseTo(0, 12);
    expect(minimumConvexPolygonClearanceV4(triangle, outside)).toBeLessThan(0);
    expect(
      minimumConvexPolygonClearanceV4([...triangle].reverse(), inside),
    ).toBeCloseTo(minimumConvexPolygonClearanceV4(triangle, inside), 12);
  });

  it("uses the closest transformed label corner", () => {
    const corners = [
      [4, 2],
      [6, 2],
      [6, 4],
      [4, 4],
    ] as const;

    expect(minimumConvexPolygonClearanceV4(triangle, corners)).toBeCloseTo(
      2 / Math.sqrt(1.25),
      12,
    );
  });

  it("rejects degenerate polygons and empty label bounds", () => {
    expect(() =>
      minimumConvexPolygonClearanceV4(
        [
          [0, 0],
          [1, 0],
        ],
        [[0, 0]],
      ),
    ).toThrow("Label containment polygon is invalid");
    expect(() => minimumConvexPolygonClearanceV4(triangle, [])).toThrow(
      "Label containment points are empty",
    );
  });
});
