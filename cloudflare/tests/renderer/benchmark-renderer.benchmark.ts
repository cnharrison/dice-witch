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
import { expect, test } from "vitest";
import { composeDiceSvgV2 } from "../../packages/dice-svg/src/composeV2";
import type {
  RenderAppearanceV2,
  RenderRequestV2,
} from "../../packages/dice-svg/src/types";

const WARMUP_RUNS = 10;
const MEASURED_RUNS = 15;
const cloudflareRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const repositoryRoot = resolve(cloudflareRoot, "..");
const outputPath = resolve(
  process.env.DICE_WITCH_BENCHMARK_OUTPUT ??
    resolve(cloudflareRoot, ".generated/renderer-benchmark.json"),
);
const execFileAsync = promisify(execFile);
const encoder = new TextEncoder();

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

const appearance: RenderAppearanceV2 = {
  primaryColor: "#5426a8",
  secondaryColor: "#f2d95c",
  textColor: "#faf9f6",
  outlineColor: "#000000",
  fill: { type: "pattern", pattern: "checkerboard" },
  fontId: "liberation-sans",
  effect: null,
  requiresLocalSeparation: false,
};

const request: RenderRequestV2 = {
  version: 2,
  groups: [
    Array.from({ length: 50 }, (_, index) => ({
      target: "d20" as const,
      result: (index % 20) + 1,
      appearance,
      icons: [],
    })),
  ],
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted[Math.floor(sorted.length / 2)];
  if (value === undefined) throw new Error("Benchmark has no measured samples");
  return value;
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function pngSignatureIsValid(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((value, index) => bytes[index] === value);
}

type Measurement = {
  composeMilliseconds: number;
  rasterMilliseconds: number;
  totalMilliseconds: number;
  svgBytes: number;
  pngBytes: number;
};

async function measure(
  fontBuffers: readonly Uint8Array[],
): Promise<Measurement> {
  const totalStartedAt = performance.now();
  const composeStartedAt = performance.now();
  const composed = composeDiceSvgV2(request);
  const composeMilliseconds = performance.now() - composeStartedAt;
  const svgBytes = encoder.encode(composed.svg).byteLength;

  const rasterStartedAt = performance.now();
  const renderer = await Resvg.async(composed.svg, {
    font: {
      fontBuffers: fontBuffers.map((font) => new Uint8Array(font)),
      defaultFontFamily: "Liberation Sans",
      sansSerifFamily: "Liberation Sans",
    },
    fitTo: { mode: "original" },
  });
  let png: Uint8Array;
  try {
    const image = renderer.render();
    try {
      png = image.asPng();
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }

  if (!pngSignatureIsValid(png)) {
    throw new Error("Renderer benchmark did not produce a PNG");
  }
  return {
    composeMilliseconds: rounded(composeMilliseconds),
    rasterMilliseconds: rounded(performance.now() - rasterStartedAt),
    totalMilliseconds: rounded(performance.now() - totalStartedAt),
    svgBytes,
    pngBytes: png.byteLength,
  };
}

async function gitOutput(arguments_: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return stdout.trim();
}

test("records the reproducible 50-die renderer baseline", async () => {
  const assets = resolve(cloudflareRoot, "packages/dice-svg/assets");
  const fontBuffers = await Promise.all(
    fontFiles.map(async (name) => new Uint8Array(await readFile(resolve(assets, name)))),
  );

  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    await measure(fontBuffers);
  }
  const samples: Measurement[] = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    samples.push(await measure(fontBuffers));
  }

  const firstSample = samples[0];
  if (firstSample === undefined) {
    throw new Error("Renderer benchmark produced no measured samples");
  }
  expect(new Set(samples.map(({ svgBytes }) => svgBytes)).size).toBe(1);
  expect(new Set(samples.map(({ pngBytes }) => pngBytes)).size).toBe(1);

  const cpu = cpus();
  const report = {
    version: 1,
    sourceSha: await gitOutput(["rev-parse", "HEAD"]),
    rendererSourceSha: await gitOutput([
      "log",
      "-1",
      "--format=%H",
      "--",
      "cloudflare/packages/dice-svg",
    ]),
    measuredAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpuModel: cpu[0]?.model ?? "unknown",
      logicalCpuCount: cpu.length,
      resvg: resvgPackage.version,
    },
    fixture: {
      name: "50-checkerboard-d20-v2",
      sha256: createHash("sha256")
        .update(JSON.stringify(request))
        .digest("hex"),
      diceCount: 50,
      warmupRuns: WARMUP_RUNS,
      measuredRuns: MEASURED_RUNS,
    },
    result: {
      composeMedianMilliseconds: rounded(
        median(samples.map(({ composeMilliseconds }) => composeMilliseconds)),
      ),
      rasterMedianMilliseconds: rounded(
        median(samples.map(({ rasterMilliseconds }) => rasterMilliseconds)),
      ),
      totalMedianMilliseconds: rounded(
        median(samples.map(({ totalMilliseconds }) => totalMilliseconds)),
      ),
      svgBytes: firstSample.svgBytes,
      pngBytes: firstSample.pngBytes,
    },
    samples,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Renderer benchmark written to ${outputPath}`);
});
