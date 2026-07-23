import { SOURCE_TEXTURE_SIZE_V4 } from "./texture-input";

export type TextureColorV4 = number;

const BYTE_MAX = 255;
const TEXTURE_PERIOD_V4 = SOURCE_TEXTURE_SIZE_V4 - 1;

function byte(value: number): number {
  return Math.max(0, Math.min(BYTE_MAX, Math.round(value)));
}

function wrap(value: number, period: number): number {
  const remainder = value % period;
  return remainder < 0 ? remainder + period : remainder;
}

function hash32(value: number): number {
  let hash = value >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb_352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846c_a68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function textureHashV4(
  seed: number,
  x: number,
  y: number,
  salt = 0,
): number {
  return hash32(
    seed ^
      Math.imul(x, 0x9e37_79b1) ^
      Math.imul(y, 0x85eb_ca77) ^
      Math.imul(salt, 0xc2b2_ae3d),
  );
}

function interpolateByte(from: number, to: number, amount: number): number {
  return byte((from * (BYTE_MAX - amount) + to * amount) / BYTE_MAX);
}

function fadeByte(value: number): number {
  return byte(
    (value * value * (3 * BYTE_MAX - 2 * value)) /
      (BYTE_MAX * BYTE_MAX),
  );
}

function createNoiseCurve(
  seed: number,
  cells: number,
  salt: number,
): Uint8Array {
  const lattice = Array.from(
    { length: cells },
    (_, index) => textureHashV4(seed, index, cells, salt) & BYTE_MAX,
  );
  const curve = new Uint8Array(SOURCE_TEXTURE_SIZE_V4);
  for (let coordinate = 0; coordinate < SOURCE_TEXTURE_SIZE_V4; coordinate += 1) {
    const scaled = (coordinate * cells * 256) / TEXTURE_PERIOD_V4;
    const index = Math.floor(scaled / 256);
    const from = lattice[wrap(index, cells)];
    const to = lattice[wrap(index + 1, cells)];
    if (from === undefined || to === undefined) {
      throw new Error("Texture noise curve lookup failed");
    }
    curve[coordinate] = interpolateByte(
      from,
      to,
      fadeByte(Math.floor(scaled - index * 256)),
    );
  }
  return curve;
}

export type TextureNoiseSamplerV4 = (x: number, y: number) => number;

export function createTextureNoiseSamplerV4(
  seed: number,
  salt: number,
): TextureNoiseSamplerV4 {
  const horizontal = createNoiseCurve(seed, 5, salt);
  const vertical = createNoiseCurve(seed, 7, salt + 1);
  const diagonal = createNoiseCurve(seed, 11, salt + 2);
  return (x, y) => {
    const horizontalValue = horizontal[x];
    const verticalValue = vertical[y];
    const diagonalValue = diagonal[
      (textureCoordinateV4(x) + textureCoordinateV4(y)) % TEXTURE_PERIOD_V4
    ];
    if (
      horizontalValue === undefined ||
      verticalValue === undefined ||
      diagonalValue === undefined
    ) {
      throw new Error("Texture noise sampler lookup failed");
    }
    return byte(
      (horizontalValue * 128 + verticalValue * 80 + diagonalValue * 48) /
        256,
    );
  };
}

export function textureColorV4(
  red: number,
  green: number,
  blue: number,
): TextureColorV4 {
  return (byte(red) << 16) | (byte(green) << 8) | byte(blue);
}

export function parseTextureColorV4(value: string): TextureColorV4 {
  return Number.parseInt(value.slice(1), 16);
}

export function mixTextureColorV4(
  from: TextureColorV4,
  to: TextureColorV4,
  amount: number,
): TextureColorV4 {
  return textureColorV4(
    interpolateByte((from >>> 16) & BYTE_MAX, (to >>> 16) & BYTE_MAX, amount),
    interpolateByte((from >>> 8) & BYTE_MAX, (to >>> 8) & BYTE_MAX, amount),
    interpolateByte(from & BYTE_MAX, to & BYTE_MAX, amount),
  );
}

export function paletteTextureColorV4(
  palette: readonly TextureColorV4[],
  amount: number,
): TextureColorV4 {
  const bounded = byte(amount);
  const scaled = bounded * (palette.length - 1);
  const index = Math.min(palette.length - 2, Math.floor(scaled / BYTE_MAX));
  const from = palette[index];
  const to = palette[index + 1];
  if (from === undefined || to === undefined) {
    throw new Error("Texture palette interpolation failed");
  }
  return mixTextureColorV4(from, to, scaled - index * BYTE_MAX);
}

export function shadeTextureColorV4(
  color: TextureColorV4,
  amount: number,
): TextureColorV4 {
  if (amount === 0) return color;
  const target = amount > 0 ? 0xff_ff_ff : 0;
  return mixTextureColorV4(color, target, Math.min(255, Math.abs(amount)));
}

export function textureCoordinateV4(value: number): number {
  return value === TEXTURE_PERIOD_V4 ? 0 : value;
}

export function texturePeriodV4(): number {
  return TEXTURE_PERIOD_V4;
}
