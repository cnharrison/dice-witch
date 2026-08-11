import type { FontIdV4 } from "@dice-witch/dice-v4-model";
import creepingHorrorUrl from "../../../../cloudflare/packages/dice-svg/assets/DiceWitchCreepingHorror-subset.ttf?url";
import stencilOpsUrl from "../../../../cloudflare/packages/dice-svg/assets/DiceWitchStencilOps-subset.ttf?url";
import fontdinerSwankyUrl from "../../../../cloudflare/packages/dice-svg/assets/FontdinerSwanky-subset.ttf?url";
import liberationSansUrl from "../../../../cloudflare/packages/dice-svg/assets/LiberationSans-Bold-subset.ttf?url";
import luckiestGuyUrl from "../../../../cloudflare/packages/dice-svg/assets/LuckiestGuy-subset.ttf?url";
import newRockerUrl from "../../../../cloudflare/packages/dice-svg/assets/NewRocker-Regular-subset.ttf?url";
import specialEliteUrl from "../../../../cloudflare/packages/dice-svg/assets/SpecialElite-subset.ttf?url";
import syncopateUrl from "../../../../cloudflare/packages/dice-svg/assets/Syncopate-Bold-subset.ttf?url";
import sourceSans3Url from "../../../../cloudflare/packages/dice-svg/assets/SourceSans3-SemiBold-subset.ttf?url";
import cinzelUrl from "../../../../cloudflare/packages/dice-svg/assets/Cinzel-SemiBold-subset.ttf?url";
import barlowCondensedUrl from "../../../../cloudflare/packages/dice-svg/assets/BarlowCondensed-SemiBold-subset.ttf?url";
import zillaSlabUrl from "../../../../cloudflare/packages/dice-svg/assets/ZillaSlab-SemiBold-subset.ttf?url";
import spaceGroteskUrl from "../../../../cloudflare/packages/dice-svg/assets/SpaceGrotesk-SemiBold-subset.ttf?url";
import frauncesUrl from "../../../../cloudflare/packages/dice-svg/assets/Fraunces-SemiBold-subset.ttf?url";
import bricolageGrotesqueUrl from "../../../../cloudflare/packages/dice-svg/assets/BricolageGrotesque-SemiBold-subset.ttf?url";
import alcarinTengwarUrl from "@/assets/fonts/appearance/AlcarinTengwar-Bold-ui.ttf?url";

const FONT_URLS_V4: Readonly<Record<FontIdV4, string>> = Object.freeze({
  "liberation-sans": liberationSansUrl,
  "new-rocker": newRockerUrl,
  "stencil-ops": stencilOpsUrl,
  "creeping-horror": creepingHorrorUrl,
  "special-elite": specialEliteUrl,
  "luckiest-guy": luckiestGuyUrl,
  "fontdiner-swanky": fontdinerSwankyUrl,
  syncopate: syncopateUrl,
  "source-sans-3": sourceSans3Url,
  cinzel: cinzelUrl,
  "barlow-condensed": barlowCondensedUrl,
  "zilla-slab": zillaSlabUrl,
  "space-grotesk": spaceGroteskUrl,
  fraunces: frauncesUrl,
  "bricolage-grotesque": bricolageGrotesqueUrl,
  "alcarin-tengwar": alcarinTengwarUrl,
});

const loadedFonts = new Map<FontIdV4, Promise<string>>();

export function browserFontFamilyV4(fontId: FontIdV4): string {
  return `DiceWitchV4-${fontId}`;
}

export function loadBrowserFontV4(fontId: FontIdV4): Promise<string> {
  let loading = loadedFonts.get(fontId);
  if (loading !== undefined) return loading;
  loading = (async () => {
    const family = browserFontFamilyV4(fontId);
    const face = await new FontFace(family, `url(${FONT_URLS_V4[fontId]})`).load();
    document.fonts.add(face);
    return family;
  })();
  loadedFonts.set(fontId, loading);
  void loading.catch(() => {
    if (loadedFonts.get(fontId) === loading) loadedFonts.delete(fontId);
  });
  return loading;
}
