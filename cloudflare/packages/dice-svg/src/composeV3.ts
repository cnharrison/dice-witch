import { composeRenderedDiceGrid } from "./compose";
import { composeD6AppearanceSvgV3 } from "./dice/generateD6Appearance";
import { composeD20AppearanceSvgV3 } from "./dice/generateD20Appearance";
import {
  composeD4AppearanceSvgV3,
  composeD8AppearanceSvgV3,
  composeD10AppearanceSvgV3,
  composeD12AppearanceSvgV3,
  composeOriginalD10AppearanceSvgV3,
} from "./dice/generatePolyhedralAppearance";
import {
  composeFudgeAppearanceSvgV3,
  composeOtherAppearanceSvgV3,
  composePercentileAppearanceSvgV3,
} from "./dice/generateSpecialAppearance";
import type {
  ComposedSvg,
  RenderAppearanceV3,
  RenderDieV3,
} from "./types";
import { validateRenderRequestV3 } from "./validateV3";

type AppearanceRequestV3 = RenderAppearanceV3 & { result: number };

function appearanceRequest(die: RenderDieV3): AppearanceRequestV3 {
  return { ...die.appearance, result: die.result };
}

function composeAppearanceDieV3(die: RenderDieV3): string {
  const request = appearanceRequest(die);
  switch (die.target) {
    case "d4":
      return composeD4AppearanceSvgV3(request);
    case "d6":
      return composeD6AppearanceSvgV3(request);
    case "d8":
      return composeD8AppearanceSvgV3(request);
    case "d10":
      return composeD10AppearanceSvgV3(request);
    case "d10-original":
      return composeOriginalD10AppearanceSvgV3(request);
    case "d12":
      return composeD12AppearanceSvgV3(request);
    case "d20":
      return composeD20AppearanceSvgV3(request);
    case "percentile":
      return composePercentileAppearanceSvgV3(request);
    case "fudge":
      return composeFudgeAppearanceSvgV3(request);
    case "other":
      return composeOtherAppearanceSvgV3({ ...request, sides: die.sides });
  }
}

function withoutEngravedLabelsV3(svg: string): string {
  return svg
    .replace(
      /<text\b[^>]*class="[^"]*\bengraving-text\b[^"]*"[^>]*>[\s\S]*?<\/text>/g,
      "",
    )
    .replace(
      /<line\b[^>]*class="[^"]*\bengraving-mark-ink\b[^"]*"[^>]*\/>/g,
      "",
    );
}

function composeDiceSvgV3WithFaces(
  input: unknown,
  blankFaces: boolean,
): ComposedSvg {
  const request = validateRenderRequestV3(input);
  return composeRenderedDiceGrid(
    request.groups.map((group) =>
      group.map((die) => {
        const svg = composeAppearanceDieV3(die);
        return {
          svg: blankFaces ? withoutEngravedLabelsV3(svg) : svg,
          icons: blankFaces ? [] : die.icons,
          target: die.target,
        };
      }),
    ),
  );
}

export function composeDiceSvgV3(input: unknown): ComposedSvg {
  return composeDiceSvgV3WithFaces(input, false);
}

export function composeBlankDiceSvgV3(input: unknown): ComposedSvg {
  return composeDiceSvgV3WithFaces(input, true);
}
