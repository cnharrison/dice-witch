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

const FRAME_HOLE_SCALE_V4 = 0.78;
const PLAQUE_SCALE_V4 = 0.62;
const SPOKE_START_SCALE_V4 = 0.56;
const SPOKE_END_SCALE_V4 = 0.82;
const SPOKE_HALF_WIDTH_V4 = 0.045;

function standardPosition(index: number): Point3V4 {
  const position = D20_STANDARD_GEOMETRY_V4.vertices[index]?.position;
  if (position === undefined) {
    throw new Error("Hollow-cage source vertex is missing");
  }
  return position;
}

function faceCenter(face: GeometryFaceV4): Point3V4 {
  let total: Point3V4 = [0, 0, 0];
  for (const index of face.vertexIndices) {
    total = addPointsV4(total, standardPosition(index));
  }
  return scalePointV4(total, 1 / face.vertexIndices.length);
}

function pointAtScale(
  center: Point3V4,
  point: Point3V4,
  scale: number,
): Point3V4 {
  return addPointsV4(
    center,
    scalePointV4(subtractPointsV4(point, center), scale),
  );
}

const HOLLOW_VERTICES_V4: GeometryVertexV4[] = [];
const HOLLOW_FACES_V4: GeometryFaceV4[] = [];
const SKIN_POLE_V4 = standardPosition(0);
const SKIN_REFERENCE_V4 = standardPosition(11);

function skinCoordinate(position: Point3V4): Point2V4 {
  return orientedOctahedralSkinCoordinateV4(
    position,
    SKIN_POLE_V4,
    SKIN_REFERENCE_V4,
  );
}

function appendSurface(
  id: string,
  sourceNormal: Point3V4,
  candidatePositions: readonly Point3V4[],
  labels: readonly GeometryLabelFrameV4[] = [],
): void {
  if (candidatePositions.length < 3) {
    throw new Error(`Hollow-cage surface ${id} must have at least three vertices`);
  }
  const positions = [...candidatePositions];
  const [first, second, third] = positions;
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error(`Hollow-cage surface ${id} is incomplete`);
  }
  const winding = crossPointsV4(
    subtractPointsV4(second, first),
    subtractPointsV4(third, first),
  );
  if (dotPointsV4(winding, sourceNormal) < 0) positions.reverse();
  const vertexIndices = positions.map((position) => {
    const index = HOLLOW_VERTICES_V4.length;
    HOLLOW_VERTICES_V4.push({ position });
    return index;
  });
  HOLLOW_FACES_V4.push({
    id,
    normal: sourceNormal,
    vertexIndices,
    skinCoordinates: positions.map(skinCoordinate),
    labels,
  });
}

for (const sourceFace of D20_STANDARD_GEOMETRY_V4.faces) {
  const label = sourceFace.labels[0];
  const value = label?.value;
  if (label === undefined || value === undefined) {
    throw new Error("Hollow-cage source face label is missing");
  }
  const center = faceCenter(sourceFace);
  const corners = sourceFace.vertexIndices.map(standardPosition);
  if (corners.length !== 3) {
    throw new Error("Hollow-cage source face must be triangular");
  }
  const frameCorners = corners.map((corner) =>
    pointAtScale(center, corner, FRAME_HOLE_SCALE_V4),
  );
  const plaqueCorners = corners.map((corner) =>
    pointAtScale(center, corner, PLAQUE_SCALE_V4),
  );

  for (let edgeIndex = 0; edgeIndex < corners.length; edgeIndex += 1) {
    const nextIndex = (edgeIndex + 1) % corners.length;
    const first = corners[edgeIndex];
    const second = corners[nextIndex];
    const frameFirst = frameCorners[edgeIndex];
    const frameSecond = frameCorners[nextIndex];
    if (
      first === undefined ||
      second === undefined ||
      frameFirst === undefined ||
      frameSecond === undefined
    ) {
      throw new Error("Hollow-cage frame surface is incomplete");
    }
    appendSurface(
      `frame-${String(value)}-${String(edgeIndex)}`,
      sourceFace.normal,
      [first, second, frameSecond, frameFirst],
    );
  }

  corners.forEach((corner, cornerIndex) => {
    const axis = normalizePointV4(
      subtractPointsV4(corner, center),
      "Hollow-cage spoke axis",
    );
    const across = normalizePointV4(
      crossPointsV4(sourceFace.normal, axis),
      "Hollow-cage spoke width",
    );
    const start = pointAtScale(center, corner, SPOKE_START_SCALE_V4);
    const end = pointAtScale(center, corner, SPOKE_END_SCALE_V4);
    const width = scalePointV4(across, SPOKE_HALF_WIDTH_V4);
    appendSurface(
      `spoke-${String(value)}-${String(cornerIndex)}`,
      sourceFace.normal,
      [
        subtractPointsV4(start, width),
        subtractPointsV4(end, width),
        addPointsV4(end, width),
        addPointsV4(start, width),
      ],
    );
  });

  appendSurface(`plaque-${String(value)}-0`, sourceFace.normal, plaqueCorners, [
    {
      ...label,
      maxWidth: label.maxWidth * PLAQUE_SCALE_V4,
      maxHeight: label.maxHeight * PLAQUE_SCALE_V4,
      opticalInset: label.opticalInset * PLAQUE_SCALE_V4,
    },
  ]);
}

export const D20_HOLLOW_CAGE_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "d20-hollow-cage-r1",
  kind: "polyhedral",
  target: "d20",
  form: "hollow-cage",
  vertices: HOLLOW_VERTICES_V4,
  faces: HOLLOW_FACES_V4,
  skinMapping: { kind: "view-octahedral", subdivisions: 2 },
  resultOrientations: D20_STANDARD_GEOMETRY_V4.resultOrientations,
  camera: D20_STANDARD_GEOMETRY_V4.camera,
} satisfies PolyhedralGeometryDescriptorV4);
