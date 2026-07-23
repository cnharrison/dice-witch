import { CANVASKIT_FONT_DATA_V4 } from "./font-assets";
import {
  CanvasKitDiceRequestRendererV4,
  type DiceRequestRendererV4,
} from "./render-request";
import { loadCanvasKitV4 } from "./runtime";

export async function createCanvasKitRequestRendererV4(): Promise<
  DiceRequestRendererV4
> {
  return new CanvasKitDiceRequestRendererV4({
    canvasKit: await loadCanvasKitV4(),
    defaultFontId: "liberation-sans",
    fontDataById: CANVASKIT_FONT_DATA_V4,
  });
}
