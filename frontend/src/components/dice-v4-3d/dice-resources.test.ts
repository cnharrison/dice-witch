// @vitest-environment jsdom

import {
  D10_STANDARD_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_R2_V4,
  SOURCE_TEXTURE_SIZE_V4,
  parsePublicRenderModelV4,
  type RenderDieV4,
  type TextureRasterV4,
} from "@dice-witch/dice-v4-model";
import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  MeshBasicMaterial,
  Uint16BufferAttribute,
} from "three";
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/d20-r3.json";
import {
  createFaceAtlasLayoutV4,
  createPhysicalLabelAtlasSourceV4,
  createSphericalLabelAtlasSourceV4,
  createTileClippedPhysicalLabelAtlasSourceV4,
} from "./face-atlas";
import {
  cloneThreeDiceGroupV4,
  createThreeDiceResourcesV4,
  disposeThreeDiceResourcesV4,
  measureThreeDiceResourceOwnershipV4,
  prepareThreeDiceV4,
  prepareThreeDiceWithLabelAtlasPortV4,
  type ThreeDiceLabelAtlasSourcePortV4,
  type ThreeDiceResourcesV4,
} from "./dice-resources";

const sourceDie = parsePublicRenderModelV4(fixture).groups[0]?.[0];
if (sourceDie === undefined) throw new Error("Dice-resource fixture is empty");

const createPhysicalLabelAtlas = vi.fn<typeof createPhysicalLabelAtlasSourceV4>(
  (physical) => ({
    canvas: document.createElement("canvas"),
    geometryId: physical.geometryId,
    result: physical.result,
    labelCount: physical.labels.length,
    minimumVisibleLabelGapPixelsAt150: 1,
    minimumVisibleLabelFontScale: 1,
    resultLabelFontScale: 1,
  }),
);
const labelAtlas = {
  createPhysical: createPhysicalLabelAtlas,
  createTileClippedPhysical: createTileClippedPhysicalLabelAtlasSourceV4,
  createSpherical: createSphericalLabelAtlasSourceV4,
} satisfies ThreeDiceLabelAtlasSourcePortV4;

function prepareWithLabelAtlas(
  ...args: Parameters<typeof prepareThreeDiceV4>
) {
  const [descriptor, die, fontFamily, policy, revision, raster] = args;
  return prepareThreeDiceWithLabelAtlasPortV4(
    descriptor,
    die,
    fontFamily,
    policy,
    labelAtlas,
    revision,
    raster,
  );
}

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
  it("passes percentile ones labels only to d100 component atlases", () => {
    const native: RenderDieV4 = {
      ...sourceDie,
      target: "d10",
      result: 10,
      form: "standard",
    };
    const percentileOnes: RenderDieV4 = {
      ...native,
      faceLabelSet: "percentile-ones",
    };

    prepareWithLabelAtlas(
      D10_STANDARD_GEOMETRY_V4,
      percentileOnes,
      "Liberation Sans",
      "full-atlas",
      "canvaskit-v4-r19",
    );
    expect(createPhysicalLabelAtlas.mock.calls.at(-1)?.[7]).toBe(
      "percentile-ones",
    );

    prepareWithLabelAtlas(
      D10_STANDARD_GEOMETRY_V4,
      native,
      "Liberation Sans",
      "full-atlas",
      "canvaskit-v4-r19",
    );
    expect(createPhysicalLabelAtlas.mock.calls.at(-1)?.[7]).toBeUndefined();
  });

  it("protects a single locally low-contrast texel only in r31", () => {
    const pixels = new Uint8Array(
      SOURCE_TEXTURE_SIZE_V4 * SOURCE_TEXTURE_SIZE_V4 * 4,
    );
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = 255;
    }
    pixels[0] = 17;
    pixels[1] = 17;
    pixels[2] = 17;
    const contrastRaster: TextureRasterV4 = {
      version: 1,
      width: SOURCE_TEXTURE_SIZE_V4,
      height: SOURCE_TEXTURE_SIZE_V4,
      colorSpace: "srgb",
      alphaMode: "opaque",
      pixels,
    };

    prepareWithLabelAtlas(
      D10_STANDARD_GEOMETRY_V4,
      { ...sourceDie, target: "d10", result: 10 },
      "Liberation Sans",
      "full-atlas",
      "canvaskit-v4-r30",
      contrastRaster,
    );
    expect(createPhysicalLabelAtlas.mock.calls.at(-1)?.[6]).toBeNull();

    prepareWithLabelAtlas(
      D10_STANDARD_GEOMETRY_V4,
      { ...sourceDie, target: "d10", result: 10 },
      "Liberation Sans",
      "full-atlas",
      "canvaskit-v4-r31",
      contrastRaster,
    );
    expect(createPhysicalLabelAtlas.mock.calls.at(-1)?.[6]).toEqual({
      color: "#ffffff",
      opacity: 0.92,
      widthRatio: 0.05,
    });
  });

  it("uses stored outlines only for adaptive Three.js revisions", () => {
    const pixels = new Uint8Array(
      SOURCE_TEXTURE_SIZE_V4 * SOURCE_TEXTURE_SIZE_V4 * 4,
    );
    pixels.fill(255);
    const raster: TextureRasterV4 = {
      version: 1,
      width: SOURCE_TEXTURE_SIZE_V4,
      height: SOURCE_TEXTURE_SIZE_V4,
      colorSpace: "srgb",
      alphaMode: "opaque",
      pixels,
    };
    const die: RenderDieV4 = {
      ...sourceDie,
      appearance: { ...sourceDie.appearance, outlineColor: "#ffffff" },
    };
    const prepared = prepareWithLabelAtlas(
      D20_STANDARD_GEOMETRY_R2_V4,
      die,
      "Liberation Sans",
      "full-atlas",
      "canvaskit-v4-r39",
      raster,
    );
    if (prepared.kind !== "polyhedral") {
      throw new Error("Three.js outline test die is not polyhedral");
    }
    const atlasLayout = createFaceAtlasLayoutV4(prepared.physical.faces.length);
    prepared.labelAtlasSource.canvas.width = atlasLayout.width;
    prepared.labelAtlasSource.canvas.height = atlasLayout.height;
    const historical = createThreeDiceResourcesV4(
      prepared,
      die,
      raster,
      "canvaskit-v4-r38",
    );
    const adaptive = createThreeDiceResourcesV4(
      prepared,
      die,
      raster,
      "canvaskit-v4-r39",
    );
    const silhouette = createThreeDiceResourcesV4(
      prepared,
      die,
      raster,
      "canvaskit-v4-r40",
    );
    const nearBlackSolid = createThreeDiceResourcesV4(
      prepared,
      die,
      raster,
      "canvaskit-v4-r41",
    );
    const edgeColor = (resources: ThreeDiceResourcesV4): string => {
      const edge = resources.materials.find(
        (material): material is LineBasicMaterial =>
          material instanceof LineBasicMaterial,
      );
      if (edge === undefined) throw new Error("Three.js edge material is missing");
      return `#${edge.color.getHexString()}`;
    };

    expect(edgeColor(historical)).toBe("#000000");
    expect(edgeColor(adaptive)).toBe("#ffffff");
    expect(edgeColor(silhouette)).toBe("#ffffff");
    expect(edgeColor(nearBlackSolid)).toBe("#ffffff");

    disposeThreeDiceResourcesV4(historical);
    disposeThreeDiceResourcesV4(adaptive);
    disposeThreeDiceResourcesV4(silhouette);
  });

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
