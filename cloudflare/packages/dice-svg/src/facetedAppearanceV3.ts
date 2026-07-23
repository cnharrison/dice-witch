import {
  APPEARANCE_BORDER_COLOR,
  composeAppearanceTypographyCss,
  composeCriticalGlow,
  composeFacetBorder,
  composeLocalSeparationPolygon,
  CRITICAL_GLOW_FILTER,
  ENGRAVED_NUMBER_FILTER,
} from "./appearance";
import { createAppearanceTreatmentV3 } from "./appearanceV3";
import {
  faceClipPath,
  faceLabel,
  type FacetedAppearanceGeometry,
  type FacetedFaceValue,
} from "./facetedAppearance";
import {
  composeAppearanceLayerStackV3,
  composeFacetLightingOverlayV3,
} from "./lightingV3";
import type { RenderAppearanceV3 } from "./types";

export type FacetedAppearanceRequestV3 = RenderAppearanceV3 & {
  result: number;
};

export type FacetedAppearanceCompositionV3 = {
  facetSubtleCompositor: "interleaved" | "layered";
};

function layer(
  name: string,
  content: string,
  compositor: "legacy-v1" | null = null,
): string {
  if (content.length === 0) return "";
  const compositorAttribute =
    compositor === null ? "" : ` data-facet-compositor="${compositor}"`;
  return `<g data-appearance-layer="${name}"${compositorAttribute}>\n    ${content}\n  </g>`;
}

export function composeFacetedAppearanceSvgV3<Slot extends string>(
  request: FacetedAppearanceRequestV3,
  geometry: FacetedAppearanceGeometry<Slot>,
  visibleFaces: Readonly<Record<Slot, FacetedFaceValue>>,
  composition: FacetedAppearanceCompositionV3,
): string {
  const treatment = createAppearanceTreatmentV3(request);
  // Facet/Subtle is the canonical migrated V1 treatment. Targets that used
  // interleaved face shading retain that compositor for exact retry pixels.
  const preserveLegacyCompositor =
    composition.facetSubtleCompositor === "interleaved" &&
    request.lighting.mode === "facet" &&
    request.lighting.strength === "subtle";
  const material = layer(
    "material",
    geometry.faces
      .map(({ slot, points, shade }) => {
        const surface = `<polygon class="face" fill="${treatment.materialFill}" data-face-surface="${slot}" points="${points}"/>`;
        if (!preserveLegacyCompositor) return surface;
        const facetOverlay = composeFacetLightingOverlayV3(
          points,
          shade,
          "subtle",
        );
        const separationOverlay = request.requiresLocalSeparation
          ? composeLocalSeparationPolygon(points, request.textColor)
          : "";
        return [surface, facetOverlay, separationOverlay]
          .filter((item) => item.length > 0)
          .join("\n    ");
      })
      .join("\n    "),
    preserveLegacyCompositor ? "legacy-v1" : null,
  );
  const facetStrength = treatment.facetStrength;
  const facet = layer(
    "facet",
    preserveLegacyCompositor || facetStrength === null
      ? ""
      : geometry.faces
          .map(({ points, shade }) =>
            composeFacetLightingOverlayV3(points, shade, facetStrength),
          )
          .filter((overlay) => overlay.length > 0)
          .join("\n    "),
  );
  const directional = layer(
    "directional",
    treatment.directionalFill === null
      ? ""
      : `<polygon data-lighting-layer="directional" points="${geometry.silhouette}" fill="${treatment.directionalFill}" pointer-events="none"/>`,
  );
  const localSeparation = layer(
    "local-separation",
    request.requiresLocalSeparation && !preserveLegacyCompositor
      ? geometry.faces
          .map(({ points }) =>
            composeLocalSeparationPolygon(points, request.textColor),
          )
          .join("\n    ")
      : "",
  );
  const borders = layer(
    "borders",
    `${geometry.faces
      .map(({ points }) => composeFacetBorder(points))
      .join("\n    ")}
    <polygon points="${geometry.silhouette}" fill="none" stroke="${APPEARANCE_BORDER_COLOR}" stroke-width="3" stroke-linejoin="round"/>`,
  );
  const labels = `<g data-appearance-layer="labels" aria-label="Rolled ${String(request.result)}; all visible faces are numbered">
    ${geometry.faces
      .map((layout) =>
        faceLabel(visibleFaces[layout.slot], layout, request.fontId),
      )
      .join("\n    ")}
  </g>`;
  const layers = composeAppearanceLayerStackV3({
    material,
    facet,
    directional,
    localSeparation,
    borders,
    labels,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="150" height="150" data-die="${geometry.die}" data-font-id="${request.fontId}">
  <defs>
    ${treatment.definitions}
    ${CRITICAL_GLOW_FILTER}
    ${ENGRAVED_NUMBER_FILTER}
    ${geometry.faces.map(faceClipPath).join("\n    ")}
    <style>
      .face{shape-rendering:geometricPrecision}
      ${composeAppearanceTypographyCss(request)}
    </style>
  </defs>
  ${composeCriticalGlow(request.effect, geometry.silhouette)}
  ${layers}
</svg>`;
}
