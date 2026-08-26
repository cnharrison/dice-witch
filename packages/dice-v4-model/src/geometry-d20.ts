import type {
  GeometryFaceV4,
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
  orientedOctahedralSkinCoordinateV4,
  quaternionFromFrameV4,
  scalePointV4,
  subtractPointsV4,
} from "./geometry-math";

const PHI = (1 + Math.sqrt(5)) / 2;
const CIRCUMRADIUS = Math.sqrt(1 + PHI * PHI);

type D20VertexIndexV4 =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11;

type D20FaceIndicesV4 = readonly [
  D20VertexIndexV4,
  D20VertexIndexV4,
  D20VertexIndexV4,
];

const D20_RAW_VERTICES_V4 = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
] as const satisfies readonly Point3V4[];

const D20_FACE_INDICES_V4 = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
] as const satisfies readonly D20FaceIndicesV4[];

// Opposite physical faces sum to 21; the first face is the canonical 20 face.
const D20_FACE_VALUES_V4 = [
  20, 19, 18, 17, 16, 15, 14, 13, 12, 11,
  4, 3, 2, 1, 5, 9, 10, 6, 7, 8,
] as const;

const D20_AUTHORED_LABEL_TOP_VERTEX_V4 = new Map<
  number,
  D20VertexIndexV4
>([
  [1, 3],
  [2, 2],
  [3, 4],
  [4, 4],
  [5, 9],
  [6, 10],
  [7, 7],
  [8, 1],
  [9, 9],
  [10, 2],
  [11, 1],
  [12, 10],
  [13, 2],
  [14, 4],
  [15, 9],
  [16, 10],
  [17, 7],
  [18, 7],
  [19, 1],
  [20, 0],
]);

// Result yaw is deliberately independent from the engraving atlas so future
// physical label corrections cannot rotate the resting die.
const D20_RESULT_POSE_TOP_VERTEX_V4 = new Map<number, D20VertexIndexV4>([
  [1, 3],
  [2, 2],
  [3, 4],
  [4, 4],
  [5, 9],
  [6, 10],
  [7, 7],
  [8, 1],
  [9, 9],
  [10, 2],
  [11, 1],
  [12, 10],
  [13, 2],
  [14, 4],
  [15, 9],
  [16, 10],
  [17, 7],
  [18, 7],
  [19, 1],
  [20, 0],
]);

const D20_VERTICES_V4: readonly GeometryVertexV4[] = D20_RAW_VERTICES_V4.map(
  (position) => ({ position: scalePointV4(position, 1 / CIRCUMRADIUS) }),
);

function vertex(index: D20VertexIndexV4): Point3V4 {
  const position = D20_VERTICES_V4[index]?.position;
  if (position === undefined) throw new Error("D20 vertex is missing");
  return position;
}

const D20_SKIN_POLE_V4 = vertex(0);
const D20_SKIN_REFERENCE_V4 = vertex(11);
const D20_SKIN_COORDINATES_V4 = D20_VERTICES_V4.map(({ position }) =>
  orientedOctahedralSkinCoordinateV4(
    position,
    D20_SKIN_POLE_V4,
    D20_SKIN_REFERENCE_V4,
  ),
);

function skinCoordinate(index: D20VertexIndexV4): Point2V4 {
  const coordinate = D20_SKIN_COORDINATES_V4[index];
  if (coordinate === undefined) {
    throw new Error("D20 skin coordinate is missing");
  }
  return coordinate;
}

function labelUpDirection(value: number, origin: Point3V4): Point3V4 {
  const authoredTopVertex = D20_AUTHORED_LABEL_TOP_VERTEX_V4.get(value);
  if (authoredTopVertex === undefined) {
    throw new Error("D20 authored label top vertex is missing");
  }
  return normalizePointV4(
    subtractPointsV4(vertex(authoredTopVertex), origin),
    "D20 label up direction",
  );
}

function face(
  indices: D20FaceIndicesV4,
  definitionIndex: number,
): GeometryFaceV4 {
  const [firstIndex, secondIndex, thirdIndex] = indices;
  const first = vertex(firstIndex);
  const second = vertex(secondIndex);
  const third = vertex(thirdIndex);
  const normal = normalizePointV4(
    crossPointsV4(
      subtractPointsV4(second, first),
      subtractPointsV4(third, first),
    ),
    "D20 face normal",
  );
  const origin = scalePointV4(addPointsV4(addPointsV4(first, second), third), 1 / 3);
  if (dotPointsV4(normal, origin) <= 0) {
    throw new Error("D20 face winding must point outward");
  }
  const vertexIndices = [firstIndex, secondIndex, thirdIndex] as const;
  const value = D20_FACE_VALUES_V4[definitionIndex];
  if (value === undefined) throw new Error("D20 face value is missing");
  const up = labelUpDirection(value, origin);
  const right = normalizePointV4(
    crossPointsV4(up, normal),
    "D20 label right direction",
  );
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
        maxWidth: 0.82,
        maxHeight: 0.62,
        opticalInset: 0.02,
      },
    ],
  };
}

const D20_FACES_V4 = D20_FACE_INDICES_V4.map(face);

const CAMERA_V4 = {
  position: [3.8, 6.5, 7] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  orthographicHeight: 2.5,
};
const RESULT_NORMAL_V4: Point3V4 = [0, 1, 0];
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
const POSE_YAW_V4 = -Math.PI / 36;
const RESULT_RIGHT_V4 = normalizePointV4(
  addPointsV4(
    scalePointV4(POSE_REFERENCE_RIGHT_V4, Math.cos(POSE_YAW_V4)),
    scalePointV4(POSE_REFERENCE_UP_V4, Math.sin(POSE_YAW_V4)),
  ),
  "D20 result right direction",
);
const RESULT_UP_V4 = normalizePointV4(
  crossPointsV4(RESULT_NORMAL_V4, RESULT_RIGHT_V4),
  "D20 result up direction",
);
const TARGET_TO_CANONICAL_V4 = quaternionFromFrameV4(
  RESULT_RIGHT_V4,
  RESULT_UP_V4,
  RESULT_NORMAL_V4,
);
const CANONICAL_TO_TARGET_V4: QuaternionV4 = [
  -TARGET_TO_CANONICAL_V4[0],
  -TARGET_TO_CANONICAL_V4[1],
  -TARGET_TO_CANONICAL_V4[2],
  TARGET_TO_CANONICAL_V4[3],
];

function faceByValue(faceValue: number): GeometryFaceV4 {
  const match = D20_FACES_V4.find(
    (candidate) => candidate.labels[0]?.value === faceValue,
  );
  if (match === undefined) throw new Error("D20 face value is missing");
  return match;
}

function resultPoseFrame(
  value: number,
  face: GeometryFaceV4,
) {
  const topVertexIndex = D20_RESULT_POSE_TOP_VERTEX_V4.get(value);
  if (topVertexIndex === undefined) {
    throw new Error("D20 result pose top vertex is missing");
  }
  const origin = scalePointV4(
    face.vertexIndices.reduce<Point3V4>((sum, index) => {
      const position = D20_VERTICES_V4[index]?.position;
      if (position === undefined) throw new Error("D20 pose vertex is missing");
      return addPointsV4(sum, position);
    }, [0, 0, 0]),
    1 / face.vertexIndices.length,
  );
  const up = normalizePointV4(
    subtractPointsV4(vertex(topVertexIndex), origin),
    "D20 result pose up direction",
  );
  return {
    right: normalizePointV4(
      crossPointsV4(up, face.normal),
      "D20 result pose right direction",
    ),
    up,
  };
}

export const D20_STANDARD_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "d20-standard-r1",
  kind: "polyhedral",
  target: "d20",
  form: "standard",
  vertices: D20_VERTICES_V4,
  faces: D20_FACES_V4,
  skinMapping: {
    kind: "view-octahedral",
    subdivisions: 6,
  },
  resultOrientations: Array.from({ length: 20 }, (_, index) => {
    const result = index + 1;
    const resultFace = faceByValue(result);
    const { right, up } = resultPoseFrame(result, resultFace);
    return {
      result,
      rotation: multiplyQuaternionsV4(
        CANONICAL_TO_TARGET_V4,
        quaternionFromFrameV4(right, up, resultFace.normal),
      ),
    };
  }),
  camera: CAMERA_V4,
} satisfies PolyhedralGeometryDescriptorV4);

export const D20_STANDARD_GEOMETRY_R2_V4 = Object.freeze({
  ...D20_STANDARD_GEOMETRY_V4,
  id: "d20-standard-r2",
  camera: {
    ...D20_STANDARD_GEOMETRY_V4.camera,
    orthographicHeight: 2.35,
  },
} satisfies PolyhedralGeometryDescriptorV4);

// Sharp-edge resin retains the regular, unchamfered icosahedral solid. The
// distinct immutable ID lets renderers preserve its crisp edge profile without
// changing the approved standard descriptor, numbering, pose, or material wrap.
export const D20_SHARP_GEOMETRY_V4 = Object.freeze({
  ...D20_STANDARD_GEOMETRY_V4,
  id: "d20-sharp-r1",
  form: "sharp",
} satisfies PolyhedralGeometryDescriptorV4);
