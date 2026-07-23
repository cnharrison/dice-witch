import { D20_STANDARD_GEOMETRY_V4 } from "./geometry-d20";
import type {
  GeometryFaceV4,
  GeometryLabelFrameV4,
  GeometryVertexV4,
  Point2V4,
  Point3V4,
  PolyhedralGeometryDescriptorV4,
} from "./geometry";
import {
  addPointsV4,
  crossPointsV4,
  dotPointsV4,
  normalizePointV4,
  orientedOctahedralSkinCoordinateV4,
  scalePointV4,
  subtractPointsV4,
} from "./geometry-math";

const FACE_INSET_FRACTION_V4 = 0.18;
const NUMBERED_LABEL_SCALE_V4 = 1 - FACE_INSET_FRACTION_V4;

type EdgeUseV4 = {
  sourceStart: number;
  sourceEnd: number;
  crystalStart: number;
  crystalEnd: number;
};

function standardPosition(index: number): Point3V4 {
  const position = D20_STANDARD_GEOMETRY_V4.vertices[index]?.position;
  if (position === undefined) {
    throw new Error("Crystal-cut source vertex is missing");
  }
  return position;
}

function averagePoints(points: readonly Point3V4[]): Point3V4 {
  if (points.length === 0) throw new Error("Crystal-cut point set is empty");
  let total: Point3V4 = [0, 0, 0];
  for (const point of points) total = addPointsV4(total, point);
  return scalePointV4(total, 1 / points.length);
}

const CRYSTAL_VERTICES_V4: GeometryVertexV4[] = [];
const CRYSTAL_CORNER_INDICES_V4 = D20_STANDARD_GEOMETRY_V4.faces.map(
  (face) => {
    const faceCenter = averagePoints(
      face.vertexIndices.map(standardPosition),
    );
    return face.vertexIndices.map((sourceIndex) => {
      const crystalIndex = CRYSTAL_VERTICES_V4.length;
      CRYSTAL_VERTICES_V4.push({
        position: addPointsV4(
          scalePointV4(
            standardPosition(sourceIndex),
            1 - FACE_INSET_FRACTION_V4,
          ),
          scalePointV4(faceCenter, FACE_INSET_FRACTION_V4),
        ),
      });
      return crystalIndex;
    });
  },
);

function crystalCornerIndex(faceIndex: number, cornerIndex: number): number {
  const value = CRYSTAL_CORNER_INDICES_V4[faceIndex]?.[cornerIndex];
  if (value === undefined) throw new Error("Crystal-cut corner is missing");
  return value;
}

function crystalPosition(index: number): Point3V4 {
  const position = CRYSTAL_VERTICES_V4[index]?.position;
  if (position === undefined) throw new Error("Crystal-cut vertex is missing");
  return position;
}

const SKIN_POLE_V4 = standardPosition(0);
const SKIN_REFERENCE_V4 = standardPosition(11);

function skinCoordinate(index: number): Point2V4 {
  return orientedOctahedralSkinCoordinateV4(
    crystalPosition(index),
    SKIN_POLE_V4,
    SKIN_REFERENCE_V4,
  );
}

function faceNormal(id: string, vertexIndices: readonly number[]): Point3V4 {
  const [firstIndex, secondIndex, thirdIndex] = vertexIndices;
  if (
    firstIndex === undefined ||
    secondIndex === undefined ||
    thirdIndex === undefined
  ) {
    throw new Error(`Crystal-cut face ${id} must have at least three vertices`);
  }
  const first = crystalPosition(firstIndex);
  return normalizePointV4(
    crossPointsV4(
      subtractPointsV4(crystalPosition(secondIndex), first),
      subtractPointsV4(crystalPosition(thirdIndex), first),
    ),
    `Crystal-cut face ${id} normal`,
  );
}

function outwardFace(
  id: string,
  candidateIndices: readonly number[],
  labels: readonly GeometryLabelFrameV4[] = [],
): GeometryFaceV4 {
  let vertexIndices = [...candidateIndices];
  let normal = faceNormal(id, vertexIndices);
  const center = averagePoints(vertexIndices.map(crystalPosition));
  if (dotPointsV4(normal, center) <= 0) {
    const first = vertexIndices[0];
    if (first === undefined) throw new Error(`Crystal-cut face ${id} is empty`);
    vertexIndices = [first, ...vertexIndices.slice(1).reverse()];
    normal = faceNormal(id, vertexIndices);
  }
  if (dotPointsV4(normal, center) <= 0) {
    throw new Error(`Crystal-cut face ${id} winding must point outward`);
  }
  return {
    id,
    normal,
    vertexIndices,
    skinCoordinates: vertexIndices.map(skinCoordinate),
    labels,
  };
}

const NUMBERED_FACES_V4 = D20_STANDARD_GEOMETRY_V4.faces.map(
  (face, faceIndex) =>
    outwardFace(
      face.id,
      face.vertexIndices.map((_, cornerIndex) =>
        crystalCornerIndex(faceIndex, cornerIndex),
      ),
      face.labels.map((label) => ({
        ...label,
        maxWidth: label.maxWidth * NUMBERED_LABEL_SCALE_V4,
        maxHeight: label.maxHeight * NUMBERED_LABEL_SCALE_V4,
      })),
    ),
);

const EDGE_USES_V4 = new Map<string, EdgeUseV4[]>();
D20_STANDARD_GEOMETRY_V4.faces.forEach((face, faceIndex) => {
  face.vertexIndices.forEach((sourceStart, cornerIndex) => {
    const nextCorner = (cornerIndex + 1) % face.vertexIndices.length;
    const sourceEnd = face.vertexIndices[nextCorner];
    if (sourceEnd === undefined) {
      throw new Error("Crystal-cut source edge is incomplete");
    }
    const low = Math.min(sourceStart, sourceEnd);
    const high = Math.max(sourceStart, sourceEnd);
    const key = `${String(low)}:${String(high)}`;
    const uses = EDGE_USES_V4.get(key) ?? [];
    uses.push({
      sourceStart,
      sourceEnd,
      crystalStart: crystalCornerIndex(faceIndex, cornerIndex),
      crystalEnd: crystalCornerIndex(faceIndex, nextCorner),
    });
    EDGE_USES_V4.set(key, uses);
  });
});

function crystalIndexAtSource(use: EdgeUseV4, sourceIndex: number): number {
  if (use.sourceStart === sourceIndex) return use.crystalStart;
  if (use.sourceEnd === sourceIndex) return use.crystalEnd;
  throw new Error("Crystal-cut edge does not contain source vertex");
}

const EDGE_FACES_V4 = [...EDGE_USES_V4.entries()].map(([key, uses]) => {
  const [first, second] = uses;
  if (first === undefined || second === undefined || uses.length !== 2) {
    throw new Error(`Crystal-cut source edge ${key} must have two faces`);
  }
  return outwardFace(`edge-${key.replace(":", "-")}`, [
    first.crystalStart,
    first.crystalEnd,
    crystalIndexAtSource(second, first.sourceEnd),
    crystalIndexAtSource(second, first.sourceStart),
  ]);
});

const VERTEX_FACES_V4 = D20_STANDARD_GEOMETRY_V4.vertices.map(
  ({ position: sourcePosition }, sourceIndex) => {
    const capIndices = D20_STANDARD_GEOMETRY_V4.faces.flatMap(
      (face, faceIndex) => {
        const cornerIndex = face.vertexIndices.indexOf(sourceIndex);
        return cornerIndex < 0
          ? []
          : [crystalCornerIndex(faceIndex, cornerIndex)];
      },
    );
    const firstCapIndex = capIndices[0];
    if (capIndices.length !== 5 || firstCapIndex === undefined) {
      throw new Error("Crystal-cut source vertex must meet five faces");
    }
    const center = averagePoints(capIndices.map(crystalPosition));
    const axis = normalizePointV4(sourcePosition, "Crystal-cut vertex axis");
    const reference = normalizePointV4(
      subtractPointsV4(crystalPosition(firstCapIndex), center),
      "Crystal-cut cap reference",
    );
    const tangent = normalizePointV4(
      crossPointsV4(axis, reference),
      "Crystal-cut cap tangent",
    );
    const ordered = [...capIndices].sort((left, right) => {
      const leftDelta = subtractPointsV4(crystalPosition(left), center);
      const rightDelta = subtractPointsV4(crystalPosition(right), center);
      const leftAngle = Math.atan2(
        dotPointsV4(leftDelta, tangent),
        dotPointsV4(leftDelta, reference),
      );
      const rightAngle = Math.atan2(
        dotPointsV4(rightDelta, tangent),
        dotPointsV4(rightDelta, reference),
      );
      return leftAngle - rightAngle;
    });
    return outwardFace(`vertex-${String(sourceIndex)}`, ordered);
  },
);

export const D20_CRYSTAL_CUT_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "d20-crystal-cut-r1",
  kind: "polyhedral",
  target: "d20",
  form: "crystal-cut",
  vertices: CRYSTAL_VERTICES_V4,
  faces: [
    ...NUMBERED_FACES_V4,
    ...EDGE_FACES_V4,
    ...VERTEX_FACES_V4,
  ],
  skinMapping: { kind: "view-octahedral", subdivisions: 4 },
  resultOrientations: D20_STANDARD_GEOMETRY_V4.resultOrientations,
  camera: D20_STANDARD_GEOMETRY_V4.camera,
} satisfies PolyhedralGeometryDescriptorV4);
