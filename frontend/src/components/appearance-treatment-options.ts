import type {
  AppearanceGradientScope,
  AppearanceLightingDirection,
  AppearanceLightingMode,
  AppearanceLightingStrength,
  AppearanceLinearDirection,
} from "@/types/appearance";

export type AppearanceTreatmentOption<Value extends string> = readonly [
  value: Value,
  label: string,
];

export const GRADIENT_SCOPES: readonly AppearanceTreatmentOption<AppearanceGradientScope>[] = [
  ["repeated", "Repeated per side"],
  ["die-wide", "Whole die"],
];

export const GRADIENT_DIRECTIONS: readonly AppearanceTreatmentOption<AppearanceLinearDirection>[] = [
  ["top-to-bottom", "Top to bottom"],
  ["upper-right-to-lower-left", "Upper right to lower left"],
  ["right-to-left", "Right to left"],
  ["lower-right-to-upper-left", "Lower right to upper left"],
  ["bottom-to-top", "Bottom to top"],
  ["lower-left-to-upper-right", "Lower left to upper right"],
  ["left-to-right", "Left to right"],
  ["upper-left-to-lower-right", "Upper left to lower right"],
];

export const LIGHTING_MODES: readonly AppearanceTreatmentOption<AppearanceLightingMode>[] = [
  ["none", "None"],
  ["facet", "Facet"],
  ["directional", "Directional"],
  ["combined", "Combined"],
];

export const LIGHTING_STRENGTHS: readonly AppearanceTreatmentOption<AppearanceLightingStrength>[] = [
  ["gentle", "Gentle"],
  ["subtle", "Subtle"],
  ["strong", "Strong"],
];

export const LIGHTING_DIRECTIONS: readonly AppearanceTreatmentOption<AppearanceLightingDirection>[] = [
  ["top", "Top"],
  ["upper-left", "Upper left"],
  ["upper-right", "Upper right"],
  ["left", "Left"],
  ["right", "Right"],
];
