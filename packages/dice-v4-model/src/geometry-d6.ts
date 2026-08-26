import type {
  GeometryFaceV4,
  GeometryVertexV4,
  Point2V4,
  Point3V4,
  PolyhedralGeometryDescriptorV4,
  QuaternionV4,
} from "./geometry";
import {
  dotPointsV4,
  multiplyQuaternionsV4,
  quaternionFromFrameV4,
} from "./geometry-math";

type D6VertexIndexV4 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const D6_VERTICES_V4: readonly GeometryVertexV4[] = [
  { position: [-1, -1, -1] },
  { position: [1, -1, -1] },
  { position: [1, 1, -1] },
  { position: [-1, 1, -1] },
  { position: [-1, -1, 1] },
  { position: [1, -1, 1] },
  { position: [1, 1, 1] },
  { position: [-1, 1, 1] },
];

function faceSkinCoordinate(
  index: D6VertexIndexV4,
  right: Point3V4,
  up: Point3V4,
): Point2V4 {
  const position = D6_VERTICES_V4[index]?.position;
  if (position === undefined) throw new Error("D6 skin vertex is missing");
  return [
    (dotPointsV4(position, right) + 1) / 2,
    (1 - dotPointsV4(position, up)) / 2,
  ];
}

function face(
  value: number,
  normal: Point3V4,
  vertexIndices: readonly D6VertexIndexV4[],
  right: Point3V4,
  up: Point3V4,
): GeometryFaceV4 {
  return {
    id: `face-${value}`,
    normal,
    vertexIndices,
    skinCoordinates: vertexIndices.map((index) =>
      faceSkinCoordinate(index, right, up),
    ),
    labels: [
      {
        value,
        alignment: "surface",
        origin: normal,
        right,
        up,
        maxWidth: 1.9,
        maxHeight: 1.9,
        opticalInset: 0.035,
      },
    ],
  };
}

const D6_FACES_V4 = [
  face(1, [0, 0, 1], [4, 5, 6, 7], [1, 0, 0], [0, 1, 0]),
  face(2, [1, 0, 0], [5, 1, 2, 6], [0, -1, 0], [0, 0, -1]),
  face(3, [0, 1, 0], [7, 6, 2, 3], [1, 0, 0], [0, 0, -1]),
  face(4, [0, -1, 0], [0, 1, 5, 4], [1, 0, 0], [0, 0, 1]),
  face(5, [-1, 0, 0], [0, 4, 7, 3], [0, -1, 0], [0, 0, 1]),
  face(6, [0, 0, -1], [1, 0, 3, 2], [0, -1, 0], [-1, 0, 0]),
] as const;

// Pose frames intentionally duplicate the initial physical label axes so later
// engraving-atlas edits cannot change how the cube rests.
const D6_RESULT_POSE_FRAMES_V4 = new Map<
  number,
  { right: Point3V4; up: Point3V4 }
>([
  [1, { right: [1, 0, 0], up: [0, 1, 0] }],
  [2, { right: [0, -1, 0], up: [0, 0, -1] }],
  [3, { right: [1, 0, 0], up: [0, 0, -1] }],
  [4, { right: [1, 0, 0], up: [0, 0, 1] }],
  [5, { right: [0, -1, 0], up: [0, 0, 1] }],
  [6, { right: [0, -1, 0], up: [-1, 0, 0] }],
]);
const RESULT_NORMAL_V4: Point3V4 = [0, 1, 0];
// A fixed five-degree offset from the accepted pose yaw avoids an edge-on side
// face without following camera changes.
const RESULT_RIGHT_V4: Point3V4 = [
  0.9499797347316714,
  0,
  -0.31231154893654367,
];
const RESULT_UP_V4: Point3V4 = [
  -0.31231154893654367,
  0,
  -0.9499797347316714,
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

function resultOrientation(result: number) {
  const resultFace = D6_FACES_V4.find((face) => face.id === `face-${result}`);
  const sourceFrame = D6_RESULT_POSE_FRAMES_V4.get(result);
  if (resultFace === undefined || sourceFrame === undefined) {
    throw new Error("D6 result pose is missing");
  }
  return {
    result,
    rotation: multiplyQuaternionsV4(
      CANONICAL_TO_TARGET_V4,
      quaternionFromFrameV4(
        sourceFrame.right,
        sourceFrame.up,
        resultFace.normal,
      ),
    ),
  };
}

export const D6_STANDARD_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "d6-standard-r1",
  kind: "polyhedral",
  target: "d6",
  form: "standard",
  vertices: D6_VERTICES_V4,
  faces: D6_FACES_V4,
  skinMapping: { kind: "face-coordinates" },
  resultOrientations: Array.from({ length: 6 }, (_, index) =>
    resultOrientation(index + 1),
  ),
  camera: {
    position: [3, 4.5, 7],
    target: [0, 0, 0],
    up: [0, 1, 0],
    orthographicHeight: 3.15,
  },
} satisfies PolyhedralGeometryDescriptorV4);
