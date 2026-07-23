import {
  APPEARANCE_TARGETS_V4,
  CANONICAL_FACE_VALUES_V4,
  D20_STANDARD_GEOMETRY_R2_V4,
  POLYHEDRAL_FORMS_V4,
  buildPhysicalPolyhedralMeshV4,
  getCanonicalGeometryDescriptorV4,
  getGeometryIdV4,
  isPolyhedralFormImplementedForTargetV4,
  mapVisibleSpherePointV4,
  projectGeometryPointV4,
  type Point2V4,
  type PolyhedralGeometryDescriptorV4,
} from "../src";
import { describe, expect, it } from "vitest";

type MappingSample = {
  projected: Point2V4;
  surface: Point2V4;
};

function cross2d(left: Point2V4, right: Point2V4): number {
  return left[0] * right[1] - left[1] * right[0];
}

function subtract2d(left: Point2V4, right: Point2V4): Point2V4 {
  return [left[0] - right[0], left[1] - right[1]];
}

function maximumGlobalAffineResidual(samples: readonly MappingSample[]): number {
  const origin = samples[0];
  if (origin === undefined) throw new Error("Surface mapping sample is missing");
  let first: MappingSample | undefined;
  let second: MappingSample | undefined;
  for (let left = 1; left < samples.length && second === undefined; left += 1) {
    const candidateFirst = samples[left];
    if (candidateFirst === undefined) continue;
    const firstDelta = subtract2d(candidateFirst.projected, origin.projected);
    for (let right = left + 1; right < samples.length; right += 1) {
      const candidateSecond = samples[right];
      if (candidateSecond === undefined) continue;
      const secondDelta = subtract2d(
        candidateSecond.projected,
        origin.projected,
      );
      if (Math.abs(cross2d(firstDelta, secondDelta)) > 1e-8) {
        first = candidateFirst;
        second = candidateSecond;
        break;
      }
    }
  }
  if (first === undefined || second === undefined) {
    throw new Error("Surface mapping has no projected affine basis");
  }

  const projectedFirst = subtract2d(first.projected, origin.projected);
  const projectedSecond = subtract2d(second.projected, origin.projected);
  const determinant = cross2d(projectedFirst, projectedSecond);
  const surfaceFirst = subtract2d(first.surface, origin.surface);
  const surfaceSecond = subtract2d(second.surface, origin.surface);
  let maximumResidual = 0;
  for (const sample of samples) {
    const projected = subtract2d(sample.projected, origin.projected);
    const firstWeight = cross2d(projected, projectedSecond) / determinant;
    const secondWeight = cross2d(projectedFirst, projected) / determinant;
    const expected: Point2V4 = [
      origin.surface[0] +
        firstWeight * surfaceFirst[0] +
        secondWeight * surfaceSecond[0],
      origin.surface[1] +
        firstWeight * surfaceFirst[1] +
        secondWeight * surfaceSecond[1],
    ];
    maximumResidual = Math.max(
      maximumResidual,
      Math.hypot(
        sample.surface[0] - expected[0],
        sample.surface[1] - expected[1],
      ),
    );
  }
  return maximumResidual;
}

function implementedPolyhedralGeometries(): PolyhedralGeometryDescriptorV4[] {
  const descriptors: PolyhedralGeometryDescriptorV4[] = [];
  for (const target of APPEARANCE_TARGETS_V4) {
    if (target === "other") continue;
    for (const form of POLYHEDRAL_FORMS_V4) {
      if (!isPolyhedralFormImplementedForTargetV4(target, form)) continue;
      const descriptor = getCanonicalGeometryDescriptorV4(
        getGeometryIdV4(target, form),
      );
      if (descriptor.kind !== "polyhedral") {
        throw new Error(`Polyhedral geometry is invalid: ${descriptor.id}`);
      }
      descriptors.push(descriptor);
    }
  }
  descriptors.push(D20_STANDARD_GEOMETRY_R2_V4);
  return descriptors;
}

describe("V4 canonical surface texture mapping", () => {
  it("cannot collapse any polyhedral skin into one screen-space affine decal", () => {
    for (const descriptor of implementedPolyhedralGeometries()) {
      for (const result of new Set(CANONICAL_FACE_VALUES_V4[descriptor.target])) {
        const physical = buildPhysicalPolyhedralMeshV4(descriptor, result);
        const samples = physical.mesh.positions.map((position, index) => {
          const surface = physical.mesh.skinCoordinates[index];
          if (surface === undefined) {
            throw new Error(`Surface coordinate is missing: ${descriptor.id}`);
          }
          return {
            projected: projectGeometryPointV4(position, descriptor.camera),
            surface,
          };
        });
        expect(
          maximumGlobalAffineResidual(samples),
          `${descriptor.id}:${String(result)}`,
        ).toBeGreaterThan(1e-3);
      }
    }
  });

  it("curves the spherical skin away from a screen-space affine map", () => {
    const left = mapVisibleSpherePointV4([-0.75, 0]);
    const center = mapVisibleSpherePointV4([0, 0]);
    const right = mapVisibleSpherePointV4([0.25, 0]);
    if (left === null || center === null || right === null) {
      throw new Error("Sphere mapping sample is missing");
    }
    const leftSlope =
      (center.coordinate[0] - left.coordinate[0]) / 0.75;
    const rightSlope =
      (right.coordinate[0] - center.coordinate[0]) / 0.25;
    expect(Math.abs(leftSlope - rightSlope)).toBeGreaterThan(0.01);
  });
});
