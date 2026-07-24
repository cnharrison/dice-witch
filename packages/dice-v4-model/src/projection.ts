import type {
  GeometryCameraV4,
  GeometryFaceV4,
  Point2V4,
  Point3V4,
  PolyhedralGeometryDescriptorV4,
  PolyhedralGeometryIdV4,
  QuaternionV4,
} from "./geometry";
import {
  addPointsV4,
  crossPointsV4,
  dotPointsV4,
  normalizePointV4,
  orientedOctahedralSkinCoordinateV4,
  rotatePointByQuaternionV4,
  scalePointV4,
  subtractPointsV4,
} from "./geometry-math";

export type ScreenPoint2V4 = readonly [x: number, y: number];

export type ProjectedGeometryVertexV4 = {
  position: ScreenPoint2V4;
  depth: number;
};

export type ProjectedGeometryLabelV4 = {
  value: number;
  alignment: GeometryFaceV4["labels"][number]["alignment"];
  origin: ScreenPoint2V4;
  right: ScreenPoint2V4;
  up: ScreenPoint2V4;
  maxWidth: number;
  maxHeight: number;
  opticalInset: number;
};

export type ProjectedGeometryFaceV4 = {
  id: string;
  vertexIndices: readonly number[];
  skinCoordinates: GeometryFaceV4["skinCoordinates"];
  normal: Point3V4;
  depth: number;
  labels: readonly ProjectedGeometryLabelV4[];
};

export type ProjectedGeometryBoundsV4 = {
  min: ScreenPoint2V4;
  max: ScreenPoint2V4;
};

export type ProjectedGeometryMeshV4 = {
  positions: readonly ScreenPoint2V4[];
  skinCoordinates: readonly Point2V4[];
  indices: readonly number[];
};

export type ProjectedPolyhedralGeometryV4 = {
  version: 1;
  geometryId: PolyhedralGeometryIdV4;
  result: number;
  vertices: readonly ProjectedGeometryVertexV4[];
  visibleFaces: readonly ProjectedGeometryFaceV4[];
  mesh: ProjectedGeometryMeshV4;
  bounds: ProjectedGeometryBoundsV4;
};

export type PhysicalGeometryMeshV4 = {
  positions: readonly Point3V4[];
  normals: readonly Point3V4[];
  skinCoordinates: readonly Point2V4[];
  indices: readonly number[];
  triangleFaceIds: readonly string[];
};

export type PhysicalGeometryFaceV4 = {
  id: string;
  normal: Point3V4;
  vertices: readonly Point3V4[];
};

export type PhysicalGeometryLabelV4 = {
  faceId: string;
  faceLabelIndex: number;
  value: number;
  alignment: GeometryFaceV4["labels"][number]["alignment"];
  normal: Point3V4;
  origin: Point3V4;
  right: Point3V4;
  up: Point3V4;
  maxWidth: number;
  maxHeight: number;
  opticalInset: number;
};

export type PhysicalPolyhedralMeshV4 = {
  version: 1;
  geometryId: PolyhedralGeometryIdV4;
  target: PolyhedralGeometryDescriptorV4["target"];
  form: PolyhedralGeometryDescriptorV4["form"];
  result: number;
  mesh: PhysicalGeometryMeshV4;
  faces: readonly PhysicalGeometryFaceV4[];
  labels: readonly PhysicalGeometryLabelV4[];
};

type CameraFrameV4 = {
  forward: Point3V4;
  right: Point3V4;
  up: Point3V4;
  viewDirection: Point3V4;
};

function cameraFrame(camera: GeometryCameraV4): CameraFrameV4 {
  const forward = normalizePointV4(
    subtractPointsV4(camera.target, camera.position),
    "Geometry camera direction",
  );
  const right = normalizePointV4(
    crossPointsV4(forward, camera.up),
    "Geometry camera right direction",
  );
  return {
    forward,
    right,
    up: normalizePointV4(
      crossPointsV4(right, forward),
      "Geometry camera up direction",
    ),
    viewDirection: scalePointV4(forward, -1),
  };
}

function projectPoint(
  point: Point3V4,
  camera: GeometryCameraV4,
  frame: CameraFrameV4,
): ProjectedGeometryVertexV4 {
  const relativeToTarget = subtractPointsV4(point, camera.target);
  return {
    position: [
      0.5 + dotPointsV4(relativeToTarget, frame.right) / camera.orthographicHeight,
      0.5 - dotPointsV4(relativeToTarget, frame.up) / camera.orthographicHeight,
    ],
    depth: dotPointsV4(
      subtractPointsV4(point, camera.position),
      frame.forward,
    ),
  };
}

function projectVector(
  vector: Point3V4,
  camera: GeometryCameraV4,
  frame: CameraFrameV4,
): ScreenPoint2V4 {
  return [
    dotPointsV4(vector, frame.right) / camera.orthographicHeight,
    -dotPointsV4(vector, frame.up) / camera.orthographicHeight,
  ];
}

function viewerUprightLabelFrame(
  normal: Point3V4,
  frame: CameraFrameV4,
): { right: Point3V4; up: Point3V4 } {
  const right = normalizePointV4(
    subtractPointsV4(
      frame.right,
      scalePointV4(normal, dotPointsV4(frame.right, normal)),
    ),
    "Projected label right direction",
  );
  return {
    right,
    up: normalizePointV4(
      crossPointsV4(normal, right),
      "Projected label up direction",
    ),
  };
}

function faceOrigin(
  face: GeometryFaceV4,
  vertices: readonly Point3V4[],
): Point3V4 {
  if (face.vertexIndices.length < 3) {
    throw new Error(`Geometry face ${face.id} must have at least three vertices`);
  }
  let sum: Point3V4 = [0, 0, 0];
  for (const index of face.vertexIndices) {
    const position = vertices[index];
    if (position === undefined) {
      throw new Error(`Geometry face ${face.id} references a missing vertex`);
    }
    sum = addPointsV4(sum, position);
  }
  return scalePointV4(sum, 1 / face.vertexIndices.length);
}

function bounds(
  vertices: readonly ProjectedGeometryVertexV4[],
): ProjectedGeometryBoundsV4 {
  if (vertices.length === 0) {
    throw new Error("Projected geometry must contain vertices");
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const { position } of vertices) {
    minX = Math.min(minX, position[0]);
    minY = Math.min(minY, position[1]);
    maxX = Math.max(maxX, position[0]);
    maxY = Math.max(maxY, position[1]);
  }
  return { min: [minX, minY], max: [maxX, maxY] };
}

type MutableGeometryMeshV4 = {
  positions: ScreenPoint2V4[];
  skinCoordinates: Point2V4[];
  indices: number[];
};

function appendMeshTriangle(
  mesh: MutableGeometryMeshV4,
  positions: readonly [ScreenPoint2V4, ScreenPoint2V4, ScreenPoint2V4],
  skinCoordinates: readonly [Point2V4, Point2V4, Point2V4],
): void {
  const firstIndex = mesh.positions.length;
  mesh.positions.push(...positions);
  mesh.skinCoordinates.push(...skinCoordinates);
  mesh.indices.push(firstIndex, firstIndex + 1, firstIndex + 2);
}

function barycentricPoint2(
  first: ScreenPoint2V4,
  second: ScreenPoint2V4,
  third: ScreenPoint2V4,
  secondWeight: number,
  thirdWeight: number,
): ScreenPoint2V4 {
  const firstWeight = 1 - secondWeight - thirdWeight;
  return [
    first[0] * firstWeight + second[0] * secondWeight + third[0] * thirdWeight,
    first[1] * firstWeight + second[1] * secondWeight + third[1] * thirdWeight,
  ];
}

function barycentricPoint3(
  first: Point3V4,
  second: Point3V4,
  third: Point3V4,
  secondWeight: number,
  thirdWeight: number,
): Point3V4 {
  const firstWeight = 1 - secondWeight - thirdWeight;
  return [
    first[0] * firstWeight + second[0] * secondWeight + third[0] * thirdWeight,
    first[1] * firstWeight + second[1] * secondWeight + third[1] * thirdWeight,
    first[2] * firstWeight + second[2] * secondWeight + third[2] * thirdWeight,
  ];
}

function faceCoordinateMesh(
  faces: readonly ProjectedGeometryFaceV4[],
  vertices: readonly ProjectedGeometryVertexV4[],
): ProjectedGeometryMeshV4 {
  const mesh: MutableGeometryMeshV4 = {
    positions: [],
    skinCoordinates: [],
    indices: [],
  };
  for (const face of faces) {
    const firstVertexIndex = face.vertexIndices[0];
    const firstPosition =
      firstVertexIndex === undefined
        ? undefined
        : vertices[firstVertexIndex]?.position;
    const firstCoordinate = face.skinCoordinates[0];
    if (firstPosition === undefined || firstCoordinate === undefined) {
      throw new Error(`Geometry face ${face.id} mesh is incomplete`);
    }
    for (let index = 1; index < face.vertexIndices.length - 1; index += 1) {
      const secondVertexIndex = face.vertexIndices[index];
      const thirdVertexIndex = face.vertexIndices[index + 1];
      const secondPosition =
        secondVertexIndex === undefined
          ? undefined
          : vertices[secondVertexIndex]?.position;
      const thirdPosition =
        thirdVertexIndex === undefined
          ? undefined
          : vertices[thirdVertexIndex]?.position;
      const secondCoordinate = face.skinCoordinates[index];
      const thirdCoordinate = face.skinCoordinates[index + 1];
      if (
        secondPosition === undefined ||
        thirdPosition === undefined ||
        secondCoordinate === undefined ||
        thirdCoordinate === undefined
      ) {
        throw new Error(`Geometry face ${face.id} mesh is incomplete`);
      }
      appendMeshTriangle(
        mesh,
        [firstPosition, secondPosition, thirdPosition],
        [firstCoordinate, secondCoordinate, thirdCoordinate],
      );
    }
  }
  return mesh;
}

function appendViewOctahedralTriangle(
  mesh: MutableGeometryMeshV4,
  face: ProjectedGeometryFaceV4,
  vertexIndices: readonly [number, number, number],
  subdivisions: number,
  worldVertices: readonly Point3V4[],
  projectedVertices: readonly ProjectedGeometryVertexV4[],
  frame: CameraFrameV4,
): void {
  const [firstIndex, secondIndex, thirdIndex] = vertexIndices;
  const firstPosition = projectedVertices[firstIndex]?.position;
  const secondPosition = projectedVertices[secondIndex]?.position;
  const thirdPosition = projectedVertices[thirdIndex]?.position;
  const firstObject = worldVertices[firstIndex];
  const secondObject = worldVertices[secondIndex];
  const thirdObject = worldVertices[thirdIndex];
  if (
    firstPosition === undefined ||
    secondPosition === undefined ||
    thirdPosition === undefined ||
    firstObject === undefined ||
    secondObject === undefined ||
    thirdObject === undefined
  ) {
    throw new Error(`Geometry face ${face.id} mesh is incomplete`);
  }
  const pointGrid = Array.from(
    { length: subdivisions + 1 },
    (_, secondStep) =>
      Array.from(
        { length: subdivisions - secondStep + 1 },
        (_, thirdStep) => {
          const secondWeight = secondStep / subdivisions;
          const thirdWeight = thirdStep / subdivisions;
          const object = barycentricPoint3(
            firstObject,
            secondObject,
            thirdObject,
            secondWeight,
            thirdWeight,
          );
          return {
            position: barycentricPoint2(
              firstPosition,
              secondPosition,
              thirdPosition,
              secondWeight,
              thirdWeight,
            ),
            skinCoordinate: orientedOctahedralSkinCoordinateV4(
              object,
              frame.viewDirection,
              frame.right,
            ),
          };
        },
      ),
  );
  const point = (secondStep: number, thirdStep: number) => {
    const value = pointGrid[secondStep]?.[thirdStep];
    if (value === undefined) {
      throw new Error(`Geometry face ${face.id} mesh point is missing`);
    }
    return value;
  };
  for (let secondStep = 0; secondStep < subdivisions; secondStep += 1) {
    for (
      let thirdStep = 0;
      thirdStep < subdivisions - secondStep;
      thirdStep += 1
    ) {
      const first = point(secondStep, thirdStep);
      const second = point(secondStep + 1, thirdStep);
      const third = point(secondStep, thirdStep + 1);
      appendMeshTriangle(
        mesh,
        [first.position, second.position, third.position],
        [first.skinCoordinate, second.skinCoordinate, third.skinCoordinate],
      );
      if (secondStep + thirdStep < subdivisions - 1) {
        const fourth = point(secondStep + 1, thirdStep + 1);
        appendMeshTriangle(
          mesh,
          [second.position, fourth.position, third.position],
          [second.skinCoordinate, fourth.skinCoordinate, third.skinCoordinate],
        );
      }
    }
  }
}

function viewOctahedralMesh(
  geometry: PolyhedralGeometryDescriptorV4,
  faces: readonly ProjectedGeometryFaceV4[],
  worldVertices: readonly Point3V4[],
  projectedVertices: readonly ProjectedGeometryVertexV4[],
  frame: CameraFrameV4,
): ProjectedGeometryMeshV4 {
  const mapping = geometry.skinMapping;
  if (mapping.kind !== "view-octahedral") {
    throw new Error("Geometry skin mapping is not view octahedral");
  }
  if (
    !Number.isSafeInteger(mapping.subdivisions) ||
    mapping.subdivisions < 1 ||
    mapping.subdivisions > 16
  ) {
    throw new Error("Geometry skin subdivisions must be from 1 through 16");
  }
  const mesh: MutableGeometryMeshV4 = {
    positions: [],
    skinCoordinates: [],
    indices: [],
  };
  for (const face of faces) {
    const firstIndex = face.vertexIndices[0];
    if (firstIndex === undefined || face.vertexIndices.length < 3) {
      throw new Error(`Geometry face ${face.id} must have at least three vertices`);
    }
    for (let index = 1; index < face.vertexIndices.length - 1; index += 1) {
      const secondIndex = face.vertexIndices[index];
      const thirdIndex = face.vertexIndices[index + 1];
      if (secondIndex === undefined || thirdIndex === undefined) {
        throw new Error(`Geometry face ${face.id} mesh is incomplete`);
      }
      appendViewOctahedralTriangle(
        mesh,
        face,
        [firstIndex, secondIndex, thirdIndex],
        mapping.subdivisions,
        worldVertices,
        projectedVertices,
        frame,
      );
    }
  }
  return mesh;
}

function geometryMesh(
  geometry: PolyhedralGeometryDescriptorV4,
  faces: readonly ProjectedGeometryFaceV4[],
  worldVertices: readonly Point3V4[],
  projectedVertices: readonly ProjectedGeometryVertexV4[],
  frame: CameraFrameV4,
): ProjectedGeometryMeshV4 {
  return geometry.skinMapping.kind === "face-coordinates"
    ? faceCoordinateMesh(faces, projectedVertices)
    : viewOctahedralMesh(
        geometry,
        faces,
        worldVertices,
        projectedVertices,
        frame,
      );
}

type MutablePhysicalGeometryMeshV4 = {
  positions: Point3V4[];
  normals: Point3V4[];
  skinCoordinates: Point2V4[];
  indices: number[];
  triangleFaceIds: string[];
};

function emptyPhysicalGeometryMesh(): MutablePhysicalGeometryMeshV4 {
  return {
    positions: [],
    normals: [],
    skinCoordinates: [],
    indices: [],
    triangleFaceIds: [],
  };
}

function appendPhysicalMeshTriangle(
  mesh: MutablePhysicalGeometryMeshV4,
  faceId: string,
  normal: Point3V4,
  positions: readonly [Point3V4, Point3V4, Point3V4],
  skinCoordinates: readonly [Point2V4, Point2V4, Point2V4],
): void {
  const firstIndex = mesh.positions.length;
  mesh.positions.push(...positions);
  mesh.normals.push(normal, normal, normal);
  mesh.skinCoordinates.push(...skinCoordinates);
  mesh.indices.push(firstIndex, firstIndex + 1, firstIndex + 2);
  mesh.triangleFaceIds.push(faceId);
}

function physicalFaceCoordinateMesh(
  geometry: PolyhedralGeometryDescriptorV4,
  worldVertices: readonly Point3V4[],
  rotation: QuaternionV4,
): PhysicalGeometryMeshV4 {
  const mesh = emptyPhysicalGeometryMesh();
  for (const face of geometry.faces) {
    if (face.vertexIndices.length < 3) {
      throw new Error(`Geometry face ${face.id} must have at least three vertices`);
    }
    if (face.skinCoordinates.length !== face.vertexIndices.length) {
      throw new Error(`Geometry face ${face.id} mesh is incomplete`);
    }
    const firstVertexIndex = face.vertexIndices[0];
    const firstPosition =
      firstVertexIndex === undefined ? undefined : worldVertices[firstVertexIndex];
    const firstCoordinate = face.skinCoordinates[0];
    if (firstPosition === undefined || firstCoordinate === undefined) {
      throw new Error(`Geometry face ${face.id} mesh is incomplete`);
    }
    const normal = rotatePointByQuaternionV4(face.normal, rotation);
    for (let index = 1; index < face.vertexIndices.length - 1; index += 1) {
      const secondVertexIndex = face.vertexIndices[index];
      const thirdVertexIndex = face.vertexIndices[index + 1];
      const secondPosition =
        secondVertexIndex === undefined
          ? undefined
          : worldVertices[secondVertexIndex];
      const thirdPosition =
        thirdVertexIndex === undefined ? undefined : worldVertices[thirdVertexIndex];
      const secondCoordinate = face.skinCoordinates[index];
      const thirdCoordinate = face.skinCoordinates[index + 1];
      if (
        secondPosition === undefined ||
        thirdPosition === undefined ||
        secondCoordinate === undefined ||
        thirdCoordinate === undefined
      ) {
        throw new Error(`Geometry face ${face.id} mesh is incomplete`);
      }
      appendPhysicalMeshTriangle(
        mesh,
        face.id,
        normal,
        [firstPosition, secondPosition, thirdPosition],
        [firstCoordinate, secondCoordinate, thirdCoordinate],
      );
    }
  }
  return mesh;
}

function appendPhysicalViewOctahedralTriangle(
  mesh: MutablePhysicalGeometryMeshV4,
  face: GeometryFaceV4,
  normal: Point3V4,
  vertexIndices: readonly [number, number, number],
  subdivisions: number,
  worldVertices: readonly Point3V4[],
  frame: CameraFrameV4,
): void {
  const [firstIndex, secondIndex, thirdIndex] = vertexIndices;
  const firstPosition = worldVertices[firstIndex];
  const secondPosition = worldVertices[secondIndex];
  const thirdPosition = worldVertices[thirdIndex];
  if (
    firstPosition === undefined ||
    secondPosition === undefined ||
    thirdPosition === undefined
  ) {
    throw new Error(`Geometry face ${face.id} mesh is incomplete`);
  }
  const pointGrid = Array.from(
    { length: subdivisions + 1 },
    (_, secondStep) =>
      Array.from(
        { length: subdivisions - secondStep + 1 },
        (_, thirdStep) => {
          const position = barycentricPoint3(
            firstPosition,
            secondPosition,
            thirdPosition,
            secondStep / subdivisions,
            thirdStep / subdivisions,
          );
          return {
            position,
            skinCoordinate: orientedOctahedralSkinCoordinateV4(
              position,
              frame.viewDirection,
              frame.right,
            ),
          };
        },
      ),
  );
  const point = (secondStep: number, thirdStep: number) => {
    const value = pointGrid[secondStep]?.[thirdStep];
    if (value === undefined) {
      throw new Error(`Geometry face ${face.id} mesh point is missing`);
    }
    return value;
  };
  for (let secondStep = 0; secondStep < subdivisions; secondStep += 1) {
    for (
      let thirdStep = 0;
      thirdStep < subdivisions - secondStep;
      thirdStep += 1
    ) {
      const first = point(secondStep, thirdStep);
      const second = point(secondStep + 1, thirdStep);
      const third = point(secondStep, thirdStep + 1);
      appendPhysicalMeshTriangle(
        mesh,
        face.id,
        normal,
        [first.position, second.position, third.position],
        [first.skinCoordinate, second.skinCoordinate, third.skinCoordinate],
      );
      if (secondStep + thirdStep < subdivisions - 1) {
        const fourth = point(secondStep + 1, thirdStep + 1);
        appendPhysicalMeshTriangle(
          mesh,
          face.id,
          normal,
          [second.position, fourth.position, third.position],
          [second.skinCoordinate, fourth.skinCoordinate, third.skinCoordinate],
        );
      }
    }
  }
}

function physicalViewOctahedralMesh(
  geometry: PolyhedralGeometryDescriptorV4,
  worldVertices: readonly Point3V4[],
  rotation: QuaternionV4,
  frame: CameraFrameV4,
): PhysicalGeometryMeshV4 {
  const mapping = geometry.skinMapping;
  if (mapping.kind !== "view-octahedral") {
    throw new Error("Geometry skin mapping is not view octahedral");
  }
  if (
    !Number.isSafeInteger(mapping.subdivisions) ||
    mapping.subdivisions < 1 ||
    mapping.subdivisions > 16
  ) {
    throw new Error("Geometry skin subdivisions must be from 1 through 16");
  }
  const mesh = emptyPhysicalGeometryMesh();
  for (const face of geometry.faces) {
    const firstIndex = face.vertexIndices[0];
    if (firstIndex === undefined || face.vertexIndices.length < 3) {
      throw new Error(`Geometry face ${face.id} must have at least three vertices`);
    }
    const normal = rotatePointByQuaternionV4(face.normal, rotation);
    for (let index = 1; index < face.vertexIndices.length - 1; index += 1) {
      const secondIndex = face.vertexIndices[index];
      const thirdIndex = face.vertexIndices[index + 1];
      if (secondIndex === undefined || thirdIndex === undefined) {
        throw new Error(`Geometry face ${face.id} mesh is incomplete`);
      }
      appendPhysicalViewOctahedralTriangle(
        mesh,
        face,
        normal,
        [firstIndex, secondIndex, thirdIndex],
        mapping.subdivisions,
        worldVertices,
        frame,
      );
    }
  }
  return mesh;
}

function physicalGeometryFaces(
  geometry: PolyhedralGeometryDescriptorV4,
  worldVertices: readonly Point3V4[],
  rotation: QuaternionV4,
): readonly PhysicalGeometryFaceV4[] {
  return geometry.faces.map((face) => ({
    id: face.id,
    normal: rotatePointByQuaternionV4(face.normal, rotation),
    vertices: face.vertexIndices.map((vertexIndex) => {
      const vertex = worldVertices[vertexIndex];
      if (vertex === undefined) {
        throw new Error(`Geometry face ${face.id} references a missing vertex`);
      }
      return vertex;
    }),
  }));
}

function physicalGeometryLabels(
  geometry: PolyhedralGeometryDescriptorV4,
  rotation: QuaternionV4,
  frame: CameraFrameV4,
): readonly PhysicalGeometryLabelV4[] {
  return geometry.faces.flatMap((face) => {
    const normal = rotatePointByQuaternionV4(face.normal, rotation);
    return face.labels.map((label, faceLabelIndex) => {
      const labelFrame =
        label.alignment === "viewer-upright"
          ? viewerUprightLabelFrame(normal, frame)
          : {
              right: rotatePointByQuaternionV4(label.right, rotation),
              up: rotatePointByQuaternionV4(label.up, rotation),
            };
      return {
        faceId: face.id,
        faceLabelIndex,
        value: label.value,
        alignment: label.alignment,
        normal,
        origin: rotatePointByQuaternionV4(label.origin, rotation),
        right: labelFrame.right,
        up: labelFrame.up,
        maxWidth: label.maxWidth,
        maxHeight: label.maxHeight,
        opticalInset: label.opticalInset,
      };
    });
  });
}

export function buildPhysicalPolyhedralMeshV4(
  geometry: PolyhedralGeometryDescriptorV4,
  result: number,
): PhysicalPolyhedralMeshV4 {
  if (
    !Number.isFinite(geometry.camera.orthographicHeight) ||
    geometry.camera.orthographicHeight <= 0
  ) {
    throw new Error("Geometry camera orthographic height must be positive");
  }
  const orientation = geometry.resultOrientations.find(
    (candidate) => candidate.result === result,
  );
  if (orientation === undefined) {
    throw new Error(
      `Geometry result orientation is not implemented: ${geometry.id}:${result}`,
    );
  }
  const frame = cameraFrame(geometry.camera);
  const worldVertices = geometry.vertices.map(({ position }) =>
    rotatePointByQuaternionV4(position, orientation.rotation),
  );
  return {
    version: 1,
    geometryId: geometry.id,
    target: geometry.target,
    form: geometry.form,
    result,
    mesh:
      geometry.skinMapping.kind === "face-coordinates"
        ? physicalFaceCoordinateMesh(
            geometry,
            worldVertices,
            orientation.rotation,
          )
        : physicalViewOctahedralMesh(
            geometry,
            worldVertices,
            orientation.rotation,
            frame,
          ),
    faces: physicalGeometryFaces(
      geometry,
      worldVertices,
      orientation.rotation,
    ),
    labels: physicalGeometryLabels(geometry, orientation.rotation, frame),
  };
}

export function projectGeometryPointV4(
  point: Point3V4,
  camera: GeometryCameraV4,
): ScreenPoint2V4 {
  return projectPoint(point, camera, cameraFrame(camera)).position;
}

export function projectGeometryVectorV4(
  vector: Point3V4,
  camera: GeometryCameraV4,
): ScreenPoint2V4 {
  return projectVector(vector, camera, cameraFrame(camera));
}

export function projectPolyhedralGeometryV4(
  geometry: PolyhedralGeometryDescriptorV4,
  result: number,
): ProjectedPolyhedralGeometryV4 {
  if (
    !Number.isFinite(geometry.camera.orthographicHeight) ||
    geometry.camera.orthographicHeight <= 0
  ) {
    throw new Error("Geometry camera orthographic height must be positive");
  }
  const orientation = geometry.resultOrientations.find(
    (candidate) => candidate.result === result,
  );
  if (orientation === undefined) {
    throw new Error(
      `Geometry result orientation is not implemented: ${geometry.id}:${result}`,
    );
  }
  const frame = cameraFrame(geometry.camera);
  const worldVertices = geometry.vertices.map(({ position }) =>
    rotatePointByQuaternionV4(position, orientation.rotation),
  );
  const projectedVertices = worldVertices.map((point) =>
    projectPoint(point, geometry.camera, frame),
  );
  const visibleFaces = geometry.faces
    .flatMap((face): ProjectedGeometryFaceV4[] => {
      const normal = rotatePointByQuaternionV4(
        face.normal,
        orientation.rotation,
      );
      if (dotPointsV4(normal, frame.viewDirection) <= 0) return [];
      const origin = faceOrigin(face, worldVertices);
      const projectedOrigin = projectPoint(origin, geometry.camera, frame);
      return [
        {
          id: face.id,
          vertexIndices: face.vertexIndices,
          skinCoordinates: face.skinCoordinates,
          normal,
          depth: projectedOrigin.depth,
          labels: face.labels.map((label) => {
            const labelOrigin = rotatePointByQuaternionV4(
              label.origin,
              orientation.rotation,
            );
            const labelFrame =
              label.alignment === "viewer-upright"
                ? viewerUprightLabelFrame(normal, frame)
                : {
                    right: rotatePointByQuaternionV4(
                      label.right,
                      orientation.rotation,
                    ),
                    up: rotatePointByQuaternionV4(
                      label.up,
                      orientation.rotation,
                    ),
                  };
            return {
              value: label.value,
              alignment: label.alignment,
              origin: projectPoint(labelOrigin, geometry.camera, frame).position,
              right: projectVector(labelFrame.right, geometry.camera, frame),
              up: projectVector(labelFrame.up, geometry.camera, frame),
              maxWidth: label.maxWidth,
              maxHeight: label.maxHeight,
              opticalInset: label.opticalInset,
            };
          }),
        },
      ];
    })
    .sort((left, right) => right.depth - left.depth);
  if (visibleFaces.length === 0) {
    throw new Error(`Geometry projection has no visible faces: ${geometry.id}`);
  }
  return {
    version: 1,
    geometryId: geometry.id,
    result,
    vertices: projectedVertices,
    visibleFaces,
    mesh: geometryMesh(
      geometry,
      visibleFaces,
      worldVertices,
      projectedVertices,
      frame,
    ),
    bounds: bounds(projectedVertices),
  };
}
