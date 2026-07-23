import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Uint16BufferAttribute,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  cloneThreeDiceGroupV4,
  disposeThreeDiceResourcesV4,
  measureThreeDiceResourceOwnershipV4,
  type ThreeDiceResourcesV4,
} from "./dice-resources";

function createResources(): ThreeDiceResourcesV4 {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3),
  );
  geometry.setIndex(new Uint16BufferAttribute([0, 1], 1));
  const texture = new DataTexture(new Uint8Array(16), 2, 2);
  return {
    group: new Group(),
    geometries: [geometry],
    materials: [new MeshBasicMaterial()],
    textures: [texture],
    materialShader: "standard",
    materialCostTier: "baseline",
    materialTransmission: 0,
    localSeparation: false,
    criticalTreatment: null,
    criticalState: null,
    criticalObjects: 0,
    minimumVisibleLabelGapPixelsAt150: 0.75,
    minimumVisibleLabelFontScale: 1,
    resultLabelFontScale: 1,
    edgeSegments: 1,
    disposed: false,
  };
}

describe("V4 Three.js dice resource ownership", () => {
  it("counts unique owned resources and their deterministic source bytes", () => {
    const resources = createResources();

    expect(
      measureThreeDiceResourceOwnershipV4([resources, resources]),
    ).toEqual({
      geometries: 1,
      materials: 1,
      textures: 1,
      geometryBytes: 28,
      textureBytes: 16,
    });

    disposeThreeDiceResourcesV4(resources);
  });

  it("clones scene objects while sharing owned GPU resources", () => {
    const resources = createResources();
    resources.group.add(new Group());

    const clone = cloneThreeDiceGroupV4(resources);

    expect(clone).not.toBe(resources.group);
    expect(clone.children).toHaveLength(1);
    disposeThreeDiceResourcesV4(resources);
    expect(() => cloneThreeDiceGroupV4(resources)).toThrow(
      "Three.js V4 dice resources are disposed",
    );
  });

  it("populates an existing empty identity group without replacing its transform", () => {
    const resources = createResources();
    resources.group.add(new Group());
    const existing = new Group();
    existing.position.set(11, 22, 33);
    existing.rotation.set(0.1, 0.2, 0.3);

    const clone = cloneThreeDiceGroupV4(resources, existing);

    expect(clone).toBe(existing);
    expect(clone.children).toHaveLength(1);
    expect(clone.position.toArray()).toEqual([11, 22, 33]);
    expect(clone.rotation.toArray().slice(0, 3)).toEqual([0.1, 0.2, 0.3]);
    disposeThreeDiceResourcesV4(resources);
  });

  it("disposes each owned resource exactly once", () => {
    const resources = createResources();
    const geometryDispose = vi.spyOn(resources.geometries[0]!, "dispose");
    const materialDispose = vi.spyOn(resources.materials[0]!, "dispose");
    const textureDispose = vi.spyOn(resources.textures[0]!, "dispose");

    disposeThreeDiceResourcesV4(resources);
    disposeThreeDiceResourcesV4(resources);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(resources.disposed).toBe(true);
  });
});
