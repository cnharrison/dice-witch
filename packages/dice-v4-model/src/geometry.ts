import { D10_STANDARD_GEOMETRY_V4, PERCENTILE_STANDARD_GEOMETRY_V4 } from "./geometry-d10";
import { D12_STANDARD_GEOMETRY_V4 } from "./geometry-d12";
import {
  D20_SHARP_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_R2_V4,
  D20_STANDARD_GEOMETRY_V4,
} from "./geometry-d20";
import { D20_CRYSTAL_CUT_GEOMETRY_V4 } from "./geometry-d20-crystal";
import { D20_HOLLOW_CAGE_GEOMETRY_V4 } from "./geometry-d20-hollow";
import { D4_STANDARD_GEOMETRY_V4 } from "./geometry-d4";
import { D6_STANDARD_GEOMETRY_V4 } from "./geometry-d6";
import { D8_STANDARD_GEOMETRY_V4 } from "./geometry-d8";
import { FUDGE_STANDARD_GEOMETRY_V4 } from "./geometry-fudge";
import { OTHER_SPHERE_GEOMETRY_V4 } from "./geometry-other";
import {
  APPEARANCE_TARGETS_V4,
  POLYHEDRAL_FORMS_V4,
  RENDERER_REVISIONS_V4,
} from "./registries";
import type {
  AppearanceTargetV4,
  PolyhedralFormV4,
  RenderDieV4,
  RendererRevisionV4,
  RenderFormV4,
} from "./types";

export type PolyhedralTargetV4 = Exclude<AppearanceTargetV4, "other">;
export type PolyhedralGeometryIdV4 =
  | `${PolyhedralTargetV4}-${PolyhedralFormV4}-r1`
  | "d20-standard-r2";
export type SphericalGeometryIdV4 = "other-sphere-r1";
export type GeometryIdV4 = PolyhedralGeometryIdV4 | SphericalGeometryIdV4;
export type Point2V4 = readonly [u: number, v: number];
export type Point3V4 = readonly [x: number, y: number, z: number];
export type QuaternionV4 = readonly [x: number, y: number, z: number, w: number];

export type GeometryCameraV4 = {
  position: Point3V4;
  target: Point3V4;
  up: Point3V4;
  orthographicHeight: number;
};

export type GeometryLabelPlacementV4 = {
  origin: Point3V4;
  right: Point3V4;
  up: Point3V4;
  maxWidth: number;
  maxHeight: number;
  opticalInset: number;
};

export type GeometryLabelFrameV4 = GeometryLabelPlacementV4 & {
  value: number;
  alignment: "surface" | "viewer-upright";
};

export type GeometryVertexV4 = {
  position: Point3V4;
};

export type GeometryFaceV4 = {
  id: string;
  normal: Point3V4;
  vertexIndices: readonly number[];
  skinCoordinates: readonly Point2V4[];
  labels: readonly GeometryLabelFrameV4[];
};

export type GeometryResultOrientationV4 = {
  result: number;
  rotation: QuaternionV4;
};

export type PolyhedralSkinMappingV4 =
  | { kind: "face-coordinates" }
  | {
      kind: "view-octahedral";
      subdivisions: number;
    };

export type PolyhedralGeometryDescriptorV4 = {
  version: 1;
  id: PolyhedralGeometryIdV4;
  kind: "polyhedral";
  target: PolyhedralTargetV4;
  form: PolyhedralFormV4;
  vertices: readonly GeometryVertexV4[];
  faces: readonly GeometryFaceV4[];
  skinMapping: PolyhedralSkinMappingV4;
  resultOrientations: readonly GeometryResultOrientationV4[];
  camera: GeometryCameraV4;
};

export type SphericalGeometryDescriptorV4 = {
  version: 1;
  id: SphericalGeometryIdV4;
  kind: "sphere";
  target: "other";
  form: "sphere";
  radius: number;
  skinMapping: "spherical-inverse-v1";
  labelFrame: GeometryLabelPlacementV4;
  camera: GeometryCameraV4;
};

export type GeometryDescriptorV4 =
  | PolyhedralGeometryDescriptorV4
  | SphericalGeometryDescriptorV4;

const POLYHEDRAL_TARGETS_V4 = APPEARANCE_TARGETS_V4.filter(
  (target): target is PolyhedralTargetV4 => target !== "other",
);

export const GEOMETRY_IDS_V4: readonly GeometryIdV4[] = Object.freeze([
  ...POLYHEDRAL_TARGETS_V4.flatMap((target) =>
    POLYHEDRAL_FORMS_V4.map(
      (form): PolyhedralGeometryIdV4 => `${target}-${form}-r1`,
    ),
  ),
  "d20-standard-r2",
  "other-sphere-r1",
]);

const CANONICAL_GEOMETRIES_V4 = new Map<GeometryIdV4, GeometryDescriptorV4>([
  [D4_STANDARD_GEOMETRY_V4.id, D4_STANDARD_GEOMETRY_V4],
  [D6_STANDARD_GEOMETRY_V4.id, D6_STANDARD_GEOMETRY_V4],
  [D8_STANDARD_GEOMETRY_V4.id, D8_STANDARD_GEOMETRY_V4],
  [D10_STANDARD_GEOMETRY_V4.id, D10_STANDARD_GEOMETRY_V4],
  [D12_STANDARD_GEOMETRY_V4.id, D12_STANDARD_GEOMETRY_V4],
  [PERCENTILE_STANDARD_GEOMETRY_V4.id, PERCENTILE_STANDARD_GEOMETRY_V4],
  [D20_STANDARD_GEOMETRY_V4.id, D20_STANDARD_GEOMETRY_V4],
  [D20_STANDARD_GEOMETRY_R2_V4.id, D20_STANDARD_GEOMETRY_R2_V4],
  [D20_SHARP_GEOMETRY_V4.id, D20_SHARP_GEOMETRY_V4],
  [D20_CRYSTAL_CUT_GEOMETRY_V4.id, D20_CRYSTAL_CUT_GEOMETRY_V4],
  [D20_HOLLOW_CAGE_GEOMETRY_V4.id, D20_HOLLOW_CAGE_GEOMETRY_V4],
  [FUDGE_STANDARD_GEOMETRY_V4.id, FUDGE_STANDARD_GEOMETRY_V4],
  [OTHER_SPHERE_GEOMETRY_V4.id, OTHER_SPHERE_GEOMETRY_V4],
]);

export const IMPLEMENTED_GEOMETRY_IDS_V4: readonly GeometryIdV4[] =
  Object.freeze([...CANONICAL_GEOMETRIES_V4.keys()]);

export function getCanonicalGeometryDescriptorV4(
  id: GeometryIdV4,
): GeometryDescriptorV4 {
  const descriptor = CANONICAL_GEOMETRIES_V4.get(id);
  if (descriptor === undefined) {
    throw new Error(`Geometry descriptor is not implemented: ${id}`);
  }
  return descriptor;
}

export function getGeometryIdV4(
  target: AppearanceTargetV4,
  form: RenderFormV4,
): GeometryIdV4 {
  if (target === "other") {
    if (form !== "sphere") {
      throw new Error("Other geometry form must be sphere");
    }
    return "other-sphere-r1";
  }
  if (form === "sphere") {
    throw new Error(`${target} geometry form must be polyhedral`);
  }
  return `${target}-${form}-r1`;
}

export type RenderGeometrySelectionV4 = Pick<RenderDieV4, "target" | "form">;

export function getRenderGeometryIdV4(
  rendererRevision: RendererRevisionV4,
  die: RenderGeometrySelectionV4,
): GeometryIdV4 {
  if (!RENDERER_REVISIONS_V4.includes(rendererRevision)) {
    throw new Error("Render request rendererRevision is not supported");
  }
  const geometryId = getGeometryIdV4(die.target, die.form);
  return (rendererRevision === "canvaskit-v4-r3" ||
    rendererRevision === "canvaskit-v4-r4" ||
    rendererRevision === "canvaskit-v4-r5" ||
    rendererRevision === "canvaskit-v4-r6" ||
    rendererRevision === "canvaskit-v4-r7") &&
    geometryId === "d20-standard-r1"
    ? "d20-standard-r2"
    : geometryId;
}

export function getRenderGeometryDescriptorV4(
  rendererRevision: RendererRevisionV4,
  die: RenderGeometrySelectionV4,
): GeometryDescriptorV4 {
  return getCanonicalGeometryDescriptorV4(
    getRenderGeometryIdV4(rendererRevision, die),
  );
}

export {
  D10_STANDARD_GEOMETRY_V4,
  D12_STANDARD_GEOMETRY_V4,
  D20_CRYSTAL_CUT_GEOMETRY_V4,
  D20_HOLLOW_CAGE_GEOMETRY_V4,
  D20_SHARP_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_R2_V4,
  D20_STANDARD_GEOMETRY_V4,
  D4_STANDARD_GEOMETRY_V4,
  D6_STANDARD_GEOMETRY_V4,
  D8_STANDARD_GEOMETRY_V4,
  FUDGE_STANDARD_GEOMETRY_V4,
  OTHER_SPHERE_GEOMETRY_V4,
  PERCENTILE_STANDARD_GEOMETRY_V4,
};
export {
  mapVisibleSpherePointV4,
  sphericalNormalFromSkinCoordinateV4,
  sphericalSkinCoordinateFromNormalV4,
  type SphereSurfacePointV4,
  type SphericalSkinSampleV4,
} from "./geometry-other";
