import type {
  GeometryFaceV4,
  GeometryResultOrientationV4,
  GeometryVertexV4,
  Point2V4,
  Point3V4,
  PolyhedralGeometryDescriptorV4,
  QuaternionV4,
} from "./geometry";
import {
  addPointsV4,
  crossPointsV4,
  dotPointsV4,
  multiplyQuaternionsV4,
  normalizePointV4,
  polarSkinCoordinateV4,
  quaternionFromFrameV4,
  rotatePointByQuaternionV4,
  scalePointV4,
  subtractPointsV4,
  uprightFaceFrameV4,
} from "./geometry-math";

const RING_SIZE = 5;
const RING_HEIGHT = 0.5;
const FULL_TURN = Math.PI * 2;
const CONVENTIONAL_WIDTH_TO_POLE_HEIGHT_V4 = Math.sqrt(Math.sqrt(5) - 1);

const D10_FACE_VALUES_V4 = [10, 9, 8, 7, 6, 4, 5, 1, 2, 3] as const;
const PERCENTILE_FACE_VALUES_V4 = D10_FACE_VALUES_V4.map(
  (value) => (10 - value) * 10,
);

function ringPoint(index: number, offset: number, height: number): Point3V4 {
  const angle = (index / RING_SIZE) * FULL_TURN + offset;
  return [Math.cos(angle), Math.sin(angle), height];
}

const ANTIPRISM_VERTICES_V4: readonly Point3V4[] = [
  ...Array.from({ length: RING_SIZE }, (_, index) =>
    normalizePointV4(ringPoint(index, 0, RING_HEIGHT), "D10 dual vertex"),
  ),
  ...Array.from({ length: RING_SIZE }, (_, index) =>
    normalizePointV4(
      ringPoint(index, Math.PI / RING_SIZE, -RING_HEIGHT),
      "D10 dual vertex",
    ),
  ),
];

const ANTIPRISM_FACE_INDICES_V4: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],
  [9, 8, 7, 6, 5],
  ...Array.from({ length: RING_SIZE }, (_, index) => {
    const next = (index + 1) % RING_SIZE;
    return [
      [index, RING_SIZE + index, next],
      [RING_SIZE + index, RING_SIZE + next, next],
    ] as const;
  }).flat(),
];

function antiprismVertex(index: number): Point3V4 {
  const position = ANTIPRISM_VERTICES_V4[index];
  if (position === undefined) throw new Error("D10 dual vertex is missing");
  return position;
}

function antiprismFaceDualVertex(vertexIndices: readonly number[]): Point3V4 {
  const [firstIndex, secondIndex, thirdIndex] = vertexIndices;
  if (
    firstIndex === undefined ||
    secondIndex === undefined ||
    thirdIndex === undefined
  ) {
    throw new Error("D10 dual face needs at least three vertices");
  }
  const first = antiprismVertex(firstIndex);
  const second = antiprismVertex(secondIndex);
  const third = antiprismVertex(thirdIndex);
  const normal = normalizePointV4(
    crossPointsV4(
      subtractPointsV4(second, first),
      subtractPointsV4(third, first),
    ),
    "D10 dual face normal",
  );
  const origin = scalePointV4(
    vertexIndices.reduce<Point3V4>(
      (sum, index) => addPointsV4(sum, antiprismVertex(index)),
      [0, 0, 0],
    ),
    1 / vertexIndices.length,
  );
  const planeDistance = dotPointsV4(normal, origin);
  if (planeDistance <= 0) {
    throw new Error("D10 dual face winding must point outward");
  }
  return scalePointV4(normal, 1 / planeDistance);
}

const D10_DUAL_VERTICES_V4 = ANTIPRISM_FACE_INDICES_V4.map(
  antiprismFaceDualVertex,
);
const D10_RING_RADIUS_V4 = Math.max(
  ...D10_DUAL_VERTICES_V4.slice(2).map(([x, y]) => Math.hypot(x, y)),
);
const D10_POLE_HEIGHT_V4 =
  Math.max(...D10_DUAL_VERTICES_V4.map((position) => position[2])) -
  Math.min(...D10_DUAL_VERTICES_V4.map((position) => position[2]));
const D10_AXIAL_SCALE_V4 =
  (D10_RING_RADIUS_V4 * 2) /
  (D10_POLE_HEIGHT_V4 * CONVENTIONAL_WIDTH_TO_POLE_HEIGHT_V4);
const D10_PHYSICAL_VERTICES_V4 = D10_DUAL_VERTICES_V4.map(
  ([x, y, z]): Point3V4 => [x, y, z * D10_AXIAL_SCALE_V4],
);
const D10_CIRCUMRADIUS_V4 = Math.max(
  ...D10_PHYSICAL_VERTICES_V4.map((position) =>
    Math.sqrt(dotPointsV4(position, position)),
  ),
);
const D10_VERTICES_V4: readonly GeometryVertexV4[] =
  D10_PHYSICAL_VERTICES_V4.map((position) => ({
    position: scalePointV4(position, 1 / D10_CIRCUMRADIUS_V4),
  }));
const D10_SKIN_POLE_V4 = D10_VERTICES_V4[0]?.position;
const D10_SKIN_REFERENCE_V4 = D10_VERTICES_V4[2]?.position;
if (D10_SKIN_POLE_V4 === undefined || D10_SKIN_REFERENCE_V4 === undefined) {
  throw new Error("D10 skin reference is missing");
}
const D10_SKIN_COORDINATES_V4 = D10_VERTICES_V4.map(({ position }) =>
  polarSkinCoordinateV4(
    position,
    D10_SKIN_POLE_V4,
    D10_SKIN_REFERENCE_V4,
  ),
);

const CAMERA_V4 = {
  position: [3.8, 8, 7] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  orthographicHeight: 2.2,
};

const RESULT_NORMAL_V4: Point3V4 = [0, 1, 0];
// This authored three-fifths turn rotates the complete physical object, keeps
// its two-pyramid silhouette recognizable, and presents the result upright.
const RESULT_READABILITY_YAW_RADIANS_V4 = (216 * Math.PI) / 180;
const RESULT_READABILITY_YAW_V4: QuaternionV4 = [
  0,
  Math.sin(RESULT_READABILITY_YAW_RADIANS_V4 / 2),
  0,
  Math.cos(RESULT_READABILITY_YAW_RADIANS_V4 / 2),
];
// Frozen from the approved pose so camera changes cannot rotate the die.
const POSE_REFERENCE_RIGHT_V4: Point3V4 = [
  0.8788534316656945,
  0,
  -0.47709186290423417,
];
const POSE_REFERENCE_UP_V4: Point3V4 = [
  -0.47709186290423417,
  0,
  -0.8788534316656945,
];

function d10Vertex(index: number): Point3V4 {
  const position = D10_VERTICES_V4[index]?.position;
  if (position === undefined) throw new Error("D10 vertex is missing");
  return position;
}

function skinCoordinate(index: number): Point2V4 {
  const coordinate = D10_SKIN_COORDINATES_V4[index];
  if (coordinate === undefined) throw new Error("D10 skin coordinate is missing");
  return coordinate;
}

function orderedIncidentFaces(antiprismVertexIndex: number): readonly number[] {
  const normal = antiprismVertex(antiprismVertexIndex);
  const { right: rightAxis, up } = uprightFaceFrameV4(normal);
  return ANTIPRISM_FACE_INDICES_V4.flatMap((indices, faceIndex) =>
    indices.includes(antiprismVertexIndex) ? [faceIndex] : [],
  ).sort((leftIndex, rightIndex) => {
    const left = d10Vertex(leftIndex);
    const right = d10Vertex(rightIndex);
    return (
      Math.atan2(dotPointsV4(left, up), dotPointsV4(left, rightAxis)) -
      Math.atan2(dotPointsV4(right, up), dotPointsV4(right, rightAxis))
    );
  });
}

const D10_FACE_INDICES_V4 = ANTIPRISM_VERTICES_V4.map((_, index) => {
  const indices = orderedIncidentFaces(index);
  const poleOffset = indices.findIndex(
    (vertexIndex) => vertexIndex === 0 || vertexIndex === 1,
  );
  if (poleOffset < 0) throw new Error("D10 face pole is missing");
  return [...indices.slice(poleOffset), ...indices.slice(0, poleOffset)];
});

function faceOrigin(vertexIndices: readonly number[]): Point3V4 {
  return scalePointV4(
    vertexIndices.reduce<Point3V4>(
      (sum, index) => addPointsV4(sum, d10Vertex(index)),
      [0, 0, 0],
    ),
    1 / vertexIndices.length,
  );
}

function facePole(
  vertexIndices: readonly number[],
  target: "D10" | "Percentile",
): Point3V4 {
  const poleIndex = vertexIndices.find((index) => index === 0 || index === 1);
  if (poleIndex === undefined) throw new Error(`${target} face pole is missing`);
  return d10Vertex(poleIndex);
}

function engravingFrame(
  vertexIndices: readonly number[],
  normal: Point3V4,
  target: "D10" | "Percentile",
): { origin: Point3V4; right: Point3V4; up: Point3V4 } {
  const origin = faceOrigin(vertexIndices);
  const up = normalizePointV4(
    subtractPointsV4(facePole(vertexIndices, target), origin),
    `${target} face up direction`,
  );
  return {
    origin,
    right: normalizePointV4(
      crossPointsV4(up, normal),
      `${target} face right direction`,
    ),
    up,
  };
}

function resultPoseFrame(
  face: GeometryFaceV4,
  target: "D10" | "Percentile",
): { right: Point3V4; up: Point3V4 } {
  const up = normalizePointV4(
    subtractPointsV4(
      facePole(face.vertexIndices, target),
      faceOrigin(face.vertexIndices),
    ),
    `${target} result pose up direction`,
  );
  return {
    right: normalizePointV4(
      crossPointsV4(up, face.normal),
      `${target} result pose right direction`,
    ),
    up,
  };
}

function face(
  vertexIndices: readonly number[],
  definitionIndex: number,
  values: readonly number[],
  target: "D10" | "Percentile",
): GeometryFaceV4 {
  if (vertexIndices.length !== 4) {
    throw new Error(`${target} face must have four vertices`);
  }
  const [firstIndex, secondIndex, thirdIndex] = vertexIndices;
  if (
    firstIndex === undefined ||
    secondIndex === undefined ||
    thirdIndex === undefined
  ) {
    throw new Error(`${target} face vertices are missing`);
  }
  const first = d10Vertex(firstIndex);
  const second = d10Vertex(secondIndex);
  const third = d10Vertex(thirdIndex);
  const normal = normalizePointV4(
    crossPointsV4(
      subtractPointsV4(second, first),
      subtractPointsV4(third, first),
    ),
    `${target} face normal`,
  );
  const { origin, right, up } = engravingFrame(
    vertexIndices,
    normal,
    target,
  );
  const dualNormal = antiprismVertex(definitionIndex);
  const expectedNormal = normalizePointV4(
    [dualNormal[0], dualNormal[1], dualNormal[2] / D10_AXIAL_SCALE_V4],
    `${target} expected face normal`,
  );
  if (
    dotPointsV4(normal, origin) <= 0 ||
    dotPointsV4(normal, expectedNormal) < 0.999999999999
  ) {
    throw new Error(
      `${target} face ${definitionIndex} winding must point outward`,
    );
  }
  const value = values[definitionIndex];
  if (value === undefined) throw new Error(`${target} face value is missing`);
  return {
    id: `face-${value}`,
    normal,
    vertexIndices,
    skinCoordinates: vertexIndices.map(skinCoordinate),
    labels: [
      {
        value,
        alignment: "surface",
        origin,
        right,
        up,
        maxWidth: 0.76,
        maxHeight: 0.76,
        opticalInset: 0.02,
      },
    ],
  };
}

function createFaces(
  values: readonly number[],
  target: "D10" | "Percentile",
): readonly GeometryFaceV4[] {
  return D10_FACE_INDICES_V4.map((indices, index) =>
    face(indices, index, values, target),
  );
}

function restingTargetRight(
  resultFace: GeometryFaceV4,
  faces: readonly GeometryFaceV4[],
  sourceToCanonical: QuaternionV4,
  target: "D10" | "Percentile",
): Point3V4 {
  const supportFace = faces.find(
    (candidate) =>
      dotPointsV4(candidate.normal, resultFace.normal) < -0.999999999999,
  );
  if (supportFace === undefined) {
    throw new Error(`${target} support face is missing`);
  }
  const supportVertices = supportFace.vertexIndices.map((index) =>
    rotatePointByQuaternionV4(d10Vertex(index), sourceToCanonical),
  );
  const edges = supportVertices.map((from, index) => {
    const to = supportVertices[(index + 1) % supportVertices.length];
    if (to === undefined) throw new Error(`${target} support edge is missing`);
    const direction = subtractPointsV4(to, from);
    return {
      direction,
      length: Math.hypot(direction[0], direction[1], direction[2]),
    };
  });
  const shortestLength = Math.min(...edges.map(({ length }) => length));
  const restingEdge = edges.find(
    ({ direction, length }) =>
      Math.abs(length - shortestLength) < 1e-12 &&
      direction[0] > 0 &&
      direction[1] > 0,
  );
  if (restingEdge === undefined) {
    throw new Error(`${target} resting support edge is missing`);
  }
  const yaw =
    Math.PI - Math.atan2(restingEdge.direction[1], restingEdge.direction[0]);
  return normalizePointV4(
    addPointsV4(
      scalePointV4(POSE_REFERENCE_RIGHT_V4, Math.cos(yaw)),
      scalePointV4(POSE_REFERENCE_UP_V4, Math.sin(yaw)),
    ),
    `${target} resting result right direction`,
  );
}

function createOrientations(
  faces: readonly GeometryFaceV4[],
  faceValues: readonly number[],
  results: readonly number[],
  target: "D10" | "Percentile",
): readonly GeometryResultOrientationV4[] {
  return results.map((result) => {
    const faceIndex = faceValues.findIndex((value) => value === result);
    const resultFace = faces[faceIndex];
    if (resultFace === undefined) {
      throw new Error(`${target} result face is missing`);
    }
    const { right, up } = resultPoseFrame(resultFace, target);
    const sourceToCanonical = quaternionFromFrameV4(
      right,
      up,
      resultFace.normal,
    );
    const resultRight = restingTargetRight(
      resultFace,
      faces,
      sourceToCanonical,
      target,
    );
    const resultUp = normalizePointV4(
      crossPointsV4(RESULT_NORMAL_V4, resultRight),
      `${target} resting result up direction`,
    );
    const targetToCanonical = quaternionFromFrameV4(
      resultRight,
      resultUp,
      RESULT_NORMAL_V4,
    );
    const canonicalToTarget: QuaternionV4 = [
      -targetToCanonical[0],
      -targetToCanonical[1],
      -targetToCanonical[2],
      targetToCanonical[3],
    ];
    const physicalRotation = multiplyQuaternionsV4(
      canonicalToTarget,
      sourceToCanonical,
    );
    return {
      result,
      rotation: multiplyQuaternionsV4(
        RESULT_READABILITY_YAW_V4,
        physicalRotation,
      ),
    };
  });
}

const D10_FACES_V4 = createFaces(D10_FACE_VALUES_V4, "D10");
const PERCENTILE_FACES_V4 = createFaces(
  PERCENTILE_FACE_VALUES_V4,
  "Percentile",
);
export const D10_STANDARD_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "d10-standard-r1",
  kind: "polyhedral",
  target: "d10",
  form: "standard",
  vertices: D10_VERTICES_V4,
  faces: D10_FACES_V4,
  skinMapping: { kind: "face-coordinates" },
  resultOrientations: createOrientations(
    D10_FACES_V4,
    D10_FACE_VALUES_V4,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "D10",
  ),
  camera: CAMERA_V4,
} satisfies PolyhedralGeometryDescriptorV4);

export const PERCENTILE_STANDARD_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "percentile-standard-r1",
  kind: "polyhedral",
  target: "percentile",
  form: "standard",
  vertices: D10_VERTICES_V4,
  faces: PERCENTILE_FACES_V4,
  skinMapping: { kind: "face-coordinates" },
  resultOrientations: createOrientations(
    PERCENTILE_FACES_V4,
    PERCENTILE_FACE_VALUES_V4,
    [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
    "Percentile",
  ),
  camera: CAMERA_V4,
} satisfies PolyhedralGeometryDescriptorV4);
