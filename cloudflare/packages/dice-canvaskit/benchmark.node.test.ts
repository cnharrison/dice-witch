import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Resvg } from "@cf-wasm/resvg/node";
import resvgPackage from "@cf-wasm/resvg/package.json";
import {
  ENGRAVING_FINISHES_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_STRENGTHS_V4,
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  type AppearanceTargetV4,
  type RenderAppearanceV4,
  type RenderDieV4,
  type RenderLightingV4,
  type RenderRequestV4,
} from "@dice-witch/dice-v4-model";
import { expect, test } from "vitest";
import { composeDiceSvgV2 } from "../dice-svg/src/composeV2";
import type {
  RenderAppearanceV2,
  RenderRequestV2,
} from "../dice-svg/src/types";
import { loadNodeCanvasKitFontDataV4 } from "../../tools/canvaskit/load-node-font-data.mjs";
import { loadNodeCanvasKitRuntime } from "../../tools/canvaskit/load-node-runtime.mjs";
import manifest from "./assets/manifest.json";
import {
  CanvasKitDiceRequestRendererV4,
  renderDiceRequestV4ToPng,
  type DiceRequestRendererFactoryV4,
} from "./src/render-request";

const DICE_COUNTS = [1, 2, 5, 10, 50] as const;
const WARMUP_RUNS = 3;
const MEASURED_RUNS = 7;
const SUSTAINED_RUNS = 100;
const LIFECYCLE_RUNS = 50;
const MAXIMUM_REGRESSION = 0.2;
const execFileAsync = promisify(execFile);
const cloudflareDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const repositoryDirectory = resolve(cloudflareDirectory, "..");

const fontFiles = [
  "LiberationSans-Bold-subset.ttf",
  "NewRocker-Regular-subset.ttf",
  "DiceWitchStencilOps-subset.ttf",
  "DiceWitchCreepingHorror-subset.ttf",
  "SpecialElite-subset.ttf",
  "LuckiestGuy-subset.ttf",
  "FontdinerSwanky-subset.ttf",
  "Syncopate-Bold-subset.ttf",
] as const;

const sharedBaselineAppearance: RenderAppearanceV2 = {
  primaryColor: "#5426a8",
  secondaryColor: "#f2d95c",
  textColor: "#faf9f6",
  outlineColor: "#000000",
  fill: { type: "pattern", pattern: "checkerboard" },
  fontId: "liberation-sans",
  effect: null,
  requiresLocalSeparation: false,
};

const candidateAppearance: RenderAppearanceV4 = {
  material: {
    family: "classic",
    treatment: "pattern",
    patternId: "checkerboard",
    opacity: "opaque",
    finish: "satin",
    textureScale: 100,
  },
  palette: ["#5426a8", "#f2d95c"],
  texture: {
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4.classic,
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

const candidateSharpResinAppearance: RenderAppearanceV4 = {
  ...candidateAppearance,
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
    ...candidateAppearance.texture,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4["sharp-resin"],
  },
};

const candidateCrystalAppearance: RenderAppearanceV4 = {
  ...candidateAppearance,
  material: {
    family: "glass",
    style: "prismatic",
    clarity: 88,
    finish: "polished",
    textureScale: 100,
  },
  palette: ["#071932", "#00bde3", "#e94fbe", "#ffe17a"],
  texture: {
    ...candidateAppearance.texture,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4.glass,
  },
};

const candidateMetalAppearance: RenderAppearanceV4 = {
  ...candidateAppearance,
  material: {
    family: "metal",
    metal: "steel",
    finish: "brushed",
    patinaStrength: 8,
    textureScale: 100,
  },
  palette: ["#141820", "#596573", "#c9d1d8"],
  texture: {
    ...candidateAppearance.texture,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4.metal,
  },
};

const candidateWoodAppearance: RenderAppearanceV4 = {
  ...candidateAppearance,
  material: {
    family: "wood",
    wood: "walnut",
    finish: "polished",
    grainDensity: 64,
    textureScale: 100,
  },
  palette: ["#1b0e09", "#6f351b", "#d3924b"],
  texture: {
    ...candidateAppearance.texture,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4.wood,
  },
};

const candidateHollowMetalAppearance: RenderAppearanceV4 = {
  ...candidateAppearance,
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
    ...candidateAppearance.texture,
    generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4["hollow-metal"],
  },
};

const CRITICAL_APPEARANCES_V4 = [
  candidateAppearance,
  candidateSharpResinAppearance,
  candidateCrystalAppearance,
  candidateMetalAppearance,
  candidateWoodAppearance,
  candidateHollowMetalAppearance,
] as const;

const CRITICAL_TREATMENTS_V4 = [
  "classic-glow",
  "internal-flare",
  "spectral-rim",
  "metal-edge",
  "engraving-burn",
  "inner-cage",
] as const;

const CRITICAL_INTENSITIES_V4 = [35, 70, 100] as const;

const AUXILIARY_ICONS_V4 = [
  "trashcan",
  "explosion",
  "recycle",
  "chevronUp",
  "chevronDown",
  "target-success",
  "penetrate",
  "unique",
  "blank",
] as const;

const MIXED_TARGETS: readonly AppearanceTargetV4[] = [
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
  "percentile",
  "fudge",
  "other",
];

type CandidateFixture =
  | "shared-classic"
  | "independent-classic"
  | "independent-face-local"
  | "independent-sharp-resin"
  | "independent-crystal-glass"
  | "independent-metal"
  | "independent-wood"
  | "independent-hollow-metal"
  | "independent-sphere"
  | "independent-mixed"
  | "independent-typography"
  | "independent-engraving"
  | "independent-lighting"
  | "independent-placement"
  | "independent-separation"
  | "independent-critical-icons";

const MAXIMUM_INDEPENDENT_FIXTURES = [
  "independent-classic",
  "independent-face-local",
  "independent-sharp-resin",
  "independent-crystal-glass",
  "independent-metal",
  "independent-wood",
  "independent-hollow-metal",
  "independent-sphere",
  "independent-mixed",
  "independent-typography",
  "independent-engraving",
  "independent-lighting",
  "independent-placement",
  "independent-separation",
  "independent-critical-icons",
] as const satisfies readonly CandidateFixture[];

type Measurement = {
  milliseconds: number;
  width: number;
  height: number;
  pngBytes: number;
  pngSha256: string;
};

type ProfileSummary = {
  baseline: ReturnType<typeof summary>;
  candidate: ReturnType<typeof summary>;
  changePercent: number;
};

type MaximumScenarioSummary =
  | (ProfileSummary & {
      baselineFixture: string;
      comparison: "target-and-palette-matched-current-renderer";
    })
  | {
      candidate: ReturnType<typeof summary>;
      currentRendererControl: ReturnType<typeof summary>;
      controlChangePercent: number;
      controlFixture: string;
      comparison: "non-equivalent-current-renderer-control";
    };

function usesNonEquivalentCurrentRendererControl(
  fixture: CandidateFixture,
): boolean {
  return (
    fixture === "independent-sharp-resin" ||
    fixture === "independent-crystal-glass" ||
    fixture === "independent-metal" ||
    fixture === "independent-wood" ||
    fixture === "independent-hollow-metal" ||
    fixture === "independent-critical-icons"
  );
}

function baselineFixtureName(fixture: CandidateFixture): string {
  if (fixture === "independent-face-local") {
    return "render-request-v2-independent-classic-gradient-d20-grid";
  }
  if (fixture === "independent-sphere") {
    return "render-request-v2-independent-classic-checkerboard-other-grid";
  }
  if (fixture === "independent-mixed") {
    return "render-request-v2-independent-classic-checkerboard-all-target-grid";
  }
  if (fixture === "independent-typography") {
    return "render-request-v2-independent-classic-checkerboard-all-target-all-font-grid";
  }
  if (fixture === "independent-engraving") {
    return "render-request-v2-independent-classic-checkerboard-all-target-engraving-control";
  }
  if (fixture === "independent-lighting") {
    return "render-request-v2-independent-classic-checkerboard-all-target-lighting-control";
  }
  if (fixture === "independent-placement") {
    return "render-request-v2-independent-classic-checkerboard-all-target-placement-control";
  }
  if (fixture === "independent-separation") {
    return "render-request-v2-independent-classic-checkerboard-all-target-separation-control";
  }
  if (fixture === "independent-critical-icons") {
    return "render-request-v2-independent-classic-checkerboard-critical-icon-control";
  }
  if (usesNonEquivalentCurrentRendererControl(fixture)) {
    return "render-request-v2-independent-classic-checkerboard-d20-control";
  }
  return `render-request-v2-${fixture}-checkerboard-d20-grid`;
}

function outputPath(): string {
  const value = process.env.DICE_WITCH_CANVASKIT_PRODUCT_BENCHMARK_OUTPUT;
  if (value === undefined || value.length === 0) {
    throw new Error(
      "DICE_WITCH_CANVASKIT_PRODUCT_BENCHMARK_OUTPUT is required",
    );
  }
  return resolve(value);
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  const value = sorted[index];
  if (value === undefined) throw new Error("Benchmark has no samples");
  return value;
}

function summary(samples: readonly Measurement[]) {
  const durations = samples.map(({ milliseconds }) => milliseconds);
  return {
    medianMilliseconds: rounded(percentile(durations, 0.5)),
    p95Milliseconds: rounded(percentile(durations, 0.95)),
    maximumMilliseconds: rounded(Math.max(...durations)),
    pngBytes: samples[0]?.pngBytes ?? 0,
    pngSha256: samples[0]?.pngSha256 ?? "",
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function independentPrimaryColor(index: number): string {
  return `#${((index * 0x9e37_79b1) & 0xff_ff_ff)
    .toString(16)
    .padStart(6, "0")}`;
}

function criticalStateForIndex(
  index: number,
): "critical-success" | "critical-failure" {
  return Math.floor(index / CRITICAL_TREATMENTS_V4.length) % 2 === 0
    ? "critical-success"
    : "critical-failure";
}

function criticalIntensityForIndex(index: number): number {
  const intensity =
    CRITICAL_INTENSITIES_V4[
      Math.floor(index / (CRITICAL_TREATMENTS_V4.length * 2)) %
        CRITICAL_INTENSITIES_V4.length
    ];
  if (intensity === undefined) {
    throw new Error("Candidate critical intensity is missing");
  }
  return intensity;
}

function criticalIconsForIndex(index: number): RenderDieV4["icons"] {
  const first = AUXILIARY_ICONS_V4[index % AUXILIARY_ICONS_V4.length];
  const second =
    AUXILIARY_ICONS_V4[(index + 1) % AUXILIARY_ICONS_V4.length];
  if (first === undefined || second === undefined) {
    throw new Error("Candidate critical icon is missing");
  }
  return [criticalStateForIndex(index), first, second];
}

const LEGACY_FONT_IDS = [
  "liberation-sans",
  "new-rocker",
  "stencil-ops",
  "creeping-horror",
  "special-elite",
  "luckiest-guy",
  "fontdiner-swanky",
  "syncopate",
] as const satisfies readonly RenderAppearanceV2["fontId"][];

function legacyFontForIndex(index: number): RenderAppearanceV2["fontId"] {
  const fontId = LEGACY_FONT_IDS[index % LEGACY_FONT_IDS.length];
  if (fontId === undefined) throw new Error("Legacy candidate font is missing");
  return fontId;
}

const BENCHMARK_LIGHTING_V4: readonly RenderLightingV4[] = [
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

function lightingForIndex(index: number): RenderLightingV4 {
  const lighting = BENCHMARK_LIGHTING_V4[index % BENCHMARK_LIGHTING_V4.length];
  if (lighting === undefined) throw new Error("Candidate lighting is missing");
  return lighting;
}

function baselineAppearance(
  fixture: CandidateFixture,
  index: number,
): RenderAppearanceV2 {
  if (fixture === "shared-classic") return sharedBaselineAppearance;
  return {
    ...sharedBaselineAppearance,
    primaryColor: independentPrimaryColor(index),
    fontId:
      fixture === "independent-typography"
        ? legacyFontForIndex(index)
        : sharedBaselineAppearance.fontId,
    effect:
      fixture === "independent-critical-icons"
        ? criticalStateForIndex(index)
        : null,
    fill:
      fixture === "independent-face-local"
        ? { type: "gradient" }
        : sharedBaselineAppearance.fill,
  };
}

function baselineRequest(
  diceCount: number,
  fixture: CandidateFixture,
): RenderRequestV2 {
  return {
    version: 2,
    groups: [
      Array.from({ length: diceCount }, (_, index) => {
        const target = targetForFixture(fixture, index);
        const common = {
          result: resultForTarget(target, index),
          appearance: baselineAppearance(fixture, index),
          icons:
            fixture === "independent-critical-icons"
              ? criticalIconsForIndex(index)
              : [],
        };
        return target === "other"
          ? { ...common, target, sides: 999 }
          : { ...common, target };
      }),
    ],
  };
}

function independentAppearance(
  appearance: RenderAppearanceV4,
  index: number,
): RenderAppearanceV4 {
  const [, ...remainingColors] = appearance.palette;
  return {
    ...appearance,
    palette: [
      independentPrimaryColor(index),
      ...remainingColors,
    ],
    texture: {
      ...appearance.texture,
      seed: 0x51ce_b00c + index,
    },
  };
}

function candidateAppearanceForFixture(
  fixture: CandidateFixture,
  index: number,
): RenderAppearanceV4 {
  if (fixture === "independent-face-local") {
    return {
      ...candidateAppearance,
      material: {
        family: "classic",
        treatment: "gradient",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
      texture: {
        ...candidateAppearance.texture,
        rotation: 45,
        scope: "face-local",
      },
    };
  }
  if (fixture === "independent-sharp-resin") {
    return candidateSharpResinAppearance;
  }
  if (fixture === "independent-crystal-glass") {
    return candidateCrystalAppearance;
  }
  if (fixture === "independent-metal") return candidateMetalAppearance;
  if (fixture === "independent-wood") return candidateWoodAppearance;
  if (fixture === "independent-hollow-metal") {
    return candidateHollowMetalAppearance;
  }
  if (fixture === "independent-critical-icons") {
    const criticalAppearance =
      CRITICAL_APPEARANCES_V4[index % CRITICAL_APPEARANCES_V4.length];
    if (criticalAppearance === undefined) {
      throw new Error("Candidate critical appearance is missing");
    }
    return criticalAppearance;
  }
  return candidateAppearance;
}

function resultForTarget(target: AppearanceTargetV4, index: number): number {
  if (target === "percentile") return (index % 10) * 10;
  if (target === "fudge") return (index % 3) - 1;
  if (target === "other") return (index % 999) + 1;
  return (index % Number(target.slice(1))) + 1;
}

function targetForFixture(
  fixture: CandidateFixture,
  index: number,
): AppearanceTargetV4 {
  if (fixture === "independent-sphere") return "other";
  if (fixture === "independent-critical-icons") {
    const materialIndex = index % CRITICAL_APPEARANCES_V4.length;
    if ([1, 2, 5].includes(materialIndex)) return "d20";
    const target =
      MIXED_TARGETS[Math.floor(index / CRITICAL_APPEARANCES_V4.length) % MIXED_TARGETS.length];
    if (target === undefined) throw new Error("Candidate target is missing");
    return target;
  }
  if (
    fixture !== "independent-mixed" &&
    fixture !== "independent-typography" &&
    fixture !== "independent-engraving" &&
    fixture !== "independent-lighting" &&
    fixture !== "independent-placement" &&
    fixture !== "independent-separation"
  ) {
    return "d20";
  }
  const target = MIXED_TARGETS[index % MIXED_TARGETS.length];
  if (target === undefined) throw new Error("Candidate target is missing");
  return target;
}

function formForFixture(
  fixture: CandidateFixture,
  index: number,
): RenderDieV4["form"] {
  if (fixture === "independent-sharp-resin") return "sharp";
  if (fixture === "independent-crystal-glass") return "crystal-cut";
  if (fixture === "independent-hollow-metal") return "hollow-cage";
  if (fixture === "independent-critical-icons") {
    const materialIndex = index % CRITICAL_APPEARANCES_V4.length;
    if (materialIndex === 1) return "sharp";
    if (materialIndex === 2) return "crystal-cut";
    if (materialIndex === 5) return "hollow-cage";
  }
  return "standard";
}

function candidateDie(fixture: CandidateFixture, index: number): RenderDieV4 {
  const target = targetForFixture(fixture, index);
  const baseAppearance = candidateAppearanceForFixture(fixture, index);
  const resolvedAppearance =
    fixture === "shared-classic"
      ? baseAppearance
      : independentAppearance(baseAppearance, index);
  let appearance = resolvedAppearance;
  if (fixture === "independent-typography") {
    appearance = {
      ...appearance,
      engraving: {
        ...appearance.engraving,
        fontId: legacyFontForIndex(index),
      },
    };
  } else if (fixture === "independent-engraving") {
    const finish = ENGRAVING_FINISHES_V4[index % ENGRAVING_FINISHES_V4.length];
    if (finish === undefined) throw new Error("Candidate engraving finish is missing");
    appearance = {
      ...appearance,
      engraving: {
        ...appearance.engraving,
        finish,
      },
    };
  } else if (fixture === "independent-lighting") {
    appearance = {
      ...appearance,
      lighting: lightingForIndex(index),
    };
  } else if (fixture === "independent-placement") {
    appearance = {
      ...appearance,
      texture: {
        ...appearance.texture,
        rotation: (index * 37) % 360,
        offsetU: (index * 12_345) % 65_536,
        offsetV: (index * 54_321) % 65_536,
      },
    };
  } else if (fixture === "independent-separation") {
    appearance = {
      ...appearance,
      engraving: {
        ...appearance.engraving,
        finish: index % 2 === 0 ? "matte-ink" : "void",
      },
      requiresLocalSeparation: true,
    };
  } else if (fixture === "independent-critical-icons") {
    const materialIndex = index % CRITICAL_TREATMENTS_V4.length;
    const treatment = CRITICAL_TREATMENTS_V4[materialIndex];
    if (treatment === undefined) {
      throw new Error("Candidate critical treatment is missing");
    }
    const state = criticalStateForIndex(index);
    appearance = {
      ...appearance,
      effect: {
        state,
        treatment,
        color: state === "critical-success" ? "#ffd447" : "#ff334f",
        intensity: criticalIntensityForIndex(index),
      },
    };
  }
  const common = {
    result: resultForTarget(target, index),
    appearance,
    icons:
      fixture === "independent-critical-icons"
        ? criticalIconsForIndex(index)
        : [],
  };
  return target === "other"
    ? { ...common, target, sides: 999, form: "sphere" }
    : {
        ...common,
        target,
        form: formForFixture(fixture, index),
      };
}

function candidateRequest(
  diceCount: number,
  fixture: CandidateFixture = "shared-classic",
): RenderRequestV4 {
  return {
    version: 4,
    rendererRevision:
      fixture === "independent-face-local"
        ? "canvaskit-v4-r2"
        : "canvaskit-v4-r1",
    groups: [
      Array.from({ length: diceCount }, (_, index) =>
        candidateDie(fixture, index),
      ),
    ],
  };
}

async function measureBaseline(
  fontBuffers: readonly Uint8Array[],
  diceCount: number,
  fixture: CandidateFixture = "shared-classic",
): Promise<Measurement> {
  const startedAt = performance.now();
  const composed = composeDiceSvgV2(baselineRequest(diceCount, fixture));
  const renderer = await Resvg.async(composed.svg, {
    font: {
      fontBuffers: fontBuffers.map((font) => new Uint8Array(font)),
      defaultFontFamily: "Liberation Sans",
      sansSerifFamily: "Liberation Sans",
    },
    fitTo: { mode: "original" },
  });
  try {
    const image = renderer.render();
    try {
      const png = image.asPng();
      return {
        milliseconds: rounded(performance.now() - startedAt),
        width: composed.width,
        height: composed.height,
        pngBytes: png.byteLength,
        pngSha256: sha256(png),
      };
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}

async function measureCandidate(
  createRenderer: DiceRequestRendererFactoryV4,
  diceCount: number,
  fixture: CandidateFixture = "shared-classic",
): Promise<Measurement> {
  const startedAt = performance.now();
  const rendered = await renderDiceRequestV4ToPng(
    candidateRequest(diceCount, fixture),
    createRenderer,
  );
  return {
    milliseconds: rounded(performance.now() - startedAt),
    width: rendered.width,
    height: rendered.height,
    pngBytes: rendered.png.byteLength,
    pngSha256: sha256(rendered.png),
  };
}

async function measureProfile(
  baselineFonts: readonly Uint8Array[],
  createRenderer: DiceRequestRendererFactoryV4,
  diceCount: number,
  fixture: CandidateFixture = "shared-classic",
): Promise<ProfileSummary> {
  const baselineSamples: Measurement[] = [];
  const candidateSamples: Measurement[] = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    if (index % 2 === 0) {
      baselineSamples.push(
        await measureBaseline(baselineFonts, diceCount, fixture),
      );
      candidateSamples.push(
        await measureCandidate(createRenderer, diceCount, fixture),
      );
    } else {
      candidateSamples.push(
        await measureCandidate(createRenderer, diceCount, fixture),
      );
      baselineSamples.push(
        await measureBaseline(baselineFonts, diceCount, fixture),
      );
    }
  }
  if (!usesNonEquivalentCurrentRendererControl(fixture)) {
    expect(
      new Set(
        baselineSamples.map(
          ({ width, height }) => `${String(width)}x${String(height)}`,
        ),
      ),
    ).toEqual(
      new Set(
        candidateSamples.map(
          ({ width, height }) => `${String(width)}x${String(height)}`,
        ),
      ),
    );
  }
  for (const samples of [baselineSamples, candidateSamples]) {
    expect(new Set(samples.map(({ pngSha256 }) => pngSha256)).size).toBe(1);
    expect(new Set(samples.map(({ pngBytes }) => pngBytes)).size).toBe(1);
  }
  const baseline = summary(baselineSamples);
  const candidate = summary(candidateSamples);
  return {
    baseline,
    candidate,
    changePercent: rounded(
      (candidate.medianMilliseconds / baseline.medianMilliseconds - 1) *
        100,
    ),
  };
}

async function gitOutput(arguments_: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", arguments_, {
    cwd: repositoryDirectory,
    encoding: "utf8",
  });
  return stdout.trim();
}

function processMemoryMiB() {
  const usage = process.memoryUsage();
  return {
    rss: rounded(usage.rss / 1024 / 1024),
    heapUsed: rounded(usage.heapUsed / 1024 / 1024),
    external: rounded(usage.external / 1024 / 1024),
    arrayBuffers: rounded(usage.arrayBuffers / 1024 / 1024),
  };
}

test("passes the direct maximum Render Request V4 composition gate", async () => {
  const destination = outputPath();
  const assets = resolve(cloudflareDirectory, "packages/dice-svg/assets");
  const [canvasKit, fontDataById, ...baselineFonts] = await Promise.all([
    loadNodeCanvasKitRuntime(),
    loadNodeCanvasKitFontDataV4(),
    ...fontFiles.map((name) => readFile(resolve(assets, name))),
  ]);
  const createRenderer = (): CanvasKitDiceRequestRendererV4 =>
    new CanvasKitDiceRequestRendererV4({
      canvasKit,
      defaultFontId: "liberation-sans",
      fontDataById,
    });

  const cold = {
    baseline: await measureBaseline(baselineFonts, 50),
    candidate: await measureCandidate(createRenderer, 50),
  };
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    await measureBaseline(baselineFonts, 50);
    await measureCandidate(createRenderer, 50);
  }

  const profiles: Record<string, ProfileSummary> = {};
  for (const diceCount of DICE_COUNTS) {
    profiles[String(diceCount)] = await measureProfile(
      baselineFonts,
      createRenderer,
      diceCount,
    );
  }

  const maximumProfile = profiles["50"];
  if (maximumProfile === undefined) {
    throw new Error("Maximum benchmark profile is missing");
  }
  const maximumScenarios: Partial<
    Record<CandidateFixture, MaximumScenarioSummary>
  > = {};
  for (const fixture of MAXIMUM_INDEPENDENT_FIXTURES) {
    for (let index = 0; index < WARMUP_RUNS; index += 1) {
      await measureBaseline(baselineFonts, 50, fixture);
      await measureCandidate(createRenderer, 50, fixture);
    }
    const profile = await measureProfile(
      baselineFonts,
      createRenderer,
      50,
      fixture,
    );
    if (usesNonEquivalentCurrentRendererControl(fixture)) {
      maximumScenarios[fixture] = {
        candidate: profile.candidate,
        currentRendererControl: profile.baseline,
        controlChangePercent: profile.changePercent,
        controlFixture: baselineFixtureName(fixture),
        comparison: "non-equivalent-current-renderer-control",
      };
    } else {
      maximumScenarios[fixture] = {
        ...profile,
        baselineFixture: baselineFixtureName(fixture),
        comparison: "target-and-palette-matched-current-renderer",
      };
    }
  }
  const maximumScenarioPassed = Object.fromEntries(
    Object.entries(maximumScenarios).map(([fixture, profile]) => {
      const comparator =
        profile.comparison === "target-and-palette-matched-current-renderer"
          ? profile.baseline
          : profile.currentRendererControl;
      return [
        fixture,
        profile.candidate.medianMilliseconds <=
          comparator.medianMilliseconds * (1 + MAXIMUM_REGRESSION),
      ];
    }),
  );
  const sharedMaximumPassed =
    maximumProfile.candidate.medianMilliseconds <=
    maximumProfile.baseline.medianMilliseconds * (1 + MAXIMUM_REGRESSION);
  const maximumGatePassed =
    sharedMaximumPassed &&
    Object.values(maximumScenarioPassed).every((passed) => passed);

  const sustainedSamples: Measurement[] = [];
  for (let index = 0; index < SUSTAINED_RUNS; index += 1) {
    sustainedSamples.push(
      await measureCandidate(
        createRenderer,
        50,
        "independent-critical-icons",
      ),
    );
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
      manifest.memory.initialBytes,
    );
  }
  expect(new Set(sustainedSamples.map(({ pngSha256 }) => pngSha256)).size).toBe(1);

  const lifecycleDurations: number[] = [];
  for (let index = 0; index < LIFECYCLE_RUNS; index += 1) {
    const startedAt = performance.now();
    await measureCandidate(createRenderer, 1, "independent-critical-icons");
    lifecycleDurations.push(performance.now() - startedAt);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
      manifest.memory.initialBytes,
    );
  }

  const cpu = cpus();
  const report = {
    version: 4,
    status: "direct-render-request-v4-gate",
    scope: {
      includes:
        "Exact V4 validation and revision dispatch; shared classic, independent classic, independent face-local classic gradient, independent sharp resin, independent crystal-cut glass, independent metal, independent natural wood, independent hollow metal, independent spherical Other, independent all-target, independent all-font/all-target, independent all-finish/all-target, independent all-lighting/all-target, independent texture-placement/all-target, independent local-separation/all-target, and independent material-aware critical-effect/flat-icon maximum grids; target-, palette-, and font-matched current V2 SVG/resvg comparisons for comparable classic scenarios; explicitly non-equivalent current-renderer controls for sharp resin, crystal-cut glass, metal, wood, and hollow metal; deterministic 192 px octahedral and 150 px spherical preprojection; resolved engraving font, color, and finish; group layout; renderer disposal; and one final PNG encode",
      excludes:
        "Unsupported other-target sharp/crystal/hollow forms, retry timing, and deployed Worker measurements",
      processMemory:
        "Combined Node, resvg, and CanvasKit diagnostic only; not isolate-memory evidence",
    },
    sourceSha: await gitOutput(["rev-parse", "HEAD"]),
    dirty: (await gitOutput(["status", "--porcelain=v1"])) !== "",
    measuredAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpuModel: cpu[0]?.model ?? "unknown",
      logicalCpuCount: cpu.length,
      resvg: resvgPackage.version,
      wasmMemoryBytes: canvasKit.HEAPU8.buffer.byteLength,
    },
    fixture: {
      shared: {
        baseline: baselineFixtureName("shared-classic"),
        candidate: "render-request-v4-shared-classic-checkerboard-d20-grid",
      },
      independent: [...MAXIMUM_INDEPENDENT_FIXTURES],
      sustained: "independent-critical-icons",
      diceSize: 150,
      maximumDice: 50,
      warmupRuns: WARMUP_RUNS,
      measuredRuns: MEASURED_RUNS,
    },
    cold,
    profiles,
    maximumScenarios,
    maximumGate: {
      maximumRegressionPercent: MAXIMUM_REGRESSION * 100,
      sharedPassed: sharedMaximumPassed,
      scenarioPassed: maximumScenarioPassed,
      passed: maximumGatePassed,
    },
    sustained: {
      runs: SUSTAINED_RUNS,
      ...summary(sustainedSamples),
    },
    lifecycle: {
      runs: LIFECYCLE_RUNS,
      medianMilliseconds: rounded(percentile(lifecycleDurations, 0.5)),
      maximumMilliseconds: rounded(Math.max(...lifecycleDurations)),
    },
    processMemoryMiB: processMemoryMiB(),
  };
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`CanvasKit product benchmark written to ${destination}`);
  expect(maximumGatePassed).toBe(true);
});
