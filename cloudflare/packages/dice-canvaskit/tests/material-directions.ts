import {
  generateMaterialTextureV4,
  SOURCE_TEXTURE_SIZE_V4,
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  type AppearanceMaterialV4,
  type TextureRasterV4,
} from "@dice-witch/dice-v4-model";

export const MATERIAL_DIRECTIONS_V4 = [
  [
    "hex-appeal",
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
  ],
  [
    "critical-mass",
    {
      family: "liquid-core",
      core: "vortex",
      clarity: 78,
      particleDensity: 42,
      finish: "polished",
      textureScale: 100,
    },
    ["#09000f", "#4b087d", "#d21476", "#ffcc4d"],
  ],
  [
    "glass-cannon",
    {
      family: "glass",
      style: "prismatic",
      clarity: 88,
      finish: "polished",
      textureScale: 100,
    },
    ["#071932", "#00bde3", "#e94fbe", "#ffe17a"],
  ],
  [
    "heavy-metal",
    {
      family: "metal",
      metal: "steel",
      finish: "brushed",
      patinaStrength: 8,
      textureScale: 100,
    },
    ["#141820", "#596573", "#c9d1d8"],
  ],
  [
    "hollow-victory",
    {
      family: "hollow-metal",
      construction: "filigree",
      metal: "brass",
      finish: "polished",
      openness: 58,
      textureScale: 100,
    },
    ["#080609", "#72501e", "#e7b957"],
  ],
  [
    "grain-expectations",
    {
      family: "wood",
      wood: "walnut",
      finish: "polished",
      grainDensity: 64,
      textureScale: 100,
    },
    ["#1b0e09", "#6f351b", "#d3924b"],
  ],
] as const satisfies readonly (readonly [
  string,
  AppearanceMaterialV4,
  readonly [string, string, ...string[]],
])[];

export function createMaterialDirectionTextureV4(
  index: number,
  material: AppearanceMaterialV4,
  palette: readonly string[],
): TextureRasterV4 {
  return generateMaterialTextureV4({
    version: 1,
    width: SOURCE_TEXTURE_SIZE_V4,
    height: SOURCE_TEXTURE_SIZE_V4,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[material.family],
    seed: 0x4d41_5400 + index,
    material,
    palette,
  });
}
