import { describe, expect, it } from "vitest";
import {
  isPolyhedralFormImplementedForTargetV4,
  materialDefaultPolyhedralFormV4,
} from "../src/compatibility";
import {
  getCanonicalGeometryDescriptorV4,
  getGeometryIdV4,
  type PolyhedralGeometryDescriptorV4,
} from "../src/geometry";

const TARGETS = [
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "percentile",
  "fudge",
] as const;
const FORMS = ["crystal-cut", "hollow-cage"] as const;

function polyhedral(
  target: (typeof TARGETS)[number],
  form: "standard" | (typeof FORMS)[number],
): PolyhedralGeometryDescriptorV4 {
  const descriptor = getCanonicalGeometryDescriptorV4(
    getGeometryIdV4(target, form),
  );
  if (descriptor.kind !== "polyhedral") {
    throw new Error("Expected polyhedral geometry");
  }
  return descriptor;
}

function labels(geometry: PolyhedralGeometryDescriptorV4): number[] {
  return geometry.faces
    .flatMap((face) => face.labels.map(({ value }) => value))
    .sort((left, right) => left - right);
}

describe("all-target V4 special forms", () => {
  it("registers deterministic crystal-cut and hollow-cage descriptors", () => {
    for (const target of TARGETS) {
      const standard = polyhedral(target, "standard");
      for (const form of FORMS) {
        const geometry = polyhedral(target, form);
        expect(geometry).toMatchObject({
          version: 1,
          id: `${target}-${form}-r1`,
          kind: "polyhedral",
          target,
          form,
          resultOrientations: standard.resultOrientations,
          camera: standard.camera,
        });
        expect(geometry.vertices.length).toBeGreaterThan(standard.vertices.length);
        expect(geometry.faces.length).toBeGreaterThan(standard.faces.length);
        expect(labels(geometry)).toEqual(labels(standard));
        expect(new Set(geometry.faces.map(({ id }) => id)).size).toBe(
          geometry.faces.length,
        );

        for (const face of geometry.faces) {
          expect(face.vertexIndices.length).toBeGreaterThanOrEqual(3);
          expect(face.skinCoordinates).toHaveLength(face.vertexIndices.length);
          expect(face.vertexIndices.every((index) => geometry.vertices[index] !== undefined)).toBe(true);
          expect(
            [...face.normal, ...face.skinCoordinates.flat()].every(Number.isFinite),
          ).toBe(true);
        }
      }
    }
  });

  it("gates all-target special forms and defaults to r30", () => {
    for (const target of TARGETS) {
      for (const form of FORMS) {
        expect(isPolyhedralFormImplementedForTargetV4(target, form)).toBe(false);
        expect(
          isPolyhedralFormImplementedForTargetV4(
            target,
            form,
            "canvaskit-v4-r29",
          ),
        ).toBe(false);
        expect(
          isPolyhedralFormImplementedForTargetV4(
            target,
            form,
            "canvaskit-v4-r30",
          ),
        ).toBe(true);
      }
      expect(
        materialDefaultPolyhedralFormV4(
          "sharp-resin",
          target,
          "canvaskit-v4-r30",
        ),
      ).toBe("crystal-cut");
      expect(
        materialDefaultPolyhedralFormV4(
          "hollow-metal",
          target,
          "canvaskit-v4-r30",
        ),
      ).toBe("hollow-cage");
    }
  });

  it("keeps each hollow source face open around a numbered plaque", () => {
    for (const target of TARGETS) {
      const standard = polyhedral(target, "standard");
      const hollow = polyhedral(target, "hollow-cage");
      for (const sourceFace of standard.faces) {
        expect(
          hollow.faces.some(({ id }) => id === `plaque-${sourceFace.id}`),
        ).toBe(true);
        expect(
          hollow.faces.filter(({ id }) => id.startsWith(`frame-${sourceFace.id}-`)),
        ).toHaveLength(sourceFace.vertexIndices.length);
      }
    }
  });
});
