import {
  CRITICAL_TREATMENTS_V4,
  type RenderCriticalEffectV4,
} from "@dice-witch/dice-v4-model";
import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  LineBasicMaterial,
  MeshBasicMaterial,
  ShaderMaterial,
} from "three";
import { describe, expect, it } from "vitest";
import { createThreeCriticalEffectResourcesV4 } from "./critical-effect";

function geometry() {
  const create = () => {
    const value = new BufferGeometry();
    value.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    value.setAttribute(
      "normal",
      new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
    );
    value.setIndex([0, 1, 2]);
    return value;
  };
  return {
    base: create(),
    labels: create(),
    edgeMaterial: new LineBasicMaterial({
      color: 0x00_00_00,
      opacity: 0.64,
      transparent: true,
    }),
    labelTexture: new DataTexture(new Uint8Array(16), 2, 2),
  };
}

function effect(
  treatment: RenderCriticalEffectV4["treatment"],
  intensity = 72,
): RenderCriticalEffectV4 {
  return {
    state: "critical-success",
    treatment,
    color: "#ffd447",
    intensity,
  };
}

function disposeGeometry(value: ReturnType<typeof geometry>): void {
  value.base.dispose();
  value.labels.dispose();
  value.edgeMaterial.dispose();
  value.labelTexture.dispose();
}

describe("V4 Three.js critical-effect resources", () => {
  it("maps all six immutable treatments and their state accents", () => {
    const expectedPrimaryMaterial = {
      "classic-glow": MeshBasicMaterial,
      "internal-flare": ShaderMaterial,
      "spectral-rim": ShaderMaterial,
      "metal-edge": null,
      "engraving-burn": MeshBasicMaterial,
      "inner-cage": null,
    } as const;
    const expectedObjectCount = {
      "classic-glow": 2,
      "internal-flare": 2,
      "spectral-rim": 2,
      "metal-edge": 1,
      "engraving-burn": 2,
      "inner-cage": 1,
    } as const;

    for (const treatment of CRITICAL_TREATMENTS_V4) {
      const input = geometry();
      const resources = createThreeCriticalEffectResourcesV4(
        input,
        effect(treatment),
      );
      const objectCount = expectedObjectCount[treatment];

      expect(resources).toMatchObject({
        treatment,
        state: "critical-success",
        intensity: 0.72,
        objectCount,
      });
      expect(resources.group.children).toHaveLength(objectCount);
      expect(resources.materials).toHaveLength(objectCount);
      const primaryMaterial = expectedPrimaryMaterial[treatment];
      if (primaryMaterial === null) {
        expect(input.edgeMaterial).toMatchObject({
          name: `dice-v4-critical-${treatment}`,
          toneMapped: false,
        });
        expect(input.edgeMaterial.opacity).toBeCloseTo(0.8704, 8);
        expect(input.edgeMaterial.color.getHexString()).toBe("ffd447");
      } else {
        expect(resources.materials[0]).toBeInstanceOf(primaryMaterial);
        expect(resources.materials[0]).toMatchObject({
          name: `dice-v4-critical-${treatment}`,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        });
      }
      // SAFETY: The test controls this fixture and verifies its use in the scenario below.
      const stateMaterial = resources.materials.at(-1) as ShaderMaterial;
      expect(stateMaterial).toBeInstanceOf(ShaderMaterial);
      expect(stateMaterial.name).toBe(
        `dice-v4-critical-${treatment}-state`,
      );
      expect(stateMaterial.uniforms.effectState?.value).toBe(1);
      resources.materials.forEach((material) => material.dispose());
      disposeGeometry(input);
    }
  });

  it("uses clipped surface shaders when a spherical die has no edge geometry", () => {
    for (const treatment of ["metal-edge", "inner-cage"] as const) {
      const input = geometry();
      const resources = createThreeCriticalEffectResourcesV4(
        { ...input, edgeMaterial: null },
        effect(treatment),
      );

      expect(resources.materials).toHaveLength(2);
      expect(resources.materials[0]).toBeInstanceOf(ShaderMaterial);
      expect(resources.materials[1]).toBeInstanceOf(ShaderMaterial);
      expect(resources.group.children).toHaveLength(2);
      expect(resources.group.children[0]?.renderOrder).toBe(0.75);
      expect(resources.group.children[1]?.renderOrder).toBe(0.9);
      resources.materials.forEach((material) => material.dispose());
      disposeGeometry(input);
    }
  });

  it("encodes success and failure independently of effect color", () => {
    for (const treatment of CRITICAL_TREATMENTS_V4) {
      const successInput = geometry();
      const failureInput = geometry();
      const success = createThreeCriticalEffectResourcesV4(
        successInput,
        effect(treatment),
      );
      const failure = createThreeCriticalEffectResourcesV4(failureInput, {
        ...effect(treatment),
        state: "critical-failure",
      });
      // SAFETY: The test controls this fixture and verifies its use in the scenario below.
      const successState = success.materials.at(-1) as ShaderMaterial;
      // SAFETY: The test controls this fixture and verifies its use in the scenario below.
      const failureState = failure.materials.at(-1) as ShaderMaterial;

      expect(successState.uniforms.effectState?.value).toBe(1);
      expect(failureState.uniforms.effectState?.value).toBe(-1);
      expect(successState.fragmentShader).toBe(failureState.fragmentShader);

      success.materials.forEach((material) => material.dispose());
      failure.materials.forEach((material) => material.dispose());
      disposeGeometry(successInput);
      disposeGeometry(failureInput);
    }
  });

  it("allocates no critical GPU material when the effect is absent or zero", () => {
    const input = geometry();

    expect(createThreeCriticalEffectResourcesV4(input, null)).toMatchObject({
      treatment: null,
      state: null,
      intensity: 0,
      objectCount: 0,
      materials: [],
    });
    expect(
      createThreeCriticalEffectResourcesV4(
        input,
        effect("classic-glow", 0),
      ),
    ).toMatchObject({
      treatment: "classic-glow",
      state: "critical-success",
      intensity: 0,
      objectCount: 0,
      materials: [],
    });
    disposeGeometry(input);
  });

  it("fails closed for malformed critical values", () => {
    const input = geometry();
    expect(() =>
      createThreeCriticalEffectResourcesV4(input, {
        ...effect("classic-glow"),
        treatment: "unknown",
      }),
    ).toThrow("Three.js V4 critical effect treatment is invalid: unknown");
    expect(() =>
      createThreeCriticalEffectResourcesV4(input, {
        ...effect("classic-glow"),
        state: "normal",
      }),
    ).toThrow("Three.js V4 critical effect state is invalid");
    expect(() =>
      createThreeCriticalEffectResourcesV4(input, {
        ...effect("classic-glow"),
        color: "gold",
      }),
    ).toThrow("Three.js V4 critical effect color is invalid");
    expect(() =>
      createThreeCriticalEffectResourcesV4(input, {
        ...effect("classic-glow"),
        intensity: 101,
      }),
    ).toThrow("Three.js V4 critical effect intensity is invalid");
    disposeGeometry(input);
  });
});
