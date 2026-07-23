import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D20_HOLLOW_CAGE_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
  getCanonicalGeometryDescriptorV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  projectPolyhedralGeometryV4,
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
  return Math.hypot(...vector);
}

function polygonArea(face: GeometryFaceV4): number {
  const firstIndex = face.vertexIndices[0];
  const first = D20_HOLLOW_CAGE_GEOMETRY_V4.vertices[firstIndex ?? -1]?.position;
  if (first === undefined) throw new Error("Hollow-cage face is missing its first vertex");
  let area = 0;
  for (let index = 1; index < face.vertexIndices.length - 1; index += 1) {
    const secondIndex = face.vertexIndices[index];
    const thirdIndex = face.vertexIndices[index + 1];
    const second = D20_HOLLOW_CAGE_GEOMETRY_V4.vertices[secondIndex ?? -1]?.position;
    const third = D20_HOLLOW_CAGE_GEOMETRY_V4.vertices[thirdIndex ?? -1]?.position;
    if (second === undefined || third === undefined) {
      throw new Error("Hollow-cage face references a missing vertex");
    }
    area += length(cross(subtract(second, first), subtract(third, first))) / 2;
  }
  return area;
}

function standardFaceValue(face: GeometryFaceV4): number {
  const value = face.labels[0]?.value;
  if (value === undefined) throw new Error("Standard d20 face is missing its label");
  return value;
}

function hollowFaceValue(face: GeometryFaceV4): number {
  const match = /-(\d+)-/.exec(`${face.id}-`);
  const value = match?.[1];
  if (value === undefined) throw new Error(`Hollow-cage face ID is invalid: ${face.id}`);
  return Number(value);
}

describe("canonical V4 hollow-cage d20 geometry", () => {
  it("registers an immutable open-frame descriptor with readable numbered plaques", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("d20-hollow-cage-r1");
    expect(getCanonicalGeometryDescriptorV4("d20-hollow-cage-r1")).toBe(
      D20_HOLLOW_CAGE_GEOMETRY_V4,
    );
    expect(D20_HOLLOW_CAGE_GEOMETRY_V4).toMatchObject({
      version: 1,
      id: "d20-hollow-cage-r1",
      kind: "polyhedral",
      target: "d20",
      form: "hollow-cage",
      skinMapping: { kind: "view-octahedral", subdivisions: 2 },
    });
    expect(Object.isFrozen(D20_HOLLOW_CAGE_GEOMETRY_V4)).toBe(true);
    expect(D20_HOLLOW_CAGE_GEOMETRY_V4.faces).toHaveLength(140);
    expect(
      D20_HOLLOW_CAGE_GEOMETRY_V4.faces.filter((face) =>
        face.id.startsWith("frame-"),
      ),
    ).toHaveLength(60);
    expect(
      D20_HOLLOW_CAGE_GEOMETRY_V4.faces.filter((face) =>
        face.id.startsWith("spoke-"),
      ),
    ).toHaveLength(60);
    const plaques = D20_HOLLOW_CAGE_GEOMETRY_V4.faces.filter((face) =>
      face.id.startsWith("plaque-"),
    );
    expect(plaques).toHaveLength(20);
    expect(
      plaques
        .map((face) => face.labels[0]?.value)
        .sort((left, right) => (left ?? 0) - (right ?? 0)),
    ).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(
      D20_HOLLOW_CAGE_GEOMETRY_V4.faces.filter(
        (face) => !face.id.startsWith("plaque-") && face.labels.length > 0,
      ),
    ).toHaveLength(0);
  });

  it("uses planar outward-wound regions with bounded cut-through openings", () => {
    const standardByValue = new Map(
      D20_STANDARD_GEOMETRY_V4.faces.map((face) => [
        standardFaceValue(face),
        face,
      ]),
    );
    const areaByValue = new Map<number, number>();

    for (const face of D20_HOLLOW_CAGE_GEOMETRY_V4.faces) {
      expect(face.vertexIndices.length).toBeGreaterThanOrEqual(3);
      expect(face.skinCoordinates).toHaveLength(face.vertexIndices.length);
      const standard = standardByValue.get(hollowFaceValue(face));
      if (standard === undefined) throw new Error("Hollow-cage source face is missing");
      const [firstIndex, secondIndex, thirdIndex] = face.vertexIndices;
      const first = D20_HOLLOW_CAGE_GEOMETRY_V4.vertices[firstIndex ?? -1]?.position;
      const second = D20_HOLLOW_CAGE_GEOMETRY_V4.vertices[secondIndex ?? -1]?.position;
      const third = D20_HOLLOW_CAGE_GEOMETRY_V4.vertices[thirdIndex ?? -1]?.position;
      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("Hollow-cage face references a missing vertex");
      }
      expect(dot(cross(subtract(second, first), subtract(third, first)), face.normal)).toBeGreaterThan(1e-8);
      expect(dot(face.normal, standard.normal)).toBeCloseTo(1, 12);
      const facePlane = dot(standard.normal, first);
      for (const vertexIndex of face.vertexIndices) {
        const position = D20_HOLLOW_CAGE_GEOMETRY_V4.vertices[vertexIndex]?.position;
        if (position === undefined) throw new Error("Hollow-cage vertex is missing");
        expect(dot(standard.normal, position)).toBeCloseTo(facePlane, 12);
      }
      for (const coordinate of face.skinCoordinates) {
        expect(coordinate[0]).toBeGreaterThanOrEqual(0);
        expect(coordinate[0]).toBeLessThanOrEqual(1);
        expect(coordinate[1]).toBeGreaterThanOrEqual(0);
        expect(coordinate[1]).toBeLessThanOrEqual(1);
      }
      const value = hollowFaceValue(face);
      areaByValue.set(value, (areaByValue.get(value) ?? 0) + polygonArea(face));
    }

    for (const [value, standard] of standardByValue) {
      const standardArea = (() => {
        const [firstIndex, secondIndex, thirdIndex] = standard.vertexIndices;
        const first = D20_STANDARD_GEOMETRY_V4.vertices[firstIndex ?? -1]?.position;
        const second = D20_STANDARD_GEOMETRY_V4.vertices[secondIndex ?? -1]?.position;
        const third = D20_STANDARD_GEOMETRY_V4.vertices[thirdIndex ?? -1]?.position;
        if (first === undefined || second === undefined || third === undefined) {
          throw new Error("Standard d20 face is incomplete");
        }
        return length(cross(subtract(second, first), subtract(third, first))) / 2;
      })();
      const coverage = (areaByValue.get(value) ?? 0) / standardArea;
      expect(coverage).toBeGreaterThan(0.55);
      expect(coverage).toBeLessThan(0.9);
    }
  });

  it("retains standard poses while projecting camera-facing cage surfaces", () => {
    expect(D20_HOLLOW_CAGE_GEOMETRY_V4.resultOrientations).toBe(
      D20_STANDARD_GEOMETRY_V4.resultOrientations,
    );
    expect(D20_HOLLOW_CAGE_GEOMETRY_V4.camera).toBe(
      D20_STANDARD_GEOMETRY_V4.camera,
    );
    const projection = projectPolyhedralGeometryV4(
      D20_HOLLOW_CAGE_GEOMETRY_V4,
      20,
    );
    const standard = projectPolyhedralGeometryV4(
      D20_STANDARD_GEOMETRY_V4,
      20,
    );
    const resultLabel = projection.visibleFaces
      .flatMap((face) => face.labels)
      .find((label) => label.value === 20);
    if (resultLabel === undefined) throw new Error("Hollow-cage result label is hidden");

    expect(projection.visibleFaces).toHaveLength(70);
    expect(projection.bounds).toEqual(standard.bounds);
    expect(projection.mesh.indices).toHaveLength(520 * 3);
    expect(resultLabel.right[0] / Math.hypot(...resultLabel.right)).toBeGreaterThan(0.95);
    expect(-resultLabel.up[1] / Math.hypot(...resultLabel.up)).toBeGreaterThan(0.95);

    const standardHash = createHash("sha256")
      .update(canonicalJsonV4(D20_STANDARD_GEOMETRY_V4))
      .digest("hex");
    const hollowHash = createHash("sha256")
      .update(canonicalJsonV4(D20_HOLLOW_CAGE_GEOMETRY_V4))
      .digest("hex");
    expect(standardHash).toBe(
      "d395a7d72431463d82f1e56ce94a8a3939c01bf3c8e82e08b79f7bd74fcd6c02",
    );
    expect(hollowHash).toBe(
      "b49f1a1c21e7551e214db384d0ba838e8e1d60066f21bfbf95e90d3dcf2d97c6",
    );
  });
});
