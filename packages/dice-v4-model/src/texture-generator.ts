import { TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4 } from "./registries";
import {
  SOURCE_TEXTURE_SIZE_V4,
  type TextureGenerationInputV4,
  type TextureRasterV4,
} from "./texture-input";
import {
  createTextureNoiseSamplerV4,
  mixTextureColorV4,
  paletteTextureColorV4,
  parseTextureColorV4,
  shadeTextureColorV4,
  textureColorV4,
  textureCoordinateV4,
  textureHashV4,
  texturePeriodV4,
  type TextureColorV4,
  type TextureNoiseSamplerV4,
} from "./texture-primitives";
import type {
  AppearanceMaterialV4,
  ClassicMaterialV4,
  FantasyMaterialV4,
  GemstoneMaterialV4,
  GlassMaterialV4,
  HollowMetalMaterialV4,
  LiquidCoreMaterialV4,
  MetalMaterialV4,
  PatternIdV4,
  SharpResinMaterialV4,
  StoneMaterialV4,
  WoodMaterialV4,
} from "./types";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const BYTE_MAX = 255;
const PERIOD = texturePeriodV4();
const GENERATION_SIZE_V4 = 64;

export type TextureColorPolicyV4 =
  | "legacy"
  | "vivid-r4"
  | "exact-gradient-r5";

function usesVividColorPolicyV4(policy: TextureColorPolicyV4): boolean {
  return policy !== "legacy";
}

type PixelContextV4 = {
  x: number;
  y: number;
  seed: number;
  palette: readonly TextureColorV4[];
  colorPolicy: TextureColorPolicyV4;
  noise: (salt: number, x?: number, y?: number) => number;
};

type PixelGeneratorV4<Material extends AppearanceMaterialV4> = (
  context: PixelContextV4,
  material: Material,
) => TextureColorV4;

function byte(value: number): number {
  return Math.max(0, Math.min(BYTE_MAX, Math.round(value)));
}

function modulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

function phase(coordinate: number, cycles: number): number {
  return modulo(Math.floor((coordinate * cycles * 256) / PERIOD), 256);
}

function materialCycles(textureScale: number, base: number): number {
  return Math.max(1, Math.round((base * 100) / textureScale));
}

function finishColor(
  color: TextureColorV4,
  noise: number,
  finish: string,
): TextureColorV4 {
  if (finish === "polished" || finish === "gloss" || finish === "lacquered") {
    return shadeTextureColorV4(color, noise > 224 ? 48 : 10);
  }
  if (finish === "frosted" || finish === "weathered" || finish === "raw-cut") {
    return mixTextureColorV4(color, textureColorV4(205, 211, 218), 24 + (noise >> 4));
  }
  if (finish === "oxidized" || finish === "patinated") {
    return shadeTextureColorV4(color, -18);
  }
  return shadeTextureColorV4(color, (noise - 128) >> 4);
}

function patternMask(
  patternId: PatternIdV4,
  textureScale: number,
  context: PixelContextV4,
): number {
  const cycles = materialCycles(
    textureScale,
    patternId === "crosshatch" && usesVividColorPolicyV4(context.colorPolicy)
      ? 4
      : 8,
  );
  const u = modulo(
    phase(context.x, cycles) + (textureHashV4(context.seed, 0, 0, 3) & 255),
    256,
  );
  const v = modulo(
    phase(context.y, cycles) + (textureHashV4(context.seed, 0, 0, 4) & 255),
    256,
  );
  const jitter = context.noise(4) - 128;
  switch (patternId) {
    case "checkerboard":
      return (u < 128) === (v < 128) ? 24 : 232;
    case "dots": {
      const dx = u - 128;
      const dy = v - 128;
      return dx * dx + dy * dy < 3_600 ? 232 : 24;
    }
    case "stripes":
      return modulo(u + v, 256) < 112 ? 28 : 228;
    case "stars": {
      const dx = Math.abs(u - 128);
      const dy = Math.abs(v - 128);
      return dx < 18 || dy < 18 || dx + dy < 76 ? 236 : 20;
    }
    case "zigzag":
      return Math.abs(modulo(u + Math.abs(v - 128) * 2, 256) - 128) < 32
        ? 230
        : 26;
    case "triangles":
      return u + v < 256 ? 32 : 224;
    case "honeycomb": {
      const qx = Math.abs(u - 128);
      const qy = Math.abs(v - 128);
      return qx > 104 || qy > 104 || qx + qy > 168 ? 226 : 28;
    }
    case "circuit": {
      const horizontal = Math.abs(v - 64) < 13 || Math.abs(v - 192) < 13;
      const vertical = Math.abs(u - 64) < 13 || Math.abs(u - 192) < 13;
      const node = Math.abs(u - 128) < 25 && Math.abs(v - 128) < 25;
      return horizontal || vertical || node ? 232 : 22;
    }
    case "crosshatch": {
      if (!usesVividColorPolicyV4(context.colorPolicy)) {
        return modulo(u + v, 128) < 16 || modulo(u - v, 128) < 16
          ? 230
          : 24;
      }
      const first = modulo(u + v, 128) < 22;
      const second = modulo(u - v, 128) < 22;
      if (first && second) return 202;
      return first || second ? 164 : 54;
    }
    case "swirl": {
      const dx = u - 128;
      const dy = v - 128;
      const radius = Math.max(Math.abs(dx), Math.abs(dy));
      return modulo(radius * 3 + u - v + jitter, 128) < 30 ? 232 : 24;
    }
  }
}

const classicPixel: PixelGeneratorV4<ClassicMaterialV4> = (context, material) => {
  const noise = context.noise(10);
  let amount: number;
  if ("patternId" in material) {
    amount = patternMask(material.patternId, material.textureScale, context);
  } else if (material.treatment === "solid") {
    amount = byte(40 + noise / 3);
  } else if (usesVividColorPolicyV4(context.colorPolicy)) {
    const position = context.x / PERIOD;
    const fullRange = Math.max(0, Math.min(1, (position - 0.06) / 0.88));
    amount = byte(fullRange * BYTE_MAX + (noise - 128) * 0.1);
  } else {
    amount = byte((context.x * 156) / PERIOD + noise * 0.38);
  }
  let color = paletteTextureColorV4(context.palette, amount);
  if (material.opacity === "translucent") {
    color = mixTextureColorV4(color, textureColorV4(224, 232, 240), 42);
  }
  return finishColor(color, noise, material.finish);
};

const sharpResinPixel: PixelGeneratorV4<SharpResinMaterialV4> = (
  context,
  material,
) => {
  const depth = context.noise(20);
  const detail = context.noise(27);
  let amount = byte(depth * 0.72 + detail * 0.28);
  if (material.style === "smoke") amount = byte(amount * 0.55);
  if (material.style === "layered") {
    amount = phase(context.y, materialCycles(material.textureScale, 5)) < 128
      ? byte(amount * 0.5)
      : byte(128 + amount * 0.5);
  }
  if (material.style === "petri" && Math.abs(depth - detail) < 22) {
    amount = 245;
  }
  let color = paletteTextureColorV4(context.palette, amount);
  color = mixTextureColorV4(
    color,
    textureColorV4(231, 239, 246),
    byte(material.clarity * 0.42),
  );
  const inclusionRoll = textureHashV4(
    context.seed,
    context.x >> 1,
    context.y >> 1,
    31,
  ) % 1_000;
  if (
    material.inclusion !== "none" &&
    inclusionRoll < material.inclusionDensity * 4
  ) {
    const inclusionColor: TextureColorV4 =
      material.inclusion === "botanical"
        ? textureColorV4(47, 94, 53)
        : material.inclusion === "foil"
          ? textureColorV4(247, 214, 104)
          : material.inclusion === "mica"
            ? textureColorV4(235, 225, 242)
            : paletteTextureColorV4(context.palette, detail);
    color = mixTextureColorV4(color, inclusionColor, 178);
  }
  return finishColor(color, detail, material.finish);
};

const liquidCorePixel: PixelGeneratorV4<LiquidCoreMaterialV4> = (
  context,
  material,
) => {
  const warp = context.noise(40);
  const fine = context.noise(46);
  const u = phase(context.x, materialCycles(material.textureScale, 3));
  const v = phase(context.y, materialCycles(material.textureScale, 3));
  let stream = modulo(u + v + (warp - 128) * 2, 256);
  if (material.core === "glitter-storm") stream = byte((warp + fine) / 2);
  if (material.core === "eye") {
    const dx = Math.abs(u - 128);
    const dy = Math.abs(v - 128);
    stream = byte(255 - Math.min(255, dx * 2 + dy));
  }
  if (material.core === "blood") stream = byte(stream * 0.58);
  if (material.core === "cosmic") stream = byte((stream + fine) / 2);
  let color = paletteTextureColorV4(context.palette, stream);
  color = mixTextureColorV4(
    color,
    textureColorV4(218, 229, 239),
    byte(material.clarity * 0.25),
  );
  const particle = textureHashV4(
    context.seed,
    context.x,
    context.y,
    49,
  ) % 2_000;
  if (particle < material.particleDensity * 3) {
    color = shadeTextureColorV4(color, 150 + (fine >> 2));
  }
  return finishColor(color, warp, material.finish);
};

const gemstonePixel: PixelGeneratorV4<GemstoneMaterialV4> = (
  context,
  material,
) => {
  const body = context.noise(60);
  const veins = context.noise(67);
  let amount = body;
  if (material.stone === "obsidian") amount = byte(body * 0.3);
  if (material.stone === "malachite") amount = modulo(body + phase(context.y, 5), 256);
  if (material.stone === "cats-eye") {
    amount = byte(255 - Math.abs(phase(context.x, 2) - 128) * 1.6);
  }
  if (material.stone === "labradorite") amount = byte((body + phase(context.x, 2)) / 2);
  let color = paletteTextureColorV4(context.palette, amount);
  if (Math.abs(body - veins) < 8 + material.veinDensity / 5) {
    color = shadeTextureColorV4(color, material.stone === "obsidian" ? 96 : 150);
  }
  return finishColor(color, veins, material.finish);
};

const glassPixel: PixelGeneratorV4<GlassMaterialV4> = (context, material) => {
  const body = context.noise(80);
  const detail = context.noise(87);
  const diagonal = modulo(phase(context.x, 3) + phase(context.y, 5) + body, 256);
  let amount = material.style === "clear" ? byte(body * 0.28 + 96) : body;
  if (material.style === "colored") amount = byte(72 + body * 0.62);
  if (material.style === "frosted") amount = byte((body + detail) / 2);
  if (material.style === "stained") amount = diagonal < 128 ? 36 : 220;
  if (material.style === "prismatic") amount = diagonal;
  let color = paletteTextureColorV4(context.palette, amount);
  color = mixTextureColorV4(
    color,
    textureColorV4(223, 238, 246),
    byte(material.clarity * 0.48),
  );
  if (Math.abs(diagonal - 128) > 116) {
    color = shadeTextureColorV4(color, 138);
  }
  return finishColor(color, detail, material.finish);
};

const stonePixel: PixelGeneratorV4<StoneMaterialV4> = (context, material) => {
  const grain = context.noise(100);
  const vein = context.noise(107);
  let amount = grain;
  if (material.stone === "granite") amount = byte((grain + vein) / 2);
  if (material.stone === "sandstone") amount = byte(80 + grain * 0.55);
  if (material.stone === "volcanic") amount = byte(grain * 0.34);
  if (material.stone === "bone") amount = byte(160 + grain * 0.28);
  if (material.stone === "ceramic") amount = byte(120 + grain * 0.42);
  let color = paletteTextureColorV4(context.palette, amount);
  const veinWidth = 5 + material.grainDensity / 7;
  if (material.stone === "marble" && Math.abs(grain - vein) < veinWidth) {
    color = shadeTextureColorV4(color, 120);
  }
  const speckle = textureHashV4(context.seed, context.x, context.y, 111) % 1_000;
  if (speckle < material.grainDensity * 2) {
    color = shadeTextureColorV4(color, speckle % 2 === 0 ? 70 : -70);
  }
  return finishColor(color, vein, material.finish);
};

function polishedBrassGleam(
  context: PixelContextV4,
  material: MetalMaterialV4 | HollowMetalMaterialV4,
  color: TextureColorV4,
): TextureColorV4 {
  if (
    !usesVividColorPolicyV4(context.colorPolicy) ||
    material.metal !== "brass" ||
    material.finish !== "polished"
  ) {
    return color;
  }
  const sweep = modulo(phase(context.x, 2) + phase(context.y, 1), 256);
  const distance = Math.abs(sweep - 128);
  return distance < 42
    ? shadeTextureColorV4(color, byte(82 * (1 - distance / 42)))
    : color;
}

const metalPixel: PixelGeneratorV4<MetalMaterialV4> = (context, material) => {
  const grain = context.noise(120);
  const streak = context.noise(126, 0, context.y);
  let amount = byte(84 + grain * 0.45);
  if (material.finish === "brushed") {
    const brush = textureHashV4(context.seed, 0, context.y, 125) & BYTE_MAX;
    amount = byte(52 + streak * 0.28 + grain * 0.12 + brush * 0.38);
  }
  if (material.finish === "hammered") {
    amount = byte(
      (grain * 2 +
        (textureHashV4(
          context.seed,
          context.x >> 3,
          context.y >> 3,
          128,
        ) & 255)) /
        3,
    );
  }
  let color = paletteTextureColorV4(context.palette, amount);
  const warmMetal = ["brass", "bronze", "copper", "gold"].includes(
    material.metal,
  );
  const vividBrass =
    usesVividColorPolicyV4(context.colorPolicy) && material.metal === "brass";
  let tint = textureColorV4(171, 184, 197);
  if (warmMetal) tint = textureColorV4(210, 153, 58);
  if (vividBrass) tint = textureColorV4(224, 169, 67);
  color = mixTextureColorV4(color, tint, vividBrass ? 215 : 58);
  const patina = context.noise(133);
  if (patina > 255 - material.patinaStrength * 2) {
    color = mixTextureColorV4(color, textureColorV4(36, 137, 125), 145);
  }
  return finishColor(
    polishedBrassGleam(context, material, color),
    streak,
    material.finish,
  );
};

function hollowMetalOrnamentDistance(
  construction: HollowMetalMaterialV4["construction"],
  u: number,
  v: number,
): number {
  if (construction === "filigree") {
    return Math.abs(Math.max(Math.abs(u - 128), Math.abs(v - 128)) - 86);
  }
  if (construction === "lattice") {
    return Math.min(Math.abs(u - v), Math.abs(u + v - 256));
  }
  return Math.min(Math.abs(u - 128), Math.abs(v - 128));
}

const hollowMetalPixel: PixelGeneratorV4<HollowMetalMaterialV4> = (
  context,
  material,
) => {
  const cycles = materialCycles(material.textureScale, 6);
  const u = phase(context.x, cycles);
  const v = phase(context.y, cycles);
  const ornamentWidth = Math.max(
    4,
    Math.round((100 - material.openness) * 0.12),
  );
  const distance = hollowMetalOrnamentDistance(
    material.construction,
    u,
    v,
  );
  const noise = context.noise(140);
  let color = paletteTextureColorV4(
    context.palette,
    byte(132 + noise * 0.38),
  );
  const vividBrass =
    usesVividColorPolicyV4(context.colorPolicy) && material.metal === "brass";
  let tintAmount = 42;
  if (["brass", "bronze", "copper", "gold"].includes(material.metal)) {
    tintAmount = 96;
  }
  if (vividBrass) tintAmount = 210;
  color = mixTextureColorV4(
    color,
    vividBrass
      ? textureColorV4(226, 177, 72)
      : textureColorV4(218, 174, 78),
    tintAmount,
  );
  if (distance < ornamentWidth) {
    color = shadeTextureColorV4(color, 38);
  } else if (distance < ornamentWidth + 3) {
    color = shadeTextureColorV4(color, -18);
  }
  return finishColor(
    polishedBrassGleam(context, material, color),
    noise,
    material.finish,
  );
};

function vineCarvedWoodColor(
  context: PixelContextV4,
  material: WoodMaterialV4,
  color: TextureColorV4,
): TextureColorV4 {
  const carvingCycles = materialCycles(material.textureScale, 4);
  const carvingU = phase(context.x, carvingCycles);
  const carvingV = phase(context.y, carvingCycles);
  const carvingSweep = context.noise(176, 0, context.y) - 128;
  const carvedX = modulo(carvingU + carvingSweep, 256);
  const vineDistance = Math.abs(carvedX - 128);
  const upperLeaf = carvingV < 128;
  const leafCenter = upperLeaf ? 84 : 172;
  const leafY = upperLeaf ? 64 : 192;
  const leafRadius =
    Math.abs(carvedX - leafCenter) + Math.abs(carvingV - leafY) * 1.4;
  const carvingDistance = Math.min(
    vineDistance,
    Math.abs(leafRadius - 44),
  );
  const vineColor = textureColorV4(38, 105, 55);
  if (carvingDistance < 8) {
    return shadeTextureColorV4(
      mixTextureColorV4(color, vineColor, 220),
      -34,
    );
  }
  if (carvingDistance < 15) {
    return shadeTextureColorV4(
      mixTextureColorV4(color, vineColor, 82),
      20,
    );
  }
  return color;
}

const woodPixel: PixelGeneratorV4<WoodMaterialV4> = (context, material) => {
  const sweep = context.noise(160, 0, context.y) - 128;
  const figure = context.noise(163) - 128;
  const detail = context.noise(166);
  const primaryCycles = materialCycles(
    material.textureScale,
    10 + material.grainDensity / 18,
  );
  const fineCycles = materialCycles(
    material.textureScale,
    21 + material.grainDensity / 20,
  );
  const primaryDistance = Math.abs(
    modulo(
      phase(context.x, primaryCycles) + sweep * 0.7 + figure / 6,
      256,
    ) - 128,
  );
  const fineDistance = Math.abs(
    modulo(
      phase(context.x, fineCycles) + sweep * 1.2 + figure / 3,
      256,
    ) - 128,
  );
  let grain = byte(132 + detail * 0.18 + figure * 0.1);
  let primaryWidth = 12 + material.grainDensity / 6;
  if (material.wood === "oak") primaryWidth += 6;
  if (material.wood === "ash") primaryWidth += 3;
  if (primaryDistance < primaryWidth) {
    const depth = material.wood === "oak" ? 3 : 2.25;
    grain = byte(grain - (primaryWidth - primaryDistance) * depth);
  }
  const fineWidth = 7 + material.grainDensity / 16;
  if (fineDistance < fineWidth) {
    const depth = material.wood === "oak" ? 1.25 : 1.8;
    grain = byte(grain - (fineWidth - fineDistance) * depth);
  }
  if (primaryDistance > 112) grain = byte(grain + 9);
  if (material.wood === "oak") grain = byte(grain + 5);
  if (material.wood === "ebony") grain = byte(24 + grain * 0.24);
  if (material.wood === "ash") grain = byte(126 + grain * 0.38);
  if (material.wood === "beech") grain = byte(114 + grain * 0.34);
  if (material.wood === "burl") {
    const burlSweep = context.noise(168);
    const burlRing = context.noise(172);
    const burlDistance = Math.abs(burlSweep - burlRing);
    grain = byte(112 + detail * 0.16 + (burlSweep - 128) * 0.12);
    if (burlDistance < 26) {
      grain = byte(grain - (26 - burlDistance) * 2.4);
    }
  }
  let color = paletteTextureColorV4(context.palette, grain);
  const pore =
    textureHashV4(context.seed, context.x, context.y >> 3, 169) % 4_096;
  let poreMultiplier = 0.5;
  if (material.wood === "oak") poreMultiplier = 1.5;
  if (material.wood === "ash") poreMultiplier = 1;
  const poreThreshold = material.grainDensity * poreMultiplier;
  if (pore < poreThreshold) {
    color = shadeTextureColorV4(color, material.wood === "oak" ? -48 : -36);
  }
  if (material.finish === "vine-carved") {
    color = vineCarvedWoodColor(context, material, color);
  }
  if (material.finish === "inlaid" && modulo(phase(context.y, 4), 128) < 10) {
    color = shadeTextureColorV4(color, 120);
  }
  return finishColor(color, byte(96 + detail * 0.45), material.finish);
};

const fantasyPixel: PixelGeneratorV4<FantasyMaterialV4> = (
  context,
  material,
) => {
  const body = context.noise(180);
  const rift = context.noise(187);
  let amount = body;
  if (material.essence === "void") amount = byte(body * 0.18);
  if (material.essence === "ice") amount = byte(148 + body * 0.42);
  if (material.essence === "blood") amount = byte(body * 0.5);
  if (material.essence === "bone") amount = byte(158 + body * 0.3);
  if (material.essence === "living-eye") {
    const u = phase(context.x, 2);
    const v = phase(context.y, 2);
    amount = byte(255 - Math.min(255, Math.abs(u - 128) * 2 + Math.abs(v - 128)));
  }
  if (material.essence === "cosmic") amount = byte((body + phase(context.y, 3)) / 2);
  let color = paletteTextureColorV4(context.palette, amount);
  const threshold = 8 + material.intensity / 6;
  if (Math.abs(body - rift) < threshold) {
    color = material.essence === "corruption"
      ? mixTextureColorV4(color, textureColorV4(109, 210, 61), 176)
      : shadeTextureColorV4(color, 150);
  }
  if (material.finish === "radiant") color = shadeTextureColorV4(color, 28);
  if (material.finish === "fractured" && modulo(body + rift, 64) < 8) {
    color = shadeTextureColorV4(color, 128);
  }
  return color;
};

function validateInput(input: TextureGenerationInputV4): void {
  if (
    !Number.isInteger(input.seed) ||
    input.seed < 0 ||
    input.seed > 0xffff_ffff
  ) {
    throw new Error("Texture seed must be an unsigned 32-bit integer");
  }
  const expectedGenerator =
    TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[input.material.family];
  if (input.generatorId !== expectedGenerator) {
    throw new Error(
      `Texture generator ${input.generatorId} does not match material family ${input.material.family}`,
    );
  }
  if (
    input.palette.length < 2 ||
    input.palette.length > 6 ||
    !input.palette.every((color) => HEX_COLOR.test(color))
  ) {
    throw new Error(
      "Texture palette must contain from two through six hexadecimal colors",
    );
  }
}

function generateMaterialPixel(
  context: PixelContextV4,
  material: AppearanceMaterialV4,
): TextureColorV4 {
  switch (material.family) {
    case "classic":
      return classicPixel(context, material);
    case "sharp-resin":
      return sharpResinPixel(context, material);
    case "liquid-core":
      return liquidCorePixel(context, material);
    case "gemstone":
      return gemstonePixel(context, material);
    case "glass":
      return glassPixel(context, material);
    case "stone":
      return stonePixel(context, material);
    case "metal":
      return metalPixel(context, material);
    case "hollow-metal":
      return hollowMetalPixel(context, material);
    case "wood":
      return woodPixel(context, material);
    case "fantasy":
      return fantasyPixel(context, material);
  }
}

function exactClassicGradientTextureV4(
  palette: readonly TextureColorV4[],
): TextureRasterV4 {
  const row = new Uint8Array(SOURCE_TEXTURE_SIZE_V4 * 4);
  for (let x = 0; x < SOURCE_TEXTURE_SIZE_V4; x += 1) {
    const position = (x + 0.5) / SOURCE_TEXTURE_SIZE_V4;
    const amount = byte(
      Math.max(0, Math.min(1, (position - 0.06) / 0.88)) * BYTE_MAX,
    );
    const color = paletteTextureColorV4(palette, amount);
    const offset = x * 4;
    row[offset] = (color >>> 16) & BYTE_MAX;
    row[offset + 1] = (color >>> 8) & BYTE_MAX;
    row[offset + 2] = color & BYTE_MAX;
    row[offset + 3] = BYTE_MAX;
  }
  const pixels = new Uint8Array(
    SOURCE_TEXTURE_SIZE_V4 * SOURCE_TEXTURE_SIZE_V4 * 4,
  );
  for (let y = 0; y < SOURCE_TEXTURE_SIZE_V4; y += 1) {
    pixels.set(row, y * row.length);
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

export function generateMaterialTextureV4(
  input: TextureGenerationInputV4,
  colorPolicy: TextureColorPolicyV4 = "legacy",
): TextureRasterV4 {
  validateInput(input);
  const palette = input.palette.map(parseTextureColorV4);
  if (
    colorPolicy === "exact-gradient-r5" &&
    input.material.family === "classic" &&
    input.material.treatment === "gradient"
  ) {
    return exactClassicGradientTextureV4(palette);
  }
  const noiseSamplers = new Map<number, TextureNoiseSamplerV4>();
  let currentX = 0;
  let currentY = 0;
  const context: PixelContextV4 = {
    x: 0,
    y: 0,
    seed: input.seed,
    palette,
    colorPolicy,
    noise: (salt, x = currentX, y = currentY) => {
      let sampler = noiseSamplers.get(salt);
      if (sampler === undefined) {
        sampler = createTextureNoiseSamplerV4(input.seed, salt);
        noiseSamplers.set(salt, sampler);
      }
      return sampler(x, y);
    },
  };
  const samples = new Uint32Array(GENERATION_SIZE_V4 * GENERATION_SIZE_V4);
  for (let sampleY = 0; sampleY < GENERATION_SIZE_V4; sampleY += 1) {
    currentY = textureCoordinateV4(
      Math.round((sampleY * PERIOD) / (GENERATION_SIZE_V4 - 1)),
    );
    context.y = currentY;
    for (let sampleX = 0; sampleX < GENERATION_SIZE_V4; sampleX += 1) {
      currentX = textureCoordinateV4(
        Math.round((sampleX * PERIOD) / (GENERATION_SIZE_V4 - 1)),
      );
      context.x = currentX;
      samples[sampleY * GENERATION_SIZE_V4 + sampleX] = generateMaterialPixel(
        context,
        input.material,
      );
    }
  }

  const horizontalSamples = new Uint32Array(
    GENERATION_SIZE_V4 * SOURCE_TEXTURE_SIZE_V4,
  );
  for (let sampleY = 0; sampleY < GENERATION_SIZE_V4; sampleY += 1) {
    for (let x = 0; x < SOURCE_TEXTURE_SIZE_V4; x += 1) {
      const sourceX = (x * (GENERATION_SIZE_V4 - 1)) / PERIOD;
      const fromX = Math.floor(sourceX);
      const toX = Math.min(fromX + 1, GENERATION_SIZE_V4 - 1);
      const from = samples[sampleY * GENERATION_SIZE_V4 + fromX];
      const to = samples[sampleY * GENERATION_SIZE_V4 + toX];
      if (from === undefined || to === undefined) {
        throw new Error("Texture sample interpolation failed");
      }
      horizontalSamples[sampleY * SOURCE_TEXTURE_SIZE_V4 + x] =
        mixTextureColorV4(from, to, byte((sourceX - fromX) * BYTE_MAX));
    }
  }

  const pixels = new Uint8Array(
    SOURCE_TEXTURE_SIZE_V4 * SOURCE_TEXTURE_SIZE_V4 * 4,
  );
  for (let y = 0; y < SOURCE_TEXTURE_SIZE_V4; y += 1) {
    const sourceY = (y * (GENERATION_SIZE_V4 - 1)) / PERIOD;
    const fromY = Math.floor(sourceY);
    const toY = Math.min(fromY + 1, GENERATION_SIZE_V4 - 1);
    const amountY = byte((sourceY - fromY) * BYTE_MAX);
    for (let x = 0; x < SOURCE_TEXTURE_SIZE_V4; x += 1) {
      const from = horizontalSamples[fromY * SOURCE_TEXTURE_SIZE_V4 + x];
      const to = horizontalSamples[toY * SOURCE_TEXTURE_SIZE_V4 + x];
      if (from === undefined || to === undefined) {
        throw new Error("Texture sample interpolation failed");
      }
      const color = mixTextureColorV4(from, to, amountY);
      const offset = (y * SOURCE_TEXTURE_SIZE_V4 + x) * 4;
      pixels[offset] = (color >>> 16) & BYTE_MAX;
      pixels[offset + 1] = (color >>> 8) & BYTE_MAX;
      pixels[offset + 2] = color & BYTE_MAX;
      pixels[offset + 3] = BYTE_MAX;
    }
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
