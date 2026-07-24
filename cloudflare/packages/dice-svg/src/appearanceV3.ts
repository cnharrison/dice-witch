import patternFills from "./fills/generatePatternFills";
import {
  generateAppearanceGradientV3,
  generateOtherAppearanceGradientV3,
} from "./fills/generateAppearanceGradientV3";
import { resolveLightingLayersV3 } from "./lightingV3";
import type {
  RenderAppearanceV3,
  RenderLightingStrengthV3,
  RenderSurfaceV3,
} from "./types";

export {
  generateAppearanceGradientV3,
  generateOtherAppearanceGradientV3,
};

export type AppearanceSurfaceFillV3 = {
  definition: string;
  value: string;
};

export type AppearanceTreatmentV3 = {
  definitions: string;
  materialFill: string;
  facetStrength: RenderLightingStrengthV3 | null;
  directionalFill: string | null;
};

export function createAppearanceSurfaceFillV3(
  surface: RenderSurfaceV3,
): AppearanceSurfaceFillV3 {
  if (surface.type === "solid") {
    return { definition: "", value: surface.color };
  }
  const definition =
    surface.type === "gradient"
      ? generateAppearanceGradientV3(surface)
      : patternFills[surface.pattern](
          surface.primaryColor,
          surface.secondaryColor,
        );
  return {
    definition: definition.string,
    value: `url(#${definition.name})`,
  };
}

export function createOtherAppearanceSurfaceFillV3(
  surface: RenderSurfaceV3,
): AppearanceSurfaceFillV3 {
  if (surface.type !== "gradient") {
    return createAppearanceSurfaceFillV3(surface);
  }
  const definition = generateOtherAppearanceGradientV3(surface);
  return {
    definition: definition.string,
    value: `url(#${definition.name})`,
  };
}

function createTreatment(
  lighting: RenderAppearanceV3["lighting"],
  material: AppearanceSurfaceFillV3,
): AppearanceTreatmentV3 {
  const layers = resolveLightingLayersV3(lighting);
  return {
    definitions: [material.definition, layers.directional?.definition ?? ""]
      .filter((definition) => definition.length > 0)
      .join("\n    "),
    materialFill: material.value,
    facetStrength: layers.facetStrength,
    directionalFill: layers.directional?.value ?? null,
  };
}

export function createAppearanceTreatmentV3(
  appearance: Pick<RenderAppearanceV3, "lighting" | "surface">,
): AppearanceTreatmentV3 {
  return createTreatment(
    appearance.lighting,
    createAppearanceSurfaceFillV3(appearance.surface),
  );
}

export function createOtherAppearanceTreatmentV3(
  appearance: Pick<RenderAppearanceV3, "lighting" | "surface">,
): AppearanceTreatmentV3 {
  return createTreatment(
    appearance.lighting,
    createOtherAppearanceSurfaceFillV3(appearance.surface),
  );
}
