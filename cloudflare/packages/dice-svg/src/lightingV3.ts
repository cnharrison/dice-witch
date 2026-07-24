import {
  APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES,
  APPEARANCE_GENTLE_LIGHTING_MULTIPLIER,
  APPEARANCE_STRONG_LIGHTING_MULTIPLIER,
} from "../../dice-appearance/src/contrast";
import type {
  RenderLightingDirectionV3,
  RenderLightingStrengthV3,
  RenderLightingV3,
} from "./types";

export {
  APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES,
  APPEARANCE_GENTLE_LIGHTING_MULTIPLIER,
  APPEARANCE_STRONG_LIGHTING_MULTIPLIER,
} from "../../dice-appearance/src/contrast";

export type DirectionalLightingLayerV3 = Readonly<{
  definition: string;
  value: string;
}>;

export type LightingLayersV3 = Readonly<{
  facetStrength: RenderLightingStrengthV3 | null;
  directional: DirectionalLightingLayerV3 | null;
}>;

export type FacetShadeV3 = Readonly<{
  color: "#000000" | "#ffffff";
  opacity: number;
}>;

export type AppearanceLayerStackV3 = Readonly<{
  material: string;
  facet: string;
  directional: string;
  localSeparation: string;
  borders: string;
  labels: string;
}>;

type LightingVector = Readonly<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}>;

const DIRECTIONAL_VECTORS: Readonly<
  Record<RenderLightingDirectionV3, LightingVector>
> = {
  top: { x1: 300, y1: 70, x2: 300, y2: 545 },
  "upper-left": { x1: 90, y1: 70, x2: 520, y2: 545 },
  "upper-right": { x1: 510, y1: 70, x2: 80, y2: 545 },
  left: { x1: 70, y1: 300, x2: 545, y2: 300 },
  right: { x1: 530, y1: 300, x2: 55, y2: 300 },
};

function boundedOpacity(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be from zero through one`);
  }
  return value;
}

function directionalLightingLayer(
  strength: RenderLightingStrengthV3,
  direction: RenderLightingDirectionV3,
): DirectionalLightingLayerV3 {
  const id = `appearance-directional-light-v3_${strength}_${direction}`;
  const vector = DIRECTIONAL_VECTORS[direction];
  const opacities = APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES[strength];
  const highlight = boundedOpacity(
    opacities.highlight,
    "Directional highlight opacity",
  );
  const shadow = boundedOpacity(
    opacities.shadow,
    "Directional shadow opacity",
  );
  return {
    definition: `<linearGradient id="${id}" data-lighting-strength="${strength}" gradientUnits="userSpaceOnUse" x1="${String(vector.x1)}" y1="${String(vector.y1)}" x2="${String(vector.x2)}" y2="${String(vector.y2)}">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="${String(highlight)}"/>
      <stop offset="44%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="56%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="${String(shadow)}"/>
    </linearGradient>`,
    value: `url(#${id})`,
  };
}

export function resolveLightingLayersV3(
  lighting: RenderLightingV3,
): LightingLayersV3 {
  if (lighting.mode === "none") {
    return { facetStrength: null, directional: null };
  }
  if (lighting.mode === "facet") {
    return { facetStrength: lighting.strength, directional: null };
  }
  return {
    facetStrength: lighting.mode === "combined" ? lighting.strength : null,
    directional: directionalLightingLayer(
      lighting.strength,
      lighting.direction,
    ),
  };
}

export function resolveFacetLightingOpacityV3(
  baseOpacity: number,
  strength: RenderLightingStrengthV3,
): number {
  const boundedBase = boundedOpacity(baseOpacity, "Facet lighting opacity");
  let opacity = boundedBase;
  if (strength === "gentle") {
    opacity *= APPEARANCE_GENTLE_LIGHTING_MULTIPLIER;
  } else if (strength === "strong") {
    opacity *= APPEARANCE_STRONG_LIGHTING_MULTIPLIER;
  }
  if (opacity > 1) {
    throw new Error("Strong facet lighting opacity must not exceed one");
  }
  return opacity;
}

export function composeFacetLightingOverlayV3(
  points: string,
  shade: FacetShadeV3 | null,
  strength: RenderLightingStrengthV3,
): string {
  if (shade === null) return "";
  const opacity = resolveFacetLightingOpacityV3(shade.opacity, strength);
  return `<polygon data-lighting-layer="facet" points="${points}" fill="${shade.color}" opacity="${String(opacity)}" pointer-events="none"/>`;
}

export function composeAppearanceLayerStackV3(
  layers: AppearanceLayerStackV3,
): string {
  return [
    layers.material,
    layers.facet,
    layers.directional,
    layers.localSeparation,
    layers.borders,
    layers.labels,
  ]
    .filter((layer) => layer.length > 0)
    .join("\n");
}
