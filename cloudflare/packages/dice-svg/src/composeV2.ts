import { composeRenderedDiceGrid } from "./compose";
import { composeD6AppearanceSvgWithOptions } from "./dice/generateD6Appearance";
import { composeD20AppearanceSvgWithOptions } from "./dice/generateD20Appearance";
import {
  composeD4AppearanceSvgWithOptions,
  composeD8AppearanceSvgWithOptions,
  composeD10AppearanceSvgWithOptions,
  composeD12AppearanceSvgWithOptions,
} from "./dice/generatePolyhedralAppearance";
import {
  composeFudgeAppearanceSvgWithOptions,
  composeOtherAppearanceSvgWithOptions,
  composePercentileAppearanceSvgWithOptions,
} from "./dice/generateSpecialAppearance";
import type {
  ComposedSvg,
  RenderAppearanceV2,
  RenderDieV2,
} from "./types";
import { validateRenderRequestV2 } from "./validateV2";
import type { ValidationInput } from "./validationBoundary";

type AppearanceRequest = Omit<
  RenderAppearanceV2,
  "requiresLocalSeparation"
> & { result: number };

function appearanceRequest(die: RenderDieV2): AppearanceRequest {
  const appearance = die.appearance;
  return {
    result: die.result,
    primaryColor: appearance.primaryColor,
    secondaryColor: appearance.secondaryColor,
    textColor: appearance.textColor,
    outlineColor: appearance.outlineColor,
    fill: appearance.fill,
    fontId: appearance.fontId,
    effect: appearance.effect,
  };
}

function composeAppearanceDie(die: RenderDieV2): string {
  const request = appearanceRequest(die);
  const options = {
    localSeparation: die.appearance.requiresLocalSeparation,
  };
  switch (die.target) {
    case "d4":
      return composeD4AppearanceSvgWithOptions(request, options);
    case "d6":
      return composeD6AppearanceSvgWithOptions(request, options);
    case "d8":
      return composeD8AppearanceSvgWithOptions(request, options);
    case "d10":
      return composeD10AppearanceSvgWithOptions(request, options);
    case "d12":
      return composeD12AppearanceSvgWithOptions(request, options);
    case "d20":
      return composeD20AppearanceSvgWithOptions(request, options);
    case "percentile":
      return composePercentileAppearanceSvgWithOptions(request, options);
    case "fudge":
      return composeFudgeAppearanceSvgWithOptions(request, options);
    case "other":
      return composeOtherAppearanceSvgWithOptions(
        { ...request, sides: die.sides },
        options,
      );
  }
}

export function composeDiceSvgV2(input: ValidationInput): ComposedSvg {
  const request = validateRenderRequestV2(input);
  return composeRenderedDiceGrid(
    request.groups.map((group) =>
      group.map((die) => ({
        svg: composeAppearanceDie(die),
        icons: die.icons,
        target: die.target,
      })),
    ),
  );
}
