import {
  buildPhysicalPolyhedralMeshV4,
  getRenderGeometryDescriptorV4,
  projectGeometryPointV4,
  sphericalNormalFromSkinCoordinateV4,
  type GeometryDescriptorV4,
  type PolyhedralGeometryDescriptorV4,
  type RenderDieV4,
  type RendererRevisionV4,
  type SphericalGeometryDescriptorV4,
  type TexturePlacementV4,
} from "@dice-witch/dice-v4-model";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Quaternion,
} from "three";
import { placedTextureUvV4 } from "./texture";

export function geometryDescriptorForDieV4(
  rendererRevision: RendererRevisionV4,
  die: RenderDieV4,
): GeometryDescriptorV4 {
  return getRenderGeometryDescriptorV4(rendererRevision, die);
}

export function createPhysicalPolyhedralGeometryV4(
  descriptor: PolyhedralGeometryDescriptorV4,
  result: number,
  placement: TexturePlacementV4,
  textureMapping: "authored" | "projected-texture" = "authored",
): BufferGeometry {
  if (placement.scope === "face-local") {
    throw new Error("Three.js V4 face-local physical mapping is not implemented");
  }
  const physical = buildPhysicalPolyhedralMeshV4(descriptor, result);
  const positions = physical.mesh.positions.flatMap((point) => [...point]);
  const normals = physical.mesh.normals.flatMap((point) => [...point]);
  let uvs: number[];
  if (textureMapping === "projected-texture") {
    uvs = physical.mesh.positions.flatMap((position) => {
      const [u, v] = projectGeometryPointV4(position, descriptor.camera);
      return [...placedTextureUvV4(u, v, placement)];
    });
  } else {
    uvs = physical.mesh.skinCoordinates.flatMap(([u, v]) =>
      descriptor.skinMapping.kind === "face-coordinates"
        ? [...placedTextureUvV4(u, v, placement)]
        : [u, v],
    );
  }

  const geometry = new BufferGeometry();
  try {
    geometry.name = `dice-v4-${descriptor.id}-physical`;
    geometry.userData.geometryId = descriptor.id;
    geometry.userData.result = result;
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex([...physical.mesh.indices]);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

export function createSphericalGeometryV4(
  descriptor: SphericalGeometryDescriptorV4,
  placement: TexturePlacementV4,
  widthSegments = 64,
  heightSegments = 32,
): BufferGeometry {
  if (placement.scope === "face-local") {
    throw new Error("Three.js V4 face-local physical mapping is not implemented");
  }
  if (
    descriptor.skinMapping !== "spherical-inverse-v1" ||
    !Number.isSafeInteger(widthSegments) ||
    widthSegments < 3 ||
    !Number.isSafeInteger(heightSegments) ||
    heightSegments < 2
  ) {
    throw new Error("Three.js V4 sphere geometry is invalid");
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rowLength = widthSegments + 1;
  for (let row = 0; row <= heightSegments; row += 1) {
    const v = row / heightSegments;
    for (let column = 0; column <= widthSegments; column += 1) {
      const u = column / widthSegments;
      let normal = sphericalNormalFromSkinCoordinateV4([u, v]);
      if (row === 0) normal = [0, 1, 0];
      else if (row === heightSegments) normal = [0, -1, 0];
      positions.push(
        normal[0] * descriptor.radius,
        normal[1] * descriptor.radius,
        normal[2] * descriptor.radius,
      );
      normals.push(...normal);
      let poleOffset = 0;
      if (row === 0) poleOffset = 0.5 / widthSegments;
      else if (row === heightSegments) poleOffset = -0.5 / widthSegments;
      uvs.push(...placedTextureUvV4(u + poleOffset, v, placement));
    }
  }
  for (let row = 0; row < heightSegments; row += 1) {
    for (let column = 0; column < widthSegments; column += 1) {
      const topLeft = row * rowLength + column;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * rowLength + column;
      const bottomRight = bottomLeft + 1;
      if (row > 0) indices.push(topRight, topLeft, bottomRight);
      if (row < heightSegments - 1) {
        indices.push(topLeft, bottomLeft, bottomRight);
      }
    }
  }

  const geometry = new BufferGeometry();
  try {
    geometry.name = `dice-v4-${descriptor.id}-physical`;
    geometry.userData.geometryId = descriptor.id;
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

export function resultQuaternionForDieV4(
  descriptor: PolyhedralGeometryDescriptorV4,
  result: number,
): Quaternion {
  const orientation = descriptor.resultOrientations.find(
    (candidate) => candidate.result === result,
  );
  if (orientation === undefined) {
    throw new Error(`Three.js V4 result orientation is missing: ${result}`);
  }
  return new Quaternion(...orientation.rotation);
}

export function createFaceCoordinateGeometryV4(
  descriptor: PolyhedralGeometryDescriptorV4,
  placement: TexturePlacementV4,
): BufferGeometry {
  if (descriptor.skinMapping.kind !== "face-coordinates") {
    throw new Error(
      `Three.js V4 skin mapping is not implemented: ${descriptor.skinMapping.kind}`,
    );
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const face of descriptor.faces) {
    if (
      face.vertexIndices.length < 3 ||
      face.skinCoordinates.length !== face.vertexIndices.length
    ) {
      throw new Error(`Three.js V4 geometry face is invalid: ${face.id}`);
    }
    const firstVertex = positions.length / 3;
    face.vertexIndices.forEach((vertexIndex, faceVertexIndex) => {
      const vertex = descriptor.vertices[vertexIndex];
      const skinCoordinate = face.skinCoordinates[faceVertexIndex];
      if (vertex === undefined || skinCoordinate === undefined) {
        throw new Error(`Three.js V4 geometry vertex is missing: ${face.id}`);
      }
      positions.push(...vertex.position);
      normals.push(...face.normal);
      uvs.push(...placedTextureUvV4(...skinCoordinate, placement));
    });
    for (let triangle = 1; triangle < face.vertexIndices.length - 1; triangle += 1) {
      indices.push(firstVertex, firstVertex + triangle, firstVertex + triangle + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.name = `dice-v4-${descriptor.id}`;
  geometry.userData.geometryId = descriptor.id;
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
