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
  octahedralSkinCoordinateV4,
  quaternionFromFrameV4,
  scalePointV4,
  subtractPointsV4,
} from "./geometry-math";

type D8VertexIndexV4 = 0 | 1 | 2 | 3 | 4 | 5;
type D8FaceIndicesV4 = readonly [
  D8VertexIndexV4,
  D8VertexIndexV4,
  D8VertexIndexV4,
];

const D8_VERTEX_POSITIONS_V4 = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const satisfies readonly Point3V4[];

const D8_FACE_INDICES_V4 = [
  [0, 2, 4],
  [2, 1, 4],
  [1, 3, 4],
  [3, 0, 4],
  [2, 0, 5],
  [1, 2, 5],
  [3, 1, 5],
  [0, 3, 5],
] as const satisfies readonly D8FaceIndicesV4[];

const D8_FACE_VALUES_V4 = [8, 7, 6, 5, 3, 4, 1, 2] as const;
const D8_LABEL_TOP_VERTEX_V4 = new Map<number, D8VertexIndexV4>([
  [1, 3],
  [2, 3],
  [3, 2],
  [4, 2],
  [5, 3],
  [6, 3],
  [7, 2],
  [8, 2],
]);
// Pose data intentionally duplicates the initial atlas choices so engraving
// revisions cannot rotate the physical result pose.
const D8_RESULT_POSE_TOP_VERTEX_V4 = new Map<number, D8VertexIndexV4>([
  [1, 3],
  [2, 3],
  [3, 2],
  [4, 2],
  [5, 3],
  [6, 3],
  [7, 2],
  [8, 2],
]);
const D8_VERTICES_V4: readonly GeometryVertexV4[] =
  D8_VERTEX_POSITIONS_V4.map((position) => ({ position }));
const D8_SKIN_COORDINATES_V4 = D8_VERTEX_POSITIONS_V4.map(
  octahedralSkinCoordinateV4,
);

function vertex(index: number): Point3V4 {
  const position = D8_VERTEX_POSITIONS_V4[index];
  if (position === undefined) throw new Error("D8 vertex is missing");
  return position;
}

function faceOrigin(vertexIndices: readonly number[]): Point3V4 {
  return scalePointV4(
    vertexIndices.reduce<Point3V4>(
      (sum, index) => addPointsV4(sum, vertex(index)),
      [0, 0, 0],
    ),
    1 / vertexIndices.length,
  );
}

function skinCoordinate(index: D8VertexIndexV4): Point2V4 {
  const coordinate = D8_SKIN_COORDINATES_V4[index];
  if (coordinate === undefined) throw new Error("D8 skin coordinate is missing");
  return coordinate;
}

function face(
  vertexIndices: D8FaceIndicesV4,
  definitionIndex: number,
): GeometryFaceV4 {
  const [firstIndex, secondIndex, thirdIndex] = vertexIndices;
  const first = vertex(firstIndex);
  const second = vertex(secondIndex);
  const third = vertex(thirdIndex);
  const normal = normalizePointV4(
    crossPointsV4(
      subtractPointsV4(second, first),
      subtractPointsV4(third, first),
    ),
    "D8 face normal",
  );
  const origin = faceOrigin(vertexIndices);
  if (dotPointsV4(normal, origin) <= 0) {
    throw new Error("D8 face winding must point outward");
  }
  const value = D8_FACE_VALUES_V4[definitionIndex];
  if (value === undefined) throw new Error("D8 face value is missing");
  const labelTopVertexIndex = D8_LABEL_TOP_VERTEX_V4.get(value);
  if (
    labelTopVertexIndex === undefined ||
    !vertexIndices.includes(labelTopVertexIndex)
  ) {
    throw new Error("D8 label-top vertex is missing");
  }
  const up = normalizePointV4(
    subtractPointsV4(vertex(labelTopVertexIndex), origin),
    "D8 label up direction",
  );
  const right = normalizePointV4(
    crossPointsV4(up, normal),
    "D8 label right direction",
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
        maxWidth: 1.08,
        maxHeight: 0.92,
        opticalInset: 0.03,
      },
    ],
  };
}

const D8_FACES_V4 = D8_FACE_INDICES_V4.map(face);

function faceByValue(value: number): GeometryFaceV4 {
  const faceIndex = D8_FACE_VALUES_V4.findIndex(
    (candidate) => candidate === value,
  );
  const match = D8_FACES_V4[faceIndex];
  if (match === undefined) throw new Error("D8 result face is missing");
  return match;
}

function resultPoseFrame(
  face: GeometryFaceV4,
  result: number,
): { right: Point3V4; up: Point3V4 } {
  const topVertexIndex = D8_RESULT_POSE_TOP_VERTEX_V4.get(result);
  if (
    topVertexIndex === undefined ||
    !face.vertexIndices.includes(topVertexIndex)
  ) {
    throw new Error("D8 result pose top vertex is missing");
  }
  const origin = faceOrigin(face.vertexIndices);
  const up = normalizePointV4(
    subtractPointsV4(vertex(topVertexIndex), origin),
    "D8 result pose up direction",
  );
  return {
    right: normalizePointV4(
      crossPointsV4(up, face.normal),
      "D8 result pose right direction",
    ),
    up,
  };
}

const RESULT_NORMAL_V4: Point3V4 = [0, 1, 0];
const RESULT_RIGHT_V4: Point3V4 = [
  0.9330016583643194,
  0,
  -0.3598720682262375,
];
const RESULT_UP_V4: Point3V4 = [
  -0.3598720682262375,
  0,
  -0.9330016583643194,
];
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

export const D8_STANDARD_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "d8-standard-r1",
  kind: "polyhedral",
  target: "d8",
  form: "standard",
  vertices: D8_VERTICES_V4,
  faces: D8_FACES_V4,
  skinMapping: { kind: "face-coordinates" },
  resultOrientations: Array.from({ length: 8 }, (_, index) => {
    const result = index + 1;
    const resultFace = faceByValue(result);
    const { right, up } = resultPoseFrame(resultFace, result);
    return {
      result,
      rotation: multiplyQuaternionsV4(
        CANONICAL_TO_TARGET_V4,
        quaternionFromFrameV4(right, up, resultFace.normal),
      ),
    };
  }),
  camera: {
    position: [2.7, 7, 7],
    target: [0, 0, 0],
    up: [0, 1, 0],
    orthographicHeight: 2.45,
  },
} satisfies PolyhedralGeometryDescriptorV4);
