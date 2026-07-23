import type {
  PhysicalGeometryFaceV4,
  PhysicalPolyhedralMeshV4,
  Point3V4,
} from "@dice-witch/dice-v4-model";
import {
  BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
} from "three";

const HOLLOW_CAGE_PRIMARY_COLOR_V4 = new Color(0x00_00_00);
const HOLLOW_CAGE_CUT_COLOR_V4 = new Color(0x3b_24_10);
const SEGMENT_KEY_SCALE_V4 = 1e12;

type EdgeSegmentV4 = {
  first: Point3V4;
  second: Point3V4;
};

export type PhysicalEdgeGeometryResourcesV4 = {
  geometry: BufferGeometry;
  vertexColors: boolean;
};

function pointKeyV4(point: Point3V4): string {
  return point
    .map((coordinate) => String(Math.round(coordinate * SEGMENT_KEY_SCALE_V4)))
    .join(",");
}

function appendUniqueSegmentV4(
  segments: Map<string, EdgeSegmentV4>,
  first: Point3V4 | undefined,
  second: Point3V4 | undefined,
  faceId: string,
): void {
  if (first === undefined || second === undefined) {
    throw new Error(`Three.js V4 hollow-cage edge is incomplete: ${faceId}`);
  }
  const firstKey = pointKeyV4(first);
  const secondKey = pointKeyV4(second);
  const key =
    firstKey < secondKey
      ? `${firstKey}|${secondKey}`
      : `${secondKey}|${firstKey}`;
  segments.set(key, { first, second });
}

function appendPerimeterV4(
  segments: Map<string, EdgeSegmentV4>,
  face: PhysicalGeometryFaceV4,
): void {
  face.vertices.forEach((vertex, index) => {
    appendUniqueSegmentV4(
      segments,
      vertex,
      face.vertices[(index + 1) % face.vertices.length],
      face.id,
    );
  });
}

function createHollowCageEdgeGeometryV4(
  physical: PhysicalPolyhedralMeshV4,
): BufferGeometry {
  const primarySegments = new Map<string, EdgeSegmentV4>();
  const cutSegments = new Map<string, EdgeSegmentV4>();
  for (const face of physical.faces) {
    if (face.id.startsWith("frame-")) {
      appendUniqueSegmentV4(
        primarySegments,
        face.vertices[0],
        face.vertices[1],
        face.id,
      );
      appendUniqueSegmentV4(
        cutSegments,
        face.vertices[2],
        face.vertices[3],
        face.id,
      );
    } else if (
      face.id.startsWith("spoke-") ||
      face.id.startsWith("plaque-")
    ) {
      appendPerimeterV4(cutSegments, face);
    } else {
      throw new Error(
        `Three.js V4 hollow-cage edge surface is invalid: ${face.id}`,
      );
    }
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const appendSegments = (
    segments: ReadonlyMap<string, EdgeSegmentV4>,
    color: Color,
  ): void => {
    for (const { first, second } of segments.values()) {
      positions.push(...first, ...second);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  };
  appendSegments(primarySegments, HOLLOW_CAGE_PRIMARY_COLOR_V4);
  appendSegments(cutSegments, HOLLOW_CAGE_CUT_COLOR_V4);

  const geometry = new BufferGeometry();
  try {
    geometry.name = `dice-v4-${physical.geometryId}-edges`;
    geometry.userData = {
      geometryId: physical.geometryId,
      edgePolicy: "hollow-cage",
      primarySegmentCount: primarySegments.size,
      cutSegmentCount: cutSegments.size,
    };
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

export function createPhysicalEdgeGeometryV4(
  baseGeometry: BufferGeometry,
  physical: PhysicalPolyhedralMeshV4,
): PhysicalEdgeGeometryResourcesV4 {
  if (
    baseGeometry.userData.geometryId !== physical.geometryId ||
    baseGeometry.userData.result !== physical.result
  ) {
    throw new Error("Three.js V4 edge geometry does not match the physical mesh");
  }
  if (physical.form === "hollow-cage") {
    return {
      geometry: createHollowCageEdgeGeometryV4(physical),
      vertexColors: true,
    };
  }
  const geometry = new EdgesGeometry(baseGeometry, 1);
  geometry.name = `dice-v4-${physical.geometryId}-edges`;
  geometry.userData = {
    geometryId: physical.geometryId,
    edgePolicy: "conventional",
  };
  return { geometry, vertexColors: false };
}
