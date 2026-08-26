import { createHash } from "node:crypto";
import type {
  TexturePlacementV4,
  TextureRasterV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import {
  createSphericalMaterialRasterV4,
  SPHERICAL_MATERIAL_RASTER_SIZE_V4,
} from "../src/spherical-material-raster";
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

describe("CanvasKit V4 spherical material raster", () => {
  it("preprojects a source texture without mutating it", () => {
    const [, material, palette] = MATERIAL_DIRECTIONS_V4[3];
    const source = createMaterialDirectionTextureV4(3, material, palette);
    const sourceHash = sha256(source.pixels);

    const raster = createSphericalMaterialRasterV4(source);

    expect(raster).toMatchObject({
      width: SPHERICAL_MATERIAL_RASTER_SIZE_V4,
      height: SPHERICAL_MATERIAL_RASTER_SIZE_V4,
    });
    expect(sha256(raster.pixels)).toBe(
      "6d68cd35f60cc9841be324b277414638ac42187819db550c8512567ff956f0f6",
    );
    expect(sha256(source.pixels)).toBe(sourceHash);
  });

  it("applies deterministic rotation and offset while preserving source texels", () => {
    const [, material, palette] = MATERIAL_DIRECTIONS_V4[3];
    const source = createMaterialDirectionTextureV4(3, material, palette);
    const sourceHash = sha256(source.pixels);
    const identity = createSphericalMaterialRasterV4(source);

    const first = createSphericalMaterialRasterV4(
      source,
      undefined,
      undefined,
      placement,
    );
    const second = createSphericalMaterialRasterV4(
      source,
      undefined,
      undefined,
      placement,
    );

    expect(first.pixels).toEqual(second.pixels);
    expect(first.pixels).not.toEqual(identity.pixels);
    expect(sha256(first.pixels)).toBe(
      "a5d5840ff2b6a0c312d46fde0d31475d09c3ee14facb0cf7dcc02714cdfa1958",
    );
    expect(sha256(source.pixels)).toBe(sourceHash);
  });

  it("rejects a malformed source texture", () => {
    const malformed: TextureRasterV4 = {
      version: 1,
      width: 192,
      height: 192,
      colorSpace: "srgb",
      alphaMode: "opaque",
      pixels: new Uint8Array(4),
    };

    expect(() => createSphericalMaterialRasterV4(malformed)).toThrow(
      "CanvasKit V4 spherical source texture is invalid",
    );
    const malformedDimensions = {
      ...malformed,
      pixels: new Uint8Array(4),
    };
    Object.assign(malformedDimensions, { width: 1, height: 1 });
    expect(() =>
      createSphericalMaterialRasterV4(malformedDimensions),
    ).toThrow("CanvasKit V4 spherical source texture is invalid");
  });
});
