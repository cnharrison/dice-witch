import type {
  AppearanceTargetV4,
  MaterialFamilyV4,
  PolyhedralFormV4,
} from "./types";

const CRYSTAL_CUT_FAMILIES: ReadonlySet<MaterialFamilyV4> = new Set([
  "sharp-resin",
  "gemstone",
  "glass",
  "fantasy",
]);

export function isPolyhedralFormImplementedForTargetV4(
  target: Exclude<AppearanceTargetV4, "other">,
  form: PolyhedralFormV4,
): boolean {
  return form === "standard" || target === "d20";
}

export function materialDefaultPolyhedralFormV4(
  family: MaterialFamilyV4,
  target: Exclude<AppearanceTargetV4, "other">,
): PolyhedralFormV4 {
  if (target !== "d20") return "standard";
  if (family === "sharp-resin") return "sharp";
  if (family === "glass") return "crystal-cut";
  if (family === "hollow-metal") return "hollow-cage";
  return "standard";
}

export function isMaterialFormCompatibleV4(
  family: MaterialFamilyV4,
  form: PolyhedralFormV4,
): boolean {
  if (form === "hollow-cage") return family === "hollow-metal";
  if (family === "hollow-metal") return false;
  return form !== "crystal-cut" || CRYSTAL_CUT_FAMILIES.has(family);
}
