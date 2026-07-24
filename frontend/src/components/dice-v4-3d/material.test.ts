import type { AppearanceMaterialV4 } from "@dice-witch/dice-v4-model";
import { MeshPhysicalMaterial, MeshStandardMaterial, Texture } from "three";
import { describe, expect, it } from "vitest";
import d6Fixture from "./fixtures/d6-r3.json";
import {
  createThreeMaterialResourcesV4,
  resolveThreeMaterialPolicyV4,
} from "./material";
import { parsePublicRenderModelV4 } from "@dice-witch/dice-v4-model";

const MATERIALS = [
  {
    family: "classic",
    treatment: "gradient",
    opacity: "opaque",
    finish: "satin",
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
    stone: "quartz",
    veinDensity: 36,
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
    grainDensity: 36,
    finish: "honed",
    textureScale: 100,
  },
  {
    family: "metal",
    metal: "steel",
    finish: "brushed",
    patinaStrength: 8,
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
    essence: "arcane",
    intensity: 60,
    finish: "radiant",
    textureScale: 100,
  },
] as const satisfies readonly AppearanceMaterialV4[];

const d6 = parsePublicRenderModelV4(d6Fixture).groups[0]?.[0];
if (d6 === undefined) throw new Error("D6 material fixture is empty");

describe("V4 Three.js material policy", () => {
  it("assigns a bounded physical cost tier to every material family", () => {
    expect(
      Object.fromEntries(
        MATERIALS.map((material) => [
          material.family,
          resolveThreeMaterialPolicyV4(material),
        ]),
      ),
    ).toMatchObject({
      classic: {
        shader: "standard",
        costTier: "baseline",
        roughness: 0.52,
        metalness: 0,
      },
      "sharp-resin": {
        shader: "physical",
        costTier: "enhanced",
        roughness: 0.16,
        transmission: 0.1848,
        iridescence: 0.12,
      },
      "liquid-core": {
        shader: "physical",
        costTier: "enhanced",
        transmission: (78 / 100) * 0.16,
      },
      gemstone: {
        shader: "physical",
        costTier: "enhanced",
        roughness: 0.18,
        transmission: 0.1,
      },
      glass: {
        shader: "physical",
        costTier: "enhanced",
        roughness: 0.12,
        transmission: 0.25 + (88 / 100) * 0.4,
        dispersion: 0.08,
      },
      stone: {
        shader: "standard",
        costTier: "baseline",
        roughness: 0.66,
      },
      metal: {
        shader: "standard",
        costTier: "baseline",
        roughness: 0.34,
        metalness: 0.9,
      },
      "hollow-metal": {
        shader: "standard",
        costTier: "baseline",
        roughness: 0.16,
        metalness: 0.7,
      },
      wood: {
        shader: "standard",
        costTier: "baseline",
        roughness: 0.48,
      },
      fantasy: {
        shader: "physical",
        costTier: "enhanced",
        roughness: 0.22,
        emissiveIntensity: (60 / 100) * 0.34,
      },
    });
  });

  it("keeps every policy parameter within Three.js physical bounds", () => {
    for (const material of MATERIALS) {
      const policy = resolveThreeMaterialPolicyV4(material);
      for (const parameter of [
        policy.roughness,
        policy.metalness,
        policy.clearcoat,
        policy.clearcoatRoughness,
        policy.transmission,
        policy.iridescence,
        policy.dispersion,
        policy.emissiveIntensity,
      ]) {
        expect(Number.isFinite(parameter)).toBe(true);
        expect(parameter).toBeGreaterThanOrEqual(0);
        expect(parameter).toBeLessThanOrEqual(1);
      }
      expect(policy.thickness).toBeGreaterThanOrEqual(0);
      expect(policy.ior).toBeGreaterThanOrEqual(1);
      expect(policy.ior).toBeLessThanOrEqual(2.333);
      expect(policy.shader === "physical").toBe(
        policy.costTier === "enhanced",
      );
    }
  });

  it("uses enhanced shaders only for explicit physical finishes", () => {
    expect(
      resolveThreeMaterialPolicyV4({
        ...MATERIALS[0],
        finish: "gloss",
      }),
    ).toMatchObject({
      shader: "physical",
      costTier: "enhanced",
      clearcoat: 0.75,
    });
    expect(
      resolveThreeMaterialPolicyV4({
        ...MATERIALS[0],
        opacity: "translucent",
      }),
    ).toMatchObject({
      shader: "physical",
      transmission: 0.16,
      thickness: 0.55,
    });
    expect(
      resolveThreeMaterialPolicyV4({
        ...MATERIALS[8],
        finish: "lacquered",
      }),
    ).toMatchObject({
      shader: "physical",
      clearcoat: 0.68,
    });
    expect(
      resolveThreeMaterialPolicyV4({
        ...MATERIALS[9],
        essence: "ice",
        finish: "subdued",
      }),
    ).toMatchObject({
      shader: "standard",
      costTier: "baseline",
      clearcoat: 0,
      transmission: 0,
      thickness: 0,
    });
  });

  it("applies the r5 gradient lift and r6-and-later source-map parity lifts", () => {
    const texture = new Texture();
    const gradientAppearance = {
      ...d6.appearance,
      material: MATERIALS[0],
    };
    const revision4 = createThreeMaterialResourcesV4(
      gradientAppearance,
      texture,
      "canvaskit-v4-r4",
    ).material;
    const revision5 = createThreeMaterialResourcesV4(
      gradientAppearance,
      texture,
      "canvaskit-v4-r5",
    ).material;
    const revision6 = createThreeMaterialResourcesV4(
      gradientAppearance,
      texture,
      "canvaskit-v4-r6",
    ).material;
    const revision7 = createThreeMaterialResourcesV4(
      gradientAppearance,
      texture,
      "canvaskit-v4-r7",
    ).material;
    const hollow = createThreeMaterialResourcesV4(
      { ...d6.appearance, material: MATERIALS[7] },
      texture,
      "canvaskit-v4-r6",
    ).material;
    const patternAppearance = {
      ...gradientAppearance,
      material: {
        ...MATERIALS[0],
        treatment: "pattern" as const,
        patternId: "stripes" as const,
      },
    };
    const pattern = createThreeMaterialResourcesV4(
      patternAppearance,
      texture,
      "canvaskit-v4-r5",
    ).material;
    const patternR6 = createThreeMaterialResourcesV4(
      patternAppearance,
      texture,
      "canvaskit-v4-r6",
    ).material;
    const patternR7 = createThreeMaterialResourcesV4(
      patternAppearance,
      texture,
      "canvaskit-v4-r7",
    ).material;

    expect(revision4.emissive.getHex()).toBe(0);
    expect(revision4.emissiveMap).toBeNull();
    expect(revision5.emissive.getHex()).toBe(0xff_ff_ff);
    expect(revision5.emissiveMap).toBe(texture);
    expect(revision5.emissiveIntensity).toBe(0.16);
    expect(revision6.emissive.getHex()).toBe(0xff_ff_ff);
    expect(revision6.emissiveMap).toBe(texture);
    expect(revision6.emissiveIntensity).toBe(0.16);
    expect(revision7.emissive.getHex()).toBe(0xff_ff_ff);
    expect(revision7.emissiveMap).toBe(texture);
    expect(revision7.emissiveIntensity).toBe(0.16);
    expect(hollow.emissive.getHex()).toBe(0xff_ff_ff);
    expect(hollow.emissiveMap).toBe(texture);
    expect(hollow.emissiveIntensity).toBe(1);
    expect(pattern.emissive.getHex()).toBe(0);
    expect(pattern.emissiveMap).toBeNull();
    expect(patternR6.emissive.getHex()).toBe(0xff_ff_ff);
    expect(patternR6.emissiveMap).toBe(texture);
    expect(patternR6.emissiveIntensity).toBe(0.16);
    expect(patternR7.emissive.getHex()).toBe(0xff_ff_ff);
    expect(patternR7.emissiveMap).toBe(texture);
    expect(patternR7.emissiveIntensity).toBe(0.16);

    revision4.dispose();
    revision5.dispose();
    revision6.dispose();
    revision7.dispose();
    hollow.dispose();
    pattern.dispose();
    patternR6.dispose();
    patternR7.dispose();
    texture.dispose();
  });

  it("creates disposable Three.js materials from the policy", () => {
    const texture = new Texture();
    const classic = createThreeMaterialResourcesV4(
      d6.appearance,
      texture,
    ).material;
    expect(classic).toBeInstanceOf(MeshStandardMaterial);
    expect(classic).not.toBeInstanceOf(MeshPhysicalMaterial);
    expect(classic.map).toBe(texture);
    expect(classic.name).toBe("dice-v4-classic-standard");

    const glassAppearance = { ...d6.appearance, material: MATERIALS[4] };
    const glass = createThreeMaterialResourcesV4(
      glassAppearance,
      texture,
    ).material;
    expect(glass).toBeInstanceOf(MeshPhysicalMaterial);
    expect((glass as MeshPhysicalMaterial).transmission).toBeCloseTo(0.602);
    expect((glass as MeshPhysicalMaterial).dispersion).toBe(0.08);

    const fantasyAppearance = { ...d6.appearance, material: MATERIALS[9] };
    const fantasy = createThreeMaterialResourcesV4(
      fantasyAppearance,
      texture,
    ).material;
    expect(fantasy.emissiveMap).toBe(texture);
    expect(fantasy.emissiveIntensity).toBeCloseTo(0.204);

    classic.dispose();
    glass.dispose();
    fantasy.dispose();
    texture.dispose();
  });

  it("rejects an unknown material family", () => {
    expect(() =>
      resolveThreeMaterialPolicyV4({ family: "paper" } as never),
    ).toThrow("Three.js V4 material family is invalid");
  });
});
