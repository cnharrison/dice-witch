import type { AppearanceFontId } from "./types";

type AppearanceGlyph =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "+"
  | "-"
  | "d";

type FontVerticalMetrics = {
  unitsPerEm: number;
  xHeight: number;
  verticalBounds: Record<AppearanceGlyph, readonly [number, number]>;
};

// Derived from the head, OS/2, and glyf tables in the embedded font subsets.
const FONT_VERTICAL_METRICS: Record<AppearanceFontId, FontVerticalMetrics> = {
  "liberation-sans": {
    unitsPerEm: 2048,
    xHeight: 1082,
    verticalBounds: {
      "0": [-20, 1430],
      "1": [0, 1409],
      "2": [0, 1430],
      "3": [-23, 1430],
      "4": [0, 1409],
      "5": [-20, 1409],
      "6": [-20, 1430],
      "7": [0, 1409],
      "8": [-20, 1430],
      "9": [-20, 1430],
      "+": [161, 1201],
      "-": [409, 653],
      d: [-20, 1484],
    },
  },
  "new-rocker": {
    unitsPerEm: 1000,
    xHeight: 465,
    verticalBounds: {
      "0": [-28, 737],
      "1": [-2, 736],
      "2": [-33, 737],
      "3": [-10, 735],
      "4": [-2, 737],
      "5": [-10, 735],
      "6": [-10, 735],
      "7": [-2, 735],
      "8": [-26, 737],
      "9": [-10, 735],
      "+": [171, 548],
      "-": [198, 336],
      d: [-28, 788],
    },
  },
  "stencil-ops": {
    unitsPerEm: 2048,
    xHeight: 1062,
    verticalBounds: {
      "0": [0, 1327],
      "1": [0, 1327],
      "2": [0, 1327],
      "3": [0, 1327],
      "4": [0, 1327],
      "5": [0, 1327],
      "6": [0, 1327],
      "7": [0, 1327],
      "8": [-1, 1327],
      "9": [0, 1327],
      "+": [86, 1153],
      "-": [501, 740],
      d: [0, 1467],
    },
  },
  "creeping-horror": {
    unitsPerEm: 1024,
    xHeight: 751,
    verticalBounds: {
      "0": [-19, 759],
      "1": [-22, 748],
      "2": [-19, 754],
      "3": [-23, 754],
      "4": [-22, 750],
      "5": [-19, 755],
      "6": [-19, 755],
      "7": [-4, 748],
      "8": [-26, 755],
      "9": [-22, 748],
      "+": [143, 573],
      "-": [301, 396],
      d: [-27, 750],
    },
  },
  "special-elite": {
    unitsPerEm: 2048,
    xHeight: 528,
    verticalBounds: {
      "0": [2, 1474],
      "1": [-23, 1457],
      "2": [-50, 1391],
      "3": [-51, 1421],
      "4": [9, 1448],
      "5": [0, 1412],
      "6": [-19, 1446],
      "7": [-69, 1502],
      "8": [4, 1474],
      "9": [-4, 1464],
      "+": [270, 1145],
      "-": [561, 813],
      d: [-52, 1412],
    },
  },
  "luckiest-guy": {
    unitsPerEm: 2048,
    xHeight: 1400,
    verticalBounds: {
      "0": [-4, 1438],
      "1": [16, 1458],
      "2": [24, 1498],
      "3": [-16, 1526],
      "4": [6, 1484],
      "5": [-6, 1470],
      "6": [-30, 1480],
      "7": [20, 1464],
      "8": [-2, 1472],
      "9": [6, 1458],
      "+": [222, 1068],
      "-": [540, 882],
      d: [28, 1404],
    },
  },
  "fontdiner-swanky": {
    unitsPerEm: 1024,
    xHeight: 579,
    verticalBounds: {
      "0": [2, 647],
      "1": [-31, 745],
      "2": [-34, 808],
      "3": [-110, 797],
      "4": [-69, 792],
      "5": [-50, 757],
      "6": [-72, 852],
      "7": [-55, 733],
      "8": [-93, 725],
      "9": [-143, 733],
      "+": [37, 639],
      "-": [265, 446],
      d: [-169, 807],
    },
  },
  syncopate: {
    unitsPerEm: 2048,
    xHeight: 958,
    verticalBounds: {
      "0": [-37, 1409],
      "1": [0, 1374],
      "2": [0, 1409],
      "3": [-37, 1409],
      "4": [0, 1374],
      "5": [-37, 1374],
      "6": [-37, 1409],
      "7": [0, 1374],
      "8": [-37, 1409],
      "9": [-37, 1409],
      "+": [145, 1225],
      "-": [522, 850],
      d: [0, 1374],
    },
  },
};

// Caps each font at Liberation Sans's maximum digit ink width and height.
const DIGIT_PROJECTION_SCALE: Record<
  AppearanceFontId,
  Readonly<{ x: number; y: number }>
> = {
  "liberation-sans": { x: 1, y: 1 },
  "new-rocker": { x: 1, y: 0.921 },
  "stencil-ops": { x: 0.828, y: 1 },
  "creeping-horror": { x: 1, y: 0.93 },
  "special-elite": { x: 0.944, y: 0.925 },
  "luckiest-guy": { x: 0.886, y: 0.942 },
  "fontdiner-swanky": { x: 0.765, y: 0.786 },
  syncopate: { x: 0.677, y: 1 },
};

const APPEARANCE_GLYPHS: ReadonlySet<string> = new Set(
  "0123456789+-d",
);
const REFERENCE_FONT_ID = "liberation-sans";

function isAppearanceGlyph(value: string): value is AppearanceGlyph {
  return APPEARANCE_GLYPHS.has(value);
}

function getNormalizedOpticalCenter(
  fontId: AppearanceFontId,
  label: string,
): number {
  if (label.length === 0) return 0;
  const metrics = FONT_VERTICAL_METRICS[fontId];
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (const character of label) {
    if (!isAppearanceGlyph(character)) {
      throw new Error(
        `Appearance glyph ${JSON.stringify(character)} is not supported`,
      );
    }
    const bounds = metrics.verticalBounds[character];
    minimum = Math.min(minimum, bounds[0]);
    maximum = Math.max(maximum, bounds[1]);
  }

  return (minimum + maximum) / (2 * metrics.unitsPerEm);
}

function getNormalizedMiddleBaseline(fontId: AppearanceFontId): number {
  const metrics = FONT_VERTICAL_METRICS[fontId];
  return metrics.xHeight / (2 * metrics.unitsPerEm);
}

export function getAppearanceDigitProjectionScale(
  fontId: AppearanceFontId,
): Readonly<{ x: number; y: number }> {
  return DIGIT_PROJECTION_SCALE[fontId];
}

export function getAppearanceLabelBaselineShift(
  fontId: AppearanceFontId,
  label: string,
  fontSize: number,
): number {
  if (label.length === 0 || fontId === REFERENCE_FONT_ID) return 0;
  const referenceCenter =
    getNormalizedMiddleBaseline(REFERENCE_FONT_ID) -
    getNormalizedOpticalCenter(REFERENCE_FONT_ID, label);
  const fontCenter =
    getNormalizedMiddleBaseline(fontId) -
    getNormalizedOpticalCenter(fontId, label);
  const shift = Number(((referenceCenter - fontCenter) * fontSize).toFixed(2));
  return Object.is(shift, -0) ? 0 : shift;
}
