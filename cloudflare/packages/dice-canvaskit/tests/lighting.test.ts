import {
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_STRENGTHS_V4,
  MATERIAL_FAMILIES_V4,
  type RenderLightingV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RENDER_LIGHTING_V4,
  resolvePolyhedralLightingOverlayV4,
  resolveSphereLightingParametersV4,
  sphereLightingSampleV4,
  usesClassicBaselineSphereShaderV4,
  type PolyhedralLightingOverlayV4,
} from "../src/lighting";

function overlayScore(overlay: PolyhedralLightingOverlayV4): number {
  return overlay.color === "white" ? overlay.alpha : -overlay.alpha;
}

function lightingVariants(): RenderLightingV4[] {
  return [
    { mode: "none" },
    ...LIGHTING_STRENGTHS_V4.map(
      (strength): RenderLightingV4 => ({ mode: "facet", strength }),
    ),
    ...(["directional", "combined"] as const).flatMap((mode) =>
      LIGHTING_STRENGTHS_V4.flatMap((strength) =>
        LIGHTING_DIRECTIONS_V4.map(
          (direction): RenderLightingV4 => ({ mode, strength, direction }),
        ),
      ),
    ),
  ];
}

describe("CanvasKit V4 lighting", () => {
  it("preserves the approved default coefficients", () => {
    const normal = [0.2, -0.3, 0.9327379053] as const;
    const direction = [-0.45, 0.58, 0.68] as const;
    const diffuse = Math.max(
      0,
      normal[0] * direction[0] +
        normal[1] * direction[1] +
        normal[2] * direction[2],
    );

    expect(
      resolvePolyhedralLightingOverlayV4(
        normal,
        DEFAULT_RENDER_LIGHTING_V4,
        "classic",
      ),
    ).toEqual({
      color: "black",
      alpha: Math.max(0, 0.72 - diffuse) * 0.32,
    });
    expect(
      resolveSphereLightingParametersV4(
        DEFAULT_RENDER_LIGHTING_V4,
        "classic",
      ),
    ).toEqual({
      lightDirection: [-0.42, 0.58, 0.82],
      ambient: 0.52,
      intrinsic: 0,
      directional: 0.62,
      rim: 0.08,
    });
    expect(usesClassicBaselineSphereShaderV4(undefined, undefined)).toBe(true);
    expect(
      usesClassicBaselineSphereShaderV4(
        DEFAULT_RENDER_LIGHTING_V4,
        "classic",
      ),
    ).toBe(true);
    expect(
      usesClassicBaselineSphereShaderV4(
        DEFAULT_RENDER_LIGHTING_V4,
        "glass",
      ),
    ).toBe(false);
  });

  it("applies material response to the default treatment", () => {
    const normal = [0.2, -0.3, 0.9327379053] as const;
    const classicOverlay = resolvePolyhedralLightingOverlayV4(
      normal,
      DEFAULT_RENDER_LIGHTING_V4,
      "classic",
    );
    const glassOverlay = resolvePolyhedralLightingOverlayV4(
      normal,
      DEFAULT_RENDER_LIGHTING_V4,
      "glass",
    );
    const classicSphere = resolveSphereLightingParametersV4(
      DEFAULT_RENDER_LIGHTING_V4,
      "classic",
    );
    const glassSphere = resolveSphereLightingParametersV4(
      DEFAULT_RENDER_LIGHTING_V4,
      "glass",
    );

    expect(glassOverlay.alpha).toBeLessThan(classicOverlay.alpha);
    expect(glassSphere.ambient).toBeGreaterThan(classicSphere.ambient);
    expect(glassSphere.directional).toBeGreaterThan(
      classicSphere.directional,
    );
    expect(glassSphere.rim).toBeGreaterThan(classicSphere.rim);
  });

  it("keeps spherical form when optional lighting is disabled", () => {
    const parameters = resolveSphereLightingParametersV4(
      { mode: "none" },
      "classic",
    );
    const center = sphereLightingSampleV4([0, 0, 1], parameters);
    const edge = sphereLightingSampleV4([1, 0, 0], parameters);

    expect(center.shade).toBeGreaterThan(edge.shade);
    expect(edge.shade).toBeGreaterThan(0);
    expect(edge.rim).toBeGreaterThan(center.rim);
    expect(
      resolvePolyhedralLightingOverlayV4(
        [0.2, 0.3, 0.9],
        { mode: "none" },
        "classic",
      ),
    ).toEqual({ color: "black", alpha: 0 });
  });

  it("keeps every named directional light physically oriented", () => {
    const axis = 0.75;
    const axisZ = Math.sqrt(1 - axis ** 2);
    const diagonal = 0.53;
    const diagonalZ = Math.sqrt(1 - 2 * diagonal ** 2);
    const cases = [
      ["top", [0, axis, axisZ], [0, -axis, axisZ]],
      [
        "upper-left",
        [-diagonal, diagonal, diagonalZ],
        [diagonal, -diagonal, diagonalZ],
      ],
      [
        "upper-right",
        [diagonal, diagonal, diagonalZ],
        [-diagonal, -diagonal, diagonalZ],
      ],
      ["left", [-axis, 0, axisZ], [axis, 0, axisZ]],
      ["right", [axis, 0, axisZ], [-axis, 0, axisZ]],
    ] as const;

    for (const [direction, litNormal, oppositeNormal] of cases) {
      const lighting = {
        mode: "directional",
        strength: "strong",
        direction,
      } as const satisfies RenderLightingV4;
      const sphere = resolveSphereLightingParametersV4(lighting, "classic");
      expect(
        sphereLightingSampleV4(litNormal, sphere).shade,
      ).toBeGreaterThan(
        sphereLightingSampleV4(oppositeNormal, sphere).shade,
      );
      expect(
        overlayScore(
          resolvePolyhedralLightingOverlayV4(
            litNormal,
            lighting,
            "classic",
          ),
        ),
      ).toBeGreaterThan(
        overlayScore(
          resolvePolyhedralLightingOverlayV4(
            oppositeNormal,
            lighting,
            "classic",
          ),
        ),
      );
    }
  });

  it("resolves every material and lighting combination to bounded values", () => {
    const normals = [
      [0, 0, 1],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0.2, -0.3, 0.9327379053],
    ] as const;

    for (const family of MATERIAL_FAMILIES_V4) {
      for (const lighting of lightingVariants()) {
        const parameters = resolveSphereLightingParametersV4(
          lighting,
          family,
        );
        for (const normal of normals) {
          const overlay = resolvePolyhedralLightingOverlayV4(
            normal,
            lighting,
            family,
          );
          const sample = sphereLightingSampleV4(normal, parameters);

          expect(overlay.alpha).toBeGreaterThanOrEqual(0);
          expect(overlay.alpha).toBeLessThanOrEqual(1);
          expect(Number.isFinite(sample.shade)).toBe(true);
          expect(sample.shade).toBeGreaterThan(0);
          expect(sample.shade).toBeLessThanOrEqual(1.35);
          expect(Number.isFinite(sample.rim)).toBe(true);
          expect(sample.rim).toBeGreaterThanOrEqual(0);
          expect(sample.rim).toBeLessThanOrEqual(36);
        }
      }
    }
  });
});
