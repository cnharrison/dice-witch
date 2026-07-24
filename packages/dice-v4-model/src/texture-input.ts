import { canonicalJsonV4 } from "./random";
import type {
  AppearanceMaterialV4,
  RenderAppearanceV4,
  RendererRevisionV4,
  TextureGeneratorIdV4,
} from "./types";

export const SOURCE_TEXTURE_SIZE_V4 = 192;

export type TextureGenerationInputV4 = {
  version: 1;
  width: typeof SOURCE_TEXTURE_SIZE_V4;
  height: typeof SOURCE_TEXTURE_SIZE_V4;
  generatorId: TextureGeneratorIdV4;
  seed: number;
  material: AppearanceMaterialV4;
  palette: readonly string[];
};

export type TextureRasterV4 = {
  version: 1;
  width: typeof SOURCE_TEXTURE_SIZE_V4;
  height: typeof SOURCE_TEXTURE_SIZE_V4;
  colorSpace: "srgb";
  alphaMode: "opaque";
  pixels: Uint8Array;
};

export function usesProjectedTextureMappingV4(
  rendererRevision: RendererRevisionV4,
  appearance: RenderAppearanceV4,
): boolean {
  if (
    appearance.texture.scope !== "die-wide" ||
    appearance.material.family !== "classic"
  ) {
    return false;
  }
  if (appearance.material.treatment === "gradient") {
    return (
      rendererRevision === "canvaskit-v4-r4" ||
      rendererRevision === "canvaskit-v4-r5" ||
      rendererRevision === "canvaskit-v4-r6" ||
      rendererRevision === "canvaskit-v4-r7"
    );
  }
  return (
    appearance.material.treatment === "pattern" &&
    (rendererRevision === "canvaskit-v4-r4" ||
      rendererRevision === "canvaskit-v4-r5" ||
      rendererRevision === "canvaskit-v4-r6")
  );
}

export function createTextureGenerationInputV4(
  appearance: RenderAppearanceV4,
): TextureGenerationInputV4 {
  return {
    version: 1,
    width: SOURCE_TEXTURE_SIZE_V4,
    height: SOURCE_TEXTURE_SIZE_V4,
    generatorId: appearance.texture.generatorId,
    seed: appearance.texture.seed,
    material: { ...appearance.material },
    palette: [...appearance.palette],
  };
}

export function canonicalTextureGenerationInputV4(
  appearance: RenderAppearanceV4,
): string {
  return canonicalJsonV4(createTextureGenerationInputV4(appearance));
}
