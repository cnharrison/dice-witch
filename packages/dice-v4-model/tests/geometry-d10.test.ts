import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D10_STANDARD_GEOMETRY_V4,
  getCanonicalGeometryDescriptorV4,
  getOppositeFaceValueV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  PERCENTILE_STANDARD_GEOMETRY_V4,
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
  if (label === undefined) throw new Error("D10 face label is missing");
  return label.value;
}

function expectVector(actual: Point3V4, expected: Point3V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
}

describe("canonical V4 d10 and percentile geometry", () => {
  it("registers complete shared trapezohedron descriptors", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toEqual(
      expect.arrayContaining(["d10-standard-r1", "percentile-standard-r1"]),
    );
    expect(getCanonicalGeometryDescriptorV4("d10-standard-r1")).toBe(
      D10_STANDARD_GEOMETRY_V4,
    );
    expect(
      getCanonicalGeometryDescriptorV4("percentile-standard-r1"),
    ).toBe(PERCENTILE_STANDARD_GEOMETRY_V4);
    expect(D10_STANDARD_GEOMETRY_V4.vertices).toHaveLength(12);
    expect(D10_STANDARD_GEOMETRY_V4.faces).toHaveLength(10);
    expect(D10_STANDARD_GEOMETRY_V4.resultOrientations).toHaveLength(10);
    expect(PERCENTILE_STANDARD_GEOMETRY_V4.vertices).toBe(
      D10_STANDARD_GEOMETRY_V4.vertices,
    );
  });

  it("is a closed outward-wound pentagonal trapezohedron", () => {
    const edgeCounts = new Map<string, number>();
    const vertexUses = new Map<number, number>();
    const radii = D10_STANDARD_GEOMETRY_V4.vertices.map(({ position }) =>
      length(position).toFixed(12),
    );
    expect(Math.max(...radii.map(Number))).toBeCloseTo(1, 12);
    expect(new Set(radii).size).toBe(2);

    for (const face of D10_STANDARD_GEOMETRY_V4.faces) {
      expect(face.vertexIndices).toHaveLength(4);
      const [first, second, third] = face.vertexIndices.map(
        (index) => D10_STANDARD_GEOMETRY_V4.vertices[index]?.position,
      );
      const origin = face.labels[0]?.origin;
      if (
        first === undefined ||
        second === undefined ||
        third === undefined ||
        origin === undefined
      ) {
        throw new Error("D10 face geometry is missing");
      }
      expect(
        dot(
          cross(subtract(second, first), subtract(third, first)),
          face.normal,
        ),
      ).toBeGreaterThan(0);
      expect(length(face.normal)).toBeCloseTo(1, 12);

      face.vertexIndices.forEach((vertexIndex, index) => {
        const position = D10_STANDARD_GEOMETRY_V4.vertices[vertexIndex]?.position;
        const nextIndex = face.vertexIndices[(index + 1) % 4];
        if (position === undefined || nextIndex === undefined) {
          throw new Error("D10 edge geometry is missing");
        }
        expect(dot(face.normal, subtract(position, origin))).toBeCloseTo(0, 12);
        const edge =
          vertexIndex < nextIndex
            ? `${vertexIndex}:${nextIndex}`
            : `${nextIndex}:${vertexIndex}`;
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
        vertexUses.set(vertexIndex, (vertexUses.get(vertexIndex) ?? 0) + 1);
      });
    }
    expect(edgeCounts.size).toBe(20);
    expect(new Set(edgeCounts.values())).toEqual(new Set([2]));
    expect(vertexUses.get(0)).toBe(5);
    expect(vertexUses.get(1)).toBe(5);
    for (let vertexIndex = 2; vertexIndex < 12; vertexIndex += 1) {
      expect(vertexUses.get(vertexIndex)).toBe(3);
    }
    expect(
      D10_STANDARD_GEOMETRY_V4.vertices.length -
        edgeCounts.size +
        D10_STANDARD_GEOMETRY_V4.faces.length,
    ).toBe(2);
  });

  it("uses conventional squat physical proportions", () => {
    const positions = D10_STANDARD_GEOMETRY_V4.vertices.map(
      ({ position }) => position,
    );
    const poles = positions.slice(0, 2);
    const ring = positions.slice(2);
    const poleHeight = Math.abs((poles[0]?.[2] ?? 0) - (poles[1]?.[2] ?? 0));
    const ringDiameter =
      Math.max(...ring.map(([x, y]) => Math.hypot(x, y))) * 2;

    expect(ringDiameter / poleHeight).toBeCloseTo(
      Math.sqrt(Math.sqrt(5) - 1),
      12,
    );
  });

  it("uses corrected native and percentile face semantics", () => {
    const d10Values = D10_STANDARD_GEOMETRY_V4.faces.map(faceValue);
    const percentileValues = PERCENTILE_STANDARD_GEOMETRY_V4.faces.map(faceValue);
    expect([...d10Values].sort((left, right) => left - right)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    expect(d10Values).not.toContain(0);
    expect([...percentileValues].sort((left, right) => left - right)).toEqual(
      [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
    );
    D10_STANDARD_GEOMETRY_V4.faces.forEach((face, index) => {
      const percentileFace = PERCENTILE_STANDARD_GEOMETRY_V4.faces[index];
      if (percentileFace === undefined) {
        throw new Error("Percentile face is missing");
      }
      expect(percentileFace.vertexIndices).toBe(face.vertexIndices);
      expect(faceValue(percentileFace)).toBe((10 - faceValue(face)) * 10);
    });
  });

  it("pins conventional opposite faces for both targets", () => {
    for (const [target, geometry, total] of [
      ["d10", D10_STANDARD_GEOMETRY_V4, 11],
      ["percentile", PERCENTILE_STANDARD_GEOMETRY_V4, 90],
    ] as const) {
      const faceByValue = new Map(
        geometry.faces.map((face) => [faceValue(face), face]),
      );
      for (const face of geometry.faces) {
        const value = faceValue(face);
        const oppositeValue = getOppositeFaceValueV4(target, value);
        const opposite =
          oppositeValue === null ? undefined : faceByValue.get(oppositeValue);
        if (opposite === undefined) throw new Error(`${target} opposite is missing`);
        expect(oppositeValue).toBe(total - value);
        expectVector(opposite.normal, [
          -face.normal[0],
          -face.normal[1],
          -face.normal[2],
        ]);
      }
    }
  });

  it("wraps one continuous skin from the two physical poles", () => {
    const coordinatesByVertex = new Map<number, readonly [number, number]>();
    D10_STANDARD_GEOMETRY_V4.faces.forEach((face, faceIndex) => {
      const percentileFace = PERCENTILE_STANDARD_GEOMETRY_V4.faces[faceIndex];
      if (percentileFace === undefined) throw new Error("Percentile face is missing");
      expect([0, 1]).toContain(face.vertexIndices[0]);
      face.vertexIndices.forEach((vertexIndex, index) => {
        const coordinate = face.skinCoordinates[index];
        const percentileCoordinate = percentileFace.skinCoordinates[index];
        if (coordinate === undefined || percentileCoordinate === undefined) {
          throw new Error("D10 skin coordinate is missing");
        }
        expect(percentileCoordinate).toBe(coordinate);
        const existing = coordinatesByVertex.get(vertexIndex);
        if (existing === undefined) coordinatesByVertex.set(vertexIndex, coordinate);
        else expect(coordinate).toBe(existing);
      });
    });
    expect(coordinatesByVertex.size).toBe(12);
    expect(coordinatesByVertex.get(0)).toEqual([0.5, 0]);
    expect(coordinatesByVertex.get(1)).toEqual([0.5, 1]);
  });

  it("uses fixed pole-facing engraving proportions and alignment", () => {
    for (const geometry of [
      D10_STANDARD_GEOMETRY_V4,
      PERCENTILE_STANDARD_GEOMETRY_V4,
    ]) {
      for (const face of geometry.faces) {
        const label = face.labels[0];
        const poleIndex = face.vertexIndices[0];
        const pole =
          poleIndex === undefined
            ? undefined
            : geometry.vertices[poleIndex]?.position;
        if (label === undefined || pole === undefined) {
          throw new Error("D10 label or pole is missing");
        }
        const poleDirection = subtract(pole, label.origin);
        const alignment = dot(label.up, poleDirection) / length(poleDirection);
        expect(label.alignment).toBe("surface");
        expect(alignment).toBeCloseTo(1, 12);
        expect(label.maxWidth).toBe(0.76);
        expect(label.maxHeight).toBe(0.76);
      }
    }
  });

  it("rests every native and percentile result on its opposite face", () => {
    let sharedResultUp: Point3V4 | undefined;
    for (const geometry of [
      D10_STANDARD_GEOMETRY_V4,
      PERCENTILE_STANDARD_GEOMETRY_V4,
    ]) {
      const faceByValue = new Map(
        geometry.faces.map((face) => [faceValue(face), face]),
      );
      for (const { result, rotation } of geometry.resultOrientations) {
        const face = faceByValue.get(result);
        const label = face?.labels[0];
        const oppositeValue = getOppositeFaceValueV4(geometry.target, result);
        const opposite =
          oppositeValue === null ? undefined : faceByValue.get(oppositeValue);
        if (face === undefined || label === undefined || opposite === undefined) {
          throw new Error("D10 result or support face is missing");
        }
        expect(Math.hypot(...rotation)).toBeCloseTo(1, 12);
        expectVector(rotate(face.normal, rotation), [0, 1, 0]);
        expectVector(rotate(opposite.normal, rotation), [0, -1, 0]);
        expectVector(cross(label.right, label.up), face.normal);
        const resultUp = rotate(label.up, rotation);
        if (sharedResultUp === undefined) sharedResultUp = resultUp;
        else expectVector(resultUp, sharedResultUp);
      }
    }
  });

  it("pins both approved descriptor hashes", () => {
    const hash = (geometry: PolyhedralGeometryDescriptorV4): string =>
      createHash("sha256").update(canonicalJsonV4(geometry)).digest("hex");
    expect(hash(D10_STANDARD_GEOMETRY_V4)).toBe(
      "d16654deafc360feb152ce594477e3c7666f2ac9ad4df64b1000572273ba4f03",
    );
    expect(hash(PERCENTILE_STANDARD_GEOMETRY_V4)).toBe(
      "3391e4b0583ce20396c6418f36297970d5eda509a019f1c94a04b70596903799",
    );
  });
});
