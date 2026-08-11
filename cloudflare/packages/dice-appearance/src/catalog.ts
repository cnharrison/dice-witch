import { canonicalJsonV4 } from "@dice-witch/dice-v4-model/canonical-json";
import type {
  AppearanceMaterialV4,
  AppearanceRecipeV3,
  AppearanceValidationCatalogV3,
  AppearanceSelection as AppearanceSelectionV3,
  FontIdV4,
  MaterialFamilyV4,
  PatternIdV4,
  PolyhedralFormV4,
  WeightedSelectionOption,
} from "@dice-witch/dice-v4-model";
import {
  isMaterialFormCompatibleV4,
  isPolyhedralFormImplementedForTargetV4,
} from "@dice-witch/dice-v4-model/compatibility";
import {
  APPEARANCE_PALETTE_COLOR_RANGE_V3,
  APPEARANCE_PERCENTAGE_RANGE_V4,
  APPEARANCE_SELECTION_WEIGHT_RANGE_V3,
  APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  MAX_APPEARANCE_DESIGN_NAME_CHARACTERS_V3,
  MAX_APPEARANCE_DESIGNS_V3,
  MAX_MATERIAL_SELECTION_OPTIONS_V3,
  MAX_PROFILE_JSON_CHARACTERS_V3,
  MAX_TOTAL_APPEARANCE_SELECTION_WEIGHT_V3,
} from "@dice-witch/dice-v4-model/limits";
import {
  APPEARANCE_TARGETS_V4,
  APPEARANCE_VARIATIONS_V3,
  APPEARANCE_VARIATION_SCOPES_V3,
  CLASSIC_FINISHES_V4,
  CLASSIC_OPACITIES_V4,
  CLASSIC_TREATMENTS_V4,
  ELEMENTAL_STYLES_V4,
  ENGRAVING_FINISHES_V4,
  EXPRESSIVE_RANDOM_FONT_IDS_V4,
  FANTASY_ESSENCES_V4,
  FANTASY_FINISHES_V4,
  GEMSTONE_FINISHES_V4,
  GEMSTONE_STYLES_V4,
  GLASS_FINISHES_V4,
  GLASS_STYLES_V4,
  GRADIENT_SCOPES_V4,
  HOLLOW_METAL_CONSTRUCTIONS_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_MODES_V4,
  LIGHTING_STRENGTHS_V4,
  LINEAR_DIRECTIONS_V4,
  LIQUID_CORE_STYLES_V4,
  MANUAL_ONLY_FONT_IDS_V4,
  MATERIAL_FAMILIES_V4,
  METALS_V4,
  METAL_FINISHES_V4,
  NEUTRAL_RANDOM_FONT_IDS_V4,
  PAINT_STYLES_V4,
  POLYHEDRAL_FORMS_V4,
  RESIN_FINISHES_V4,
  RESIN_INCLUSIONS_V4,
  SHARP_RESIN_STYLES_V4,
  STONE_FINISHES_V4,
  STONE_STYLES_V4,
  WOOD_FINISHES_V4,
  WOOD_STYLES_V4,
} from "@dice-witch/dice-v4-model/registries";
import type {
  AppearanceBuiltinStyleV1,
  AppearanceBuiltinStyleV2,
  AppearanceBuiltinStyleV3,
  AppearanceBuiltinRecipesV3,
  AppearanceCatalog,
  AppearanceFill,
  AppearanceLinearDirection,
  AppearancePublicCatalogV1,
  AppearancePublicCatalogV2,
  AppearancePublicCatalogV3,
  AppearanceCatalogOptionV3,
  AppearanceMaterialCatalogV3,
  AppearanceRecipeV1,
  AppearanceRecipeV2,
  AppearanceSelection,
  AppearanceFontSelection,
} from "./types";
import { migrateAppearanceRecipeV1 } from "./migrate";

export const CHAOTIC_APPEARANCE_STYLE_ID = "chaotic";
export const FEATURED_APPEARANCE_STYLE_IDS = [
  "dice-witch",
  "solid",
  "rainbow",
  "pride",
  "trans",
  "crimson-palette",
  "amber-palette",
  "verdant-palette",
  "azure-palette",
  "monochrome-palette",
  CHAOTIC_APPEARANCE_STYLE_ID,
] as const;
export const FEATURED_APPEARANCE_PATTERN_IDS = [
  "checkerboard",
  "dots",
  "stripes",
  "triangles",
  "crosshatch",
] as const;
export const APPROVED_COLLECTOR_STYLE_IDS_V3 = [
  "hex-appeal",
  "critical-mass",
  "glass-cannon",
  "heavy-metal",
  "hollow-victory",
  "grain-expectations",
  "elemental-lava-r33",
  "elemental-sand",
  "elemental-blue-sky-r33",
  "elemental-sunset-r33",
  "paint-splatter",
] as const;

const PATTERNS: AppearanceCatalogOptionV3<PatternIdV4>[] = [
  { id: "checkerboard", name: "Checkerboard" },
  { id: "dots", name: "Dots" },
  { id: "stripes", name: "Stripes" },
  { id: "stars", name: "Stars" },
  { id: "zigzag", name: "Zigzag" },
  { id: "triangles", name: "Triangles" },
  { id: "honeycomb", name: "Honeycomb" },
  { id: "circuit", name: "Circuit" },
  { id: "crosshatch", name: "Crosshatch" },
  { id: "swirl", name: "Swirl" },
];

const LEGACY_FONTS = [
  { id: "liberation-sans", name: "Liberation Sans" },
  { id: "new-rocker", name: "New Rocker" },
  { id: "stencil-ops", name: "Stencil Ops" },
  { id: "creeping-horror", name: "Creeping Horror" },
  { id: "special-elite", name: "Special Elite" },
  { id: "luckiest-guy", name: "Luckiest Guy" },
  { id: "fontdiner-swanky", name: "Fontdiner Swanky" },
  { id: "syncopate", name: "Syncopate" },
] as const satisfies readonly AppearanceCatalogOptionV3<FontIdV4>[];

const FONTS: readonly AppearanceCatalogOptionV3<FontIdV4>[] = [
  ...LEGACY_FONTS,
  { id: "source-sans-3", name: "Source Sans 3" },
  { id: "cinzel", name: "Cinzel" },
  { id: "barlow-condensed", name: "Barlow Condensed" },
  { id: "zilla-slab", name: "Zilla Slab" },
  { id: "space-grotesk", name: "Space Grotesk" },
  { id: "fraunces", name: "Fraunces" },
  { id: "bricolage-grotesque", name: "Bricolage Grotesque" },
  { id: "alcarin-tengwar", name: "Alcarin Tengwar" },
];

function catalogOptions<Id extends string>(
  ids: readonly Id[],
  names: Readonly<Record<Id, string>>,
): AppearanceCatalogOptionV3<Id>[] {
  return ids.map((id) => ({ id, name: names[id] }));
}

const TARGETS_V3 = catalogOptions(APPEARANCE_TARGETS_V4, {
  d4: "d4",
  d6: "d6",
  d8: "d8",
  d10: "d10",
  d12: "d12",
  d20: "d20",
  percentile: "Percentile",
  fudge: "Fudge",
  other: "Other",
});
const PATTERNS_V3 = PATTERNS;
const FONTS_V3 = FONTS;
const ENGRAVING_FINISHES_CATALOG_V3 = catalogOptions(
  ENGRAVING_FINISHES_V4,
  {
    "matte-ink": "Matte ink",
    enamel: "Enamel",
    metallic: "Metallic",
    luminous: "Luminous",
    void: "Void",
  },
);
const VARIATIONS_V3 = catalogOptions(APPEARANCE_VARIATIONS_V3, {
  fixed: "Fixed",
  curated: "Curated",
  wild: "Wild",
});
const VARIATION_SCOPES_V3 = catalogOptions(APPEARANCE_VARIATION_SCOPES_V3, {
  die: "Each die",
  group: "Each group",
  roll: "Whole roll",
});
const COLOR_MODES_V3 = catalogOptions(
  [
    "solid",
    "tonal",
    "random",
    "palette",
    "random-pair",
    "vivid-random-pair",
  ] as const,
  {
    solid: "One color",
    tonal: "One color + shade",
    random: "Chosen color + random",
    palette: "Choose colors",
    "random-pair": "Two random colors",
    "vivid-random-pair": "Two bright random colors",
  },
);
const SELECTION_MODES_V3 = catalogOptions(
  ["fixed", "allowlist", "weighted"] as const,
  {
    fixed: "Fixed",
    allowlist: "Allowed values",
    weighted: "Weighted values",
  },
);
const GRADIENT_SCOPES_CATALOG_V3 = catalogOptions(GRADIENT_SCOPES_V4, {
  repeated: "Repeated per side",
  "die-wide": "Whole die",
});
const LINEAR_DIRECTIONS_CATALOG_V3 = catalogOptions(LINEAR_DIRECTIONS_V4, {
  "top-to-bottom": "Top to bottom",
  "upper-right-to-lower-left": "Upper right to lower left",
  "right-to-left": "Right to left",
  "lower-right-to-upper-left": "Lower right to upper left",
  "bottom-to-top": "Bottom to top",
  "lower-left-to-upper-right": "Lower left to upper right",
  "left-to-right": "Left to right",
  "upper-left-to-lower-right": "Upper left to lower right",
});
const LIGHTING_MODES_CATALOG_V3 = catalogOptions(LIGHTING_MODES_V4, {
  none: "None",
  facet: "Facet",
  directional: "Directional",
  combined: "Combined",
});
const LIGHTING_STRENGTHS_CATALOG_V3 = catalogOptions(LIGHTING_STRENGTHS_V4, {
  gentle: "Gentle",
  subtle: "Subtle",
  strong: "Strong",
});
const LIGHTING_DIRECTIONS_CATALOG_V3 = catalogOptions(
  LIGHTING_DIRECTIONS_V4,
  {
    top: "Top",
    "upper-left": "Upper left",
    "upper-right": "Upper right",
    left: "Left",
    right: "Right",
  },
);

const CLASSIC_TREATMENTS_CATALOG_V3 = catalogOptions(CLASSIC_TREATMENTS_V4, {
  solid: "Solid",
  gradient: "Gradient",
  pattern: "Pattern",
});
const CLASSIC_OPACITIES_CATALOG_V3 = catalogOptions(CLASSIC_OPACITIES_V4, {
  opaque: "Opaque",
  translucent: "Translucent",
});
const CLASSIC_FINISHES_CATALOG_V3 = catalogOptions(CLASSIC_FINISHES_V4, {
  matte: "Matte",
  satin: "Satin",
  gloss: "Gloss",
});
const SHARP_RESIN_STYLES_CATALOG_V3 = catalogOptions(
  SHARP_RESIN_STYLES_V4,
  {
    clear: "Clear",
    smoke: "Smoke",
    layered: "Layered",
    petri: "Petri",
  },
);
const RESIN_INCLUSIONS_CATALOG_V3 = catalogOptions(RESIN_INCLUSIONS_V4, {
  none: "None",
  mica: "Mica",
  foil: "Foil",
  botanical: "Botanical",
  mylar: "Mylar",
});
const RESIN_FINISHES_CATALOG_V3 = catalogOptions(RESIN_FINISHES_V4, {
  satin: "Satin",
  polished: "Polished",
  frosted: "Frosted",
});
const LIQUID_CORE_STYLES_CATALOG_V3 = catalogOptions(
  LIQUID_CORE_STYLES_V4,
  {
    vortex: "Vortex",
    "glitter-storm": "Glitter storm",
    eye: "Eye",
    blood: "Blood",
    cosmic: "Cosmic",
  },
);
const GEMSTONE_STYLES_CATALOG_V3 = catalogOptions(GEMSTONE_STYLES_V4, {
  quartz: "Quartz",
  jade: "Jade",
  obsidian: "Obsidian",
  malachite: "Malachite",
  "cats-eye": "Cat’s eye",
  labradorite: "Labradorite",
});
const GEMSTONE_FINISHES_CATALOG_V3 = catalogOptions(GEMSTONE_FINISHES_V4, {
  polished: "Polished",
  frosted: "Frosted",
  "raw-cut": "Raw cut",
});
const GLASS_STYLES_CATALOG_V3 = catalogOptions(GLASS_STYLES_V4, {
  clear: "Clear",
  colored: "Colored",
  frosted: "Frosted",
  stained: "Stained",
  prismatic: "Prismatic",
});
const GLASS_FINISHES_CATALOG_V3 = catalogOptions(GLASS_FINISHES_V4, {
  polished: "Polished",
  frosted: "Frosted",
  etched: "Etched",
});
const STONE_STYLES_CATALOG_V3 = catalogOptions(STONE_STYLES_V4, {
  marble: "Marble",
  granite: "Granite",
  sandstone: "Sandstone",
  volcanic: "Volcanic",
  bone: "Bone",
  ceramic: "Ceramic",
});
const STONE_FINISHES_CATALOG_V3 = catalogOptions(STONE_FINISHES_V4, {
  polished: "Polished",
  honed: "Honed",
  weathered: "Weathered",
});
const METALS_CATALOG_V3 = catalogOptions(METALS_V4, {
  iron: "Iron",
  steel: "Steel",
  brass: "Brass",
  bronze: "Bronze",
  copper: "Copper",
  silver: "Silver",
  gold: "Gold",
});
const METAL_FINISHES_CATALOG_V3 = catalogOptions(METAL_FINISHES_V4, {
  polished: "Polished",
  brushed: "Brushed",
  hammered: "Hammered",
  oxidized: "Oxidized",
  patinated: "Patinated",
  "enamel-inlaid": "Enamel inlaid",
});
const HOLLOW_METAL_CONSTRUCTIONS_CATALOG_V3 = catalogOptions(
  HOLLOW_METAL_CONSTRUCTIONS_V4,
  {
    filigree: "Filigree",
    lattice: "Lattice",
    cage: "Cage",
  },
);
const WOOD_STYLES_CATALOG_V3 = catalogOptions(WOOD_STYLES_V4, {
  oak: "Oak",
  walnut: "Walnut",
  ebony: "Ebony",
  burl: "Burl",
  ash: "Ash",
  beech: "Beech",
});
const WOOD_FINISHES_CATALOG_V3 = catalogOptions(WOOD_FINISHES_V4, {
  raw: "Raw",
  polished: "Polished",
  lacquered: "Lacquered",
  inlaid: "Inlaid",
  "vine-carved": "Vine carved",
});
const FANTASY_ESSENCES_CATALOG_V3 = catalogOptions(FANTASY_ESSENCES_V4, {
  ice: "Ice",
  void: "Void",
  corruption: "Corruption",
  arcane: "Arcane",
  "living-eye": "Living eye",
  cosmic: "Cosmic",
  blood: "Blood",
  bone: "Bone",
});
const FANTASY_FINISHES_CATALOG_V3 = catalogOptions(FANTASY_FINISHES_V4, {
  subdued: "Subdued",
  radiant: "Radiant",
  fractured: "Fractured",
});
const ELEMENTAL_STYLES_CATALOG_V3 = catalogOptions(ELEMENTAL_STYLES_V4, {
  lava: "Lava",
  sand: "Sand",
  "blue-sky": "Blue Sky",
  sunset: "Sunset",
});
const PAINT_STYLES_CATALOG_V3 = catalogOptions(PAINT_STYLES_V4, {
  splatter: "Splatter",
});
const WIND_DIRECTION_RANGE_V3 = Object.freeze({
  minimum: -45,
  maximum: 45,
  step: 1,
} as const);

const ELEMENTAL_MATERIAL_DEFAULTS_V3 = [
  {
    family: "elemental",
    style: "lava",
    fissureDensity: 30,
    glowIntensity: 90,
    textureScale: 340,
  },
  {
    family: "elemental",
    style: "sand",
    grainSize: 78,
    windDirection: -10,
    textureScale: 150,
  },
  {
    family: "elemental",
    style: "blue-sky",
    cloudCover: 58,
    horizonHeight: 48,
    textureScale: 25,
  },
  {
    family: "elemental",
    style: "sunset",
    cloudCover: 68,
    horizonHeight: 62,
    textureScale: 25,
  },
] as const satisfies readonly Extract<
  AppearanceMaterialV4,
  { family: "elemental" }
>[];
const R32_ELEMENTAL_MATERIAL_DEFAULTS_V3 = [
  {
    family: "elemental",
    style: "lava",
    fissureDensity: 65,
    glowIntensity: 78,
    textureScale: 110,
  },
  ELEMENTAL_MATERIAL_DEFAULTS_V3[1],
  {
    family: "elemental",
    style: "blue-sky",
    cloudCover: 58,
    horizonHeight: 48,
    textureScale: 240,
  },
  {
    family: "elemental",
    style: "sunset",
    cloudCover: 68,
    horizonHeight: 62,
    textureScale: 255,
  },
] as const satisfies readonly Extract<
  AppearanceMaterialV4,
  { family: "elemental" }
>[];
const PAINT_MATERIAL_DEFAULTS_V3 = [
  {
    family: "paint",
    style: "splatter",
    dropDensity: 64,
    streakLength: 56,
    textureScale: 130,
  },
] as const satisfies readonly Extract<
  AppearanceMaterialV4,
  { family: "paint" }
>[];

const DEFAULT_MATERIALS_V3 = {
  classic: {
    family: "classic",
    treatment: "gradient",
    opacity: "opaque",
    finish: "satin",
    textureScale: 100,
  },
  "sharp-resin": {
    family: "sharp-resin",
    style: "clear",
    inclusion: "none",
    clarity: 84,
    inclusionDensity: 24,
    finish: "polished",
    textureScale: 100,
  },
  "liquid-core": {
    family: "liquid-core",
    core: "vortex",
    clarity: 78,
    particleDensity: 42,
    finish: "polished",
    textureScale: 100,
  },
  gemstone: {
    family: "gemstone",
    stone: "quartz",
    veinDensity: 36,
    finish: "polished",
    textureScale: 100,
  },
  glass: {
    family: "glass",
    style: "prismatic",
    clarity: 88,
    finish: "polished",
    textureScale: 100,
  },
  stone: {
    family: "stone",
    stone: "marble",
    grainDensity: 36,
    finish: "honed",
    textureScale: 100,
  },
  metal: {
    family: "metal",
    metal: "steel",
    finish: "brushed",
    patinaStrength: 8,
    textureScale: 100,
  },
  "hollow-metal": {
    family: "hollow-metal",
    construction: "filigree",
    metal: "brass",
    finish: "polished",
    openness: 58,
    textureScale: 100,
  },
  wood: {
    family: "wood",
    wood: "walnut",
    finish: "polished",
    grainDensity: 64,
    textureScale: 100,
  },
  fantasy: {
    family: "fantasy",
    essence: "arcane",
    intensity: 60,
    finish: "radiant",
    textureScale: 100,
  },
  elemental: ELEMENTAL_MATERIAL_DEFAULTS_V3[0],
  paint: PAINT_MATERIAL_DEFAULTS_V3[0],
} as const satisfies {
  readonly [Family in MaterialFamilyV4]: Extract<
    AppearanceMaterialV4,
    { family: Family }
  >;
};

const MATERIALS_V3 = [
  {
    family: "classic",
    name: "Classic",
    defaultValue: DEFAULT_MATERIALS_V3.classic,
    treatments: CLASSIC_TREATMENTS_CATALOG_V3,
    opacities: CLASSIC_OPACITIES_CATALOG_V3,
    finishes: CLASSIC_FINISHES_CATALOG_V3,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "sharp-resin",
    name: "Sharp resin",
    defaultValue: DEFAULT_MATERIALS_V3["sharp-resin"],
    styles: SHARP_RESIN_STYLES_CATALOG_V3,
    inclusions: RESIN_INCLUSIONS_CATALOG_V3,
    finishes: RESIN_FINISHES_CATALOG_V3,
    clarity: APPEARANCE_PERCENTAGE_RANGE_V4,
    inclusionDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "liquid-core",
    name: "Liquid core",
    defaultValue: DEFAULT_MATERIALS_V3["liquid-core"],
    cores: LIQUID_CORE_STYLES_CATALOG_V3,
    finishes: RESIN_FINISHES_CATALOG_V3,
    clarity: APPEARANCE_PERCENTAGE_RANGE_V4,
    particleDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "gemstone",
    name: "Gemstone",
    defaultValue: DEFAULT_MATERIALS_V3.gemstone,
    stones: GEMSTONE_STYLES_CATALOG_V3,
    finishes: GEMSTONE_FINISHES_CATALOG_V3,
    veinDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "glass",
    name: "Glass",
    defaultValue: DEFAULT_MATERIALS_V3.glass,
    styles: GLASS_STYLES_CATALOG_V3,
    finishes: GLASS_FINISHES_CATALOG_V3,
    clarity: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "stone",
    name: "Stone",
    defaultValue: DEFAULT_MATERIALS_V3.stone,
    stones: STONE_STYLES_CATALOG_V3,
    finishes: STONE_FINISHES_CATALOG_V3,
    grainDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "metal",
    name: "Metal",
    defaultValue: DEFAULT_MATERIALS_V3.metal,
    metals: METALS_CATALOG_V3,
    finishes: METAL_FINISHES_CATALOG_V3,
    patinaStrength: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "hollow-metal",
    name: "Hollow metal",
    defaultValue: DEFAULT_MATERIALS_V3["hollow-metal"],
    constructions: HOLLOW_METAL_CONSTRUCTIONS_CATALOG_V3,
    metals: METALS_CATALOG_V3,
    finishes: METAL_FINISHES_CATALOG_V3,
    openness: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "wood",
    name: "Wood",
    defaultValue: DEFAULT_MATERIALS_V3.wood,
    woods: WOOD_STYLES_CATALOG_V3,
    finishes: WOOD_FINISHES_CATALOG_V3,
    grainDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "fantasy",
    name: "Fantasy",
    defaultValue: DEFAULT_MATERIALS_V3.fantasy,
    essences: FANTASY_ESSENCES_CATALOG_V3,
    finishes: FANTASY_FINISHES_CATALOG_V3,
    intensity: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "elemental",
    name: "Elemental",
    defaultValue: DEFAULT_MATERIALS_V3.elemental,
    styles: ELEMENTAL_STYLES_CATALOG_V3,
    styleDefaults: ELEMENTAL_MATERIAL_DEFAULTS_V3,
    fissureDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
    glowIntensity: APPEARANCE_PERCENTAGE_RANGE_V4,
    grainSize: APPEARANCE_PERCENTAGE_RANGE_V4,
    windDirection: WIND_DIRECTION_RANGE_V3,
    cloudCover: APPEARANCE_PERCENTAGE_RANGE_V4,
    horizonHeight: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
  {
    family: "paint",
    name: "Paint",
    defaultValue: DEFAULT_MATERIALS_V3.paint,
    styles: PAINT_STYLES_CATALOG_V3,
    styleDefaults: PAINT_MATERIAL_DEFAULTS_V3,
    dropDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
    streakLength: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  },
] as const satisfies readonly AppearanceMaterialCatalogV3[];

const POLYHEDRAL_TARGETS_V3 = APPEARANCE_TARGETS_V4.filter(
  (target) => target !== "other",
);
const FORM_NAMES_V3 = {
  standard: "Standard",
  sharp: "Sharp",
  "crystal-cut": "Crystal cut",
  "hollow-cage": "Hollow cage",
  sphere: "Sphere",
} as const;
const FORMS_V3 = [
  ...POLYHEDRAL_FORMS_V4.map((form) => ({
    id: form,
    name: FORM_NAMES_V3[form],
    targets: POLYHEDRAL_TARGETS_V3.filter((target) =>
      isPolyhedralFormImplementedForTargetV4(
        target,
        form,
        "canvaskit-v4-r32",
      ),
    ),
    materialFamilies: MATERIAL_FAMILIES_V4.filter((family) =>
      isMaterialFormCompatibleV4(family, form),
    ),
  })),
  {
    id: "sphere",
    name: FORM_NAMES_V3.sphere,
    targets: ["other"],
    materialFamilies: [...MATERIAL_FAMILIES_V4],
  },
] as const;

const SPECTRUM = [
  "#d7263d",
  "#f46036",
  "#f9c80e",
  "#2e933c",
  "#3366cc",
  "#8a4fff",
];
const TRANS_COLORS = ["#5bcffa", "#f5abb9", "#ffffff"];
const TRANS_GRADIENT_COLORS = [
  "#5bcffa",
  "#f5abb9",
  "#ffffff",
  "#f5abb9",
  "#5bcffa",
];

const PALETTES = [
  {
    id: "crimson-palette",
    name: "Crimson",
    colors: ["#6f1d1b", "#bb2d3b", "#e85d75", "#ffb3c1"],
  },
  {
    id: "amber-palette",
    name: "Amber",
    colors: ["#7f4f24", "#b86b1b", "#e09f3e", "#ffd166"],
  },
  {
    id: "citrine-palette",
    name: "Citrine",
    colors: ["#6b5d00", "#a68a00", "#d4b800", "#ffe45e"],
  },
  {
    id: "verdant-palette",
    name: "Verdant",
    colors: ["#174c2f", "#2d6a4f", "#52b788", "#b7e4c7"],
  },
  {
    id: "teal-palette",
    name: "Teal",
    colors: ["#005f5f", "#008b8b", "#32b8b8", "#a8dadc"],
  },
  {
    id: "azure-palette",
    name: "Azure",
    colors: ["#003566", "#0077b6", "#48cae4", "#caf0f8"],
  },
  {
    id: "indigo-palette",
    name: "Indigo",
    colors: ["#312e81", "#4338ca", "#818cf8", "#c7d2fe"],
  },
  {
    id: "violet-palette",
    name: "Violet",
    colors: ["#581c87", "#7e22ce", "#c084fc", "#e9d5ff"],
  },
  {
    id: "rose-palette",
    name: "Rose",
    colors: ["#831843", "#be185d", "#f472b6", "#fbcfe8"],
  },
  {
    id: "earth-palette",
    name: "Earth",
    colors: ["#3d2b1f", "#6f4e37", "#a67c52", "#d9b99b"],
  },
  {
    id: "monochrome-palette",
    name: "Monochrome",
    colors: ["#1f2933", "#52606d", "#9aa5b1", "#e4e7eb"],
  },
  {
    id: "spectrum-palette",
    name: "Spectrum",
    colors: SPECTRUM,
  },
];

function proceduralFill(): AppearanceRecipeV1["fill"] {
  return {
    mode: "weighted",
    options: [
      { value: { type: "gradient" }, weight: 600 },
      ...PATTERNS.map(({ id }) => ({
        value: { type: "pattern" as const, patternId: id },
        weight: 40,
      })),
    ],
  };
}

function proceduralFont(): AppearanceRecipeV1["font"] {
  return {
    mode: "weighted",
    options: LEGACY_FONTS.map(({ id }) => ({
      fontId: id,
      weight: id === "liberation-sans" ? 490 : 30,
    })),
  };
}

function paletteRecipe(
  colors: string[],
  fill: AppearanceRecipeV1["fill"],
  variation: AppearanceRecipeV1["variation"] = "wild",
): AppearanceRecipeV1 {
  return {
    version: 1,
    variation,
    varyBy: "die",
    colors: { mode: "palette", colors: [...colors] },
    fill,
    font: proceduralFont(),
  };
}

function style(
  id: string,
  name: string,
  description: string,
  recipe: AppearanceRecipeV1,
): AppearanceBuiltinStyleV1 {
  return { id, name, description, recipe };
}

const chaotic = style(
  CHAOTIC_APPEARANCE_STYLE_ID,
  "Chaotic",
  "Independent colors, surfaces, and typography for every die.",
  paletteRecipe(SPECTRUM, proceduralFill()),
);

const patternStyles = PATTERNS.map((pattern) =>
  style(
    `${pattern.id}-wild`,
    `${pattern.name} Wild`,
    `${pattern.name} with independently varying colors and typography.`,
    paletteRecipe(SPECTRUM, {
      mode: "fixed",
      value: { type: "pattern", patternId: pattern.id },
    }),
  ),
);

const paletteStyles = PALETTES.map((palette) =>
  style(
    palette.id,
    palette.name,
    `${palette.name} colors with procedurally selected surfaces and typography.`,
    paletteRecipe(palette.colors, proceduralFill(), "curated"),
  ),
);

const surfaceStyles = [
  style(
    "solid-spectrum",
    "Solid Spectrum",
    "Independent spectrum colors on solid surfaces.",
    paletteRecipe(SPECTRUM, { mode: "fixed", value: { type: "solid" } }),
  ),
  style(
    "gradient-spectrum",
    "Gradient Spectrum",
    "Independent spectrum colors on gradient surfaces.",
    paletteRecipe(SPECTRUM, { mode: "fixed", value: { type: "gradient" } }),
  ),
  style(
    "tonal-shift",
    "Tonal Shift",
    "A procedural lighter or darker partner for one base color.",
    {
      version: 1,
      variation: "curated",
      varyBy: "die",
      colors: { mode: "tonal", primary: "#6f42c1" },
      fill: proceduralFill(),
      font: proceduralFont(),
    },
  ),
];

const featuredStyles = [
  style(
    "dice-witch",
    "Dice Witch",
    "The original hot-pink Dice Witch look with dark New Rocker ink.",
    {
      version: 1,
      variation: "fixed",
      varyBy: "die",
      colors: { mode: "tonal", primary: "#ff00ff" },
      fill: { mode: "fixed", value: { type: "solid" } },
      font: { mode: "fixed", fontId: "new-rocker" },
    },
  ),
  style(
    "pride",
    "Pride",
    "An ordered six-color Pride gradient.",
    {
      version: 1,
      variation: "fixed",
      varyBy: "die",
      colors: { mode: "palette", colors: [...SPECTRUM] },
      fill: { mode: "fixed", value: { type: "gradient" } },
      font: { mode: "fixed", fontId: "new-rocker" },
    },
  ),
  style(
    "trans",
    "Trans",
    "An ordered blue, pink, and white Trans gradient.",
    {
      version: 1,
      variation: "fixed",
      varyBy: "die",
      colors: { mode: "palette", colors: [...TRANS_COLORS] },
      fill: { mode: "fixed", value: { type: "gradient" } },
      font: { mode: "fixed", fontId: "new-rocker" },
    },
  ),
];

const publicStylesV1 = [
  chaotic,
  ...patternStyles,
  ...paletteStyles,
  ...surfaceStyles,
];
const styles = [...publicStylesV1, ...featuredStyles];

function nativeRecipe(recipe: AppearanceRecipeV1): AppearanceRecipeV2 {
  return {
    ...migrateAppearanceRecipeV1(recipe),
    compatibility: "native-v2",
    gradient: {
      colorSource: "full-palette",
      scope: { mode: "fixed", value: "die-wide" },
      direction: {
        mode: "fixed",
        value: "upper-left-to-lower-right",
      },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

function randomFillV2(): AppearanceRecipeV2["fill"] {
  return {
    mode: "weighted",
    options: [
      { value: { type: "gradient" }, weight: 600 },
      ...FEATURED_APPEARANCE_PATTERN_IDS.map((patternId) => ({
        value: { type: "pattern" as const, patternId },
        weight: 80,
      })),
    ],
  };
}

function topToBottomGradient(
  recipe: AppearanceRecipeV2,
): AppearanceRecipeV2 {
  return {
    ...recipe,
    gradient: {
      ...recipe.gradient,
      direction: { mode: "fixed", value: "top-to-bottom" },
    },
  };
}

function fixedThemeRecipe(
  colors: string[],
  fill: AppearanceFill,
  fontId: string,
  direction: AppearanceLinearDirection = "upper-left-to-lower-right",
): AppearanceRecipeV2 {
  return {
    version: 2,
    compatibility: "native-v2",
    variation: "fixed",
    varyBy: "die",
    colors: { mode: "palette", colors },
    fill: { mode: "fixed", value: fill },
    font: { mode: "fixed", fontId },
    gradient: {
      colorSource: "full-palette",
      scope: { mode: "fixed", value: "die-wide" },
      direction: { mode: "fixed", value: direction },
    },
    lighting: {
      mode: { mode: "fixed", value: "none" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

const fixedThemeStylesV2: AppearanceBuiltinStyleV2[] = [
  {
    id: "crimson-palette",
    name: "Ember",
    description: "A fixed deep-red and orange whole-die gradient.",
    recipe: fixedThemeRecipe(
      ["#4a0b0b", "#c62828", "#ff7a1a"],
      { type: "gradient" },
      "special-elite",
      "top-to-bottom",
    ),
  },
  {
    id: "amber-palette",
    name: "Gold",
    description: "A fixed burnished-gold solid material.",
    recipe: fixedThemeRecipe(
      ["#d6a514", "#fff0a6"],
      { type: "solid" },
      "stencil-ops",
    ),
  },
  {
    id: "verdant-palette",
    name: "Verdant",
    description: "A fixed deep-green Crosshatch material.",
    recipe: fixedThemeRecipe(
      ["#0b3d2e", "#6ecb63"],
      { type: "pattern", patternId: "crosshatch" },
      "liberation-sans",
    ),
  },
  {
    id: "azure-palette",
    name: "Ocean",
    description: "A fixed navy, blue, and cyan whole-die gradient.",
    recipe: fixedThemeRecipe(
      ["#041b3d", "#006da8", "#34d1bf"],
      { type: "gradient" },
      "syncopate",
    ),
  },
  {
    id: "monochrome-palette",
    name: "Monochrome",
    description: "A fixed charcoal and near-white Checkerboard material.",
    recipe: fixedThemeRecipe(
      ["#20242a", "#edf2f7"],
      { type: "pattern", patternId: "checkerboard" },
      "liberation-sans",
    ),
  },
];
const fixedThemeStylesV2ById = new Map(
  fixedThemeStylesV2.map((style) => [style.id, style]),
);

const stylesV2: AppearanceBuiltinStyleV2[] = styles.map(
  ({ id, name, description, recipe }) => {
    const fixedTheme = fixedThemeStylesV2ById.get(id);
    if (fixedTheme !== undefined) return fixedTheme;

    let native = nativeRecipe(recipe);
    if (id === CHAOTIC_APPEARANCE_STYLE_ID) {
      native = {
        ...native,
        colors: { mode: "vivid-random-pair" },
        fill: randomFillV2(),
      };
    } else if (id === "dice-witch") {
      native = {
        ...native,
        lighting: {
          ...native.lighting,
          mode: { mode: "fixed", value: "none" },
        },
      };
    } else if (id === "pride") {
      native = topToBottomGradient({
        ...native,
        font: { mode: "fixed", fontId: "liberation-sans" },
      });
    } else if (id === "trans") {
      native = topToBottomGradient({
        ...native,
        colors: { mode: "palette", colors: [...TRANS_GRADIENT_COLORS] },
        font: { mode: "fixed", fontId: "liberation-sans" },
        lighting: {
          ...native.lighting,
          mode: { mode: "fixed", value: "none" },
        },
      });
    }
    return {
      id,
      name: id === CHAOTIC_APPEARANCE_STYLE_ID ? "Random" : name,
      description:
        id === CHAOTIC_APPEARANCE_STYLE_ID
          ? "Independent random color pairs, surfaces, and typography for every die."
          : description,
      recipe: native,
    };
  },
);

function selectionV3<Input, Output>(
  selection: AppearanceSelection<Input>,
  transform: (value: Input) => Output,
): AppearanceSelectionV3<Output> {
  if (selection.mode === "fixed") {
    return { mode: "fixed", value: transform(selection.value) };
  }
  if (selection.mode === "allowlist") {
    return { mode: "allowlist", values: selection.values.map(transform) };
  }
  return {
    mode: "weighted",
    options: selection.options.map(({ value, weight }) => ({
      value: transform(value),
      weight,
    })),
  };
}

function fontIdV3(value: string): FontIdV4 {
  if (!FONTS.some(({ id }) => id === value)) {
    throw new Error(`Built-in appearance font ${value} is required`);
  }
  return value as FontIdV4;
}

function patternIdV3(value: string): PatternIdV4 {
  if (!PATTERNS.some(({ id }) => id === value)) {
    throw new Error(`Built-in appearance pattern ${value} is required`);
  }
  return value as PatternIdV4;
}

function fontSelectionV3(
  selection: AppearanceFontSelection,
): AppearanceSelectionV3<FontIdV4> {
  if (selection.mode === "fixed") {
    return { mode: "fixed", value: fontIdV3(selection.fontId) };
  }
  if (selection.mode === "allowlist") {
    return { mode: "allowlist", values: selection.fontIds.map(fontIdV3) };
  }
  return {
    mode: "weighted",
    options: selection.options.map(({ fontId, weight }) => ({
      value: fontIdV3(fontId),
      weight,
    })),
  };
}

function classicMaterialV3(fill: AppearanceFill): AppearanceMaterialV4 {
  const shared = {
    family: "classic" as const,
    opacity: "opaque" as const,
    finish: "satin" as const,
    textureScale: 100,
  };
  return fill.type === "pattern"
    ? {
        ...shared,
        treatment: "pattern",
        patternId: patternIdV3(fill.patternId),
      }
    : { ...shared, treatment: fill.type };
}

function colorsV3(recipe: AppearanceRecipeV2): AppearanceRecipeV3["colors"] {
  return recipe.colors.mode === "palette"
    ? { mode: "palette", colors: [...recipe.colors.colors] }
    : { ...recipe.colors };
}

function classicRecipeV3(recipe: AppearanceRecipeV2): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: recipe.variation,
    varyBy: recipe.varyBy,
    colors: colorsV3(recipe),
    material: selectionV3(recipe.fill, classicMaterialV3),
    form: {
      polyhedral: { mode: "fixed", value: "standard" },
      other: "sphere",
    },
    font: fontSelectionV3(recipe.font),
    engraving: { mode: "fixed", value: "matte-ink" },
    gradient: {
      scope: selectionV3(recipe.gradient.scope, (value) => value),
      direction: selectionV3(recipe.gradient.direction, (value) => value),
    },
    lighting: {
      mode: selectionV3(recipe.lighting.mode, (value) => value),
      strength: selectionV3(recipe.lighting.strength, (value) => value),
      direction: selectionV3(recipe.lighting.direction, (value) => value),
    },
  };
}

function fixedCollectorRecipeV3(
  material: AppearanceMaterialV4,
  colors: readonly [string, string, ...string[]],
): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "fixed",
    varyBy: "die",
    colors: { mode: "palette", colors: [...colors] },
    material: { mode: "fixed", value: material },
    form: {
      polyhedral: { mode: "fixed", value: "standard" },
      other: "sphere",
    },
    font: { mode: "fixed", value: "liberation-sans" },
    engraving: { mode: "fixed", value: "matte-ink" },
    gradient: {
      scope: { mode: "fixed", value: "die-wide" },
      direction: { mode: "fixed", value: "upper-left-to-lower-right" },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

function withPolyhedralFormV3(
  recipe: AppearanceRecipeV3,
  value: PolyhedralFormV4,
): AppearanceRecipeV3 {
  return {
    ...recipe,
    form: {
      ...recipe.form,
      polyhedral: { mode: "fixed", value },
    },
  };
}

function simpleSolidRecipeV3(
  colors: AppearanceRecipeV3["colors"],
  finish: "satin" | "gloss",
  randomization?: AppearanceRecipeV3["randomization"],
): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: randomization === undefined ? "fixed" : "wild",
    varyBy: "die",
    ...(randomization === undefined ? {} : { randomization }),
    colors,
    material: {
      mode: "fixed",
      value: {
        family: "classic",
        treatment: "solid",
        opacity: "opaque",
        finish,
        textureScale: 100,
      },
    },
    form: {
      polyhedral: { mode: "fixed", value: "standard" },
      other: "sphere",
    },
    font: { mode: "fixed", value: "liberation-sans" },
    engraving: { mode: "fixed", value: "matte-ink" },
    gradient: {
      scope: { mode: "fixed", value: "die-wide" },
      direction: { mode: "fixed", value: "upper-left-to-lower-right" },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

const solidRecipeV3 = simpleSolidRecipeV3(
  { mode: "solid", primary: "#d2042d" },
  "satin",
);
const rainbowRecipeV3 = simpleSolidRecipeV3(
  { mode: "palette", colors: [...SPECTRUM] },
  "gloss",
  "one-palette-color-v1",
);
const diceWitchAltRecipeV3: AppearanceRecipeV3 = {
  version: 3,
  variation: "fixed",
  varyBy: "die",
  colors: { mode: "tonal", primary: "#ff00ff" },
  material: {
    mode: "fixed",
    value: {
      family: "sharp-resin",
      style: "clear",
      inclusion: "mylar",
      clarity: 84,
      inclusionDensity: 24,
      finish: "polished",
      textureScale: 100,
    },
  },
  form: {
    policy: "material-default-v1",
    polyhedral: { mode: "fixed", value: "standard" },
    other: "sphere",
  },
  font: { mode: "fixed", value: "new-rocker" },
  engraving: { mode: "fixed", value: "luminous" },
  gradient: {
    scope: { mode: "fixed", value: "die-wide" },
    direction: {
      mode: "weighted",
      options: LINEAR_DIRECTIONS_V4.map((value) => ({
        value,
        weight: value.includes("upper-") || value.includes("lower-") ? 2 : 1,
      })),
    },
  },
  lighting: {
    mode: { mode: "fixed", value: "combined" },
    strength: { mode: "fixed", value: "gentle" },
    direction: { mode: "fixed", value: "upper-left" },
  },
};

const hexAppealRecipeV3 = fixedCollectorRecipeV3(
  {
    family: "sharp-resin",
    style: "clear",
    inclusion: "foil",
    clarity: 84,
    inclusionDensity: 34,
    finish: "polished",
    textureScale: 100,
  },
  ["#170022", "#7b19b8", "#04c9df", "#f3d36a"],
);
const criticalMassRecipeV3 = fixedCollectorRecipeV3(
  {
    family: "liquid-core",
    core: "vortex",
    clarity: 78,
    particleDensity: 42,
    finish: "polished",
    textureScale: 100,
  },
  ["#09000f", "#4b087d", "#d21476", "#ffcc4d"],
);
const glassCannonRecipeV3 = fixedCollectorRecipeV3(
  {
    family: "glass",
    style: "prismatic",
    clarity: 88,
    finish: "polished",
    textureScale: 100,
  },
  ["#071932", "#00bde3", "#e94fbe", "#ffe17a"],
);
const heavyMetalRecipeV3 = fixedCollectorRecipeV3(
  {
    family: "metal",
    metal: "steel",
    finish: "brushed",
    patinaStrength: 8,
    textureScale: 100,
  },
  ["#141820", "#596573", "#c9d1d8"],
);
const hollowVictoryPaletteV3 = [
  "#d49a20",
  "#e7b640",
  "#ffe080",
] as const;
const hollowVictoryRecipeV3 = fixedCollectorRecipeV3(
  {
    family: "hollow-metal",
    construction: "filigree",
    metal: "brass",
    finish: "polished",
    openness: 58,
    textureScale: 100,
  },
  hollowVictoryPaletteV3,
);
const hollowVictoryStandardRecipeV3 = fixedCollectorRecipeV3(
  {
    family: "metal",
    metal: "brass",
    finish: "polished",
    patinaStrength: 0,
    textureScale: 100,
  },
  hollowVictoryPaletteV3,
);
const grainExpectationsRecipeV3 = fixedCollectorRecipeV3(
  {
    family: "wood",
    wood: "walnut",
    finish: "polished",
    grainDensity: 64,
    textureScale: 100,
  },
  ["#1b0e09", "#6f351b", "#d3924b"],
);

export const R32_MATERIAL_PALETTES_V3 = Object.freeze({
  "elemental-lava": ["#0c0909", "#3b2924", "#f24b22", "#ffd16a"],
  "elemental-sand": ["#9c632b", "#c88c45", "#e4b766", "#f5dc9c"],
  "elemental-blue-sky": ["#0b68c7", "#2caee8", "#88d2f3", "#f4f9fc"],
  "elemental-sunset": ["#4a2782", "#b23f8d", "#ff6858", "#ffd18c"],
  "paint-splatter": [
    "#eadfc5",
    "#102d38",
    "#00a9c2",
    "#ef3f78",
    "#f2ad2e",
  ],
} as const);

const elementalLavaRecipeV3 = fixedCollectorRecipeV3(
  R32_ELEMENTAL_MATERIAL_DEFAULTS_V3[0],
  R32_MATERIAL_PALETTES_V3["elemental-lava"],
);
const elementalSandRecipeV3 = fixedCollectorRecipeV3(
  R32_ELEMENTAL_MATERIAL_DEFAULTS_V3[1],
  R32_MATERIAL_PALETTES_V3["elemental-sand"],
);
const elementalBlueSkyRecipeV3 = fixedCollectorRecipeV3(
  R32_ELEMENTAL_MATERIAL_DEFAULTS_V3[2],
  R32_MATERIAL_PALETTES_V3["elemental-blue-sky"],
);
const elementalSunsetRecipeV3 = fixedCollectorRecipeV3(
  R32_ELEMENTAL_MATERIAL_DEFAULTS_V3[3],
  R32_MATERIAL_PALETTES_V3["elemental-sunset"],
);
const paintSplatterRecipeV3 = fixedCollectorRecipeV3(
  PAINT_MATERIAL_DEFAULTS_V3[0],
  R32_MATERIAL_PALETTES_V3["paint-splatter"],
);
const elementalLavaR33RecipeV3 = fixedCollectorRecipeV3(
  ELEMENTAL_MATERIAL_DEFAULTS_V3[0],
  R32_MATERIAL_PALETTES_V3["elemental-lava"],
);
const elementalBlueSkyR33RecipeV3 = fixedCollectorRecipeV3(
  ELEMENTAL_MATERIAL_DEFAULTS_V3[2],
  R32_MATERIAL_PALETTES_V3["elemental-blue-sky"],
);
const elementalSunsetR33RecipeV3 = fixedCollectorRecipeV3(
  ELEMENTAL_MATERIAL_DEFAULTS_V3[3],
  R32_MATERIAL_PALETTES_V3["elemental-sunset"],
);

function fixedMaterialV3(recipe: AppearanceRecipeV3): AppearanceMaterialV4 {
  if (recipe.material.mode !== "fixed") {
    throw new Error("Built-in special material must be fixed");
  }
  return recipe.material.value;
}

function fixedPaletteV3(
  recipe: AppearanceRecipeV3,
): readonly [string, string, ...string[]] {
  if (recipe.colors.mode !== "palette") {
    throw new Error("Built-in special material must have an authored palette");
  }
  const [first, second, ...remaining] = recipe.colors.colors;
  if (first === undefined || second === undefined) {
    throw new Error("Built-in special material palette requires two colors");
  }
  return [first, second, ...remaining];
}

export type RandomSpecialMaterialV3 = Readonly<{
  id:
    | "nacreous-resin"
    | "vortical-core"
    | "prismatic-glass"
    | "striated-steel"
    | "brass-filigree"
    | "figured-walnut"
    | "elemental-lava"
    | "elemental-sand"
    | "elemental-blue-sky"
    | "elemental-sunset"
    | "paint-splatter";
  material: AppearanceMaterialV4;
  d20Material: AppearanceMaterialV4;
  d20Form: PolyhedralFormV4;
  palette: readonly [string, string, ...string[]];
}>;

export const RANDOM_SPECIAL_MATERIALS_V3: readonly RandomSpecialMaterialV3[] =
  Object.freeze([
    {
      id: "nacreous-resin",
      material: fixedMaterialV3(hexAppealRecipeV3),
      d20Material: fixedMaterialV3(hexAppealRecipeV3),
      d20Form: "sharp",
      palette: fixedPaletteV3(hexAppealRecipeV3),
    },
    {
      id: "vortical-core",
      material: fixedMaterialV3(criticalMassRecipeV3),
      d20Material: fixedMaterialV3(criticalMassRecipeV3),
      d20Form: "standard",
      palette: fixedPaletteV3(criticalMassRecipeV3),
    },
    {
      id: "prismatic-glass",
      material: fixedMaterialV3(glassCannonRecipeV3),
      d20Material: fixedMaterialV3(glassCannonRecipeV3),
      d20Form: "crystal-cut",
      palette: fixedPaletteV3(glassCannonRecipeV3),
    },
    {
      id: "striated-steel",
      material: fixedMaterialV3(heavyMetalRecipeV3),
      d20Material: fixedMaterialV3(heavyMetalRecipeV3),
      d20Form: "standard",
      palette: fixedPaletteV3(heavyMetalRecipeV3),
    },
    {
      id: "brass-filigree",
      material: fixedMaterialV3(hollowVictoryStandardRecipeV3),
      d20Material: fixedMaterialV3(hollowVictoryRecipeV3),
      d20Form: "hollow-cage",
      palette: fixedPaletteV3(hollowVictoryRecipeV3),
    },
    {
      id: "figured-walnut",
      material: fixedMaterialV3(grainExpectationsRecipeV3),
      d20Material: fixedMaterialV3(grainExpectationsRecipeV3),
      d20Form: "standard",
      palette: fixedPaletteV3(grainExpectationsRecipeV3),
    },
    {
      id: "elemental-lava",
      material: fixedMaterialV3(elementalLavaRecipeV3),
      d20Material: fixedMaterialV3(elementalLavaRecipeV3),
      d20Form: "standard",
      palette: fixedPaletteV3(elementalLavaRecipeV3),
    },
    {
      id: "elemental-sand",
      material: fixedMaterialV3(elementalSandRecipeV3),
      d20Material: fixedMaterialV3(elementalSandRecipeV3),
      d20Form: "standard",
      palette: fixedPaletteV3(elementalSandRecipeV3),
    },
    {
      id: "elemental-blue-sky",
      material: fixedMaterialV3(elementalBlueSkyRecipeV3),
      d20Material: fixedMaterialV3(elementalBlueSkyRecipeV3),
      d20Form: "standard",
      palette: fixedPaletteV3(elementalBlueSkyRecipeV3),
    },
    {
      id: "elemental-sunset",
      material: fixedMaterialV3(elementalSunsetRecipeV3),
      d20Material: fixedMaterialV3(elementalSunsetRecipeV3),
      d20Form: "standard",
      palette: fixedPaletteV3(elementalSunsetRecipeV3),
    },
    {
      id: "paint-splatter",
      material: fixedMaterialV3(paintSplatterRecipeV3),
      d20Material: fixedMaterialV3(paintSplatterRecipeV3),
      d20Form: "standard",
      palette: fixedPaletteV3(paintSplatterRecipeV3),
    },
  ] satisfies readonly RandomSpecialMaterialV3[]);

const LEGACY_RANDOM_SPECIAL_MATERIALS_V3 =
  RANDOM_SPECIAL_MATERIALS_V3.slice(0, 6);

function randomSpecialMaterialKeyV3(material: AppearanceMaterialV4): string {
  return Object.entries(material)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([field, value]) => `${field}:${String(value)}`)
    .join("|");
}

const RANDOM_SPECIAL_MATERIAL_BY_KEY_V3 = new Map(
  RANDOM_SPECIAL_MATERIALS_V3.map((candidate) => [
    randomSpecialMaterialKeyV3(candidate.material),
    candidate,
  ]),
);

export function randomSpecialMaterialV3(
  material: AppearanceMaterialV4,
): RandomSpecialMaterialV3 | undefined {
  return RANDOM_SPECIAL_MATERIAL_BY_KEY_V3.get(
    randomSpecialMaterialKeyV3(material),
  );
}

function classicRandomMaterialsV3(
  gradientWeight: number,
  patternWeight: number,
): readonly WeightedSelectionOption<AppearanceMaterialV4>[] {
  return [
    {
      value: {
        family: "classic",
        treatment: "solid",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
      weight: 900,
    },
    {
      value: {
        family: "classic",
        treatment: "gradient",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
      weight: gradientWeight,
    },
    ...PATTERNS.map(({ id: patternId }) => ({
      value: {
        family: "classic" as const,
        treatment: "pattern" as const,
        patternId,
        opacity: "opaque" as const,
        finish: "satin" as const,
        textureScale: 100,
      },
      weight: patternWeight,
    })),
  ];
}

const LEGACY_RANDOM_FONT_OPTIONS_V3 = LEGACY_FONTS.map(({ id }, index) => {
  let weight = 43;
  if (id === "liberation-sans") weight = 700;
  else if (index === LEGACY_FONTS.length - 1) weight = 42;
  return { value: fontIdV3(id), weight };
});

export const R32_RANDOM_FONT_OPTIONS_V3 = Object.freeze([
  ...NEUTRAL_RANDOM_FONT_IDS_V4.map((value, index) => ({
    value,
    weight: index === 0 ? 120 : 116,
  })),
  ...EXPRESSIVE_RANDOM_FONT_IDS_V4.map((value, index) => ({
    value,
    weight: index < 3 ? 34 : 33,
  })),
] satisfies readonly WeightedSelectionOption<FontIdV4>[]);

const r32RandomFontIds = new Set<FontIdV4>(
  R32_RANDOM_FONT_OPTIONS_V3.map(({ value }) => value),
);
if (MANUAL_ONLY_FONT_IDS_V4.some((fontId) => r32RandomFontIds.has(fontId))) {
  throw new Error("Manual-only appearance fonts cannot enter Random");
}

function createRandomRecipeV3(
  materialOptions: readonly WeightedSelectionOption<AppearanceMaterialV4>[],
  fontOptions: readonly WeightedSelectionOption<FontIdV4>[],
): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "wild",
    varyBy: "die",
    randomization: "full-spectrum-v2",
    colors: { mode: "vivid-random-pair" },
    material: { mode: "weighted", options: [...materialOptions] },
    form: {
      polyhedral: { mode: "fixed", value: "standard" },
      other: "sphere",
    },
    font: { mode: "weighted", options: [...fontOptions] },
    engraving: {
      mode: "weighted",
      options: ENGRAVING_FINISHES_V4.map((value) => ({ value, weight: 1 })),
    },
    gradient: {
      scope: { mode: "fixed", value: "die-wide" },
      direction: {
        mode: "weighted",
        options: LINEAR_DIRECTIONS_V4.map((value) => ({
          value,
          weight:
            value.includes("upper-") || value.includes("lower-") ? 2 : 1,
        })),
      },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

const legacyRandomRecipeV3 = createRandomRecipeV3(
  [
    ...classicRandomMaterialsV3(240, 21),
    ...LEGACY_RANDOM_SPECIAL_MATERIALS_V3.map(({ material: value }) => ({
      value,
      weight: 25,
    })),
  ],
  LEGACY_RANDOM_FONT_OPTIONS_V3,
);
const randomRecipeV3 = createRandomRecipeV3(
  [
    ...classicRandomMaterialsV3(150, 18),
    ...RANDOM_SPECIAL_MATERIALS_V3.map(({ material: value }, index) => ({
      value,
      weight: index < LEGACY_RANDOM_SPECIAL_MATERIALS_V3.length ? 20 : 30,
    })),
  ],
  R32_RANDOM_FONT_OPTIONS_V3,
);

const simpleStylesV3: readonly AppearanceBuiltinStyleV3[] = [
  {
    id: "solid",
    name: "Solid",
    description: "Cherry red with clean white numerals.",
    recipe: solidRecipeV3,
  },
  {
    id: "rainbow",
    name: "Rainbow",
    description: "One glossy rainbow hue per die.",
    recipe: rainbowRecipeV3,
  },
];

const collectorStylesV3: readonly AppearanceBuiltinStyleV3[] = [
  {
    id: "hex-appeal",
    name: "Nacreous Resin",
    description: "Clear sharp resin with iridescent foil inclusions.",
    recipe: withPolyhedralFormV3(hexAppealRecipeV3, "crystal-cut"),
  },
  {
    id: "critical-mass",
    name: "Vortical Core",
    description: "A frozen cosmic vortex inside polished resin.",
    recipe: criticalMassRecipeV3,
  },
  {
    id: "glass-cannon",
    name: "Prismatic Glass",
    description: "Prismatic crystal glass with spectral color.",
    recipe: withPolyhedralFormV3(glassCannonRecipeV3, "crystal-cut"),
  },
  {
    id: "heavy-metal",
    name: "Striated Steel",
    description: "Dark brushed steel with restrained patina.",
    recipe: heavyMetalRecipeV3,
  },
  {
    id: "hollow-victory",
    name: "Brass Filigree",
    description: "Polished brass with open filigree forms.",
    recipe: withPolyhedralFormV3(hollowVictoryRecipeV3, "hollow-cage"),
  },
  {
    id: "grain-expectations",
    name: "Figured Walnut",
    description: "Polished walnut with fine longitudinal grain.",
    recipe: grainExpectationsRecipeV3,
  },
  {
    id: "elemental-lava",
    name: "Lava",
    description: "Basalt crust with incandescent fissures.",
    recipe: elementalLavaRecipeV3,
  },
  {
    id: "elemental-sand",
    name: "Sand",
    description: "Wind-shaped dunes with visible mineral grains.",
    recipe: elementalSandRecipeV3,
  },
  {
    id: "elemental-blue-sky",
    name: "Blue Sky",
    description: "Clear atmosphere with soft cloud banks.",
    recipe: elementalBlueSkyRecipeV3,
  },
  {
    id: "elemental-sunset",
    name: "Sunset",
    description: "A warm horizon beneath violet cloud layers.",
    recipe: elementalSunsetRecipeV3,
  },
  {
    id: "paint-splatter",
    name: "Splatter",
    description: "Contrasting drops and short directional streaks.",
    recipe: paintSplatterRecipeV3,
  },
  {
    id: "elemental-lava-r33",
    name: "Lava",
    description: "Basalt crust with incandescent fissures.",
    recipe: elementalLavaR33RecipeV3,
  },
  {
    id: "elemental-blue-sky-r33",
    name: "Blue Sky",
    description: "Clear atmosphere with soft cloud banks.",
    recipe: elementalBlueSkyR33RecipeV3,
  },
  {
    id: "elemental-sunset-r33",
    name: "Sunset",
    description: "A warm horizon beneath violet cloud layers.",
    recipe: elementalSunsetR33RecipeV3,
  },
];

const LEGACY_RANDOM_RECIPE_CANONICAL_V3 = canonicalJsonV4(
  legacyRandomRecipeV3,
);
const RANDOM_RECIPE_CANONICAL_V3 = canonicalJsonV4(randomRecipeV3);

export function isBuiltinRandomRecipeV3(recipe: AppearanceRecipeV3): boolean {
  const canonical = canonicalJsonV4(recipe);
  return (
    canonical === LEGACY_RANDOM_RECIPE_CANONICAL_V3 ||
    canonical === RANDOM_RECIPE_CANONICAL_V3
  );
}

export function randomRecipeForResolutionV3(
  recipe: AppearanceRecipeV3,
  useR32: boolean,
): AppearanceRecipeV3 {
  if (!isBuiltinRandomRecipeV3(recipe)) return recipe;
  return useR32 ? randomRecipeV3 : legacyRandomRecipeV3;
}

export const BUILTIN_APPEARANCE_STYLES_V3: readonly AppearanceBuiltinStyleV3[] =
  Object.freeze([
    ...stylesV2.map(({ id, name, description, recipe }) => ({
      id,
      name,
      description,
      recipe:
        id === CHAOTIC_APPEARANCE_STYLE_ID
          ? randomRecipeV3
          : id === "dice-witch"
            ? diceWitchAltRecipeV3
            : classicRecipeV3(recipe),
    })),
    ...simpleStylesV3,
    ...collectorStylesV3,
  ]);

export const BUILTIN_APPEARANCE_RECIPES_V3: AppearanceBuiltinRecipesV3 =
  Object.freeze(
    Object.fromEntries(
      BUILTIN_APPEARANCE_STYLES_V3.map(({ id, recipe, overrides }) => [
        id,
        overrides === undefined ? { recipe } : { recipe, overrides },
      ]),
    ),
  );

export const APPEARANCE_VALIDATION_CATALOG_V3 = {
  builtinStyleIds: BUILTIN_APPEARANCE_STYLES_V3.map(({ id }) => id),
} as const satisfies AppearanceValidationCatalogV3;

export const APPEARANCE_CATALOG_V1: AppearancePublicCatalogV1 = {
  version: 1,
  defaultStyleId: CHAOTIC_APPEARANCE_STYLE_ID,
  styles: publicStylesV1,
  patterns: PATTERNS,
  fonts: [...LEGACY_FONTS],
};

export const APPEARANCE_CATALOG_V2: AppearancePublicCatalogV2 = {
  version: 2,
  defaultStyleId: CHAOTIC_APPEARANCE_STYLE_ID,
  styles: stylesV2,
  patterns: PATTERNS,
  fonts: [...LEGACY_FONTS],
};

export const APPEARANCE_CATALOG_V3: AppearancePublicCatalogV3 = {
  version: 3,
  defaultStyleId: CHAOTIC_APPEARANCE_STYLE_ID,
  editorDefaults: {
    primaryColor: "#8a1f82",
    palette: [
      "#8a1f82",
      "#04c9df",
      "#f3d36a",
      "#d7263d",
      "#2e933c",
      "#8a4fff",
    ],
    patternId: "checkerboard",
  },
  featuredStyleIds: FEATURED_APPEARANCE_STYLE_IDS,
  collectorStyleIds: APPROVED_COLLECTOR_STYLE_IDS_V3,
  featuredPatternIds: FEATURED_APPEARANCE_PATTERN_IDS,
  styles: BUILTIN_APPEARANCE_STYLES_V3,
  targets: TARGETS_V3,
  patterns: PATTERNS_V3,
  fonts: FONTS_V3,
  engravingFinishes: ENGRAVING_FINISHES_CATALOG_V3,
  variations: VARIATIONS_V3,
  variationScopes: VARIATION_SCOPES_V3,
  colorModes: COLOR_MODES_V3,
  selectionModes: SELECTION_MODES_V3,
  materials: MATERIALS_V3,
  forms: FORMS_V3,
  gradient: {
    scopes: GRADIENT_SCOPES_CATALOG_V3,
    directions: LINEAR_DIRECTIONS_CATALOG_V3,
  },
  lighting: {
    modes: LIGHTING_MODES_CATALOG_V3,
    strengths: LIGHTING_STRENGTHS_CATALOG_V3,
    directions: LIGHTING_DIRECTIONS_CATALOG_V3,
  },
  bounds: {
    paletteColors: APPEARANCE_PALETTE_COLOR_RANGE_V3,
    percentage: APPEARANCE_PERCENTAGE_RANGE_V4,
    textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    selectionWeight: APPEARANCE_SELECTION_WEIGHT_RANGE_V3,
    maximumTotalSelectionWeight:
      MAX_TOTAL_APPEARANCE_SELECTION_WEIGHT_V3,
    maximumMaterialOptions: MAX_MATERIAL_SELECTION_OPTIONS_V3,
    maximumDesigns: MAX_APPEARANCE_DESIGNS_V3,
    maximumDesignNameCharacters:
      MAX_APPEARANCE_DESIGN_NAME_CHARACTERS_V3,
    maximumProfileJsonCharacters: MAX_PROFILE_JSON_CHARACTERS_V3,
  },
};

export const APPEARANCE_VALIDATION_CATALOG: AppearanceCatalog = {
  builtinStyleIds: styles.map(({ id }) => id),
  patternIds: PATTERNS.map(({ id }) => id),
  fontIds: LEGACY_FONTS.map(({ id }) => id),
};

export const BUILTIN_APPEARANCE_RECIPES = Object.fromEntries(
  styles.map(({ id, recipe }) => [id, recipe]),
) as Readonly<Record<string, AppearanceRecipeV1>>;

export const BUILTIN_APPEARANCE_RECIPES_V2 = Object.fromEntries(
  stylesV2.map(({ id, recipe }) => [id, recipe]),
) as Readonly<Record<string, AppearanceRecipeV2>>;
