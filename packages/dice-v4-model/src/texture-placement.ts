import { SOURCE_TEXTURE_SIZE_V4 } from "./texture-input";
import type { TexturePlacementV4 } from "./types";

const OFFSET_DIVISOR_V4 = 65_536;

export const IDENTITY_TEXTURE_PLACEMENT_V4: TexturePlacementV4 = Object.freeze({
  rotation: 0,
  offsetU: 0,
  offsetV: 0,
});

export type TexturePlacementUniformsV4 = {
  center: number;
  cosine: number;
  sine: number;
  offsetU: number;
  offsetV: number;
};

function requireTexturePlacementV4(placement: TexturePlacementV4): void {
  if (
    !Number.isInteger(placement.rotation) ||
    placement.rotation < 0 ||
    placement.rotation > 359 ||
    !Number.isInteger(placement.offsetU) ||
    placement.offsetU < 0 ||
    placement.offsetU > 65_535 ||
    !Number.isInteger(placement.offsetV) ||
    placement.offsetV < 0 ||
    placement.offsetV > 65_535
  ) {
    throw new Error("V4 texture placement is invalid");
  }
}

function stableTrigonometricComponent(value: number): number {
  if (Math.abs(value) < 1e-7) return 0;
  if (Math.abs(value - 1) < 1e-7) return 1;
  if (Math.abs(value + 1) < 1e-7) return -1;
  return Math.fround(value);
}

export function texturePlacementUniformsV4(
  placement: TexturePlacementV4,
): TexturePlacementUniformsV4 {
  requireTexturePlacementV4(placement);
  const radians = (placement.rotation * Math.PI) / 180;
  return {
    center: SOURCE_TEXTURE_SIZE_V4 / 2,
    cosine: stableTrigonometricComponent(Math.cos(radians)),
    sine: stableTrigonometricComponent(Math.sin(radians)),
    offsetU: (placement.offsetU * SOURCE_TEXTURE_SIZE_V4) / OFFSET_DIVISOR_V4,
    offsetV: (placement.offsetV * SOURCE_TEXTURE_SIZE_V4) / OFFSET_DIVISOR_V4,
  };
}

export function isIdentityTexturePlacementV4(
  placement: TexturePlacementV4,
): boolean {
  requireTexturePlacementV4(placement);
  return (
    placement.rotation === 0 &&
    placement.offsetU === 0 &&
    placement.offsetV === 0
  );
}

export function texturePlacementKeyV4(
  placement: TexturePlacementV4,
): string {
  requireTexturePlacementV4(placement);
  return `${placement.rotation}:${placement.offsetU}:${placement.offsetV}`;
}

export function transformTextureSampleCoordinateWithUniformsV4(
  x: number,
  y: number,
  {
    center,
    cosine,
    sine,
    offsetU,
    offsetV,
  }: TexturePlacementUniformsV4,
): readonly [number, number] {
  const translatedX = x + 0.5 - center - offsetU;
  const translatedY = y + 0.5 - center - offsetV;
  return [
    cosine * translatedX + sine * translatedY + center - 0.5,
    -sine * translatedX + cosine * translatedY + center - 0.5,
  ];
}

export function transformTextureSampleCoordinateV4(
  x: number,
  y: number,
  placement: TexturePlacementV4,
): readonly [number, number] {
  if (isIdentityTexturePlacementV4(placement)) return [x, y];
  return transformTextureSampleCoordinateWithUniformsV4(
    x,
    y,
    texturePlacementUniformsV4(placement),
  );
}
