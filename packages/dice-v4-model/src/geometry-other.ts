import type {
  Point2V4,
  Point3V4,
  SphericalGeometryDescriptorV4,
} from "./geometry";
import { normalizePointV4 } from "./geometry-math";

export type SphereSurfacePointV4 = readonly [x: number, y: number];
export type SphericalSkinSampleV4 = {
  coordinate: Point2V4;
  normal: Point3V4;
};

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function coordinateFromUnitNormal(normal: Point3V4): Point2V4 {
  if (Math.abs(normal[1]) === 1) {
    return [0.5, normal[1] > 0 ? 0 : 1];
  }
  const longitude =
    normal[2] < 0 && normal[0] === 0
      ? -Math.PI
      : Math.atan2(normal[0], normal[2]);
  const latitude = Math.asin(Math.max(-1, Math.min(1, normal[1])));
  return [
    0.5 + longitude / (2 * Math.PI),
    0.5 - latitude / Math.PI,
  ];
}

export function sphericalSkinCoordinateFromNormalV4(
  normal: Point3V4,
): Point2V4 {
  normal.forEach((component) => {
    requireFinite(component, "Sphere normal component");
  });
  return coordinateFromUnitNormal(
    normalizePointV4(normal, "Sphere normal"),
  );
}

export function sphericalNormalFromSkinCoordinateV4(
  coordinate: Point2V4,
): Point3V4 {
  const [u, v] = coordinate;
  requireFinite(u, "Sphere skin u coordinate");
  requireFinite(v, "Sphere skin v coordinate");
  if (u < 0 || u > 1 || v < 0 || v > 1) {
    throw new Error("Sphere skin coordinate must be from zero through one");
  }
  const longitude = (u - 0.5) * 2 * Math.PI;
  const latitude = (0.5 - v) * Math.PI;
  const latitudeRadius = Math.cos(latitude);
  return [
    Math.sin(longitude) * latitudeRadius,
    Math.sin(latitude),
    Math.cos(longitude) * latitudeRadius,
  ];
}

export function mapVisibleSpherePointV4(
  point: SphereSurfacePointV4,
): SphericalSkinSampleV4 | null {
  const [x, y] = point;
  requireFinite(x, "Sphere surface x coordinate");
  requireFinite(y, "Sphere surface y coordinate");
  const squaredRadius = x * x + y * y;
  if (squaredRadius > 1) return null;
  const normal: Point3V4 = [x, y, Math.sqrt(Math.max(0, 1 - squaredRadius))];
  return {
    coordinate: coordinateFromUnitNormal(normal),
    normal,
  };
}

export const OTHER_SPHERE_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "other-sphere-r1",
  kind: "sphere",
  target: "other",
  form: "sphere",
  radius: 1,
  skinMapping: "spherical-inverse-v1",
  labelFrame: {
    origin: [0, 0, 1],
    right: [1, 0, 0],
    up: [0, 1, 0],
    maxWidth: 1.3,
    maxHeight: 0.98,
    opticalInset: 0.04,
  },
  camera: {
    position: [0, 0, 3],
    target: [0, 0, 0],
    up: [0, 1, 0],
    orthographicHeight: 2.25,
  },
} satisfies SphericalGeometryDescriptorV4);
