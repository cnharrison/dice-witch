import { D10_STANDARD_GEOMETRY_V4, PERCENTILE_STANDARD_GEOMETRY_V4 } from "./geometry-d10";
import { D12_STANDARD_GEOMETRY_V4 } from "./geometry-d12";
import { D20_STANDARD_GEOMETRY_R2_V4 } from "./geometry-d20";
import { D4_STANDARD_GEOMETRY_V4 } from "./geometry-d4";
import { D6_STANDARD_GEOMETRY_V4 } from "./geometry-d6";
import { D8_STANDARD_GEOMETRY_V4 } from "./geometry-d8";
import { FUDGE_STANDARD_GEOMETRY_V4 } from "./geometry-fudge";
import type {
  GeometryFaceV4,
  PolyhedralGeometryDescriptorV4,
  QuaternionV4,
} from "./geometry";
import {
  multiplyQuaternionsV4,
  quaternionFromFrameV4,
  rotatePointByQuaternionV4,
} from "./geometry-math";
import type {
  RenderDieV4,
  RendererRevisionV4,
  RenderViewV4,
} from "./types";

export type AuthoredViewModeV4 = "legacy" | "clear";

type AuthoredRenderDieV4 = Pick<RenderDieV4, "form" | "result" | "target">;
type OrientedCameraViewV4 = Extract<
  RenderViewV4,
  { kind: "oriented-camera" }
>;
type RotationV4 = OrientedCameraViewV4["resultRotation"];
type PolyhedralViewEntryV4 = {
  views: Readonly<
    Record<AuthoredViewModeV4, ReadonlyMap<number, Readonly<OrientedCameraViewV4>>>
  >;
};

const D4_LEGACY_FACE_BY_RESULT_V4 = new Map<number, string>([
  [1, "face-opposite-2"],
  [2, "face-opposite-1"],
  [3, "face-opposite-4"],
  [4, "face-opposite-1"],
]);

function orientedCamera(
  mode: AuthoredViewModeV4,
  elevationDegrees: number,
  resultRotation: RotationV4,
  azimuthOffsetDegrees = 0,
): Readonly<OrientedCameraViewV4> {
  return Object.freeze({
    kind: "oriented-camera",
    mode,
    elevationDegrees,
    azimuthOffsetDegrees,
    resultRotation: Object.freeze(resultRotation),
  });
}

function resultOrientation(
  geometry: PolyhedralGeometryDescriptorV4,
  result: number,
): QuaternionV4 {
  const orientation = geometry.resultOrientations.find(
    (candidate) => candidate.result === result,
  );
  if (orientation === undefined) {
    throw new Error(`${geometry.id} result ${result} orientation is missing`);
  }
  return orientation.rotation;
}

function restingResultFace(
  geometry: PolyhedralGeometryDescriptorV4,
  result: number,
): GeometryFaceV4 {
  const rotation = resultOrientation(geometry, result);
  const face = geometry.faces
    .filter((candidate) =>
      candidate.labels.some((label) => label.value === result),
    )
    .sort(
      (left, right) =>
        rotatePointByQuaternionV4(right.normal, rotation)[1] -
        rotatePointByQuaternionV4(left.normal, rotation)[1],
    )[0];
  if (face === undefined) {
    throw new Error(`${geometry.id} result ${result} face is missing`);
  }
  return face;
}

function legacyResultRotation(
  geometry: PolyhedralGeometryDescriptorV4,
  result: number,
  faceId?: string,
): QuaternionV4 {
  const face =
    faceId === undefined
      ? restingResultFace(geometry, result)
      : geometry.faces.find((candidate) => candidate.id === faceId);
  const label = face?.labels.find((candidate) => candidate.value === result);
  if (face === undefined || label === undefined) {
    throw new Error(`${geometry.id} result ${result} Legacy frame is missing`);
  }
  return quaternionFromFrameV4(label.right, label.up, face.normal);
}

function clearResultRotation(
  geometry: PolyhedralGeometryDescriptorV4,
  result: number,
  faceId?: string,
): QuaternionV4 {
  const baseRotation = resultOrientation(geometry, result);
  const face =
    faceId === undefined
      ? restingResultFace(geometry, result)
      : geometry.faces.find((candidate) => candidate.id === faceId);
  if (face === undefined) {
    throw new Error(`${geometry.id} result ${result} Clear face is missing`);
  }
  const label = face.labels.find((candidate) => candidate.value === result);
  if (label === undefined) {
    throw new Error(`${geometry.id} result ${result} Clear frame is missing`);
  }
  const currentUp = rotatePointByQuaternionV4(label.up, baseRotation);
  const currentAngle = Math.atan2(currentUp[0], currentUp[2]);
  const cameraAzimuth = Math.atan2(
    geometry.camera.position[0],
    geometry.camera.position[2],
  );
  // Keep neighboring labels away from an edge-on singular projection.
  const desiredAngle = cameraAzimuth + Math.PI + (5 * Math.PI) / 180;
  const yaw = desiredAngle - currentAngle;
  const yawRotation: QuaternionV4 = [
    0,
    Math.sin(yaw / 2),
    0,
    Math.cos(yaw / 2),
  ];
  return multiplyQuaternionsV4(yawRotation, baseRotation);
}

function createPolyhedralEntry(
  geometry: PolyhedralGeometryDescriptorV4,
  results: readonly number[],
  clearElevationDegrees: number,
  legacyFaceByResult: ReadonlyMap<number, string> = new Map(),
): PolyhedralViewEntryV4 {
  const legacy = new Map<number, Readonly<OrientedCameraViewV4>>();
  const clear = new Map<number, Readonly<OrientedCameraViewV4>>();
  for (const result of results) {
    legacy.set(
      result,
      orientedCamera(
        "legacy",
        30,
        legacyResultRotation(
          geometry,
          result,
          legacyFaceByResult.get(result),
        ),
      ),
    );
    clear.set(
      result,
      orientedCamera(
        "clear",
        clearElevationDegrees,
        clearResultRotation(
          geometry,
          result,
          legacyFaceByResult.get(result),
        ),
      ),
    );
  }
  return Object.freeze({
    views: Object.freeze({ legacy, clear }),
  });
}

const range = (first: number, last: number): number[] =>
  Array.from({ length: last - first + 1 }, (_, index) => first + index);

const D20_RESULTS_V4 = range(1, 20);
const D20_VIEWS_V4 = createPolyhedralEntry(
  D20_STANDARD_GEOMETRY_R2_V4,
  D20_RESULTS_V4,
  55,
);
const POLYHEDRAL_VIEWS_R20_V4 = new Map<string, PolyhedralViewEntryV4>([
  [
    "d4:standard",
    createPolyhedralEntry(
      D4_STANDARD_GEOMETRY_V4,
      range(1, 4),
      30,
      D4_LEGACY_FACE_BY_RESULT_V4,
    ),
  ],
  ["d6:standard", createPolyhedralEntry(D6_STANDARD_GEOMETRY_V4, range(1, 6), 55)],
  ["d8:standard", createPolyhedralEntry(D8_STANDARD_GEOMETRY_V4, range(1, 8), 55)],
  ["d10:standard", createPolyhedralEntry(D10_STANDARD_GEOMETRY_V4, range(1, 10), 45)],
  ["d12:standard", createPolyhedralEntry(D12_STANDARD_GEOMETRY_V4, range(1, 12), 55)],
  ["d20:standard", D20_VIEWS_V4],
  ["d20:sharp", D20_VIEWS_V4],
  ["d20:crystal-cut", D20_VIEWS_V4],
  ["d20:hollow-cage", D20_VIEWS_V4],
  [
    "percentile:standard",
    createPolyhedralEntry(
      PERCENTILE_STANDARD_GEOMETRY_V4,
      range(0, 9).map((value) => value * 10),
      45,
    ),
  ],
  [
    "fudge:standard",
    createPolyhedralEntry(FUDGE_STANDARD_GEOMETRY_V4, [-1, 0, 1], 55),
  ],
]);

function withClearElevation(
  entry: PolyhedralViewEntryV4,
  elevationDegrees: number,
): PolyhedralViewEntryV4 {
  return Object.freeze({
    views: Object.freeze({
      legacy: entry.views.legacy,
      clear: new Map(
        [...entry.views.clear].map(([result, view]) => [
          result,
          orientedCamera("clear", elevationDegrees, view.resultRotation),
        ]),
      ),
    }),
  });
}

const D20_VIEWS_R21_V4 = withClearElevation(D20_VIEWS_V4, 85);
const POLYHEDRAL_VIEWS_R21_V4 = new Map(POLYHEDRAL_VIEWS_R20_V4);
for (const form of ["standard", "sharp", "crystal-cut", "hollow-cage"] as const) {
  POLYHEDRAL_VIEWS_R21_V4.set(`d20:${form}`, D20_VIEWS_R21_V4);
}

function withLegacyCamera(
  entry: PolyhedralViewEntryV4,
  elevationDegrees: number,
  azimuthOffsetDegrees: number,
): PolyhedralViewEntryV4 {
  return Object.freeze({
    views: Object.freeze({
      legacy: new Map(
        [...entry.views.legacy].map(([result, view]) => [
          result,
          orientedCamera(
            "legacy",
            elevationDegrees,
            view.resultRotation,
            azimuthOffsetDegrees,
          ),
        ]),
      ),
      clear: entry.views.clear,
    }),
  });
}

function withFrontFacingLegacyCamera(
  entry: PolyhedralViewEntryV4,
  geometry: PolyhedralGeometryDescriptorV4,
): PolyhedralViewEntryV4 {
  const [x, , z] = geometry.camera.position;
  const azimuthOffsetDegrees = -Math.round(
    (Math.atan2(x, z) * 180) / Math.PI,
  );
  return withLegacyCamera(entry, 1, azimuthOffsetDegrees);
}

const POLYHEDRAL_VIEWS_R22_V4 = new Map(POLYHEDRAL_VIEWS_R21_V4);
const LEGACY_FRONT_GEOMETRIES_V4 = [
  ["d4:standard", D4_STANDARD_GEOMETRY_V4],
  ["d6:standard", D6_STANDARD_GEOMETRY_V4],
  ["d8:standard", D8_STANDARD_GEOMETRY_V4],
  ["d10:standard", D10_STANDARD_GEOMETRY_V4],
  ["d12:standard", D12_STANDARD_GEOMETRY_V4],
  ["d20:standard", D20_STANDARD_GEOMETRY_R2_V4],
  ["d20:sharp", D20_STANDARD_GEOMETRY_R2_V4],
  ["d20:crystal-cut", D20_STANDARD_GEOMETRY_R2_V4],
  ["d20:hollow-cage", D20_STANDARD_GEOMETRY_R2_V4],
  ["percentile:standard", PERCENTILE_STANDARD_GEOMETRY_V4],
  ["fudge:standard", FUDGE_STANDARD_GEOMETRY_V4],
] as const;
for (const [key, geometry] of LEGACY_FRONT_GEOMETRIES_V4) {
  const entry = POLYHEDRAL_VIEWS_R22_V4.get(key);
  if (entry === undefined) {
    throw new Error(`Authored ${key} views are missing`);
  }
  POLYHEDRAL_VIEWS_R22_V4.set(
    key,
    withFrontFacingLegacyCamera(entry, geometry),
  );
}

const POLYHEDRAL_VIEWS_R23_V4 = new Map(POLYHEDRAL_VIEWS_R22_V4);
for (const key of ["d6:standard", "fudge:standard"] as const) {
  const r20 = POLYHEDRAL_VIEWS_R20_V4.get(key);
  const r22 = POLYHEDRAL_VIEWS_R22_V4.get(key);
  if (r20 === undefined || r22 === undefined) {
    throw new Error(`Authored ${key} views are missing`);
  }
  POLYHEDRAL_VIEWS_R23_V4.set(
    key,
    Object.freeze({
      views: Object.freeze({
        legacy: r20.views.legacy,
        clear: r22.views.clear,
      }),
    }),
  );
}

const POLYHEDRAL_VIEWS_R25_V4 = new Map(POLYHEDRAL_VIEWS_R23_V4);
for (const key of ["d6:standard", "fudge:standard"] as const) {
  const entry = POLYHEDRAL_VIEWS_R25_V4.get(key);
  if (entry === undefined) {
    throw new Error(`Authored ${key} views are missing`);
  }
  POLYHEDRAL_VIEWS_R25_V4.set(key, withLegacyCamera(entry, 12, -15));
}

function swapAuthoredModes(
  entry: PolyhedralViewEntryV4,
): PolyhedralViewEntryV4 {
  const remap = (
    mode: AuthoredViewModeV4,
    views: ReadonlyMap<number, Readonly<OrientedCameraViewV4>>,
  ) =>
    new Map(
      [...views].map(([result, view]) => [
        result,
        orientedCamera(
          mode,
          view.elevationDegrees,
          view.resultRotation,
          view.azimuthOffsetDegrees,
        ),
      ]),
    );
  return Object.freeze({
    views: Object.freeze({
      legacy: remap("legacy", entry.views.clear),
      clear: remap("clear", entry.views.legacy),
    }),
  });
}

const POLYHEDRAL_VIEWS_R29_V4 = new Map(POLYHEDRAL_VIEWS_R25_V4);
for (const key of ["d10:standard", "percentile:standard"] as const) {
  const entry = POLYHEDRAL_VIEWS_R29_V4.get(key);
  if (entry === undefined) {
    throw new Error(`Authored ${key} views are missing`);
  }
  POLYHEDRAL_VIEWS_R29_V4.set(key, swapAuthoredModes(entry));
}

const POLYHEDRAL_VIEWS_R30_V4 = new Map(POLYHEDRAL_VIEWS_R29_V4);
for (const target of [
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "percentile",
  "fudge",
] as const) {
  const entry = POLYHEDRAL_VIEWS_R30_V4.get(`${target}:standard`);
  if (entry === undefined) {
    throw new Error(`Authored ${target} standard views are missing`);
  }
  POLYHEDRAL_VIEWS_R30_V4.set(`${target}:crystal-cut`, entry);
  POLYHEDRAL_VIEWS_R30_V4.set(`${target}:hollow-cage`, entry);
}

const CENTERED_SPHERE_VIEW_V4 = Object.freeze({
  kind: "sphere-surface",
  rotationDegrees: 0,
  labelLongitudeDegrees: 0,
  labelLatitudeDegrees: 0,
  labelRotationDegrees: 0,
} satisfies RenderViewV4);

function polyhedralEntryKey(die: AuthoredRenderDieV4): string {
  return `${die.target}:${die.form}`;
}

function authoredPolyhedralViews(
  rendererRevision: RendererRevisionV4,
): ReadonlyMap<string, PolyhedralViewEntryV4> {
  if (rendererRevision === "canvaskit-v4-r20") {
    return POLYHEDRAL_VIEWS_R20_V4;
  }
  if (rendererRevision === "canvaskit-v4-r21") {
    return POLYHEDRAL_VIEWS_R21_V4;
  }
  if (rendererRevision === "canvaskit-v4-r22") {
    return POLYHEDRAL_VIEWS_R22_V4;
  }
  if (
    rendererRevision === "canvaskit-v4-r23" ||
    rendererRevision === "canvaskit-v4-r24"
  ) {
    return POLYHEDRAL_VIEWS_R23_V4;
  }
  if (rendererRevision === "canvaskit-v4-r29") {
    return POLYHEDRAL_VIEWS_R29_V4;
  }
  if (
    rendererRevision === "canvaskit-v4-r30" ||
    rendererRevision === "canvaskit-v4-r31" ||
    rendererRevision === "canvaskit-v4-r32" ||
    rendererRevision === "canvaskit-v4-r33" ||
    rendererRevision === "canvaskit-v4-r34" ||
    rendererRevision === "canvaskit-v4-r35" ||
    rendererRevision === "canvaskit-v4-r36" ||
    rendererRevision === "canvaskit-v4-r37" ||
    rendererRevision === "canvaskit-v4-r38" ||
    rendererRevision === "canvaskit-v4-r39"
  ) {
    return POLYHEDRAL_VIEWS_R30_V4;
  }
  if (
    rendererRevision === "canvaskit-v4-r25" ||
    rendererRevision === "canvaskit-v4-r26" ||
    rendererRevision === "canvaskit-v4-r27" ||
    rendererRevision === "canvaskit-v4-r28"
  ) {
    return POLYHEDRAL_VIEWS_R25_V4;
  }
  throw new Error(`Authored views are not supported by ${rendererRevision}`);
}

export function getAuthoredRenderViewV4(
  rendererRevision: RendererRevisionV4,
  mode: AuthoredViewModeV4,
  die: AuthoredRenderDieV4,
): Readonly<RenderViewV4> {
  if (
    die.target === "other" &&
    die.form === "sphere" &&
    Number.isInteger(die.result) &&
    die.result >= 1
  ) {
    return CENTERED_SPHERE_VIEW_V4;
  }
  const view = authoredPolyhedralViews(rendererRevision)
    .get(polyhedralEntryKey(die))
    ?.views[mode].get(die.result);
  if (view === undefined) {
    throw new Error(
      `Authored ${mode} view is not implemented for ${die.target} ${die.form} result ${die.result}`,
    );
  }
  return view;
}

export function isAuthoredRenderViewV4(
  rendererRevision: RendererRevisionV4,
  view: RenderViewV4,
  die: AuthoredRenderDieV4,
): boolean {
  if (view.kind === "sphere-surface") {
    return (
      die.target === "other" &&
      die.form === "sphere" &&
      view.rotationDegrees === 0 &&
      view.labelLongitudeDegrees === 0 &&
      view.labelLatitudeDegrees === 0 &&
      view.labelRotationDegrees === 0
    );
  }
  if (view.kind !== "oriented-camera") return false;
  const expected = getAuthoredRenderViewV4(
    rendererRevision,
    view.mode,
    die,
  );
  return (
    expected.kind === "oriented-camera" &&
    view.elevationDegrees === expected.elevationDegrees &&
    view.azimuthOffsetDegrees === expected.azimuthOffsetDegrees &&
    view.resultRotation.every(
      (component, index) => component === expected.resultRotation[index],
    )
  );
}
