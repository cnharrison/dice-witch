import creepingHorror from "../../dice-svg/assets/DiceWitchCreepingHorror-subset.ttf";
import stencilOps from "../../dice-svg/assets/DiceWitchStencilOps-subset.ttf";
import fontdinerSwanky from "../../dice-svg/assets/FontdinerSwanky-subset.ttf";
import liberationSans from "../../dice-svg/assets/LiberationSans-Bold-subset.ttf";
import luckiestGuy from "../../dice-svg/assets/LuckiestGuy-subset.ttf";
import newRocker from "../../dice-svg/assets/NewRocker-Regular-subset.ttf";
import specialElite from "../../dice-svg/assets/SpecialElite-subset.ttf";
import syncopate from "../../dice-svg/assets/Syncopate-Bold-subset.ttf";
import sourceSans3 from "../../dice-svg/assets/SourceSans3-SemiBold-subset.ttf";
import cinzel from "../../dice-svg/assets/Cinzel-SemiBold-subset.ttf";
import barlowCondensed from "../../dice-svg/assets/BarlowCondensed-SemiBold-subset.ttf";
import zillaSlab from "../../dice-svg/assets/ZillaSlab-SemiBold-subset.ttf";
import spaceGrotesk from "../../dice-svg/assets/SpaceGrotesk-SemiBold-subset.ttf";
import fraunces from "../../dice-svg/assets/Fraunces-SemiBold-subset.ttf";
import bricolageGrotesque from "../../dice-svg/assets/BricolageGrotesque-SemiBold-subset.ttf";
import alcarinTengwar from "../../dice-svg/assets/AlcarinTengwar-Bold-subset.ttf";
import jetbrainsMono from "../../dice-svg/assets/JetBrainsMono-SemiBold-subset.ttf";
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
  "source-sans-3": sourceSans3,
  cinzel,
  "barlow-condensed": barlowCondensed,
  "zilla-slab": zillaSlab,
  "space-grotesk": spaceGrotesk,
  fraunces,
  "bricolage-grotesque": bricolageGrotesque,
  "alcarin-tengwar": alcarinTengwar,
  "jetbrains-mono": jetbrainsMono,
});
