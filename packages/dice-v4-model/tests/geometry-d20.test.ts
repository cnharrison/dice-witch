import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D20_STANDARD_GEOMETRY_R2_V4,
  D20_STANDARD_GEOMETRY_V4,
  getCanonicalGeometryDescriptorV4,
  getOppositeFaceValueV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  projectPolyhedralGeometryV4,
  type GeometryFaceV4,
  type Point3V4,
  type PolyhedralGeometryDescriptorV4,
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
  const quaternionVector: Point3V4 = [
    quaternion[0],
    quaternion[1],
    quaternion[2],
  ];
  const vectorCross = cross(quaternionVector, vector);
  const twiceCross: Point3V4 = [
    vectorCross[0] * 2,
    vectorCross[1] * 2,
    vectorCross[2] * 2,
  ];
  const correction = cross(quaternionVector, twiceCross);
  return [
    vector[0] + quaternion[3] * twiceCross[0] + correction[0],
    vector[1] + quaternion[3] * twiceCross[1] + correction[1],
    vector[2] + quaternion[3] * twiceCross[2] + correction[2],
  ];
}

function faceValue(face: GeometryFaceV4): number {
  const label = face.labels[0];
  if (label === undefined) throw new Error("D20 face label is missing");
  return label.value;
}

function expectVector(actual: Point3V4, expected: Point3V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
}

function descriptorHash(descriptor: PolyhedralGeometryDescriptorV4): string {
  return createHash("sha256")
    .update(canonicalJsonV4(descriptor))
    .digest("hex");
}

describe("canonical V4 d20 geometry", () => {
  it("registers the immutable standard descriptor and additive r2 framing", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("d20-standard-r1");
    expect(getCanonicalGeometryDescriptorV4("d20-standard-r1")).toBe(
      D20_STANDARD_GEOMETRY_V4,
    );
    expect(D20_STANDARD_GEOMETRY_V4.vertices).toHaveLength(12);
    expect(D20_STANDARD_GEOMETRY_V4.faces).toHaveLength(20);
    expect(D20_STANDARD_GEOMETRY_V4.resultOrientations).toHaveLength(20);
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("d20-standard-r2");
    expect(getCanonicalGeometryDescriptorV4("d20-standard-r2")).toBe(
      D20_STANDARD_GEOMETRY_R2_V4,
    );
    expect(D20_STANDARD_GEOMETRY_R2_V4.vertices).toBe(
      D20_STANDARD_GEOMETRY_V4.vertices,
    );
    expect(D20_STANDARD_GEOMETRY_R2_V4.faces).toBe(
      D20_STANDARD_GEOMETRY_V4.faces,
    );
    expect(D20_STANDARD_GEOMETRY_R2_V4.resultOrientations).toBe(
      D20_STANDARD_GEOMETRY_V4.resultOrientations,
    );
    expect(D20_STANDARD_GEOMETRY_R2_V4.camera).toEqual({
      ...D20_STANDARD_GEOMETRY_V4.camera,
      orthographicHeight: 2.35,
    });
  });

  it("is a regular closed outward-wound manifold", () => {
    const edgeCounts = new Map<string, number>();
    const edgeLengths = new Set<string>();
    for (const { position } of D20_STANDARD_GEOMETRY_V4.vertices) {
      expect(length(position)).toBeCloseTo(1, 12);
    }
    for (const face of D20_STANDARD_GEOMETRY_V4.faces) {
      expect(face.vertexIndices).toHaveLength(3);
      const [first, second, third] = face.vertexIndices.map(
        (index) => D20_STANDARD_GEOMETRY_V4.vertices[index]?.position,
      );
      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("D20 face references a missing vertex");
      }
      expect(
        dot(
          cross(subtract(second, first), subtract(third, first)),
          face.normal,
        ),
      ).toBeGreaterThan(0);
      expect(dot(face.normal, first)).toBeGreaterThan(0);
      expect(length(face.normal)).toBeCloseTo(1, 12);

      for (let index = 0; index < 3; index += 1) {
        const start = face.vertexIndices[index];
        const end = face.vertexIndices[(index + 1) % 3];
        if (start === undefined || end === undefined) {
          throw new Error("D20 edge is missing a vertex");
        }
        const startPosition =
          D20_STANDARD_GEOMETRY_V4.vertices[start]?.position;
        const endPosition = D20_STANDARD_GEOMETRY_V4.vertices[end]?.position;
        if (startPosition === undefined || endPosition === undefined) {
          throw new Error("D20 edge references a missing vertex");
        }
        const edge = start < end ? `${start}:${end}` : `${end}:${start}`;
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
        edgeLengths.add(
          length(subtract(startPosition, endPosition)).toFixed(12),
        );
      }
    }
    expect(edgeCounts.size).toBe(30);
    expect(new Set(edgeCounts.values())).toEqual(new Set([2]));
    expect(edgeLengths.size).toBe(1);
    expect(
      D20_STANDARD_GEOMETRY_V4.vertices.length -
        edgeCounts.size +
        D20_STANDARD_GEOMETRY_V4.faces.length,
    ).toBe(2);
  });

  it("uses every conventional value once with opposite faces summing to 21", () => {
    const faceByValue = new Map(
      D20_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    expect([...faceByValue.keys()].sort((left, right) => left - right)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    for (let value = 1; value <= 20; value += 1) {
      const oppositeValue = getOppositeFaceValueV4("d20", value);
      const face = faceByValue.get(value);
      const opposite =
        oppositeValue === null ? undefined : faceByValue.get(oppositeValue);
      if (face === undefined || opposite === undefined) {
        throw new Error("D20 opposite face is missing");
      }
      expect(oppositeValue).toBe(21 - value);
      expectVector(opposite.normal, [
        -face.normal[0],
        -face.normal[1],
        -face.normal[2],
      ]);
    }
  });

  it("wraps one continuous skin from two opposite physical vertices", () => {
    const coordinatesByVertex = new Map<number, readonly [number, number]>();
    for (const face of D20_STANDARD_GEOMETRY_V4.faces) {
      expect(face.skinCoordinates).toHaveLength(3);
      face.vertexIndices.forEach((vertexIndex, index) => {
        const coordinate = face.skinCoordinates[index];
        if (coordinate === undefined) {
          throw new Error("D20 face skin coordinate is missing");
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
    expect(coordinatesByVertex.size).toBe(12);
    expect(coordinatesByVertex.get(0)).toEqual([0.5, 0.5]);
    expect(coordinatesByVertex.get(3)).toEqual([1, 1]);
  });

  it("rests every result on its opposite face like a physical d20", () => {
    const faceByValue = new Map(
      D20_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    for (const { result, rotation } of D20_STANDARD_GEOMETRY_V4.resultOrientations) {
      const face = faceByValue.get(result);
      const oppositeValue = getOppositeFaceValueV4("d20", result);
      const opposite =
        oppositeValue === null ? undefined : faceByValue.get(oppositeValue);
      if (face === undefined || opposite === undefined) {
        throw new Error("D20 result or support face is missing");
      }
      expect(Math.hypot(...rotation)).toBeCloseTo(1, 12);
      expectVector(rotate(face.normal, rotation), [0, 1, 0]);
      expectVector(rotate(opposite.normal, rotation), [0, -1, 0]);

      const supportHeights = opposite.vertexIndices.map((vertexIndex) => {
        const position = D20_STANDARD_GEOMETRY_V4.vertices[vertexIndex]?.position;
        if (position === undefined) throw new Error("D20 support vertex is missing");
        return rotate(position, rotation)[1];
      });
      expect(Math.max(...supportHeights) - Math.min(...supportHeights)).toBeCloseTo(
        0,
        12,
      );
      const allHeights = D20_STANDARD_GEOMETRY_V4.vertices.map(
        ({ position }) => rotate(position, rotation)[1],
      );
      expect(supportHeights[0]).toBeCloseTo(Math.min(...allHeights), 12);

      const projection = projectPolyhedralGeometryV4(
        D20_STANDARD_GEOMETRY_V4,
        result,
      );
      const resultProjection = projection.visibleFaces.find(
        ({ labels }) => labels.some(({ value }) => value === result),
      );
      const resultLabel = resultProjection?.labels.find(
        ({ value }) => value === result,
      );
      if (resultProjection === undefined || resultLabel === undefined) {
        throw new Error("D20 result label is hidden");
      }
      expect(resultLabel.right[0] / Math.hypot(...resultLabel.right)).toBeGreaterThan(
        0.95,
      );
      expect(-resultLabel.up[1] / Math.hypot(...resultLabel.up)).toBeGreaterThan(
        0.95,
      );
      const resultVertexHeights = resultProjection.vertexIndices.map(
        (vertexIndex) => {
          const position = projection.vertices[vertexIndex]?.position;
          if (position === undefined) {
            throw new Error("D20 result projection is missing a vertex");
          }
          return position[1];
        },
      );
      const minimum = Math.min(...resultVertexHeights);
      expect(
        resultVertexHeights.filter(
          (height) => Math.abs(height - minimum) < 1e-12,
        ),
      ).toHaveLength(1);
    }
  });

  it("uses authored physical label directions and enlarged bounds", () => {
    const labelTopVertexByValue = new Map([
      [1, 3],
      [2, 2],
      [3, 4],
      [4, 4],
      [5, 9],
      [6, 10],
      [7, 7],
      [8, 1],
      [9, 9],
      [10, 2],
      [11, 1],
      [12, 10],
      [13, 2],
      [14, 4],
      [15, 9],
      [16, 10],
      [17, 7],
      [18, 7],
      [19, 1],
      [20, 0],
    ]);
    const faceByValue = new Map(
      D20_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );

    for (const [value, vertexIndex] of labelTopVertexByValue) {
      const label = faceByValue.get(value)?.labels[0];
      const topVertex = D20_STANDARD_GEOMETRY_V4.vertices[vertexIndex]?.position;
      if (label === undefined || topVertex === undefined) {
        throw new Error("D20 authored label frame is missing");
      }
      const direction = subtract(topVertex, label.origin);
      expect(dot(label.up, direction) / length(direction)).toBeCloseTo(1, 12);
    }

    for (const face of D20_STANDARD_GEOMETRY_V4.faces) {
      const label = face.labels[0];
      if (label === undefined) throw new Error("D20 face label is missing");
      expect(label.maxWidth).toBe(0.82);
      expect(label.maxHeight).toBe(0.62);
    }
  });

  it("defines orthonormal label frames contained within each triangle", () => {
    for (const face of D20_STANDARD_GEOMETRY_V4.faces) {
      const label = face.labels[0];
      if (label === undefined) throw new Error("D20 face label is missing");
      expect(label.alignment).toBe("surface");
      expect(dot(label.origin, face.normal)).toBeGreaterThan(0);
      expect(length(label.right)).toBeCloseTo(1, 12);
      expect(length(label.up)).toBeCloseTo(1, 12);
      expect(dot(label.right, label.up)).toBeCloseTo(0, 12);
      expect(dot(label.right, face.normal)).toBeCloseTo(0, 12);
      expect(dot(label.up, face.normal)).toBeCloseTo(0, 12);
      expectVector(cross(label.right, label.up), face.normal);
      expect(label.maxWidth).toBeGreaterThan(0);
      expect(label.maxWidth).toBeLessThan(1);
      expect(label.maxHeight).toBeGreaterThan(0);
      expect(label.maxHeight).toBeLessThan(1);
      expect(label.opticalInset).toBeGreaterThanOrEqual(0);
    }
  });

  it("pins the immutable standard descriptor hashes", () => {
    expect(descriptorHash(D20_STANDARD_GEOMETRY_V4)).toBe(
      "d395a7d72431463d82f1e56ce94a8a3939c01bf3c8e82e08b79f7bd74fcd6c02",
    );
    expect(descriptorHash(D20_STANDARD_GEOMETRY_R2_V4)).toBe(
      "6ac911aeb0e25cdecef562b26759f92976e8c9581207518540503f4de295506f",
    );
  });
});
