import type { AppearanceTargetV4 } from "./types";

export type FaceLabelLayoutV4 =
  | "face-centered"
  | "sphere-front"
  | "vertex-triplet";

export const FACET_SEPARATOR_WIDTH_PX_V4 = 3;
export const D20_R4_ORIENTATION_MARK_OPTICAL_SCALE_V4 = 0.92;

export const CANONICAL_FACE_VALUES_V4 = Object.freeze({
  d4: Object.freeze([1, 2, 3, 4]),
  d6: Object.freeze([1, 2, 3, 4, 5, 6]),
  d8: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]),
  d10: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  d12: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  d20: Object.freeze([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  ]),
  percentile: Object.freeze([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]),
  fudge: Object.freeze([-1, -1, 0, 0, 1, 1]),
});

export const FACE_LABEL_LAYOUT_BY_TARGET_V4: Readonly<
  Record<AppearanceTargetV4, FaceLabelLayoutV4>
> = Object.freeze({
  d4: "vertex-triplet",
  d6: "face-centered",
  d8: "face-centered",
  d10: "face-centered",
  d12: "face-centered",
  d20: "face-centered",
  percentile: "face-centered",
  fudge: "face-centered",
  other: "sphere-front",
});

function requireFaceValue(target: AppearanceTargetV4, value: number): void {
  if (target === "other") {
    if (Number.isInteger(value) && value >= 1 && value <= 999) return;
    throw new Error("Other face value must be from 1 through 999");
  }
  if (CANONICAL_FACE_VALUES_V4[target].includes(value)) return;
  if (target === "percentile") {
    throw new Error(
      "Percentile face value must be a multiple of 10 from 0 through 90",
    );
  }
  if (target === "fudge") {
    throw new Error("Fudge face value must be -1, 0, or 1");
  }
  throw new Error(`${target} face value is invalid`);
}

export function formatFaceLabelV4(
  target: AppearanceTargetV4,
  value: number,
): string {
  requireFaceValue(target, value);
  if (target === "percentile") return String(value).padStart(2, "0");
  if (target === "fudge") {
    if (value < 0) return "−";
    if (value > 0) return "+";
    return "";
  }
  return String(value);
}

export function requiresOrientationMarkV4(
  target: AppearanceTargetV4,
  value: number,
): boolean {
  const label = formatFaceLabelV4(target, value);
  return label === "6" || label === "9";
}

export function getOppositeFaceValueV4(
  target: AppearanceTargetV4,
  value: number,
): number | null {
  requireFaceValue(target, value);
  if (target === "percentile") return 90 - value;
  if (target === "d6") return 7 - value;
  if (target === "d8") return 9 - value;
  if (target === "d10") return 11 - value;
  if (target === "d12") return 13 - value;
  if (target === "d20") return 21 - value;
  return null;
}
