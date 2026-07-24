export type FacetCoordinate = readonly number[];

type FacetAxis = {
  from: FacetCoordinate;
  to: FacetCoordinate;
  sourceLength: number;
};

export type FacetLabelFrame = {
  anchor: FacetCoordinate;
  xAxis: FacetAxis;
  yAxis: FacetAxis;
};

export type ResolvedFacetLabelFrame = {
  x: number;
  y: number;
  a: number;
  b: number;
  c: number;
  d: number;
};

type Point = { x: number; y: number };

function parseFacetVertices(points: string): Point[] {
  const vertices = points.trim().split(/\s+/).map((point) => {
    const coordinates = point.split(",");
    const x = Number(coordinates[0]);
    const y = Number(coordinates[1]);
    if (
      coordinates.length !== 2 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      throw new Error(`Facet point ${JSON.stringify(point)} is invalid`);
    }
    return { x, y };
  });
  if (vertices.length < 3) {
    throw new Error("A facet requires at least three vertices");
  }
  return vertices;
}

function resolveCoordinate(
  vertices: readonly Point[],
  weights: FacetCoordinate,
): Point {
  if (weights.length !== vertices.length) {
    throw new Error("Facet coordinate must provide one weight per vertex");
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - 1) > 0.000001) {
    throw new Error("Facet coordinate weights must total one");
  }
  return vertices.reduce((point, vertex, index) => {
    const weight = weights[index];
    if (weight === undefined) {
      throw new Error("Facet coordinate is missing a vertex weight");
    }
    return {
      x: point.x + vertex.x * weight,
      y: point.y + vertex.y * weight,
    };
  }, { x: 0, y: 0 });
}

function resolveAxis(
  vertices: readonly Point[],
  axis: FacetAxis,
): Point {
  if (!Number.isFinite(axis.sourceLength) || axis.sourceLength <= 0) {
    throw new Error("Facet label axis source length must be positive");
  }
  const start = resolveCoordinate(vertices, axis.from);
  const end = resolveCoordinate(vertices, axis.to);
  const x = (end.x - start.x) / axis.sourceLength;
  const y = (end.y - start.y) / axis.sourceLength;
  if (x === 0 && y === 0) {
    throw new Error("Facet label axis must have a direction");
  }
  return { x, y };
}

export function resolveFacetLabelFrame(
  points: string,
  frame: FacetLabelFrame,
): ResolvedFacetLabelFrame {
  const vertices = parseFacetVertices(points);
  const anchor = resolveCoordinate(vertices, frame.anchor);
  const xAxis = resolveAxis(vertices, frame.xAxis);
  const yAxis = resolveAxis(vertices, frame.yAxis);
  if (Math.abs(xAxis.x * yAxis.y - xAxis.y * yAxis.x) < 0.000001) {
    throw new Error("Facet label axes must span a plane");
  }
  return {
    x: anchor.x,
    y: anchor.y,
    a: xAxis.x,
    b: xAxis.y,
    c: yAxis.x,
    d: yAxis.y,
  };
}
