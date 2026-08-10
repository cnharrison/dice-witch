import { isAuthoredRenderViewV4 } from "./authored-views";
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
} from "./registries";
import { rendererRevisionPolicyV4 } from "./renderer-revision";
import { multiplyQuaternionsV4 } from "./geometry-math";
import type {
  AppearanceTargetV4,
  PolyhedralFormV4,
  RenderDieV4,
  RendererRevisionV4,
  RenderFormV4,
  RenderTextureV4,
} from "./types";

export const CAMERA_ELEVATION_DEGREES_R16_V4 = 40;
export const CAMERA_AZIMUTH_OFFSETS_R16_V4 = Object.freeze([
  -20, -10, 0, 10, 20,
] as const);
export const D4_POSE_AZIMUTHS_R16_V4 = Object.freeze([0, 120, 240] as const);
export const CAMERA_AZIMUTH_OFFSETS_R17_V4 = Object.freeze([
  -45, -35, -25, -15, -5, 5, 15, 25, 35, 45,
] as const);
export const POSE_AZIMUTHS_R17_V4 = Object.freeze([
  0, 36, 72, 108, 144, 180, 216, 252, 288, 324,
] as const);
export const SPHERE_ROTATIONS_R17_V4 = POSE_AZIMUTHS_R17_V4;
export const SPHERE_LABEL_PRESETS_R18_V4 = Object.freeze([
  { longitudeDegrees: -60, latitudeDegrees: -35, rotationDegrees: 0 },
  { longitudeDegrees: -45, latitudeDegrees: 25, rotationDegrees: 36 },
  { longitudeDegrees: -30, latitudeDegrees: -10, rotationDegrees: 72 },
  { longitudeDegrees: -15, latitudeDegrees: 40, rotationDegrees: 108 },
  { longitudeDegrees: -5, latitudeDegrees: -30, rotationDegrees: 144 },
  { longitudeDegrees: 10, latitudeDegrees: 15, rotationDegrees: 180 },
  { longitudeDegrees: 25, latitudeDegrees: -40, rotationDegrees: 216 },
  { longitudeDegrees: 40, latitudeDegrees: 35, rotationDegrees: 252 },
  { longitudeDegrees: 55, latitudeDegrees: -15, rotationDegrees: 288 },
  { longitudeDegrees: 65, latitudeDegrees: 10, rotationDegrees: 324 },
] as const);

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
  labelMapping?: "local-frame-r19";
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

export type RenderGeometrySelectionV4 = Pick<
  RenderDieV4,
  "target" | "form" | "result" | "view"
>;

export function getRenderGeometryIdV4(
  rendererRevision: RendererRevisionV4,
  die: Pick<RenderDieV4, "target" | "form">,
): GeometryIdV4 {
  const policy = rendererRevisionPolicyV4(rendererRevision);
  const geometryId = getGeometryIdV4(die.target, die.form);
  return policy.d20Geometry === "r2" && geometryId === "d20-standard-r1"
    ? "d20-standard-r2"
    : geometryId;
}

export function getRenderTexturePlacementV4(
  die: RenderDieV4,
): RenderTextureV4 {
  const placement = die.appearance.texture;
  if (die.view?.kind !== "sphere-surface") return placement;
  return {
    ...placement,
    rotation: (placement.rotation + die.view.rotationDegrees + 360) % 360,
  };
}

export function getRenderGeometryDescriptorV4(
  rendererRevision: RendererRevisionV4,
  die: RenderGeometrySelectionV4,
): GeometryDescriptorV4 {
  const descriptor = getCanonicalGeometryDescriptorV4(
    getRenderGeometryIdV4(rendererRevision, die),
  );
  const revisionPolicy = rendererRevisionPolicyV4(rendererRevision);
  const cameraAngles = revisionPolicy.cameraAngles;
  if (cameraAngles === "legacy") return descriptor;
  if (die.view?.kind === "sphere-surface" && descriptor.kind === "sphere") {
    if (cameraAngles === "presets-r16") return descriptor;
    if (cameraAngles === "presets-r17") {
      const radians = (die.view.rotationDegrees * Math.PI) / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const rotate = ([x, y, z]: Point3V4): Point3V4 => [
        x * cosine - y * sine,
        x * sine + y * cosine,
        z,
      ];
      return {
        ...descriptor,
        labelFrame: {
          ...descriptor.labelFrame,
          right: rotate(descriptor.labelFrame.right),
          up: rotate(descriptor.labelFrame.up),
        },
      };
    }
    const {
      labelLongitudeDegrees,
      labelLatitudeDegrees,
      labelRotationDegrees,
    } = die.view;
    if (
      labelLongitudeDegrees === undefined ||
      labelLatitudeDegrees === undefined ||
      labelRotationDegrees === undefined
    ) {
      throw new Error("Sphere label orientation is missing");
    }
    const longitude = (labelLongitudeDegrees * Math.PI) / 180;
    const latitude = (labelLatitudeDegrees * Math.PI) / 180;
    const rotation = (labelRotationDegrees * Math.PI) / 180;
    const normal: Point3V4 = [
      Math.sin(longitude) * Math.cos(latitude),
      Math.sin(latitude),
      Math.cos(longitude) * Math.cos(latitude),
    ];
    const tangentRight: Point3V4 = [
      Math.cos(longitude),
      0,
      -Math.sin(longitude),
    ];
    const tangentUp: Point3V4 = [
      -Math.sin(latitude) * Math.sin(longitude),
      Math.cos(latitude),
      -Math.sin(latitude) * Math.cos(longitude),
    ];
    const combineTangents = (
      first: Point3V4,
      firstScale: number,
      second: Point3V4,
      secondScale: number,
    ): Point3V4 => [
      first[0] * firstScale + second[0] * secondScale,
      first[1] * firstScale + second[1] * secondScale,
      first[2] * firstScale + second[2] * secondScale,
    ];
    return {
      ...descriptor,
      ...(revisionPolicy.sphereLabelMapping === "local-frame-r19"
        ? { labelMapping: "local-frame-r19" as const }
        : {}),
      labelFrame: {
        ...descriptor.labelFrame,
        origin: normal,
        right: combineTangents(
          tangentRight,
          Math.cos(rotation),
          tangentUp,
          Math.sin(rotation),
        ),
        up: combineTangents(
          tangentUp,
          Math.cos(rotation),
          tangentRight,
          -Math.sin(rotation),
        ),
      },
    };
  }
  if (
    (die.view?.kind !== "camera" && die.view?.kind !== "oriented-camera") ||
    descriptor.kind !== "polyhedral"
  ) {
    return descriptor;
  }
  if (
    die.view.kind === "oriented-camera" &&
    (!revisionPolicy.resolvedViews ||
      !isAuthoredRenderViewV4(rendererRevision, die.view, die))
  ) {
    throw new Error("Resolved render view is not supported by this revision");
  }
  const [x, y, z] = descriptor.camera.position;
  const radius = Math.hypot(x, y, z);
  const baseAzimuth = Math.atan2(x, z);
  const azimuth =
    baseAzimuth + (die.view.azimuthOffsetDegrees * Math.PI) / 180;
  const elevation = (die.view.elevationDegrees * Math.PI) / 180;
  const horizontal = radius * Math.cos(elevation);
  const position: Point3V4 = [
    horizontal * Math.sin(azimuth),
    radius * Math.sin(elevation),
    horizontal * Math.cos(azimuth),
  ];
  const camera = {
    ...descriptor.camera,
    position,
    ...(revisionPolicy.fudgeCameraInset && die.target === "fudge"
      ? { orthographicHeight: descriptor.camera.orthographicHeight * 1.03 }
      : {}),
  };
  if (die.view.kind === "oriented-camera") {
    const { resultRotation } = die.view;
    return {
      ...descriptor,
      resultOrientations: descriptor.resultOrientations.map((orientation) =>
        orientation.result === die.result
          ? { result: orientation.result, rotation: resultRotation }
          : orientation,
      ),
      camera,
    };
  }
  const poseRadians = (die.view.poseAzimuthDegrees * Math.PI) / 180;
  const poseRotation: QuaternionV4 = [
    0,
    Math.sin(poseRadians / 2),
    0,
    Math.cos(poseRadians / 2),
  ];
  return {
    ...descriptor,
    ...((cameraAngles === "presets-r16" ? die.target === "d4" : true)
      ? {
          resultOrientations: descriptor.resultOrientations.map(
            ({ result, rotation }) => ({
              result,
              rotation: multiplyQuaternionsV4(poseRotation, rotation),
            }),
          ),
        }
      : {}),
    camera,
  };
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
