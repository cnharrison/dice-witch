import { createHash } from "node:crypto";
import {
  ENGRAVING_FINISHES_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_STRENGTHS_V4,
  PATTERN_IDS_V4,
  serializeRenderRequestV4,
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  type RenderAppearanceV4,
  type RenderLightingV4,
  type RenderDieV4,
  type RenderRequestV4,
  type TexturePlacementV4,
} from "@dice-witch/dice-v4-model";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CANVASKIT_FONT_DATA_V4 } from "../src/font-assets";
import type { CanvasKitRuntimeV4 } from "../src/runtime";
import { loadCanvasKitV4 } from "../src/runtime";
import {
  CanvasKitDiceRequestRendererV4,
  RendererV4FailedError,
  renderDiceRequestV4ToPng,
  renderV4WithSingleRetry,
  type DiceRequestRendererV4,
  type RenderedDiceRequestV4,
} from "../src/render-request";
import {
  APPROVED_GRADIENT_SCOPE_PNG_SHA256_V4,
  APPROVED_R5_CLASSIC_GRADIENT_PNG_SHA256_V4,
  APPROVED_R5_D4_ENGRAVING_PNG_SHA256_V4,
  APPROVED_R6_PROJECTED_PATTERN_PNG_SHA256_V4,
  APPROVED_R7_SURFACE_PATTERN_PNG_SHA256_V4,
} from "./approved-hashes";
import { decodePngRgba8 } from "./png";

const material = {
  family: "classic",
  treatment: "pattern",
  patternId: "checkerboard",
  opacity: "opaque",
  finish: "satin",
  textureScale: 100,
} as const;

const appearance: RenderAppearanceV4 = {
  material,
  palette: ["#5426a8", "#f2d95c"],
  texture: {
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[material.family],
    seed: 0x51ce_b00c,
    scale: 100,
    rotation: 0,
    offsetU: 0,
    offsetV: 0,
  },
  lighting: {
    mode: "combined",
    strength: "gentle",
    direction: "upper-left",
  },
  engraving: {
    fontId: "liberation-sans",
    finish: "matte-ink",
    color: "#faf2db",
  },
  outlineColor: "#000000",
  requiresLocalSeparation: false,
  effect: null,
};

const sharpAppearance: RenderAppearanceV4 = {
  ...appearance,
  material: {
    family: "sharp-resin",
    style: "clear",
    inclusion: "foil",
    clarity: 84,
    inclusionDensity: 34,
    finish: "polished",
    textureScale: 100,
  },
  palette: ["#170022", "#7b19b8", "#04c9df", "#f3d36a"],
  texture: {
    ...appearance.texture,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4["sharp-resin"],
  },
};

const crystalAppearance: RenderAppearanceV4 = {
  ...appearance,
  material: {
    family: "glass",
    style: "prismatic",
    clarity: 88,
    finish: "polished",
    textureScale: 100,
  },
  palette: ["#071932", "#00bde3", "#e94fbe", "#ffe17a"],
  texture: {
    ...appearance.texture,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4.glass,
  },
};

const HOLLOW_CAGE_CUT_THROUGH_PIXELS_V4 = [
  [85, 70],
  [64, 80],
  [79, 55],
  [84, 98],
] as const;

const hollowAppearance: RenderAppearanceV4 = {
  ...appearance,
  material: {
    family: "hollow-metal",
    construction: "filigree",
    metal: "brass",
    finish: "polished",
    openness: 58,
    textureScale: 100,
  },
  palette: ["#080609", "#72501e", "#e7b957"],
  texture: {
    ...appearance.texture,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4["hollow-metal"],
  },
};

function die(
  target: RenderDieV4["target"],
  result: number,
): RenderDieV4 {
  return target === "other"
    ? {
        target,
        sides: 999,
        result,
        form: "sphere",
        appearance,
        icons: [],
      }
    : {
        target,
        result,
        form: "standard",
        appearance,
        icons: [],
      };
}

function request(): RenderRequestV4 {
  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r1",
    groups: [[die("d20", 20), die("other", 999)]],
  };
}

function gradientScopeAppearance(
  scope?: "die-wide" | "face-local",
  rotation = 45,
): RenderAppearanceV4 {
  return {
    ...appearance,
    material: {
      family: "classic",
      treatment: "gradient",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    },
    palette: ["#170022", "#04c9df", "#f3d36a"],
    texture: {
      ...appearance.texture,
      rotation,
      ...(scope === undefined ? {} : { scope }),
    },
    engraving: {
      ...appearance.engraving,
      color: "#faf9f6",
    },
  };
}

function gradientScopeRequest(
  rendererRevision:
    | "canvaskit-v4-r1"
    | "canvaskit-v4-r2"
    | "canvaskit-v4-r3"
    | "canvaskit-v4-r4"
    | "canvaskit-v4-r5"
    | "canvaskit-v4-r6"
    | "canvaskit-v4-r7",
  scope?: "die-wide" | "face-local",
): RenderRequestV4 {
  return {
    version: 4,
    rendererRevision,
    groups: [
      [
        {
          ...die("d20", 20),
          appearance: gradientScopeAppearance(scope),
        },
      ],
    ],
  };
}

const GRADIENT_SCOPE_TARGETS_V4 = [
  ["d4", 4],
  ["d6", 6],
  ["d8", 8],
  ["d10", 10],
  ["d12", 12],
  ["d20", 20],
  ["percentile", 90],
  ["fudge", -1],
] as const;

function allTargetGradientScopeRequest(
  scope: "die-wide" | "face-local",
): RenderRequestV4 {
  const scopedAppearance = gradientScopeAppearance(scope);
  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r2",
    groups: [
      GRADIENT_SCOPE_TARGETS_V4.map(([target, result]) => ({
        ...die(target, result),
        appearance: scopedAppearance,
      })),
    ],
  };
}

function allDirectionFaceLocalRequest(): RenderRequestV4 {
  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r2",
    groups: [
      [0, 45, 90, 135, 180, 225, 270, 315].map((rotation) => ({
        ...die("d20", 20),
        appearance: gradientScopeAppearance("face-local", rotation),
      })),
    ],
  };
}

function maximumClassicRequest(): RenderRequestV4 {
  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r1",
    groups: [
      Array.from({ length: 50 }, (_, index) => ({
        ...die("d20", (index % 20) + 1),
        appearance: {
          ...appearance,
          texture: {
            ...appearance.texture,
            seed: (appearance.texture.seed + index) >>> 0,
            rotation: (index * 37) % 360,
            offsetU: (index * 12_345) % 65_536,
            offsetV: (index * 54_321) % 65_536,
          },
        },
      })),
    ],
  };
}

function maximumFaceLocalRequest(): RenderRequestV4 {
  const request = maximumClassicRequest();
  request.rendererRevision = "canvaskit-v4-r2";
  for (const die of request.groups[0] ?? []) {
    die.appearance = {
      ...die.appearance,
      material: {
        family: "classic",
        treatment: "gradient",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
      texture: {
        ...die.appearance.texture,
        offsetU: 0,
        offsetV: 0,
        scope: "face-local",
      },
    };
  }
  return request;
}

function specialD20Request(
  form: "sharp" | "crystal-cut" | "hollow-cage",
  specialAppearance: RenderAppearanceV4,
  rendererRevision: RenderRequestV4["rendererRevision"] = "canvaskit-v4-r1",
): RenderRequestV4 {
  return {
    version: 4,
    rendererRevision,
    groups: [
      [
        {
          ...die("d20", 20),
          form,
          appearance:
            rendererRevision === "canvaskit-v4-r1"
              ? specialAppearance
              : {
                  ...specialAppearance,
                  texture: {
                    ...specialAppearance.texture,
                    scope: "die-wide",
                  },
                },
        },
      ],
    ],
  };
}

function renderedFixture(): RenderedDiceRequestV4 {
  return {
    rendererRevision: "canvaskit-v4-r1",
    png: new Uint8Array([1, 2, 3]),
    width: 150,
    height: 150,
    visibleFaceCount: 1,
    diceCount: 1,
    rowCount: 1,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function transparentPixelCount(pixels: Uint8Array): number {
  let count = 0;
  for (let alpha = 3; alpha < pixels.length; alpha += 4) {
    if (pixels[alpha] === 0) count += 1;
  }
  return count;
}

function pixelAlpha(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
): number {
  return pixels[(y * width + x) * 4 + 3] as number;
}

function meanAbsoluteRgbDifference(
  first: Uint8Array,
  second: Uint8Array,
): number {
  if (first.length !== second.length || first.length % 4 !== 0) {
    throw new Error("RGBA pixel buffers must have equal dimensions");
  }
  let total = 0;
  for (let offset = 0; offset < first.length; offset += 4) {
    total += Math.abs(
      (first[offset] as number) - (second[offset] as number),
    );
    total += Math.abs(
      (first[offset + 1] as number) - (second[offset + 1] as number),
    );
    total += Math.abs(
      (first[offset + 2] as number) - (second[offset + 2] as number),
    );
  }
  return total / ((first.length / 4) * 3);
}

function gridCellPixels(
  pixels: Uint8Array,
  width: number,
  column: number,
): Uint8Array {
  const size = 150;
  const cell = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const sourceStart = (y * width + column * size) * 4;
    cell.set(
      pixels.subarray(sourceStart, sourceStart + size * 4),
      y * size * 4,
    );
  }
  return cell;
}

function alphaBounds(
  pixels: Uint8Array,
  width: number,
): { width: number; height: number } {
  let left = width;
  let top = 150;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < 150; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixelAlpha(pixels, width, x, y) === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) {
    throw new Error("Rendered alpha bounds are empty");
  }
  return { width: right - left + 1, height: bottom - top + 1 };
}

function lightingKey(lighting: RenderLightingV4): string {
  if (lighting.mode === "none") return lighting.mode;
  if (lighting.mode === "facet") {
    return `${lighting.mode}/${lighting.strength}`;
  }
  return `${lighting.mode}/${lighting.strength}/${lighting.direction}`;
}

function lightingVariants(): RenderLightingV4[] {
  return [
    { mode: "none" },
    ...LIGHTING_STRENGTHS_V4.map(
      (strength): RenderLightingV4 => ({ mode: "facet", strength }),
    ),
    ...(["directional", "combined"] as const).flatMap((mode) =>
      LIGHTING_STRENGTHS_V4.flatMap((strength) =>
        LIGHTING_DIRECTIONS_V4.map(
          (direction): RenderLightingV4 => ({ mode, strength, direction }),
        ),
      ),
    ),
  ];
}

function createRequestRenderer(
  canvasKit: CanvasKitRuntimeV4,
): CanvasKitDiceRequestRendererV4 {
  return new CanvasKitDiceRequestRendererV4({
    canvasKit,
    defaultFontId: "liberation-sans",
    fontDataById: CANVASKIT_FONT_DATA_V4,
  });
}

describe("CanvasKit Render Request V4", () => {
  let canvasKit: CanvasKitRuntimeV4;

  beforeAll(async () => {
    canvasKit = await loadCanvasKitV4();
  });

  it("validates and composes a mixed request with one final deterministic PNG", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);

    const first = await renderDiceRequestV4ToPng(request(), createRenderer);
    const second = await renderDiceRequestV4ToPng(request(), createRenderer);
    const coloredRequest = request();
    const coloredDie = coloredRequest.groups[0]?.[0];
    if (coloredDie === undefined) throw new Error("Fixture die is missing");
    coloredDie.appearance = {
      ...coloredDie.appearance,
      engraving: {
        ...coloredDie.appearance.engraving,
        color: "#123456",
      },
    };
    const colored = await renderDiceRequestV4ToPng(
      coloredRequest,
      createRenderer,
    );
    const fontRequest = request();
    const [polyhedralDie, sphericalDie] = fontRequest.groups[0] ?? [];
    if (polyhedralDie === undefined || sphericalDie === undefined) {
      throw new Error("Fixture font dice are missing");
    }
    polyhedralDie.appearance = {
      ...polyhedralDie.appearance,
      engraving: {
        ...polyhedralDie.appearance.engraving,
        fontId: "new-rocker",
      },
    };
    sphericalDie.appearance = {
      ...sphericalDie.appearance,
      engraving: {
        ...sphericalDie.appearance.engraving,
        fontId: "syncopate",
      },
    };
    const fontRendered = await renderDiceRequestV4ToPng(
      fontRequest,
      createRenderer,
    );
    expect(first).toMatchObject({
      rendererRevision: "canvaskit-v4-r1",
      width: 300,
      height: 150,
      diceCount: 2,
      rowCount: 1,
      visibleFaceCount: 11,
    });
    expect(sha256(first.png)).toBe(
      "dc87b76175f641691aa2505794cf35a60d02d53027062838909f16db4eb0196c",
    );
    expect(second.png).toEqual(first.png);
    expect(colored.png).not.toEqual(first.png);
    expect(fontRendered).toMatchObject({
      width: 300,
      height: 150,
      diceCount: 2,
      rowCount: 1,
    });
    expect(fontRendered.png).not.toEqual(first.png);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("preserves r1 pixels for r2 die-wide scope and renders face-local scope deterministically", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const r1 = await renderDiceRequestV4ToPng(
      gradientScopeRequest("canvaskit-v4-r1"),
      createRenderer,
    );
    const dieWide = await renderDiceRequestV4ToPng(
      gradientScopeRequest("canvaskit-v4-r2", "die-wide"),
      createRenderer,
    );
    const faceLocal = await renderDiceRequestV4ToPng(
      gradientScopeRequest("canvaskit-v4-r2", "face-local"),
      createRenderer,
    );
    const allTargetsDieWide = await renderDiceRequestV4ToPng(
      allTargetGradientScopeRequest("die-wide"),
      createRenderer,
    );
    const allTargetsFaceLocal = await renderDiceRequestV4ToPng(
      allTargetGradientScopeRequest("face-local"),
      createRenderer,
    );
    const directions = await renderDiceRequestV4ToPng(
      allDirectionFaceLocalRequest(),
      createRenderer,
    );
    const repeated = await renderDiceRequestV4ToPng(
      allTargetGradientScopeRequest("face-local"),
      createRenderer,
    );

    expect(dieWide.png).toEqual(r1.png);
    expect(faceLocal).toMatchObject({
      rendererRevision: "canvaskit-v4-r2",
      width: 150,
      height: 150,
      diceCount: 1,
      rowCount: 1,
    });
    expect(allTargetsFaceLocal).toMatchObject({
      rendererRevision: "canvaskit-v4-r2",
      width: 1_200,
      height: 150,
      diceCount: 8,
      rowCount: 1,
    });
    expect(repeated.png).toEqual(allTargetsFaceLocal.png);
    expect(faceLocal.png).not.toEqual(dieWide.png);
    expect(sha256(allTargetsDieWide.png)).toBe(
      APPROVED_GRADIENT_SCOPE_PNG_SHA256_V4["all-targets-die-wide"],
    );
    expect(sha256(allTargetsFaceLocal.png)).toBe(
      APPROVED_GRADIENT_SCOPE_PNG_SHA256_V4["all-targets-face-local"],
    );
    expect(sha256(directions.png)).toBe(
      APPROVED_GRADIENT_SCOPE_PNG_SHA256_V4[
        "d20-face-local-directions"
      ],
    );
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("uses the additive r3 d20 framing without changing r2 pixels", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const r2 = await renderDiceRequestV4ToPng(
      gradientScopeRequest("canvaskit-v4-r2", "die-wide"),
      createRenderer,
    );
    const r3 = await renderDiceRequestV4ToPng(
      gradientScopeRequest("canvaskit-v4-r3", "die-wide"),
      createRenderer,
    );
    const decoded = await decodePngRgba8(r3.png);

    expect(r3.rendererRevision).toBe("canvaskit-v4-r3");
    expect(r3.png).not.toEqual(r2.png);
    expect(alphaBounds(decoded.pixels, decoded.width)).toEqual({
      width: 116,
      height: 130,
    });
  });

  it("adds vivid r4 gradients, thin standard borders, and blank-face rendering without changing r3", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const revision3 = gradientScopeRequest("canvaskit-v4-r3", "die-wide");
    const revision4 = gradientScopeRequest("canvaskit-v4-r4", "die-wide");
    const transPalette = [
      "#5bcffa",
      "#f5abb9",
      "#ffffff",
      "#f5abb9",
      "#5bcffa",
    ] as [string, string, ...string[]];
    const r3Die = revision3.groups[0]?.[0];
    const r4Die = revision4.groups[0]?.[0];
    if (r3Die === undefined || r4Die === undefined) {
      throw new Error("Gradient revision fixture is missing");
    }
    r3Die.appearance.palette = transPalette;
    r4Die.appearance.palette = transPalette;

    const r3 = await renderDiceRequestV4ToPng(revision3, createRenderer);
    const r4 = await renderDiceRequestV4ToPng(revision4, createRenderer);
    const blank = await renderDiceRequestV4ToPng(
      revision4,
      createRenderer,
      { blankFaces: true },
    );

    expect(r4).toMatchObject({
      rendererRevision: "canvaskit-v4-r4",
      width: 150,
      height: 150,
      diceCount: 1,
    });
    expect(r4.png).not.toEqual(r3.png);
    expect(blank.png).not.toEqual(r4.png);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("adds exact r5 gradients and restrained gentle lighting without changing r4", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const revision4 = gradientScopeRequest("canvaskit-v4-r4", "die-wide");
    const revision5 = gradientScopeRequest("canvaskit-v4-r5", "die-wide");
    const directional = structuredClone(revision5);
    const seeded = structuredClone(revision5);
    const directionalDie = directional.groups[0]?.[0];
    const seededDie = seeded.groups[0]?.[0];
    if (directionalDie === undefined || seededDie === undefined) {
      throw new Error("R5 gradient fixture is missing");
    }
    directionalDie.appearance.lighting = {
      mode: "directional",
      strength: "gentle",
      direction: "upper-left",
    };
    seededDie.appearance.texture.seed =
      (seededDie.appearance.texture.seed ^ 0xffff_ffff) >>> 0;

    const r4 = await renderDiceRequestV4ToPng(revision4, createRenderer);
    const r5 = await renderDiceRequestV4ToPng(revision5, createRenderer);
    const repeated = await renderDiceRequestV4ToPng(
      revision5,
      createRenderer,
    );
    const explicitlyDirectional = await renderDiceRequestV4ToPng(
      directional,
      createRenderer,
    );
    const differentSeed = await renderDiceRequestV4ToPng(
      seeded,
      createRenderer,
    );

    expect(r5.rendererRevision).toBe("canvaskit-v4-r5");
    expect(r5.png).toEqual(repeated.png);
    expect(r5.png).toEqual(explicitlyDirectional.png);
    expect(r5.png).toEqual(differentSeed.png);
    expect(r5.png).not.toEqual(r4.png);
    expect(sha256(r5.png)).toBe(APPROVED_R5_CLASSIC_GRADIENT_PNG_SHA256_V4);
  });

  it("wraps r7 patterns over the die surface without changing r6 pixels or r7 gradients", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const requestFor = (
      rendererRevision: "canvaskit-v4-r6" | "canvaskit-v4-r7",
      renderedAppearance: RenderAppearanceV4,
    ): RenderRequestV4 => ({
      version: 4,
      rendererRevision,
      groups: [[{ ...die("d20", 12), appearance: renderedAppearance }]],
    });
    const patternAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" },
      lighting: { mode: "none" },
    } satisfies RenderAppearanceV4;
    const r6Pattern = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r6", patternAppearance),
      createRenderer,
      { blankFaces: true },
    );
    const r7Pattern = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r7", patternAppearance),
      createRenderer,
      { blankFaces: true },
    );
    const repeatedR7Pattern = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r7", patternAppearance),
      createRenderer,
      { blankFaces: true },
    );
    expect(r7Pattern.rendererRevision).toBe("canvaskit-v4-r7");
    expect(sha256(r6Pattern.png)).toBe(
      APPROVED_R6_PROJECTED_PATTERN_PNG_SHA256_V4,
    );
    expect(r7Pattern.png).not.toEqual(r6Pattern.png);
    expect(sha256(r7Pattern.png)).toBe(
      APPROVED_R7_SURFACE_PATTERN_PNG_SHA256_V4,
    );
    expect(r7Pattern.png).toEqual(repeatedR7Pattern.png);

    const gradientAppearance = gradientScopeAppearance("die-wide");
    const r6Gradient = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r6", gradientAppearance),
      createRenderer,
      { blankFaces: true },
    );
    const r7Gradient = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r7", gradientAppearance),
      createRenderer,
      { blankFaces: true },
    );
    expect(r7Gradient.png).toEqual(r6Gradient.png);
  });

  it("wraps every r7 classic pattern across every standard die surface", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    for (const patternId of PATTERN_IDS_V4) {
      const patternAppearance = {
        ...appearance,
        material: { ...material, patternId },
        texture: { ...appearance.texture, scope: "die-wide" },
        lighting: { mode: "none" },
      } satisfies RenderAppearanceV4;
      const groups: RenderRequestV4["groups"] = [[
        ...GRADIENT_SCOPE_TARGETS_V4.map(([target, result]) => ({
          ...die(target, result),
          appearance: patternAppearance,
        })),
        { ...die("other", 999), appearance: patternAppearance },
      ]];
      const r6 = await renderDiceRequestV4ToPng(
        {
          version: 4,
          rendererRevision: "canvaskit-v4-r6",
          groups,
        },
        createRenderer,
        { blankFaces: true },
      );
      const r7 = await renderDiceRequestV4ToPng(
        {
          version: 4,
          rendererRevision: "canvaskit-v4-r7",
          groups,
        },
        createRenderer,
        { blankFaces: true },
      );
      const [r6Pixels, r7Pixels] = await Promise.all([
        decodePngRgba8(r6.png),
        decodePngRgba8(r7.png),
      ]);
      for (let column = 0; column < GRADIENT_SCOPE_TARGETS_V4.length; column += 1) {
        expect(
          gridCellPixels(r7Pixels.pixels, r7Pixels.width, column),
          `${patternId}:${GRADIENT_SCOPE_TARGETS_V4[column]?.[0] ?? "unknown"}`,
        ).not.toEqual(gridCellPixels(r6Pixels.pixels, r6Pixels.width, column));
      }
      expect(
        gridCellPixels(r7Pixels.pixels, r7Pixels.width, 8),
        `${patternId}:other`,
      ).toEqual(gridCellPixels(r6Pixels.pixels, r6Pixels.width, 8));
    }
  });

  it("adds only the r6 d20 font scale and low-contrast engraving edge", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const solidAppearance: RenderAppearanceV4 = {
      ...appearance,
      material: {
        family: "classic",
        treatment: "solid",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
      palette: ["#f2d95c", "#f2d95d"],
      texture: { ...appearance.texture, scope: "die-wide" },
      lighting: { mode: "none" },
      engraving: {
        fontId: "liberation-sans",
        finish: "matte-ink",
        color: "#111111",
      },
    };
    const requestFor = (
      rendererRevision:
        | "canvaskit-v4-r5"
        | "canvaskit-v4-r6"
        | "canvaskit-v4-r7",
      renderedAppearance: RenderAppearanceV4,
    ): RenderRequestV4 => ({
      version: 4,
      rendererRevision,
      groups: [[{ ...die("d20", 1), appearance: renderedAppearance }]],
    });

    const r5 = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r5", solidAppearance),
      createRenderer,
    );
    const r6 = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r6", solidAppearance),
      createRenderer,
    );
    const r7 = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r7", solidAppearance),
      createRenderer,
    );
    expect(r6.png).not.toEqual(r5.png);
    expect(r7.png).toEqual(r6.png);

    const unchangedFont = {
      ...solidAppearance,
      engraving: { ...solidAppearance.engraving, fontId: "new-rocker" },
    } satisfies RenderAppearanceV4;
    const unchangedR5 = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r5", unchangedFont),
      createRenderer,
    );
    const unchangedR6 = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r6", unchangedFont),
      createRenderer,
    );
    expect(unchangedR6.png).toEqual(unchangedR5.png);

    const lowContrast = {
      ...unchangedFont,
      engraving: {
        ...unchangedFont.engraving,
        finish: "luminous",
        color: "#faf9f6",
      },
    } satisfies RenderAppearanceV4;
    const lowContrastR5 = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r5", lowContrast),
      createRenderer,
    );
    const rescuedR6 = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r6", lowContrast),
      createRenderer,
    );
    const rescuedR7 = await renderDiceRequestV4ToPng(
      requestFor("canvaskit-v4-r7", lowContrast),
      createRenderer,
    );
    expect(rescuedR6.png).not.toEqual(lowContrastR5.png);
    expect(rescuedR7.png).toEqual(rescuedR6.png);
    expect(rescuedR6.rendererRevision).toBe("canvaskit-v4-r6");
  });

  it("keeps r5 d4 matte engraving stable while strengthening finish distinction", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const render = async (
      rendererRevision: "canvaskit-v4-r4" | "canvaskit-v4-r5",
      finish: (typeof ENGRAVING_FINISHES_V4)[number],
    ) => {
      const d4Appearance: RenderAppearanceV4 = {
        ...gradientScopeAppearance("die-wide"),
        material: {
          family: "classic",
          treatment: "solid",
          opacity: "opaque",
          finish: "satin",
          textureScale: 100,
        },
        palette: ["#ff00ff", "#111111"],
        lighting: { mode: "none" },
        engraving: {
          fontId: "new-rocker",
          finish,
          color: "#111111",
        },
      };
      return renderDiceRequestV4ToPng(
        {
          version: 4,
          rendererRevision,
          groups: [[{ ...die("d4", 4), appearance: d4Appearance }]],
        },
        createRenderer,
      );
    };
    const revision4 = new Map<string, Uint8Array<ArrayBuffer>>();
    const revision5 = new Map<string, Uint8Array<ArrayBuffer>>();
    for (const finish of ENGRAVING_FINISHES_V4) {
      revision4.set(finish, (await render("canvaskit-v4-r4", finish)).png);
      revision5.set(finish, (await render("canvaskit-v4-r5", finish)).png);
    }

    expect(revision5.get("matte-ink")).toEqual(revision4.get("matte-ink"));
    for (const finish of ["enamel", "metallic", "luminous"] as const) {
      expect(revision5.get(finish)).not.toEqual(revision4.get(finish));
    }
    const mattePng = revision5.get("matte-ink");
    if (mattePng === undefined) throw new Error("Missing r5 matte d4 render");
    const mattePixels = (await decodePngRgba8(mattePng)).pixels;
    const minimumDifferenceByFinish = {
      enamel: 0.35,
      metallic: 0.5,
      luminous: 0.8,
    } as const;
    for (const finish of ["enamel", "metallic", "luminous"] as const) {
      const finishPng = revision5.get(finish);
      if (finishPng === undefined) {
        throw new Error(`Missing r5 ${finish} d4 render`);
      }
      const finishPixels = (await decodePngRgba8(finishPng)).pixels;
      expect(meanAbsoluteRgbDifference(mattePixels, finishPixels)).toBeGreaterThan(
        minimumDifferenceByFinish[finish],
      );
    }
    expect(new Set([...revision5.values()].map(sha256))).toHaveLength(
      ENGRAVING_FINISHES_V4.length,
    );
    expect(
      Object.fromEntries(
        [...revision5.entries()].map(([finish, png]) => [finish, sha256(png)]),
      ),
    ).toEqual(APPROVED_R5_D4_ENGRAVING_PNG_SHA256_V4);
  });

  it("keeps r3 rendering changes scoped to standard d20 geometry", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const d6Request = (
      rendererRevision: "canvaskit-v4-r2" | "canvaskit-v4-r3",
    ): RenderRequestV4 => ({
      version: 4,
      rendererRevision,
      groups: [
        [
          {
            ...die("d6", 6),
            appearance: gradientScopeAppearance("die-wide"),
          },
        ],
      ],
    });
    const requestPairs = [
      [d6Request("canvaskit-v4-r2"), d6Request("canvaskit-v4-r3")],
      [
        specialD20Request("sharp", sharpAppearance, "canvaskit-v4-r2"),
        specialD20Request("sharp", sharpAppearance, "canvaskit-v4-r3"),
      ],
      [
        specialD20Request(
          "crystal-cut",
          crystalAppearance,
          "canvaskit-v4-r2",
        ),
        specialD20Request(
          "crystal-cut",
          crystalAppearance,
          "canvaskit-v4-r3",
        ),
      ],
      [
        specialD20Request(
          "hollow-cage",
          hollowAppearance,
          "canvaskit-v4-r2",
        ),
        specialD20Request(
          "hollow-cage",
          hollowAppearance,
          "canvaskit-v4-r3",
        ),
      ],
    ] as const;

    for (const [revision2, revision3] of requestPairs) {
      const r2 = await renderDiceRequestV4ToPng(revision2, createRenderer);
      const r3 = await renderDiceRequestV4ToPng(revision3, createRenderer);
      expect(r3.png).toEqual(r2.png);
    }
  });

  it("renders flat modifier icons and critical state treatments deterministically", async () => {
    const criticalAppearance = (
      state: "critical-success" | "critical-failure",
    ): RenderAppearanceV4 => ({
      ...appearance,
      effect: {
        state,
        treatment: "classic-glow",
        color: state === "critical-success" ? "#ffd447" : "#ff334f",
        intensity: 72,
      },
    });
    const dice = [
      { ...die("d20", 20), icons: ["trashcan", "explosion", "recycle"] },
      { ...die("d20", 20), icons: ["chevronUp", "chevronDown", "target-success"] },
      {
        ...die("d20", 20),
        appearance: criticalAppearance("critical-success"),
        icons: ["critical-success"],
      },
      {
        ...die("d20", 1),
        appearance: criticalAppearance("critical-failure"),
        icons: ["critical-failure"],
      },
      { ...die("d20", 20), icons: ["penetrate", "unique", "blank"] },
    ] as RenderDieV4[];
    const iconRequest: RenderRequestV4 = {
      version: 4,
      rendererRevision: "canvaskit-v4-r1",
      groups: [dice],
    };
    const createRenderer = () => createRequestRenderer(canvasKit);
    const first = await renderDiceRequestV4ToPng(iconRequest, createRenderer);
    const repeated = await renderDiceRequestV4ToPng(iconRequest, createRenderer);

    expect(first).toMatchObject({
      width: 750,
      height: 187,
      diceCount: 5,
      rowCount: 1,
    });
    expect(repeated.png).toEqual(first.png);
    expect(sha256(first.png)).toBe(
      "11fa38c5e8ec7ae4cb4967915e9e715c11228fa0514a3b3b48e18da0f49e0c23",
    );
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("renders every lighting treatment deterministically with physical directions", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const hashes = new Map<string, string>();
    const variants = lightingVariants();

    for (const lighting of variants) {
      const litRequest = request();
      for (const group of litRequest.groups) {
        for (const requestDie of group) {
          requestDie.appearance = {
            ...requestDie.appearance,
            lighting,
          };
        }
      }
      const first = await renderDiceRequestV4ToPng(litRequest, createRenderer);
      const repeated = await renderDiceRequestV4ToPng(
        litRequest,
        createRenderer,
      );
      expect(repeated.png).toEqual(first.png);
      hashes.set(lightingKey(lighting), sha256(first.png));
    }

    expect(hashes.get("combined/gentle/upper-left")).toBe(
      "dc87b76175f641691aa2505794cf35a60d02d53027062838909f16db4eb0196c",
    );
    expect(new Set(hashes.values()).size).toBe(variants.length);

    const independentlyLit: RenderRequestV4 = {
      version: 4,
      rendererRevision: "canvaskit-v4-r1",
      groups: [[die("other", 999), die("other", 999)]],
    };
    const [unlitDie, stronglyLitDie] = independentlyLit.groups[0] ?? [];
    if (unlitDie === undefined || stronglyLitDie === undefined) {
      throw new Error("Lighting cache fixture is incomplete");
    }
    unlitDie.appearance = {
      ...unlitDie.appearance,
      lighting: { mode: "none" },
    };
    stronglyLitDie.appearance = {
      ...stronglyLitDie.appearance,
      lighting: {
        mode: "combined",
        strength: "strong",
        direction: "right",
      },
    };
    const uniformLighting: RenderRequestV4 = {
      ...independentlyLit,
      groups: [[unlitDie, { ...unlitDie }]],
    };
    const independent = await renderDiceRequestV4ToPng(
      independentlyLit,
      createRenderer,
    );
    const uniform = await renderDiceRequestV4ToPng(
      uniformLighting,
      createRenderer,
    );
    expect(independent.png).not.toEqual(uniform.png);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  }, 15_000);

  it("renders every engraving finish deterministically under approved lighting", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const hashes = new Map<string, string>();

    for (const finish of ENGRAVING_FINISHES_V4) {
      const finishRequest = request();
      for (const group of finishRequest.groups) {
        for (const requestDie of group) {
          requestDie.appearance = {
            ...requestDie.appearance,
            engraving: {
              ...requestDie.appearance.engraving,
              finish,
            },
          };
        }
      }
      const first = await renderDiceRequestV4ToPng(
        finishRequest,
        createRenderer,
      );
      const repeated = await renderDiceRequestV4ToPng(
        finishRequest,
        createRenderer,
      );
      expect(repeated.png).toEqual(first.png);
      hashes.set(finish, sha256(first.png));
    }

    expect(Object.fromEntries(hashes)).toEqual({
      "matte-ink":
        "dc87b76175f641691aa2505794cf35a60d02d53027062838909f16db4eb0196c",
      enamel:
        "13bb31763da2c3fb664eaaaeb826f27a84803647ab8519473e7063cf75edd131",
      metallic:
        "bb8b25b2e9e3311a86c83a055193e515346ba8ae50edc4cb0f5d63593ce0823e",
      luminous:
        "e9aad813ccabfec595a8e29acc2a6c27f42c021256b97b6051a39a4198678bb3",
      void: "92aa991ffbc8b33259618a9bb7b95e853bd2dfdcbed0e07f577aa787d2f8fc27",
    });
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("renders physical local separation for dark Void deterministically", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const darkVoidRequest = (requiresLocalSeparation: boolean): RenderRequestV4 => {
      const value = request();
      for (const group of value.groups) {
        for (const requestDie of group) {
          requestDie.appearance = {
            ...requestDie.appearance,
            palette: ["#030207", "#13051a"],
            engraving: {
              ...requestDie.appearance.engraving,
              finish: "void",
              color: "#faf2db",
            },
            requiresLocalSeparation,
          };
        }
      }
      return value;
    };
    const separatedRequest = darkVoidRequest(true);
    const unseparatedRequest = darkVoidRequest(false);
    const first = await renderDiceRequestV4ToPng(
      separatedRequest,
      createRenderer,
    );
    const repeated = await renderDiceRequestV4ToPng(
      separatedRequest,
      createRenderer,
    );
    const unseparated = await renderDiceRequestV4ToPng(
      unseparatedRequest,
      createRenderer,
    );

    expect(first).toMatchObject({
      width: 300,
      height: 150,
      diceCount: 2,
      rowCount: 1,
      visibleFaceCount: 11,
    });
    expect(repeated.png).toEqual(first.png);
    expect(unseparated.png).not.toEqual(first.png);
    expect(sha256(first.png)).toBe(
      "de02ba16084556cf24418ac083f04270e936b413f28ffe4334f518bbb66641fb",
    );
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("preserves separated special forms and hollow cut-throughs", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const cases = [
      ["sharp", sharpAppearance, 10],
      ["crystal-cut", crystalAppearance, 31],
      ["hollow-cage", hollowAppearance, 70],
    ] as const;
    const hashes: Record<string, string> = {};

    for (const [form, baseAppearance, visibleFaceCount] of cases) {
      const separatedAppearance: RenderAppearanceV4 = {
        ...baseAppearance,
        engraving: {
          ...baseAppearance.engraving,
          finish: "void",
          color: "#faf2db",
        },
        requiresLocalSeparation: true,
      };
      const unseparatedAppearance: RenderAppearanceV4 = {
        ...separatedAppearance,
        requiresLocalSeparation: false,
      };
      const separatedRequest = specialD20Request(form, separatedAppearance);
      const first = await renderDiceRequestV4ToPng(
        separatedRequest,
        createRenderer,
      );
      const repeated = await renderDiceRequestV4ToPng(
        separatedRequest,
        createRenderer,
      );
      const unseparated = await renderDiceRequestV4ToPng(
        specialD20Request(form, unseparatedAppearance),
        createRenderer,
      );
      const separatedPixels = await decodePngRgba8(first.png);
      const unseparatedPixels = await decodePngRgba8(unseparated.png);

      expect(first).toMatchObject({
        width: 150,
        height: 150,
        diceCount: 1,
        rowCount: 1,
        visibleFaceCount,
      });
      expect(repeated.png).toEqual(first.png);
      expect(unseparated.png).not.toEqual(first.png);
      hashes[form] = sha256(first.png);
      if (form === "hollow-cage") {
        const separatedTransparent = transparentPixelCount(
          separatedPixels.pixels,
        );
        const unseparatedTransparent = transparentPixelCount(
          unseparatedPixels.pixels,
        );
        expect(
          Math.abs(separatedTransparent - unseparatedTransparent),
        ).toBeLessThanOrEqual(300);
        for (const [x, y] of HOLLOW_CAGE_CUT_THROUGH_PIXELS_V4) {
          expect(pixelAlpha(separatedPixels.pixels, 150, x, y)).toBe(0);
          expect(pixelAlpha(unseparatedPixels.pixels, 150, x, y)).toBe(0);
        }
      }
    }

    expect(hashes).toEqual({
      sharp: "6576b9785e1506f58b40d7274c9afe6da36dc636a0a8dbde53810ec7ff551c11",
      "crystal-cut":
        "3c6d6711ba372b886164cfcad616e6bb316cd9ea88eac8184701c05dca3adde2",
      "hollow-cage":
        "b9cfed046ef398c62de589fff50b4ca7203fb14cf145b6d3da6f408cb2d5c791",
    });
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("preserves hollow cut-throughs under the inner-cage critical effect", async () => {
    const criticalAppearance: RenderAppearanceV4 = {
      ...hollowAppearance,
      effect: {
        state: "critical-success",
        treatment: "inner-cage",
        color: "#ffd447",
        intensity: 72,
      },
    };
    const criticalRequest = specialD20Request(
      "hollow-cage",
      criticalAppearance,
    );
    const criticalDie = criticalRequest.groups[0]?.[0];
    if (criticalDie === undefined) throw new Error("Fixture die is missing");
    criticalDie.icons = ["critical-success"];
    const createRenderer = () => createRequestRenderer(canvasKit);
    const first = await renderDiceRequestV4ToPng(
      criticalRequest,
      createRenderer,
    );
    const repeated = await renderDiceRequestV4ToPng(
      criticalRequest,
      createRenderer,
    );
    const decoded = await decodePngRgba8(first.png);

    expect(first).toMatchObject({
      width: 150,
      height: 187,
      diceCount: 1,
      rowCount: 1,
      visibleFaceCount: 70,
    });
    expect(repeated.png).toEqual(first.png);
    for (const [x, y] of HOLLOW_CAGE_CUT_THROUGH_PIXELS_V4) {
      expect(pixelAlpha(decoded.pixels, 150, x, y)).toBe(0);
    }
    expect(sha256(first.png)).toBe(
      "96430981ddd21e72decbf97f7ecabc700a15258da8a94aa195c90a2d681102fd",
    );
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("renders an authored sharp-resin d20 deterministically", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);

    const first = await renderDiceRequestV4ToPng(
      specialD20Request("sharp", sharpAppearance),
      createRenderer,
    );
    const second = await renderDiceRequestV4ToPng(
      specialD20Request("sharp", sharpAppearance),
      createRenderer,
    );

    expect(first).toMatchObject({
      rendererRevision: "canvaskit-v4-r1",
      width: 150,
      height: 150,
      diceCount: 1,
      rowCount: 1,
      visibleFaceCount: 10,
    });
    expect(sha256(first.png)).toBe(
      "0bb7afd88356d651e52c56d5fe8c3c134557f0804a926a3815eea3afbd57cec3",
    );
    expect(second.png).toEqual(first.png);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("renders an authored crystal-cut glass d20 deterministically", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);

    const first = await renderDiceRequestV4ToPng(
      specialD20Request("crystal-cut", crystalAppearance),
      createRenderer,
    );
    const second = await renderDiceRequestV4ToPng(
      specialD20Request("crystal-cut", crystalAppearance),
      createRenderer,
    );

    expect(first).toMatchObject({
      rendererRevision: "canvaskit-v4-r1",
      width: 150,
      height: 150,
      diceCount: 1,
      rowCount: 1,
      visibleFaceCount: 31,
    });
    expect(sha256(first.png)).toBe(
      "5e6d88fc6e958eab86b86534ddf1475d175741460e8503de68e30aee5f242339",
    );
    expect(second.png).toEqual(first.png);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("renders an authored hollow-metal cage d20 deterministically", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);

    const first = await renderDiceRequestV4ToPng(
      specialD20Request("hollow-cage", hollowAppearance),
      createRenderer,
    );
    const second = await renderDiceRequestV4ToPng(
      specialD20Request("hollow-cage", hollowAppearance),
      createRenderer,
    );

    expect(first).toMatchObject({
      rendererRevision: "canvaskit-v4-r1",
      width: 150,
      height: 150,
      diceCount: 1,
      rowCount: 1,
      visibleFaceCount: 70,
    });
    expect(sha256(first.png)).toBe(
      "3d31ec2067806e57b064134b61b590bb98ba7865ecc251416a9ecbfada5f885c",
    );
    expect(second.png).toEqual(first.png);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("places shared textures independently across every mapping path", async () => {
    const transformedPlacement: TexturePlacementV4 = {
      rotation: 37,
      offsetU: 12_345,
      offsetV: 54_321,
    };
    const placed = (requestDie: RenderDieV4): RenderDieV4 => ({
      ...requestDie,
      appearance: {
        ...requestDie.appearance,
        texture: {
          ...requestDie.appearance.texture,
          ...transformedPlacement,
        },
      },
    });
    const placementRequest: RenderRequestV4 = {
      version: 4,
      rendererRevision: "canvaskit-v4-r1",
      groups: [
        [
          die("d6", 6),
          placed(die("d6", 6)),
          die("d20", 20),
          placed(die("d20", 20)),
          die("other", 999),
          placed(die("other", 999)),
        ],
      ],
    };
    const createRenderer = () => createRequestRenderer(canvasKit);

    const first = await renderDiceRequestV4ToPng(
      placementRequest,
      createRenderer,
    );
    const repeated = await renderDiceRequestV4ToPng(
      placementRequest,
      createRenderer,
    );
    const decoded = await decodePngRgba8(first.png);

    expect(first).toMatchObject({
      width: 900,
      height: 150,
      diceCount: 6,
      rowCount: 1,
    });
    expect(repeated.png).toEqual(first.png);
    for (const identityColumn of [0, 2, 4]) {
      expect(
        gridCellPixels(decoded.pixels, decoded.width, identityColumn),
      ).not.toEqual(
        gridCellPixels(decoded.pixels, decoded.width, identityColumn + 1),
      );
    }
    expect(sha256(first.png)).toBe(
      "22de54b791f27a1807ac0008b165ac7d359a7e0796dd8262c9c8e8d869725cef",
    );
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(33_554_432);
  });

  it("rejects invalid and unsupported requests before renderer allocation", async () => {
    let factoryCalls = 0;
    const factory = () => {
      factoryCalls += 1;
      throw new Error("renderer factory must not be called");
    };

    await expect(
      renderDiceRequestV4ToPng(
        {
          ...request(),
          rendererRevision:
            "canvaskit-v4-r8" as RenderRequestV4["rendererRevision"],
        },
        factory,
      ),
    ).rejects.toThrow("Render request rendererRevision is not supported");
    const unsupportedMutations: readonly ((die: RenderDieV4) => void)[] = [
      (die) => {
        die.target = "d6";
        die.result = 6;
        die.form = "sharp";
      },
      (die) => {
        die.target = "d6";
        die.result = 6;
        die.form = "crystal-cut";
        die.appearance = crystalAppearance;
      },
      (die) => {
        die.target = "d6";
        die.result = 6;
        die.form = "hollow-cage";
        die.appearance = hollowAppearance;
      },
    ];
    for (const mutate of unsupportedMutations) {
      const unsupported = request();
      const firstDie = unsupported.groups[0]?.[0];
      if (firstDie === undefined) throw new Error("Fixture die is missing");
      mutate(firstDie);
      await expect(
        renderDiceRequestV4ToPng(unsupported, factory),
      ).rejects.toThrow(
        "Render request groups[0][0].form is not implemented for d6",
      );
    }
    await expect(renderV4WithSingleRetry("{", factory)).rejects.toThrow(
      "Render request V4 JSON is invalid",
    );
    expect(factoryCalls).toBe(0);
  });

  it("recreates renderer-owned state once after an injected first failure", async () => {
    let factoryCalls = 0;
    let disposals = 0;
    const receivedResults: number[] = [];
    const factory = (): DiceRequestRendererV4 => {
      factoryCalls += 1;
      const attempt = factoryCalls;
      return {
        renderValidated(receivedRequest) {
          const receivedDie = receivedRequest.groups[0]?.[0];
          if (receivedDie === undefined) throw new Error("Received die is missing");
          receivedResults.push(receivedDie.result);
          if (attempt === 1) {
            receivedDie.result = 1;
            return Promise.reject(new Error("injected render failure"));
          }
          return Promise.resolve(renderedFixture());
        },
        dispose() {
          disposals += 1;
        },
      };
    };

    const rendered = await renderV4WithSingleRetry(
      serializeRenderRequestV4(request()),
      factory,
    );

    expect(rendered).toEqual(renderedFixture());
    expect(factoryCalls).toBe(2);
    expect(disposals).toBe(2);
    expect(receivedResults).toEqual([20, 20]);
  });

  it("retries after cleanup failure with fresh renderer-owned state", async () => {
    let factoryCalls = 0;
    let disposals = 0;
    const factory = (): DiceRequestRendererV4 => {
      factoryCalls += 1;
      const attempt = factoryCalls;
      return {
        renderValidated() {
          return Promise.resolve(renderedFixture());
        },
        dispose() {
          disposals += 1;
          if (attempt === 1) throw new Error("injected cleanup failure");
        },
      };
    };

    await expect(
      renderV4WithSingleRetry(serializeRenderRequestV4(request()), factory),
    ).resolves.toEqual(renderedFixture());
    expect(factoryCalls).toBe(2);
    expect(disposals).toBe(2);
  });

  it("releases synchronous render resources before concurrent promises resolve", async () => {
    const renderers = Array.from({ length: 4 }, () =>
      createRequestRenderer(canvasKit),
    );
    const initialWasmHeapBytes = canvasKit.HEAPU8.buffer.byteLength;
    try {
      const renders = renderers.map((renderer) =>
        renderer.renderValidated(maximumFaceLocalRequest()),
      );
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(initialWasmHeapBytes);
      const [expected, ...concurrent] = await Promise.all(renders);
      if (expected === undefined) {
        throw new Error("Concurrent render fixture is missing");
      }
      for (const rendered of concurrent) expect(rendered).toEqual(expected);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(initialWasmHeapBytes);
    } finally {
      for (const renderer of renderers.reverse()) renderer.dispose();
    }
  }, 30_000);

  it("returns a typed failure after exactly two failed attempts", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let factoryCalls = 0;
    let disposals = 0;
    const factory = (): DiceRequestRendererV4 => {
      factoryCalls += 1;
      if (factoryCalls === 1) throw new Error("injected initialization failure");
      return {
        renderValidated() {
          return Promise.reject(new Error("injected render failure"));
        },
        dispose() {
          disposals += 1;
        },
      };
    };

    try {
      const failure = await renderV4WithSingleRetry(
        serializeRenderRequestV4(request()),
        factory,
      ).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(RendererV4FailedError);
      expect(failure).toMatchObject({
        code: "renderer_v4_failed",
        attempts: 2,
        failures: [
          { attempt: 1, phase: "initialization", name: "Error" },
          { attempt: 2, phase: "render", name: "Error" },
        ],
      });
      expect(factoryCalls).toBe(2);
      expect(disposals).toBe(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("reports sanitized terminal failure diagnostics", async () => {
    const secret = "private-renderer-diagnostic";
    const secretError = (phase: string) => {
      const error = new Error(`${secret}-${phase}-message`);
      error.name = `${secret}-${phase}-name\n`;
      return error;
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let factoryCalls = 0;
    try {
      const failure = await renderV4WithSingleRetry(
        serializeRenderRequestV4(request()),
        () => {
          factoryCalls += 1;
          if (factoryCalls === 1) throw secretError("initialization");
          return {
            renderValidated() {
              return Promise.reject(secretError("render"));
            },
            dispose() {},
          };
        },
      ).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(RendererV4FailedError);
      expect(failure).toMatchObject({
        code: "renderer_v4_failed",
        attempts: 2,
        failures: [
          { attempt: 1, phase: "initialization", name: "UnknownError" },
          { attempt: 2, phase: "render", name: "UnknownError" },
        ],
      });
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(consoleError.mock.calls[0]?.[0]))).toEqual({
        level: "error",
        message: "CanvasKit V4 rendering failed",
        code: "renderer_v4_failed",
        rendererRevision: "canvaskit-v4-r1",
        diceCount: 2,
        attempts: 2,
        failures: [
          { attempt: 1, phase: "initialization", name: "UnknownError" },
          { attempt: 2, phase: "render", name: "UnknownError" },
        ],
      });
      expect(JSON.stringify(failure)).not.toContain(secret);
      expect(String(failure)).not.toContain(secret);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
    } finally {
      consoleError.mockRestore();
    }
  });
});
