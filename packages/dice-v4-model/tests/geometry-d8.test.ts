import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D8_STANDARD_GEOMETRY_V4,
  getCanonicalGeometryDescriptorV4,
  getOppositeFaceValueV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  type GeometryFaceV4,
  type Point3V4,
  type QuaternionV4,
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

function rotate(vector: Point3V4, quaternion: QuaternionV4): Point3V4 {
  const axis: Point3V4 = [quaternion[0], quaternion[1], quaternion[2]];
  const axisCross = cross(axis, vector);
  const twiceCross: Point3V4 = [
    axisCross[0] * 2,
    axisCross[1] * 2,
    axisCross[2] * 2,
  ];
  const correction = cross(axis, twiceCross);
  return [
    vector[0] + quaternion[3] * twiceCross[0] + correction[0],
    vector[1] + quaternion[3] * twiceCross[1] + correction[1],
    vector[2] + quaternion[3] * twiceCross[2] + correction[2],
  ];
}

function faceValue(face: GeometryFaceV4): number {
  const label = face.labels[0];
  if (label === undefined) throw new Error("D8 face label is missing");
  return label.value;
}

function expectVector(actual: Point3V4, expected: Point3V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
}

describe("canonical V4 d8 geometry", () => {
  it("registers one complete standard descriptor", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("d8-standard-r1");
    expect(getCanonicalGeometryDescriptorV4("d8-standard-r1")).toBe(
      D8_STANDARD_GEOMETRY_V4,
    );
    expect(D8_STANDARD_GEOMETRY_V4.vertices).toHaveLength(6);
    expect(D8_STANDARD_GEOMETRY_V4.faces).toHaveLength(8);
    expect(D8_STANDARD_GEOMETRY_V4.resultOrientations).toHaveLength(8);
  });

  it("is a regular closed outward-wound manifold", () => {
    const edgeCounts = new Map<string, number>();
    const edgeLengths = new Set<string>();
    for (const { position } of D8_STANDARD_GEOMETRY_V4.vertices) {
      expect(length(position)).toBeCloseTo(1, 12);
    }
    for (const face of D8_STANDARD_GEOMETRY_V4.faces) {
      const [first, second, third] = face.vertexIndices.map(
        (index) => D8_STANDARD_GEOMETRY_V4.vertices[index]?.position,
      );
      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("D8 face references a missing vertex");
      }
      expect(
        dot(
          cross(subtract(second, first), subtract(third, first)),
          face.normal,
        ),
      ).toBeGreaterThan(0);
      expect(length(face.normal)).toBeCloseTo(1, 12);

      for (let index = 0; index < 3; index += 1) {
        const start = face.vertexIndices[index];
        const end = face.vertexIndices[(index + 1) % 3];
        if (start === undefined || end === undefined) {
          throw new Error("D8 edge is missing a vertex");
        }
        const startPosition = D8_STANDARD_GEOMETRY_V4.vertices[start]?.position;
        const endPosition = D8_STANDARD_GEOMETRY_V4.vertices[end]?.position;
        if (startPosition === undefined || endPosition === undefined) {
          throw new Error("D8 edge references a missing vertex");
        }
        const edge = start < end ? `${start}:${end}` : `${end}:${start}`;
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
        edgeLengths.add(
          length(subtract(startPosition, endPosition)).toFixed(12),
        );
      }
    }
    expect(edgeCounts.size).toBe(12);
    expect(new Set(edgeCounts.values())).toEqual(new Set([2]));
    expect(edgeLengths.size).toBe(1);
    expect(
      D8_STANDARD_GEOMETRY_V4.vertices.length -
        edgeCounts.size +
        D8_STANDARD_GEOMETRY_V4.faces.length,
    ).toBe(2);
  });

  it("uses every conventional value once with opposite faces summing to nine", () => {
    const faceByValue = new Map(
      D8_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    expect([...faceByValue.keys()].sort((left, right) => left - right)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    for (let value = 1; value <= 8; value += 1) {
      const oppositeValue = getOppositeFaceValueV4("d8", value);
      const face = faceByValue.get(value);
      const opposite =
        oppositeValue === null ? undefined : faceByValue.get(oppositeValue);
      if (face === undefined || opposite === undefined) {
        throw new Error("D8 opposite face is missing");
      }
      expect(oppositeValue).toBe(9 - value);
      expectVector(opposite.normal, [
        -face.normal[0],
        -face.normal[1],
        -face.normal[2],
      ]);
    }
  });

  it("reuses exact continuous skin coordinates at shared vertices", () => {
    const coordinatesByVertex = new Map<number, readonly [number, number]>();
    for (const face of D8_STANDARD_GEOMETRY_V4.faces) {
      expect(face.skinCoordinates).toHaveLength(3);
      face.vertexIndices.forEach((vertexIndex, index) => {
        const coordinate = face.skinCoordinates[index];
        if (coordinate === undefined) {
          throw new Error("D8 face skin coordinate is missing");
        }
        expect(coordinate[0]).toBeGreaterThanOrEqual(0);
        expect(coordinate[0]).toBeLessThanOrEqual(1);
        expect(coordinate[1]).toBeGreaterThanOrEqual(0);
        expect(coordinate[1]).toBeLessThanOrEqual(1);
        const existing = coordinatesByVertex.get(vertexIndex);
        if (existing === undefined) coordinatesByVertex.set(vertexIndex, coordinate);
        else expect(coordinate).toBe(existing);
      });
    }
    expect(coordinatesByVertex.size).toBe(6);
  });

  it("orients every result on top with fixed physical engraving frames", () => {
    const faceByValue = new Map(
      D8_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    for (const { result, rotation } of D8_STANDARD_GEOMETRY_V4.resultOrientations) {
      const face = faceByValue.get(result);
      const label = face?.labels[0];
      if (face === undefined || label === undefined) {
        throw new Error("D8 result face is missing");
      }
      expect(Math.hypot(...rotation)).toBeCloseTo(1, 12);
      expectVector(rotate(face.normal, rotation), [0, 1, 0]);
      expect(label.alignment).toBe("surface");
      expectVector(cross(label.right, label.up), face.normal);
      expect(label.maxWidth).toBe(1.08);
      expect(label.maxHeight).toBe(0.92);
    }
  });

  it("pins the approved descriptor hash", () => {
    const hash = createHash("sha256")
      .update(canonicalJsonV4(D8_STANDARD_GEOMETRY_V4))
      .digest("hex");
    expect(hash).toBe(
      "abfd3d6a3dc19e56ffd195824a502afcae1f4b995716685513eecec2023a05ab",
    );
  });
});
