import { describe, expect, it } from "vitest";
import {
  D10_STANDARD_GEOMETRY_V4,
  D12_STANDARD_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
  D4_STANDARD_GEOMETRY_V4,
  D6_STANDARD_GEOMETRY_V4,
  D8_STANDARD_GEOMETRY_V4,
  FUDGE_STANDARD_GEOMETRY_V4,
  PERCENTILE_STANDARD_GEOMETRY_V4,
  projectPolyhedralGeometryV4,
  type GeometryFaceV4,
  type Point3V4,
  type PolyhedralGeometryDescriptorV4,
  type QuaternionV4,
} from "../src";

const FACE_READ_GEOMETRIES = [
  D6_STANDARD_GEOMETRY_V4,
  D8_STANDARD_GEOMETRY_V4,
  D10_STANDARD_GEOMETRY_V4,
  D12_STANDARD_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
  PERCENTILE_STANDARD_GEOMETRY_V4,
  FUDGE_STANDARD_GEOMETRY_V4,
] as const satisfies readonly PolyhedralGeometryDescriptorV4[];

const ALL_CONVENTIONAL_GEOMETRIES = [
  D4_STANDARD_GEOMETRY_V4,
  ...FACE_READ_GEOMETRIES,
] as const satisfies readonly PolyhedralGeometryDescriptorV4[];
const FUDGE_RESULT_FACE_ID_V4 = new Map<number, string>([
  [-1, "face-negative-a"],
  [0, "face-blank-a"],
  [1, "face-positive-a"],
]);
const D8_TOP_VERTEX_BY_VALUE_V4 = new Map([
  [1, 3],
  [2, 3],
  [3, 2],
  [4, 2],
  [5, 3],
  [6, 3],
  [7, 2],
  [8, 2],
]);
const D12_BOTTOM_EDGE_NEIGHBOR_BY_VALUE_V4 = new Map([
  [1, 2],
  [2, 1],
  [3, 11],
  [4, 1],
  [5, 2],
  [6, 2],
  [7, 1],
  [8, 1],
  [9, 11],
  [10, 2],
  [11, 9],
  [12, 11],
]);

function subtract(left: Point3V4, right: Point3V4): Point3V4 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Point3V4, right: Point3V4): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function length(vector: Point3V4): number {
  return Math.sqrt(dot(vector, vector));
}

function normalize(vector: Point3V4): Point3V4 {
  const magnitude = length(vector);
  return [
    vector[0] / magnitude,
    vector[1] / magnitude,
    vector[2] / magnitude,
  ];
}

function cross(left: Point3V4, right: Point3V4): Point3V4 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function rotate(point: Point3V4, quaternion: QuaternionV4): Point3V4 {
  const axis: Point3V4 = [quaternion[0], quaternion[1], quaternion[2]];
  const axisCross = cross(axis, point);
  const twiceCross: Point3V4 = [
    axisCross[0] * 2,
    axisCross[1] * 2,
    axisCross[2] * 2,
  ];
  const correction = cross(axis, twiceCross);
  return [
    point[0] + quaternion[3] * twiceCross[0] + correction[0],
    point[1] + quaternion[3] * twiceCross[1] + correction[1],
    point[2] + quaternion[3] * twiceCross[2] + correction[2],
  ];
}

function expectVector(actual: Point3V4, expected: Point3V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
}

function faceValue(face: GeometryFaceV4): number {
  const label = face.labels[0];
  if (label === undefined) throw new Error(`${face.id} label is missing`);
  return label.value;
}

function resultFace(
  geometry: PolyhedralGeometryDescriptorV4,
  result: number,
): GeometryFaceV4 {
  const fudgeFaceId =
    geometry.target === "fudge"
      ? FUDGE_RESULT_FACE_ID_V4.get(result)
      : undefined;
  const face = geometry.faces.find((candidate) =>
    fudgeFaceId === undefined
      ? candidate.labels.some(({ value }) => value === result)
      : candidate.id === fudgeFaceId,
  );
  if (face === undefined) throw new Error(`${geometry.id} result face is missing`);
  return face;
}

function faceOrigin(
  geometry: PolyhedralGeometryDescriptorV4,
  face: GeometryFaceV4,
): Point3V4 {
  const sum = face.vertexIndices.reduce<Point3V4>(
    (origin, index) => {
      const position = geometry.vertices[index]?.position;
      if (position === undefined) throw new Error(`${face.id} vertex is missing`);
      return [
        origin[0] + position[0],
        origin[1] + position[1],
        origin[2] + position[2],
      ];
    },
    [0, 0, 0],
  );
  return [
    sum[0] / face.vertexIndices.length,
    sum[1] / face.vertexIndices.length,
    sum[2] / face.vertexIndices.length,
  ];
}

function sharedEdgeMidpoint(
  geometry: PolyhedralGeometryDescriptorV4,
  face: GeometryFaceV4,
  neighbor: GeometryFaceV4,
): Point3V4 {
  const shared = face.vertexIndices.filter((index) =>
    neighbor.vertexIndices.includes(index),
  );
  const first = geometry.vertices[shared[0] ?? -1]?.position;
  const second = geometry.vertices[shared[1] ?? -1]?.position;
  if (shared.length !== 2 || first === undefined || second === undefined) {
    throw new Error(`${face.id} shared edge is missing`);
  }
  return [
    (first[0] + second[0]) / 2,
    (first[1] + second[1]) / 2,
    (first[2] + second[2]) / 2,
  ];
}

function oppositeFace(
  geometry: PolyhedralGeometryDescriptorV4,
  face: GeometryFaceV4,
): GeometryFaceV4 {
  const opposite = geometry.faces.find(
    (candidate) => dot(candidate.normal, face.normal) < -0.999999999999,
  );
  if (opposite === undefined) {
    throw new Error(`${geometry.id} support face is missing`);
  }
  return opposite;
}

function cameraElevationDegrees(
  geometry: PolyhedralGeometryDescriptorV4,
): number {
  const view = subtract(geometry.camera.position, geometry.camera.target);
  return (Math.asin(view[1] / Math.hypot(...view)) * 180) / Math.PI;
}

describe("V4 physical dice atlas", () => {
  it("uses one fixed physical engraving frame on every conventional face", () => {
    for (const geometry of ALL_CONVENTIONAL_GEOMETRIES) {
      for (const face of geometry.faces) {
        for (const label of face.labels) {
          expect(label.alignment, `${geometry.id}:${face.id}`).toBe("surface");
          expect(length(label.right)).toBeCloseTo(1, 12);
          expect(length(label.up)).toBeCloseTo(1, 12);
          expect(dot(label.right, label.up)).toBeCloseTo(0, 12);
          expect(dot(label.right, face.normal)).toBeCloseTo(0, 12);
          expect(dot(label.up, face.normal)).toBeCloseTo(0, 12);
          expectVector(cross(label.right, label.up), face.normal);
        }
      }
    }
  });

  it.each(FACE_READ_GEOMETRIES)(
    "rests every $id result on its opposite face with the result on top",
    (geometry) => {
      for (const { result, rotation } of geometry.resultOrientations) {
        const resultSurface = resultFace(geometry, result);
        const supportSurface = oppositeFace(geometry, resultSurface);
        expectVector(rotate(resultSurface.normal, rotation), [0, 1, 0]);
        expectVector(rotate(supportSurface.normal, rotation), [0, -1, 0]);

        const allHeights = geometry.vertices.map(
          ({ position }) => rotate(position, rotation)[1],
        );
        const faceHeights = (face: GeometryFaceV4) =>
          face.vertexIndices.map((index) => {
            const position = geometry.vertices[index]?.position;
            if (position === undefined) {
              throw new Error(`${geometry.id} face vertex is missing`);
            }
            return rotate(position, rotation)[1];
          });
        const resultHeights = faceHeights(resultSurface);
        const supportHeights = faceHeights(supportSurface);
        expect(Math.max(...resultHeights) - Math.min(...resultHeights)).toBeCloseTo(
          0,
          12,
        );
        expect(resultHeights[0]).toBeCloseTo(Math.max(...allHeights), 12);
        expect(Math.max(...supportHeights) - Math.min(...supportHeights)).toBeCloseTo(
          0,
          12,
        );
        expect(supportHeights[0]).toBeCloseTo(Math.min(...allHeights), 12);
      }
    },
  );

  it("rests every d4 result on the opposite triangular face", () => {
    for (const { result, rotation } of D4_STANDARD_GEOMETRY_V4.resultOrientations) {
      const resultVertexIndex = result - 1;
      const resultVertex = D4_STANDARD_GEOMETRY_V4.vertices[resultVertexIndex]?.position;
      const supportFace = D4_STANDARD_GEOMETRY_V4.faces.find(
        (face) => !face.vertexIndices.includes(resultVertexIndex),
      );
      if (resultVertex === undefined || supportFace === undefined) {
        throw new Error("D4 result support is missing");
      }
      expectVector(rotate(resultVertex, rotation), [0, 1, 0]);

      const allHeights = D4_STANDARD_GEOMETRY_V4.vertices.map(
        ({ position }) => rotate(position, rotation)[1],
      );
      const supportHeights = supportFace.vertexIndices.map((index) => {
        const position = D4_STANDARD_GEOMETRY_V4.vertices[index]?.position;
        if (position === undefined) throw new Error("D4 support vertex is missing");
        return rotate(position, rotation)[1];
      });
      expect(Math.max(...supportHeights) - Math.min(...supportHeights)).toBeCloseTo(
        0,
        12,
      );
      expect(supportHeights[0]).toBeCloseTo(Math.min(...allHeights), 12);
    }
  });

  it("uses an elevated tabletop camera for every conventional die", () => {
    const ranges = new Map<string, readonly [minimum: number, maximum: number]>([
      ["d4-standard-r1", [25, 45]],
      ["d6-standard-r1", [25, 55]],
      ["d8-standard-r1", [35, 55]],
      ["d10-standard-r1", [35, 55]],
      ["d12-standard-r1", [25, 45]],
      ["d20-standard-r1", [30, 50]],
      ["percentile-standard-r1", [35, 55]],
      ["fudge-standard-r1", [25, 55]],
    ]);
    for (const geometry of ALL_CONVENTIONAL_GEOMETRIES) {
      const range = ranges.get(geometry.id);
      if (range === undefined) throw new Error(`${geometry.id} camera range is missing`);
      const elevation = cameraElevationDegrees(geometry);
      expect(elevation, geometry.id).toBeGreaterThanOrEqual(range[0]);
      expect(elevation, geometry.id).toBeLessThanOrEqual(range[1]);
    }
  });

  it("uses the authored outward-apex engraving atlas on every d8 face", () => {
    for (const face of D8_STANDARD_GEOMETRY_V4.faces) {
      const label = face.labels[0];
      const topVertexIndex = D8_TOP_VERTEX_BY_VALUE_V4.get(faceValue(face));
      const topVertex =
        topVertexIndex === undefined
          ? undefined
          : D8_STANDARD_GEOMETRY_V4.vertices[topVertexIndex]?.position;
      if (label === undefined || topVertex === undefined) {
        throw new Error("D8 outward-apex frame is missing");
      }
      const topDirection = subtract(topVertex, label.origin);
      expect(dot(label.up, topDirection) / length(topDirection)).toBeCloseTo(
        1,
        12,
      );
    }
  });

  it("uses one congruent outward-apex presentation for every d8 result", () => {
    let referenceSignature: string | undefined;
    for (const { result } of D8_STANDARD_GEOMETRY_V4.resultOrientations) {
      const projected = projectPolyhedralGeometryV4(
        D8_STANDARD_GEOMETRY_V4,
        result,
      );
      expect(projected.visibleFaces).toHaveLength(4);
      const face = resultFace(D8_STANDARD_GEOMETRY_V4, result);
      const topVertexIndex = D8_TOP_VERTEX_BY_VALUE_V4.get(result);
      const topVertex =
        topVertexIndex === undefined
          ? undefined
          : projected.vertices[topVertexIndex]?.position;
      if (
        topVertexIndex === undefined ||
        topVertex === undefined ||
        !face.vertexIndices.includes(topVertexIndex)
      ) {
        throw new Error("D8 result top vertex is missing");
      }
      const resultVertexPositions = face.vertexIndices.map((index) => {
        const position = projected.vertices[index]?.position;
        if (position === undefined) throw new Error("D8 result vertex is missing");
        return position;
      });
      expect(topVertex[1]).toBeCloseTo(
        Math.min(...resultVertexPositions.map((position) => position[1])),
        12,
      );
      const signature = JSON.stringify(
        projected.vertices
          .map(({ position }) => position.map((value) => value.toFixed(12)))
          .sort(),
      );
      referenceSignature ??= signature;
      expect(signature).toBe(referenceSignature);
    }
  });

  it.each([D10_STANDARD_GEOMETRY_V4, PERCENTILE_STANDARD_GEOMETRY_V4])(
    "orients every $id result label upward for grouped readability",
    (geometry) => {
      for (const { result } of geometry.resultOrientations) {
        const projected = projectPolyhedralGeometryV4(geometry, result);
        const resultLabel = projected.visibleFaces
          .flatMap((face) => face.labels)
          .find((label) => label.value === result);
        if (resultLabel === undefined) {
          throw new Error(`${geometry.id} result label is missing`);
        }
        const upwardScreenRatio =
          -resultLabel.up[1] / Math.hypot(...resultLabel.up);
        expect(
          upwardScreenRatio,
          `${geometry.id}:${String(result)}`,
        ).toBeGreaterThan(0.5);
      }
    },
  );

  it("retains the frozen cyclic neighbors around d12 result 12", () => {
    const top = resultFace(D12_STANDARD_GEOMETRY_V4, 12);
    const neighbors = top.vertexIndices.map((start, index) => {
      const end = top.vertexIndices[(index + 1) % top.vertexIndices.length];
      const neighbor = D12_STANDARD_GEOMETRY_V4.faces.find(
        (face) =>
          face !== top &&
          end !== undefined &&
          face.vertexIndices.includes(start) &&
          face.vertexIndices.includes(end),
      );
      if (neighbor === undefined) throw new Error("D12 edge neighbor is missing");
      return faceValue(neighbor);
    });
    expect(neighbors).toEqual([6, 5, 9, 11, 3]);
  });

  it("uses one congruent tabletop presentation for every d12 result", () => {
    let referenceSignature: string | undefined;
    for (const { result } of D12_STANDARD_GEOMETRY_V4.resultOrientations) {
      const projected = projectPolyhedralGeometryV4(
        D12_STANDARD_GEOMETRY_V4,
        result,
      );
      const signature = JSON.stringify(
        projected.vertices
          .map(({ position }) => position.map((value) => value.toFixed(12)))
          .sort(),
      );
      referenceSignature ??= signature;
      expect(signature).toBe(referenceSignature);
      expect(projected.visibleFaces).toHaveLength(6);
      expect(
        projected.visibleFaces.some((face) =>
          face.labels.some((label) => label.value === result),
        ),
      ).toBe(true);
    }
  });

  it("uses the independently authored bottom edge for every d12 pose", () => {
    const faceByValue = new Map(
      D12_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    const expectedWorldUp: Point3V4 = [
      -0.3598720682262375,
      0,
      -0.9330016583643194,
    ];
    for (const { result, rotation } of D12_STANDARD_GEOMETRY_V4.resultOrientations) {
      const face = faceByValue.get(result);
      const neighborValue = D12_BOTTOM_EDGE_NEIGHBOR_BY_VALUE_V4.get(result);
      const neighbor =
        neighborValue === undefined ? undefined : faceByValue.get(neighborValue);
      if (face === undefined || neighbor === undefined) {
        throw new Error("D12 result pose edge is missing");
      }
      const poseUp = normalize(
        subtract(
          faceOrigin(D12_STANDARD_GEOMETRY_V4, face),
          sharedEdgeMidpoint(D12_STANDARD_GEOMETRY_V4, face, neighbor),
        ),
      );
      expectVector(rotate(poseUp, rotation), expectedWorldUp);
    }
  });

  it("uses the authored bottom-edge atlas on every d12 face", () => {
    const faceByValue = new Map(
      D12_STANDARD_GEOMETRY_V4.faces.map((face) => [faceValue(face), face]),
    );
    for (const [value, neighborValue] of D12_BOTTOM_EDGE_NEIGHBOR_BY_VALUE_V4) {
      const face = faceByValue.get(value);
      const neighbor = faceByValue.get(neighborValue);
      const label = face?.labels[0];
      if (face === undefined || neighbor === undefined || label === undefined) {
        throw new Error("D12 authored frame is missing");
      }
      const upDirection = subtract(
        label.origin,
        sharedEdgeMidpoint(D12_STANDARD_GEOMETRY_V4, face, neighbor),
      );
      expect(dot(label.up, upDirection) / length(upDirection)).toBeCloseTo(
        1,
        12,
      );
    }
  });
});
