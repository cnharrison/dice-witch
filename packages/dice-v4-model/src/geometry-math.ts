import type { Point2V4, Point3V4, QuaternionV4 } from "./geometry";

export function addPointsV4(left: Point3V4, right: Point3V4): Point3V4 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function scalePointV4(vector: Point3V4, amount: number): Point3V4 {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

export function subtractPointsV4(
  left: Point3V4,
  right: Point3V4,
): Point3V4 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

export function dotPointsV4(left: Point3V4, right: Point3V4): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function crossPointsV4(
  left: Point3V4,
  right: Point3V4,
): Point3V4 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function normalizePointV4(
  vector: Point3V4,
  label: string,
): Point3V4 {
  const length = Math.sqrt(dotPointsV4(vector, vector));
  if (length === 0) throw new Error(`${label} must be non-zero`);
  return scalePointV4(vector, 1 / length);
}

function sign(value: number): number {
  return value < 0 ? -1 : 1;
}

export function octahedralSkinCoordinateV4(position: Point3V4): Point2V4 {
  const divisor =
    Math.abs(position[0]) + Math.abs(position[1]) + Math.abs(position[2]);
  if (divisor === 0) {
    throw new Error("Geometry skin position must be non-zero");
  }
  let x = position[0] / divisor;
  let y = position[1] / divisor;
  const z = position[2] / divisor;
  if (z < 0) {
    const priorX = x;
    x = (1 - Math.abs(y)) * sign(priorX);
    y = (1 - Math.abs(priorX)) * sign(y);
  }
  return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}

function skinCoordinateFrame(
  northPole: Point3V4,
  reference: Point3V4,
): readonly [right: Point3V4, up: Point3V4, axis: Point3V4] {
  const axis = normalizePointV4(northPole, "Geometry skin pole");
  const right = normalizePointV4(
    subtractPointsV4(
      reference,
      scalePointV4(axis, dotPointsV4(reference, axis)),
    ),
    "Geometry skin reference",
  );
  return [right, crossPointsV4(axis, right), axis];
}

export function orientedOctahedralSkinCoordinateV4(
  position: Point3V4,
  northPole: Point3V4,
  reference: Point3V4,
): Point2V4 {
  const [right, up, axis] = skinCoordinateFrame(northPole, reference);
  return octahedralSkinCoordinateV4([
    dotPointsV4(position, right),
    dotPointsV4(position, up),
    dotPointsV4(position, axis),
  ]);
}

export function polarSkinCoordinateV4(
  position: Point3V4,
  northPole: Point3V4,
  reference: Point3V4,
): Point2V4 {
  const [right, up, axis] = skinCoordinateFrame(northPole, reference);
  const direction = normalizePointV4(position, "Geometry skin position");
  const axial = Math.max(-1, Math.min(1, dotPointsV4(direction, axis)));
  const radialX = dotPointsV4(direction, right);
  const radialY = dotPointsV4(direction, up);
  const radialLength = Math.hypot(radialX, radialY);
  if (radialLength < 1e-12) {
    return [0.5, axial >= 0 ? 0 : 1];
  }
  return [
    (Math.atan2(radialY, radialX) / (Math.PI * 2) + 1) % 1,
    Math.acos(axial) / Math.PI,
  ];
}

function scaleQuaternion(
  quaternion: QuaternionV4,
  amount: number,
): QuaternionV4 {
  return [
    quaternion[0] * amount,
    quaternion[1] * amount,
    quaternion[2] * amount,
    quaternion[3] * amount,
  ];
}

function normalizeQuaternion(quaternion: QuaternionV4): QuaternionV4 {
  const length = Math.hypot(...quaternion);
  if (length === 0) throw new Error("Geometry orientation must be non-zero");
  return scaleQuaternion(quaternion, 1 / length);
}

function canonicalQuaternion(quaternion: QuaternionV4): QuaternionV4 {
  const normalized = normalizeQuaternion(quaternion);
  return normalized[3] < 0 ? scaleQuaternion(normalized, -1) : normalized;
}

export function rotatePointByQuaternionV4(
  point: Point3V4,
  quaternion: QuaternionV4,
): Point3V4 {
  const axis: Point3V4 = [quaternion[0], quaternion[1], quaternion[2]];
  const axisCross = crossPointsV4(axis, point);
  const twiceCross = scalePointV4(axisCross, 2);
  const correction = crossPointsV4(axis, twiceCross);
  return addPointsV4(
    addPointsV4(point, scalePointV4(twiceCross, quaternion[3])),
    correction,
  );
}

export function multiplyQuaternionsV4(
  left: QuaternionV4,
  right: QuaternionV4,
): QuaternionV4 {
  const [leftX, leftY, leftZ, leftW] = left;
  const [rightX, rightY, rightZ, rightW] = right;
  return canonicalQuaternion([
    leftW * rightX + leftX * rightW + leftY * rightZ - leftZ * rightY,
    leftW * rightY - leftX * rightZ + leftY * rightW + leftZ * rightX,
    leftW * rightZ + leftX * rightY - leftY * rightX + leftZ * rightW,
    leftW * rightW - leftX * rightX - leftY * rightY - leftZ * rightZ,
  ]);
}

export function quaternionFromFrameV4(
  right: Point3V4,
  up: Point3V4,
  normal: Point3V4,
): QuaternionV4 {
  const m00 = right[0];
  const m01 = right[1];
  const m02 = right[2];
  const m10 = up[0];
  const m11 = up[1];
  const m12 = up[2];
  const m20 = normal[0];
  const m21 = normal[1];
  const m22 = normal[2];
  const trace = m00 + m11 + m22;
  let quaternion: QuaternionV4;
  if (trace > 0) {
    const amount = Math.sqrt(trace + 1) * 2;
    quaternion = [
      (m21 - m12) / amount,
      (m02 - m20) / amount,
      (m10 - m01) / amount,
      amount / 4,
    ];
  } else if (m00 > m11 && m00 > m22) {
    const amount = Math.sqrt(1 + m00 - m11 - m22) * 2;
    quaternion = [
      amount / 4,
      (m01 + m10) / amount,
      (m02 + m20) / amount,
      (m21 - m12) / amount,
    ];
  } else if (m11 > m22) {
    const amount = Math.sqrt(1 + m11 - m00 - m22) * 2;
    quaternion = [
      (m01 + m10) / amount,
      amount / 4,
      (m12 + m21) / amount,
      (m02 - m20) / amount,
    ];
  } else {
    const amount = Math.sqrt(1 + m22 - m00 - m11) * 2;
    quaternion = [
      (m02 + m20) / amount,
      (m12 + m21) / amount,
      amount / 4,
      (m10 - m01) / amount,
    ];
  }
  return canonicalQuaternion(quaternion);
}

export function uprightFaceFrameV4(normal: Point3V4): {
  right: Point3V4;
  up: Point3V4;
} {
  const upReference: Point3V4 =
    Math.abs(normal[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const up = normalizePointV4(
    subtractPointsV4(
      upReference,
      scalePointV4(normal, dotPointsV4(upReference, normal)),
    ),
    "Geometry face up direction",
  );
  return {
    right: normalizePointV4(
      crossPointsV4(up, normal),
      "Geometry face right direction",
    ),
    up,
  };
}
