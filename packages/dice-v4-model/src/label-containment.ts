export type LabelContainmentPointV4 = readonly [x: number, y: number];

function crossProduct(
  start: LabelContainmentPointV4,
  end: LabelContainmentPointV4,
  point: LabelContainmentPointV4,
): number {
  return (
    (end[0] - start[0]) * (point[1] - start[1]) -
    (end[1] - start[1]) * (point[0] - start[0])
  );
}

export function minimumConvexPolygonClearanceV4(
  polygon: readonly LabelContainmentPointV4[],
  points: readonly LabelContainmentPointV4[],
): number {
  if (polygon.length < 3) {
    throw new Error("Label containment polygon is invalid");
  }
  if (points.length === 0) {
    throw new Error("Label containment points are empty");
  }
  const center: LabelContainmentPointV4 = [
    polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length,
    polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length,
  ];
  let minimum = Number.POSITIVE_INFINITY;

  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    if (end === undefined) {
      throw new Error("Label containment polygon is invalid");
    }
    const edgeLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const centerSide = crossProduct(start, end, center);
    if (
      !Number.isFinite(edgeLength) ||
      edgeLength <= 0 ||
      !Number.isFinite(centerSide) ||
      Math.abs(centerSide) <= Number.EPSILON
    ) {
      throw new Error("Label containment polygon is invalid");
    }
    const insideSign = Math.sign(centerSide);
    for (const point of points) {
      const clearance =
        (insideSign * crossProduct(start, end, point)) / edgeLength;
      if (!Number.isFinite(clearance)) {
        throw new Error("Label containment point is invalid");
      }
      minimum = Math.min(minimum, clearance);
    }
  });

  return minimum;
}
