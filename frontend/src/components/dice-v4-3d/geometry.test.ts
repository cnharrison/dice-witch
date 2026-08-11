import {
  D4_STANDARD_GEOMETRY_V4,
  buildPhysicalPolyhedralMeshV4,
  getCanonicalGeometryDescriptorV4,
  getGeometryIdV4,
  projectGeometryPointV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import { createPhysicalPolyhedralGeometryV4 } from "./geometry";
import { placedTextureUvV4 } from "./texture";

describe("V4 physical material mapping", () => {
  it("builds finite Three.js geometry for every r30 special form", () => {
    for (const [target, result] of [
      ["d4", 4],
      ["d6", 6],
      ["d8", 8],
      ["d10", 10],
      ["d12", 12],
      ["d20", 20],
      ["percentile", 90],
      ["fudge", 1],
    ] as const) {
      for (const form of ["crystal-cut", "hollow-cage"] as const) {
        const descriptor = getCanonicalGeometryDescriptorV4(
          getGeometryIdV4(target, form),
        );
        if (descriptor.kind !== "polyhedral") {
          throw new Error("Expected polyhedral descriptor");
        }
        const geometry = createPhysicalPolyhedralGeometryV4(
          descriptor,
          result,
          {
            rotation: 0,
            offsetU: 0,
            offsetV: 0,
            scope: "die-wide",
          },
        );
        for (const attribute of ["position", "normal", "uv"] as const) {
          const values = geometry.getAttribute(attribute).array;
          expect([...values].every(Number.isFinite)).toBe(true);
        }
        expect(geometry.index?.count).toBeGreaterThan(0);
        expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
        geometry.dispose();
      }
    }
  });

  it("maps r4 coherent gradients across the projected whole die", () => {
    const placement = {
      rotation: 90,
      offsetU: 12_345,
      offsetV: 54_321,
      scope: "die-wide" as const,
    };
    const geometry = createPhysicalPolyhedralGeometryV4(
      D4_STANDARD_GEOMETRY_V4,
      4,
      placement,
      "projected-texture",
    );
    const physical = buildPhysicalPolyhedralMeshV4(
      D4_STANDARD_GEOMETRY_V4,
      4,
    );
    const uvs = geometry.getAttribute("uv");

    expect(uvs.count).toBe(physical.mesh.positions.length);
    for (let index = 0; index < uvs.count; index += 1) {
      const position = physical.mesh.positions[index];
      if (position === undefined) {
        throw new Error("Projected texture test position is missing");
      }
      const expected = placedTextureUvV4(
        ...projectGeometryPointV4(
          position,
          D4_STANDARD_GEOMETRY_V4.camera,
        ),
        placement,
      );
      expect(uvs.getX(index)).toBeCloseTo(expected[0], 6);
      expect(uvs.getY(index)).toBeCloseTo(expected[1], 6);
      expect(Number.isFinite(uvs.getX(index))).toBe(true);
      expect(Number.isFinite(uvs.getY(index))).toBe(true);
    }
    expect(
      new Set(
        Array.from({ length: uvs.count }, (_, index) =>
          uvs.getX(index).toFixed(4),
        ),
      ).size,
    ).toBeGreaterThan(3);
    geometry.dispose();
  });
});
