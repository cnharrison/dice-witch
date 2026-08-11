import type { MaterialFamilyV4 } from "./types";

export type MaterialLightResponseV4 = {
  readonly highlight: number;
  readonly shadow: number;
  readonly rim: number;
};

export const MATERIAL_LIGHT_RESPONSES_V4: Readonly<
  Record<MaterialFamilyV4, MaterialLightResponseV4>
> = Object.freeze({
  classic: { highlight: 1, shadow: 1, rim: 1 },
  "sharp-resin": { highlight: 1.15, shadow: 0.92, rim: 1.25 },
  "liquid-core": { highlight: 1.2, shadow: 0.9, rim: 1.35 },
  gemstone: { highlight: 1.35, shadow: 0.95, rim: 1.4 },
  glass: { highlight: 1.4, shadow: 0.9, rim: 1.5 },
  stone: { highlight: 0.72, shadow: 1.08, rim: 0.55 },
  metal: { highlight: 1.45, shadow: 1.12, rim: 1.1 },
  "hollow-metal": { highlight: 1.35, shadow: 1.15, rim: 1.2 },
  wood: { highlight: 0.68, shadow: 1.05, rim: 0.45 },
  fantasy: { highlight: 1.25, shadow: 1, rim: 1.35 },
  elemental: { highlight: 0.9, shadow: 1.04, rim: 0.8 },
  paint: { highlight: 0.88, shadow: 1.02, rim: 0.72 },
});

export function materialLightResponseV4(
  family: MaterialFamilyV4,
): MaterialLightResponseV4 {
  return MATERIAL_LIGHT_RESPONSES_V4[family];
}
