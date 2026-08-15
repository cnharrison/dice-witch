import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D10_STANDARD_GEOMETRY_V4,
  D12_STANDARD_GEOMETRY_V4,
  D20_CRYSTAL_CUT_GEOMETRY_V4,
  D20_HOLLOW_CAGE_GEOMETRY_V4,
  D20_SHARP_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_R2_V4,
  D20_STANDARD_GEOMETRY_V4,
  D4_STANDARD_GEOMETRY_V4,
  D6_STANDARD_GEOMETRY_V4,
  D8_STANDARD_GEOMETRY_V4,
  DICE_VIEW_AZIMUTH_RANGE_V4,
  DICE_VIEW_ELEVATION_RANGE_V4,
  FUDGE_STANDARD_GEOMETRY_V4,
  PERCENTILE_STANDARD_GEOMETRY_V4,
  buildPhysicalPolyhedralMeshV4,
  getRenderGeometryDescriptorV4,
  POSE_AZIMUTHS_R17_V4,
  projectGeometryVectorV4,
  projectPolyhedralGeometryV4,
  type Point2V4,
  type PolyhedralGeometryDescriptorV4,
  type ScreenPoint2V4,
} from "../src";

const STANDARD_POLYHEDRA = [
  D4_STANDARD_GEOMETRY_V4,
  D6_STANDARD_GEOMETRY_V4,
  D8_STANDARD_GEOMETRY_V4,
  D10_STANDARD_GEOMETRY_V4,
  D12_STANDARD_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
  PERCENTILE_STANDARD_GEOMETRY_V4,
  FUDGE_STANDARD_GEOMETRY_V4,
] as const satisfies readonly PolyhedralGeometryDescriptorV4[];

const PHYSICAL_POLYHEDRA = [
  ...STANDARD_POLYHEDRA,
  D20_STANDARD_GEOMETRY_R2_V4,
  D20_SHARP_GEOMETRY_V4,
  D20_CRYSTAL_CUT_GEOMETRY_V4,
  D20_HOLLOW_CAGE_GEOMETRY_V4,
] as const satisfies readonly PolyhedralGeometryDescriptorV4[];

function expectFinitePoint(point: ScreenPoint2V4): void {
  expect(Number.isFinite(point[0])).toBe(true);
  expect(Number.isFinite(point[1])).toBe(true);
}

function inclusiveRange(
  minimum: number,
  maximum: number,
  step = 1,
): number[] {
  return Array.from(
    { length: (maximum - minimum) / step + 1 },
    (_, index) => minimum + index * step,
  );
}

describe("canonical V4 orthographic projection", () => {
  it("projects every standard result inside normalized image bounds", () => {
    for (const geometry of STANDARD_POLYHEDRA) {
      for (const { result } of geometry.resultOrientations) {
        const projection = projectPolyhedralGeometryV4(geometry, result);
        expect(projection.geometryId).toBe(geometry.id);
        expect(projection.result).toBe(result);
        expect(projection.vertices).toHaveLength(geometry.vertices.length);
        expect(projection.visibleFaces.length).toBeGreaterThan(0);
        expect(projection.bounds.min[0]).toBeGreaterThanOrEqual(0);
        expect(projection.bounds.min[1]).toBeGreaterThanOrEqual(0);
        expect(projection.bounds.max[0]).toBeLessThanOrEqual(1);
        expect(projection.bounds.max[1]).toBeLessThanOrEqual(1);

        projection.vertices.forEach(({ position, depth }) => {
          expectFinitePoint(position);
          expect(Number.isFinite(depth)).toBe(true);
        });
        projection.visibleFaces.forEach((face) => {
          expect(new Set(face.vertexIndices).size).toBe(face.vertexIndices.length);
          expect(face.skinCoordinates).toHaveLength(face.vertexIndices.length);
          face.vertexIndices.forEach((vertexIndex) => {
            expect(projection.vertices[vertexIndex]).toBeDefined();
          });
          face.labels.forEach((label) => {
            expectFinitePoint(label.origin);
            expectFinitePoint(label.right);
            expectFinitePoint(label.up);
            expect(Math.hypot(...label.right)).toBeGreaterThan(0);
            expect(Math.hypot(...label.up)).toBeGreaterThan(0);
          });
        });
      }
    }
  });

  it("keeps every r36 normal d6 camera angle inside the vertical frame", () => {
    const elevations = inclusiveRange(
      DICE_VIEW_ELEVATION_RANGE_V4.minimum,
      DICE_VIEW_ELEVATION_RANGE_V4.maximum,
    );
    const azimuths = inclusiveRange(
      DICE_VIEW_AZIMUTH_RANGE_V4.minimum,
      DICE_VIEW_AZIMUTH_RANGE_V4.maximum,
      DICE_VIEW_AZIMUTH_RANGE_V4.step,
    );
    let minimumTop = 1;
    let maximumBottom = 0;

    for (let result = 1; result <= 6; result += 1) {
      for (const elevationDegrees of elevations) {
        for (const azimuthOffsetDegrees of azimuths) {
          for (const poseAzimuthDegrees of POSE_AZIMUTHS_R17_V4) {
            const geometry = getRenderGeometryDescriptorV4(
              "canvaskit-v4-r36",
              {
                target: "d6",
                form: "standard",
                result,
                view: {
                  kind: "camera",
                  elevationDegrees,
                  azimuthOffsetDegrees,
                  poseAzimuthDegrees,
                },
              },
            );
            if (geometry.kind !== "polyhedral") {
              throw new Error("D6 camera geometry is invalid");
            }
            const { bounds } = projectPolyhedralGeometryV4(geometry, result);
            minimumTop = Math.min(minimumTop, bounds.min[1]);
            maximumBottom = Math.max(maximumBottom, bounds.max[1]);
          }
        }
      }
    }

    const onePixel = 1 / 150;
    expect(minimumTop).toBeGreaterThanOrEqual(onePixel);
    expect(maximumBottom).toBeLessThanOrEqual(1 - onePixel);
  });

  it("sorts visible faces from farthest to nearest for deterministic painting", () => {
    for (const geometry of STANDARD_POLYHEDRA) {
      for (const { result } of geometry.resultOrientations) {
        const { visibleFaces } = projectPolyhedralGeometryV4(geometry, result);
        for (let index = 1; index < visibleFaces.length; index += 1) {
          const prior = visibleFaces[index - 1];
          const current = visibleFaces[index];
          if (prior === undefined || current === undefined) {
            throw new Error("Projected face ordering is incomplete");
          }
          expect(prior.depth).toBeGreaterThanOrEqual(current.depth);
        }
      }
    }
  });

  it("keeps the authoritative result visible", () => {
    for (const geometry of STANDARD_POLYHEDRA) {
      for (const { result } of geometry.resultOrientations) {
        const projection = projectPolyhedralGeometryV4(geometry, result);
        const visibleResultLabels = projection.visibleFaces.flatMap((face) =>
          face.labels.filter(({ value }) => value === result),
        );
        expect(visibleResultLabels.length).toBeGreaterThan(0);
      }
    }
  });

  it("preserves physical-surface alignment for every conventional engraving", () => {
    const observedAlignments = new Set<string>();
    for (const geometry of STANDARD_POLYHEDRA) {
      for (const { result } of geometry.resultOrientations) {
        const projection = projectPolyhedralGeometryV4(geometry, result);
        for (const face of projection.visibleFaces) {
          for (const label of face.labels) {
            observedAlignments.add(label.alignment);
            expect(label.alignment).toBe("surface");
          }
        }
      }
    }
    expect(observedAlignments).toEqual(new Set(["surface"]));
  });

  it("uses shared projected vertices for every physical edge", () => {
    for (const geometry of STANDARD_POLYHEDRA) {
      const result = geometry.resultOrientations[0]?.result;
      if (result === undefined) throw new Error("Geometry result is missing");
      const projection = projectPolyhedralGeometryV4(geometry, result);
      const projectedUses = new Map<number, ScreenPoint2V4>();
      for (const face of projection.visibleFaces) {
        for (const vertexIndex of face.vertexIndices) {
          const position = projection.vertices[vertexIndex]?.position;
          if (position === undefined) {
            throw new Error("Projected face vertex is missing");
          }
          const existing = projectedUses.get(vertexIndex);
          if (existing === undefined) projectedUses.set(vertexIndex, position);
          else expect(position).toBe(existing);
        }
      }
    }
  });

  it("rejects missing results and invalid cameras explicitly", () => {
    expect(() => projectPolyhedralGeometryV4(D6_STANDARD_GEOMETRY_V4, 7)).toThrow(
      "Geometry result orientation is not implemented: d6-standard-r1:7",
    );
    const invalid = {
      ...D6_STANDARD_GEOMETRY_V4,
      camera: { ...D6_STANDARD_GEOMETRY_V4.camera, orthographicHeight: 0 },
    } satisfies PolyhedralGeometryDescriptorV4;
    expect(() => projectPolyhedralGeometryV4(invalid, 1)).toThrow(
      "Geometry camera orthographic height must be positive",
    );
    expect(() =>
      buildPhysicalPolyhedralMeshV4(D6_STANDARD_GEOMETRY_V4, 7),
    ).toThrow(
      "Geometry result orientation is not implemented: d6-standard-r1:7",
    );
    expect(() => buildPhysicalPolyhedralMeshV4(invalid, 1)).toThrow(
      "Geometry camera orthographic height must be positive",
    );
    expect(() =>
      buildPhysicalPolyhedralMeshV4(
        {
          ...D20_STANDARD_GEOMETRY_V4,
          skinMapping: { kind: "view-octahedral", subdivisions: 0 },
        },
        20,
      ),
    ).toThrow("Geometry skin subdivisions must be from 1 through 16");
    const firstFace = D6_STANDARD_GEOMETRY_V4.faces[0];
    expect(() =>
      buildPhysicalPolyhedralMeshV4(
        {
          ...D6_STANDARD_GEOMETRY_V4,
          faces: [
            {
              ...firstFace,
              vertexIndices: [0, 1],
              skinCoordinates: [
                [0, 0],
                [1, 0],
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow(`Geometry face ${firstFace.id} must have at least three vertices`);
    expect(() =>
      buildPhysicalPolyhedralMeshV4(
        {
          ...D6_STANDARD_GEOMETRY_V4,
          faces: [{ ...firstFace, skinCoordinates: [[0, 0]] }],
        },
        1,
      ),
    ).toThrow(`Geometry face ${firstFace.id} mesh is incomplete`);
  });

  it("builds deterministic complete physical meshes for every standard result", () => {
    for (const geometry of PHYSICAL_POLYHEDRA) {
      const trianglesPerFace = geometry.faces.map(
        (face) =>
          (face.vertexIndices.length - 2) *
          (geometry.skinMapping.kind === "view-octahedral"
            ? geometry.skinMapping.subdivisions ** 2
            : 1),
      );
      const expectedTriangleCount = trianglesPerFace.reduce(
        (sum, count) => sum + count,
        0,
      );
      const expectedLabelCount = geometry.faces
        .map((face) => face.labels.length)
        .reduce((sum, count) => sum + count, 0);
      for (const { result } of geometry.resultOrientations) {
        const physical = buildPhysicalPolyhedralMeshV4(geometry, result);
        expect(physical).toMatchObject({
          version: 1,
          geometryId: geometry.id,
          target: geometry.target,
          form: geometry.form,
          result,
        });
        expect(physical.mesh.positions).toHaveLength(expectedTriangleCount * 3);
        expect(physical.mesh.normals).toHaveLength(expectedTriangleCount * 3);
        expect(physical.mesh.skinCoordinates).toHaveLength(
          expectedTriangleCount * 3,
        );
        expect(
          physical.mesh.indices.every((value, index) => value === index),
        ).toBe(true);
        expect(physical.mesh.triangleFaceIds).toHaveLength(
          expectedTriangleCount,
        );
        expect(new Set(physical.mesh.triangleFaceIds)).toEqual(
          new Set(geometry.faces.map(({ id }) => id)),
        );
        expect(physical.faces).toHaveLength(geometry.faces.length);
        expect(new Set(physical.faces.map(({ id }) => id))).toEqual(
          new Set(geometry.faces.map(({ id }) => id)),
        );
        expect(
          physical.faces.every(
            (face) =>
              face.vertices.length >= 3 &&
              face.vertices.every((point) => point.every(Number.isFinite)) &&
              Math.abs(Math.hypot(...face.normal) - 1) <= 1e-12,
          ),
        ).toBe(true);
        expect(physical.labels).toHaveLength(expectedLabelCount);
        expect(physical.labels.some((label) => label.value === result)).toBe(true);
        expect(
          physical.labels.every(
            (label) =>
              geometry.faces.some(
                (face) =>
                  face.id === label.faceId &&
                  face.labels[label.faceLabelIndex]?.value === label.value,
              ) &&
              label.origin.every(Number.isFinite) &&
              label.normal.every(Number.isFinite) &&
              label.right.every(Number.isFinite) &&
              label.up.every(Number.isFinite) &&
              label.maxWidth > 0 &&
              label.maxHeight > 0 &&
              label.opticalInset >= 0 &&
              Math.abs(Math.hypot(...label.normal) - 1) <= 1e-12 &&
              Math.abs(Math.hypot(...label.right) - 1) <= 1e-12 &&
              Math.abs(Math.hypot(...label.up) - 1) <= 1e-12,
          ),
        ).toBe(true);
        expect(
          physical.mesh.positions.every((point) => point.every(Number.isFinite)),
        ).toBe(true);
        expect(
          physical.mesh.normals.every(
            (normal) =>
              normal.every(Number.isFinite) &&
              Math.abs(Math.hypot(...normal) - 1) <= 1e-12,
          ),
        ).toBe(true);
        expect(
          physical.mesh.skinCoordinates.every(
            ([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1,
          ),
        ).toBe(true);
      }
    }

    expect(
      buildPhysicalPolyhedralMeshV4(D20_STANDARD_GEOMETRY_R2_V4, 20),
    ).toEqual(buildPhysicalPolyhedralMeshV4(D20_STANDARD_GEOMETRY_R2_V4, 20));
    expect(buildPhysicalPolyhedralMeshV4(D4_STANDARD_GEOMETRY_V4, 4).labels).toHaveLength(
      D4_STANDARD_GEOMETRY_V4.faces.length * 3,
    );
  });

  it("uses identical physical skin coordinates for the authoritative projection", () => {
    for (const geometry of PHYSICAL_POLYHEDRA) {
      for (const { result } of geometry.resultOrientations) {
        const physical = buildPhysicalPolyhedralMeshV4(geometry, result);
        const projection = projectPolyhedralGeometryV4(geometry, result);
        const coordinatesByFace = new Map<string, Point2V4[]>();
        physical.mesh.triangleFaceIds.forEach((faceId, triangleIndex) => {
          const coordinates = coordinatesByFace.get(faceId) ?? [];
          coordinates.push(
            ...physical.mesh.skinCoordinates.slice(
              triangleIndex * 3,
              triangleIndex * 3 + 3,
            ),
          );
          coordinatesByFace.set(faceId, coordinates);
        });
        const expected = projection.visibleFaces.flatMap((face) => {
          const coordinates = coordinatesByFace.get(face.id);
          if (coordinates === undefined) {
            throw new Error(`Physical face is missing: ${face.id}`);
          }
          return coordinates;
        });
        expect(projection.mesh.skinCoordinates).toEqual(expected);
        for (const projectedFace of projection.visibleFaces) {
          projectedFace.labels.forEach((projectedLabel, faceLabelIndex) => {
            const physicalLabel = physical.labels.find(
              (label) =>
                label.faceId === projectedFace.id &&
                label.faceLabelIndex === faceLabelIndex,
            );
            if (physicalLabel === undefined) {
              throw new Error(`Physical label is missing: ${projectedFace.id}`);
            }
            expect(
              projectGeometryVectorV4(physicalLabel.right, geometry.camera),
            ).toEqual(projectedLabel.right);
            expect(
              projectGeometryVectorV4(physicalLabel.up, geometry.camera),
            ).toEqual(projectedLabel.up);
          });
        }
      }
    }
  });

  it("pins the approved all-result projection hash", () => {
    const projections = STANDARD_POLYHEDRA.flatMap((geometry) =>
      geometry.resultOrientations.map(({ result }) =>
        projectPolyhedralGeometryV4(geometry, result),
      ),
    );
    const hash = createHash("sha256")
      .update(canonicalJsonV4(projections))
      .digest("hex");
    expect(hash).toBe(
      "b4a091c60c8ebcc1d84ce6fd5b50b2f2198b23bb4b8e6af0d2b58ca9f934e5af",
    );
  });
});
