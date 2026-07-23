import creepingHorror from "../../dice-svg/assets/DiceWitchCreepingHorror-subset.ttf";
import stencilOps from "../../dice-svg/assets/DiceWitchStencilOps-subset.ttf";
import fontdinerSwanky from "../../dice-svg/assets/FontdinerSwanky-subset.ttf";
import liberationSans from "../../dice-svg/assets/LiberationSans-Bold-subset.ttf";
import luckiestGuy from "../../dice-svg/assets/LuckiestGuy-subset.ttf";
import newRocker from "../../dice-svg/assets/NewRocker-Regular-subset.ttf";
import specialElite from "../../dice-svg/assets/SpecialElite-subset.ttf";
import syncopate from "../../dice-svg/assets/Syncopate-Bold-subset.ttf";
import type { FontIdV4 } from "@dice-witch/dice-v4-model";

export type CanvasKitFontDataV4 = Readonly<Record<FontIdV4, ArrayBuffer>>;

export const CANVASKIT_FONT_DATA_V4: CanvasKitFontDataV4 = Object.freeze({
  "liberation-sans": liberationSans,
  "new-rocker": newRocker,
  "stencil-ops": stencilOps,
  "creeping-horror": creepingHorror,
  "special-elite": specialElite,
  "luckiest-guy": luckiestGuy,
  "fontdiner-swanky": fontdinerSwanky,
  syncopate,
});
