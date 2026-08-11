import {
  rendererRevisionPolicyV4,
  type AppearanceMaterialV4,
  type MaterialFamilyV4,
  type RenderAppearanceV4,
  type RendererRevisionV4,
} from "@dice-witch/dice-v4-model";
import {
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Texture,
} from "three";

export type ThreeMaterialCostTierV4 = "baseline" | "enhanced";

const R5_CLASSIC_GRADIENT_EMISSIVE_INTENSITY_V4 = 0.16;

const R6_PARITY_EMISSIVE_INTENSITY_BY_FAMILY_V4: Readonly<
  Record<MaterialFamilyV4, number>
> = Object.freeze({
  classic: 0.16,
  "sharp-resin": 0.16,
  "liquid-core": 0.16,
  gemstone: 0.16,
  glass: 0.16,
  stone: 0.16,
  metal: 0.28,
  "hollow-metal": 1,
  wood: 0.16,
  fantasy: 0.16,
  elemental: 0.16,
  paint: 0.16,
});

export type ThreeMaterialPolicyV4 = {
  shader: "standard" | "physical";
  costTier: ThreeMaterialCostTierV4;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  iridescence: number;
  dispersion: number;
  emissiveIntensity: number;
};

const BASELINE_MATERIAL_POLICY_V4 = Object.freeze({
  shader: "standard",
  costTier: "baseline",
  roughness: 0.52,
  metalness: 0,
  clearcoat: 0,
  clearcoatRoughness: 0,
  transmission: 0,
  thickness: 0,
  ior: 1.5,
  iridescence: 0,
  dispersion: 0,
  emissiveIntensity: 0,
} as const satisfies ThreeMaterialPolicyV4);

const CLASSIC_ROUGHNESS_V4 = Object.freeze({
  matte: 0.86,
  satin: 0.52,
  gloss: 0.2,
});
const RESIN_ROUGHNESS_V4 = Object.freeze({
  satin: 0.4,
  polished: 0.16,
  frosted: 0.7,
});
const GEMSTONE_ROUGHNESS_V4 = Object.freeze({
  polished: 0.18,
  frosted: 0.68,
  "raw-cut": 0.82,
});
const GLASS_ROUGHNESS_V4 = Object.freeze({
  polished: 0.12,
  frosted: 0.62,
  etched: 0.76,
});
const STONE_ROUGHNESS_V4 = Object.freeze({
  polished: 0.34,
  honed: 0.66,
  weathered: 0.9,
});
const METAL_ROUGHNESS_V4 = Object.freeze({
  polished: 0.16,
  brushed: 0.34,
  hammered: 0.46,
  oxidized: 0.7,
  patinated: 0.62,
  "enamel-inlaid": 0.28,
});
const WOOD_ROUGHNESS_V4 = Object.freeze({
  raw: 0.88,
  polished: 0.48,
  lacquered: 0.2,
  inlaid: 0.38,
  "vine-carved": 0.62,
});
const FANTASY_ROUGHNESS_V4 = Object.freeze({
  subdued: 0.64,
  radiant: 0.22,
  fractured: 0.48,
});
const FANTASY_EMISSIVE_SCALE_V4 = Object.freeze({
  subdued: 0.08,
  radiant: 0.34,
  fractured: 0.18,
});

function enhancedPolicyV4(
  overrides: Partial<ThreeMaterialPolicyV4>,
): ThreeMaterialPolicyV4 {
  return {
    ...BASELINE_MATERIAL_POLICY_V4,
    shader: "physical",
    costTier: "enhanced",
    ...overrides,
  };
}

function baselinePolicyV4(
  overrides: Partial<ThreeMaterialPolicyV4>,
): ThreeMaterialPolicyV4 {
  return { ...BASELINE_MATERIAL_POLICY_V4, ...overrides };
}

function percentageV4(value: number): number {
  return value / 100;
}

export function resolveThreeMaterialPolicyV4(
  material: AppearanceMaterialV4,
): ThreeMaterialPolicyV4 {
  switch (material.family) {
    case "classic": {
      const roughness = CLASSIC_ROUGHNESS_V4[material.finish];
      if (material.finish === "gloss" || material.opacity === "translucent") {
        return enhancedPolicyV4({
          roughness,
          clearcoat: material.finish === "gloss" ? 0.75 : 0.25,
          clearcoatRoughness: material.finish === "gloss" ? 0.12 : 0.32,
          transmission: material.opacity === "translucent" ? 0.16 : 0,
          thickness: material.opacity === "translucent" ? 0.55 : 0,
          ior: 1.46,
        });
      }
      return baselinePolicyV4({ roughness });
    }
    case "sharp-resin":
      return enhancedPolicyV4({
        roughness: RESIN_ROUGHNESS_V4[material.finish],
        clearcoat: material.finish === "frosted" ? 0.18 : 0.85,
        clearcoatRoughness: material.finish === "polished" ? 0.1 : 0.34,
        transmission: percentageV4(material.clarity) * 0.22,
        thickness: 0.72,
        ior: 1.5,
        iridescence:
          material.inclusion === "foil" || material.inclusion === "mylar"
            ? 0.12
            : 0,
      });
    case "liquid-core":
      return enhancedPolicyV4({
        roughness: RESIN_ROUGHNESS_V4[material.finish],
        clearcoat: material.finish === "frosted" ? 0.24 : 0.92,
        clearcoatRoughness: material.finish === "polished" ? 0.08 : 0.3,
        transmission: percentageV4(material.clarity) * 0.16,
        thickness: 0.85,
        ior: 1.46,
      });
    case "gemstone":
      return enhancedPolicyV4({
        roughness: GEMSTONE_ROUGHNESS_V4[material.finish],
        clearcoat: material.finish === "polished" ? 0.72 : 0.12,
        clearcoatRoughness: material.finish === "polished" ? 0.14 : 0.46,
        transmission:
          material.stone === "quartz" || material.stone === "cats-eye"
            ? 0.1
            : 0.025,
        thickness: 0.65,
        ior: 1.58,
        iridescence:
          material.stone === "labradorite" || material.stone === "cats-eye"
            ? 0.2
            : 0,
      });
    case "glass":
      return enhancedPolicyV4({
        roughness: GLASS_ROUGHNESS_V4[material.finish],
        clearcoat: material.finish === "polished" ? 1 : 0.35,
        clearcoatRoughness: material.finish === "polished" ? 0.05 : 0.38,
        transmission: 0.25 + percentageV4(material.clarity) * 0.4,
        thickness: 0.9,
        ior: 1.5,
        dispersion: material.style === "prismatic" ? 0.08 : 0,
      });
    case "stone":
      return baselinePolicyV4({
        roughness: STONE_ROUGHNESS_V4[material.finish],
      });
    case "metal":
      return baselinePolicyV4({
        roughness: METAL_ROUGHNESS_V4[material.finish],
        metalness: 0.9,
      });
    case "hollow-metal":
      return baselinePolicyV4({
        roughness: METAL_ROUGHNESS_V4[material.finish],
        metalness: 0.7,
      });
    case "wood":
      if (material.finish === "lacquered") {
        return enhancedPolicyV4({
          roughness: WOOD_ROUGHNESS_V4[material.finish],
          clearcoat: 0.68,
          clearcoatRoughness: 0.16,
          ior: 1.45,
        });
      }
      return baselinePolicyV4({
        roughness: WOOD_ROUGHNESS_V4[material.finish],
      });
    case "fantasy": {
      const roughness = FANTASY_ROUGHNESS_V4[material.finish];
      const emissiveIntensity =
        percentageV4(material.intensity) *
        FANTASY_EMISSIVE_SCALE_V4[material.finish];
      if (material.finish === "subdued") {
        return baselinePolicyV4({ roughness, emissiveIntensity });
      }
      return enhancedPolicyV4({
        roughness,
        clearcoat: material.finish === "radiant" ? 0.6 : 0.12,
        clearcoatRoughness: material.finish === "radiant" ? 0.16 : 0.42,
        transmission:
          material.essence === "ice" || material.essence === "cosmic"
            ? 0.08
            : 0,
        thickness: 0.5,
        emissiveIntensity,
      });
    }
    case "elemental": {
      let roughness = 0.48;
      if (material.style === "lava") roughness = 0.74;
      else if (material.style === "sand") roughness = 0.94;
      return baselinePolicyV4({ roughness });
    }
    case "paint":
      return baselinePolicyV4({ roughness: 0.62 });
    default:
      throw new Error("Three.js V4 material family is invalid");
  }
}

export type ThreeMaterialResourcesV4 = {
  material: MeshStandardMaterial;
  policy: ThreeMaterialPolicyV4;
};

export function createThreeMaterialResourcesV4(
  appearance: RenderAppearanceV4,
  texture: Texture,
  rendererRevision?: RendererRevisionV4,
): ThreeMaterialResourcesV4 {
  const policy = resolveThreeMaterialPolicyV4(appearance.material);
  const common = {
    map: texture,
    metalness: policy.metalness,
    roughness: policy.roughness,
  };
  const material =
    policy.shader === "physical"
      ? new MeshPhysicalMaterial({
          ...common,
          clearcoat: policy.clearcoat,
          clearcoatRoughness: policy.clearcoatRoughness,
          transmission: policy.transmission,
          thickness: policy.thickness,
          ior: policy.ior,
          iridescence: policy.iridescence,
          dispersion: policy.dispersion,
        })
      : new MeshStandardMaterial(common);
  material.name = `dice-v4-${appearance.material.family}-${policy.shader}`;
  const revisionPolicy = rendererRevision === undefined
    ? null
    : rendererRevisionPolicyV4(rendererRevision);
  const usesR5ClassicGradientLift =
    revisionPolicy?.materialGradientLift === true &&
    appearance.material.family === "classic" &&
    appearance.material.treatment === "gradient";
  const parityEmissiveIntensity =
    revisionPolicy?.materialParityEmissive === true
      ? R6_PARITY_EMISSIVE_INTENSITY_BY_FAMILY_V4[appearance.material.family]
      : 0;
  const emissiveIntensity = Math.max(
    policy.emissiveIntensity,
    usesR5ClassicGradientLift
      ? R5_CLASSIC_GRADIENT_EMISSIVE_INTENSITY_V4
      : 0,
    parityEmissiveIntensity,
  );
  if (emissiveIntensity > 0) {
    material.emissive.set(0xff_ff_ff);
    material.emissiveMap = texture;
    material.emissiveIntensity = emissiveIntensity;
  }
  return { material, policy };
}
