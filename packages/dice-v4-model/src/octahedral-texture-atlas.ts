import {
  SOURCE_TEXTURE_SIZE_V4,
  type TextureRasterV4,
} from "./texture-input";
import {
  IDENTITY_TEXTURE_PLACEMENT_V4,
  isIdentityTexturePlacementV4,
  texturePlacementUniformsV4,
  transformTextureSampleCoordinateWithUniformsV4,
} from "./texture-placement";
import type { TexturePlacementV4 } from "./types";

type OctahedralTextureMappingV4 = {
  x: Float32Array;
  y: Float32Array;
  weight: Float32Array;
};

let cachedMapping: OctahedralTextureMappingV4 | undefined;

function eighthPower(value: number): number {
  const squared = value * value;
  const fourth = squared * squared;
  return fourth * fourth;
}

function createMapping(): OctahedralTextureMappingV4 {
  const size = SOURCE_TEXTURE_SIZE_V4;
  const sampleCount = size * size * 3;
  const x = new Float32Array(sampleCount);
  const y = new Float32Array(sampleCount);
  const weight = new Float32Array(sampleCount);

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      let directionX = ((pixelX + 0.5) / size) * 2 - 1;
      let directionY = ((pixelY + 0.5) / size) * 2 - 1;
      let directionZ = 1 - Math.abs(directionX) - Math.abs(directionY);
      if (directionZ < 0) {
        const unfoldedX = directionX;
        directionX =
          (1 - Math.abs(directionY)) * (unfoldedX >= 0 ? 1 : -1);
        directionY =
          (1 - Math.abs(unfoldedX)) * (directionY >= 0 ? 1 : -1);
      }
      const length = Math.hypot(directionX, directionY, directionZ);
      directionX /= length;
      directionY /= length;
      directionZ /= length;

      const weightX = eighthPower(Math.abs(directionX));
      const weightY = eighthPower(Math.abs(directionY));
      const weightZ = eighthPower(Math.abs(directionZ));
      const totalWeight = weightX + weightY + weightZ;
      const offset = (pixelY * size + pixelX) * 3;
      // CanvasKit evaluates the effect at pixel centers; subtracting 0.5
      // converts image-shader coordinates back to source pixel indices.
      x[offset] = (directionY * 0.5 + 0.5) * size - 0.5;
      y[offset] = (directionZ * 0.5 + 0.5) * size - 0.5;
      weight[offset] = weightX / totalWeight;
      x[offset + 1] = (directionX * 0.5 + 0.5) * size - 0.5;
      y[offset + 1] = (directionZ * 0.5 + 0.5) * size - 0.5;
      weight[offset + 1] = weightY / totalWeight;
      x[offset + 2] = (directionX * 0.5 + 0.5) * size - 0.5;
      y[offset + 2] = (directionY * 0.5 + 0.5) * size - 0.5;
      weight[offset + 2] = weightZ / totalWeight;
    }
  }
  return { x, y, weight };
}

function mapping(): OctahedralTextureMappingV4 {
  cachedMapping ??= createMapping();
  return cachedMapping;
}

function wrap(value: number, size: number): number {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
}

export function createOctahedralTextureAtlasV4(
  texture: TextureRasterV4,
  placement: TexturePlacementV4 = IDENTITY_TEXTURE_PLACEMENT_V4,
): TextureRasterV4 {
  const width: number = texture.width;
  const height: number = texture.height;
  const version = texture.version as number;
  const colorSpace = texture.colorSpace as string;
  const alphaMode = texture.alphaMode as string;
  if (
    (version !== 1 && version !== 2) ||
    width !== SOURCE_TEXTURE_SIZE_V4 ||
    height !== SOURCE_TEXTURE_SIZE_V4 ||
    colorSpace !== "srgb" ||
    alphaMode !== "opaque" ||
    texture.pixels.length !== width * height * 4
  ) {
    throw new Error("V4 octahedral source texture is invalid");
  }
  const samples = mapping();
  const placementUniforms = isIdentityTexturePlacementV4(placement)
    ? undefined
    : texturePlacementUniformsV4(placement);
  const source = texture.pixels;
  const pixels = new Uint8Array(source.length);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const destination = pixel * 4;
    for (let plane = 0; plane < 3; plane += 1) {
      const sample = pixel * 3 + plane;
      const sampleWeight = samples.weight[sample] as number;
      const sourceX = samples.x[sample] as number;
      const sourceY = samples.y[sample] as number;
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
      for (let channel = 0; channel < 3; channel += 1) {
        const topLeftValue = source[topLeft + channel] as number;
        const topRightValue = source[topRight + channel] as number;
        const bottomLeftValue = source[bottomLeft + channel] as number;
        const bottomRightValue = source[bottomRight + channel] as number;
        const top =
          topLeftValue + (topRightValue - topLeftValue) * amountX;
        const bottom =
          bottomLeftValue + (bottomRightValue - bottomLeftValue) * amountX;
        // Byte accumulation is intentional and pinned by the direct-versus-
        // preprojected visual corpus; it avoids a second full-size float image.
        pixels[destination + channel] =
          (pixels[destination + channel] as number) +
          (top + (bottom - top) * amountY) * sampleWeight;
      }
    }
    pixels[destination + 3] = 255;
  }
  return { ...texture, pixels };
}
