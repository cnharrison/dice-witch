import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D6_STANDARD_GEOMETRY_V4,
  getCanonicalGeometryDescriptorV4,
  getOppositeFaceValueV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  type GeometryFaceV4,
  type Point3V4,
} from "../src";

function subtract(left: Point3V4, right: Point3V4): Point3V4 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Point3V4, right: Point3V4): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Point3V4, right: Point3V4): Point3V4 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function length(vector: Point3V4): number {
  return Math.sqrt(dot(vector, vector));
}

function faceValue(face: GeometryFaceV4): number {
  const label = face.labels[0];
  if (label === undefined) throw new Error("D6 face label is missing");
  return label.value;
}

function expectVector(actual: Point3V4, expected: Point3V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
}

describe("canonical V4 d6 geometry", () => {
  it("registers one complete standard descriptor", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("d6-standard-r1");
    expect(getCanonicalGeometryDescriptorV4("d6-standard-r1")).toBe(
      D6_STANDARD_GEOMETRY_V4,
    );
    expect(() =>
      getCanonicalGeometryDescriptorV4("d6-crystal-cut-r1"),
    ).toThrow("Geometry descriptor is not implemented: d6-crystal-cut-r1");
    expect(D6_STANDARD_GEOMETRY_V4.vertices).toHaveLength(8);
    expect(D6_STANDARD_GEOMETRY_V4.faces).toHaveLength(6);
    expect(D6_STANDARD_GEOMETRY_V4.resultOrientations).toHaveLength(6);
  });

  it("is a closed outward-wound manifold", () => {
    const edgeCounts = new Map<string, number>();
    for (const face of D6_STANDARD_GEOMETRY_V4.faces) {
      expect(face.vertexIndices).toHaveLength(4);
      const [first, second, third] = face.vertexIndices.map(
        (index) => D6_STANDARD_GEOMETRY_V4.vertices[index]?.position,
      );
      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("D6 face references a missing vertex");
      }
      expect(
        dot(
          cross(subtract(second, first), subtract(third, first)),
          face.normal,
        ),
      ).toBeGreaterThan(0);
      expect(length(face.normal)).toBeCloseTo(1, 12);

      for (let index = 0; index < face.vertexIndices.length; index += 1) {
        const start = face.vertexIndices[index];
        const end = face.vertexIndices[(index + 1) % face.vertexIndices.length];
        if (start === undefined || end === undefined) {
          throw new Error("D6 edge is missing a vertex");
        }
        const edge = start < end ? `${start}:${end}` : `${end}:${start}`;
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
      }
    }
    expect(edgeCounts.size).toBe(12);
    expect(new Set(edgeCounts.values())).toEqual(new Set([2]));
  });

  it("uses an undistorted object-space square on every cube face", () => {
    const expectedCorners = new Set(["0:0", "0:1", "1:0", "1:1"]);
    for (const face of D6_STANDARD_GEOMETRY_V4.faces) {
      expect(face.skinCoordinates).toHaveLength(face.vertexIndices.length);
      expect(
        new Set(face.skinCoordinates.map(([u, v]) => `${String(u)}:${String(v)}`)),
      ).toEqual(expectedCorners);
      face.skinCoordinates.forEach((coordinate, index) => {
        const next = face.skinCoordinates[(index + 1) % face.skinCoordinates.length];
        if (next === undefined) throw new Error("D6 skin edge is missing");
        expect(
          Math.abs(coordinate[0] - next[0]) +
            Math.abs(coordinate[1] - next[1]),
        ).toBe(1);
      });
    }
  });

  it("pins conventional opposite faces", () => {
    const faceByValue = new Map(
      D6_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    for (let value = 1; value <= 6; value += 1) {
      const face = faceByValue.get(value);
      const oppositeValue = getOppositeFaceValueV4("d6", value);
      const opposite =
        oppositeValue === null ? undefined : faceByValue.get(oppositeValue);
      if (face === undefined || opposite === undefined) {
        throw new Error("D6 opposite face is missing");
      }
      expect(dot(face.normal, opposite.normal)).toBe(-1);
    }
  });

  it("uses photographed face-relative alignment and larger engravings", () => {
    for (const face of D6_STANDARD_GEOMETRY_V4.faces) {
      const label = face.labels[0];
      if (label === undefined) throw new Error("D6 face label is missing");
      expectVector(label.origin, face.normal);
      expect(label.alignment).toBe("surface");
      expect(length(label.right)).toBeCloseTo(1, 12);
      expect(length(label.up)).toBeCloseTo(1, 12);
      expect(dot(label.right, label.up)).toBeCloseTo(0, 12);
      expect(dot(label.right, face.normal)).toBeCloseTo(0, 12);
      expect(dot(label.up, face.normal)).toBeCloseTo(0, 12);
      expectVector(cross(label.right, label.up), face.normal);
      expect(label.maxWidth).toBe(1.9);
      expect(label.maxHeight).toBe(1.9);
      expect(label.opticalInset).toBeGreaterThanOrEqual(0);
    }

    const faceByValue = new Map(
      D6_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    const five = faceByValue.get(5)?.labels[0];
    const four = faceByValue.get(4)?.labels[0];
    if (five === undefined || four === undefined) {
      throw new Error("D6 photographed reference faces are missing");
    }
    expectVector(five.right, [0, -1, 0]);
    expectVector(five.up, [0, 0, 1]);
    expectVector(four.right, [1, 0, 0]);
    expectVector(four.up, [0, 0, 1]);
  });

  it("pins the approved descriptor hash", () => {
    const hash = createHash("sha256")
      .update(canonicalJsonV4(D6_STANDARD_GEOMETRY_V4))
      .digest("hex");
    expect(hash).toBe(
      "fc679389c0a6a96ec31ab34fc6e90aff5516cf38b1a432dc6a427723b6ad39f7",
    );
  });
});
