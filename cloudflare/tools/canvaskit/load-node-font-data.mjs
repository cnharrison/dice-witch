import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const assetsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../packages/dice-svg/assets",
);

const FONT_ASSET_FILENAME_BY_ID = Object.freeze({
  "liberation-sans": "LiberationSans-Bold-subset.ttf",
  "new-rocker": "NewRocker-Regular-subset.ttf",
  "stencil-ops": "DiceWitchStencilOps-subset.ttf",
  "creeping-horror": "DiceWitchCreepingHorror-subset.ttf",
  "special-elite": "SpecialElite-subset.ttf",
  "luckiest-guy": "LuckiestGuy-subset.ttf",
  "fontdiner-swanky": "FontdinerSwanky-subset.ttf",
  syncopate: "Syncopate-Bold-subset.ttf",
  "source-sans-3": "SourceSans3-SemiBold-subset.ttf",
  cinzel: "Cinzel-SemiBold-subset.ttf",
  "barlow-condensed": "BarlowCondensed-SemiBold-subset.ttf",
  "zilla-slab": "ZillaSlab-SemiBold-subset.ttf",
  "space-grotesk": "SpaceGrotesk-SemiBold-subset.ttf",
  fraunces: "Fraunces-SemiBold-subset.ttf",
  "bricolage-grotesque": "BricolageGrotesque-SemiBold-subset.ttf",
  "alcarin-tengwar": "AlcarinTengwar-Bold-subset.ttf",
});

export async function loadNodeCanvasKitFontDataV4() {
  const entries = await Promise.all(
    Object.entries(FONT_ASSET_FILENAME_BY_ID).map(async ([fontId, filename]) => {
      const bytes = await readFile(resolve(assetsDirectory, filename));
      return [fontId, Uint8Array.from(bytes).buffer];
    }),
  );
  return Object.freeze(Object.fromEntries(entries));
}
