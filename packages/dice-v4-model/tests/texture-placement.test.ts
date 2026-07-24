import { describe, expect, it } from "vitest";
import {
  IDENTITY_TEXTURE_PLACEMENT_V4,
  SOURCE_TEXTURE_SIZE_V4,
  isIdentityTexturePlacementV4,
  texturePlacementKeyV4,
  texturePlacementUniformsV4,
  transformTextureSampleCoordinateV4,
  type TexturePlacementV4,
} from "../src";

const transformed: TexturePlacementV4 = {
  rotation: 90,
  offsetU: 32_768,
  offsetV: 16_384,
};

describe("V4 texture placement", () => {
  it("preserves identity coordinates exactly", () => {
    expect(isIdentityTexturePlacementV4(IDENTITY_TEXTURE_PLACEMENT_V4)).toBe(
      true,
    );
    expect(
      transformTextureSampleCoordinateV4(
        47.25,
        129.75,
        IDENTITY_TEXTURE_PLACEMENT_V4,
      ),
    ).toEqual([47.25, 129.75]);
    expect(texturePlacementKeyV4(IDENTITY_TEXTURE_PLACEMENT_V4)).toBe(
      "0:0:0",
    );
  });

  it("resolves clockwise visual rotation and normalized artwork offsets", () => {
    expect(texturePlacementUniformsV4(transformed)).toEqual({
      center: SOURCE_TEXTURE_SIZE_V4 / 2,
      cosine: 0,
      sine: 1,
      offsetU: SOURCE_TEXTURE_SIZE_V4 / 2,
      offsetV: SOURCE_TEXTURE_SIZE_V4 / 4,
    });
    expect(texturePlacementKeyV4(transformed)).toBe("90:32768:16384");
    expect(isIdentityTexturePlacementV4(transformed)).toBe(false);

    const centerIndex = SOURCE_TEXTURE_SIZE_V4 / 2 - 0.5;
    const [sourceX, sourceY] = transformTextureSampleCoordinateV4(
      centerIndex + SOURCE_TEXTURE_SIZE_V4 / 2,
      centerIndex + SOURCE_TEXTURE_SIZE_V4 / 4 + 10,
      transformed,
    );
    expect(sourceX).toBeCloseTo(centerIndex + 10, 6);
    expect(sourceY).toBeCloseTo(centerIndex, 6);
  });

  it("rejects placement values outside the persisted V4 contract", () => {
    expect(() =>
      texturePlacementUniformsV4({
        ...IDENTITY_TEXTURE_PLACEMENT_V4,
        rotation: 360,
      }),
    ).toThrow("V4 texture placement is invalid");
    expect(() =>
      texturePlacementKeyV4({
        ...IDENTITY_TEXTURE_PLACEMENT_V4,
        offsetU: -1,
      }),
    ).toThrow("V4 texture placement is invalid");
  });
});
