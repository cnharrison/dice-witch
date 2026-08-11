import type {
  GeometryFaceV4,
  GeometryLabelFrameV4,
  PolyhedralGeometryIdV4,
  GeometryVertexV4,
  Point3V4,
  PolyhedralGeometryDescriptorV4,
  PolyhedralTargetV4,
} from "./geometry";
import {
  addPointsV4,
  crossPointsV4,
  dotPointsV4,
  normalizePointV4,
  octahedralSkinCoordinateV4,
  scalePointV4,
  subtractPointsV4,
} from "./geometry-math";

const CRYSTAL_FACE_INSET_V4 = 0.18;
const HOLLOW_FRAME_INSET_V4 = 0.78;
const HOLLOW_PLAQUE_SCALE_V4 = 0.62;
const HOLLOW_SPOKE_START_V4 = 0.56;
const HOLLOW_SPOKE_END_V4 = 0.82;

function averagePoints(points: readonly Point3V4[], label: string): Point3V4 {
  if (points.length === 0) throw new Error(`${label} point set is empty`);
  const total = points.reduce<Point3V4>(
    (sum, point) => addPointsV4(sum, point),
    [0, 0, 0],
  );
  return scalePointV4(total, 1 / points.length);
}

function sourcePosition(
  source: PolyhedralGeometryDescriptorV4,
  index: number,
  label: string,
): Point3V4 {
  const position = source.vertices[index]?.position;
  if (position === undefined) throw new Error(`${label} source vertex is missing`);
  return position;
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

function scaledLabel(
  label: GeometryLabelFrameV4,
  center: Point3V4,
  scale: number,
): GeometryLabelFrameV4 {
  return {
    ...label,
    origin: pointAtScale(center, label.origin, scale),
    maxWidth: label.maxWidth * scale,
    maxHeight: label.maxHeight * scale,
    opticalInset: label.opticalInset * scale,
  };
}

function geometryId(
  target: PolyhedralTargetV4,
  form: "crystal-cut" | "hollow-cage",
): PolyhedralGeometryIdV4 {
  return `${target}-${form}-r1`;
}

export function createHollowCageGeometryV4(
  source: PolyhedralGeometryDescriptorV4,
): PolyhedralGeometryDescriptorV4 {
  if (source.form !== "standard") {
    throw new Error("Hollow-cage source geometry must use the standard form");
  }
  const vertices: GeometryVertexV4[] = [];
  const faces: GeometryFaceV4[] = [];

  const appendSurface = (
    id: string,
    sourceNormal: Point3V4,
    candidatePositions: readonly Point3V4[],
    labels: readonly GeometryLabelFrameV4[] = [],
  ): void => {
    if (candidatePositions.length < 3) {
      throw new Error(`Hollow-cage surface ${id} must have at least three vertices`);
    }
    const positions = [...candidatePositions];
    const first = positions[0];
    const second = positions[1];
    const third = positions[2];
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error(`Hollow-cage surface ${id} is incomplete`);
    }
    if (
      dotPointsV4(
        crossPointsV4(
          subtractPointsV4(second, first),
          subtractPointsV4(third, first),
        ),
        sourceNormal,
      ) < 0
    ) {
      positions.reverse();
    }
    const vertexIndices = positions.map((position) => {
      const index = vertices.length;
      vertices.push({ position });
      return index;
    });
    faces.push({
      id,
      normal: sourceNormal,
      vertexIndices,
      skinCoordinates: positions.map(octahedralSkinCoordinateV4),
      labels,
    });
  };

  for (const sourceFace of source.faces) {
    const corners = sourceFace.vertexIndices.map((index) =>
      sourcePosition(source, index, "Hollow-cage"),
    );
    if (corners.length < 3) {
      throw new Error(`Hollow-cage source face ${sourceFace.id} is invalid`);
    }
    const center = averagePoints(corners, "Hollow-cage face");
    const frameCorners = corners.map((corner) =>
      pointAtScale(center, corner, HOLLOW_FRAME_INSET_V4),
    );
    const plaqueCorners = corners.map((corner) =>
      pointAtScale(center, corner, HOLLOW_PLAQUE_SCALE_V4),
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
        `frame-${sourceFace.id}-${String(edgeIndex)}`,
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
      const start = pointAtScale(center, corner, HOLLOW_SPOKE_START_V4);
      const end = pointAtScale(center, corner, HOLLOW_SPOKE_END_V4);
      const adjacent = corners[(cornerIndex + 1) % corners.length];
      if (adjacent === undefined) {
        throw new Error("Hollow-cage spoke edge is missing");
      }
      const edgeLength = Math.hypot(
        ...subtractPointsV4(adjacent, corner),
      );
      const width = scalePointV4(across, Math.min(0.045, edgeLength * 0.035));
      appendSurface(
        `spoke-${sourceFace.id}-${String(cornerIndex)}`,
        sourceFace.normal,
        [
          subtractPointsV4(start, width),
          subtractPointsV4(end, width),
          addPointsV4(end, width),
          addPointsV4(start, width),
        ],
      );
    });

    appendSurface(
      `plaque-${sourceFace.id}`,
      sourceFace.normal,
      plaqueCorners,
      sourceFace.labels.map((label) =>
        scaledLabel(label, center, HOLLOW_PLAQUE_SCALE_V4),
      ),
    );
  }

  return Object.freeze({
    version: 1,
    id: geometryId(source.target, "hollow-cage"),
    kind: "polyhedral",
    target: source.target,
    form: "hollow-cage",
    vertices,
    faces,
    skinMapping: { kind: "view-octahedral", subdivisions: 2 },
    resultOrientations: source.resultOrientations,
    camera: source.camera,
  } satisfies PolyhedralGeometryDescriptorV4);
}

type CrystalEdgeUseV4 = {
  sourceStart: number;
  sourceEnd: number;
  crystalStart: number;
  crystalEnd: number;
};

export function createCrystalCutGeometryV4(
  source: PolyhedralGeometryDescriptorV4,
): PolyhedralGeometryDescriptorV4 {
  if (source.form !== "standard") {
    throw new Error("Crystal-cut source geometry must use the standard form");
  }
  const vertices: GeometryVertexV4[] = [];
  const cornerIndices = source.faces.map((face) => {
    const center = averagePoints(
      face.vertexIndices.map((index) =>
        sourcePosition(source, index, "Crystal-cut"),
      ),
      "Crystal-cut face",
    );
    return face.vertexIndices.map((sourceIndex) => {
      const index = vertices.length;
      vertices.push({
        position: pointAtScale(
          center,
          sourcePosition(source, sourceIndex, "Crystal-cut"),
          1 - CRYSTAL_FACE_INSET_V4,
        ),
      });
      return index;
    });
  });

  const cornerIndex = (faceIndex: number, index: number): number => {
    const value = cornerIndices[faceIndex]?.[index];
    if (value === undefined) throw new Error("Crystal-cut corner is missing");
    return value;
  };
  const position = (index: number): Point3V4 => {
    const value = vertices[index]?.position;
    if (value === undefined) throw new Error("Crystal-cut vertex is missing");
    return value;
  };
  const faceNormal = (id: string, indices: readonly number[]): Point3V4 => {
    const first = indices[0];
    const second = indices[1];
    const third = indices[2];
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error(`Crystal-cut face ${id} must have at least three vertices`);
    }
    return normalizePointV4(
      crossPointsV4(
        subtractPointsV4(position(second), position(first)),
        subtractPointsV4(position(third), position(first)),
      ),
      `Crystal-cut face ${id} normal`,
    );
  };
  const outwardFace = (
    id: string,
    candidateIndices: readonly number[],
    labels: readonly GeometryLabelFrameV4[] = [],
  ): GeometryFaceV4 => {
    let vertexIndices = [...candidateIndices];
    let normal = faceNormal(id, vertexIndices);
    const center = averagePoints(vertexIndices.map(position), "Crystal-cut face");
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
      skinCoordinates: vertexIndices.map((index) =>
        octahedralSkinCoordinateV4(position(index)),
      ),
      labels,
    };
  };

  const numberedFaces = source.faces.map((face, faceIndex) => {
    const center = averagePoints(
      face.vertexIndices.map((index) =>
        sourcePosition(source, index, "Crystal-cut"),
      ),
      "Crystal-cut face",
    );
    return outwardFace(
      face.id,
      face.vertexIndices.map((_sourceIndex, index) =>
        cornerIndex(faceIndex, index),
      ),
      face.labels.map((label) =>
        scaledLabel(label, center, 1 - CRYSTAL_FACE_INSET_V4),
      ),
    );
  });

  const edgeUses = new Map<string, CrystalEdgeUseV4[]>();
  source.faces.forEach((face, faceIndex) => {
    face.vertexIndices.forEach((sourceStart, index) => {
      const next = (index + 1) % face.vertexIndices.length;
      const sourceEnd = face.vertexIndices[next];
      if (sourceEnd === undefined) {
        throw new Error("Crystal-cut source edge is incomplete");
      }
      const key = `${String(Math.min(sourceStart, sourceEnd))}:${String(
        Math.max(sourceStart, sourceEnd),
      )}`;
      const uses = edgeUses.get(key) ?? [];
      uses.push({
        sourceStart,
        sourceEnd,
        crystalStart: cornerIndex(faceIndex, index),
        crystalEnd: cornerIndex(faceIndex, next),
      });
      edgeUses.set(key, uses);
    });
  });
  const indexAtSource = (use: CrystalEdgeUseV4, sourceIndex: number): number => {
    if (use.sourceStart === sourceIndex) return use.crystalStart;
    if (use.sourceEnd === sourceIndex) return use.crystalEnd;
    throw new Error("Crystal-cut edge does not contain source vertex");
  };
  const edgeFaces = [...edgeUses.entries()].map(([key, uses]) => {
    const first = uses[0];
    const second = uses[1];
    if (first === undefined || second === undefined || uses.length !== 2) {
      throw new Error(`Crystal-cut source edge ${key} must have two faces`);
    }
    return outwardFace(`edge-${key.replace(":", "-")}`, [
      first.crystalStart,
      first.crystalEnd,
      indexAtSource(second, first.sourceEnd),
      indexAtSource(second, first.sourceStart),
    ]);
  });

  const vertexFaces = source.vertices.map(({ position: sourcePoint }, sourceIndex) => {
    const capIndices = source.faces.flatMap((face, faceIndex) => {
      const index = face.vertexIndices.indexOf(sourceIndex);
      return index < 0 ? [] : [cornerIndex(faceIndex, index)];
    });
    const first = capIndices[0];
    if (first === undefined || capIndices.length < 3) {
      throw new Error("Crystal-cut source vertex must meet at least three faces");
    }
    const center = averagePoints(capIndices.map(position), "Crystal-cut cap");
    const axis = normalizePointV4(sourcePoint, "Crystal-cut vertex axis");
    const reference = normalizePointV4(
      subtractPointsV4(position(first), center),
      "Crystal-cut cap reference",
    );
    const tangent = normalizePointV4(
      crossPointsV4(axis, reference),
      "Crystal-cut cap tangent",
    );
    const ordered = [...capIndices].sort((left, right) => {
      const leftDelta = subtractPointsV4(position(left), center);
      const rightDelta = subtractPointsV4(position(right), center);
      return (
        Math.atan2(
          dotPointsV4(leftDelta, tangent),
          dotPointsV4(leftDelta, reference),
        ) -
        Math.atan2(
          dotPointsV4(rightDelta, tangent),
          dotPointsV4(rightDelta, reference),
        )
      );
    });
    return outwardFace(`vertex-${String(sourceIndex)}`, ordered);
  });

  return Object.freeze({
    version: 1,
    id: geometryId(source.target, "crystal-cut"),
    kind: "polyhedral",
    target: source.target,
    form: "crystal-cut",
    vertices,
    faces: [...numberedFaces, ...edgeFaces, ...vertexFaces],
    skinMapping: { kind: "view-octahedral", subdivisions: 4 },
    resultOrientations: source.resultOrientations,
    camera: source.camera,
  } satisfies PolyhedralGeometryDescriptorV4);
}
