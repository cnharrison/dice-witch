import { D20_STANDARD_GEOMETRY_V4 } from "./geometry-d20";
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
  uprightFaceFrameV4,
} from "./geometry-math";

const D12_FACE_VALUES_V4 = [
  12, 11, 2, 1, 10, 9, 4, 3, 8, 7, 6, 5,
] as const;
const D12_BOTTOM_EDGE_NEIGHBOR_BY_VALUE_V4 = new Map<number, number>([
  [1, 2],
  [2, 1],
  [3, 11],
  [4, 1],
  [5, 2],
  [6, 2],
  [7, 1],
  [8, 1],
  [9, 11],
  [10, 2],
  [11, 9],
  [12, 11],
]);
// Pose data intentionally duplicates the initial atlas choices so engraving
// revisions cannot rotate the physical result pose.
const D12_RESULT_POSE_BOTTOM_EDGE_NEIGHBOR_BY_VALUE_V4 = new Map<
  number,
  number
>([
  [1, 2],
  [2, 1],
  [3, 11],
  [4, 1],
  [5, 2],
  [6, 2],
  [7, 1],
  [8, 1],
  [9, 11],
  [10, 2],
  [11, 9],
  [12, 11],
]);

const D12_VERTICES_V4: readonly GeometryVertexV4[] =
  D20_STANDARD_GEOMETRY_V4.faces.map(({ normal }) => ({ position: normal }));
const D12_SKIN_COORDINATES_V4 = D12_VERTICES_V4.map(({ position }) =>
  octahedralSkinCoordinateV4(position),
);

function d20Vertex(index: number): Point3V4 {
  const position = D20_STANDARD_GEOMETRY_V4.vertices[index]?.position;
  if (position === undefined) throw new Error("D12 dual vertex is missing");
  return position;
}

function d12Vertex(index: number): Point3V4 {
  const position = D12_VERTICES_V4[index]?.position;
  if (position === undefined) throw new Error("D12 vertex is missing");
  return position;
}

function skinCoordinate(index: number): Point2V4 {
  const coordinate = D12_SKIN_COORDINATES_V4[index];
  if (coordinate === undefined) throw new Error("D12 skin coordinate is missing");
  return coordinate;
}

function orderedIncidentFaces(d20VertexIndex: number): readonly number[] {
  const normal = d20Vertex(d20VertexIndex);
  const { right: rightAxis, up } = uprightFaceFrameV4(normal);
  return D20_STANDARD_GEOMETRY_V4.faces
    .flatMap((face, faceIndex) =>
      face.vertexIndices.includes(d20VertexIndex) ? [faceIndex] : [],
    )
    .sort((leftIndex, rightIndex) => {
      const left = d12Vertex(leftIndex);
      const right = d12Vertex(rightIndex);
      const leftAngle = Math.atan2(
        dotPointsV4(left, up),
        dotPointsV4(left, rightAxis),
      );
      const rightAngle = Math.atan2(
        dotPointsV4(right, up),
        dotPointsV4(right, rightAxis),
      );
      return leftAngle - rightAngle;
    });
}

function bottomEdgeFrame(
  value: number,
  vertexIndices: readonly number[],
  normal: Point3V4,
  origin: Point3V4,
  neighborByValue: ReadonlyMap<number, number>,
  context: "label" | "result pose",
) {
  const bottomEdgeNeighborValue = neighborByValue.get(value);
  const bottomEdgeNeighborIndex = D12_FACE_VALUES_V4.findIndex(
    (candidate) => candidate === bottomEdgeNeighborValue,
  );
  if (bottomEdgeNeighborIndex < 0) {
    throw new Error(`D12 ${context} bottom-edge neighbor is missing`);
  }
  const neighborVertexIndices = orderedIncidentFaces(bottomEdgeNeighborIndex);
  const sharedVertexIndices = vertexIndices.filter((index) =>
    neighborVertexIndices.includes(index),
  );
  const [firstSharedIndex, secondSharedIndex] = sharedVertexIndices;
  if (
    sharedVertexIndices.length !== 2 ||
    firstSharedIndex === undefined ||
    secondSharedIndex === undefined
  ) {
    throw new Error(`D12 ${context} bottom edge must have two vertices`);
  }
  const bottomEdgeMidpoint = scalePointV4(
    addPointsV4(
      d12Vertex(firstSharedIndex),
      d12Vertex(secondSharedIndex),
    ),
    0.5,
  );
  const up = normalizePointV4(
    subtractPointsV4(origin, bottomEdgeMidpoint),
    `D12 ${context} up direction`,
  );
  return {
    right: normalizePointV4(
      crossPointsV4(up, normal),
      `D12 ${context} right direction`,
    ),
    up,
  };
}

function face(
  d20VertexPosition: GeometryVertexV4,
  faceIndex: number,
): GeometryFaceV4 {
  const vertexIndices = orderedIncidentFaces(faceIndex);
  if (vertexIndices.length !== 5) {
    throw new Error("D12 face must have five vertices");
  }
  const [firstIndex, secondIndex, thirdIndex] = vertexIndices;
  if (
    firstIndex === undefined ||
    secondIndex === undefined ||
    thirdIndex === undefined
  ) {
    throw new Error("D12 face vertices are missing");
  }
  const first = d12Vertex(firstIndex);
  const second = d12Vertex(secondIndex);
  const third = d12Vertex(thirdIndex);
  const normal = normalizePointV4(
    crossPointsV4(
      subtractPointsV4(second, first),
      subtractPointsV4(third, first),
    ),
    "D12 face normal",
  );
  const origin = scalePointV4(
    vertexIndices.reduce<Point3V4>(
      (sum, index) => addPointsV4(sum, d12Vertex(index)),
      [0, 0, 0],
    ),
    1 / vertexIndices.length,
  );
  if (
    dotPointsV4(normal, origin) <= 0 ||
    dotPointsV4(normal, d20VertexPosition.position) < 0.999999999999
  ) {
    throw new Error("D12 face winding must point outward");
  }
  const value = D12_FACE_VALUES_V4[faceIndex];
  if (value === undefined) throw new Error("D12 face value is missing");
  const { right, up } = bottomEdgeFrame(
    value,
    vertexIndices,
    normal,
    origin,
    D12_BOTTOM_EDGE_NEIGHBOR_BY_VALUE_V4,
    "label",
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
        maxWidth: 0.96,
        maxHeight: 0.8,
        opticalInset: 0.03,
      },
    ],
  };
}

const D12_FACES_V4 = D20_STANDARD_GEOMETRY_V4.vertices.map(face);

function faceByValue(value: number): GeometryFaceV4 {
  const faceIndex = D12_FACE_VALUES_V4.findIndex(
    (candidate) => candidate === value,
  );
  const match = D12_FACES_V4[faceIndex];
  if (match === undefined) throw new Error("D12 result face is missing");
  return match;
}

function resultPoseFrame(
  face: GeometryFaceV4,
  result: number,
): { right: Point3V4; up: Point3V4 } {
  const origin = scalePointV4(
    face.vertexIndices.reduce<Point3V4>(
      (sum, index) => addPointsV4(sum, d12Vertex(index)),
      [0, 0, 0],
    ),
    1 / face.vertexIndices.length,
  );
  return bottomEdgeFrame(
    result,
    face.vertexIndices,
    face.normal,
    origin,
    D12_RESULT_POSE_BOTTOM_EDGE_NEIGHBOR_BY_VALUE_V4,
    "result pose",
  );
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

export const D12_STANDARD_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "d12-standard-r1",
  kind: "polyhedral",
  target: "d12",
  form: "standard",
  vertices: D12_VERTICES_V4,
  faces: D12_FACES_V4,
  skinMapping: { kind: "face-coordinates" },
  resultOrientations: Array.from({ length: 12 }, (_, index) => {
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
    position: [2.7, 4.2, 7],
    target: [0, 0, 0],
    up: [0, 1, 0],
    orthographicHeight: 2.45,
  },
} satisfies PolyhedralGeometryDescriptorV4);
