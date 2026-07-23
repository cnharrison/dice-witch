import {
  IDENTITY_TEXTURE_PLACEMENT_V4,
  OTHER_SPHERE_GEOMETRY_V4,
  SOURCE_TEXTURE_SIZE_V4,
  isIdentityTexturePlacementV4,
  texturePlacementUniformsV4,
  transformTextureSampleCoordinateWithUniformsV4,
  type MaterialFamilyV4,
  type RenderLightingV4,
  type TexturePlacementV4,
  type TextureRasterV4,
} from "@dice-witch/dice-v4-model";
import { resolveSphereLightingParametersV4 } from "./lighting";

export const SPHERICAL_MATERIAL_RASTER_SIZE_V4 = 150;

export type SphericalMaterialRasterV4 = {
  width: typeof SPHERICAL_MATERIAL_RASTER_SIZE_V4;
  height: typeof SPHERICAL_MATERIAL_RASTER_SIZE_V4;
  pixels: Uint8Array;
};

type SphericalMaterialMappingV4 = {
  sourceX: Float32Array;
  sourceY: Float32Array;
  visible: Uint8Array;
};

let cachedMapping: SphericalMaterialMappingV4 | undefined;

function createMapping(): SphericalMaterialMappingV4 {
  const size = SPHERICAL_MATERIAL_RASTER_SIZE_V4;
  const pixelCount = size * size;
  const sourceX = new Float32Array(pixelCount);
  const sourceY = new Float32Array(pixelCount);
  const visible = new Uint8Array(pixelCount);
  const center = size / 2;
  const radius =
    (OTHER_SPHERE_GEOMETRY_V4.radius /
      OTHER_SPHERE_GEOMETRY_V4.camera.orthographicHeight) *
    size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Match CanvasKit's pixel-center RuntimeEffect coordinates exactly.
      const pointX = (x + 0.5 - center) / radius;
      const pointY = (y + 0.5 - center) / radius;
      const radiusSquared = pointX * pointX + pointY * pointY;
      if (radiusSquared > 1) continue;

      const z = Math.sqrt(Math.max(0, 1 - radiusSquared));
      const longitude = Math.atan2(pointX, z);
      const latitude = Math.asin(Math.max(-1, Math.min(1, -pointY)));
      const offset = y * size + x;
      sourceX[offset] =
        (0.5 + longitude / (2 * Math.PI)) * SOURCE_TEXTURE_SIZE_V4 - 0.5;
      sourceY[offset] =
        (0.5 - latitude / Math.PI) * SOURCE_TEXTURE_SIZE_V4 - 0.5;
      visible[offset] = 1;
    }
  }
  return { sourceX, sourceY, visible };
}

function mapping(): SphericalMaterialMappingV4 {
  cachedMapping ??= createMapping();
  return cachedMapping;
}

function wrap(value: number, size: number): number {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function createSphericalMaterialRasterV4(
  texture: TextureRasterV4,
  lighting?: RenderLightingV4,
  family?: MaterialFamilyV4,
  placement: TexturePlacementV4 = IDENTITY_TEXTURE_PLACEMENT_V4,
): SphericalMaterialRasterV4 {
  const width: number = texture.width;
  const height: number = texture.height;
  if (
    width !== SOURCE_TEXTURE_SIZE_V4 ||
    height !== SOURCE_TEXTURE_SIZE_V4 ||
    texture.pixels.length !== width * height * 4
  ) {
    throw new Error("CanvasKit V4 spherical source texture is invalid");
  }
  const size = SPHERICAL_MATERIAL_RASTER_SIZE_V4;
  const samples = mapping();
  const placementUniforms = isIdentityTexturePlacementV4(placement)
    ? undefined
    : texturePlacementUniformsV4(placement);
  const parameters = resolveSphereLightingParametersV4(lighting, family);
  const lightLength = Math.hypot(...parameters.lightDirection);
  const lightX = parameters.lightDirection[0] / lightLength;
  const lightY = parameters.lightDirection[1] / lightLength;
  const lightZ = parameters.lightDirection[2] / lightLength;
  const center = size / 2;
  const radius =
    (OTHER_SPHERE_GEOMETRY_V4.radius /
      OTHER_SPHERE_GEOMETRY_V4.camera.orthographicHeight) *
    size;
  const pixels = new Uint8Array(size * size * 4);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    if (samples.visible[pixel] !== 1) continue;
    const sourceX = samples.sourceX[pixel] as number;
    const sourceY = samples.sourceY[pixel] as number;
    let placedX = sourceX;
    let placedY = sourceY;
    if (placementUniforms !== undefined) {
      [placedX, placedY] = transformTextureSampleCoordinateWithUniformsV4(
        sourceX,
        sourceY,
        placementUniforms,
      );
    }
    const wrappedX = wrap(placedX, width);
    const wrappedY = wrap(placedY, height);
    const fromX = Math.floor(wrappedX);
    const fromY = Math.floor(wrappedY);
    const toX = (fromX + 1) % width;
    const toY = (fromY + 1) % height;
    const amountX = wrappedX - fromX;
    const amountY = wrappedY - fromY;
    const topLeft = (fromY * width + fromX) * 4;
    const topRight = (fromY * width + toX) * 4;
    const bottomLeft = (toY * width + fromX) * 4;
    const bottomRight = (toY * width + toX) * 4;
    const output = pixel * 4;
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    const pointX = (x + 0.5 - center) / radius;
    const pointY = (y + 0.5 - center) / radius;
    const z = Math.sqrt(Math.max(0, 1 - pointX * pointX - pointY * pointY));
    const diffuse = Math.max(
      pointX * lightX + -pointY * lightY + z * lightZ,
      0,
    );
    const pixelShade = Math.fround(
      parameters.ambient +
        Math.max(z, 0) * parameters.intrinsic +
        diffuse * parameters.directional,
    );
    const pixelRim = Math.fround(
      (1 - Math.max(z, 0)) ** 2.4 * parameters.rim * 255,
    );
    for (let channel = 0; channel < 3; channel += 1) {
      const topLeftValue = texture.pixels[topLeft + channel] as number;
      const topRightValue = texture.pixels[topRight + channel] as number;
      const bottomLeftValue = texture.pixels[bottomLeft + channel] as number;
      const bottomRightValue = texture.pixels[bottomRight + channel] as number;
      const top = topLeftValue + (topRightValue - topLeftValue) * amountX;
      const bottom =
        bottomLeftValue + (bottomRightValue - bottomLeftValue) * amountX;
      const base = top + (bottom - top) * amountY;
      pixels[output + channel] = byte(base * pixelShade + pixelRim);
    }
    pixels[output + 3] = 255;
  }
  return { width: size, height: size, pixels };
}
