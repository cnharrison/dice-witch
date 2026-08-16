import { createHash } from "node:crypto";
import {
  ENGRAVING_FINISHES_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_STRENGTHS_V4,
  PATTERN_IDS_V4,
  getAuthoredRenderViewV4,
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
    | "canvaskit-v4-r7"
    | "canvaskit-v4-r8"
    | "canvaskit-v4-r9",
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

function allTargetSpecialFormRequest(
  rendererRevision: "canvaskit-v4-r30" | "canvaskit-v4-r31" =
    "canvaskit-v4-r30",
): RenderRequestV4 {
  const targets = GRADIENT_SCOPE_TARGETS_V4;
  const group = (
    form: "crystal-cut" | "hollow-cage",
    specialAppearance: RenderAppearanceV4,
  ): RenderDieV4[] =>
    targets.map(([target, result]) => ({
      ...die(target, result),
      form,
      appearance: {
        ...specialAppearance,
        texture: { ...specialAppearance.texture, scope: "die-wide" },
      },
      view: getAuthoredRenderViewV4(rendererRevision, "legacy", {
        target,
        form,
        result,
      }),
    }));
  return {
    version: 4,
    rendererRevision,
    groups: [
      group("crystal-cut", crystalAppearance),
      group("hollow-cage", hollowAppearance),
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

function cropRgba(
  pixels: Uint8Array,
  sourceWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array {
  const cropped = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = (((y + row) * sourceWidth) + x) * 4;
    cropped.set(pixels.subarray(start, start + (width * 4)), row * width * 4);
  }
  return cropped;
}

function maximumChannelDifference(
  first: Uint8Array,
  second: Uint8Array,
): number {
  if (first.length !== second.length) {
    throw new Error("CanvasKit V4 test pixel lengths differ");
  }
  let maximum = 0;
  for (let index = 0; index < first.length; index += 1) {
    maximum = Math.max(
      maximum,
      Math.abs((first[index] as number) - (second[index] as number)),
    );
  }
  return maximum;
}

function brighterPixelCount(
  baseline: Uint8Array,
  candidate: Uint8Array,
): number {
  if (baseline.length !== candidate.length) {
    throw new Error("CanvasKit V4 test pixel lengths differ");
  }
  let count = 0;
  for (let offset = 0; offset < baseline.length; offset += 4) {
    const baselineTotal =
      (baseline[offset] as number) +
      (baseline[offset + 1] as number) +
      (baseline[offset + 2] as number);
    const candidateTotal =
      (candidate[offset] as number) +
      (candidate[offset + 1] as number) +
      (candidate[offset + 2] as number);
    if (candidateTotal - baselineTotal >= 180) count += 1;
  }
  return count;
}

function alphaChannels(pixels: Uint8Array): Uint8Array {
  const alpha = new Uint8Array(pixels.length / 4);
  for (let index = 3; index < pixels.length; index += 4) {
    alpha[(index - 3) / 4] = pixels[index] as number;
  }
  return alpha;
}

function partialAlphaPixelCount(
  pixels: Uint8Array,
  width: number,
  startY: number,
): number {
  let count = 0;
  for (let alpha = (startY * width * 4) + 3; alpha < pixels.length; alpha += 4) {
    const value = pixels[alpha] as number;
    if (value > 0 && value < 255) count += 1;
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

function alphaColumnRuns(
  pixels: Uint8Array,
  width: number,
): { left: number; right: number }[] {
  const height = pixels.length / (width * 4);
  const occupied = Array.from({ length: width }, (_, x) => {
    for (let y = 0; y < height; y += 1) {
      if (pixelAlpha(pixels, width, x, y) > 0) return true;
    }
    return false;
  });
  const runs: { left: number; right: number }[] = [];
  for (let x = 0; x < width; x += 1) {
    if (occupied[x] !== true) continue;
    const left = x;
    while (x + 1 < width && occupied[x + 1] === true) x += 1;
    runs.push({ left, right: x });
  }
  return runs;
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

function r32MaterialRequest(): RenderRequestV4 {
  const materials: readonly RenderAppearanceV4["material"][] = [
    {
      family: "elemental",
      style: "lava",
      fissureDensity: 62,
      glowIntensity: 84,
      textureScale: 112,
    },
    {
      family: "elemental",
      style: "sand",
      grainSize: 58,
      windDirection: 28,
      textureScale: 126,
    },
    {
      family: "elemental",
      style: "blue-sky",
      cloudCover: 48,
      horizonHeight: 54,
      textureScale: 118,
    },
    {
      family: "elemental",
      style: "sunset",
      cloudCover: 36,
      horizonHeight: 46,
      textureScale: 108,
    },
    {
      family: "paint",
      style: "splatter",
      dropDensity: 64,
      streakLength: 42,
      textureScale: 116,
    },
  ];
  const palettes = [
    ["#160806", "#5b120b", "#ff4a1c", "#ffd166"],
    ["#5a3d24", "#b7834a", "#e6c58f", "#fff0c2"],
    ["#1673bf", "#68b8ee", "#dff6ff", "#ffffff"],
    ["#25134a", "#8e2b75", "#f35d5f", "#ffb35c"],
    ["#f7f0df", "#111827", "#e11d48", "#2563eb", "#facc15"],
  ] as const;
  const fonts = [
    "source-sans-3",
    "cinzel",
    "zilla-slab",
    "fraunces",
    "alcarin-tengwar",
  ] as const;

  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r32",
    groups: [materials.map((material, index): RenderDieV4 => {
      const palette = palettes[index];
      const fontId = fonts[index];
      if (palette === undefined || fontId === undefined) {
        throw new Error("r32 material fixture is incomplete");
      }
      const target = index === materials.length - 1 ? "d20" : "d6";
      const result = target === "d20" ? 20 : index + 2;
      return {
        ...die(target, result),
        appearance: {
          ...appearance,
          material,
          palette: [...palette],
          texture: {
            generatorId:
              TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[material.family],
            seed: (0x3200_0000 + index * 0x0101_0101) >>> 0,
            scale: material.textureScale,
            rotation: index * 37,
            offsetU: index * 7_919,
            offsetV: index * 10_007,
            scope: "die-wide",
          },
          engraving: {
            ...appearance.engraving,
            fontId,
          },
        },
        view: getAuthoredRenderViewV4("canvaskit-v4-r32", "legacy", {
          target,
          result,
          form: "standard",
        }),
      };
    })],
  };
}

describe("CanvasKit Render Request V4", () => {
  let canvasKit: CanvasKitRuntimeV4;

  beforeAll(async () => {
    canvasKit = await loadCanvasKitV4();
  });

  it("renders stored white outlines only for supported standard dice", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const darkAppearance: RenderAppearanceV4 = {
      ...appearance,
      material: {
        family: "classic",
        treatment: "solid",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
      palette: ["#101418", "#101418"],
      texture: { ...appearance.texture, scope: "die-wide" },
      lighting: { mode: "none" },
      outlineColor: "#000000",
    };
    const subjects: RenderDieV4[] = [
      {
        ...die("d6", 6),
        appearance: darkAppearance,
        view: getAuthoredRenderViewV4("canvaskit-v4-r38", "legacy", {
          target: "d6",
          result: 6,
          form: "standard",
        }),
      },
      {
        ...die("other", 999),
        appearance: darkAppearance,
        view: getAuthoredRenderViewV4("canvaskit-v4-r38", "legacy", {
          target: "other",
          result: 999,
          form: "sphere",
        }),
      },
      {
        ...die("d20", 20),
        form: "hollow-cage",
        appearance: {
          ...hollowAppearance,
          texture: { ...hollowAppearance.texture, scope: "die-wide" },
          outlineColor: "#000000",
        },
        view: getAuthoredRenderViewV4("canvaskit-v4-r38", "legacy", {
          target: "d20",
          result: 20,
          form: "hollow-cage",
        }),
      },
    ];
    const render = async (value: RenderRequestV4) =>
      decodePngRgba8((await renderDiceRequestV4ToPng(
        value,
        createRenderer,
        { blankFaces: true },
      )).png);
    const historicalRequest = (subject: RenderDieV4): RenderRequestV4 => ({
      version: 4,
      rendererRevision: "canvaskit-v4-r38",
      groups: [[subject]],
    });

    const standard = subjects[0];
    if (standard === undefined) throw new Error("Standard outline die is missing");
    const historicalStandard = historicalRequest(standard);
    const blackStandard: RenderRequestV4 = {
      ...historicalStandard,
      rendererRevision: "canvaskit-v4-r39",
    };
    const whiteStandard: RenderRequestV4 = {
      ...blackStandard,
      groups: [[{
        ...standard,
        appearance: { ...standard.appearance, outlineColor: "#ffffff" },
      }]],
    };
    const silhouetteStandard: RenderRequestV4 = {
      ...whiteStandard,
      rendererRevision: "canvaskit-v4-r40",
    };
    const nearBlackStandard: RenderRequestV4 = {
      ...whiteStandard,
      rendererRevision: "canvaskit-v4-r41",
    };
    const historicalPixels = await render(historicalStandard);
    const blackPixels = await render(blackStandard);
    const whitePixels = await render(whiteStandard);

    expect(blackPixels).toEqual(historicalPixels);
    expect(alphaChannels(whitePixels.pixels)).toEqual(
      alphaChannels(blackPixels.pixels),
    );
    expect(
      brighterPixelCount(blackPixels.pixels, whitePixels.pixels),
    ).toBeGreaterThan(0);
    expect(await render(silhouetteStandard)).toEqual(whitePixels);
    expect(await render(nearBlackStandard)).toEqual(whitePixels);

    for (const subject of subjects.slice(1)) {
      const historical = historicalRequest(subject);
      for (const rendererRevision of [
        "canvaskit-v4-r39",
        "canvaskit-v4-r40",
        "canvaskit-v4-r41",
      ] as const) {
        expect(await render({ ...historical, rendererRevision })).toEqual(
          await render(historical),
        );
      }
    }
  });

  it("skips labels on exactly edge-on faces without failing the roll", async () => {
    const edgeOnRequest: RenderRequestV4 = {
      version: 4,
      rendererRevision: "canvaskit-v4-r34",
      groups: [[{
        ...die("d6", 5),
        appearance: {
          ...appearance,
          material: {
            family: "classic",
            treatment: "solid",
            opacity: "opaque",
            finish: "satin",
            textureScale: 100,
          },
          palette: ["#31e673", "#31e673"],
          texture: { ...appearance.texture, scope: "die-wide" },
          engraving: {
            ...appearance.engraving,
            fontId: "bricolage-grotesque",
            color: "#111111",
          },
        },
        view: {
          kind: "camera",
          elevationDegrees: 40,
          azimuthOffsetDegrees: -5,
          poseAzimuthDegrees: 180,
        },
      }]],
    };

    const rendered = await renderDiceRequestV4ToPng(
      edgeOnRequest,
      () => createRequestRenderer(canvasKit),
    );
    expect(rendered.png.length).toBeGreaterThan(1_000);
  });

  it("renders every r32 material and Alcarin as one deterministic field", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const request = r32MaterialRequest();
    const first = await renderDiceRequestV4ToPng(request, createRenderer);
    const second = await renderDiceRequestV4ToPng(request, createRenderer);

    expect(sha256(second.png)).toBe(sha256(first.png));
    expect(sha256(first.png)).toBe("269d4fb2e75041cdd79734d160363f136c855756eba89ddb0490935f51259706");
  });

  it("renders percentile ones labels without changing native d10 requests", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const native: RenderRequestV4 = {
      version: 4,
      rendererRevision: "canvaskit-v4-r1",
      groups: [[die("d10", 10)]],
    };
    const percentileOnesDie = die("d10", 10);
    if (percentileOnesDie.target !== "d10") {
      throw new Error("Percentile ones fixture is not a d10");
    }
    const percentileOnes: RenderRequestV4 = {
      ...native,
      groups: [[{ ...percentileOnesDie, faceLabelSet: "percentile-ones" }]],
    };

    const nativeRender = await renderDiceRequestV4ToPng(native, createRenderer);
    const percentileOnesRender = await renderDiceRequestV4ToPng(
      percentileOnes,
      createRenderer,
    );

    expect(percentileOnesRender.png).not.toEqual(nativeRender.png);
    expect(await renderDiceRequestV4ToPng(native, createRenderer)).toMatchObject({
      png: nativeRender.png,
      rendererRevision: "canvaskit-v4-r1",
    });
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

  it("adds r8 signal disks without changing icon-free r7 pixels", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const patternAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" },
      lighting: { mode: "none" },
    } satisfies RenderAppearanceV4;
    const iconFreeR7: RenderRequestV4[] = [
      {
        ...allTargetGradientScopeRequest("die-wide"),
        rendererRevision: "canvaskit-v4-r7",
      },
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r7",
        groups: [[
          ...GRADIENT_SCOPE_TARGETS_V4.map(([target, result]) => ({
            ...die(target, result),
            appearance: patternAppearance,
          })),
          { ...die("other", 999), appearance: patternAppearance },
        ]],
      },
      specialD20Request("sharp", sharpAppearance, "canvaskit-v4-r7"),
      specialD20Request("crystal-cut", crystalAppearance, "canvaskit-v4-r7"),
      specialD20Request("hollow-cage", hollowAppearance, "canvaskit-v4-r7"),
    ];
    for (const revision7 of iconFreeR7) {
      const revision8 = structuredClone(revision7);
      revision8.rendererRevision = "canvaskit-v4-r8";
      const [rendered7, rendered8] = await Promise.all([
        renderDiceRequestV4ToPng(revision7, createRenderer),
        renderDiceRequestV4ToPng(revision8, createRenderer),
      ]);
      expect(rendered8.png).toEqual(rendered7.png);
    }

    const iconAppearance: RenderAppearanceV4 = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" },
      engraving: { ...appearance.engraving, color: "#faf9f6" },
    };
    const criticalAppearance = (
      state: "critical-success" | "critical-failure",
    ): RenderAppearanceV4 => ({
      ...iconAppearance,
      effect: {
        state,
        treatment: "classic-glow",
        color: state === "critical-success" ? "#ffd447" : "#ff4967",
        intensity: 72,
      },
    });
    const iconDice = [
      {
        ...die("d20", 20),
        appearance: iconAppearance,
        icons: ["trashcan", "explosion", "recycle"],
      },
      {
        ...die("d20", 20),
        appearance: iconAppearance,
        icons: ["chevronUp", "chevronDown", "target-success"],
      },
      {
        ...die("d20", 20),
        appearance: criticalAppearance("critical-success"),
        icons: ["critical-success", "penetrate", "unique"],
      },
      {
        ...die("d20", 1),
        appearance: criticalAppearance("critical-failure"),
        icons: ["critical-failure"],
      },
    ] as RenderDieV4[];
    const iconRequest = (
      rendererRevision: "canvaskit-v4-r7" | "canvaskit-v4-r8",
    ) => ({
      version: 4 as const,
      rendererRevision,
      groups: [iconDice],
    });

    const [iconsR7, iconsR8, repeatedR8] = await Promise.all([
      renderDiceRequestV4ToPng(
        iconRequest("canvaskit-v4-r7"),
        createRenderer,
      ),
      renderDiceRequestV4ToPng(
        iconRequest("canvaskit-v4-r8"),
        createRenderer,
      ),
      renderDiceRequestV4ToPng(
        iconRequest("canvaskit-v4-r8"),
        createRenderer,
      ),
    ]);

    expect(iconsR8).toMatchObject({
      rendererRevision: "canvaskit-v4-r8",
      width: 600,
      height: 192,
      diceCount: 4,
      rowCount: 1,
    });
    expect(iconsR8.png).toEqual(repeatedR8.png);
    expect(iconsR8.png).not.toEqual(iconsR7.png);
    const decodedR8 = await decodePngRgba8(iconsR8.png);
    expect(
      partialAlphaPixelCount(decodedR8.pixels, decodedR8.width, 150),
    ).toBeGreaterThan(0);
    expect(sha256(iconsR8.png)).toBe(
      "7bcc307619b12a9bc58b1e01642d3b79e2a5c926405d04da5dc7a9b46ac95c1e",
    );
  });

  it("frames every single-die type without changing its artwork", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const requestFor = (
      target: RenderDieV4["target"],
      result: number,
      rendererRevision:
        | "canvaskit-v4-r8"
        | "canvaskit-v4-r9"
        | "canvaskit-v4-r10"
        | "canvaskit-v4-r11"
        | "canvaskit-v4-r12"
        | "canvaskit-v4-r13"
        | "canvaskit-v4-r14",
    ) => ({
      version: 4 as const,
      rendererRevision,
      groups: [[{ ...die(target, result), appearance: scopedAppearance }]],
    });

    for (const [target, result] of [
      ["d4", 4],
      ["d6", 6],
      ["d8", 8],
      ["d10", 10],
      ["d12", 12],
      ["d20", 20],
      ["percentile", 90],
      ["fudge", -1],
      ["other", 999],
    ] as const) {
      const [
        legacy,
        compact,
        groupedRows,
        wideGroupedRows,
        productionSpacingRows,
        wrappedRows,
        balancedRows,
      ] = await Promise.all([
        renderDiceRequestV4ToPng(
          requestFor(target, result, "canvaskit-v4-r8"),
          createRenderer,
        ),
        renderDiceRequestV4ToPng(
          requestFor(target, result, "canvaskit-v4-r9"),
          createRenderer,
        ),
        renderDiceRequestV4ToPng(
          requestFor(target, result, "canvaskit-v4-r10"),
          createRenderer,
        ),
        renderDiceRequestV4ToPng(
          requestFor(target, result, "canvaskit-v4-r11"),
          createRenderer,
        ),
        renderDiceRequestV4ToPng(
          requestFor(target, result, "canvaskit-v4-r12"),
          createRenderer,
        ),
        renderDiceRequestV4ToPng(
          requestFor(target, result, "canvaskit-v4-r13"),
          createRenderer,
        ),
        renderDiceRequestV4ToPng(
          requestFor(target, result, "canvaskit-v4-r14"),
          createRenderer,
        ),
      ]);
      expect(compact).toMatchObject({
        rendererRevision: "canvaskit-v4-r9",
        width: 300,
        height: 150,
        diceCount: 1,
        rowCount: 1,
      });
      expect(groupedRows).toMatchObject({
        rendererRevision: "canvaskit-v4-r10",
        width: 300,
        height: 150,
        diceCount: 1,
        rowCount: 1,
      });
      expect(wideGroupedRows).toMatchObject({
        rendererRevision: "canvaskit-v4-r11",
        width: 300,
        height: 150,
        diceCount: 1,
        rowCount: 1,
      });
      expect(productionSpacingRows).toMatchObject({
        rendererRevision: "canvaskit-v4-r12",
        width: 300,
        height: 150,
        diceCount: 1,
        rowCount: 1,
      });
      expect(wrappedRows).toMatchObject({
        rendererRevision: "canvaskit-v4-r13",
        width: 300,
        height: 150,
        diceCount: 1,
        rowCount: 1,
      });
      expect(balancedRows).toMatchObject({
        rendererRevision: "canvaskit-v4-r14",
        width: 300,
        height: 150,
        diceCount: 1,
        rowCount: 1,
      });
      expect(groupedRows.png).toEqual(compact.png);
      expect(wideGroupedRows.png).toEqual(compact.png);
      expect(productionSpacingRows.png).toEqual(compact.png);
      expect(wrappedRows.png).toEqual(compact.png);
      expect(balancedRows.png).toEqual(compact.png);
      const [legacyPixels, compactPixels] = await Promise.all([
        decodePngRgba8(legacy.png),
        decodePngRgba8(compact.png),
      ]);
      const compactDie = cropRgba(
        compactPixels.pixels,
        compact.width,
        75,
        0,
        150,
        150,
      );
      expect(alphaChannels(compactDie)).toEqual(
        alphaChannels(legacyPixels.pixels),
      );
      expect(maximumChannelDifference(compactDie, legacyPixels.pixels))
        .toBeLessThanOrEqual(1);
    }

    const modified = requestFor("d20", 20, "canvaskit-v4-r10");
    const modifiedDie = modified.groups[0]?.[0];
    if (modifiedDie === undefined) throw new Error("Modified test die is missing");
    modifiedDie.icons = ["trashcan"];
    await expect(
      renderDiceRequestV4ToPng(modified, createRenderer),
    ).resolves.toMatchObject({ width: 384, height: 192 });
  });

  it("packs three repeated 3-die groups into two centered r9 rows", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const groups = Array.from({ length: 3 }, (_, groupIndex) =>
      Array.from({ length: 3 }, (_, dieIndex) => ({
        ...die("d8", ((groupIndex * 3 + dieIndex) % 8) + 1),
        appearance: scopedAppearance,
      })),
    );

    const compact = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r9",
        groups,
      },
      createRenderer,
    );

    expect(compact).toMatchObject({
      rendererRevision: "canvaskit-v4-r9",
      width: 900,
      height: 300,
      diceCount: 9,
      rowCount: 2,
    });
    const decoded = await decodePngRgba8(compact.png);
    const lowerRow = cropRgba(
      decoded.pixels,
      compact.width,
      225,
      150,
      450,
      150,
    );
    expect(transparentPixelCount(lowerRow)).toBeLessThan(lowerRow.length / 4);
    for (const margin of [
      cropRgba(decoded.pixels, compact.width, 0, 150, 225, 150),
      cropRgba(decoded.pixels, compact.width, 675, 150, 225, 150),
    ]) {
      expect(transparentPixelCount(margin)).toBe(margin.length / 4);
    }
  });

  it("uses one compact r10 row per repetition with a visible die gap", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const pairGap = async (
      firstDie: RenderDieV4,
      secondDie: RenderDieV4,
    ): Promise<number> => {
      const rendered = await renderDiceRequestV4ToPng(
        {
          version: 4,
          rendererRevision: "canvaskit-v4-r10",
          groups: [[firstDie, secondDie]],
        },
        createRenderer,
      );
      expect(rendered.rowCount).toBe(1);
      const decoded = await decodePngRgba8(rendered.png);
      const runs = alphaColumnRuns(decoded.pixels, decoded.width);
      expect(runs).toHaveLength(2);
      const first = runs[0];
      const second = runs[1];
      if (first === undefined || second === undefined) {
        throw new Error("Expected two rendered dice");
      }
      return second.left - first.right - 1;
    };
    const targets = [
      ["d4", 4],
      ["d6", 6],
      ["d8", 8],
      ["d10", 10],
      ["d12", 12],
      ["d20", 20],
      ["percentile", 90],
      ["fudge", -1],
      ["other", 999],
    ] as const;

    for (const [target, result] of targets) {
      const alternateResult = target === "percentile" ? 0 : 1;
      const gap = await pairGap(
        { ...die(target, result), appearance: scopedAppearance },
        { ...die(target, alternateResult), appearance: scopedAppearance },
      );
      expect(gap, target).toBe(8);
    }

    const criticalAppearance: RenderAppearanceV4 = {
      ...scopedAppearance,
      effect: {
        state: "critical-success",
        treatment: "classic-glow",
        color: "#ffd447",
        intensity: 72,
      },
    };
    const criticalGap = await pairGap(
      {
        ...die("d20", 20),
        appearance: criticalAppearance,
        icons: ["critical-success"],
      },
      {
        ...die("d20", 1),
        appearance: criticalAppearance,
        icons: ["critical-success"],
      },
    );
    expect(criticalGap).toBeGreaterThanOrEqual(8);
    expect(criticalGap).toBeLessThanOrEqual(12);

    const separatedAppearance: RenderAppearanceV4 = {
      ...scopedAppearance,
      requiresLocalSeparation: true,
    };
    expect(
      await pairGap(
        { ...die("d8", 8), appearance: separatedAppearance },
        { ...die("d8", 1), appearance: separatedAppearance },
      ),
    ).toBe(8);

    const modifierGap = await pairGap(
      {
        ...die("d8", 8),
        appearance: scopedAppearance,
        icons: ["trashcan", "explosion", "recycle"],
      },
      {
        ...die("d8", 1),
        appearance: scopedAppearance,
        icons: ["blank", "penetrate", "unique"],
      },
    );
    expect(modifierGap).toBeGreaterThanOrEqual(8);
    expect(modifierGap).toBeLessThanOrEqual(10);

    const mixed = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r10",
        groups: [targets.map(([target, result]) => ({
          ...die(target, result),
          appearance: scopedAppearance,
        }))],
      },
      createRenderer,
    );
    const mixedPixels = await decodePngRgba8(mixed.png);
    const mixedRuns = alphaColumnRuns(mixedPixels.pixels, mixedPixels.width);
    expect(mixedRuns).toHaveLength(targets.length);
    for (let index = 1; index < mixedRuns.length; index += 1) {
      const previous = mixedRuns[index - 1];
      const current = mixedRuns[index];
      if (previous === undefined || current === undefined) {
        throw new Error("Expected adjacent rendered dice");
      }
      expect(current.left - previous.right - 1).toBe(8);
    }
    const mixedFirst = mixedRuns[0];
    const mixedLast = mixedRuns.at(-1);
    if (mixedFirst === undefined || mixedLast === undefined) {
      throw new Error("Expected mixed rendered dice");
    }
    expect(
      Math.abs(mixedFirst.left - (mixed.width - mixedLast.right - 1)),
    ).toBeLessThanOrEqual(1);

    const groups = Array.from({ length: 3 }, (_, groupIndex) =>
      Array.from({ length: 3 }, (_, dieIndex) => ({
        ...die("d8", ((groupIndex * 3 + dieIndex) % 8) + 1),
        appearance: scopedAppearance,
      })),
    );
    const firstGroup = groups[0];
    if (firstGroup === undefined) throw new Error("Expected a repetition group");
    const singleRepetition = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r10",
        groups: [firstGroup],
      },
      createRenderer,
    );
    expect(singleRepetition).toMatchObject({
      width: 346,
      height: 150,
      diceCount: 3,
      rowCount: 1,
    });

    const repeated = await renderDiceRequestV4ToPng(
      { version: 4, rendererRevision: "canvaskit-v4-r10", groups },
      createRenderer,
    );
    expect(repeated).toMatchObject({
      width: 346,
      height: 450,
      diceCount: 9,
      rowCount: 3,
    });
    const repeatedPixels = await decodePngRgba8(repeated.png);
    for (let row = 0; row < 3; row += 1) {
      const rowPixels = cropRgba(
        repeatedPixels.pixels,
        repeated.width,
        0,
        row * 150,
        repeated.width,
        150,
      );
      const runs = alphaColumnRuns(rowPixels, repeated.width);
      expect(runs).toHaveLength(3);
      for (let index = 1; index < runs.length; index += 1) {
        const previous = runs[index - 1];
        const current = runs[index];
        if (previous === undefined || current === undefined) {
          throw new Error("Expected adjacent repeated dice");
        }
        expect(current.left - previous.right - 1).toBe(8);
      }
      const first = runs[0];
      const last = runs.at(-1);
      if (first === undefined || last === undefined) {
        throw new Error("Expected repeated dice");
      }
      expect(
        Math.abs(first.left - (repeated.width - last.right - 1)),
      ).toBeLessThanOrEqual(1);
    }

    const maximumSingleRepetition = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r10",
        groups: [Array.from({ length: 50 }, (_, index) => ({
          ...die("d6", (index % 6) + 1),
          appearance: scopedAppearance,
        }))],
      },
      createRenderer,
    );
    expect(maximumSingleRepetition).toMatchObject({
      width: 5_736,
      height: 150,
      diceCount: 50,
      rowCount: 1,
    });

    const maximumWideGapRepetition = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r11",
        groups: [Array.from({ length: 50 }, (_, index) => ({
          ...die("d6", (index % 6) + 1),
          appearance: scopedAppearance,
        }))],
      },
      createRenderer,
    );
    expect(maximumWideGapRepetition).toMatchObject({
      width: 8_284,
      height: 150,
      diceCount: 50,
      rowCount: 1,
    });
    expect(maximumWideGapRepetition.png.byteLength).toBeLessThan(10_000_000);

    const maximumProductionSpacingRepetition = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r12",
        groups: [Array.from({ length: 50 }, (_, index) => ({
          ...die("d6", (index % 6) + 1),
          appearance: scopedAppearance,
        }))],
      },
      createRenderer,
    );
    expect(maximumProductionSpacingRepetition).toMatchObject({
      width: 7_500,
      height: 150,
      diceCount: 50,
      rowCount: 1,
    });
    expect(maximumProductionSpacingRepetition.png.byteLength)
      .toBeLessThan(10_000_000);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBeLessThanOrEqual(67_108_864);
  });

  it("uses a 60px visual gap in r11 while preserving compact single-die framing", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const single = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r11",
        groups: [[{ ...die("d8", 8), appearance: scopedAppearance }]],
      },
      createRenderer,
    );
    expect(single).toMatchObject({
      width: 300,
      height: 150,
      diceCount: 1,
      rowCount: 1,
    });

    const groups = Array.from({ length: 3 }, (_, groupIndex) =>
      Array.from({ length: 3 }, (_, dieIndex) => ({
        ...die("d8", ((groupIndex * 3 + dieIndex) % 8) + 1),
        appearance: scopedAppearance,
      })),
    );
    const repeated = await renderDiceRequestV4ToPng(
      { version: 4, rendererRevision: "canvaskit-v4-r11", groups },
      createRenderer,
    );
    expect(repeated).toMatchObject({
      width: 450,
      height: 450,
      diceCount: 9,
      rowCount: 3,
    });
    const repeatedPixels = await decodePngRgba8(repeated.png);
    for (let row = 0; row < 3; row += 1) {
      const rowPixels = cropRgba(
        repeatedPixels.pixels,
        repeated.width,
        0,
        row * 150,
        repeated.width,
        150,
      );
      const runs = alphaColumnRuns(rowPixels, repeated.width);
      expect(runs).toHaveLength(3);
      for (let index = 1; index < runs.length; index += 1) {
        const previous = runs[index - 1];
        const current = runs[index];
        if (previous === undefined || current === undefined) {
          throw new Error("Expected adjacent repeated dice");
        }
        expect(current.left - previous.right - 1).toBe(60);
      }
    }

    const mixed = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r11",
        groups: [[
          { ...die("d4", 4), appearance: scopedAppearance },
          { ...die("d8", 8), appearance: scopedAppearance },
        ]],
      },
      createRenderer,
    );
    const mixedPixels = await decodePngRgba8(mixed.png);
    const mixedRuns = alphaColumnRuns(mixedPixels.pixels, mixed.width);
    expect(mixedRuns).toHaveLength(2);
    const first = mixedRuns[0];
    const second = mixedRuns[1];
    if (first === undefined || second === undefined) {
      throw new Error("Expected mixed rendered dice");
    }
    expect(second.left - first.right - 1).toBe(60);
  });

  it("matches production center spacing across grouped polyhedral dice in r12", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const targets = [
      ["d4", 4],
      ["d6", 6],
      ["d8", 8],
      ["d10", 10],
      ["d12", 12],
      ["d20", 20],
    ] as const;

    for (const [target, result] of targets) {
      const groups = [[
        { ...die(target, result), appearance: scopedAppearance },
        { ...die(target, 1), appearance: scopedAppearance },
      ]];
      const [production, current] = await Promise.all([
        renderDiceRequestV4ToPng(
          { version: 4, rendererRevision: "canvaskit-v4-r8", groups },
          createRenderer,
        ),
        renderDiceRequestV4ToPng(
          { version: 4, rendererRevision: "canvaskit-v4-r12", groups },
          createRenderer,
        ),
      ]);
      const [productionPixels, currentPixels] = await Promise.all([
        decodePngRgba8(production.png),
        decodePngRgba8(current.png),
      ]);
      const productionRuns = alphaColumnRuns(
        productionPixels.pixels,
        production.width,
      );
      const currentRuns = alphaColumnRuns(currentPixels.pixels, current.width);
      expect(productionRuns, target).toHaveLength(2);
      expect(currentRuns, target).toHaveLength(2);
      const productionFirst = productionRuns[0];
      const productionSecond = productionRuns[1];
      const currentFirst = currentRuns[0];
      const currentSecond = currentRuns[1];
      if (
        productionFirst === undefined ||
        productionSecond === undefined ||
        currentFirst === undefined ||
        currentSecond === undefined
      ) {
        throw new Error("Expected adjacent production-spaced dice");
      }
      expect(
        currentSecond.left - currentFirst.right - 1,
        target,
      ).toBe(productionSecond.left - productionFirst.right - 1);
    }

    const modifierGroups = [[
      {
        ...die("d8", 8),
        appearance: scopedAppearance,
        icons: ["trashcan" as const],
      },
      {
        ...die("d8", 1),
        appearance: scopedAppearance,
        icons: ["trashcan" as const],
      },
    ]];
    const [productionModifiers, currentModifiers] = await Promise.all([
      renderDiceRequestV4ToPng(
        {
          version: 4,
          rendererRevision: "canvaskit-v4-r8",
          groups: modifierGroups,
        },
        createRenderer,
      ),
      renderDiceRequestV4ToPng(
        {
          version: 4,
          rendererRevision: "canvaskit-v4-r12",
          groups: modifierGroups,
        },
        createRenderer,
      ),
    ]);
    const [productionModifierPixels, currentModifierPixels] = await Promise.all([
      decodePngRgba8(productionModifiers.png),
      decodePngRgba8(currentModifiers.png),
    ]);
    for (const [top, height] of [[0, 150], [150, 42]] as const) {
      const productionRuns = alphaColumnRuns(
        cropRgba(
          productionModifierPixels.pixels,
          productionModifiers.width,
          0,
          top,
          productionModifiers.width,
          height,
        ),
        productionModifiers.width,
      );
      const currentRuns = alphaColumnRuns(
        cropRgba(
          currentModifierPixels.pixels,
          currentModifiers.width,
          0,
          top,
          currentModifiers.width,
          height,
        ),
        currentModifiers.width,
      );
      expect(productionRuns).toHaveLength(2);
      expect(currentRuns).toHaveLength(2);
      const productionFirst = productionRuns[0];
      const productionSecond = productionRuns[1];
      const currentFirst = currentRuns[0];
      const currentSecond = currentRuns[1];
      if (
        productionFirst === undefined ||
        productionSecond === undefined ||
        currentFirst === undefined ||
        currentSecond === undefined
      ) {
        throw new Error("Expected adjacent production-spaced modifiers");
      }
      expect(currentSecond.left - currentFirst.right - 1).toBe(
        productionSecond.left - productionFirst.right - 1,
      );
    }

    const repeated = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r12",
        groups: Array.from({ length: 3 }, () =>
          Array.from({ length: 3 }, (_, index) => ({
            ...die("d8", index + 1),
            appearance: scopedAppearance,
          })),
        ),
      },
      createRenderer,
    );
    expect(repeated).toMatchObject({
      width: 450,
      height: 450,
      diceCount: 9,
      rowCount: 3,
    });
  });

  it("wraps and centers each r13 repetition after ten dice", async () => {
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const rendered = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r13",
        groups: [
          Array.from({ length: 11 }, (_, index) => ({
            ...die("d8", (index % 8) + 1),
            appearance: scopedAppearance,
          })),
          Array.from({ length: 3 }, (_, index) => ({
            ...die("d8", index + 1),
            appearance: scopedAppearance,
          })),
        ],
      },
      () => createRequestRenderer(canvasKit),
    );

    expect(rendered).toMatchObject({
      width: 1_500,
      height: 450,
      diceCount: 14,
      rowCount: 3,
    });
    const decoded = await decodePngRgba8(rendered.png);
    for (const [rowIndex, expectedDice] of [
      [0, 10],
      [1, 1],
      [2, 3],
    ] as const) {
      const runs = alphaColumnRuns(
        cropRgba(
          decoded.pixels,
          rendered.width,
          0,
          rowIndex * 150,
          rendered.width,
          150,
        ),
        rendered.width,
      );
      expect(runs).toHaveLength(expectedDice);
      const first = runs[0];
      const last = runs.at(-1);
      if (first === undefined || last === undefined) {
        throw new Error("Expected centered r13 dice row");
      }
      expect(Math.abs(first.left - (rendered.width - last.right - 1)))
        .toBeLessThanOrEqual(1);
    }
  });

  it("balances fifteen r14 dice across centered rows", async () => {
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const rendered = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r14",
        groups: [Array.from({ length: 15 }, (_, index) => ({
          ...die("d20", (index % 20) + 1),
          appearance: scopedAppearance,
        }))],
      },
      () => createRequestRenderer(canvasKit),
    );

    expect(rendered).toMatchObject({
      width: 1_200,
      height: 300,
      diceCount: 15,
      rowCount: 2,
    });
    const decoded = await decodePngRgba8(rendered.png);
    for (const [rowIndex, expectedDice] of [[0, 8], [1, 7]] as const) {
      const runs = alphaColumnRuns(
        cropRgba(
          decoded.pixels,
          rendered.width,
          0,
          rowIndex * 150,
          rendered.width,
          150,
        ),
        rendered.width,
      );
      expect(runs).toHaveLength(expectedDice);
      const first = runs[0];
      const last = runs.at(-1);
      if (first === undefined || last === undefined) {
        throw new Error("Expected centered r14 dice row");
      }
      expect(Math.abs(first.left - (rendered.width - last.right - 1)))
        .toBeLessThanOrEqual(1);
    }
  });

  it("wraps the maximum r13 and r14 repetitions into five rows", async () => {
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const groups = [Array.from({ length: 50 }, (_, index) => ({
      ...die("d6", (index % 6) + 1),
      appearance: scopedAppearance,
    }))];

    for (const rendererRevision of [
      "canvaskit-v4-r13",
      "canvaskit-v4-r14",
    ] as const) {
      const rendered = await renderDiceRequestV4ToPng(
        { version: 4, rendererRevision, groups },
        () => createRequestRenderer(canvasKit),
      );
      expect(rendered).toMatchObject({
        width: 1_500,
        height: 750,
        diceCount: 50,
        rowCount: 5,
      });
      expect(rendered.png.byteLength).toBeLessThan(10_000_000);
    }
  });

  it("keeps every percentile pair together in r38", async () => {
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const percentile = {
      ...die("percentile", 90),
      appearance: scopedAppearance,
      view: getAuthoredRenderViewV4("canvaskit-v4-r38", "legacy", {
        target: "percentile",
        result: 90,
        form: "standard",
      }),
    };
    const ones = {
      ...die("d10", 9),
      faceLabelSet: "percentile-ones" as const,
      appearance: scopedAppearance,
      view: getAuthoredRenderViewV4("canvaskit-v4-r38", "legacy", {
        target: "d10",
        result: 9,
        form: "standard",
      }),
    };
    const groups = [[...Array.from({ length: 7 }, () => [
      structuredClone(percentile),
      structuredClone(ones),
    ]).flat()]];
    const rendered = await renderDiceRequestV4ToPng(
      { version: 4, rendererRevision: "canvaskit-v4-r38", groups },
      () => createRequestRenderer(canvasKit),
    );
    const decoded = await decodePngRgba8(rendered.png);
    const rowRunCounts: number[] = [];

    for (let rowIndex = 0; rowIndex < rendered.rowCount; rowIndex += 1) {
      const row = cropRgba(
        decoded.pixels,
        rendered.width,
        0,
        rowIndex * 150,
        rendered.width,
        150,
      );
      const runs = alphaColumnRuns(row, rendered.width);
      rowRunCounts.push(runs.length);
      expect(runs.length % 2).toBe(0);
    }

    expect(rendered).toMatchObject({ width: 1_200, height: 300, rowCount: 2 });
    expect(rowRunCounts.sort((left, right) => left - right)).toEqual([6, 8]);
  });

  it("uses the group-aware r38 layout at the 50-die repeated-pair limit", async () => {
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const view = getAuthoredRenderViewV4("canvaskit-v4-r38", "legacy", {
      target: "d6",
      result: 6,
      form: "standard",
    });
    const groups = Array.from({ length: 25 }, () => [
      { ...die("d6", 6), appearance: scopedAppearance, view },
      { ...die("d6", 6), appearance: scopedAppearance, view },
    ]);
    const createRenderer = () => createRequestRenderer(canvasKit);
    const stacked = await renderDiceRequestV4ToPng(
      { version: 4, rendererRevision: "canvaskit-v4-r37", groups },
      createRenderer,
    );
    const compact = await renderDiceRequestV4ToPng(
      { version: 4, rendererRevision: "canvaskit-v4-r38", groups },
      createRenderer,
    );
    const repeated = await renderDiceRequestV4ToPng(
      { version: 4, rendererRevision: "canvaskit-v4-r38", groups },
      createRenderer,
    );

    expect(stacked).toMatchObject({
      width: 300,
      height: 3_750,
      diceCount: 50,
      rowCount: 25,
    });
    expect(compact).toMatchObject({
      width: 1_050,
      height: 1_590,
      diceCount: 50,
      rowCount: 9,
    });
    expect(repeated.png).toEqual(compact.png);

    const decoded = await decodePngRgba8(compact.png);
    const firstRow = cropRgba(
      decoded.pixels,
      compact.width,
      0,
      0,
      compact.width,
      150,
    );
    const runs = alphaColumnRuns(firstRow, compact.width);
    expect(runs).toHaveLength(6);
    for (let index = 1; index < runs.length; index += 1) {
      const previous = runs[index - 1];
      const current = runs[index];
      if (previous === undefined || current === undefined) {
        throw new Error("Expected complete r38 repeated-pair row");
      }
      expect(current.left - previous.left).toBe(
        index % 2 === 0 ? 225 : 150,
      );
    }
    const firstGap = cropRgba(
      decoded.pixels,
      compact.width,
      0,
      150,
      compact.width,
      30,
    );
    expect(transparentPixelCount(firstGap)).toBe(firstGap.length / 4);
    const lastRow = cropRgba(
      decoded.pixels,
      compact.width,
      0,
      1_440,
      compact.width,
      150,
    );
    const lastRuns = alphaColumnRuns(lastRow, compact.width);
    expect(lastRuns).toHaveLength(2);
    const first = lastRuns[0];
    const last = lastRuns[1];
    if (first === undefined || last === undefined) {
      throw new Error("Expected centered final r38 pair");
    }
    expect(Math.abs(first.left - (compact.width - last.right - 1)))
      .toBeLessThanOrEqual(1);
  });

  it("wraps wide r38 groups only when the projected dice become larger", async () => {
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const view = getAuthoredRenderViewV4("canvaskit-v4-r38", "legacy", {
      target: "d6",
      result: 6,
      form: "standard",
    });
    const requestGroups = Array.from({ length: 5 }, () =>
      Array.from({ length: 10 }, () => ({
        ...die("d6", 6),
        appearance: scopedAppearance,
        view,
      })),
    );
    const rendered = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r38",
        groups: requestGroups,
      },
      () => createRequestRenderer(canvasKit),
    );

    expect(rendered).toMatchObject({
      width: 750,
      height: 1_620,
      diceCount: 50,
      rowCount: 10,
    });
  });

  it("does not share percentile icons across r38 group boundaries", async () => {
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const percentile = {
      ...die("percentile", 90),
      appearance: scopedAppearance,
      icons: ["trashcan" as const],
      view: getAuthoredRenderViewV4("canvaskit-v4-r38", "legacy", {
        target: "percentile",
        result: 90,
        form: "standard",
      }),
    };
    const ones = {
      ...die("d10", 9),
      faceLabelSet: "percentile-ones" as const,
      appearance: scopedAppearance,
      icons: ["trashcan" as const],
      view: getAuthoredRenderViewV4("canvaskit-v4-r38", "legacy", {
        target: "d10",
        result: 9,
        form: "standard",
      }),
    };
    const rendered = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r38",
        groups: Array.from({ length: 14 }, (_, index) => [
          structuredClone(index % 2 === 0 ? percentile : ones),
        ]),
      },
      () => createRequestRenderer(canvasKit),
    );
    const decoded = await decodePngRgba8(rendered.png);
    const firstIconRow = cropRgba(
      decoded.pixels,
      rendered.width,
      0,
      150,
      rendered.width,
      42,
    );

    expect(rendered).toMatchObject({
      width: 600,
      height: 1_080,
      diceCount: 14,
      rowCount: 5,
    });
    expect(alphaColumnRuns(firstIconRow, rendered.width)).toHaveLength(3);
  });

  it("preserves the compact r9 maximum repeated modifier layout", async () => {
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const compact = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r9",
        groups: Array.from({ length: 50 }, (_, index) => [
          {
            ...die("d6", (index % 6) + 1),
            appearance: scopedAppearance,
            icons: ["trashcan"],
          },
        ]),
      },
      () => createRequestRenderer(canvasKit),
    );

    expect(compact).toMatchObject({
      width: 1_500,
      height: 960,
      diceCount: 50,
      rowCount: 5,
    });
    expect(compact.png.byteLength).toBeLessThan(10_000_000);
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

  it("uses an engraving edge instead of a face-wide separation wash in r27", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const requestFor = (requiresLocalSeparation: boolean): RenderRequestV4 => ({
      version: 4,
      rendererRevision: "canvaskit-v4-r27",
      groups: [[{
        target: "d20",
        result: 20,
        form: "standard",
        appearance: {
          ...appearance,
          material: {
            family: "classic",
            treatment: "solid",
            opacity: "opaque",
            finish: "satin",
            textureScale: 100,
          },
          palette: ["#080018", "#10234a"],
          texture: { ...appearance.texture, scope: "face-local" },
          requiresLocalSeparation,
        },
        icons: [],
        view: getAuthoredRenderViewV4(
          "canvaskit-v4-r27",
          "legacy",
          { target: "d20", form: "standard", result: 20 },
        ),
      }]],
    });
    const separated = requestFor(true);
    const unseparated = requestFor(false);
    const [separatedBlank, unseparatedBlank, separatedLabels, plainLabels] =
      await Promise.all([
        renderDiceRequestV4ToPng(separated, createRenderer, {
          blankFaces: true,
        }),
        renderDiceRequestV4ToPng(unseparated, createRenderer, {
          blankFaces: true,
        }),
        renderDiceRequestV4ToPng(separated, createRenderer),
        renderDiceRequestV4ToPng(unseparated, createRenderer),
      ]);

    expect(separatedBlank.png).toEqual(unseparatedBlank.png);
    expect(separatedLabels.png).not.toEqual(plainLabels.png);
  });

  it("strengthens only the local engraving edge in r31", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const requestFor = (
      rendererRevision: "canvaskit-v4-r30" | "canvaskit-v4-r31",
    ): RenderRequestV4 => ({
      version: 4,
      rendererRevision,
      groups: [[{
        target: "d20",
        result: 15,
        form: "standard",
        appearance: {
          ...appearance,
          material: {
            family: "classic",
            treatment: "pattern",
            patternId: "stripes",
            opacity: "opaque",
            finish: "satin",
            textureScale: 100,
          },
          palette: ["#f01828", "#20c55a"],
          texture: {
            ...appearance.texture,
            rotation: 315,
            scope: "die-wide",
          },
          engraving: {
            ...appearance.engraving,
            finish: "metallic",
            color: "#111111",
          },
          requiresLocalSeparation: true,
        },
        icons: [],
        view: getAuthoredRenderViewV4(rendererRevision, "legacy", {
          target: "d20",
          form: "standard",
          result: 15,
        }),
      }]],
    });
    const r30 = requestFor("canvaskit-v4-r30");
    const r31 = requestFor("canvaskit-v4-r31");
    const r30Blank = await renderDiceRequestV4ToPng(r30, createRenderer, {
      blankFaces: true,
    });
    const r31Blank = await renderDiceRequestV4ToPng(r31, createRenderer, {
      blankFaces: true,
    });
    const r30Labels = await renderDiceRequestV4ToPng(r30, createRenderer);
    const r31Labels = await renderDiceRequestV4ToPng(r31, createRenderer);

    expect(r31Blank.png).toEqual(r30Blank.png);
    expect(r31Labels.png).not.toEqual(r30Labels.png);
  });

  it("renders r29 die-wide classic solids on every polyhedral target", async () => {
    const solidAppearance: RenderAppearanceV4 = {
      ...appearance,
      material: {
        family: "classic",
        treatment: "solid",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
      texture: { ...appearance.texture, scope: "bounded-die-wide" },
    };
    const subjects = [
      { target: "d4" as const, result: 4 },
      { target: "d6" as const, result: 6 },
      { target: "d8" as const, result: 8 },
      { target: "d10" as const, result: 9 },
      { target: "d12" as const, result: 12 },
      { target: "d20" as const, result: 20 },
      { target: "percentile" as const, result: 90 },
      { target: "fudge" as const, result: 1 },
    ];
    const request: RenderRequestV4 = {
      version: 4,
      rendererRevision: "canvaskit-v4-r29",
      groups: subjects.map(({ target, result }) => [{
        target,
        result,
        form: "standard",
        appearance: solidAppearance,
        icons: [],
        view: getAuthoredRenderViewV4(
          "canvaskit-v4-r29",
          "legacy",
          { target, result, form: "standard" },
        ),
      }]),
    };
    const rendered = await renderDiceRequestV4ToPng(
      request,
      () => createRequestRenderer(canvasKit),
    );
    const decoded = await decodePngRgba8(rendered.png);
    const rowHeight = decoded.height / rendered.rowCount;

    expect(rendered.rowCount).toBe(subjects.length);
    expect(createHash("sha256").update(rendered.png).digest("hex")).toBe(
      "794580d3452059f4a7ec5426f86f82daab70497fe6435d172352bf9a7e38942f",
    );
    for (let row = 0; row < rendered.rowCount; row += 1) {
      let opaquePixels = 0;
      const firstY = Math.floor(row * rowHeight);
      const lastY = Math.floor((row + 1) * rowHeight);
      for (let y = firstY; y < lastY; y += 1) {
        for (let x = 0; x < decoded.width; x += 1) {
          if (decoded.pixels[(y * decoded.width + x) * 4 + 3] !== 0) {
            opaquePixels += 1;
          }
        }
      }
      expect(opaquePixels).toBeGreaterThan(100);
    }
  });

  it("preserves all-target special-form geometry in r31", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const r30 = await renderDiceRequestV4ToPng(
      allTargetSpecialFormRequest(),
      createRenderer,
      { blankFaces: true },
    );
    const r31 = await renderDiceRequestV4ToPng(
      allTargetSpecialFormRequest("canvaskit-v4-r31"),
      createRenderer,
      { blankFaces: true },
    );

    expect(r31.png).toEqual(r30.png);
    expect(r31.diceCount).toBe(16);
    expect(r31.rowCount).toBe(2);
    expect(r31.visibleFaceCount).toBeGreaterThan(16);
    const decoded = await decodePngRgba8(r31.png);
    expect(transparentPixelCount(decoded.pixels)).toBeGreaterThan(1_000);
  });

  it("preserves custom die-wide classic solid bytes in r29", async () => {
    const requestFor = (
      rendererRevision: "canvaskit-v4-r28" | "canvaskit-v4-r29",
    ): RenderRequestV4 => ({
      version: 4,
      rendererRevision,
      groups: [[{
        target: "d8",
        result: 8,
        form: "standard",
        appearance: {
          ...appearance,
          material: {
            family: "classic",
            treatment: "solid",
            opacity: "opaque",
            finish: "satin",
            textureScale: 100,
          },
          texture: { ...appearance.texture, scope: "die-wide" },
        },
        icons: [],
        view: {
          kind: "camera",
          elevationDegrees: 40,
          azimuthOffsetDegrees: 0,
          poseAzimuthDegrees: 72,
        },
      }]],
    });
    const [r28, r29] = await Promise.all(
      (["canvaskit-v4-r28", "canvaskit-v4-r29"] as const).map(
        async (rendererRevision) =>
          (await renderDiceRequestV4ToPng(
            requestFor(rendererRevision),
            () => createRequestRenderer(canvasKit),
          )).png,
      ),
    );

    expect(r29).toEqual(r28);
  });

  it("moves only the visible d6 five left without rewriting r28", async () => {
    const requestFor = (
      rendererRevision: "canvaskit-v4-r28" | "canvaskit-v4-r29",
      poseAzimuthDegrees = 108,
    ): RenderRequestV4 => ({
      version: 4,
      rendererRevision,
      groups: [[{
        target: "d6",
        result: 3,
        form: "standard",
        appearance: {
          ...appearance,
          texture: { ...appearance.texture, scope: "die-wide" },
        },
        icons: [],
        view: {
          kind: "camera",
          elevationDegrees: 40,
          azimuthOffsetDegrees: 0,
          poseAzimuthDegrees,
        },
      }]],
    });
    const revisions = ["canvaskit-v4-r28", "canvaskit-v4-r29"] as const;
    const [r28, r29] = await Promise.all(
      revisions.map(async (rendererRevision) =>
        createHash("sha256")
          .update(
            (await renderDiceRequestV4ToPng(
              requestFor(rendererRevision),
              () => createRequestRenderer(canvasKit),
            )).png,
          )
          .digest("hex"),
      ),
    );
    const [r28WithoutFive, r29WithoutFive] = await Promise.all(
      revisions.map(async (rendererRevision) =>
        (await renderDiceRequestV4ToPng(
          requestFor(rendererRevision, 0),
          () => createRequestRenderer(canvasKit),
        )).png,
      ),
    );

    expect({ r28, r29 }).toEqual({
      r28: "b71a2afdecd6508b4fd7674968c547bd392ab14657f63b3a337e7304859f78d2",
      r29: "b4d885f7ac6dd406e370af07c749df096345be7426fa6ad9e286d61ccc13fc64",
    });
    expect(r29WithoutFive).toEqual(r28WithoutFive);
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

  it("adds reliable d10 critical halos and one shared percentile icon in r26", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const view = {
      kind: "camera" as const,
      elevationDegrees: 40,
      azimuthOffsetDegrees: 45,
      poseAzimuthDegrees: 0,
    };
    const spectralAppearance: RenderAppearanceV4 = {
      ...crystalAppearance,
      texture: { ...crystalAppearance.texture, scope: "die-wide" },
      effect: {
        state: "critical-success",
        treatment: "spectral-rim",
        color: "#ffd447",
        intensity: 72,
      },
    };
    const d10 = {
      ...die("d10", 9),
      appearance: spectralAppearance,
      icons: ["critical-success" as const],
      view,
    };
    const renderSingle = (rendererRevision: "canvaskit-v4-r25" | "canvaskit-v4-r26") =>
      renderDiceRequestV4ToPng(
        { version: 4, rendererRevision, groups: [[d10]] },
        createRenderer,
      );
    const [singleR25, singleR26] = await Promise.all([
      renderSingle("canvaskit-v4-r25"),
      renderSingle("canvaskit-v4-r26"),
    ]);

    const classicCriticalAppearance: RenderAppearanceV4 = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" },
      effect: {
        state: "critical-success",
        treatment: "classic-glow",
        color: "#ffd447",
        intensity: 72,
      },
    };
    const percentile = {
      ...die("percentile", 90),
      appearance: classicCriticalAppearance,
      icons: ["critical-success" as const],
      view,
    };
    const ones = {
      ...die("d10", 9),
      faceLabelSet: "percentile-ones" as const,
      appearance: classicCriticalAppearance,
      icons: ["critical-success" as const],
      view,
    };
    const renderPair = (rendererRevision: "canvaskit-v4-r25" | "canvaskit-v4-r26") =>
      renderDiceRequestV4ToPng(
        { version: 4, rendererRevision, groups: [[percentile, ones]] },
        createRenderer,
      );
    const [pairR25, pairR26] = await Promise.all([
      renderPair("canvaskit-v4-r25"),
      renderPair("canvaskit-v4-r26"),
    ]);
    const filler = {
      ...die("d6", 6),
      appearance: {
        ...appearance,
        texture: { ...appearance.texture, scope: "die-wide" as const },
      },
      view,
    };
    const multiRowPair = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r26",
        groups: [[
          ...Array.from({ length: 5 }, () => structuredClone(filler)),
          percentile,
          ones,
          ...Array.from({ length: 4 }, () => structuredClone(filler)),
        ]],
      },
      createRenderer,
    );

    expect(singleR26.png).not.toEqual(singleR25.png);
    expect(pairR26.png).not.toEqual(pairR25.png);
    expect(multiRowPair.rowCount).toBe(2);
    expect({
      singleR25: sha256(singleR25.png),
      singleR26: sha256(singleR26.png),
      pairR25: sha256(pairR25.png),
      pairR26: sha256(pairR26.png),
      multiRowPair: sha256(multiRowPair.png),
    }).toEqual({
      singleR25: "1b688722af46b09fd2b29806889a856b627064ac0977b76c0e543bc64aeccefe",
      singleR26: "3602a4d7eb4f9594c42301bd4c58f50b12c7fa1b7405837768f84f998d12f4e0",
      pairR25: "d15447b28d4fb32e09ff3b4646a6c7f7759a54df83a0d8a49c06777bf2480c81",
      pairR26: "7325c1cf413aa8664b86a868d3ed036ab3bb2611ce8f4eb3e16c54ee586fa24c",
      multiRowPair: "b577a016270ff00ba49284226e741cc621bb5b6f155fff8a341b43fcc5c4eda5",
    });
  });

  it("keeps the Fudge outline inside r26 preview bounds", async () => {
    const createRenderer = () => createRequestRenderer(canvasKit);
    const fudgeAppearance: RenderAppearanceV4 = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" },
    };
    const render = (rendererRevision: "canvaskit-v4-r25" | "canvaskit-v4-r26") =>
      renderDiceRequestV4ToPng(
        {
          version: 4,
          rendererRevision,
          groups: [[{
            ...die("fudge", 1),
            appearance: fudgeAppearance,
            view: {
              kind: "camera",
              elevationDegrees: 40,
              azimuthOffsetDegrees: -35,
              poseAzimuthDegrees: 0,
            },
          }]],
        },
        createRenderer,
      );
    const [r25, r26] = await Promise.all([
      render("canvaskit-v4-r25"),
      render("canvaskit-v4-r26"),
    ]);

    expect(r26.png).not.toEqual(r25.png);
    expect({ r25: sha256(r25.png), r26: sha256(r26.png) }).toEqual({
      r25: "b5c17c69f64f4367abaf2b3b53d45ce5ceba37ad122edd7651c8e976e0bdd9ec",
      r26: "8ffff18a0caca319b72e9b4316659b0fb7afa8b73d84418bfc73e72fe433c6d6",
    });
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
            "canvaskit-v4-r42" as RenderRequestV4["rendererRevision"],
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

  it("bounds the maximum r12 repeated modifier layout", async () => {
    const scopedAppearance = {
      ...appearance,
      texture: { ...appearance.texture, scope: "die-wide" as const },
    };
    const current = await renderDiceRequestV4ToPng(
      {
        version: 4,
        rendererRevision: "canvaskit-v4-r12",
        groups: Array.from({ length: 50 }, (_, index) => [
          {
            ...die("d6", (index % 6) + 1),
            appearance: scopedAppearance,
            icons: ["trashcan"],
          },
        ]),
      },
      () => createRequestRenderer(canvasKit),
    );

    expect(current).toMatchObject({
      width: 384,
      height: 9_600,
      diceCount: 50,
      rowCount: 50,
    });
    expect(current.width * current.height * 4).toBe(14_745_600);
    expect(current.png.byteLength).toBeLessThan(10_000_000);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBeLessThanOrEqual(67_108_864);
  });
});
