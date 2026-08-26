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
  normalizePointV4,
  octahedralSkinCoordinateV4,
  quaternionFromFrameV4,
  scalePointV4,
  subtractPointsV4,
  uprightFaceFrameV4,
} from "./geometry-math";

type D4VertexIndexV4 = 0 | 1 | 2 | 3;
type D4FaceIndicesV4 = readonly [
  D4VertexIndexV4,
  D4VertexIndexV4,
  D4VertexIndexV4,
];

const INVERSE_SQRT_THREE = 1 / Math.sqrt(3);

const D4_VERTEX_POSITIONS_V4 = [
  [INVERSE_SQRT_THREE, INVERSE_SQRT_THREE, INVERSE_SQRT_THREE],
  [INVERSE_SQRT_THREE, -INVERSE_SQRT_THREE, -INVERSE_SQRT_THREE],
  [-INVERSE_SQRT_THREE, INVERSE_SQRT_THREE, -INVERSE_SQRT_THREE],
  [-INVERSE_SQRT_THREE, -INVERSE_SQRT_THREE, INVERSE_SQRT_THREE],
] as const satisfies readonly Point3V4[];
const D4_FACE_INDICES_V4 = [
  [1, 3, 2],
  [0, 2, 3],
  [0, 3, 1],
  [0, 1, 2],
] as const satisfies readonly D4FaceIndicesV4[];
const D4_VERTEX_VALUES_V4 = [1, 2, 3, 4] as const;
const D4_VERTICES_V4: readonly GeometryVertexV4[] =
  D4_VERTEX_POSITIONS_V4.map((position) => ({ position }));
const D4_SKIN_COORDINATES_V4 = D4_VERTEX_POSITIONS_V4.map(
  octahedralSkinCoordinateV4,
);

function vertex(index: D4VertexIndexV4): Point3V4 {
  return D4_VERTEX_POSITIONS_V4[index];
}

function skinCoordinate(index: D4VertexIndexV4): Point2V4 {
  const coordinate = D4_SKIN_COORDINATES_V4[index];
  if (coordinate === undefined) throw new Error("D4 skin coordinate is missing");
  return coordinate;
}

function face(vertexIndices: D4FaceIndicesV4): GeometryFaceV4 {
  const [firstIndex, secondIndex, thirdIndex] = vertexIndices;
  const first = vertex(firstIndex);
  const second = vertex(secondIndex);
  const third = vertex(thirdIndex);
  const normal = normalizePointV4(
    crossPointsV4(
      subtractPointsV4(second, first),
      subtractPointsV4(third, first),
    ),
    "D4 face normal",
  );
  const origin = scalePointV4(
    addPointsV4(addPointsV4(first, second), third),
    1 / 3,
  );
  if (dotPointsV4(normal, origin) <= 0) {
    throw new Error("D4 face winding must point outward");
  }
  const oppositeVertexIndex = D4_VERTEX_VALUES_V4.findIndex(
    (_, index) => !vertexIndices.some((vertexIndex) => vertexIndex === index),
  );
  const oppositeValue = D4_VERTEX_VALUES_V4[oppositeVertexIndex];
  if (oppositeValue === undefined) {
    throw new Error("D4 opposite vertex is missing");
  }
  return {
    id: `face-opposite-${oppositeValue}`,
    normal,
    vertexIndices,
    skinCoordinates: vertexIndices.map(skinCoordinate),
    labels: vertexIndices.map((vertexIndex) => {
      const labelUp = normalizePointV4(
        subtractPointsV4(vertex(vertexIndex), origin),
        "D4 label up direction",
      );
      return {
        value: D4_VERTEX_VALUES_V4[vertexIndex],
        alignment: "surface",
        origin: addPointsV4(
          scalePointV4(origin, 0.5),
          scalePointV4(vertex(vertexIndex), 0.5),
        ),
        right: normalizePointV4(
          crossPointsV4(labelUp, normal),
          "D4 label right direction",
        ),
        up: labelUp,
        maxWidth: 0.75,
        maxHeight: 0.57,
        opticalInset: 0.015,
      };
    }),
  };
}

const D4_FACES_V4 = D4_FACE_INDICES_V4.map(face);

function resultOrientation(result: number): QuaternionV4 {
  const resultVertex = D4_VERTEX_POSITIONS_V4[result - 1];
  if (resultVertex === undefined) throw new Error("D4 result vertex is missing");
  const { right } = uprightFaceFrameV4(resultVertex);
  const forward = normalizePointV4(
    crossPointsV4(right, resultVertex),
    "D4 result pose forward direction",
  );
  return quaternionFromFrameV4(right, resultVertex, forward);
}

export const D4_STANDARD_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "d4-standard-r1",
  kind: "polyhedral",
  target: "d4",
  form: "standard",
  vertices: D4_VERTICES_V4,
  faces: D4_FACES_V4,
  skinMapping: { kind: "face-coordinates" },
  resultOrientations: Array.from({ length: 4 }, (_, index) => ({
    result: index + 1,
    rotation: resultOrientation(index + 1),
  })),
  camera: {
    position: [2.5, 3.6, 7],
    target: [0, 0, 0],
    up: [0, 1, 0],
    orthographicHeight: 2.45,
  },
} satisfies PolyhedralGeometryDescriptorV4);
