import {
  materialLightResponseV4,
  type LightingDirectionV4,
  type LightingStrengthV4,
  type MaterialFamilyV4,
  type Point3V4,
  type RenderLightingV4,
} from "@dice-witch/dice-v4-model";

export const DEFAULT_RENDER_LIGHTING_V4 = Object.freeze({
  mode: "combined",
  strength: "gentle",
  direction: "upper-left",
} as const satisfies RenderLightingV4);

const DEFAULT_MATERIAL_FAMILY_V4: MaterialFamilyV4 = "classic";

type OverlayStrengthV4 = {
  highlight: number;
  shadow: number;
};

export type PolyhedralLightingOverlayV4 = {
  color: "black" | "white";
  alpha: number;
};

export type SphereLightingParametersV4 = {
  lightDirection: Point3V4;
  ambient: number;
  intrinsic: number;
  directional: number;
  rim: number;
};

const OVERLAY_STRENGTHS_V4: Readonly<
  Record<LightingStrengthV4, OverlayStrengthV4>
> = Object.freeze({
  gentle: { highlight: 0.06, shadow: 0.08 },
  subtle: { highlight: 0.16, shadow: 0.24 },
  strong: { highlight: 0.28, shadow: 0.4 },
});

const POLYHEDRAL_LIGHT_DIRECTIONS_V4: Readonly<
  Record<LightingDirectionV4, Point3V4>
> = Object.freeze({
  top: [0, 0.62, 0.78],
  "upper-left": [-0.45, 0.58, 0.68],
  "upper-right": [0.45, 0.58, 0.68],
  left: [-0.62, 0, 0.78],
  right: [0.62, 0, 0.78],
});

const SPHERE_LIGHT_DIRECTIONS_V4: Readonly<
  Record<LightingDirectionV4, Point3V4>
> = Object.freeze({
  top: [0, 0.62, 0.78],
  "upper-left": [-0.42, 0.58, 0.82],
  "upper-right": [0.42, 0.58, 0.82],
  left: [-0.62, 0, 0.78],
  right: [0.62, 0, 0.78],
});

const SPHERE_FACET_COEFFICIENTS_V4: Readonly<
  Record<
    LightingStrengthV4,
    Pick<SphereLightingParametersV4, "ambient" | "intrinsic" | "rim">
  >
> = Object.freeze({
  gentle: { ambient: 0.64, intrinsic: 0.36, rim: 0.04 },
  subtle: { ambient: 0.55, intrinsic: 0.5, rim: 0.07 },
  strong: { ambient: 0.42, intrinsic: 0.68, rim: 0.11 },
});

const SPHERE_DIRECTIONAL_COEFFICIENTS_V4: Readonly<
  Record<
    LightingStrengthV4,
    Pick<
      SphereLightingParametersV4,
      "ambient" | "intrinsic" | "directional" | "rim"
    >
  >
> = Object.freeze({
  gentle: { ambient: 0.6, intrinsic: 0.34, directional: 0.12, rim: 0.05 },
  subtle: { ambient: 0.52, intrinsic: 0.36, directional: 0.24, rim: 0.08 },
  strong: { ambient: 0.42, intrinsic: 0.4, directional: 0.38, rim: 0.12 },
});

const SPHERE_COMBINED_COEFFICIENTS_V4: Readonly<
  Record<
    LightingStrengthV4,
    Pick<
      SphereLightingParametersV4,
      "ambient" | "intrinsic" | "directional" | "rim"
    >
  >
> = Object.freeze({
  gentle: { ambient: 0.54, intrinsic: 0.02, directional: 0.54, rim: 0.07 },
  subtle: { ambient: 0.46, intrinsic: 0.08, directional: 0.62, rim: 0.09 },
  strong: { ambient: 0.38, intrinsic: 0.12, directional: 0.72, rim: 0.12 },
});

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function dot(normal: Point3V4, direction: Point3V4): number {
  return (
    normal[0] * direction[0] +
    normal[1] * direction[1] +
    normal[2] * direction[2]
  );
}

function normalizedDot(
  normal: Point3V4,
  direction: Point3V4,
): number {
  return dot(normal, direction) / Math.hypot(...direction);
}

function directionalResponse(
  normal: Point3V4,
  direction: LightingDirectionV4,
): number {
  const [x, y] = POLYHEDRAL_LIGHT_DIRECTIONS_V4[direction];
  const length = Math.hypot(x, y);
  return clampUnit(0.5 + (normal[0] * x + normal[1] * y) / length / 2);
}

function overlayFromResponse(
  response: number,
  neutral: number,
  strength: LightingStrengthV4,
  family: MaterialFamilyV4,
): PolyhedralLightingOverlayV4 {
  const material = materialLightResponseV4(family);
  const coefficient = OVERLAY_STRENGTHS_V4[strength];
  if (response >= neutral) {
    return {
      color: "white",
      alpha: clampUnit(
        ((response - neutral) / (1 - neutral)) *
          coefficient.highlight *
          material.highlight,
      ),
    };
  }
  return {
    color: "black",
    alpha: clampUnit(
      ((neutral - response) / neutral) * coefficient.shadow * material.shadow,
    ),
  };
}

function resolvedRenderLightingV4(
  lighting: RenderLightingV4 | undefined,
): RenderLightingV4 {
  return lighting ?? DEFAULT_RENDER_LIGHTING_V4;
}

function resolvedMaterialFamilyV4(
  family: MaterialFamilyV4 | undefined,
): MaterialFamilyV4 {
  return family ?? DEFAULT_MATERIAL_FAMILY_V4;
}

function isDefaultRenderLightingV4(
  lighting: RenderLightingV4 | undefined,
): boolean {
  const resolved = resolvedRenderLightingV4(lighting);
  return (
    resolved.mode === "combined" &&
    resolved.strength === "gentle" &&
    resolved.direction === "upper-left"
  );
}

export function usesClassicBaselineSphereShaderV4(
  lighting: RenderLightingV4 | undefined,
  family: MaterialFamilyV4 | undefined,
): boolean {
  return (
    isDefaultRenderLightingV4(lighting) &&
    resolvedMaterialFamilyV4(family) === DEFAULT_MATERIAL_FAMILY_V4
  );
}

export function renderLightingKeyV4(
  lighting: RenderLightingV4,
  family: MaterialFamilyV4,
): string {
  if (lighting.mode === "none") return `${family}/none`;
  if (lighting.mode === "facet") {
    return `${family}/facet/${lighting.strength}`;
  }
  return `${family}/${lighting.mode}/${lighting.strength}/${lighting.direction}`;
}

export function resolvePolyhedralLightingOverlayV4(
  normal: Point3V4,
  lighting: RenderLightingV4 | undefined,
  family: MaterialFamilyV4 | undefined,
): PolyhedralLightingOverlayV4 {
  const resolvedLighting = resolvedRenderLightingV4(lighting);
  if (resolvedLighting.mode === "none") {
    return { color: "black", alpha: 0 };
  }
  const resolvedFamily = resolvedMaterialFamilyV4(family);
  if (isDefaultRenderLightingV4(resolvedLighting)) {
    const diffuse = Math.max(
      0,
      dot(normal, POLYHEDRAL_LIGHT_DIRECTIONS_V4["upper-left"]),
    );
    return {
      color: "black",
      alpha:
        Math.max(0, 0.72 - diffuse) *
        0.32 *
        materialLightResponseV4(resolvedFamily).shadow,
    };
  }

  if (resolvedLighting.mode === "facet") {
    return overlayFromResponse(
      clampUnit(normal[2]),
      0.72,
      resolvedLighting.strength,
      resolvedFamily,
    );
  }
  if (resolvedLighting.mode === "directional") {
    return overlayFromResponse(
      directionalResponse(normal, resolvedLighting.direction),
      0.5,
      resolvedLighting.strength,
      resolvedFamily,
    );
  }
  return overlayFromResponse(
    clampUnit(
      Math.max(
        0,
        normalizedDot(
          normal,
          POLYHEDRAL_LIGHT_DIRECTIONS_V4[resolvedLighting.direction],
        ),
      ),
    ),
    0.58,
    resolvedLighting.strength,
    resolvedFamily,
  );
}

function materialAwareSphereParameters(
  parameters: SphereLightingParametersV4,
  family: MaterialFamilyV4,
): SphereLightingParametersV4 {
  const response = materialLightResponseV4(family);
  return {
    ...parameters,
    ambient:
      1 - (1 - parameters.ambient) * (0.85 + response.shadow * 0.15),
    intrinsic:
      parameters.intrinsic * (0.8 + response.highlight * 0.2),
    directional:
      parameters.directional * (0.7 + response.highlight * 0.3),
    rim: parameters.rim * (0.7 + response.rim * 0.3),
  };
}

export function resolveSphereLightingParametersV4(
  lighting: RenderLightingV4 | undefined,
  family: MaterialFamilyV4 | undefined,
): SphereLightingParametersV4 {
  const resolvedLighting = resolvedRenderLightingV4(lighting);
  const resolvedFamily = resolvedMaterialFamilyV4(family);
  if (isDefaultRenderLightingV4(resolvedLighting)) {
    return materialAwareSphereParameters(
      {
        lightDirection: SPHERE_LIGHT_DIRECTIONS_V4["upper-left"],
        ambient: 0.52,
        intrinsic: 0,
        directional: 0.62,
        rim: 0.08,
      },
      resolvedFamily,
    );
  }
  if (resolvedLighting.mode === "none") {
    return materialAwareSphereParameters(
      {
        lightDirection: [0, 0, 1],
        ambient: 0.62,
        intrinsic: 0.38,
        directional: 0,
        rim: 0.045,
      },
      resolvedFamily,
    );
  }
  if (resolvedLighting.mode === "facet") {
    const coefficients = SPHERE_FACET_COEFFICIENTS_V4[resolvedLighting.strength];
    return materialAwareSphereParameters(
      {
        lightDirection: [0, 0, 1],
        directional: 0,
        ...coefficients,
      },
      resolvedFamily,
    );
  }
  if (resolvedLighting.mode === "directional") {
    const [x, y] = SPHERE_LIGHT_DIRECTIONS_V4[resolvedLighting.direction];
    return materialAwareSphereParameters(
      {
        lightDirection: [x, y, 0],
        ...SPHERE_DIRECTIONAL_COEFFICIENTS_V4[resolvedLighting.strength],
      },
      resolvedFamily,
    );
  }
  return materialAwareSphereParameters(
    {
      lightDirection: SPHERE_LIGHT_DIRECTIONS_V4[resolvedLighting.direction],
      ...SPHERE_COMBINED_COEFFICIENTS_V4[resolvedLighting.strength],
    },
    resolvedFamily,
  );
}

export function sphereLightingSampleV4(
  normal: Point3V4,
  parameters: SphereLightingParametersV4,
) {
  const diffuse = Math.max(
    normalizedDot(normal, parameters.lightDirection),
    0,
  );
  return {
    shade:
      parameters.ambient +
      Math.max(normal[2], 0) * parameters.intrinsic +
      diffuse * parameters.directional,
    rim:
      (1 - Math.max(normal[2], 0)) ** 2.4 * parameters.rim * 255,
  };
}
