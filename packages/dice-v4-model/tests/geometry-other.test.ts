import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  formatFaceLabelV4,
  getCanonicalGeometryDescriptorV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  mapVisibleSpherePointV4,
  OTHER_SPHERE_GEOMETRY_V4,
  sphericalNormalFromSkinCoordinateV4,
  sphericalSkinCoordinateFromNormalV4,
  type Point2V4,
  type Point3V4,
} from "../src";

function length(vector: Point3V4): number {
  return Math.hypot(...vector);
}

function expectPoint2(actual: Point2V4, expected: Point2V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
}

function expectPoint3(actual: Point3V4, expected: Point3V4): void {
  expect(actual[0]).toBeCloseTo(expected[0], 12);
  expect(actual[1]).toBeCloseTo(expected[1], 12);
  expect(actual[2]).toBeCloseTo(expected[2], 12);
}

describe("canonical V4 spherical Other geometry", () => {
  it("registers one intrinsic spherical descriptor", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("other-sphere-r1");
    expect(getCanonicalGeometryDescriptorV4("other-sphere-r1")).toBe(
      OTHER_SPHERE_GEOMETRY_V4,
    );
    expect(OTHER_SPHERE_GEOMETRY_V4.radius).toBe(1);
    expect(OTHER_SPHERE_GEOMETRY_V4.skinMapping).toBe(
      "spherical-inverse-v1",
    );
    expect(OTHER_SPHERE_GEOMETRY_V4.labelFrame.origin).toEqual([0, 0, 1]);
    expect(OTHER_SPHERE_GEOMETRY_V4.camera.orthographicHeight).toBeGreaterThan(
      2,
    );
  });

  it("inverse-maps the visible disk with true spherical curvature", () => {
    const center = mapVisibleSpherePointV4([0, 0]);
    const curved = mapVisibleSpherePointV4([0.5, 0]);
    const right = mapVisibleSpherePointV4([1, 0]);
    const top = mapVisibleSpherePointV4([0, 1]);
    const bottom = mapVisibleSpherePointV4([0, -1]);
    if (
      center === null ||
      curved === null ||
      right === null ||
      top === null ||
      bottom === null
    ) {
      throw new Error("Visible sphere sample is missing");
    }
    expectPoint2(center.coordinate, [0.5, 0.5]);
    expectPoint3(center.normal, [0, 0, 1]);
    expectPoint2(curved.coordinate, [7 / 12, 0.5]);
    expectPoint3(curved.normal, [0.5, 0, Math.sqrt(3) / 2]);
    expectPoint2(right.coordinate, [0.75, 0.5]);
    expectPoint2(top.coordinate, [0.5, 0]);
    expectPoint2(bottom.coordinate, [0.5, 1]);
    expect(mapVisibleSpherePointV4([0.8, 0.8])).toBeNull();
  });

  it("round-trips full-sphere skin coordinates away from pole ambiguity", () => {
    const coordinates: readonly Point2V4[] = [
      [0, 0.5],
      [0.125, 0.25],
      [0.25, 0.5],
      [0.5, 0.5],
      [0.75, 0.5],
      [0.875, 0.75],
      [1, 0.5],
    ];
    for (const coordinate of coordinates) {
      const normal = sphericalNormalFromSkinCoordinateV4(coordinate);
      expect(length(normal)).toBeCloseTo(1, 12);
      expectPoint2(sphericalSkinCoordinateFromNormalV4(normal), coordinate);
    }
  });

  it("canonicalizes poles and the back seam", () => {
    expectPoint2(sphericalSkinCoordinateFromNormalV4([0, 1, 0]), [0.5, 0]);
    expectPoint2(sphericalSkinCoordinateFromNormalV4([0, -1, 0]), [0.5, 1]);
    expectPoint2(sphericalSkinCoordinateFromNormalV4([0, 0, -1]), [0, 0.5]);
    expectPoint3(sphericalNormalFromSkinCoordinateV4([0, 0.5]), [0, 0, -1]);
    expectPoint3(sphericalNormalFromSkinCoordinateV4([1, 0.5]), [0, 0, -1]);
  });

  it("rejects malformed mapping inputs explicitly", () => {
    expect(() => sphericalSkinCoordinateFromNormalV4([0, 0, 0])).toThrow(
      "Sphere normal must be non-zero",
    );
    expect(() => sphericalSkinCoordinateFromNormalV4([Number.NaN, 0, 1])).toThrow(
      "Sphere normal component must be finite",
    );
    expect(() => sphericalNormalFromSkinCoordinateV4([-0.1, 0.5])).toThrow(
      "Sphere skin coordinate must be from zero through one",
    );
    expect(() => mapVisibleSpherePointV4([0, Number.POSITIVE_INFINITY])).toThrow(
      "Sphere surface y coordinate must be finite",
    );
  });

  it("retains enlarged Other label boundaries through result 999", () => {
    expect(OTHER_SPHERE_GEOMETRY_V4.labelFrame.maxWidth).toBe(1.3);
    expect(OTHER_SPHERE_GEOMETRY_V4.labelFrame.maxHeight).toBe(0.98);
    expect(formatFaceLabelV4("other", 1)).toBe("1");
    expect(formatFaceLabelV4("other", 999)).toBe("999");
    expect(() => formatFaceLabelV4("other", 1_000)).toThrow(
      "Other face value must be from 1 through 999",
    );
  });

  it("pins the canonical descriptor hash", () => {
    const hash = createHash("sha256")
      .update(canonicalJsonV4(OTHER_SPHERE_GEOMETRY_V4))
      .digest("hex");
    expect(hash).toBe(
      "714ebc8b42ac9be46765e974f7d45e8d26253641e1c79382cac46ebc2cae898e",
    );
  });
});
