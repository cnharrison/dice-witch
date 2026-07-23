import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonV4,
  D20_SHARP_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
  getCanonicalGeometryDescriptorV4,
  IMPLEMENTED_GEOMETRY_IDS_V4,
  projectPolyhedralGeometryV4,
} from "../src";

describe("canonical V4 sharp d20 geometry", () => {
  it("registers an immutable sharp-edge identity over the regular d20 solid", () => {
    expect(IMPLEMENTED_GEOMETRY_IDS_V4).toContain("d20-sharp-r1");
    expect(getCanonicalGeometryDescriptorV4("d20-sharp-r1")).toBe(
      D20_SHARP_GEOMETRY_V4,
    );
    expect(D20_SHARP_GEOMETRY_V4).toMatchObject({
      version: 1,
      id: "d20-sharp-r1",
      kind: "polyhedral",
      target: "d20",
      form: "sharp",
    });
    expect(Object.isFrozen(D20_SHARP_GEOMETRY_V4)).toBe(true);
    expect(D20_SHARP_GEOMETRY_V4.vertices).toBe(
      D20_STANDARD_GEOMETRY_V4.vertices,
    );
    expect(D20_SHARP_GEOMETRY_V4.faces).toBe(D20_STANDARD_GEOMETRY_V4.faces);
    expect(D20_SHARP_GEOMETRY_V4.skinMapping).toBe(
      D20_STANDARD_GEOMETRY_V4.skinMapping,
    );
    expect(D20_SHARP_GEOMETRY_V4.resultOrientations).toBe(
      D20_STANDARD_GEOMETRY_V4.resultOrientations,
    );
    expect(D20_SHARP_GEOMETRY_V4.camera).toBe(D20_STANDARD_GEOMETRY_V4.camera);
  });

  it("preserves every approved projection while retaining a distinct geometry ID", () => {
    for (let result = 1; result <= 20; result += 1) {
      const sharp = projectPolyhedralGeometryV4(
        D20_SHARP_GEOMETRY_V4,
        result,
      );
      const standard = projectPolyhedralGeometryV4(
        D20_STANDARD_GEOMETRY_V4,
        result,
      );
      const { geometryId: sharpGeometryId, ...sharpProjection } = sharp;
      const { geometryId: standardGeometryId, ...standardProjection } = standard;

      expect(sharpGeometryId).toBe("d20-sharp-r1");
      expect(standardGeometryId).toBe("d20-standard-r1");
      expect(sharpProjection).toEqual(standardProjection);
    }
  });

  it("pins sharp and standard descriptors independently", () => {
    const standardHash = createHash("sha256")
      .update(canonicalJsonV4(D20_STANDARD_GEOMETRY_V4))
      .digest("hex");
    const sharpHash = createHash("sha256")
      .update(canonicalJsonV4(D20_SHARP_GEOMETRY_V4))
      .digest("hex");

    expect(standardHash).toBe(
      "d395a7d72431463d82f1e56ce94a8a3939c01bf3c8e82e08b79f7bd74fcd6c02",
    );
    expect(sharpHash).toBe(
      "67c2455418549447b3cee81ba8531a5ea0ef6aa91b17eea6b2457542301b574c",
    );
  });
});
