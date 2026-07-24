import {
  parsePublicRenderModelV4,
  type RenderDieV4,
} from "@dice-witch/dice-v4-model";
import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  OrthographicCamera,
} from "three";
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/d20-r3.json";
import type { ThreeDiceResourcesV4 } from "./dice-resources";
import { createThreeDiceGridLayoutV4 } from "./grid-layout";
import {
  disposeThreeDiceGridResourcesV4,
  type ThreeDiceGridResourcesV4,
} from "./grid-resources";
import { createThreeLightingResourcesV4 } from "./lighting";
import { createThreeModifierIconResourcesV4 } from "./modifier-icons";

const sourceDie = parsePublicRenderModelV4(fixture).groups[0]?.[0];
if (sourceDie === undefined) throw new Error("Grid-resource fixture is empty");

function diceResources(): ThreeDiceResourcesV4 {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  return {
    group: new Group(),
    geometries: [geometry],
    materials: [new MeshBasicMaterial()],
    textures: [new DataTexture(new Uint8Array(16), 2, 2)],
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

function iconDie(): RenderDieV4 {
  return { ...sourceDie, icons: ["unique"] };
}

describe("V4 Three.js grid resource ownership", () => {
  it("tears down shared dice, lighting, and icon resources idempotently", () => {
    const die = iconDie();
    const layout = createThreeDiceGridLayoutV4(
      [[die]],
      ({ icons }) => icons,
    );
    const cell = layout.rows[0]?.cells[0];
    if (cell === undefined) throw new Error("Grid-resource cell is missing");
    const asset = diceResources();
    const lighting = createThreeLightingResourcesV4(
      die.appearance.lighting,
      die.appearance.material.family,
    );
    const modifierIcons = createThreeModifierIconResourcesV4(
      layout,
      { width: 660, height: 66 } as HTMLCanvasElement,
    );
    if (modifierIcons === null) {
      throw new Error("Grid modifier-icon resources are missing");
    }
    const entryGroup = new Group();
    new Group().add(entryGroup);
    const resources: ThreeDiceGridResourcesV4 = {
      layout,
      entries: [
        {
          cell,
          group: entryGroup,
          camera: new OrthographicCamera(),
          lighting,
        },
      ],
      assets: [asset],
      lighting: [lighting],
      modifierIcons,
    };
    const geometryDispose = vi.spyOn(asset.geometries[0]!, "dispose");
    const materialDispose = vi.spyOn(asset.materials[0]!, "dispose");
    const textureDispose = vi.spyOn(asset.textures[0]!, "dispose");
    const iconDispose = vi.spyOn(modifierIcons.texture, "dispose");
    const lightDisposals = lighting.directionalLights.map((light) =>
      vi.spyOn(light, "dispose"),
    );

    disposeThreeDiceGridResourcesV4(resources);
    disposeThreeDiceGridResourcesV4(resources);

    expect(resources.entries).toEqual([]);
    expect(resources.assets).toEqual([]);
    expect(resources.lighting).toEqual([]);
    expect(resources.modifierIcons).toBeNull();
    expect(entryGroup.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(iconDispose).toHaveBeenCalledOnce();
    lightDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
