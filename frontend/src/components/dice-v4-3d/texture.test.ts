import {
  createTextureGenerationInputV4,
  generateMaterialTextureV4,
  parsePublicRenderModelV4,
  type RenderDieV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/d20-r3.json";
import { geometryDescriptorForDieV4 } from "./geometry";
import {
  createMaterialRasterV4,
  createPhysicalMaterialRasterV4,
} from "./texture";

function classicDie(
  treatment: "gradient" | "pattern",
): RenderDieV4 {
  const source = parsePublicRenderModelV4(fixture).groups[0]?.[0];
  if (source === undefined) throw new Error("Texture fixture is empty");
  return {
    ...source,
    appearance: {
      ...source.appearance,
      material:
        treatment === "gradient"
          ? {
              family: "classic",
              treatment,
              opacity: "opaque",
              finish: "satin",
              textureScale: 100,
            }
          : {
              family: "classic",
              treatment,
              patternId: "crosshatch",
              opacity: "opaque",
              finish: "satin",
              textureScale: 100,
            },
    },
  };
}

describe("V4 physical material texture mapping", () => {
  it.each(["gradient", "pattern"] as const)(
    "keeps r4/r5/r6 die-wide %s textures in projected source space",
    (treatment) => {
      const die = classicDie(treatment);
      const descriptor = geometryDescriptorForDieV4(
        "canvaskit-v4-r3",
        die,
      );
      const legacySource = createMaterialRasterV4(
        die.appearance,
        "canvaskit-v4-r3",
      );
      const projectedSource = createMaterialRasterV4(
        die.appearance,
        "canvaskit-v4-r4",
      );
      const revision5Source = createMaterialRasterV4(
        die.appearance,
        "canvaskit-v4-r5",
      );
      const revision6Source = createMaterialRasterV4(
        die.appearance,
        "canvaskit-v4-r6",
      );
      const legacy = createPhysicalMaterialRasterV4(
        die.appearance,
        descriptor,
        "canvaskit-v4-r3",
        legacySource,
      );
      const projected = createPhysicalMaterialRasterV4(
        die.appearance,
        descriptor,
        "canvaskit-v4-r4",
        projectedSource,
      );
      const revision5 = createPhysicalMaterialRasterV4(
        die.appearance,
        descriptor,
        "canvaskit-v4-r5",
        revision5Source,
      );
      const revision6 = createPhysicalMaterialRasterV4(
        die.appearance,
        descriptor,
        "canvaskit-v4-r6",
        revision6Source,
      );

      expect(legacy.pixels).not.toEqual(legacySource.pixels);
      expect(projected).toEqual(projectedSource);
      expect(revision5).toEqual(revision5Source);
      expect(revision6).toEqual(revision6Source);
      expect(revision6).toEqual(revision5);
      expect(projected).toMatchObject({ width: 192, height: 192 });
    },
  );

  it("maps r7 patterns through the physical atlas while retaining projected gradients", () => {
    const patternDie = classicDie("pattern");
    const descriptor = geometryDescriptorForDieV4(
      "canvaskit-v4-r7",
      patternDie,
    );
    const patternSource = createMaterialRasterV4(
      patternDie.appearance,
      "canvaskit-v4-r7",
    );
    const mappedPattern = createPhysicalMaterialRasterV4(
      patternDie.appearance,
      descriptor,
      "canvaskit-v4-r7",
      patternSource,
    );
    expect(mappedPattern.pixels).not.toEqual(patternSource.pixels);

    const gradientDie = classicDie("gradient");
    const gradientSource = createMaterialRasterV4(
      gradientDie.appearance,
      "canvaskit-v4-r7",
    );
    expect(
      createPhysicalMaterialRasterV4(
        gradientDie.appearance,
        descriptor,
        "canvaskit-v4-r7",
        gradientSource,
      ),
    ).toBe(gradientSource);
  });

  it("selects the exact gradient policy for r5 and later classic gradients", () => {
    const die = classicDie("gradient");
    const revision5 = createMaterialRasterV4(
      die.appearance,
      "canvaskit-v4-r5",
    );
    const revision6 = createMaterialRasterV4(
      die.appearance,
      "canvaskit-v4-r6",
    );
    const revision7 = createMaterialRasterV4(
      die.appearance,
      "canvaskit-v4-r7",
    );
    const expected = generateMaterialTextureV4(
      createTextureGenerationInputV4(die.appearance),
      "exact-gradient-r5",
    );
    const revision4 = createMaterialRasterV4(
      die.appearance,
      "canvaskit-v4-r4",
    );

    expect(revision5).toEqual(expected);
    expect(revision6).toEqual(expected);
    expect(revision7).toEqual(expected);
    expect(revision5.pixels).not.toEqual(revision4.pixels);
  });
});
