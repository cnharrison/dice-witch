import liberationSansBold from "../assets/LiberationSans-Bold-subset.ttf";
import { composeDiceSvg } from "./compose";
import { renderSvgToPng } from "./rasterize";
import type { RenderResult } from "./types";

export async function renderComposedSvgToPng(svg: string): Promise<Uint8Array> {
  return renderSvgToPng(svg, {
    font: {
      fontBuffers: [new Uint8Array(liberationSansBold)],
      defaultFontFamily: "Liberation Sans",
      sansSerifFamily: "Liberation Sans",
    },
    fitTo: { mode: "original" },
  });
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
