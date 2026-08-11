import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SOURCE_TEXTURE_SIZE_V4,
  createOctahedralTextureAtlasV4,
  type TextureRasterV4,
} from "../src";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceTexture(): TextureRasterV4 {
  const pixels = new Uint8Array(SOURCE_TEXTURE_SIZE_V4 ** 2 * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    const pixel = index / 4;
    pixels[index] = (pixel * 17) % 256;
    pixels[index + 1] = (pixel * 29) % 256;
    pixels[index + 2] = (pixel * 43) % 256;
    pixels[index + 3] = 255;
  }
  return {
    version: 1,
    width: SOURCE_TEXTURE_SIZE_V4,
    height: SOURCE_TEXTURE_SIZE_V4,
    colorSpace: "srgb",
    alphaMode: "opaque",
    pixels,
  };
}

describe("browser-neutral V4 octahedral texture atlas", () => {
  it("preprojects deterministic bytes without mutating the source", () => {
    const source = sourceTexture();
    const sourceHash = sha256(source.pixels);
    const first = createOctahedralTextureAtlasV4(source, {
      rotation: 37,
      offsetU: 12_345,
      offsetV: 54_321,
    });
    const second = createOctahedralTextureAtlasV4(source, {
      rotation: 37,
      offsetU: 12_345,
      offsetV: 54_321,
    });

    expect(first).toMatchObject({
      version: 1,
      width: 192,
      height: 192,
      colorSpace: "srgb",
      alphaMode: "opaque",
    });
    expect(first).not.toBe(source);
    expect(first.pixels).not.toBe(source.pixels);
    expect(first.pixels).toEqual(second.pixels);
    expect(sha256(first.pixels)).toBe(
      "88739a724e7221a9ff31a97901fa745b42441b7f8844dc903723593e5945245c",
    );
    expect(sha256(source.pixels)).toBe(sourceHash);

    const revision2 = createOctahedralTextureAtlasV4({
      ...source,
      version: 2,
    });
    expect(revision2.version).toBe(2);
    expect(revision2.pixels).not.toEqual(source.pixels);
  });

  it("rejects invalid raster metadata and dimensions", () => {
    const source = sourceTexture();
    const invalidValues = [
      { ...source, version: 3 },
      { ...source, colorSpace: "display-p3" },
      { ...source, alphaMode: "premultiplied" },
      { ...source, width: 1 },
      { ...source, pixels: new Uint8Array(4) },
    ];

    for (const invalid of invalidValues) {
      expect(() =>
        createOctahedralTextureAtlasV4(invalid as TextureRasterV4),
      ).toThrow("V4 octahedral source texture is invalid");
    }
  });
});
