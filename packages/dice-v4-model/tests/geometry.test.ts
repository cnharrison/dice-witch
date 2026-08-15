import { describe, expect, it } from "vitest";
import {
  D4_STANDARD_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_R2_V4,
  D20_STANDARD_GEOMETRY_V4,
  D6_STANDARD_GEOMETRY_V4,
  OTHER_SPHERE_GEOMETRY_V4,
  GEOMETRY_IDS_V4,
  getAuthoredRenderViewV4,
  getGeometryIdV4,
  getRenderGeometryDescriptorV4,
  getRenderGeometryIdV4,
  getRenderTexturePlacementV4,
  type PolyhedralGeometryDescriptorV4,
  type RenderDieV4,
  type SphericalGeometryDescriptorV4,
} from "../src";

describe("V4 geometry contract", () => {
  it("assigns a base geometry to every target and registers additive descriptors", () => {
    expect(GEOMETRY_IDS_V4).toHaveLength(34);
    expect(new Set(GEOMETRY_IDS_V4)).toHaveLength(34);
    expect(getGeometryIdV4("d6", "standard")).toBe("d6-standard-r1");
    expect(getGeometryIdV4("d20", "crystal-cut")).toBe(
      "d20-crystal-cut-r1",
    );
    expect(getGeometryIdV4("percentile", "hollow-cage")).toBe(
      "percentile-hollow-cage-r1",
    );
    expect(getGeometryIdV4("other", "sphere")).toBe("other-sphere-r1");
    expect(GEOMETRY_IDS_V4).toContain("d20-standard-r2");
  });

  it("selects immutable geometry by renderer revision without a renderer-local rule", () => {
    const standardD20 = {
      target: "d20",
      form: "standard",
      result: 20,
    } as const;

    expect(getRenderGeometryIdV4("canvaskit-v4-r1", standardD20)).toBe(
      "d20-standard-r1",
    );
    expect(getRenderGeometryIdV4("canvaskit-v4-r2", standardD20)).toBe(
      "d20-standard-r1",
    );
    expect(getRenderGeometryIdV4("canvaskit-v4-r3", standardD20)).toBe(
      "d20-standard-r2",
    );
    expect(getRenderGeometryIdV4("canvaskit-v4-r4", standardD20)).toBe(
      "d20-standard-r2",
    );
    expect(getRenderGeometryIdV4("canvaskit-v4-r5", standardD20)).toBe(
      "d20-standard-r2",
    );
    expect(getRenderGeometryIdV4("canvaskit-v4-r6", standardD20)).toBe(
      "d20-standard-r2",
    );
    expect(getRenderGeometryIdV4("canvaskit-v4-r7", standardD20)).toBe(
      "d20-standard-r2",
    );
    expect(
      getRenderGeometryDescriptorV4("canvaskit-v4-r3", standardD20),
    ).toBe(D20_STANDARD_GEOMETRY_R2_V4);
    expect(
      getRenderGeometryDescriptorV4("canvaskit-v4-r4", standardD20),
    ).toBe(D20_STANDARD_GEOMETRY_R2_V4);
    expect(
      getRenderGeometryDescriptorV4("canvaskit-v4-r5", standardD20),
    ).toBe(D20_STANDARD_GEOMETRY_R2_V4);
    expect(
      getRenderGeometryDescriptorV4("canvaskit-v4-r6", standardD20),
    ).toBe(D20_STANDARD_GEOMETRY_R2_V4);
    expect(
      getRenderGeometryDescriptorV4("canvaskit-v4-r7", standardD20),
    ).toBe(D20_STANDARD_GEOMETRY_R2_V4);
    expect(
      getRenderGeometryDescriptorV4("canvaskit-v4-r2", standardD20),
    ).toBe(D20_STANDARD_GEOMETRY_V4);
    expect(
      getRenderGeometryIdV4("canvaskit-v4-r3", {
        target: "d20",
        form: "sharp",
      }),
    ).toBe("d20-sharp-r1");
    expect(() =>
      getRenderGeometryIdV4(
        "unsupported" as "canvaskit-v4-r3",
        standardD20,
      ),
    ).toThrow("Render request rendererRevision is not supported");
  });

  it("applies stored camera and d4 pose angles without mutating canonical geometry", () => {
    const view = {
      kind: "camera" as const,
      elevationDegrees: 40,
      azimuthOffsetDegrees: 20,
      poseAzimuthDegrees: 120,
    };
    const d20 = getRenderGeometryDescriptorV4("canvaskit-v4-r16", {
      target: "d20",
      form: "standard",
      result: 20,
      view,
    });
    const d4 = getRenderGeometryDescriptorV4("canvaskit-v4-r16", {
      target: "d4",
      form: "standard",
      result: 4,
      view,
    });
    const sphere = getRenderGeometryDescriptorV4("canvaskit-v4-r16", {
      target: "other",
      form: "sphere",
      result: 1,
      view: { kind: "sphere-surface", rotationDegrees: 20 },
    });
    const realisticD20 = getRenderGeometryDescriptorV4("canvaskit-v4-r17", {
      target: "d20",
      form: "standard",
      result: 20,
      view: {
        kind: "camera",
        elevationDegrees: 40,
        azimuthOffsetDegrees: 45,
        poseAzimuthDegrees: 180,
      },
    });
    const realisticSphere = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r17",
      {
        target: "other",
        form: "sphere",
        result: 1,
        view: { kind: "sphere-surface", rotationDegrees: 36 },
      },
    );
    const positionedView = {
      kind: "sphere-surface" as const,
      rotationDegrees: 36,
      labelLongitudeDegrees: -45,
      labelLatitudeDegrees: 25,
      labelRotationDegrees: 36,
    };
    const positionedSphere = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r18",
      { target: "other", form: "sphere", result: 1, view: positionedView },
    );
    const projectedSphere = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r19",
      { target: "other", form: "sphere", result: 1, view: positionedView },
    );

    expect(d20.camera.position).not.toEqual(
      D20_STANDARD_GEOMETRY_R2_V4.camera.position,
    );
    expect(d4.kind).toBe("polyhedral");
    if (d4.kind !== "polyhedral") throw new Error("D4 geometry is invalid");
    expect(d4.resultOrientations).not.toEqual(
      D4_STANDARD_GEOMETRY_V4.resultOrientations,
    );
    expect(sphere).toBe(OTHER_SPHERE_GEOMETRY_V4);
    expect(realisticD20.kind).toBe("polyhedral");
    if (realisticD20.kind !== "polyhedral") {
      throw new Error("D20 geometry is invalid");
    }
    expect(realisticD20.resultOrientations).not.toEqual(
      D20_STANDARD_GEOMETRY_R2_V4.resultOrientations,
    );
    expect(realisticSphere.kind).toBe("sphere");
    if (realisticSphere.kind !== "sphere") {
      throw new Error("Sphere geometry is invalid");
    }
    expect(realisticSphere.labelFrame.right[0]).toBeCloseTo(
      Math.cos(Math.PI / 5),
    );
    expect(realisticSphere.labelFrame.right[1]).toBeCloseTo(
      Math.sin(Math.PI / 5),
    );
    expect(realisticSphere.labelFrame.up[0]).toBeCloseTo(
      -Math.sin(Math.PI / 5),
    );
    expect(realisticSphere.labelFrame.up[1]).toBeCloseTo(
      Math.cos(Math.PI / 5),
    );
    expect(positionedSphere.kind).toBe("sphere");
    if (positionedSphere.kind !== "sphere") {
      throw new Error("Positioned sphere geometry is invalid");
    }
    expect(positionedSphere.labelFrame.origin[0]).not.toBe(0);
    expect(positionedSphere.labelFrame.origin[1]).not.toBe(0);
    expect(positionedSphere.labelFrame.origin[2]).toBeGreaterThan(0);
    expect(positionedSphere.labelMapping).toBeUndefined();
    expect(projectedSphere.kind).toBe("sphere");
    if (projectedSphere.kind !== "sphere") {
      throw new Error("Projected sphere geometry is invalid");
    }
    expect(projectedSphere.labelMapping).toBe("local-frame-r19");
    expect(projectedSphere.labelFrame).toEqual(positionedSphere.labelFrame);
    expect(
      getRenderTexturePlacementV4({
        appearance: {
          texture: { rotation: 350, offsetU: 0, offsetV: 0 },
        },
        view: { kind: "sphere-surface", rotationDegrees: 20 },
      } as unknown as RenderDieV4),
    ).toMatchObject({ rotation: 10, offsetU: 0, offsetV: 0 });
    expect(D20_STANDARD_GEOMETRY_R2_V4.camera.position).toEqual([
      3.8, 6.5, 7,
    ]);
  });

  it("applies the r36 inset only to normal d6 cameras", () => {
    const normalView = {
      kind: "camera" as const,
      elevationDegrees: 55,
      azimuthOffsetDegrees: 40,
      poseAzimuthDegrees: 0,
    };
    const normalD6 = {
      target: "d6",
      form: "standard",
      result: 1,
      view: normalView,
    } as const;
    const d6R35 = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r35",
      normalD6,
    );
    const d6R36 = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r36",
      normalD6,
    );
    const normalD8 = {
      target: "d8",
      form: "standard",
      result: 1,
      view: normalView,
    } as const;
    const d8R35 = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r35",
      normalD8,
    );
    const d8R36 = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r36",
      normalD8,
    );
    const authoredD6 = {
      target: "d6",
      form: "standard",
      result: 1,
    } as const;
    const authoredR35 = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r35",
      {
        ...authoredD6,
        view: getAuthoredRenderViewV4(
          "canvaskit-v4-r35",
          "legacy",
          authoredD6,
        ),
      },
    );
    const authoredR36 = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r36",
      {
        ...authoredD6,
        view: getAuthoredRenderViewV4(
          "canvaskit-v4-r36",
          "legacy",
          authoredD6,
        ),
      },
    );

    expect(d6R35.camera.orthographicHeight).toBe(
      D6_STANDARD_GEOMETRY_V4.camera.orthographicHeight,
    );
    expect(d6R36.camera).toEqual({
      ...d6R35.camera,
      orthographicHeight: d6R35.camera.orthographicHeight * 1.14,
    });
    expect(d8R36.camera).toEqual(d8R35.camera);
    expect(authoredR36.camera).toEqual(authoredR35.camera);
  });

  it("expresses polyhedral and spherical descriptors without runtime objects", () => {
    const polyhedral: PolyhedralGeometryDescriptorV4 = {
      version: 1,
      id: "d6-standard-r1",
      kind: "polyhedral",
      target: "d6",
      form: "standard",
      vertices: [{ position: [0, 0, 0] }],
      faces: [
        {
          id: "front",
          normal: [0, 0, 1],
          vertexIndices: [0, 0, 0],
          skinCoordinates: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
          labels: [
            {
              value: 1,
              alignment: "surface",
              origin: [0, 0, 0],
              right: [1, 0, 0],
              up: [0, 1, 0],
              maxWidth: 1,
              maxHeight: 1,
              opticalInset: 0,
            },
          ],
        },
      ],
      skinMapping: { kind: "face-coordinates" },
      resultOrientations: [{ result: 1, rotation: [0, 0, 0, 1] }],
      camera: {
        position: [0, 0, 3],
        target: [0, 0, 0],
        up: [0, 1, 0],
        orthographicHeight: 2,
      },
    };
    const sphere: SphericalGeometryDescriptorV4 = {
      version: 1,
      id: "other-sphere-r1",
      kind: "sphere",
      target: "other",
      form: "sphere",
      radius: 1,
      skinMapping: "spherical-inverse-v1",
      labelFrame: {
        origin: [0, 0, 1],
        right: [1, 0, 0],
        up: [0, 1, 0],
        maxWidth: 1,
        maxHeight: 1,
        opticalInset: 0,
      },
      camera: {
        position: [0, 0, 3],
        target: [0, 0, 0],
        up: [0, 1, 0],
        orthographicHeight: 2,
      },
    };

    expect(polyhedral.faces[0]?.skinCoordinates[1]).toEqual([1, 0]);
    expect(sphere.skinMapping).toBe("spherical-inverse-v1");
  });
});
