import creepingHorror from "../assets/DiceWitchCreepingHorror-subset.ttf";
import stencilOps from "../assets/DiceWitchStencilOps-subset.ttf";
import fontdinerSwanky from "../assets/FontdinerSwanky-subset.ttf";
import liberationSansBold from "../assets/LiberationSans-Bold-subset.ttf";
import luckiestGuy from "../assets/LuckiestGuy-subset.ttf";
import newRocker from "../assets/NewRocker-Regular-subset.ttf";
import specialElite from "../assets/SpecialElite-subset.ttf";
import syncopate from "../assets/Syncopate-Bold-subset.ttf";
import { composeDiceSvg } from "./compose";
import { composeDiceSvgV2 } from "./composeV2";
import { composeBlankDiceSvgV3, composeDiceSvgV3 } from "./composeV3";
import {
  composeD4AppearanceSvg,
  composeD8AppearanceSvg,
  composeD10AppearanceSvg,
  composeD12AppearanceSvg,
  type D4AppearanceRequest,
  type D8AppearanceRequest,
  type D10AppearanceRequest,
  type D12AppearanceRequest,
} from "./dice/generatePolyhedralAppearance";
import {
  composeFudgeAppearanceSvg,
  composeOtherAppearanceSvg,
  composePercentileAppearanceSvg,
  type FudgeAppearanceRequest,
  type OtherAppearanceRequest,
  type PercentileAppearanceRequest,
} from "./dice/generateSpecialAppearance";
import {
  composeD6AppearanceSvg,
  type D6AppearanceRequest,
} from "./dice/generateD6Appearance";
import {
  composeD20AppearanceSvg,
  type D20AppearanceRequest,
} from "./dice/generateD20Appearance";
import { renderSvgToPng } from "./rasterize";
import type {
  RenderResult,
  RenderResultV2,
  RenderResultV3,
} from "./types";

const EMBEDDED_FONT_BUFFERS = [
  liberationSansBold,
  newRocker,
  stencilOps,
  creepingHorror,
  specialElite,
  luckiestGuy,
  fontdinerSwanky,
  syncopate,
].map((font) => new Uint8Array(font));

export async function renderComposedSvgToPng(svg: string): Promise<Uint8Array> {
  return renderSvgToPng(svg, {
    font: {
      fontBuffers: EMBEDDED_FONT_BUFFERS,
      defaultFontFamily: "Liberation Sans",
      sansSerifFamily: "Liberation Sans",
    },
    fitTo: { mode: "original" },
  });
}

export function renderD4AppearanceToPng(
  request: D4AppearanceRequest,
): Promise<Uint8Array> {
  return renderComposedSvgToPng(composeD4AppearanceSvg(request));
}

export function renderD6AppearanceToPng(
  request: D6AppearanceRequest,
): Promise<Uint8Array> {
  return renderComposedSvgToPng(composeD6AppearanceSvg(request));
}

export function renderD8AppearanceToPng(
  request: D8AppearanceRequest,
): Promise<Uint8Array> {
  return renderComposedSvgToPng(composeD8AppearanceSvg(request));
}

export function renderD10AppearanceToPng(
  request: D10AppearanceRequest,
): Promise<Uint8Array> {
  return renderComposedSvgToPng(composeD10AppearanceSvg(request));
}

export function renderD12AppearanceToPng(
  request: D12AppearanceRequest,
): Promise<Uint8Array> {
  return renderComposedSvgToPng(composeD12AppearanceSvg(request));
}

export function renderD20AppearanceToPng(
  request: D20AppearanceRequest,
): Promise<Uint8Array> {
  return renderComposedSvgToPng(composeD20AppearanceSvg(request));
}

export function renderFudgeAppearanceToPng(
  request: FudgeAppearanceRequest,
): Promise<Uint8Array> {
  return renderComposedSvgToPng(composeFudgeAppearanceSvg(request));
}

export function renderOtherAppearanceToPng(
  request: OtherAppearanceRequest,
): Promise<Uint8Array> {
  return renderComposedSvgToPng(composeOtherAppearanceSvg(request));
}

export function renderPercentileAppearanceToPng(
  request: PercentileAppearanceRequest,
): Promise<Uint8Array> {
  return renderComposedSvgToPng(composePercentileAppearanceSvg(request));
}

export async function renderDiceRequestV2ToPng(
  input: unknown,
): Promise<RenderResultV2> {
  const composed = composeDiceSvgV2(input);
  const png = await renderComposedSvgToPng(composed.svg);
  return {
    version: 2,
    png,
    width: composed.width,
    height: composed.height,
    diceCount: composed.diceCount,
    rowCount: composed.rowCount,
  };
}

async function renderComposedDiceV3ToPng(
  composed: ReturnType<typeof composeDiceSvgV3>,
): Promise<RenderResultV3> {
  const png = await renderComposedSvgToPng(composed.svg);
  return {
    version: 3,
    png,
    width: composed.width,
    height: composed.height,
    diceCount: composed.diceCount,
    rowCount: composed.rowCount,
  };
}

export async function renderDiceRequestV3ToPng(
  input: unknown,
): Promise<RenderResultV3> {
  return renderComposedDiceV3ToPng(composeDiceSvgV3(input));
}

export async function renderBlankDiceRequestV3ToPng(
  input: unknown,
): Promise<RenderResultV3> {
  return renderComposedDiceV3ToPng(composeBlankDiceSvgV3(input));
}

export async function renderDiceToPng(input: unknown): Promise<RenderResult> {
  const composed = composeDiceSvg(input);
  const png = await renderComposedSvgToPng(composed.svg);

  return {
    version: 1,
    png,
    width: composed.width,
    height: composed.height,
    diceCount: composed.diceCount,
    rowCount: composed.rowCount,
  };
}
