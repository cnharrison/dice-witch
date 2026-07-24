import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D12_STANDARD_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
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
  if (label === undefined) throw new Error("D12 face label is missing");
  return label.value;
}

function expectVector(actual: Point3V4, expected: Point3V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
}

describe("canonical V4 d12 geometry", () => {
  it("registers one complete standard descriptor", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("d12-standard-r1");
    expect(getCanonicalGeometryDescriptorV4("d12-standard-r1")).toBe(
      D12_STANDARD_GEOMETRY_V4,
    );
    expect(D12_STANDARD_GEOMETRY_V4.vertices).toHaveLength(20);
    expect(D12_STANDARD_GEOMETRY_V4.faces).toHaveLength(12);
    expect(D12_STANDARD_GEOMETRY_V4.resultOrientations).toHaveLength(12);
  });

  it("is the regular closed dual of the canonical d20", () => {
    const edgeCounts = new Map<string, number>();
    const edgeLengths = new Set<string>();
    const vertexUses = new Map<number, number>();
    for (const { position } of D12_STANDARD_GEOMETRY_V4.vertices) {
      expect(length(position)).toBeCloseTo(1, 12);
    }
    D12_STANDARD_GEOMETRY_V4.faces.forEach((face, faceIndex) => {
      expect(face.vertexIndices).toHaveLength(5);
      const dualNormal =
        D20_STANDARD_GEOMETRY_V4.vertices[faceIndex]?.position;
      const origin = face.labels[0]?.origin;
      if (dualNormal === undefined || origin === undefined) {
        throw new Error("D12 dual face frame is missing");
      }
      expectVector(face.normal, dualNormal);

      face.vertexIndices.forEach((vertexIndex, index) => {
        const position = D12_STANDARD_GEOMETRY_V4.vertices[vertexIndex]?.position;
        const nextIndex = face.vertexIndices[(index + 1) % 5];
        const nextPosition =
          nextIndex === undefined
            ? undefined
            : D12_STANDARD_GEOMETRY_V4.vertices[nextIndex]?.position;
        const dualFace = D20_STANDARD_GEOMETRY_V4.faces[vertexIndex];
        if (
          position === undefined ||
          nextIndex === undefined ||
          nextPosition === undefined ||
          dualFace === undefined
        ) {
          throw new Error("D12 topology references a missing vertex");
        }
        expect(dualFace.vertexIndices).toContain(faceIndex);
        expect(dot(face.normal, subtract(position, origin))).toBeCloseTo(0, 12);
        const edge =
          vertexIndex < nextIndex
            ? `${vertexIndex}:${nextIndex}`
            : `${nextIndex}:${vertexIndex}`;
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
        edgeLengths.add(length(subtract(position, nextPosition)).toFixed(12));
        vertexUses.set(vertexIndex, (vertexUses.get(vertexIndex) ?? 0) + 1);
      });
    });
    expect(edgeCounts.size).toBe(30);
    expect(new Set(edgeCounts.values())).toEqual(new Set([2]));
    expect(edgeLengths.size).toBe(1);
    expect(vertexUses.size).toBe(20);
    expect(new Set(vertexUses.values())).toEqual(new Set([3]));
    expect(
      D12_STANDARD_GEOMETRY_V4.vertices.length -
        edgeCounts.size +
        D12_STANDARD_GEOMETRY_V4.faces.length,
    ).toBe(2);
  });

  it("uses every conventional value once with opposite faces summing to 13", () => {
    const faceByValue = new Map(
      D12_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    expect([...faceByValue.keys()].sort((left, right) => left - right)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    for (let value = 1; value <= 12; value += 1) {
      const oppositeValue = getOppositeFaceValueV4("d12", value);
      const face = faceByValue.get(value);
      const opposite =
        oppositeValue === null ? undefined : faceByValue.get(oppositeValue);
      if (face === undefined || opposite === undefined) {
        throw new Error("D12 opposite face is missing");
      }
      expect(oppositeValue).toBe(13 - value);
      expectVector(opposite.normal, [
        -face.normal[0],
        -face.normal[1],
        -face.normal[2],
      ]);
    }
  });

  it("reuses exact continuous skin coordinates at shared vertices", () => {
    const coordinatesByVertex = new Map<number, readonly [number, number]>();
    for (const face of D12_STANDARD_GEOMETRY_V4.faces) {
      expect(face.skinCoordinates).toHaveLength(5);
      face.vertexIndices.forEach((vertexIndex, index) => {
        const coordinate = face.skinCoordinates[index];
        if (coordinate === undefined) {
          throw new Error("D12 face skin coordinate is missing");
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
    expect(coordinatesByVertex.size).toBe(20);
  });

  it("orients every result on top with fixed physical engraving frames", () => {
    const faceByValue = new Map(
      D12_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    for (const { result, rotation } of D12_STANDARD_GEOMETRY_V4.resultOrientations) {
      const face = faceByValue.get(result);
      const label = face?.labels[0];
      if (face === undefined || label === undefined) {
        throw new Error("D12 result face is missing");
      }
      expect(Math.hypot(...rotation)).toBeCloseTo(1, 12);
      expectVector(rotate(face.normal, rotation), [0, 1, 0]);
      expect(label.alignment).toBe("surface");
      expectVector(cross(label.right, label.up), face.normal);
      expect(label.maxWidth).toBe(0.96);
      expect(label.maxHeight).toBe(0.8);
      expect(label.opticalInset).toBeGreaterThanOrEqual(0);
    }
  });

  it("pins the approved descriptor hash", () => {
    const hash = createHash("sha256")
      .update(canonicalJsonV4(D12_STANDARD_GEOMETRY_V4))
      .digest("hex");
    expect(hash).toBe(
      "c8eddc44d2f6a7f2e5189cf4f52bad07e21a091f53f31f80bcfc92129a9e3390",
    );
  });
});
