import {
  buildPhysicalPolyhedralMeshV4,
  getRenderTexturePlacementV4,
  projectPolyhedralGeometryV4,
  rendererRevisionPolicyV4,
  resolveEngravingContrastEdgeV4,
  usesProjectedTextureMappingV4,
  type CriticalTreatmentV4,
  type GeometryDescriptorV4,
  type PhysicalPolyhedralMeshV4,
  type PolyhedralGeometryDescriptorV4,
  type RenderDieV4,
  type RendererRevisionV4,
  type SphericalGeometryDescriptorV4,
  type TextureRasterV4,
} from "@dice-witch/dice-v4-model";
import * as z from "zod";
import {
  BackSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";
import { createThreeCriticalEffectResourcesV4 } from "./critical-effect";
import { createPhysicalEdgeGeometryV4 } from "./edge-geometry";
import {
  createPhysicalLabelAtlasResourcesFromSourceV4,
  createPhysicalLabelAtlasSourceV4,
  createSphericalLabelAtlasResourcesFromSourceV4,
  createTileClippedPhysicalLabelAtlasSourceV4,
  createSphericalLabelAtlasSourceV4,
  type PhysicalLabelAtlasSourceV4,
} from "./face-atlas";
import {
  createPhysicalPolyhedralGeometryV4,
  createSphericalGeometryV4,
} from "./geometry";
import { createThreeLocalSeparationMaterialV4 } from "./local-separation";
import {
  createThreeMaterialResourcesV4,
  type ThreeMaterialCostTierV4,
} from "./material";
import {
  createMaterialRasterV4,
  createPhysicalMaterialRasterV4,
  createRasterDataTextureV4,
} from "./texture";

export type ThreeDiceLabelAtlasPolicyV4 = "full-atlas" | "tile-clipped";

export type ThreeDiceLabelAtlasSourcePortV4 = {
  createPhysical: typeof createPhysicalLabelAtlasSourceV4;
  createTileClippedPhysical: typeof createTileClippedPhysicalLabelAtlasSourceV4;
  createSpherical: typeof createSphericalLabelAtlasSourceV4;
};

export type PreparedThreeDiceV4 =
  | {
      kind: "polyhedral";
      descriptor: PolyhedralGeometryDescriptorV4;
      physical: PhysicalPolyhedralMeshV4;
      labelAtlasSource: PhysicalLabelAtlasSourceV4;
    }
  | {
      kind: "sphere";
      descriptor: SphericalGeometryDescriptorV4;
      labelAtlasSource: PhysicalLabelAtlasSourceV4;
    };

export type ThreeDiceResourcesV4 = {
  group: Group;
  geometries: BufferGeometry[];
  materials: Material[];
  textures: Texture[];
  materialShader: "standard" | "physical";
  materialCostTier: ThreeMaterialCostTierV4;
  materialTransmission: number;
  localSeparation: boolean;
  criticalTreatment: CriticalTreatmentV4 | null;
  criticalState: "critical-success" | "critical-failure" | null;
  criticalObjects: number;
  minimumVisibleLabelGapPixelsAt150: number | null;
  minimumVisibleLabelFontScale: number | null;
  resultLabelFontScale: number | null;
  edgeSegments: number | null;
  disposed: boolean;
};

export type ThreeDiceResourceOwnershipV4 = {
  geometries: number;
  materials: number;
  textures: number;
  geometryBytes: number;
  textureBytes: number;
};

const resourceValueSchema = z.unknown();
type ResourceValue = z.input<typeof resourceValueSchema>;
const attributeArraySchema = z.object({
  array: z.object({ byteLength: z.number() }),
});

function geometryByteLengthV4(geometry: BufferGeometry): number {
  const arrays = new Set<object>();
  let bytes = 0;
  const appendAttribute = (attribute: ResourceValue): void => {
    const parsed = attributeArraySchema.safeParse(attribute);
    if (!parsed.success || arrays.has(parsed.data.array)) return;
    arrays.add(parsed.data.array);
    bytes += parsed.data.array.byteLength;
  };
  Object.values(geometry.attributes).forEach(appendAttribute);
  Object.values(geometry.morphAttributes)
    .flat()
    .forEach(appendAttribute);
  appendAttribute(geometry.getIndex());
  return bytes;
}

function textureByteLengthV4(texture: Texture): number {
  const dataImage = z.object({
    data: z.object({ byteLength: z.number() }),
  }).safeParse(texture.image);
  if (dataImage.success) return dataImage.data.data.byteLength;
  const sizedImage = z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).safeParse(texture.image);
  return sizedImage.success
    ? sizedImage.data.width * sizedImage.data.height * 4
    : 0;
}

export function measureThreeDiceResourceOwnershipV4(
  resources: readonly ThreeDiceResourcesV4[],
): ThreeDiceResourceOwnershipV4 {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  for (const resource of resources) {
    resource.geometries.forEach((geometry) => geometries.add(geometry));
    resource.materials.forEach((material) => materials.add(material));
    resource.textures.forEach((texture) => textures.add(texture));
  }
  return {
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
    geometryBytes: [...geometries].reduce(
      (total, geometry) => total + geometryByteLengthV4(geometry),
      0,
    ),
    textureBytes: [...textures].reduce(
      (total, texture) => total + textureByteLengthV4(texture),
      0,
    ),
  };
}

export function createThreeDiceMaterialRasterV4(
  descriptor: GeometryDescriptorV4,
  die: RenderDieV4,
  rendererRevision?: RendererRevisionV4,
  source?: TextureRasterV4,
): TextureRasterV4 {
  if (descriptor.kind === "polyhedral") {
    return createPhysicalMaterialRasterV4(
      die.appearance,
      descriptor,
      rendererRevision,
      source,
    );
  }
  return source ?? createMaterialRasterV4(die.appearance, rendererRevision);
}

export function prepareThreeDiceWithLabelAtlasPortV4(
  descriptor: GeometryDescriptorV4,
  die: RenderDieV4,
  fontFamily: string,
  labelAtlasPolicy: ThreeDiceLabelAtlasPolicyV4,
  labelAtlas: ThreeDiceLabelAtlasSourcePortV4,
  rendererRevision?: RendererRevisionV4,
  contrastRaster?: TextureRasterV4,
): PreparedThreeDiceV4 {
  if (
    labelAtlasPolicy !== "full-atlas" &&
    labelAtlasPolicy !== "tile-clipped"
  ) {
    throw new Error("Three.js V4 label atlas policy is not implemented");
  }
  const revisionPolicy = rendererRevision === undefined
    ? null
    : rendererRevisionPolicyV4(rendererRevision);
  const contrastEdge =
    revisionPolicy === null || revisionPolicy.engravingContrastEdge === false
      ? null
      : resolveEngravingContrastEdgeV4(
          die.appearance,
          contrastRaster ??
            createMaterialRasterV4(die.appearance, rendererRevision),
          die.target === "d4",
          revisionPolicy.engravingContrastEdge === "protective-r31",
        );
  if (descriptor.kind === "sphere") {
    return {
      kind: "sphere",
      descriptor,
      labelAtlasSource: labelAtlas.createSpherical(
        descriptor,
        die.result,
        die.appearance,
        fontFamily,
        rendererRevision,
        contrastEdge,
      ),
    };
  }
  const physical = buildPhysicalPolyhedralMeshV4(descriptor, die.result);
  const createLabelAtlas =
    labelAtlasPolicy === "tile-clipped"
      ? labelAtlas.createTileClippedPhysical
      : labelAtlas.createPhysical;
  return {
    kind: "polyhedral",
    descriptor,
    physical,
    labelAtlasSource: createLabelAtlas(
      physical,
      projectPolyhedralGeometryV4(descriptor, die.result),
      descriptor.camera,
      die.appearance,
      fontFamily,
      rendererRevision,
      contrastEdge,
      die.target === "d10" ? die.faceLabelSet : undefined,
    ),
  };
}

const productionThreeDiceLabelAtlasSourcePortV4 = {
  createPhysical: createPhysicalLabelAtlasSourceV4,
  createTileClippedPhysical: createTileClippedPhysicalLabelAtlasSourceV4,
  createSpherical: createSphericalLabelAtlasSourceV4,
} satisfies ThreeDiceLabelAtlasSourcePortV4;

export function prepareThreeDiceV4(
  descriptor: GeometryDescriptorV4,
  die: RenderDieV4,
  fontFamily: string,
  labelAtlasPolicy: ThreeDiceLabelAtlasPolicyV4,
  rendererRevision?: RendererRevisionV4,
  contrastRaster?: TextureRasterV4,
): PreparedThreeDiceV4 {
  return prepareThreeDiceWithLabelAtlasPortV4(
    descriptor,
    die,
    fontFamily,
    labelAtlasPolicy,
    productionThreeDiceLabelAtlasSourcePortV4,
    rendererRevision,
    contrastRaster,
  );
}

export function createThreeDiceResourcesV4(
  prepared: PreparedThreeDiceV4,
  die: RenderDieV4,
  materialRaster: TextureRasterV4,
  rendererRevision?: RendererRevisionV4,
): ThreeDiceResourcesV4 {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const textures: Texture[] = [];
  const revisionPolicy = rendererRevision === undefined
    ? null
    : rendererRevisionPolicyV4(rendererRevision);
  const outlineColor =
    revisionPolicy !== null &&
      revisionPolicy.outlineContrast !== "black" &&
      prepared.kind === "polyhedral" &&
      prepared.physical.form !== "hollow-cage"
      ? die.appearance.outlineColor
      : "#000000";
  try {
    const { descriptor } = prepared;
    const materialTexture = createRasterDataTextureV4(
      materialRaster,
      `dice-v4-${descriptor.id}-${die.appearance.texture.generatorId}-${die.appearance.texture.seed}`,
    );
    textures.push(materialTexture);
    const baseGeometry =
      prepared.kind === "polyhedral"
        ? createPhysicalPolyhedralGeometryV4(
            descriptor,
            die.result,
            die.appearance.texture,
            rendererRevision !== undefined &&
              usesProjectedTextureMappingV4(
                rendererRevision,
                die.appearance,
              )
              ? "projected-texture"
              : "authored",
          )
        : createSphericalGeometryV4(
            descriptor,
            getRenderTexturePlacementV4(die),
          );
    geometries.push(baseGeometry);
    const labelAtlas =
      prepared.kind === "polyhedral"
        ? createPhysicalLabelAtlasResourcesFromSourceV4(
            prepared.physical,
            prepared.labelAtlasSource,
          )
        : createSphericalLabelAtlasResourcesFromSourceV4(
            descriptor,
            die.result,
            prepared.labelAtlasSource,
          );
    geometries.push(labelAtlas.geometry);
    textures.push(labelAtlas.texture);

    const { material: baseMaterial, policy } = createThreeMaterialResourcesV4(
      die.appearance,
      materialTexture,
      rendererRevision,
    );
    materials.push(baseMaterial);
    const labelMaterial = new MeshBasicMaterial({
      alphaTest: 0.02,
      map: labelAtlas.texture,
      transparent: true,
      depthWrite: false,
    });
    labelMaterial.toneMapped = false;
    materials.push(labelMaterial);

    const group = new Group();
    group.name = `authoritative-${die.target}-result`;
    const base = new Mesh(baseGeometry, baseMaterial);
    if (
      prepared.kind === "sphere" &&
      revisionPolicy?.sphereOutline === true
    ) {
      const outlineMaterial = new MeshBasicMaterial({
        color: outlineColor,
        side: BackSide,
      });
      materials.push(outlineMaterial);
      const outline = new Mesh(baseGeometry, outlineMaterial);
      outline.name = "dice-v4-sphere-outline";
      outline.scale.setScalar(1.012);
      outline.renderOrder = -1;
      group.add(outline);
    }
    group.add(base);
    const separationMaterial =
      createThreeLocalSeparationMaterialV4(die.appearance);
    if (separationMaterial !== null) {
      materials.push(separationMaterial);
      const separation = new Mesh(baseGeometry, separationMaterial);
      separation.name = "dice-v4-local-separation";
      separation.renderOrder = 0.5;
      group.add(separation);
    }
    const labels = new Mesh(labelAtlas.geometry, labelMaterial);
    labels.name = "dice-v4-labels";
    labels.renderOrder = 1;
    group.add(labels);
    let edgeMaterial: LineBasicMaterial | null = null;
    let edgeSegments: number | null = null;
    if (prepared.kind === "polyhedral") {
      const edgeResources = createPhysicalEdgeGeometryV4(
        baseGeometry,
        prepared.physical,
      );
      const { geometry: edgeGeometry, vertexColors } = edgeResources;
      geometries.push(edgeGeometry);
      edgeSegments = edgeGeometry.getAttribute("position").count / 2;
      edgeMaterial = new LineBasicMaterial({
        color: vertexColors ? 0xff_ff_ff : outlineColor,
        transparent: true,
        opacity: revisionPolicy?.strongPhysicalEdges === true ? 0.82 : 0.64,
        vertexColors,
      });
      materials.push(edgeMaterial);
      const edges = new LineSegments(edgeGeometry, edgeMaterial);
      edges.renderOrder = 2;
      group.add(edges);
    }
    const critical = createThreeCriticalEffectResourcesV4(
      {
        base: baseGeometry,
        labels: labelAtlas.geometry,
        labelTexture: labelAtlas.texture,
        edgeMaterial,
      },
      die.appearance.effect,
    );
    materials.push(...critical.materials);
    if (critical.group.children.length > 0) group.add(critical.group);
    return {
      group,
      geometries,
      materials,
      textures,
      materialShader: policy.shader,
      materialCostTier: policy.costTier,
      materialTransmission: policy.transmission,
      localSeparation: separationMaterial !== null,
      criticalTreatment: critical.treatment,
      criticalState: critical.state,
      criticalObjects: critical.objectCount,
      minimumVisibleLabelGapPixelsAt150:
        prepared.kind === "polyhedral"
          ? labelAtlas.minimumVisibleLabelGapPixelsAt150
          : null,
      minimumVisibleLabelFontScale:
        prepared.kind === "polyhedral"
          ? labelAtlas.minimumVisibleLabelFontScale
          : null,
      resultLabelFontScale:
        prepared.kind === "polyhedral"
          ? labelAtlas.resultLabelFontScale
          : null,
      edgeSegments,
      disposed: false,
    };
  } catch (error) {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    throw error;
  }
}

export function cloneThreeDiceGroupV4(
  resources: ThreeDiceResourcesV4,
  existing?: Group,
): Group {
  if (resources.disposed) {
    throw new Error("Three.js V4 dice resources are disposed");
  }
  if (existing === undefined) return resources.group.clone(true);
  if (existing.children.length > 0) {
    throw new Error("Three.js V4 reusable dice group must be empty");
  }
  resources.group.children.forEach((child) => existing.add(child.clone(true)));
  return existing;
}

export function disposeThreeDiceResourcesV4(
  resources: ThreeDiceResourcesV4,
): void {
  if (resources.disposed) return;
  resources.disposed = true;
  resources.group.removeFromParent();
  resources.geometries.forEach((geometry) => geometry.dispose());
  resources.materials.forEach((material) => material.dispose());
  resources.textures.forEach((texture) => texture.dispose());
}
