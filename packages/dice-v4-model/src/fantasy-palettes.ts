import type { FantasyMaterialV4 } from "./types";

type FantasyEssenceV4 = FantasyMaterialV4["essence"];
type FantasyPaletteV4 = readonly [string, string, ...string[]];

export const FANTASY_ESSENCE_PALETTES_R33_V4 = Object.freeze({
  ice: ["#071b2b", "#2f7f9d", "#a9e8f2", "#f4fdff"],
  void: ["#020106", "#100826", "#3a1764", "#9a62d6"],
  corruption: ["#101607", "#354d12", "#6daf25", "#c7f45b"],
  arcane: ["#16062e", "#55208f", "#b04ee8", "#f0b7ff"],
  "living-eye": ["#1c0805", "#7b2416", "#d89a32", "#f5e6a8"],
  cosmic: ["#050924", "#213b86", "#8c3fc7", "#f2d36b"],
  blood: ["#120203", "#4b070b", "#a61920", "#f06458"],
  bone: ["#3a3022", "#8a7657", "#d2c29d", "#f2ead4"],
} as const satisfies Readonly<Record<FantasyEssenceV4, FantasyPaletteV4>>);
