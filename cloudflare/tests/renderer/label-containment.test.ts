import { describe, expect, it } from "vitest";
import {
  APPEARANCE_FONT_IDS,
  composeD4AppearanceSvg,
  composeD4AppearanceSvgV3,
  composeD6AppearanceSvg,
  composeD6AppearanceSvgV3,
  composeD8AppearanceSvg,
  composeD8AppearanceSvgV3,
  composeD10AppearanceSvg,
  composeD10AppearanceSvgV3,
  composeD12AppearanceSvg,
  composeD12AppearanceSvgV3,
  composeD20AppearanceSvg,
  composeD20AppearanceSvgV3,
  composeFudgeAppearanceSvg,
  composeFudgeAppearanceSvgV3,
  composePercentileAppearanceSvg,
  composePercentileAppearanceSvgV3,
  composeOriginalD10AppearanceSvgV3,
  renderComposedSvgToPng,
  type AppearanceFontId,
} from "../../packages/dice-svg/src";

const appearance = {
  primaryColor: "#301934",
  secondaryColor: "#d4af37",
  textColor: "#ffffff",
  outlineColor: "#000000" as const,
  fill: { type: "gradient" as const },
  effect: null,
};

const appearanceV3 = {
  surface: {
    type: "gradient" as const,
    colors: ["#301934", "#d4af37"] as [string, string],
    scope: "die-wide" as const,
    direction: "upper-left-to-lower-right" as const,
  },
  lighting: {
    mode: "combined" as const,
    strength: "strong" as const,
    direction: "upper-left" as const,
  },
  textColor: "#faf9f6" as const,
  outlineColor: "#000000" as const,
  effect: null,
  requiresLocalSeparation: true,
};

type AppearanceRequest = typeof appearance & {
  fontId: AppearanceFontId;
  result: number;
};
type AppearanceRequestV3 = typeof appearanceV3 & {
  fontId: AppearanceFontId;
  result: number;
};
type Composer = (request: AppearanceRequest) => string;
type ComposerV3 = (request: AppearanceRequestV3) => string;

const containmentCases: readonly [
  name: string,
  compose: Composer,
  composeV3: ComposerV3,
  fontId: AppearanceFontId,
  result: number,
][] = [
  ["d4", composeD4AppearanceSvg, composeD4AppearanceSvgV3, "special-elite", 4],
  ["d6", composeD6AppearanceSvg, composeD6AppearanceSvgV3, "fontdiner-swanky", 6],
  ["d8", composeD8AppearanceSvg, composeD8AppearanceSvgV3, "special-elite", 2],
  ["d10", composeD10AppearanceSvg, composeD10AppearanceSvgV3, "fontdiner-swanky", 2],
  ["d12 upper faces", composeD12AppearanceSvg, composeD12AppearanceSvgV3, "special-elite", 3],
  ["d12 side faces", composeD12AppearanceSvg, composeD12AppearanceSvgV3, "special-elite", 6],
  ["d20 top-left", composeD20AppearanceSvg, composeD20AppearanceSvgV3, "special-elite", 4],
  ["d20 top-right", composeD20AppearanceSvg, composeD20AppearanceSvgV3, "special-elite", 5],
  ["d20 middle-left", composeD20AppearanceSvg, composeD20AppearanceSvgV3, "syncopate", 17],
  ["d20 middle-right", composeD20AppearanceSvg, composeD20AppearanceSvgV3, "syncopate", 5],
  ["d20 bottom-left", composeD20AppearanceSvg, composeD20AppearanceSvgV3, "syncopate", 15],
  ["d20 bottom-right", composeD20AppearanceSvg, composeD20AppearanceSvgV3, "syncopate", 9],
  ["percentile result", composePercentileAppearanceSvg, composePercentileAppearanceSvgV3, "special-elite", 10],
  ["percentile lower faces", composePercentileAppearanceSvg, composePercentileAppearanceSvgV3, "special-elite", 0],
  ["Fudge", composeFudgeAppearanceSvg, composeFudgeAppearanceSvgV3, "special-elite", 1],
];

const originalD10ContainmentCases = APPEARANCE_FONT_IDS.flatMap((fontId) =>
  Array.from({ length: 11 }, (_, result) => [fontId, result] as const),
);

function removeLabelClipping(svg: string): string {
  return svg.replace(
    / clip-path="url\(#[\w-]*label-[\w-]+\)"/g,
    "",
  );
}

async function expectLabelsContained(svg: string): Promise<void> {
  const unclippedSvg = removeLabelClipping(svg);
  expect(unclippedSvg).not.toBe(svg);
  const [clippedPng, unclippedPng] = await Promise.all([
    renderComposedSvgToPng(svg),
    renderComposedSvgToPng(unclippedSvg),
  ]);
  expect(clippedPng).toEqual(unclippedPng);
}

describe("appearance label containment", () => {
  it.each(containmentCases)(
    "%s keeps worst-case glyph pixels inside their facets",
    async (_name, compose, _composeV3, fontId, result) => {
      await expectLabelsContained(
        compose({ ...appearance, fontId, result }),
      );
    },
  );

  it.each(originalD10ContainmentCases)(
    "original-guided d10 keeps every neighboring face inside its facets with %s at result %i",
    async (fontId, result) => {
      await expectLabelsContained(
        composeOriginalD10AppearanceSvgV3({
          ...appearanceV3,
          fontId,
          result,
        }),
      );
    },
  );

  it.each(containmentCases)(
    "%s keeps native V3 glyph pixels inside their facets",
    async (_name, _compose, composeV3, fontId, result) => {
      await expectLabelsContained(
        composeV3({ ...appearanceV3, fontId, result }),
      );
    },
  );
});
