import { describe, expect, it } from "vitest";
import {
  getAuthoredRenderViewV4,
  getRenderGeometryDescriptorV4,
  projectGeometryPointV4,
} from "../src";
import {
  dotPointsV4,
  rotatePointByQuaternionV4,
} from "../src/geometry-math";

const D6_RESULTS = [1, 2, 3, 4, 5, 6] as const;
const AUTHORED_POLYHEDRAL_SUBJECTS = [
  { target: "d4", form: "standard", results: [1, 2, 3, 4] },
  { target: "d6", form: "standard", results: D6_RESULTS },
  { target: "d8", form: "standard", results: [1, 2, 3, 4, 5, 6, 7, 8] },
  { target: "d10", form: "standard", results: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { target: "d12", form: "standard", results: Array.from({ length: 12 }, (_, index) => index + 1) },
  { target: "d20", form: "standard", results: Array.from({ length: 20 }, (_, index) => index + 1) },
  { target: "d20", form: "sharp", results: Array.from({ length: 20 }, (_, index) => index + 1) },
  { target: "d20", form: "crystal-cut", results: Array.from({ length: 20 }, (_, index) => index + 1) },
  { target: "d20", form: "hollow-cage", results: Array.from({ length: 20 }, (_, index) => index + 1) },
  { target: "percentile", form: "standard", results: Array.from({ length: 10 }, (_, index) => index * 10) },
  { target: "fudge", form: "standard", results: [-1, 0, 1] },
] as const;

function normalized(point: readonly [number, number, number]) {
  const length = Math.hypot(...point);
  return point.map((component) => component / length) as [
    number,
    number,
    number,
  ];
}

describe("authored V4 render views", () => {
  it.each(["legacy", "clear"] as const)(
    "defines one frozen %s view for every d6 result",
    (mode) => {
      for (const result of D6_RESULTS) {
        const view = getAuthoredRenderViewV4("canvaskit-v4-r20", mode, {
          target: "d6",
          form: "standard",
          result,
        });

        expect(view.kind).toBe("oriented-camera");
        expect(Object.isFrozen(view)).toBe(true);
        if (view.kind !== "oriented-camera") {
          throw new Error("D6 authored view is invalid");
        }
        expect(Object.isFrozen(view.resultRotation)).toBe(true);
        expect(Math.hypot(...view.resultRotation)).toBeCloseTo(1, 12);
      }
    },
  );

  it.each(["legacy", "clear"] as const)(
    "covers every registered polyhedral result in %s mode",
    (mode) => {
      for (const subject of AUTHORED_POLYHEDRAL_SUBJECTS) {
        for (const result of subject.results) {
          const die = {
            target: subject.target,
            form: subject.form,
            result,
          } as const;
          const view = getAuthoredRenderViewV4("canvaskit-v4-r20", mode, die);
          const descriptor = getRenderGeometryDescriptorV4(
            "canvaskit-v4-r20",
            { ...die, view },
          );

          expect(view).toMatchObject({ kind: "oriented-camera", mode });
          expect(Object.isFrozen(view)).toBe(true);
          if (view.kind !== "oriented-camera") {
            throw new Error("Polyhedral authored view is invalid");
          }
          expect(Object.isFrozen(view.resultRotation)).toBe(true);
          expect(Math.hypot(...view.resultRotation)).toBeCloseTo(1, 12);
          expect(descriptor.kind).toBe("polyhedral");
        }
      }
    },
  );

  it("keeps every Legacy result face front-facing and upright", () => {
    for (const subject of AUTHORED_POLYHEDRAL_SUBJECTS) {
      for (const result of subject.results) {
        const die = {
          target: subject.target,
          form: subject.form,
          result,
        } as const;
        const view = getAuthoredRenderViewV4("canvaskit-v4-r20", "legacy", die);
        const descriptor = getRenderGeometryDescriptorV4(
          "canvaskit-v4-r20",
          { ...die, view },
        );
        if (descriptor.kind !== "polyhedral" || view.kind !== "oriented-camera") {
          throw new Error("Legacy polyhedral descriptor is invalid");
        }
        const resultFaces = descriptor.faces.filter((face) =>
          face.labels.some((label) => label.value === result),
        );
        const frontFace = resultFaces.find((face) =>
          rotatePointByQuaternionV4(face.normal, view.resultRotation)[2] >
          1 - 1e-12,
        );
        const resultLabel = frontFace?.labels.find(
          (label) => label.value === result,
        );
        if (resultLabel === undefined) {
          throw new Error("Legacy result label is not front-facing");
        }
        const labelUp = rotatePointByQuaternionV4(
          resultLabel.up,
          view.resultRotation,
        );

        expect(labelUp[0]).toBeCloseTo(0, 12);
        expect(labelUp[1]).toBeCloseTo(1, 12);
        expect(labelUp[2]).toBeCloseTo(0, 12);
      }
    }
  });

  it("keeps every Clear result physically on top", () => {
    for (const subject of AUTHORED_POLYHEDRAL_SUBJECTS) {
      for (const result of subject.results) {
        const die = {
          target: subject.target,
          form: subject.form,
          result,
        } as const;
        const view = getAuthoredRenderViewV4("canvaskit-v4-r20", "clear", die);
        const descriptor = getRenderGeometryDescriptorV4(
          "canvaskit-v4-r20",
          { ...die, view },
        );
        if (descriptor.kind !== "polyhedral" || view.kind !== "oriented-camera") {
          throw new Error("Clear polyhedral descriptor is invalid");
        }
        if (subject.target === "d4") {
          const resultVertex = descriptor.vertices[result - 1]?.position;
          if (resultVertex === undefined) {
            throw new Error("Clear d4 result vertex is missing");
          }
          expect(
            rotatePointByQuaternionV4(resultVertex, view.resultRotation)[1],
          ).toBeCloseTo(1, 12);
          continue;
        }
        const resultIsOnTop = descriptor.faces.some(
          (face) =>
            face.labels.some((label) => label.value === result) &&
            rotatePointByQuaternionV4(face.normal, view.resultRotation)[1] >
              1 - 1e-12,
        );

        expect(resultIsOnTop).toBe(true);
      }
    }
  });

  it("makes every r22 Legacy result face directly dominate the camera", () => {
    for (const subject of AUTHORED_POLYHEDRAL_SUBJECTS) {
      for (const result of subject.results) {
        const die = {
          target: subject.target,
          form: subject.form,
          result,
        } as const;
        const legacyR21 = getAuthoredRenderViewV4(
          "canvaskit-v4-r21",
          "legacy",
          die,
        );
        const legacyR22 = getAuthoredRenderViewV4(
          "canvaskit-v4-r22",
          "legacy",
          die,
        );
        expect(legacyR21).toMatchObject({
          kind: "oriented-camera",
          elevationDegrees: 30,
          azimuthOffsetDegrees: 0,
        });
        expect(legacyR22).toMatchObject({
          kind: "oriented-camera",
          elevationDegrees: 1,
        });
        expect(
          getAuthoredRenderViewV4(
            "canvaskit-v4-r22",
            "clear",
            die,
          ),
        ).toEqual(
          getAuthoredRenderViewV4(
            "canvaskit-v4-r21",
            "clear",
            die,
          ),
        );
        if (legacyR22.kind !== "oriented-camera") {
          throw new Error("Legacy r22 view is not an oriented camera");
        }
        const descriptor = getRenderGeometryDescriptorV4(
          "canvaskit-v4-r22",
          { ...die, view: legacyR22 },
        );
        if (descriptor.kind !== "polyhedral") {
          throw new Error("Legacy r22 geometry is not polyhedral");
        }
        const cameraLength = Math.hypot(...descriptor.camera.position);
        const cameraDirection = descriptor.camera.position.map(
          (component) => component / cameraLength,
        ) as [number, number, number];
        const resultAlignment = Math.max(
          ...descriptor.faces
            .filter((face) =>
              face.labels.some((label) => label.value === result),
            )
            .map((face) =>
              dotPointsV4(
                rotatePointByQuaternionV4(
                  face.normal,
                  legacyR22.resultRotation,
                ),
                cameraDirection,
              ),
            ),
        );
        expect(resultAlignment).toBeGreaterThan(0.999);
      }
    }
  });

  it("restores the classic three-face Legacy camera only for d6 and Fudge in r23", () => {
    for (const subject of AUTHORED_POLYHEDRAL_SUBJECTS) {
      const sourceRevision =
        subject.target === "d6" || subject.target === "fudge"
          ? "canvaskit-v4-r20"
          : "canvaskit-v4-r22";
      for (const result of subject.results) {
        const die = {
          target: subject.target,
          form: subject.form,
          result,
        } as const;
        expect(
          getAuthoredRenderViewV4(
            "canvaskit-v4-r23",
            "legacy",
            die,
          ),
        ).toEqual(getAuthoredRenderViewV4(sourceRevision, "legacy", die));
        expect(
          getAuthoredRenderViewV4(
            "canvaskit-v4-r23",
            "clear",
            die,
          ),
        ).toEqual(
          getAuthoredRenderViewV4(
            "canvaskit-v4-r22",
            "clear",
            die,
          ),
        );
        for (const mode of ["legacy", "clear"] as const) {
          expect(
            getAuthoredRenderViewV4(
              "canvaskit-v4-r24",
              mode,
              die,
            ),
          ).toEqual(
            getAuthoredRenderViewV4(
              "canvaskit-v4-r23",
              mode,
              die,
            ),
          );
        }
      }
    }
  });

  it("turns only d6 and Fudge r25 Legacy result faces further toward the camera", () => {
    for (const subject of AUTHORED_POLYHEDRAL_SUBJECTS) {
      for (const result of subject.results) {
        const die = {
          target: subject.target,
          form: subject.form,
          result,
        } as const;
        for (const mode of ["legacy", "clear"] as const) {
          const r24 = getAuthoredRenderViewV4(
            "canvaskit-v4-r24",
            mode,
            die,
          );
          const r25 = getAuthoredRenderViewV4(
            "canvaskit-v4-r25",
            mode,
            die,
          );
          if (
            mode === "legacy" &&
            (subject.target === "d6" || subject.target === "fudge")
          ) {
            expect(r25).toEqual({
              ...r24,
              elevationDegrees: 12,
              azimuthOffsetDegrees: -15,
            });
          } else {
            expect(r25).toEqual(r24);
          }
        }
      }
    }
  });

  it("raises only r21 d20 Clear views to emphasize the result face", () => {
    for (const form of [
      "standard",
      "sharp",
      "crystal-cut",
      "hollow-cage",
    ] as const) {
      for (let result = 1; result <= 20; result += 1) {
        const die = { target: "d20" as const, form, result };
        const clearR20 = getAuthoredRenderViewV4(
          "canvaskit-v4-r20",
          "clear",
          die,
        );
        const clearR21 = getAuthoredRenderViewV4(
          "canvaskit-v4-r21",
          "clear",
          die,
        );
        expect(clearR20).toMatchObject({
          kind: "oriented-camera",
          mode: "clear",
          elevationDegrees: 55,
        });
        expect(clearR21).toMatchObject({
          kind: "oriented-camera",
          mode: "clear",
          elevationDegrees: 85,
        });
        if (
          clearR20.kind !== "oriented-camera" ||
          clearR21.kind !== "oriented-camera"
        ) {
          throw new Error("D20 Clear view is not an oriented camera");
        }
        expect(clearR21.resultRotation).toEqual(clearR20.resultRotation);
        expect(
          getAuthoredRenderViewV4(
            "canvaskit-v4-r21",
            "legacy",
            die,
          ),
        ).toEqual(
          getAuthoredRenderViewV4(
            "canvaskit-v4-r20",
            "legacy",
            die,
          ),
        );
      }
    }
  });

  it("shares each d20 authored rotation across every physical form", () => {
    for (const mode of ["legacy", "clear"] as const) {
      for (let result = 1; result <= 20; result += 1) {
        const standard = getAuthoredRenderViewV4("canvaskit-v4-r20", mode, {
          target: "d20",
          form: "standard",
          result,
        });
        for (const form of ["sharp", "crystal-cut", "hollow-cage"] as const) {
          expect(
            getAuthoredRenderViewV4("canvaskit-v4-r20", mode, { target: "d20", form, result }),
          ).toEqual(standard);
        }
      }
    }
  });

  it("centers every authored sphere result identically in both modes", () => {
    for (const result of [1, 20, 100, 999]) {
      const die = { target: "other", form: "sphere", result } as const;
      const legacy = getAuthoredRenderViewV4("canvaskit-v4-r20", "legacy", die);
      const clear = getAuthoredRenderViewV4("canvaskit-v4-r20", "clear", die);

      expect(legacy).toEqual({
        kind: "sphere-surface",
        rotationDegrees: 0,
        labelLongitudeDegrees: 0,
        labelLatitudeDegrees: 0,
        labelRotationDegrees: 0,
      });
      expect(clear).toBe(legacy);
      expect(Object.isFrozen(legacy)).toBe(true);
      const descriptor = getRenderGeometryDescriptorV4(
        "canvaskit-v4-r20",
        { ...die, view: legacy },
      );
      expect(descriptor.kind).toBe("sphere");
      if (descriptor.kind !== "sphere") {
        throw new Error("Authored sphere descriptor is invalid");
      }
      expect(descriptor.labelFrame.origin[0]).toBeCloseTo(0, 12);
      expect(descriptor.labelFrame.origin[1]).toBeCloseTo(0, 12);
      expect(descriptor.labelFrame.origin[2]).toBeCloseTo(1, 12);
      expect(descriptor.labelFrame.right[0]).toBeCloseTo(1, 12);
      expect(descriptor.labelFrame.right[1]).toBeCloseTo(0, 12);
      expect(descriptor.labelFrame.right[2]).toBeCloseTo(0, 12);
      expect(descriptor.labelFrame.up[0]).toBeCloseTo(0, 12);
      expect(descriptor.labelFrame.up[1]).toBeCloseTo(1, 12);
      expect(descriptor.labelFrame.up[2]).toBeCloseTo(0, 12);
    }
  });

  it("points every Legacy d6 result toward the viewer with valid neighbors", () => {
    for (const result of D6_RESULTS) {
      const view = getAuthoredRenderViewV4("canvaskit-v4-r20", "legacy", {
        target: "d6",
        form: "standard",
        result,
      });
      const descriptor = getRenderGeometryDescriptorV4(
        "canvaskit-v4-r20",
        { target: "d6", form: "standard", result, view },
      );
      if (descriptor.kind !== "polyhedral" || view.kind !== "oriented-camera") {
        throw new Error("Legacy d6 descriptor is invalid");
      }
      const resultFace = descriptor.faces.find((face) =>
        face.labels.some((label) => label.value === result),
      );
      if (resultFace === undefined) throw new Error("D6 result face is missing");
      const resultLabel = resultFace.labels.find(
        (label) => label.value === result,
      );
      if (resultLabel === undefined) throw new Error("D6 result label is missing");
      const resultNormal = rotatePointByQuaternionV4(
        resultFace.normal,
        view.resultRotation,
      );
      const labelUp = rotatePointByQuaternionV4(
        resultLabel.up,
        view.resultRotation,
      );
      const cameraDirection = normalized(descriptor.camera.position);
      const otherNormalDepths = descriptor.faces
        .filter((face) => face !== resultFace)
        .map((face) =>
          dotPointsV4(
            rotatePointByQuaternionV4(face.normal, view.resultRotation),
            cameraDirection,
          ),
        );

      expect(resultNormal[0]).toBeCloseTo(0, 12);
      expect(resultNormal[1]).toBeCloseTo(0, 12);
      expect(resultNormal[2]).toBeCloseTo(1, 12);
      expect(labelUp[0]).toBeCloseTo(0, 12);
      expect(labelUp[1]).toBeCloseTo(1, 12);
      expect(labelUp[2]).toBeCloseTo(0, 12);
      expect(dotPointsV4(resultNormal, cameraDirection)).toBeGreaterThan(
        Math.max(...otherNormalDepths),
      );
      expect(
        descriptor.faces.flatMap((face) =>
          face.labels.map((label) => label.value),
        ),
      ).toEqual(D6_RESULTS);
    }
  });

  it("keeps every Clear d6 result on top and visually dominant", () => {
    for (const result of D6_RESULTS) {
      const view = getAuthoredRenderViewV4("canvaskit-v4-r20", "clear", {
        target: "d6",
        form: "standard",
        result,
      });
      const descriptor = getRenderGeometryDescriptorV4(
        "canvaskit-v4-r20",
        { target: "d6", form: "standard", result, view },
      );
      if (descriptor.kind !== "polyhedral" || view.kind !== "oriented-camera") {
        throw new Error("Clear d6 descriptor is invalid");
      }
      const resultFace = descriptor.faces.find((face) =>
        face.labels.some((label) => label.value === result),
      );
      if (resultFace === undefined) throw new Error("D6 result face is missing");
      const resultLabel = resultFace.labels.find(
        (label) => label.value === result,
      );
      if (resultLabel === undefined) throw new Error("D6 result label is missing");
      const resultNormal = rotatePointByQuaternionV4(
        resultFace.normal,
        view.resultRotation,
      );
      const labelOrigin = rotatePointByQuaternionV4(
        resultLabel.origin,
        view.resultRotation,
      );
      const labelUp = rotatePointByQuaternionV4(
        resultLabel.up,
        view.resultRotation,
      );
      const projectedOrigin = projectGeometryPointV4(
        labelOrigin,
        descriptor.camera,
      );
      const projectedUp = projectGeometryPointV4(
        [
          labelOrigin[0] + labelUp[0],
          labelOrigin[1] + labelUp[1],
          labelOrigin[2] + labelUp[2],
        ],
        descriptor.camera,
      );
      const cameraDirection = normalized(descriptor.camera.position);
      const otherNormalDepths = descriptor.faces
        .filter((face) => face !== resultFace)
        .map((face) =>
          dotPointsV4(
            rotatePointByQuaternionV4(face.normal, view.resultRotation),
            cameraDirection,
          ),
        );

      expect(resultNormal[0]).toBeCloseTo(0, 12);
      expect(resultNormal[1]).toBeCloseTo(1, 12);
      expect(resultNormal[2]).toBeCloseTo(0, 12);
      expect(Math.abs(projectedUp[0] - projectedOrigin[0])).toBeLessThan(0.03);
      expect(projectedUp[1] - projectedOrigin[1]).toBeLessThan(-0.25);
      expect(dotPointsV4(resultNormal, cameraDirection)).toBeGreaterThan(
        Math.max(...otherNormalDepths),
      );
    }
  });

  it("swaps Legacy and Clear views for both physical d10 dice in r29", () => {
    for (const subject of [
      {
        target: "d10" as const,
        results: Array.from({ length: 10 }, (_, index) => index + 1),
      },
      {
        target: "percentile" as const,
        results: Array.from({ length: 10 }, (_, index) => index * 10),
      },
    ]) {
      for (const result of subject.results) {
        const die = { target: subject.target, form: "standard" as const, result };
        const legacyR28 = getAuthoredRenderViewV4(
          "canvaskit-v4-r28",
          "legacy",
          die,
        );
        const clearR28 = getAuthoredRenderViewV4(
          "canvaskit-v4-r28",
          "clear",
          die,
        );
        const legacyR29 = getAuthoredRenderViewV4(
          "canvaskit-v4-r29",
          "legacy",
          die,
        );
        const clearR29 = getAuthoredRenderViewV4(
          "canvaskit-v4-r29",
          "clear",
          die,
        );

        expect(legacyR29).toEqual({ ...clearR28, mode: "legacy" });
        expect(clearR29).toEqual({ ...legacyR28, mode: "clear" });
      }
    }
  });

  it("authors r30 crystal-cut and hollow-cage views for every polyhedral target", () => {
    for (const subject of [
      { target: "d4" as const, results: [1, 2, 3, 4] },
      { target: "d6" as const, results: [1, 2, 3, 4, 5, 6] },
      { target: "d8" as const, results: Array.from({ length: 8 }, (_, index) => index + 1) },
      { target: "d10" as const, results: Array.from({ length: 10 }, (_, index) => index + 1) },
      { target: "d12" as const, results: Array.from({ length: 12 }, (_, index) => index + 1) },
      { target: "d20" as const, results: Array.from({ length: 20 }, (_, index) => index + 1) },
      { target: "percentile" as const, results: Array.from({ length: 10 }, (_, index) => index * 10) },
      { target: "fudge" as const, results: [-1, 0, 1] },
    ]) {
      for (const result of subject.results) {
        for (const mode of ["legacy", "clear"] as const) {
          const standard = getAuthoredRenderViewV4(
            "canvaskit-v4-r30",
            mode,
            { target: subject.target, form: "standard", result },
          );
          for (const form of ["crystal-cut", "hollow-cage"] as const) {
            expect(
              getAuthoredRenderViewV4("canvaskit-v4-r30", mode, {
                target: subject.target,
                form,
                result,
              }),
            ).toEqual(standard);
          }
        }
      }
    }
  });

  it("fails instead of substituting an unauthored target or revision", () => {
    expect(() =>
      getAuthoredRenderViewV4("canvaskit-v4-r20", "legacy", {
        target: "d8",
        form: "standard",
        result: 9,
      }),
    ).toThrow("Authored legacy view is not implemented for d8 standard result 9");

    const view = getAuthoredRenderViewV4("canvaskit-v4-r20", "legacy", {
      target: "d6",
      form: "standard",
      result: 1,
    });
    expect(() =>
      getRenderGeometryDescriptorV4("canvaskit-v4-r19", {
        target: "d6",
        form: "standard",
        result: 1,
        view,
      }),
    ).toThrow("Resolved render view is not supported by this revision");
    expect(() =>
      getRenderGeometryDescriptorV4("canvaskit-v4-r20", {
        target: "d8",
        form: "standard",
        result: 1,
        view,
      }),
    ).toThrow("Resolved render view is not supported by this revision");
  });
});
