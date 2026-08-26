import type {
  PatternFill,
  RenderLinearDirectionV3,
  RenderSurfaceV3,
} from "../types";

type GradientSurfaceV3 = Extract<
  RenderSurfaceV3,
  { type: "gradient" }
>;

type GradientVector = Readonly<{
  x1: string;
  y1: string;
  x2: string;
  y2: string;
}>;

const REPEATED_VECTORS = {
  "top-to-bottom": { x1: ".5", y1: "0", x2: ".5", y2: "1" },
  "upper-right-to-lower-left": { x1: "1", y1: "0", x2: "0", y2: "1" },
  "right-to-left": { x1: "1", y1: ".5", x2: "0", y2: ".5" },
  "lower-right-to-upper-left": { x1: "1", y1: "1", x2: "0", y2: "0" },
  "bottom-to-top": { x1: ".5", y1: "1", x2: ".5", y2: "0" },
  "lower-left-to-upper-right": { x1: "0", y1: "1", x2: "1", y2: "0" },
  "left-to-right": { x1: "0", y1: ".5", x2: "1", y2: ".5" },
  "upper-left-to-lower-right": { x1: "0", y1: "0", x2: "1", y2: "1" },
} satisfies Readonly<Record<RenderLinearDirectionV3, GradientVector>>;

const WHOLE_DIE_VECTORS = {
  "top-to-bottom": { x1: "300", y1: "45", x2: "300", y2: "555" },
  "upper-right-to-lower-left": {
    x1: "530",
    y1: "60",
    x2: "70",
    y2: "540",
  },
  "right-to-left": { x1: "555", y1: "300", x2: "45", y2: "300" },
  "lower-right-to-upper-left": {
    x1: "530",
    y1: "540",
    x2: "70",
    y2: "60",
  },
  "bottom-to-top": { x1: "300", y1: "555", x2: "300", y2: "45" },
  "lower-left-to-upper-right": {
    x1: "70",
    y1: "540",
    x2: "530",
    y2: "60",
  },
  "left-to-right": { x1: "45", y1: "300", x2: "555", y2: "300" },
  "upper-left-to-lower-right": {
    x1: "70",
    y1: "60",
    x2: "530",
    y2: "540",
  },
} satisfies Readonly<Record<RenderLinearDirectionV3, GradientVector>>;

const OTHER_VECTORS = {
  "top-to-bottom": { x1: "300", y1: "48", x2: "300", y2: "552" },
  "upper-right-to-lower-left": {
    x1: "552",
    y1: "48",
    x2: "48",
    y2: "552",
  },
  "right-to-left": { x1: "552", y1: "300", x2: "48", y2: "300" },
  "lower-right-to-upper-left": {
    x1: "552",
    y1: "552",
    x2: "48",
    y2: "48",
  },
  "bottom-to-top": { x1: "300", y1: "552", x2: "300", y2: "48" },
  "lower-left-to-upper-right": {
    x1: "48",
    y1: "552",
    x2: "552",
    y2: "48",
  },
  "left-to-right": { x1: "48", y1: "300", x2: "552", y2: "300" },
  "upper-left-to-lower-right": {
    x1: "48",
    y1: "48",
    x2: "552",
    y2: "552",
  },
} satisfies Readonly<Record<RenderLinearDirectionV3, GradientVector>>;

function gradientId(surface: GradientSurfaceV3): string {
  return [
    "appearance-gradient-v3",
    surface.scope,
    surface.direction,
    ...surface.colors.map((color) => color.slice(1)),
  ].join("_");
}

function stopOffset(index: number, count: number): string {
  const percent = Number(((index * 100) / (count - 1)).toFixed(4));
  return `${String(percent)}%`;
}

function composeGradient(
  surface: GradientSurfaceV3,
  id: string,
  units: "objectBoundingBox" | "userSpaceOnUse",
  vector: GradientVector,
): PatternFill {
  const stops = surface.colors
    .map(
      (color, index) =>
        `<stop offset="${stopOffset(index, surface.colors.length)}" stop-color="${color}"/>`,
    )
    .join("\n      ");
  return {
    name: id,
    string: `<linearGradient id="${id}" gradientUnits="${units}" x1="${vector.x1}" y1="${vector.y1}" x2="${vector.x2}" y2="${vector.y2}">
      ${stops}
    </linearGradient>`,
  };
}

export function generateAppearanceGradientV3(
  surface: GradientSurfaceV3,
): PatternFill {
  return composeGradient(
    surface,
    gradientId(surface),
    surface.scope === "repeated" ? "objectBoundingBox" : "userSpaceOnUse",
    surface.scope === "repeated"
      ? REPEATED_VECTORS[surface.direction]
      : WHOLE_DIE_VECTORS[surface.direction],
  );
}

export function generateOtherAppearanceGradientV3(
  surface: GradientSurfaceV3,
): PatternFill {
  const id = [
    "appearance-gradient-v3",
    "other",
    surface.direction,
    ...surface.colors.map((color) => color.slice(1)),
  ].join("_");
  return composeGradient(
    surface,
    id,
    "userSpaceOnUse",
    OTHER_VECTORS[surface.direction],
  );
}
