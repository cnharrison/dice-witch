import { createHash } from "node:crypto";
import type {
  TexturePlacementV4,
  TextureRasterV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import { createOctahedralTextureAtlasV4 } from "../src/octahedral-texture-atlas";
import {
  createMaterialDirectionTextureV4,
  MATERIAL_DIRECTIONS_V4,
} from "./material-directions";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const placement: TexturePlacementV4 = {
  rotation: 37,
  offsetU: 12_345,
  offsetV: 54_321,
};

describe("CanvasKit V4 octahedral texture atlas", () => {
  it("preprojects a source texture deterministically without mutating it", () => {
    const [, material, palette] = MATERIAL_DIRECTIONS_V4[3];
    const source = createMaterialDirectionTextureV4(3, material, palette);
    const sourceHash = sha256(source.pixels);

    const atlas = createOctahedralTextureAtlasV4(source);

    expect(atlas).toMatchObject({
      version: 1,
      width: 192,
      height: 192,
      colorSpace: "srgb",
      alphaMode: "opaque",
    });
    expect(atlas).not.toBe(source);
    expect(atlas.pixels).not.toBe(source.pixels);
    expect(sha256(atlas.pixels)).toBe(
      "98292dbe258c1334ebef0b70c6075efa66543a66cf348093630ff9f268faf9d2",
    );
    expect(sha256(source.pixels)).toBe(sourceHash);
  });

  it("applies deterministic rotation and offset while preserving source texels", () => {
    const [, material, palette] = MATERIAL_DIRECTIONS_V4[3];
    const source = createMaterialDirectionTextureV4(3, material, palette);
    const sourceHash = sha256(source.pixels);
    const identity = createOctahedralTextureAtlasV4(source);

    const first = createOctahedralTextureAtlasV4(source, placement);
    const second = createOctahedralTextureAtlasV4(source, placement);

    expect(first.pixels).toEqual(second.pixels);
    expect(first.pixels).not.toEqual(identity.pixels);
    expect(sha256(first.pixels)).toBe(
      "275c2552d737485c079ab269c53efcccb25401613cab75cf0ebf1870f5ff5a47",
    );
    expect(sha256(source.pixels)).toBe(sourceHash);
  });

  it("rejects a malformed source texture", () => {
    const malformed = {
      version: 1,
      width: 192,
      height: 192,
      colorSpace: "srgb",
      alphaMode: "opaque",
      pixels: new Uint8Array(4),
    } as TextureRasterV4;

    expect(() => createOctahedralTextureAtlasV4(malformed)).toThrow(
      "V4 octahedral source texture is invalid",
    );
    expect(() =>
      createOctahedralTextureAtlasV4({
        ...malformed,
        width: 1,
        height: 1,
        pixels: new Uint8Array(4),
      } as unknown as TextureRasterV4),
    ).toThrow("V4 octahedral source texture is invalid");
  });
});
