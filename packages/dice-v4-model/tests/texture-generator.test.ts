import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateMaterialTextureV4,
  PATTERN_IDS_V4,
  SOURCE_TEXTURE_SIZE_V4,
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  WOOD_STYLES_V4,
  type AppearanceMaterialV4,
  type ClassicMaterialV4,
  type TextureGenerationInputV4,
  type WoodMaterialV4,
} from "../src";

const palette = ["#160026", "#00c7df", "#f7df72"] as const;
const materials = [
  {
    family: "classic",
    treatment: "pattern",
    patternId: "checkerboard",
    opacity: "opaque",
    finish: "gloss",
    textureScale: 100,
  },
  {
    family: "sharp-resin",
    style: "clear",
    inclusion: "foil",
    clarity: 84,
    inclusionDensity: 34,
    finish: "polished",
    textureScale: 100,
  },
  {
    family: "liquid-core",
    core: "vortex",
    clarity: 78,
    particleDensity: 42,
    finish: "polished",
    textureScale: 100,
  },
  {
    family: "gemstone",
    stone: "labradorite",
    veinDensity: 48,
    finish: "polished",
    textureScale: 100,
  },
  {
    family: "glass",
    style: "prismatic",
    clarity: 88,
    finish: "polished",
    textureScale: 100,
  },
  {
    family: "stone",
    stone: "marble",
    grainDensity: 52,
    finish: "honed",
    textureScale: 100,
  },
  {
    family: "metal",
    metal: "steel",
    finish: "brushed",
    patinaStrength: 18,
    textureScale: 100,
  },
  {
    family: "hollow-metal",
    construction: "filigree",
    metal: "brass",
    finish: "polished",
    openness: 58,
    textureScale: 100,
  },
  {
    family: "wood",
    wood: "walnut",
    finish: "polished",
    grainDensity: 64,
    textureScale: 100,
  },
  {
    family: "fantasy",
    essence: "corruption",
    intensity: 72,
    finish: "fractured",
    textureScale: 100,
  },
] as const satisfies readonly AppearanceMaterialV4[];

const r32Materials = [
  {
    id: "lava",
    material: {
      family: "elemental",
      style: "lava",
      fissureDensity: 65,
      glowIntensity: 78,
      textureScale: 110,
    },
    palette: ["#0c0909", "#3b2924", "#f24b22", "#ffd16a"],
  },
  {
    id: "sand",
    material: {
      family: "elemental",
      style: "sand",
      grainSize: 78,
      windDirection: -10,
      textureScale: 150,
    },
    palette: ["#9c632b", "#c88c45", "#e4b766", "#f5dc9c"],
  },
  {
    id: "blue-sky",
    material: {
      family: "elemental",
      style: "blue-sky",
      cloudCover: 58,
      horizonHeight: 48,
      textureScale: 240,
    },
    palette: ["#0b68c7", "#2caee8", "#88d2f3", "#f4f9fc"],
  },
  {
    id: "sunset",
    material: {
      family: "elemental",
      style: "sunset",
      cloudCover: 68,
      horizonHeight: 62,
      textureScale: 255,
    },
    palette: ["#4a2782", "#b23f8d", "#ff6858", "#ffd18c"],
  },
  {
    id: "splatter",
    material: {
      family: "paint",
      style: "splatter",
      dropDensity: 64,
      streakLength: 56,
      textureScale: 130,
    },
    palette: ["#eadfc5", "#102d38", "#00a9c2", "#ef3f78", "#f2ad2e"],
  },
] as const satisfies readonly {
  id: string;
  material: AppearanceMaterialV4;
  palette: readonly [string, string, ...string[]];
}[];

function input(
  material: AppearanceMaterialV4,
  seed = 0x1234_5678,
  version: 1 | 2 = 1,
  colors: readonly string[] = palette,
): TextureGenerationInputV4 {
  return {
    version,
    width: SOURCE_TEXTURE_SIZE_V4,
    height: SOURCE_TEXTURE_SIZE_V4,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[material.family],
    seed,
    material,
    palette: colors,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function row(pixels: Uint8Array, y: number): Uint8Array {
  const start = y * 192 * 4;
  return pixels.slice(start, start + 192 * 4);
}

function column(pixels: Uint8Array, x: number): Uint8Array {
  const result = new Uint8Array(192 * 4);
  for (let y = 0; y < 192; y += 1) {
    result.set(pixels.slice((y * 192 + x) * 4, (y * 192 + x + 1) * 4), y * 4);
  }
  return result;
}

function luminanceAt(pixels: Uint8Array, x: number, y: number): number {
  const offset = (y * 192 + x) * 4;
  const red = pixels[offset] ?? 0;
  const green = pixels[offset + 1] ?? 0;
  const blue = pixels[offset + 2] ?? 0;
  return (red * 54 + green * 183 + blue * 19) / 256;
}

function meanChroma(pixels: Uint8Array): number {
  let total = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const channels = [
      pixels[offset] ?? 0,
      pixels[offset + 1] ?? 0,
      pixels[offset + 2] ?? 0,
    ];
    total += Math.max(...channels) - Math.min(...channels);
  }
  return total / (pixels.length / 4);
}

function meanLuminance(pixels: Uint8Array): number {
  let total = 0;
  for (let y = 0; y < 192; y += 1) {
    for (let x = 0; x < 192; x += 1) {
      total += luminanceAt(pixels, x, y);
    }
  }
  return total / (192 * 192);
}

function strongRowTransitions(pixels: Uint8Array, y: number): number {
  let transitions = 0;
  for (let x = 1; x < 192; x += 1) {
    if (Math.abs(luminanceAt(pixels, x, y) - luminanceAt(pixels, x - 1, y)) > 8) {
      transitions += 1;
    }
  }
  return transitions;
}

function grainStatistics(pixels: Uint8Array) {
  let horizontalDifference = 0;
  let verticalDifference = 0;
  let luminanceTotal = 0;
  for (let y = 0; y < 191; y += 1) {
    for (let x = 0; x < 191; x += 1) {
      const value = luminanceAt(pixels, x, y);
      luminanceTotal += value;
      horizontalDifference += Math.abs(luminanceAt(pixels, x + 1, y) - value);
      verticalDifference += Math.abs(luminanceAt(pixels, x, y + 1) - value);
    }
  }
  const pairCount = 191 * 191;
  const centerRow = Array.from({ length: 192 }, (_, x) =>
    luminanceAt(pixels, x, 96),
  );
  const localMinima = centerRow.filter(
    (value, x) =>
      x > 0 &&
      x < centerRow.length - 1 &&
      value < (centerRow[x - 1] ?? value) &&
      value <= (centerRow[x + 1] ?? value),
  ).length;
  return {
    horizontalMean: horizontalDifference / pairCount,
    verticalMean: verticalDifference / pairCount,
    meanLuminance: luminanceTotal / pairCount,
    localMinima,
  };
}

function pixelsEqual(
  pixels: Uint8Array,
  leftX: number,
  leftY: number,
  rightX: number,
  rightY: number,
): boolean {
  const leftOffset = (leftY * 192 + leftX) * 4;
  const rightOffset = (rightY * 192 + rightX) * 4;
  for (let channel = 0; channel < 4; channel += 1) {
    if (pixels[leftOffset + channel] !== pixels[rightOffset + channel]) {
      return false;
    }
  }
  return true;
}

describe("V4 material texture generation", () => {
  it("generates deterministic opaque seamless rasters for every family", () => {
    const hashes: Record<string, string> = {};
    for (const material of materials) {
      const first = generateMaterialTextureV4(input(material));
      const second = generateMaterialTextureV4(input(material));
      expect(sha256(first.pixels)).toBe(sha256(second.pixels));
      expect(first).toMatchObject({
        version: 1,
        width: 192,
        height: 192,
        colorSpace: "srgb",
        alphaMode: "opaque",
      });
      expect(first.pixels).toHaveLength(192 * 192 * 4);
      expect(
        first.pixels.every(
          (value, offset) => offset % 4 !== 3 || value === 255,
        ),
      ).toBe(true);
      expect(row(first.pixels, 0)).toEqual(row(first.pixels, 191));
      expect(column(first.pixels, 0)).toEqual(column(first.pixels, 191));
      hashes[material.family] = sha256(first.pixels);
    }
    expect(new Set(Object.values(hashes))).toHaveLength(materials.length);
    expect(hashes).toEqual({
      classic: "2f36f8ec5ec478b85ba1c11110465722e991394bbc8f7b1b2b2156de52051b13",
      "sharp-resin":
        "345e3cf8754c0a639195e7d57ea15695f06995b2b26c407224466a012b027625",
      "liquid-core":
        "404baaf68dee4a8528a3148aecd3b17f3b0ac42a169b79b81fdfe5cf41763efa",
      gemstone:
        "19cd27332107d6e165a2959204220162894d66bd73bf9b996c457745476a0167",
      glass: "f5f5d164c13c3afd47f9965bff3cd5f3d0be16951f785f6b21694ae4c0b969e1",
      stone: "22c38590dbc19a21993e6f960ada208e8d973e37c4640fb02aaf9ab912dcb1de",
      metal: "a52fb503b90f33eececa74bdae30da483f2c6f6177c39da2775dccf0fb2d6a44",
      "hollow-metal":
        "bde79b172cbb504b3d4c1494970e352cf3e32bf63a9e66131ae20a23ff1ad063",
      wood: "cc37e459d69e96f5bc7232a7217ffe1a756edc88fc44643b7ceba226265abd5e",
      fantasy:
        "cbbc9ded8bfe38042b8c83e3b449f564faffcaab653dfa514d29c7305d3dc357",
    });
  });

  it("pins deterministic seamless r32 material fields", () => {
    const hashes = Object.fromEntries(
      r32Materials.map(({ id, material, palette: materialPalette }) => {
        const textureInput: TextureGenerationInputV4 = {
          ...input(material),
          palette: materialPalette,
        };
        const first = generateMaterialTextureV4(textureInput);
        const second = generateMaterialTextureV4(textureInput);
        expect(first.pixels).toEqual(second.pixels);
        expect(row(first.pixels, 0)).toEqual(row(first.pixels, 191));
        expect(column(first.pixels, 0)).toEqual(column(first.pixels, 191));
        return [id, sha256(first.pixels)];
      }),
    );
    expect(hashes).toEqual({
      lava: "99a6b60c1ae54cdbed9a464542df7cbbe8428fbe22428988316288bad184b340",
      sand: "df9932f2d1a8945aad4c4ae46255a689d33c97af73e81ee0244ccfa7071d50cf",
      "blue-sky":
        "879faa8e3d1b975c2093f700c00c6653db5ce385403599e33000f784d76224ce",
      sunset:
        "a86a2793f73c0425a1cb2add599529685d6e7b794b4dd8be8f14b8a3ca100a76",
      splatter:
        "e3f1c8f8fa33a3198bd47e9a57815d7db452ff1925cfc82c398eb9af1f415c21",
    });
  });

  it("changes only Lava and Sky pixels in r33 texture inputs", () => {
    for (const material of materials) {
      const revision32 = generateMaterialTextureV4(input(material));
      const revision33 = generateMaterialTextureV4(
        input(material, 0x1234_5678, 2),
      );
      expect(revision33.pixels, material.family).toEqual(revision32.pixels);
    }
    for (const { id, material, palette: materialPalette } of r32Materials) {
      if (id !== "sand" && id !== "splatter") continue;
      const revision32 = generateMaterialTextureV4(
        input(material, 0x1234_5678, 1, materialPalette),
      );
      const revision33 = generateMaterialTextureV4(
        input(material, 0x1234_5678, 2, materialPalette),
      );
      expect(revision33.pixels, id).toEqual(revision32.pixels);
    }

    const sky = r32Materials.find(({ id }) => id === "blue-sky");
    if (sky === undefined) throw new Error("Blue Sky fixture is missing");
    if (
      sky.material.family !== "elemental" ||
      sky.material.style !== "blue-sky"
    ) {
      throw new Error("Blue Sky fixture is invalid");
    }
    const softSky = generateMaterialTextureV4(
      input(sky.material, 0x1234_5678, 2, sky.palette),
    );
    const definedSky = generateMaterialTextureV4(
      input(
        { ...sky.material, textureScale: 25 },
        0x1234_5678,
        2,
        sky.palette,
      ),
    );
    expect(softSky.pixels).toEqual(definedSky.pixels);
    expect(softSky.pixels).not.toEqual(
      generateMaterialTextureV4(
        input(sky.material, 0x1234_5678, 1, sky.palette),
      ).pixels,
    );
  });

  it("makes r33 Lava glow stronger without washing its hue pale", () => {
    const lavaPalette = r32Materials.find(({ id }) => id === "lava")?.palette;
    if (lavaPalette === undefined) throw new Error("Lava palette is missing");
    const lava = (glowIntensity: number): AppearanceMaterialV4 => ({
      family: "elemental",
      style: "lava",
      fissureDensity: 30,
      glowIntensity,
      textureScale: 340,
    });
    const faint = generateMaterialTextureV4(
      input(lava(0), 0x51ce_b00c, 2, lavaPalette),
    );
    const intense = generateMaterialTextureV4(
      input(lava(100), 0x51ce_b00c, 2, lavaPalette),
    );
    const washedR32 = generateMaterialTextureV4(
      input(lava(100), 0x51ce_b00c, 1, lavaPalette),
    );

    const faintLuminance = meanLuminance(faint.pixels);
    const intenseLuminance = meanLuminance(intense.pixels);
    const washedLuminance = meanLuminance(washedR32.pixels);
    const faintChroma = meanChroma(faint.pixels);
    const intenseChroma = meanChroma(intense.pixels);
    const washedChroma = meanChroma(washedR32.pixels);
    expect(intenseLuminance).toBeGreaterThan(faintLuminance);
    expect(intenseChroma).toBeGreaterThan(faintChroma);
    expect(intenseChroma / intenseLuminance).toBeGreaterThan(
      washedChroma / washedLuminance,
    );
  });

  it("adds a vivid full-range gradient policy without changing legacy texels", () => {
    const material: ClassicMaterialV4 = {
      family: "classic",
      treatment: "gradient",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    };
    const transInput: TextureGenerationInputV4 = {
      ...input(material),
      palette: ["#5bcffa", "#f5abb9", "#ffffff", "#f5abb9", "#5bcffa"],
    };
    const defaultTexture = generateMaterialTextureV4(transInput);
    const legacyTexture = generateMaterialTextureV4(transInput, "legacy");
    const vividTexture = generateMaterialTextureV4(transInput, "vivid-r4");

    expect(defaultTexture.pixels).toEqual(legacyTexture.pixels);
    expect(vividTexture.pixels).not.toEqual(legacyTexture.pixels);
    const expectedStops = [
      [91, 207, 250],
      [245, 171, 185],
      [255, 255, 255],
      [245, 171, 185],
      [91, 207, 250],
    ] as const;
    for (const [index, expected] of expectedStops.entries()) {
      const x = Math.round((index * 191) / (expectedStops.length - 1));
      const offset = (96 * 192 + x) * 4;
      const distance = Math.hypot(
        (vividTexture.pixels[offset] ?? 0) - expected[0],
        (vividTexture.pixels[offset + 1] ?? 0) - expected[1],
        (vividTexture.pixels[offset + 2] ?? 0) - expected[2],
      );
      expect(distance).toBeLessThan(55);
    }
  });

  it("generates an exact noise-free r5 classic gradient without changing r4", () => {
    const material: ClassicMaterialV4 = {
      family: "classic",
      treatment: "gradient",
      opacity: "translucent",
      finish: "gloss",
      textureScale: 100,
    };
    const gradientInput = {
      ...input(material),
      palette: ["#000000", "#ffffff"],
    };
    const differentSeedInput = { ...gradientInput, seed: 0x72_35_0005 };
    const revision4 = generateMaterialTextureV4(gradientInput, "vivid-r4");
    const revision5 = generateMaterialTextureV4(
      gradientInput,
      "exact-gradient-r5",
    );
    const differentSeed = generateMaterialTextureV4(
      differentSeedInput,
      "exact-gradient-r5",
    );

    expect(revision5.pixels).toEqual(differentSeed.pixels);
    expect(revision5.pixels).not.toEqual(revision4.pixels);
    expect([...revision5.pixels.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    const midpoint = (96 * 192 + 96) * 4;
    expect([...revision5.pixels.slice(midpoint, midpoint + 4)]).toEqual([
      128,
      128,
      128,
      255,
    ]);
    const endpoint = 191 * 4;
    expect([...revision5.pixels.slice(endpoint, endpoint + 4)]).toEqual([
      255,
      255,
      255,
      255,
    ]);
    expect(revision5.pixels.slice(0, 192 * 4)).toEqual(
      revision5.pixels.slice(96 * 192 * 4, 97 * 192 * 4),
    );
  });

  it("balances broad palette regions across r27 classic solid surfaces", () => {
    const material: ClassicMaterialV4 = {
      family: "classic",
      treatment: "solid",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    };
    const solidInput = {
      ...input(material),
      palette: ["#ff0000", "#0000ff"],
    };
    const previous = generateMaterialTextureV4(
      solidInput,
      "exact-gradient-r5",
    );
    const revised = generateMaterialTextureV4(
      solidInput,
      "balanced-surface-r27",
    );
    const reseeded = generateMaterialTextureV4(
      { ...solidInput, seed: 0x72_35_0027 },
      "balanced-surface-r27",
    );
    let redRegions = 0;
    let blueRegions = 0;
    for (let offset = 0; offset < revised.pixels.length; offset += 4) {
      const red = revised.pixels[offset] ?? 0;
      const blue = revised.pixels[offset + 2] ?? 0;
      if (red - blue >= 64) redRegions += 1;
      if (blue - red >= 64) blueRegions += 1;
    }
    const pixelCount = SOURCE_TEXTURE_SIZE_V4 * SOURCE_TEXTURE_SIZE_V4;

    expect(revised.pixels).not.toEqual(previous.pixels);
    expect(reseeded.pixels).not.toEqual(revised.pixels);
    expect(redRegions / pixelCount).toBeGreaterThan(0.35);
    expect(blueRegions / pixelCount).toBeGreaterThan(0.35);
    expect(Math.abs(redRegions - blueRegions) / pixelCount).toBeLessThan(0.08);
  });

  it("keeps duplicate one-color palettes nearly flat", () => {
    const material: ClassicMaterialV4 = {
      family: "classic",
      treatment: "solid",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    };
    const texture = generateMaterialTextureV4(
      { ...input(material), palette: ["#d2042d", "#d2042d"] },
      "balanced-surface-r27",
    );
    const channels = [0, 1, 2].map((channel) => {
      const values: number[] = [];
      for (let offset = channel; offset < texture.pixels.length; offset += 4) {
        const value = texture.pixels[offset];
        if (value !== undefined) values.push(value);
      }
      return Math.max(...values) - Math.min(...values);
    });

    expect(channels.every((range) => range <= 15)).toBe(true);
  });

  it("keeps multi-color r27 solid palettes balanced in either order", () => {
    const material: ClassicMaterialV4 = {
      family: "classic",
      treatment: "solid",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    };
    const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
    const nearestColorShares = (ordered: string[]) => {
      const parsed = ordered.map((color) =>
        [1, 3, 5].map((offset) =>
          Number.parseInt(color.slice(offset, offset + 2), 16),
        ),
      );
      const pixels = generateMaterialTextureV4(
        { ...input(material), palette: ordered },
        "balanced-surface-r27",
      ).pixels;
      const counts = Array.from({ length: ordered.length }, () => 0);
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const channels = [
          pixels[offset] ?? 0,
          pixels[offset + 1] ?? 0,
          pixels[offset + 2] ?? 0,
        ];
        let nearest = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const [index, color] of parsed.entries()) {
          const distance = Math.hypot(
            ...channels.map(
              (channel, channelIndex) =>
                channel - (color[channelIndex] ?? channel),
            ),
          );
          if (distance < nearestDistance) {
            nearest = index;
            nearestDistance = distance;
          }
        }
        counts[nearest] = (counts[nearest] ?? 0) + 1;
      }
      const pixelCount = SOURCE_TEXTURE_SIZE_V4 * SOURCE_TEXTURE_SIZE_V4;
      return counts.map((count) => count / pixelCount);
    };
    const forward = nearestColorShares(colors);
    const reversed = nearestColorShares([...colors].reverse());

    expect(Math.min(...forward)).toBeGreaterThan(0.12);
    expect(Math.max(...forward)).toBeLessThan(0.38);
    expect(Math.abs((forward[0] ?? 0) - (forward.at(-1) ?? 0))).toBeLessThan(
      0.05,
    );
    for (const [index, share] of forward.entries()) {
      expect(reversed.at(-index - 1)).toBeCloseTo(share, 1);
    }
  });

  it("inherits vivid r4 behavior for r5 non-gradient textures", () => {
    const material: ClassicMaterialV4 = {
      family: "classic",
      treatment: "pattern",
      patternId: "crosshatch",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    };
    const patternInput = {
      ...input(material),
      palette: ["#0b3d2e", "#6ecb63"],
    };

    expect(
      generateMaterialTextureV4(patternInput, "exact-gradient-r5").pixels,
    ).toEqual(generateMaterialTextureV4(patternInput, "vivid-r4").pixels);
  });

  it("calms r4 crosshatch frequency without changing the legacy pattern", () => {
    const material: ClassicMaterialV4 = {
      family: "classic",
      treatment: "pattern",
      patternId: "crosshatch",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    };
    const verdantInput = {
      ...input(material),
      palette: ["#0b3d2e", "#6ecb63"],
    };
    const legacy = generateMaterialTextureV4(verdantInput, "legacy");
    const revised = generateMaterialTextureV4(verdantInput, "vivid-r4");

    expect(revised.pixels).not.toEqual(legacy.pixels);
    expect(strongRowTransitions(revised.pixels, 96)).toBeLessThan(
      strongRowTransitions(legacy.pixels, 96),
    );
  });

  it("gives polished r4 brass a visibly brighter warm gleam", () => {
    for (const material of [materials[6], materials[7]]) {
      const brassMaterial = {
        ...material,
        metal: "brass",
        finish: "polished",
      } as AppearanceMaterialV4;
      const brassInput = {
        ...input(brassMaterial, 0x4d41_5404),
        palette: ["#080609", "#72501e", "#e7b957"],
      };
      const legacy = generateMaterialTextureV4(brassInput, "legacy");
      const revised = generateMaterialTextureV4(brassInput, "vivid-r4");

      expect(meanLuminance(revised.pixels)).toBeGreaterThan(
        meanLuminance(legacy.pixels) + 20,
      );
    }
  });

  it("preserves every stable classic treatment and pattern identity", () => {
    const variants = [
      {
        family: "classic",
        treatment: "solid",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
      {
        family: "classic",
        treatment: "gradient",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
      ...PATTERN_IDS_V4.map(
        (patternId): ClassicMaterialV4 => ({
          family: "classic",
          treatment: "pattern",
          patternId,
          opacity: "opaque",
          finish: "satin",
          textureScale: 100,
        }),
      ),
    ] as const satisfies readonly ClassicMaterialV4[];
    const hashes = Object.fromEntries(
      variants.map((material) => [
        "patternId" in material ? material.patternId : material.treatment,
        sha256(generateMaterialTextureV4(input(material)).pixels),
      ]),
    );
    expect(new Set(Object.values(hashes))).toHaveLength(variants.length);
    expect(hashes).toEqual({
      solid: "59a0c488ce731295bedd3fd9a62b8da4e2d9cee41a730e496d99d3aec488a031",
      gradient:
        "767f89d0810297260fe152781e888691f189e9467fad75ecbc9761420976ffa2",
      checkerboard:
        "c2c081e5157035c8f23170d871a56323f6de14a02d05d0b3a9a89cc78ef48c7a",
      dots: "96ec3d5c313ff67b2a699fb80c9d0c15355181922eb8a8858bf1b92e95ef40b6",
      stripes:
        "9b1add92d40c4b3095dcf2d88afa3f8c655a2e8df23dd79cff1a5e7f09c2d381",
      stars: "e20628260ffd9113949c638316318ee882a0653d0c2e50ad3eeaee6110fb5d7c",
      zigzag:
        "d35d22bdf2a35a5726f369fead96b7de67c079236b205d0d8a14d1f5c67877c1",
      triangles:
        "ce93cf2a0732a2de81d4a2bd38051e893bb2cdc5b2ba7e4ac2d471cb805c4ebe",
      honeycomb:
        "aba926d540debb62bc8ec11c9e30a6c7104ad8e5671bfde41ec193980d77bdff",
      circuit:
        "1f7a15c9ed7ad3bf7fd85a402643d0d904b7666ca4e3089a13e4a510824e99a6",
      crosshatch:
        "2fc80dd74d060e7708d400138a0764b18eb7c355e650064a1e2935cb8be6ea83",
      swirl: "664203579ea11b9a6c328da65ed8020f2e47b3a7d8f9a11699e4583f35871dca",
    });
  });

  it("smooths the internal sampling grid without visible pixel blocks", () => {
    const texture = generateMaterialTextureV4(input(materials[1]));
    let repeatedBlocks = 0;
    for (let y = 0; y < 192; y += 3) {
      for (let x = 0; x < 192; x += 3) {
        let repeated = true;
        for (let offsetY = 0; offsetY < 3 && repeated; offsetY += 1) {
          for (let offsetX = 0; offsetX < 3; offsetX += 1) {
            if (
              !pixelsEqual(
                texture.pixels,
                x,
                y,
                x + offsetX,
                y + offsetY,
              )
            ) {
              repeated = false;
              break;
            }
          }
        }
        if (repeated) repeatedBlocks += 1;
      }
    }
    expect(repeatedBlocks).toBeLessThan(100);
  });

  it("leaves hollow-metal cut-throughs to geometry instead of encoding black holes", () => {
    const texture = generateMaterialTextureV4({
      ...input(materials[7], 0x4d41_5404),
      palette: ["#080609", "#72501e", "#e7b957"],
    });
    let luminanceTotal = 0;
    let nearBlackPixels = 0;
    for (let offset = 0; offset < texture.pixels.length; offset += 4) {
      const red = texture.pixels[offset] ?? 0;
      const green = texture.pixels[offset + 1] ?? 0;
      const blue = texture.pixels[offset + 2] ?? 0;
      const luminance = (red * 54 + green * 183 + blue * 19) / 256;
      luminanceTotal += luminance;
      if (luminance < 24) nearBlackPixels += 1;
    }
    const pixelCount = SOURCE_TEXTURE_SIZE_V4 * SOURCE_TEXTURE_SIZE_V4;
    expect(luminanceTotal / pixelCount).toBeGreaterThan(70);
    expect(nearBlackPixels / pixelCount).toBeLessThan(0.05);
  });

  it("renders wood as fine irregular longitudinal grain instead of broad bands", () => {
    const wood = materials[8];
    const texture = generateMaterialTextureV4({
      ...input(wood, 0x4d41_5405),
      palette: ["#1b0e09", "#6f351b", "#d3924b"],
    });
    const statistics = grainStatistics(texture.pixels);

    expect(statistics.horizontalMean).toBeLessThan(9);
    expect(statistics.verticalMean).toBeGreaterThan(0.25);
    expect(
      statistics.horizontalMean / statistics.verticalMean,
    ).toBeLessThan(10);
    expect(statistics.localMinima).toBeGreaterThanOrEqual(20);
  });

  it("gives every wood species a distinct physical grain structure", () => {
    const textures = Object.fromEntries(
      WOOD_STYLES_V4.map((wood) => {
        const material: WoodMaterialV4 = {
          family: "wood",
          wood,
          finish: "polished",
          grainDensity: 64,
          textureScale: 100,
        };
        const texture = generateMaterialTextureV4({
          ...input(material, 0x4d41_5405),
          palette: ["#1b0e09", "#6f351b", "#d3924b"],
        });
        return [wood, texture] as const;
      }),
    );
    expect(
      new Set(Object.values(textures).map(({ pixels }) => sha256(pixels))),
    ).toHaveLength(WOOD_STYLES_V4.length);

    const textureFor = (wood: (typeof WOOD_STYLES_V4)[number]) => {
      const texture = textures[wood];
      if (texture === undefined) throw new Error(`Missing ${wood} texture`);
      return texture;
    };
    const walnut = grainStatistics(textureFor("walnut").pixels);
    const oak = grainStatistics(textureFor("oak").pixels);
    const ebony = grainStatistics(textureFor("ebony").pixels);
    const burl = grainStatistics(textureFor("burl").pixels);
    const ash = grainStatistics(textureFor("ash").pixels);
    expect(oak.horizontalMean).toBeGreaterThan(walnut.horizontalMean);
    expect(ebony.horizontalMean).toBeLessThan(walnut.horizontalMean);
    expect(ash.meanLuminance).toBeGreaterThan(walnut.meanLuminance);
    expect(burl.horizontalMean / burl.verticalMean).toBeLessThan(
      walnut.horizontalMean / walnut.verticalMean,
    );
  });

  it("keeps carved beech distinct from its natural base material", () => {
    const material = (finish: WoodMaterialV4["finish"]): WoodMaterialV4 => ({
      family: "wood",
      wood: "beech",
      finish,
      grainDensity: 48,
      textureScale: 100,
    });
    const render = (finish: WoodMaterialV4["finish"]) =>
      generateMaterialTextureV4({
        ...input(material(finish), 0x4d41_5414),
        palette: ["#3b2416", "#a27645", "#e5c99a"],
      });
    const polished = render("polished");
    const carved = render("vine-carved");
    const greenPixelCount = (pixels: Uint8Array) => {
      let count = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? 0;
        const blue = pixels[offset + 2] ?? 0;
        if (green > red + 12 && green > blue + 12) count += 1;
      }
      return count;
    };

    expect(sha256(polished.pixels)).toBe(
      "031af21e06de9f4026015506600d3d2fc0200aaaf0e9633aa68c7c7e68b8b565",
    );
    expect(sha256(carved.pixels)).toBe(
      "ba2b1f3cdf71e4ba1c9ee2e48f9946b5594642d3eb5af15325958e456769b93f",
    );
    expect(greenPixelCount(carved.pixels)).toBeGreaterThan(
      greenPixelCount(polished.pixels) + 500,
    );
    expect(row(carved.pixels, 0)).toEqual(row(carved.pixels, 191));
    expect(column(carved.pixels, 0)).toEqual(column(carved.pixels, 191));
  });

  it("changes bytes when the seed changes", () => {
    for (const material of materials) {
      const first = generateMaterialTextureV4(input(material, 1));
      const second = generateMaterialTextureV4(input(material, 2));
      expect(sha256(first.pixels), material.family).not.toBe(
        sha256(second.pixels),
      );
    }
  });

  it("rejects inputs that violate the generator boundary", () => {
    expect(() =>
      generateMaterialTextureV4({
        ...input(materials[0]),
        generatorId: "wood-v1",
      }),
    ).toThrow(
      "Texture generator wood-v1 does not match material family classic",
    );
    expect(() =>
      generateMaterialTextureV4({
        ...input(materials[0]),
        seed: -1,
      }),
    ).toThrow("Texture seed must be an unsigned 32-bit integer");
    expect(() =>
      generateMaterialTextureV4({
        ...input(materials[0]),
        palette: ["#000000", "not-a-color"],
      }),
    ).toThrow(
      "Texture palette must contain from two through six hexadecimal colors",
    );
  });
});
