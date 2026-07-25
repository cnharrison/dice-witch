import {
  modifierIconSizeV4,
  type PublicRenderModelV4,
  type RenderDieV4,
} from "@dice-witch/dice-v4-model";
import type { Group, OrthographicCamera } from "three";
import { createThreeOrthographicCameraV4 } from "./camera";
import {
  cloneThreeDiceGroupV4,
  createThreeDiceMaterialRasterV4,
  createThreeDiceResourcesV4,
  disposeThreeDiceResourcesV4,
  prepareThreeDiceV4,
  type ThreeDiceResourcesV4,
} from "./dice-resources";
import { loadBrowserFontV4 } from "./font-assets";
import { geometryDescriptorForDieV4 } from "./geometry";
import {
  createThreeDiceGridLayoutV4,
  type ThreeDiceGridCellV4,
  type ThreeDiceGridLayoutV4,
} from "./grid-layout";
import {
  createThreeLightingResourcesV4,
  disposeThreeLightingResourcesV4,
  type ThreeLightingResourcesV4,
} from "./lighting";
import { createMaterialRasterV4 } from "./texture";
import {
  createThreeModifierIconResourcesV4,
  disposeThreeModifierIconResourcesV4,
  prepareThreeModifierIconAtlasV4,
  type ThreeModifierIconResourcesV4,
} from "./modifier-icons";

type PreparedGridAssetV4 = {
  die: RenderDieV4;
  prepared: ReturnType<typeof prepareThreeDiceV4>;
  materialRaster: ReturnType<typeof createThreeDiceMaterialRasterV4>;
};

export type PreparedThreeDiceGridV4 = {
  rendererRevision: PublicRenderModelV4["rendererRevision"];
  layout: ThreeDiceGridLayoutV4<RenderDieV4>;
  assets: ReadonlyMap<string, PreparedGridAssetV4>;
  modifierIconAtlas: HTMLCanvasElement | null;
};

export type ThreeDiceGridRenderEntryV4 = {
  cell: ThreeDiceGridCellV4<RenderDieV4>;
  presentationViewport?: ThreeDiceGridCellV4<RenderDieV4>["viewport"];
  group: ReturnType<typeof cloneThreeDiceGroupV4>;
  camera: OrthographicCamera;
  lighting: ThreeLightingResourcesV4;
};

export type ThreeDiceGridResourcesV4 = {
  layout: ThreeDiceGridLayoutV4<RenderDieV4>;
  entries: ThreeDiceGridRenderEntryV4[];
  assets: ThreeDiceResourcesV4[];
  lighting: ThreeLightingResourcesV4[];
  modifierIcons: ThreeModifierIconResourcesV4 | null;
};

function diceAssetKeyV4(die: RenderDieV4): string {
  return JSON.stringify(die);
}

function sourceMaterialKeyV4(die: RenderDieV4): string {
  return JSON.stringify([
    die.appearance.material,
    die.appearance.palette,
    die.appearance.texture,
  ]);
}

function diceMaterialKeyV4(
  descriptorId: string,
  die: RenderDieV4,
): string {
  return `${descriptorId}|${sourceMaterialKeyV4(die)}`;
}

function lightingKeyV4(die: RenderDieV4): string {
  return JSON.stringify([
    die.appearance.material.family,
    die.appearance.lighting,
  ]);
}

export async function prepareThreeDiceGridV4(
  model: PublicRenderModelV4,
  maximumColumns?: number,
): Promise<PreparedThreeDiceGridV4> {
  const layout = createThreeDiceGridLayoutV4(
    model.groups,
    ({ icons }) => icons,
    maximumColumns,
    modifierIconSizeV4(model.rendererRevision),
  );
  const assets = new Map<string, PreparedGridAssetV4>();
  const sourceMaterialRasters = new Map<
    string,
    ReturnType<typeof createMaterialRasterV4>
  >();
  const materialRasters = new Map<
    string,
    ReturnType<typeof createThreeDiceMaterialRasterV4>
  >();
  const fonts = new Map<string, Promise<string>>();
  for (const row of layout.rows) {
    for (const { die } of row.cells) {
      const assetKey = diceAssetKeyV4(die);
      if (assets.has(assetKey)) continue;
      const descriptor = geometryDescriptorForDieV4(
        model.rendererRevision,
        die,
      );
      let font = fonts.get(die.appearance.engraving.fontId);
      if (font === undefined) {
        font = loadBrowserFontV4(die.appearance.engraving.fontId);
        fonts.set(die.appearance.engraving.fontId, font);
      }
      const sourceKey = sourceMaterialKeyV4(die);
      let sourceMaterialRaster = sourceMaterialRasters.get(sourceKey);
      if (sourceMaterialRaster === undefined) {
        sourceMaterialRaster = createMaterialRasterV4(
          die.appearance,
          model.rendererRevision,
        );
        sourceMaterialRasters.set(sourceKey, sourceMaterialRaster);
      }
      const materialKey = diceMaterialKeyV4(descriptor.id, die);
      let materialRaster = materialRasters.get(materialKey);
      if (materialRaster === undefined) {
        materialRaster = createThreeDiceMaterialRasterV4(
          descriptor,
          die,
          model.rendererRevision,
          sourceMaterialRaster,
        );
        materialRasters.set(materialKey, materialRaster);
      }
      assets.set(assetKey, {
        die,
        prepared: prepareThreeDiceV4(
          descriptor,
          die,
          await font,
          "tile-clipped",
          model.rendererRevision,
          sourceMaterialRaster,
        ),
        materialRaster,
      });
    }
  }
  return {
    rendererRevision: model.rendererRevision,
    layout,
    assets,
    modifierIconAtlas: prepareThreeModifierIconAtlasV4(
      layout,
      model.rendererRevision,
    ),
  };
}

export type CreateThreeDiceGridResourcesOptionsV4 = {
  reuseGroup?: (cell: ThreeDiceGridCellV4<RenderDieV4>) => Group | undefined;
};

export function createThreeDiceGridResourcesV4(
  preparation: PreparedThreeDiceGridV4,
  options: CreateThreeDiceGridResourcesOptionsV4 = {},
): ThreeDiceGridResourcesV4 {
  const entries: ThreeDiceGridRenderEntryV4[] = [];
  const assetCache = new Map<string, ThreeDiceResourcesV4>();
  const lightingCache = new Map<string, ThreeLightingResourcesV4>();
  const resources = {
    layout: preparation.layout,
    entries,
    assets: [],
    lighting: [],
    modifierIcons: null,
  } satisfies ThreeDiceGridResourcesV4;
  try {
    for (const row of preparation.layout.rows) {
      for (const cell of row.cells) {
        const assetKey = diceAssetKeyV4(cell.die);
        const preparedAsset = preparation.assets.get(assetKey);
        if (preparedAsset === undefined) {
          throw new Error("Three.js V4 grid prepared asset is missing");
        }
        let asset = assetCache.get(assetKey);
        if (asset === undefined) {
          asset = createThreeDiceResourcesV4(
            preparedAsset.prepared,
            preparedAsset.die,
            preparedAsset.materialRaster,
            preparation.rendererRevision,
          );
          assetCache.set(assetKey, asset);
          resources.assets.push(asset);
        }
        const lightingKey = lightingKeyV4(cell.die);
        let lighting = lightingCache.get(lightingKey);
        if (lighting === undefined) {
          lighting = createThreeLightingResourcesV4(
            cell.die.appearance.lighting,
            cell.die.appearance.material.family,
          );
          lightingCache.set(lightingKey, lighting);
          resources.lighting.push(lighting);
        }
        entries.push({
          cell,
          group: cloneThreeDiceGroupV4(asset, options.reuseGroup?.(cell)),
          camera: createThreeOrthographicCameraV4(
            preparedAsset.prepared.descriptor,
            1,
          ),
          lighting,
        });
      }
    }
    resources.modifierIcons = createThreeModifierIconResourcesV4(
      preparation.layout,
      preparation.modifierIconAtlas,
      preparation.rendererRevision,
    );
    return resources;
  } catch (error) {
    disposeThreeDiceGridResourcesV4(resources);
    throw error;
  }
}

export function disposeThreeDiceGridResourcesV4(
  resources: ThreeDiceGridResourcesV4,
): void {
  resources.entries.forEach(({ group }) => {
    group.removeFromParent();
    group.clear();
  });
  resources.entries.length = 0;
  disposeThreeModifierIconResourcesV4(resources.modifierIcons);
  resources.modifierIcons = null;
  resources.lighting.forEach(disposeThreeLightingResourcesV4);
  resources.lighting.length = 0;
  resources.assets.forEach(disposeThreeDiceResourcesV4);
  resources.assets.length = 0;
}
