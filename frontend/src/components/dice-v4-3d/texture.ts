import {
  SOURCE_TEXTURE_SIZE_V4,
  createOctahedralTextureAtlasV4,
  createTextureGenerationInputV4,
  generateMaterialTextureV4,
  rendererRevisionPolicyV4,
  transformTextureSampleCoordinateV4,
  usesProjectedTextureMappingV4,
  type PolyhedralGeometryDescriptorV4,
  type RenderAppearanceV4,
  type RendererRevisionV4,
  type TextureColorPolicyV4,
  type TexturePlacementV4,
  type TextureRasterV4,
} from "@dice-witch/dice-v4-model";
import {
  DataTexture,
  LinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";

export function placedTextureUvV4(
  u: number,
  v: number,
  placement: TexturePlacementV4,
): readonly [number, number] {
  const [x, y] = transformTextureSampleCoordinateV4(
    u * SOURCE_TEXTURE_SIZE_V4 - 0.5,
    v * SOURCE_TEXTURE_SIZE_V4 - 0.5,
    placement,
  );
  return [
    (x + 0.5) / SOURCE_TEXTURE_SIZE_V4,
    (y + 0.5) / SOURCE_TEXTURE_SIZE_V4,
  ];
}

export function createRasterDataTextureV4(
  raster: TextureRasterV4,
  name: string,
): DataTexture {
  const texture = new DataTexture(
    raster.pixels,
    raster.width,
    raster.height,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.name = name;
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function textureColorPolicyV4(
  rendererRevision?: RendererRevisionV4,
): TextureColorPolicyV4 {
  return rendererRevision === undefined
    ? "legacy"
    : rendererRevisionPolicyV4(rendererRevision).textureColors;
}

export function createMaterialRasterV4(
  appearance: RenderAppearanceV4,
  rendererRevision?: RendererRevisionV4,
): TextureRasterV4 {
  return generateMaterialTextureV4(
    createTextureGenerationInputV4(
      rendererRevision ?? "canvaskit-v4-r1",
      appearance,
    ),
    textureColorPolicyV4(rendererRevision),
  );
}

export function createMaterialDataTextureV4(
  appearance: RenderAppearanceV4,
  rendererRevision?: RendererRevisionV4,
): DataTexture {
  const raster = createMaterialRasterV4(appearance, rendererRevision);
  return createRasterDataTextureV4(
    raster,
    `dice-v4-${appearance.texture.generatorId}-${appearance.texture.seed}`,
  );
}

export function createPhysicalMaterialRasterV4(
  appearance: RenderAppearanceV4,
  descriptor: PolyhedralGeometryDescriptorV4,
  rendererRevision?: RendererRevisionV4,
  source?: TextureRasterV4,
): TextureRasterV4 {
  if (appearance.texture.scope === "face-local") {
    throw new Error("Three.js V4 face-local physical mapping is not implemented");
  }
  const materialSource =
    source ?? createMaterialRasterV4(appearance, rendererRevision);
  return descriptor.skinMapping.kind === "view-octahedral" &&
    (rendererRevision === undefined ||
      !usesProjectedTextureMappingV4(rendererRevision, appearance))
    ? createOctahedralTextureAtlasV4(materialSource, appearance.texture)
    : materialSource;
}

export function createPhysicalMaterialDataTextureV4(
  appearance: RenderAppearanceV4,
  descriptor: PolyhedralGeometryDescriptorV4,
  rendererRevision?: RendererRevisionV4,
): DataTexture {
  return createRasterDataTextureV4(
    createPhysicalMaterialRasterV4(
      appearance,
      descriptor,
      rendererRevision,
    ),
    `dice-v4-${descriptor.id}-${appearance.texture.generatorId}-${appearance.texture.seed}`,
  );
}
