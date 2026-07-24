import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D6_STANDARD_GEOMETRY_V4,
  formatFaceLabelV4,
  FUDGE_STANDARD_GEOMETRY_V4,
  getCanonicalGeometryDescriptorV4,
  getOppositeFaceValueV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  type GeometryFaceV4,
  type Point3V4,
  type QuaternionV4,
} from "../src";

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
  if (label === undefined) throw new Error("Fudge face label is missing");
  return label.value;
}

function expectVector(actual: Point3V4, expected: Point3V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
}

describe("canonical V4 Fudge geometry", () => {
  it("registers one cube-derived standard descriptor", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("fudge-standard-r1");
    expect(getCanonicalGeometryDescriptorV4("fudge-standard-r1")).toBe(
      FUDGE_STANDARD_GEOMETRY_V4,
    );
    expect(FUDGE_STANDARD_GEOMETRY_V4.vertices).toBe(
      D6_STANDARD_GEOMETRY_V4.vertices,
    );
    expect(FUDGE_STANDARD_GEOMETRY_V4.camera).toBe(
      D6_STANDARD_GEOMETRY_V4.camera,
    );
    expect(FUDGE_STANDARD_GEOMETRY_V4.faces).toHaveLength(6);
    expect(FUDGE_STANDARD_GEOMETRY_V4.resultOrientations).toHaveLength(3);
  });

  it("places two opposite faces for each symbol", () => {
    const values = FUDGE_STANDARD_GEOMETRY_V4.faces.map(faceValue);
    expect(values.filter((value) => value === -1)).toHaveLength(2);
    expect(values.filter((value) => value === 0)).toHaveLength(2);
    expect(values.filter((value) => value === 1)).toHaveLength(2);
    expect(new Set(FUDGE_STANDARD_GEOMETRY_V4.faces.map(({ id }) => id)).size).toBe(6);

    for (const result of [-1, 0, 1] as const) {
      const [first, second] = FUDGE_STANDARD_GEOMETRY_V4.faces.filter(
        (face) => faceValue(face) === result,
      );
      if (first === undefined || second === undefined) {
        throw new Error("Fudge symbol faces are missing");
      }
      expect(dot(first.normal, second.normal)).toBe(-1);
      expect(getOppositeFaceValueV4("fudge", result)).toBeNull();
    }
    expect(formatFaceLabelV4("fudge", -1)).toBe("−");
    expect(formatFaceLabelV4("fudge", 0)).toBe("");
    expect(formatFaceLabelV4("fudge", 1)).toBe("+");
  });

  it("shares exact cube topology and continuous skin coordinates", () => {
    FUDGE_STANDARD_GEOMETRY_V4.faces.forEach((face, index) => {
      const cubeFace = D6_STANDARD_GEOMETRY_V4.faces[index];
      if (cubeFace === undefined) throw new Error("D6 source face is missing");
      expect(face.normal).toBe(cubeFace.normal);
      expect(face.vertexIndices).toBe(cubeFace.vertexIndices);
      expect(face.skinCoordinates).toBe(cubeFace.skinCoordinates);
      expect(face.labels[0]?.origin).toBe(cubeFace.labels[0]?.origin);
    });
  });

  it("rests each canonical symbol face physically on top", () => {
    const faceIdByResult = new Map([
      [-1, "face-negative-a"],
      [0, "face-blank-a"],
      [1, "face-positive-a"],
    ]);
    for (const { result, rotation } of FUDGE_STANDARD_GEOMETRY_V4.resultOrientations) {
      const faceId = faceIdByResult.get(result);
      const face = FUDGE_STANDARD_GEOMETRY_V4.faces.find(
        (candidate) => candidate.id === faceId,
      );
      const label = face?.labels[0];
      if (face === undefined || label === undefined) {
        throw new Error("Fudge result face is missing");
      }
      expect(Math.hypot(...rotation)).toBeCloseTo(1, 12);
      expectVector(rotate(face.normal, rotation), [0, 1, 0]);
      expect(label.alignment).toBe("surface");
    }
  });

  it("pins the approved descriptor hash", () => {
    const hash = createHash("sha256")
      .update(canonicalJsonV4(FUDGE_STANDARD_GEOMETRY_V4))
      .digest("hex");
    expect(hash).toBe(
      "810bcc4de463df0efd20e5a7f3d4214b941a6821ec30a84fde9df0ec39ec315e",
    );
  });
});
