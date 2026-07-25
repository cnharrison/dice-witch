export const APPEARANCE_TARGETS_V4 = Object.freeze([
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
  "percentile",
  "fudge",
  "other",
] as const);

export const POLYHEDRAL_FORMS_V4 = Object.freeze([
  "standard",
  "sharp",
  "crystal-cut",
  "hollow-cage",
] as const);

export const RENDER_FORMS_V4 = Object.freeze([
  ...POLYHEDRAL_FORMS_V4,
  "sphere",
] as const);

export const APPEARANCE_VARIATIONS_V3 = Object.freeze([
  "fixed",
  "curated",
  "wild",
] as const);

export const APPEARANCE_VARIATION_SCOPES_V3 = Object.freeze([
  "die",
  "group",
  "roll",
] as const);

export const APPEARANCE_RANDOMIZATION_POLICIES_V3 = Object.freeze([
  "full-spectrum-v1",
] as const);

export const APPEARANCE_FORM_POLICIES_V3 = Object.freeze([
  "material-default-v1",
] as const);

export const MATERIAL_FAMILIES_V4 = Object.freeze([
  "classic",
  "sharp-resin",
  "liquid-core",
  "gemstone",
  "glass",
  "stone",
  "metal",
  "hollow-metal",
  "wood",
  "fantasy",
] as const);

export const PATTERN_IDS_V4 = Object.freeze([
  "checkerboard",
  "dots",
  "stripes",
  "stars",
  "zigzag",
  "triangles",
  "honeycomb",
  "circuit",
  "crosshatch",
  "swirl",
] as const);

export const FONT_IDS_V4 = Object.freeze([
  "liberation-sans",
  "new-rocker",
  "stencil-ops",
  "creeping-horror",
  "special-elite",
  "luckiest-guy",
  "fontdiner-swanky",
  "syncopate",
] as const);

export const ENGRAVING_FINISHES_V4 = Object.freeze([
  "matte-ink",
  "enamel",
  "metallic",
  "luminous",
  "void",
] as const);

export const GRADIENT_SCOPES_V4 = Object.freeze([
  "repeated",
  "die-wide",
] as const);

export const LINEAR_DIRECTIONS_V4 = Object.freeze([
  "top-to-bottom",
  "upper-right-to-lower-left",
  "right-to-left",
  "lower-right-to-upper-left",
  "bottom-to-top",
  "lower-left-to-upper-right",
  "left-to-right",
  "upper-left-to-lower-right",
] as const);

export const LIGHTING_MODES_V4 = Object.freeze([
  "none",
  "facet",
  "directional",
  "combined",
] as const);

export const LIGHTING_STRENGTHS_V4 = Object.freeze([
  "gentle",
  "subtle",
  "strong",
] as const);

export const LIGHTING_DIRECTIONS_V4 = Object.freeze([
  "top",
  "upper-left",
  "upper-right",
  "left",
  "right",
] as const);

export const ICON_NAMES_V4 = Object.freeze([
  "trashcan",
  "explosion",
  "recycle",
  "chevronUp",
  "chevronDown",
  "target-success",
  "critical-success",
  "critical-failure",
  "penetrate",
  "unique",
  "blank",
] as const);

export const CLASSIC_TREATMENTS_V4 = Object.freeze([
  "solid",
  "gradient",
  "pattern",
] as const);
export const CLASSIC_OPACITIES_V4 = Object.freeze([
  "opaque",
  "translucent",
] as const);
export const CLASSIC_FINISHES_V4 = Object.freeze([
  "matte",
  "satin",
  "gloss",
] as const);

export const SHARP_RESIN_STYLES_V4 = Object.freeze([
  "clear",
  "smoke",
  "layered",
  "petri",
] as const);
export const RESIN_INCLUSIONS_V4 = Object.freeze([
  "none",
  "mica",
  "foil",
  "botanical",
  "mylar",
] as const);
export const RESIN_FINISHES_V4 = Object.freeze([
  "satin",
  "polished",
  "frosted",
] as const);

export const LIQUID_CORE_STYLES_V4 = Object.freeze([
  "vortex",
  "glitter-storm",
  "eye",
  "blood",
  "cosmic",
] as const);

export const GEMSTONE_STYLES_V4 = Object.freeze([
  "quartz",
  "jade",
  "obsidian",
  "malachite",
  "cats-eye",
  "labradorite",
] as const);
export const GEMSTONE_FINISHES_V4 = Object.freeze([
  "polished",
  "frosted",
  "raw-cut",
] as const);

export const GLASS_STYLES_V4 = Object.freeze([
  "clear",
  "colored",
  "frosted",
  "stained",
  "prismatic",
] as const);
export const GLASS_FINISHES_V4 = Object.freeze([
  "polished",
  "frosted",
  "etched",
] as const);

export const STONE_STYLES_V4 = Object.freeze([
  "marble",
  "granite",
  "sandstone",
  "volcanic",
  "bone",
  "ceramic",
] as const);
export const STONE_FINISHES_V4 = Object.freeze([
  "polished",
  "honed",
  "weathered",
] as const);

export const METALS_V4 = Object.freeze([
  "iron",
  "steel",
  "brass",
  "bronze",
  "copper",
  "silver",
  "gold",
] as const);
export const METAL_FINISHES_V4 = Object.freeze([
  "polished",
  "brushed",
  "hammered",
  "oxidized",
  "patinated",
  "enamel-inlaid",
] as const);

export const HOLLOW_METAL_CONSTRUCTIONS_V4 = Object.freeze([
  "filigree",
  "lattice",
  "cage",
] as const);

export const WOOD_STYLES_V4 = Object.freeze([
  "oak",
  "walnut",
  "ebony",
  "burl",
  "ash",
  "beech",
] as const);
export const WOOD_FINISHES_V4 = Object.freeze([
  "raw",
  "polished",
  "lacquered",
  "inlaid",
  "vine-carved",
] as const);

export const FANTASY_ESSENCES_V4 = Object.freeze([
  "ice",
  "void",
  "corruption",
  "arcane",
  "living-eye",
  "cosmic",
  "blood",
  "bone",
] as const);
export const FANTASY_FINISHES_V4 = Object.freeze([
  "subdued",
  "radiant",
  "fractured",
] as const);

export const TEXTURE_SCOPES_V4 = Object.freeze([
  "die-wide",
  "face-local",
] as const);

export const TEXTURE_GENERATOR_IDS_V4 = Object.freeze([
  "classic-v1",
  "sharp-resin-v1",
  "liquid-core-v1",
  "gemstone-v1",
  "glass-v1",
  "stone-v1",
  "metal-v1",
  "hollow-metal-v1",
  "wood-v1",
  "fantasy-v1",
] as const);

export const TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4 = Object.freeze({
  classic: "classic-v1",
  "sharp-resin": "sharp-resin-v1",
  "liquid-core": "liquid-core-v1",
  gemstone: "gemstone-v1",
  glass: "glass-v1",
  stone: "stone-v1",
  metal: "metal-v1",
  "hollow-metal": "hollow-metal-v1",
  wood: "wood-v1",
  fantasy: "fantasy-v1",
} as const);

export const CRITICAL_TREATMENTS_V4 = Object.freeze([
  "classic-glow",
  "internal-flare",
  "spectral-rim",
  "metal-edge",
  "engraving-burn",
  "inner-cage",
] as const);

export const CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4 = Object.freeze({
  classic: "classic-glow",
  "sharp-resin": "internal-flare",
  "liquid-core": "internal-flare",
  gemstone: "spectral-rim",
  glass: "spectral-rim",
  stone: "engraving-burn",
  metal: "metal-edge",
  "hollow-metal": "inner-cage",
  wood: "engraving-burn",
  fantasy: "internal-flare",
} as const);

export const RENDERER_REVISIONS_V4 = Object.freeze([
  "canvaskit-v4-r1",
  "canvaskit-v4-r2",
  "canvaskit-v4-r3",
  "canvaskit-v4-r4",
  "canvaskit-v4-r5",
  "canvaskit-v4-r6",
  "canvaskit-v4-r7",
  "canvaskit-v4-r8",
] as const);
