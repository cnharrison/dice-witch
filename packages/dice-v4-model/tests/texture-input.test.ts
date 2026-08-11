import { describe, expect, it } from "vitest";
import {
  PATTERN_IDS_V4,
  SOURCE_TEXTURE_SIZE_V4,
  canonicalTextureGenerationInputV4,
  createTextureGenerationInputV4,
  usesProjectedTextureMappingV4,
  type RenderAppearanceV4,
} from "../src";

function appearance(): RenderAppearanceV4 {
  return {
    material: {
      family: "gemstone",
      stone: "quartz",
      veinDensity: 70,
      finish: "polished",
      textureScale: 125,
    },
    palette: ["#4b176d", "#b46ee8", "#f3dcff"],
    texture: {
      generatorId: "gemstone-v1",
      seed: 0x51ce_b00c,
      scale: 125,
      rotation: 270,
      offsetU: 12_345,
      offsetV: 54_321,
    },
    lighting: {
      mode: "combined",
      strength: "subtle",
      direction: "upper-left",
    },
    engraving: {
      fontId: "new-rocker",
      finish: "metallic",
      color: "#f3dcff",
    },
    outlineColor: "#000000",
    requiresLocalSeparation: false,
    effect: null,
  };
}

describe("V4 deterministic texture input", () => {
  it("projects only texel-generating fields from the resolved appearance", () => {
    const input = createTextureGenerationInputV4(
      "canvaskit-v4-r32",
      appearance(),
    );
    expect(input).toEqual({
      version: 1,
      width: 192,
      height: 192,
      generatorId: "gemstone-v1",
      seed: 0x51ce_b00c,
      material: appearance().material,
      palette: ["#4b176d", "#b46ee8", "#f3dcff"],
    });
    expect(SOURCE_TEXTURE_SIZE_V4).toBe(192);
    expect(
      createTextureGenerationInputV4("canvaskit-v4-r33", appearance()).version,
    ).toBe(2);
  });

  it("keeps r4-r6 projected patterns immutable and maps r7 patterns onto the die surface", () => {
    const gradient = appearance();
    gradient.material = {
      family: "classic",
      treatment: "gradient",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    };
    gradient.texture.scope = "die-wide";

    expect(
      usesProjectedTextureMappingV4("canvaskit-v4-r4", gradient),
    ).toBe(true);
    expect(
      usesProjectedTextureMappingV4("canvaskit-v4-r5", gradient),
    ).toBe(true);
    expect(
      usesProjectedTextureMappingV4("canvaskit-v4-r6", gradient),
    ).toBe(true);
    expect(
      usesProjectedTextureMappingV4("canvaskit-v4-r7", gradient),
    ).toBe(true);
    expect(
      usesProjectedTextureMappingV4("canvaskit-v4-r3", gradient),
    ).toBe(false);
    gradient.texture.scope = "face-local";
    expect(
      usesProjectedTextureMappingV4("canvaskit-v4-r4", gradient),
    ).toBe(false);
    expect(
      usesProjectedTextureMappingV4("canvaskit-v4-r5", gradient),
    ).toBe(false);
    expect(
      usesProjectedTextureMappingV4("canvaskit-v4-r6", gradient),
    ).toBe(false);
    expect(
      usesProjectedTextureMappingV4("canvaskit-v4-r7", gradient),
    ).toBe(false);
    gradient.texture.scope = "die-wide";
    for (const patternId of PATTERN_IDS_V4) {
      gradient.material = {
        family: "classic",
        treatment: "pattern",
        patternId,
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      };
      expect(
        usesProjectedTextureMappingV4("canvaskit-v4-r4", gradient),
      ).toBe(true);
      expect(
        usesProjectedTextureMappingV4("canvaskit-v4-r5", gradient),
      ).toBe(true);
      expect(
        usesProjectedTextureMappingV4("canvaskit-v4-r6", gradient),
      ).toBe(true);
      expect(
        usesProjectedTextureMappingV4("canvaskit-v4-r7", gradient),
      ).toBe(false);
    }
  });

  it("projects bounded classic solids only in r29 and r30", () => {
    const solid = appearance();
    solid.material = {
      family: "classic",
      treatment: "solid",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    };
    solid.texture.scope = "die-wide";

    expect(usesProjectedTextureMappingV4("canvaskit-v4-r28", solid)).toBe(
      false,
    );
    expect(usesProjectedTextureMappingV4("canvaskit-v4-r29", solid)).toBe(
      false,
    );
    solid.texture.scope = "bounded-die-wide";
    expect(usesProjectedTextureMappingV4("canvaskit-v4-r28", solid)).toBe(
      false,
    );
    expect(usesProjectedTextureMappingV4("canvaskit-v4-r29", solid)).toBe(
      true,
    );
    expect(usesProjectedTextureMappingV4("canvaskit-v4-r30", solid)).toBe(
      true,
    );
    expect(usesProjectedTextureMappingV4("canvaskit-v4-r31", solid)).toBe(
      false,
    );
    solid.texture.scope = "face-local";
    expect(usesProjectedTextureMappingV4("canvaskit-v4-r29", solid)).toBe(
      false,
    );
  });

  it("canonicalizes identical texel inputs independently of render transforms", () => {
    const first = appearance();
    first.texture.scope = "die-wide";
    const second = appearance();
    second.texture = {
      ...second.texture,
      rotation: 15,
      offsetU: 1,
      offsetV: 2,
      scope: "face-local",
    };
    second.lighting = {
      mode: "combined",
      strength: "strong",
      direction: "upper-left",
    };

    expect(canonicalTextureGenerationInputV4("canvaskit-v4-r32", first)).toBe(
      canonicalTextureGenerationInputV4("canvaskit-v4-r32", second),
    );
    expect(canonicalTextureGenerationInputV4("canvaskit-v4-r32", first)).toBe(
      '{"generatorId":"gemstone-v1","height":192,"material":{"family":"gemstone","finish":"polished","stone":"quartz","textureScale":125,"veinDensity":70},"palette":["#4b176d","#b46ee8","#f3dcff"],"seed":1372499980,"version":1,"width":192}',
    );
  });
});
