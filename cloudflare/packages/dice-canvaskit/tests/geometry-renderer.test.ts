import {
  D10_STANDARD_GEOMETRY_V4,
  D12_STANDARD_GEOMETRY_V4,
  D20_CRYSTAL_CUT_GEOMETRY_V4,
  D20_HOLLOW_CAGE_GEOMETRY_V4,
  D20_SHARP_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
  D4_STANDARD_GEOMETRY_V4,
  D6_STANDARD_GEOMETRY_V4,
  D8_STANDARD_GEOMETRY_V4,
  CRITICAL_TREATMENTS_V4,
  ENGRAVING_FINISHES_V4,
  FUDGE_STANDARD_GEOMETRY_V4,
  IDENTITY_TEXTURE_PLACEMENT_V4,
  OTHER_SPHERE_GEOMETRY_V4,
  PERCENTILE_STANDARD_GEOMETRY_V4,
  type PolyhedralGeometryDescriptorV4,
  type RenderCriticalEffectV4,
  type RenderLightingV4,
  type TexturePlacementV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import { CANVASKIT_FONT_DATA_V4 } from "../src/font-assets";
import { CanvasKitGeometryRendererV4 } from "../src/geometry-renderer";
import {
  createMaterialDirectionTextureV4,
  MATERIAL_DIRECTIONS_V4,
} from "./material-directions";
import {
  CANVASKIT_INITIAL_MEMORY_BYTES_V4,
  loadCanvasKitV4,
} from "../src/runtime";
import { createOctahedralTextureAtlasV4 } from "../src/octahedral-texture-atlas";
import { createSphericalMaterialRasterV4 } from "../src/spherical-material-raster";
import { decodePngRgba8 } from "./png";

const OTHER_RESULTS = [1, 6, 9, 20, 100, 999] as const;

const APPROVED_REPRESENTATIVE_PNG_HASHES_V4: Readonly<Record<string, string>> = {
  "d4-standard-r1":
    "d26edd536cf4ae968cc2d883057e25ae610282a41450a37fd907f6194235a667",
  "d6-standard-r1":
    "6dccc6e80d0365d65e41cd80aff18cf594afa21afca740e4ae02530ab5b824e3",
  "d8-standard-r1":
    "9e449fc29e3f8e467af6134838411ad6d2d6480a509df3a9b71f5a3ea7c020c7",
  "d10-standard-r1":
    "a45fc50637b3e1f7d7641ea5e6c2a6213c20dabcf9c4a1f2af3200f2dcdee019",
  "d12-standard-r1":
    "45b5457f6cf8697e23e525342dc1d0c24cc6157ba006d59fe4cc801158a27750",
  "d20-standard-r1":
    "a10612178dd6fef565f5eb77c31de9003ce021f40231abce02add8bb1464a29b",
  "percentile-standard-r1":
    "694feb7d1283b6fb22bdde403e1a3c1712df8545179e5584246ad789e1eaa037",
  "fudge-standard-r1":
    "ae58c67ca8dc145d779f214b475aa46b11cf1b382798d6ff322b5b1274303cd7",
};

const REPRESENTATIVE_GEOMETRIES = [
  [D4_STANDARD_GEOMETRY_V4, 4],
  [D6_STANDARD_GEOMETRY_V4, 6],
  [D8_STANDARD_GEOMETRY_V4, 8],
  [D10_STANDARD_GEOMETRY_V4, 10],
  [D12_STANDARD_GEOMETRY_V4, 12],
  [D20_STANDARD_GEOMETRY_V4, 20],
  [PERCENTILE_STANDARD_GEOMETRY_V4, 90],
  [FUDGE_STANDARD_GEOMETRY_V4, 1],
] as const satisfies readonly (readonly [
  PolyhedralGeometryDescriptorV4,
  number,
])[];

function createRenderer(
  canvasKit: Awaited<ReturnType<typeof loadCanvasKitV4>>,
): CanvasKitGeometryRendererV4 {
  return new CanvasKitGeometryRendererV4({
    canvasKit,
    defaultFontId: "liberation-sans",
    fontDataById: CANVASKIT_FONT_DATA_V4,
  });
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function pixelDifference(
  first: Uint8Array,
  second: Uint8Array,
): { mean: number; maximum: number } {
  if (first.length !== second.length) {
    throw new Error("CanvasKit V4 test pixel lengths differ");
  }
  let total = 0;
  let maximum = 0;
  for (let index = 0; index < first.length; index += 1) {
    const difference = Math.abs(
      (first[index] as number) - (second[index] as number),
    );
    total += difference;
    maximum = Math.max(maximum, difference);
  }
  return { mean: total / first.length, maximum };
}

describe("canonical CanvasKit V4 geometry renderer", () => {
  it("renders every standard polyhedral target deterministically", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    try {
      for (const [geometry, result] of REPRESENTATIVE_GEOMETRIES) {
        const options = { geometry, result, size: 300 } as const;
        const rendered = await renderer.render(options);
        const repeated = await renderer.render(options);
        expect(rendered.width).toBe(300);
        expect(rendered.height).toBe(300);
        expect(rendered.visibleFaceCount).toBeGreaterThan(0);
        expect([...rendered.png.slice(0, 8)]).toEqual([
          137, 80, 78, 71, 13, 10, 26, 10,
        ]);
        expect(repeated.png).toEqual(rendered.png);
        expect(await sha256Hex(rendered.png)).toBe(
          APPROVED_REPRESENTATIVE_PNG_HASHES_V4[geometry.id],
        );
      }
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("renders a crisp sharp-edge d20 without changing the standard d20", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    try {
      const standard = await renderer.render({
        geometry: D20_STANDARD_GEOMETRY_V4,
        result: 20,
        size: 300,
      });
      const sharp = await renderer.render({
        geometry: D20_SHARP_GEOMETRY_V4,
        result: 20,
        size: 300,
      });
      const standardHash = await sha256Hex(standard.png);
      const sharpHash = await sha256Hex(sharp.png);

      expect(standardHash).toBe(
        "a10612178dd6fef565f5eb77c31de9003ce021f40231abce02add8bb1464a29b",
      );
      expect(sharpHash).toBe(
        "9abc5595823d5a73267e6344d5bc59c7fd8a24b9daacf39b24a6bb9be6c75395",
      );
      expect(sharp.visibleFaceCount).toBe(standard.visibleFaceCount);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("renders an authored crystal-cut d20 without changing the standard d20", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    try {
      const standard = await renderer.render({
        geometry: D20_STANDARD_GEOMETRY_V4,
        result: 20,
        size: 300,
      });
      const crystal = await renderer.render({
        geometry: D20_CRYSTAL_CUT_GEOMETRY_V4,
        result: 20,
        size: 300,
      });
      const standardHash = await sha256Hex(standard.png);
      const crystalHash = await sha256Hex(crystal.png);

      expect(standardHash).toBe(
        "a10612178dd6fef565f5eb77c31de9003ce021f40231abce02add8bb1464a29b",
      );
      expect(crystalHash).toBe(
        "fb6ece83b2950f12a6c2a238c3022e9e295874fe7c7763dc23c3500b9ef310f1",
      );
      expect(crystal.visibleFaceCount).toBeGreaterThan(
        standard.visibleFaceCount,
      );
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("renders a physical hollow-cage d20 without changing the standard d20", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    try {
      const standard = await renderer.render({
        geometry: D20_STANDARD_GEOMETRY_V4,
        result: 20,
        size: 300,
      });
      const hollow = await renderer.render({
        geometry: D20_HOLLOW_CAGE_GEOMETRY_V4,
        result: 20,
        size: 300,
      });

      expect(await sha256Hex(standard.png)).toBe(
        "a10612178dd6fef565f5eb77c31de9003ce021f40231abce02add8bb1464a29b",
      );
      expect(await sha256Hex(hollow.png)).toBe(
        "8418fbc2dcfd475324b592eb6e5493282ae2f8314e49ebd206b5e486c53749a4",
      );
      expect(hollow.visibleFaceCount).toBe(70);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("renders true spherical Other boundaries deterministically", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const hashes: Record<string, string> = {};
    try {
      for (const result of OTHER_RESULTS) {
        const rendered = await renderer.renderSphere({
          geometry: OTHER_SPHERE_GEOMETRY_V4,
          sides: result,
          result,
          size: 300,
        });
        expect(rendered.visibleFaceCount).toBe(1);
        hashes[String(result)] = await sha256Hex(rendered.png);
      }
    } finally {
      renderer.dispose();
    }
    expect(hashes).toEqual({
      "1": "8b3fc4c19faf25d3ba1ff24e532c57f844ff742c51b2693c062f6899d677d946",
      "6": "74870c99ce5b7fce2b0230402ae4dff52b32b55c069e89ea52ed7835db1a5466",
      "9": "4bfac10acd50c8bded2660618430bd7dd63b6bcfd1e055a68e6806439cbec63b",
      "20": "a192e24327cc5e98e27d759d438e1453081ee74d2d8a4a136c5f9912ca807e15",
      "100": "a7c7928413956b6d5354bbe8d8268fc387ea6243dc2027b401d840ab71d305c5",
      "999": "c373b311aaa4769da5666a35785220b70c1309ab5dc3c7f88abe084fe3a7f701",
    });
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
      CANVASKIT_INITIAL_MEMORY_BYTES_V4,
    );
  });

  it("applies finish-aware physical local separation deterministically", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const hashes: Record<string, string> = {};
    try {
      for (const engravingFinish of ENGRAVING_FINISHES_V4) {
        const options = {
          geometry: D20_STANDARD_GEOMETRY_V4,
          result: 20,
          size: 300,
          engravingColor: "#faf2db",
          engravingFinish,
          requiresLocalSeparation: true,
        } as const;
        const rendered = await renderer.render(options);
        const repeated = await renderer.render(options);
        expect(repeated.png).toEqual(rendered.png);
        hashes[engravingFinish] = await sha256Hex(rendered.png);
      }
      expect(hashes).toEqual({
        "matte-ink":
          "f770ca5f6f77b75c8d694ee5521871b801bf8d4b627c4881fbb789829aabe42e",
        enamel:
          "f872ff891c7f01760d180f95a2a15e52f90105ce395e690c6e3c5982f6a7dd55",
        metallic:
          "9506e877d05d96660c4cdc2afd9dd549e2e59ae635ce46900275ab0e421d6fb1",
        luminous:
          "0646232abb3473461bd67aaf908b5febfb2355afe11b14c29bce77d7460bf6e0",
        void: "d4c3aa55134cd3d5176e7f966a1e3405ecaf15233d8c8e1144285eaee020f8fd",
      });
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("renders every material-aware critical treatment and state deterministically", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const geometryByTreatment = {
      "classic-glow": D20_STANDARD_GEOMETRY_V4,
      "internal-flare": D20_SHARP_GEOMETRY_V4,
      "spectral-rim": D20_CRYSTAL_CUT_GEOMETRY_V4,
      "metal-edge": D20_STANDARD_GEOMETRY_V4,
      "engraving-burn": D20_STANDARD_GEOMETRY_V4,
      "inner-cage": D20_HOLLOW_CAGE_GEOMETRY_V4,
    } as const;
    const hashes: Record<string, string> = {};
    try {
      for (const treatment of CRITICAL_TREATMENTS_V4) {
        for (const state of [
          "critical-success",
          "critical-failure",
        ] as const) {
          const criticalEffect: RenderCriticalEffectV4 = {
            state,
            treatment,
            color: state === "critical-success" ? "#ffd447" : "#ff334f",
            intensity: 72,
          };
          const options = {
            geometry: geometryByTreatment[treatment],
            result: state === "critical-success" ? 20 : 1,
            size: 300,
            criticalEffect,
          } as const;
          const rendered = await renderer.render(options);
          const repeated = await renderer.render(options);
          expect(repeated.png).toEqual(rendered.png);
          hashes[`${treatment}:${state}`] = await sha256Hex(rendered.png);
        }
      }
      expect(hashes).toEqual({
        "classic-glow:critical-success":
          "8d3b859d29fd092ed2babdee7e7101ff3ebb55e72b25f9e70e5597827da18949",
        "classic-glow:critical-failure":
          "994f49c40b53fa4efbb58189326502dc8f8d4ea0b3b170881744f9dedc63dd46",
        "internal-flare:critical-success":
          "0a34f15cd9b315a94de262482f6cf98eaae8a0e04a83f71a3eb2048af6f47c69",
        "internal-flare:critical-failure":
          "6732fb2f3573a0bac7f50aa36175aa99fa731d2cfbd40eddb53e0f4b6688f04d",
        "spectral-rim:critical-success":
          "164a2979d6e1af6d3ea5388c4b2e98ee7d973b907055fdc49940f8ece766f680",
        "spectral-rim:critical-failure":
          "50468f1535044aa767e2ce537ebbc800cdb4a4a44bd6340fda9f4753e46c6fb9",
        "metal-edge:critical-success":
          "558d96859f587570fb18f4f4172a660e622d296789e790aaeb68d0764de56cce",
        "metal-edge:critical-failure":
          "d3e0ad9837a22477caeb60636f325f44200f5df9704d9f766328a2426aabbd0b",
        "engraving-burn:critical-success":
          "fe904d42cb2daee8d283d12e7b9787bea9d6a28afbaac1e45ad8ee00873ac6d7",
        "engraving-burn:critical-failure":
          "2755b0f117ebe9310b87b79bd5bc365224930855a44cc8676bf556e045ece864",
        "inner-cage:critical-success":
          "48a25d39ac4b6917f82a878c815984e38108b6aac0bfd2f9404deef74632b75f",
        "inner-cage:critical-failure":
          "6258f27efc9e9fd3355783274bfd70a029d8a7a84bfa5cc5f2216eee6a63804a",
      });
      const baseline = await renderer.render({
        geometry: D20_STANDARD_GEOMETRY_V4,
        result: 20,
        size: 300,
      });
      const zeroIntensity = await renderer.render({
        geometry: D20_STANDARD_GEOMETRY_V4,
        result: 20,
        size: 300,
        criticalEffect: {
          state: "critical-success",
          treatment: "classic-glow",
          color: "#ffd447",
          intensity: 0,
        },
      });
      expect(zeroIntensity.png).toEqual(baseline.png);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("maps each Batch A material across d20 and spherical Other", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const hashes: Record<string, string> = {};
    try {
      for (const [index, [name, material, palette]] of MATERIAL_DIRECTIONS_V4.entries()) {
        const texture = createMaterialDirectionTextureV4(
          index,
          material,
          palette,
        );
        const d20 = await renderer.renderTextured({
          geometry: D20_STANDARD_GEOMETRY_V4,
          result: 20,
          size: 300,
          texture,
        });
        const other = await renderer.renderTexturedSphere({
          geometry: OTHER_SPHERE_GEOMETRY_V4,
          sides: 999,
          result: 999,
          size: 300,
          texture,
        });
        hashes[`${name}/d20`] = await sha256Hex(d20.png);
        hashes[`${name}/other`] = await sha256Hex(other.png);
      }
    } finally {
      renderer.dispose();
    }
    expect(hashes).toEqual({
      "hex-appeal/d20":
        "170eee79c91da283ca76e2cd15b11340e70bed00900ae8501ec21b984f18edba",
      "hex-appeal/other":
        "4795df48ada1821d9ed0005adc07c90e0ac9a540341e11bb0c81fb99d2b423ce",
      "critical-mass/d20":
        "1ca1d26df2597ae6b871cb38677aaaac13ab5df5a350a50d9f68b28e169ef1dd",
      "critical-mass/other":
        "ac8c129be0169ec1bfe05490aa90d7d98865417477af90fc78fb5a6ec794304d",
      "glass-cannon/d20":
        "cc69006b4a065c102439a78899867a6dbe8ab47f16f79d1b4cb6d2de26e84fb5",
      "glass-cannon/other":
        "d50807eec5b4c9a71aaf0053ebe95316e85f9e81765668ad094e7f25536ce350",
      "heavy-metal/d20":
        "755159034a187f971b89e9d3547df62d8a1a5fd17ffb32b5a05e9ef312330216",
      "heavy-metal/other":
        "ff5a93d6e47b22b0a44dfc3a883ba9713cfd20e3e32dfe0fc7e51beaaafae430",
      "hollow-victory/d20":
        "8ca6fd7c811905e8bb43da0ba80d7b2137eb8be8ce8b9b0514a0385b3789fe9a",
      "hollow-victory/other":
        "efdc963bf54cb29358a4096be3f005ece238c55ab3f1a106effe27bea1c89a40",
      "grain-expectations/d20":
        "cc47200375b9e83529f687c1bddb2ee3c480f769d8edc8eb463d3a7a50672fa3",
      "grain-expectations/other":
        "e48990b929ab36b8f292055f4636690a7bdf06cfc77ee07065708b87c4d3271c",
    });
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
      CANVASKIT_INITIAL_MEMORY_BYTES_V4,
    );
  });

  it("keeps placed octahedral preprojection visually equivalent to the shader", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const texturePlacement: TexturePlacementV4 = {
      rotation: 37,
      offsetU: 12_345,
      offsetV: 54_321,
    };
    const [, material, palette] = MATERIAL_DIRECTIONS_V4[3];
    const texture = createMaterialDirectionTextureV4(3, material, palette);
    try {
      const direct = await renderer.renderTextured({
        geometry: D20_STANDARD_GEOMETRY_V4,
        result: 20,
        size: 150,
        texture,
        texturePlacement,
      });
      const preprojected = await renderer.renderGeometryGrid({
          rendererRevision: "canvaskit-v4-r1",
        groups: [
          [
            {
              kind: "polyhedral",
              geometry: D20_STANDARD_GEOMETRY_V4,
              result: 20,
              fontId: "liberation-sans",
              texture: createOctahedralTextureAtlasV4(
                texture,
                texturePlacement,
              ),
              textureMapping: "octahedral-atlas",
            },
          ],
        ],
      });
      const directPixels = await decodePngRgba8(direct.png);
      const preprojectedPixels = await decodePngRgba8(preprojected.png);
      const difference = pixelDifference(
        directPixels.pixels,
        preprojectedPixels.pixels,
      );

      expect(difference.mean).toBeLessThanOrEqual(0.8);
      expect(difference.maximum).toBeLessThanOrEqual(40);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("keeps CPU and shader sphere lighting pixel-equivalent", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const lightingCases = [
      { mode: "none" },
      { mode: "facet", strength: "strong" },
      { mode: "directional", strength: "strong", direction: "right" },
      {
        mode: "combined",
        strength: "gentle",
        direction: "upper-left",
      },
      { mode: "combined", strength: "strong", direction: "top" },
    ] as const satisfies readonly RenderLightingV4[];
    const placements = [
      IDENTITY_TEXTURE_PLACEMENT_V4,
      { rotation: 37, offsetU: 12_345, offsetV: 54_321 },
    ] as const satisfies readonly TexturePlacementV4[];
    try {
      for (const materialIndex of [2, 5] as const) {
        const [, material, palette] = MATERIAL_DIRECTIONS_V4[materialIndex];
        const texture = createMaterialDirectionTextureV4(
          materialIndex,
          material,
          palette,
        );
        for (const lighting of lightingCases) {
          for (const texturePlacement of placements) {
            const direct = await renderer.renderTexturedSphere({
              geometry: OTHER_SPHERE_GEOMETRY_V4,
              sides: 999,
              result: 999,
              size: 150,
              texture,
              texturePlacement,
              lighting,
              materialFamily: material.family,
            });
            const materialRaster = createSphericalMaterialRasterV4(
              texture,
              lighting,
              material.family,
              texturePlacement,
            );
            const preprojected = await renderer.renderGeometryGrid({
              rendererRevision: "canvaskit-v4-r1",
              groups: [
                [
                  {
                    kind: "sphere",
                    geometry: OTHER_SPHERE_GEOMETRY_V4,
                    sides: 999,
                    result: 999,
                    fontId: "liberation-sans",
                    materialRaster,
                    lighting,
                    materialFamily: material.family,
                  },
                ],
              ],
            });
            const directPixels = await decodePngRgba8(direct.png);
            const preprojectedPixels = await decodePngRgba8(preprojected.png);
            expect(directPixels).toMatchObject({ width: 150, height: 150 });
            expect(preprojectedPixels).toMatchObject({
              width: 150,
              height: 150,
            });
            const difference = pixelDifference(
              directPixels.pixels,
              preprojectedPixels.pixels,
            );
            expect(difference.maximum).toBeLessThanOrEqual(1);
            expect(difference.mean).toBeLessThanOrEqual(0.02);
          }
        }
      }
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("composes a maximum canonical polyhedral grid directly", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    try {
      const groups = [
        Array.from({ length: 50 }, (_, index) => ({
          geometry: D20_STANDARD_GEOMETRY_V4,
          result: (index % 20) + 1,
        })),
      ];
      const first = await renderer.renderPolyhedralGrid({ groups });
      const second = await renderer.renderPolyhedralGrid({ groups });
      expect(first).toMatchObject({
        width: 1_500,
        height: 750,
        diceCount: 50,
        rowCount: 5,
      });
      expect(first.visibleFaceCount).toBe(500);
      const firstHash = await sha256Hex(first.png);
      expect(firstHash).toBe(await sha256Hex(second.png));
      expect(firstHash).toBe(
        "96fd7cde96b689f40b7ff95711ab93b34c5134a39c66537510202f98293adc6b",
      );
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("starts each polyhedral group on a new row", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const groups = [
      [
        { geometry: D6_STANDARD_GEOMETRY_V4, result: 5 },
        { geometry: D6_STANDARD_GEOMETRY_V4, result: 6 },
      ],
      [{ geometry: D20_STANDARD_GEOMETRY_V4, result: 20 }],
    ];
    try {
      const rendered = await renderer.renderPolyhedralGrid({ groups });
      const repeated = await renderer.renderPolyhedralGrid({ groups });
      expect(rendered).toMatchObject({
        width: 300,
        height: 300,
        diceCount: 3,
        rowCount: 2,
      });
      expect(repeated.png).toEqual(rendered.png);
    } finally {
      renderer.dispose();
    }
  });

  it("composes mixed canonical and textured geometry directly", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const [, material, palette] = MATERIAL_DIRECTIONS_V4[3];
    const texture = createMaterialDirectionTextureV4(3, material, palette);
    try {
      const groups = [
        [
          {
            kind: "polyhedral" as const,
            geometry: D20_STANDARD_GEOMETRY_V4,
            result: 20,
            fontId: "liberation-sans" as const,
            texture,
          },
          {
            kind: "sphere" as const,
            geometry: OTHER_SPHERE_GEOMETRY_V4,
            sides: 999,
            result: 999,
            fontId: "liberation-sans" as const,
            texture,
          },
        ],
        [
          {
            kind: "polyhedral" as const,
            geometry: D6_STANDARD_GEOMETRY_V4,
            result: 6,
            fontId: "liberation-sans" as const,
          },
        ],
      ];
      const options = {
        rendererRevision: "canvaskit-v4-r1" as const,
        groups,
      };
      const rendered = await renderer.renderGeometryGrid(options);
      const repeated = await renderer.renderGeometryGrid(options);
      expect(rendered).toMatchObject({
        width: 300,
        height: 300,
        diceCount: 3,
        rowCount: 2,
      });
      expect(rendered.visibleFaceCount).toBe(14);
      expect(repeated.png).toEqual(rendered.png);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("precomputes repeated octahedral textures deterministically", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const [, material, palette] = MATERIAL_DIRECTIONS_V4[3];
    const texture = createMaterialDirectionTextureV4(3, material, palette);
    try {
      const rendered = await renderer.renderGeometryGrid({
          rendererRevision: "canvaskit-v4-r1",
        groups: [
          Array.from({ length: 4 }, () => ({
            kind: "polyhedral" as const,
            geometry: D20_STANDARD_GEOMETRY_V4,
            result: 20,
            fontId: "liberation-sans" as const,
            texture,
          })),
        ],
      });
      expect(rendered).toMatchObject({
        width: 600,
        height: 150,
        diceCount: 4,
        rowCount: 1,
        visibleFaceCount: 40,
      });
      expect(await sha256Hex(rendered.png)).toBe(
        "d5726fa8f88ff53667613d89a7753197eb5bcbf54b079464899a4715f7dcdc5b",
      );
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("reuses pixel-identical spherical material backgrounds", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    const [, material, palette] = MATERIAL_DIRECTIONS_V4[3];
    const texture = createMaterialDirectionTextureV4(3, material, palette);
    const die = {
      kind: "sphere" as const,
      geometry: OTHER_SPHERE_GEOMETRY_V4,
      sides: 999,
      result: 999,
      fontId: "liberation-sans" as const,
      texture,
    };
    try {
      const rendered = await renderer.renderGeometryGrid({
          rendererRevision: "canvaskit-v4-r1",
        groups: [[die, die, die]],
      });
      expect(rendered).toMatchObject({
        width: 450,
        height: 150,
        diceCount: 3,
        rowCount: 1,
        visibleFaceCount: 3,
      });
      expect(await sha256Hex(rendered.png)).toBe(
        "fd1a297a5e86c6575f81c9dac67127ee75bb8668b5db15f24e43ed5d84a3d9db",
      );
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("rejects invalid polyhedral grid shapes explicitly", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    try {
      await expect(
        renderer.renderPolyhedralGrid({ groups: [] }),
      ).rejects.toThrow(
        "CanvasKit V4 polyhedral grid groups must be a non-empty array",
      );
      await expect(
        renderer.renderGeometryGrid({
          rendererRevision: "canvaskit-v4-r1",
          groups: [],
        }),
      ).rejects.toThrow(
        "CanvasKit V4 geometry grid groups must be a non-empty array",
      );
      await expect(
        renderer.renderPolyhedralGrid({ groups: [[]] }),
      ).rejects.toThrow(
        "CanvasKit V4 polyhedral grid groups must not contain empty groups",
      );
      await expect(
        renderer.renderPolyhedralGrid({
          groups: [
            Array.from({ length: 51 }, () => ({
              geometry: D20_STANDARD_GEOMETRY_V4,
              result: 20,
            })),
          ],
        }),
      ).rejects.toThrow("CanvasKit V4 polyhedral grid exceeds 50 dice");
      const [, material, palette] = MATERIAL_DIRECTIONS_V4[3];
      const texture = createMaterialDirectionTextureV4(3, material, palette);
      await expect(
        renderer.renderGeometryGrid({
          rendererRevision: "canvaskit-v4-r1",
          groups: [[{
            kind: "polyhedral",
            geometry: D6_STANDARD_GEOMETRY_V4,
            result: 6,
            fontId: "liberation-sans",
            texture,
            textureMapping: "octahedral-atlas",
          }]],
        }),
      ).rejects.toThrow(
        "CanvasKit V4 octahedral texture atlas requires octahedral geometry",
      );
      await expect(
        renderer.renderGeometryGrid({
          rendererRevision: "canvaskit-v4-r1",
          groups: [[{
            kind: "polyhedral",
            geometry: D20_STANDARD_GEOMETRY_V4,
            result: 20,
            fontId: "liberation-sans",
            textureMapping: "octahedral-atlas",
          }]],
        }),
      ).rejects.toThrow(
        "CanvasKit V4 octahedral texture atlas requires a supplied texture",
      );
      const materialRaster = {
        width: 150 as const,
        height: 150 as const,
        pixels: new Uint8Array(150 * 150 * 4),
      };
      await expect(
        renderer.renderGeometryGrid({
          rendererRevision: "canvaskit-v4-r1",
          groups: [[{
            kind: "sphere",
            geometry: OTHER_SPHERE_GEOMETRY_V4,
            sides: 999,
            result: 999,
            fontId: "liberation-sans",
            texture,
            materialRaster,
          }]],
        }),
      ).rejects.toThrow(
        "CanvasKit V4 sphere grid die cannot use texture and material raster together",
      );
      await expect(
        renderer.renderGeometryGrid({
          rendererRevision: "canvaskit-v4-r1",
          groups: [[{
            kind: "sphere",
            geometry: OTHER_SPHERE_GEOMETRY_V4,
            sides: 999,
            result: 999,
            fontId: "liberation-sans",
            materialRaster: { ...materialRaster, pixels: new Uint8Array(4) },
          }]],
        }),
      ).rejects.toThrow("CanvasKit V4 spherical material raster is invalid");
      await expect(
        renderer.renderGeometryGrid({
          rendererRevision: "canvaskit-v4-r1",
          groups: [[{
            kind: "sphere",
            geometry: OTHER_SPHERE_GEOMETRY_V4,
            sides: 999,
            result: 999,
            fontId: "liberation-sans",
            materialRaster: {
              width: 1,
              height: 1,
              pixels: new Uint8Array(4),
            } as unknown as typeof materialRaster,
          }]],
        }),
      ).rejects.toThrow("CanvasKit V4 spherical material raster is invalid");
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("repeats identical bytes across renderer-owned lifecycles", async () => {
    const canvasKit = await loadCanvasKitV4();
    const hashes: string[] = [];
    const renderer = createRenderer(canvasKit);
    try {
      for (let iteration = 0; iteration < 10; iteration += 1) {
        const rendered = await renderer.render({
          geometry: D20_STANDARD_GEOMETRY_V4,
          result: 20,
          size: 300,
        });
        hashes.push(await sha256Hex(rendered.png));
        expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
          CANVASKIT_INITIAL_MEMORY_BYTES_V4,
        );
      }
    } finally {
      renderer.dispose();
    }
    expect(new Set(hashes).size).toBe(1);
    expect(() =>
      renderer.render({
        geometry: D20_STANDARD_GEOMETRY_V4,
        result: 20,
      }),
    ).toThrow("CanvasKit V4 geometry renderer is disposed");
  });

  it("sustains the complete geometry corpus within the initial heap", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    let renders = 0;
    try {
      for (const [geometry] of REPRESENTATIVE_GEOMETRIES) {
        for (const { result } of geometry.resultOrientations) {
          for (const size of [150, 300]) {
            await renderer.render({ geometry, result, size });
            renders += 1;
          }
        }
        const representative = geometry.resultOrientations.at(-1)?.result;
        if (representative === undefined) {
          throw new Error(`${geometry.id} has no representative result`);
        }
        await renderer.render({ geometry, result: representative, size: 600 });
        renders += 1;
      }
      for (const result of OTHER_RESULTS) {
        for (const size of [150, 300]) {
          await renderer.renderSphere({
            geometry: OTHER_SPHERE_GEOMETRY_V4,
            sides: result,
            result,
            size,
          });
          renders += 1;
        }
      }
      await renderer.renderSphere({
        geometry: OTHER_SPHERE_GEOMETRY_V4,
        sides: 999,
        result: 999,
        size: 600,
      });
      renders += 1;
    } finally {
      renderer.dispose();
    }
    expect(renders).toBe(167);
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
      CANVASKIT_INITIAL_MEMORY_BYTES_V4,
    );
  });

  it("fails explicitly for invalid render inputs and fonts", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = createRenderer(canvasKit);
    try {
      await expect(
        renderer.render({
          geometry: D6_STANDARD_GEOMETRY_V4,
          result: 7,
        }),
      ).rejects.toThrow(
        "Geometry result orientation is not implemented: d6-standard-r1:7",
      );
      await expect(
        renderer.render({
          geometry: D6_STANDARD_GEOMETRY_V4,
          result: 1,
          size: 63,
        }),
      ).rejects.toThrow(
        "CanvasKit V4 geometry size must be from 64 through 1200",
      );
      await expect(
        renderer.render({
          geometry: D6_STANDARD_GEOMETRY_V4,
          result: 6,
          engravingFinish: "glitter" as never,
        }),
      ).rejects.toThrow(
        "CanvasKit V4 engraving finish is invalid: glitter",
      );
      await expect(
        renderer.renderSphere({
          geometry: OTHER_SPHERE_GEOMETRY_V4,
          sides: 1_000,
          result: 1,
        }),
      ).rejects.toThrow("CanvasKit V4 Other sides must be from 1 through 999");
      await expect(
        renderer.renderSphere({
          geometry: OTHER_SPHERE_GEOMETRY_V4,
          sides: 20,
          result: 21,
        }),
      ).rejects.toThrow("CanvasKit V4 Other result must be from 1 through 20");
      await expect(
        renderer.renderSphere({
          geometry: {
            ...OTHER_SPHERE_GEOMETRY_V4,
            labelFrame: {
              ...OTHER_SPHERE_GEOMETRY_V4.labelFrame,
              opticalInset: 1,
            },
          },
          sides: 20,
          result: 20,
        }),
      ).rejects.toThrow("CanvasKit V4 label optical inset is invalid");
      const [, material, palette] = MATERIAL_DIRECTIONS_V4[0];
      const texture = createMaterialDirectionTextureV4(0, material, palette);
      await expect(
        renderer.renderTextured({
          geometry: D20_STANDARD_GEOMETRY_V4,
          result: 20,
          texture: { ...texture, pixels: new Uint8Array(1) },
        }),
      ).rejects.toThrow(
        "CanvasKit V4 material texture pixel length is invalid",
      );
      await expect(
        renderer.renderTextured({
          geometry: D20_STANDARD_GEOMETRY_V4,
          result: 20,
          texture: {
            ...texture,
            width: 1,
            height: 1,
            pixels: new Uint8Array(4),
          } as unknown as typeof texture,
        }),
      ).rejects.toThrow(
        "CanvasKit V4 material texture pixel length is invalid",
      );
    } finally {
      renderer.dispose();
    }
    expect(
      () =>
        new CanvasKitGeometryRendererV4({
          canvasKit,
          defaultFontId: "liberation-sans",
          fontDataById: {
            ...CANVASKIT_FONT_DATA_V4,
            "liberation-sans": new ArrayBuffer(8),
          },
        }),
    ).toThrow(
      "CanvasKit geometry typeface liberation-sans allocation failed",
    );
    expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
      CANVASKIT_INITIAL_MEMORY_BYTES_V4,
    );
  });
});
