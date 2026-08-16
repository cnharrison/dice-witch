import type {
  AppearanceTargetV4,
  MaterialFamilyV4,
  PolyhedralFormV4,
  RendererRevisionV4,
} from "./types";

const CRYSTAL_CUT_FAMILIES: ReadonlySet<MaterialFamilyV4> = new Set([
  "sharp-resin",
  "gemstone",
  "glass",
  "fantasy",
]);

function supportsAllTargetSpecialFormsV4(
  rendererRevision?: RendererRevisionV4,
): boolean {
  return (
    rendererRevision === "canvaskit-v4-r30" ||
    rendererRevision === "canvaskit-v4-r31" ||
    rendererRevision === "canvaskit-v4-r32" ||
    rendererRevision === "canvaskit-v4-r33" ||
    rendererRevision === "canvaskit-v4-r34" ||
    rendererRevision === "canvaskit-v4-r35" ||
    rendererRevision === "canvaskit-v4-r36" ||
    rendererRevision === "canvaskit-v4-r37" ||
    rendererRevision === "canvaskit-v4-r38" ||
    rendererRevision === "canvaskit-v4-r39" ||
    rendererRevision === "canvaskit-v4-r40" ||
    rendererRevision === "canvaskit-v4-r41"
  );
}

export function isPolyhedralFormImplementedForTargetV4(
  target: Exclude<AppearanceTargetV4, "other">,
  form: PolyhedralFormV4,
  rendererRevision?: RendererRevisionV4,
): boolean {
  if (form === "standard" || target === "d20") return true;
  return (
    supportsAllTargetSpecialFormsV4(rendererRevision) &&
    (form === "crystal-cut" || form === "hollow-cage")
  );
}

export function materialDefaultPolyhedralFormV4(
  family: MaterialFamilyV4,
  target: Exclude<AppearanceTargetV4, "other">,
  rendererRevision?: RendererRevisionV4,
): PolyhedralFormV4 {
  if (supportsAllTargetSpecialFormsV4(rendererRevision)) {
    if (family === "hollow-metal") return "hollow-cage";
    if (CRYSTAL_CUT_FAMILIES.has(family)) return "crystal-cut";
  }
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
