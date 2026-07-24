import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D20_CRYSTAL_CUT_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
  getCanonicalGeometryDescriptorV4,
  getOppositeFaceValueV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  projectPolyhedralGeometryV4,
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

function faceValue(face: GeometryFaceV4): number | undefined {
  return face.labels[0]?.value;
}

describe("canonical V4 crystal-cut d20 geometry", () => {
  it("registers one closed chamfered descriptor with twenty numbered faces", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("d20-crystal-cut-r1");
    expect(getCanonicalGeometryDescriptorV4("d20-crystal-cut-r1")).toBe(
      D20_CRYSTAL_CUT_GEOMETRY_V4,
    );
    expect(D20_CRYSTAL_CUT_GEOMETRY_V4).toMatchObject({
      version: 1,
      id: "d20-crystal-cut-r1",
      kind: "polyhedral",
      target: "d20",
      form: "crystal-cut",
    });
    expect(D20_CRYSTAL_CUT_GEOMETRY_V4.vertices).toHaveLength(60);
    expect(D20_CRYSTAL_CUT_GEOMETRY_V4.faces).toHaveLength(62);
    expect(D20_CRYSTAL_CUT_GEOMETRY_V4.resultOrientations).toHaveLength(20);

    const numbered = D20_CRYSTAL_CUT_GEOMETRY_V4.faces.filter(
      (face) => face.labels.length > 0,
    );
    expect(numbered).toHaveLength(20);
    expect(
      numbered
        .map(faceValue)
        .sort((left, right) => (left ?? 0) - (right ?? 0)),
    ).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(
      D20_CRYSTAL_CUT_GEOMETRY_V4.faces.filter((face) =>
        face.id.startsWith("edge-"),
      ),
    ).toHaveLength(30);
    expect(
      D20_CRYSTAL_CUT_GEOMETRY_V4.faces.filter((face) =>
        face.id.startsWith("vertex-"),
      ),
    ).toHaveLength(12);
  });

  it("is an outward-wound closed manifold without degenerate faces", () => {
    const edges = new Map<string, number>();
    for (const face of D20_CRYSTAL_CUT_GEOMETRY_V4.faces) {
      expect(face.vertexIndices.length).toBeGreaterThanOrEqual(3);
      expect(face.skinCoordinates).toHaveLength(face.vertexIndices.length);
      const [firstIndex, secondIndex, thirdIndex] = face.vertexIndices;
      const first = D20_CRYSTAL_CUT_GEOMETRY_V4.vertices[firstIndex ?? -1]?.position;
      const second = D20_CRYSTAL_CUT_GEOMETRY_V4.vertices[secondIndex ?? -1]?.position;
      const third = D20_CRYSTAL_CUT_GEOMETRY_V4.vertices[thirdIndex ?? -1]?.position;
      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("Crystal-cut face references a missing vertex");
      }
      const winding = cross(subtract(second, first), subtract(third, first));
      expect(dot(winding, face.normal)).toBeGreaterThan(1e-8);
      const facePlane = dot(face.normal, first);
      expect(facePlane).toBeGreaterThan(0);
      for (const vertexIndex of face.vertexIndices) {
        const position = D20_CRYSTAL_CUT_GEOMETRY_V4.vertices[vertexIndex]?.position;
        if (position === undefined) {
          throw new Error("Crystal-cut face references a missing vertex");
        }
        expect(dot(face.normal, position)).toBeCloseTo(facePlane, 12);
      }

      face.vertexIndices.forEach((start, index) => {
        const end = face.vertexIndices[(index + 1) % face.vertexIndices.length];
        if (end === undefined) throw new Error("Crystal-cut edge is incomplete");
        const key = start < end ? `${String(start)}:${String(end)}` : `${String(end)}:${String(start)}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      });
    }
    expect(new Set(edges.values())).toEqual(new Set([2]));
    expect(
      D20_CRYSTAL_CUT_GEOMETRY_V4.vertices.length -
        edges.size +
        D20_CRYSTAL_CUT_GEOMETRY_V4.faces.length,
    ).toBe(2);
  });

  it("retains conventional support faces and visible upright results", () => {
    const numbered = new Map(
      D20_CRYSTAL_CUT_GEOMETRY_V4.faces.flatMap((face) => {
        const value = faceValue(face);
        return value === undefined ? [] : [[value, face] as const];
      }),
    );
    for (const { result, rotation } of D20_CRYSTAL_CUT_GEOMETRY_V4.resultOrientations) {
      const face = numbered.get(result);
      const oppositeValue = getOppositeFaceValueV4("d20", result);
      const opposite = oppositeValue === null ? undefined : numbered.get(oppositeValue);
      if (face === undefined || opposite === undefined) {
        throw new Error("Crystal-cut result support face is missing");
      }
      expect(rotate(face.normal, rotation)[1]).toBeCloseTo(1, 12);
      expect(rotate(opposite.normal, rotation)[1]).toBeCloseTo(-1, 12);
      const supportHeights = opposite.vertexIndices.map((vertexIndex) => {
        const position = D20_CRYSTAL_CUT_GEOMETRY_V4.vertices[vertexIndex]?.position;
        if (position === undefined) throw new Error("Crystal support vertex is missing");
        return rotate(position, rotation)[1];
      });
      const allHeights = D20_CRYSTAL_CUT_GEOMETRY_V4.vertices.map(
        ({ position }) => rotate(position, rotation)[1],
      );
      expect(Math.max(...supportHeights) - Math.min(...supportHeights)).toBeCloseTo(0, 12);
      expect(supportHeights[0]).toBeCloseTo(Math.min(...allHeights), 12);

      const projection = projectPolyhedralGeometryV4(
        D20_CRYSTAL_CUT_GEOMETRY_V4,
        result,
      );
      const resultLabel = projection.visibleFaces
        .flatMap(({ labels }) => labels)
        .find(({ value }) => value === result);
      if (resultLabel === undefined) throw new Error("Crystal-cut result label is hidden");
      expect(resultLabel.right[0] / Math.hypot(...resultLabel.right)).toBeGreaterThan(0.95);
      expect(-resultLabel.up[1] / Math.hypot(...resultLabel.up)).toBeGreaterThan(0.95);
    }
  });

  it("triangulates every visible polygon for continuous octahedral skinning", () => {
    const projection = projectPolyhedralGeometryV4(
      D20_CRYSTAL_CUT_GEOMETRY_V4,
      20,
    );
    const subdivisions =
      D20_CRYSTAL_CUT_GEOMETRY_V4.skinMapping.subdivisions;
    const sourceTriangles = projection.visibleFaces.reduce(
      (total, face) => total + face.vertexIndices.length - 2,
      0,
    );
    const expectedTriangles =
      sourceTriangles * subdivisions * subdivisions;

    expect(projection.visibleFaces).toHaveLength(31);
    expect(projection.mesh.indices).toHaveLength(expectedTriangles * 3);
    expect(projection.mesh.positions).toHaveLength(expectedTriangles * 3);
    expect(projection.mesh.skinCoordinates).toHaveLength(expectedTriangles * 3);
    for (const position of projection.mesh.positions) {
      expect(position.every(Number.isFinite)).toBe(true);
    }
    for (const coordinate of projection.mesh.skinCoordinates) {
      expect(coordinate[0]).toBeGreaterThanOrEqual(0);
      expect(coordinate[0]).toBeLessThanOrEqual(1);
      expect(coordinate[1]).toBeGreaterThanOrEqual(0);
      expect(coordinate[1]).toBeLessThanOrEqual(1);
    }
  });

  it("pins crystal-cut independently without changing standard d20", () => {
    const standardHash = createHash("sha256")
      .update(canonicalJsonV4(D20_STANDARD_GEOMETRY_V4))
      .digest("hex");
    const crystalHash = createHash("sha256")
      .update(canonicalJsonV4(D20_CRYSTAL_CUT_GEOMETRY_V4))
      .digest("hex");

    expect(standardHash).toBe(
      "d395a7d72431463d82f1e56ce94a8a3939c01bf3c8e82e08b79f7bd74fcd6c02",
    );
    expect(crystalHash).toBe(
      "91196bead6cf95afd8eea21418e4fe6ff01025e1ad0608c38c036c7ed7a5f517",
    );
  });
});
