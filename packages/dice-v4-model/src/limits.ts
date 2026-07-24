export const MAX_APPEARANCE_DESIGNS_V3 = 10;
export const MAX_BUILTIN_APPEARANCE_STYLES_V3 = 128;
export const MAX_APPEARANCE_DESIGN_NAME_CHARACTERS_V3 = 50;
export const APPEARANCE_SELECTION_WEIGHT_RANGE_V3 = Object.freeze({
  minimum: 1,
  maximum: 1_000,
  step: 1,
} as const);
export const MAX_TOTAL_APPEARANCE_SELECTION_WEIGHT_V3 = 10_000;
export const APPEARANCE_PALETTE_COLOR_RANGE_V3 = Object.freeze({
  minimum: 2,
  maximum: 6,
} as const);
// Twenty-five worst-case material options leave bounded headroom for ten
// maximal designs, escaped names, assignments, and guild mode.
export const MAX_MATERIAL_SELECTION_OPTIONS_V3 = 25;
export const MAX_PROFILE_JSON_CHARACTERS_V3 = 65_536;

export const APPEARANCE_TEXTURE_SCALE_RANGE_V4 = Object.freeze({
  minimum: 25,
  maximum: 400,
  step: 1,
} as const);
export const APPEARANCE_PERCENTAGE_RANGE_V4 = Object.freeze({
  minimum: 0,
  maximum: 100,
  step: 1,
} as const);
