import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D4_STANDARD_GEOMETRY_V4,
  FACE_LABEL_LAYOUT_BY_TARGET_V4,
  getCanonicalGeometryDescriptorV4,
  getOppositeFaceValueV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  type Point3V4,
  type QuaternionV4,
} from "../src";

const RESULT_DIRECTION: Point3V4 = [0, 1, 0];

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

function expectVector(actual: Point3V4, expected: Point3V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
}

describe("canonical V4 redesigned d4 geometry", () => {
  it("registers a vertex-result descriptor", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("d4-standard-r1");
    expect(getCanonicalGeometryDescriptorV4("d4-standard-r1")).toBe(
      D4_STANDARD_GEOMETRY_V4,
    );
    expect(FACE_LABEL_LAYOUT_BY_TARGET_V4.d4).toBe("vertex-triplet");
    expect(D4_STANDARD_GEOMETRY_V4.vertices).toHaveLength(4);
    expect(D4_STANDARD_GEOMETRY_V4.faces).toHaveLength(4);
    expect(D4_STANDARD_GEOMETRY_V4.resultOrientations).toHaveLength(4);
  });

  it("is a regular closed outward-wound tetrahedron", () => {
    const edgeCounts = new Map<string, number>();
    const edgeLengths = new Set<string>();
    for (const { position } of D4_STANDARD_GEOMETRY_V4.vertices) {
      expect(length(position)).toBeCloseTo(1, 12);
    }
    for (const face of D4_STANDARD_GEOMETRY_V4.faces) {
      const [first, second, third] = face.vertexIndices.map(
        (index) => D4_STANDARD_GEOMETRY_V4.vertices[index]?.position,
      );
      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("D4 face geometry is missing");
      }
      expect(
        dot(
          cross(subtract(second, first), subtract(third, first)),
          face.normal,
        ),
      ).toBeGreaterThan(0);
      expect(length(face.normal)).toBeCloseTo(1, 12);
      face.vertexIndices.forEach((vertexIndex, index) => {
        const nextIndex = face.vertexIndices[(index + 1) % 3];
        const position = D4_STANDARD_GEOMETRY_V4.vertices[vertexIndex]?.position;
        const nextPosition =
          nextIndex === undefined
            ? undefined
            : D4_STANDARD_GEOMETRY_V4.vertices[nextIndex]?.position;
        if (
          nextIndex === undefined ||
          position === undefined ||
          nextPosition === undefined
        ) {
          throw new Error("D4 edge geometry is missing");
        }
        const edge =
          vertexIndex < nextIndex
            ? `${vertexIndex}:${nextIndex}`
            : `${nextIndex}:${vertexIndex}`;
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
        edgeLengths.add(length(subtract(position, nextPosition)).toFixed(12));
      });
    }
    expect(edgeCounts.size).toBe(6);
    expect(new Set(edgeCounts.values())).toEqual(new Set([2]));
    expect(edgeLengths.size).toBe(1);
    expect(
      D4_STANDARD_GEOMETRY_V4.vertices.length -
        edgeCounts.size +
        D4_STANDARD_GEOMETRY_V4.faces.length,
    ).toBe(2);
  });

  it("places one value at every vertex of each visible face", () => {
    const valueUses = new Map<number, number>();
    D4_STANDARD_GEOMETRY_V4.faces.forEach((face) => {
      expect(face.labels).toHaveLength(3);
      expect(face.labels.map(({ value }) => value).sort()).toEqual(
        face.vertexIndices.map((index) => index + 1).sort(),
      );
      face.labels.forEach((label, index) => {
        const vertexIndex = face.vertexIndices[index];
        const vertex =
          vertexIndex === undefined
            ? undefined
            : D4_STANDARD_GEOMETRY_V4.vertices[vertexIndex]?.position;
        if (vertex === undefined) throw new Error("D4 label vertex is missing");
        expect(dot(face.normal, subtract(label.origin, vertex))).toBeCloseTo(0, 12);
        expectVector(cross(label.right, label.up), face.normal);
        expect(label.alignment).toBe("surface");
        expect(dot(label.up, subtract(vertex, label.origin))).toBeGreaterThan(0);
        expect(label.maxWidth).toBe(0.75);
        expect(label.maxHeight).toBe(0.57);
        valueUses.set(label.value, (valueUses.get(label.value) ?? 0) + 1);
      });
    });
    expect([...valueUses.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(new Set(valueUses.values())).toEqual(new Set([3]));
    expect(getOppositeFaceValueV4("d4", 1)).toBeNull();
  });

  it("orients each result vertex toward the readable apex", () => {
    for (const { result, rotation } of D4_STANDARD_GEOMETRY_V4.resultOrientations) {
      const resultVertex = D4_STANDARD_GEOMETRY_V4.vertices[result - 1]?.position;
      if (resultVertex === undefined) throw new Error("D4 result vertex is missing");
      expect(Math.hypot(...rotation)).toBeCloseTo(1, 12);
      expectVector(rotate(resultVertex, rotation), RESULT_DIRECTION);
      const resultLabels = D4_STANDARD_GEOMETRY_V4.faces.flatMap((face) =>
        face.labels.filter(({ value }) => value === result),
      );
      expect(resultLabels).toHaveLength(3);
    }
  });

  it("reuses exact continuous skin coordinates at shared vertices", () => {
    const coordinatesByVertex = new Map<number, readonly [number, number]>();
    for (const face of D4_STANDARD_GEOMETRY_V4.faces) {
      face.vertexIndices.forEach((vertexIndex, index) => {
        const coordinate = face.skinCoordinates[index];
        if (coordinate === undefined) {
          throw new Error("D4 face skin coordinate is missing");
        }
        const existing = coordinatesByVertex.get(vertexIndex);
        if (existing === undefined) coordinatesByVertex.set(vertexIndex, coordinate);
        else expect(coordinate).toBe(existing);
      });
    }
    expect(coordinatesByVertex.size).toBe(4);
  });

  it("pins the approved descriptor hash", () => {
    const hash = createHash("sha256")
      .update(canonicalJsonV4(D4_STANDARD_GEOMETRY_V4))
      .digest("hex");
    expect(hash).toBe(
      "ecdbe7725e1f8c8b6aaccdf8cfa51233cebfa583ae3a8c616f8c7ee6ffdb8b13",
    );
  });
});
