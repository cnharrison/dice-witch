import type {
  ProjectedGeometryLabelV4,
  ProjectedPolyhedralGeometryV4,
  RenderCriticalEffectV4,
} from "@dice-witch/dice-v4-model";
import type { Canvas, Paint, Path, PathBuilder } from "canvaskit-wasm";
import type { CanvasKitResourceScopeV4 } from "./resources";
import type { CanvasKitRuntimeV4 } from "./runtime";

const HEX_COLOR_V4 = /^#([0-9a-f]{6})$/i;
const BLUR_ALPHA_EXTENT_SIGMAS_V4 = 2;

type PointV4 = readonly [x: number, y: number];

type CriticalEffectGeometryV4 = {
  silhouette: Path;
  hull: readonly PointV4[];
  facePaths: readonly Path[];
  labels: readonly ProjectedGeometryLabelV4[];
  size: number;
};

function createPaint(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  label: string,
): Paint {
  return scope.own(new canvasKit.Paint(), label);
}

function effectColor(effect: RenderCriticalEffectV4): readonly [number, number, number] {
  const match = HEX_COLOR_V4.exec(effect.color);
  if (match?.[1] === undefined) {
    throw new Error("CanvasKit V4 critical effect color is invalid");
  }
  const value = Number.parseInt(match[1], 16);
  return [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
}

function effectIntensity(effect: RenderCriticalEffectV4): number {
  if (
    !Number.isFinite(effect.intensity) ||
    effect.intensity < 0 ||
    effect.intensity > 100
  ) {
    throw new Error("CanvasKit V4 critical effect intensity is invalid");
  }
  return effect.intensity / 100;
}

function createEffectPaint(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  effect: RenderCriticalEffectV4,
  alpha: number,
  strokeWidth?: number,
): Paint {
  const [red, green, blue] = effectColor(effect);
  const paint = createPaint(canvasKit, scope, "critical effect paint");
  paint.setColor(canvasKit.Color4f(red, green, blue, alpha));
  if (strokeWidth !== undefined) {
    paint.setStyle(canvasKit.PaintStyle.Stroke);
    paint.setStrokeWidth(strokeWidth);
    paint.setStrokeCap(canvasKit.StrokeCap.Round);
    paint.setStrokeJoin(canvasKit.StrokeJoin.Round);
  }
  return paint;
}

function createWhitePaint(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  alpha: number,
  strokeWidth: number,
): Paint {
  const paint = createPaint(canvasKit, scope, "critical highlight paint");
  paint.setColor(canvasKit.Color4f(1, 1, 1, alpha));
  paint.setStyle(canvasKit.PaintStyle.Stroke);
  paint.setStrokeWidth(strokeWidth);
  paint.setStrokeCap(canvasKit.StrokeCap.Round);
  paint.setStrokeJoin(canvasKit.StrokeJoin.Round);
  return paint;
}

function cross(origin: PointV4, a: PointV4, b: PointV4): number {
  return (a[0] - origin[0]) * (b[1] - origin[1]) -
    (a[1] - origin[1]) * (b[0] - origin[0]);
}

function appendHullPoint(hull: PointV4[], point: PointV4): void {
  while (hull.length >= 2) {
    const origin = hull[hull.length - 2];
    const previous = hull[hull.length - 1];
    if (origin === undefined || previous === undefined) {
      throw new Error("CanvasKit V4 critical effect hull is invalid");
    }
    if (cross(origin, previous, point) > 0) break;
    hull.pop();
  }
  hull.push(point);
}

function convexHull(points: readonly PointV4[]): readonly PointV4[] {
  const sorted = [...points]
    .sort(([ax, ay], [bx, by]) => ax - bx || ay - by)
    .filter(
      (point, index, all) =>
        index === 0 ||
        point[0] !== all[index - 1]?.[0] ||
        point[1] !== all[index - 1]?.[1],
    );
  if (sorted.length < 3) {
    throw new Error("CanvasKit V4 critical effect silhouette is invalid");
  }
  const lower: PointV4[] = [];
  sorted.forEach((point) => {
    appendHullPoint(lower, point);
  });
  const upper: PointV4[] = [];
  [...sorted].reverse().forEach((point) => {
    appendHullPoint(upper, point);
  });
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function createClosedPath(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  points: readonly PointV4[],
  label: string,
): Path {
  const builder: PathBuilder = new canvasKit.PathBuilder();
  try {
    const first = points[0];
    if (first === undefined) {
      throw new Error("CanvasKit V4 critical effect path is empty");
    }
    builder.moveTo(first[0], first[1]);
    points.slice(1).forEach(([x, y]) => builder.lineTo(x, y));
    builder.close();
    return scope.own(builder.detachAndDelete(), label);
  } catch (error) {
    builder.delete();
    throw error;
  }
}

function geometryCenter(hull: readonly PointV4[]): PointV4 {
  return [
    hull.reduce((sum, point) => sum + point[0], 0) / hull.length,
    hull.reduce((sum, point) => sum + point[1], 0) / hull.length,
  ];
}

function normalizeVector(vector: PointV4, label: string): PointV4 {
  const length = Math.hypot(vector[0], vector[1]);
  if (length === 0) {
    throw new Error(`CanvasKit V4 critical effect ${label} is invalid`);
  }
  return [vector[0] / length, vector[1] / length];
}

function outerGlowMetrics(
  size: number,
  intensity: number,
) {
  return {
    strokeWidth: size * (0.02 + intensity * 0.02),
    blurSigma: size * (0.01 + intensity * 0.016),
  };
}

export function criticalEffectOutsetV4(
  size: number,
  effect: RenderCriticalEffectV4 | null | undefined,
  ensureOuterGlow = false,
): number {
  if (
    effect === null ||
    effect === undefined ||
    (effect.treatment !== "classic-glow" && !ensureOuterGlow)
  ) {
    return 0;
  }
  const intensity = effectIntensity(effect);
  if (intensity === 0) return 0;
  const { strokeWidth, blurSigma } = outerGlowMetrics(size, intensity);
  return Math.ceil(
    strokeWidth / 2 + blurSigma * BLUR_ALPHA_EXTENT_SIGMAS_V4,
  );
}

function drawOuterGlow(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  geometry: CriticalEffectGeometryV4,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const { strokeWidth, blurSigma } = outerGlowMetrics(
    geometry.size,
    intensity,
  );
  const paint = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.34 + intensity * 0.46,
    strokeWidth,
  );
  const blur = scope.own(
    canvasKit.MaskFilter.MakeBlur(
      canvasKit.BlurStyle.Normal,
      blurSigma,
      true,
    ),
    "critical outer glow mask filter",
  );
  paint.setMaskFilter(blur);
  canvas.drawPath(geometry.silhouette, paint);
  const rim = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.64 + intensity * 0.32,
    geometry.size * (0.01 + intensity * 0.01),
  );
  canvas.drawPath(geometry.silhouette, rim);
}

function drawInternalFlare(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  geometry: CriticalEffectGeometryV4,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const xs = geometry.hull.map(([x]) => x);
  const ys = geometry.hull.map(([, y]) => y);
  const x = Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * 0.31;
  const y = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.3;
  const glow = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.3 + intensity * 0.42,
  );
  const blur = scope.own(
    canvasKit.MaskFilter.MakeBlur(
      canvasKit.BlurStyle.Normal,
      geometry.size * (0.016 + intensity * 0.022),
      true,
    ),
    "critical internal flare mask filter",
  );
  glow.setMaskFilter(blur);
  canvas.drawCircle(x, y, geometry.size * (0.05 + intensity * 0.035), glow);
  const ray = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.62 + intensity * 0.34,
    geometry.size * (0.008 + intensity * 0.007),
  );
  const radius = geometry.size * (0.055 + intensity * 0.035);
  canvas.drawLine(x - radius, y, x + radius, y, ray);
  canvas.drawLine(x, y - radius, x, y + radius, ray);
  canvas.drawLine(
    x - radius * 0.7,
    y + radius * 0.7,
    x + radius * 0.7,
    y - radius * 0.7,
    ray,
  );
  const center = createWhitePaint(
    canvasKit,
    scope,
    0.72 + intensity * 0.24,
    Math.max(1, geometry.size * 0.006),
  );
  canvas.drawCircle(x, y, geometry.size * 0.012, center);
}

function drawSpectralRim(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  geometry: CriticalEffectGeometryV4,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const color = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.66 + intensity * 0.3,
    geometry.size * (0.022 + intensity * 0.018),
  );
  canvas.drawPath(geometry.silhouette, color);
  const highlight = createWhitePaint(
    canvasKit,
    scope,
    0.22 + intensity * 0.24,
    geometry.size * (0.006 + intensity * 0.004),
  );
  canvas.drawPath(geometry.silhouette, highlight);
}

function drawMetalEdge(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  geometry: CriticalEffectGeometryV4,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const edge = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.58 + intensity * 0.36,
    geometry.size * (0.012 + intensity * 0.01),
  );
  geometry.facePaths.forEach((path) => {
    canvas.drawPath(path, edge);
  });
  const highlight = createWhitePaint(
    canvasKit,
    scope,
    0.1 + intensity * 0.14,
    geometry.size * 0.004,
  );
  canvas.drawPath(geometry.silhouette, highlight);
}

function drawEngravingBurn(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  geometry: CriticalEffectGeometryV4,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const paint = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.68 + intensity * 0.28,
    Math.max(1.2, geometry.size * (0.007 + intensity * 0.005)),
  );
  const tick = geometry.size * (0.022 + intensity * 0.014);
  if (geometry.labels.length === 0) {
    const center = geometryCenter(geometry.hull);
    const radius =
      Math.min(
        ...geometry.hull.map((point) =>
          Math.hypot(point[0] - center[0], point[1] - center[1]),
        ),
      ) * 0.46;
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const x = center[0] + Math.cos(angle) * radius;
      const y = center[1] + Math.sin(angle) * radius;
      canvas.drawLine(
        x - Math.sin(angle) * tick * 0.5,
        y + Math.cos(angle) * tick * 0.5,
        x + Math.sin(angle) * tick * 0.5,
        y - Math.cos(angle) * tick * 0.5,
        paint,
      );
    }
    return;
  }
  geometry.labels.forEach((label) => {
    const origin: PointV4 = [
      label.origin[0] * geometry.size,
      label.origin[1] * geometry.size,
    ];
    const right: PointV4 = [
      label.right[0] * geometry.size,
      label.right[1] * geometry.size,
    ];
    const up: PointV4 = [
      label.up[0] * geometry.size,
      label.up[1] * geometry.size,
    ];
    const rightUnit = normalizeVector(right, "label right vector");
    const upUnit = normalizeVector(up, "label up vector");
    const widthDistance = label.maxWidth * geometry.size * 0.58;
    const heightDistance = label.maxHeight * geometry.size * 0.62;
    const offsets: readonly [PointV4, PointV4, number][] = [
      [rightUnit, upUnit, widthDistance],
      [[-rightUnit[0], -rightUnit[1]], upUnit, widthDistance],
      [upUnit, rightUnit, heightDistance],
      [[-upUnit[0], -upUnit[1]], rightUnit, heightDistance],
    ];
    offsets.forEach(([outward, tangent, distance]) => {
      const x = origin[0] + outward[0] * distance;
      const y = origin[1] + outward[1] * distance;
      canvas.drawLine(
        x - tangent[0] * tick * 0.5,
        y - tangent[1] * tick * 0.5,
        x + tangent[0] * tick * 0.5,
        y + tangent[1] * tick * 0.5,
        paint,
      );
    });
  });
}

function drawInnerCage(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  geometry: CriticalEffectGeometryV4,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const glow = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.18 + intensity * 0.2,
    geometry.size * (0.014 + intensity * 0.008),
  );
  const blur = scope.own(
    canvasKit.MaskFilter.MakeBlur(
      canvasKit.BlurStyle.Normal,
      geometry.size * (0.004 + intensity * 0.004),
      true,
    ),
    "critical inner cage mask filter",
  );
  glow.setMaskFilter(blur);
  canvas.drawPath(geometry.silhouette, glow);
  const edge = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.35 + intensity * 0.3,
    geometry.size * (0.004 + intensity * 0.004),
  );
  geometry.facePaths.forEach((path) => {
    canvas.drawPath(path, edge);
  });
  if (geometry.facePaths.length === 1) {
    const center = geometryCenter(geometry.hull);
    canvas.save();
    try {
      canvas.translate(center[0], center[1]);
      canvas.scale(0.82, 0.82);
      canvas.translate(-center[0], -center[1]);
      canvas.drawPath(geometry.silhouette, edge);
    } finally {
      canvas.restore();
    }
  }
}

function drawStateAccents(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  geometry: CriticalEffectGeometryV4,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const center = geometryCenter(geometry.hull);
  const selected = [0, Math.floor(geometry.hull.length / 3), Math.floor((geometry.hull.length * 2) / 3)]
    .map((index) => geometry.hull[index])
    .filter((point): point is PointV4 => point !== undefined);
  const paint = createEffectPaint(
    canvasKit,
    scope,
    effect,
    0.7 + intensity * 0.26,
    geometry.size * (0.006 + intensity * 0.005),
  );
  if (effect.state === "critical-success") {
    selected.forEach(([x, y]) => {
      const sx = center[0] + (x - center[0]) * 0.82;
      const sy = center[1] + (y - center[1]) * 0.82;
      const radius = geometry.size * (0.013 + intensity * 0.008);
      canvas.drawLine(sx - radius, sy, sx + radius, sy, paint);
      canvas.drawLine(sx, sy - radius, sx, sy + radius, paint);
    });
    return;
  }
  selected.forEach(([x, y]) => {
    const startX = center[0] + (x - center[0]) * 0.88;
    const startY = center[1] + (y - center[1]) * 0.88;
    const middleX = center[0] + (x - center[0]) * 0.81;
    const middleY = center[1] + (y - center[1]) * 0.81;
    const endX = center[0] + (x - center[0]) * 0.74;
    const endY = center[1] + (y - center[1]) * 0.74;
    const normalX = -(y - center[1]);
    const normalY = x - center[0];
    const normalLength = Math.hypot(normalX, normalY);
    if (normalLength === 0) {
      throw new Error("CanvasKit V4 critical effect accent is invalid");
    }
    const bend = geometry.size * 0.02;
    canvas.drawLine(
      startX,
      startY,
      middleX + (normalX / normalLength) * bend,
      middleY + (normalY / normalLength) * bend,
      paint,
    );
    canvas.drawLine(
      middleX + (normalX / normalLength) * bend,
      middleY + (normalY / normalLength) * bend,
      endX,
      endY,
      paint,
    );
  });
}

function drawCriticalEffect(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  geometry: CriticalEffectGeometryV4,
  effect: RenderCriticalEffectV4 | null | undefined,
  ensureOuterGlow = false,
): void {
  if (effect === null || effect === undefined) return;
  const intensity = effectIntensity(effect);
  if (intensity === 0) return;

  const clipped = effect.treatment !== "classic-glow";
  if (ensureOuterGlow && clipped) {
    drawOuterGlow(canvasKit, canvas, scope, geometry, effect, intensity);
  }
  if (clipped) {
    canvas.save();
    canvas.clipPath(geometry.silhouette, canvasKit.ClipOp.Intersect, true);
  }
  try {
    switch (effect.treatment) {
      case "classic-glow":
        drawOuterGlow(canvasKit, canvas, scope, geometry, effect, intensity);
        break;
      case "internal-flare":
        drawInternalFlare(canvasKit, canvas, scope, geometry, effect, intensity);
        break;
      case "spectral-rim":
        drawSpectralRim(canvasKit, canvas, scope, geometry, effect, intensity);
        break;
      case "metal-edge":
        drawMetalEdge(canvasKit, canvas, scope, geometry, effect, intensity);
        break;
      case "engraving-burn":
        drawEngravingBurn(canvasKit, canvas, scope, geometry, effect, intensity);
        break;
      case "inner-cage":
        drawInnerCage(canvasKit, canvas, scope, geometry, effect, intensity);
        break;
      default:
        throw new Error(
          `CanvasKit V4 critical effect treatment is invalid: ${String(effect.treatment)}`,
        );
    }
    drawStateAccents(canvasKit, canvas, scope, geometry, effect, intensity);
  } finally {
    if (clipped) canvas.restore();
  }
}

export function drawPolyhedralCriticalEffectV4(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  projection: ProjectedPolyhedralGeometryV4,
  facePaths: readonly Path[],
  size: number,
  effect: RenderCriticalEffectV4 | null | undefined,
  ensureOuterGlow = false,
): void {
  if (effect === null || effect === undefined) return;
  const hull = convexHull(
    projection.vertices.map(({ position }) => [
      position[0] * size,
      position[1] * size,
    ] as const),
  );
  const silhouette = createClosedPath(
    canvasKit,
    scope,
    hull,
    "critical polyhedral silhouette",
  );
  drawCriticalEffect(
    canvasKit,
    canvas,
    scope,
    {
      silhouette,
      hull,
      facePaths,
      labels: projection.visibleFaces.flatMap((face) => face.labels),
      size,
    },
    effect,
    ensureOuterGlow,
  );
}

export function drawSphericalCriticalEffectV4(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  silhouette: Path,
  center: number,
  radius: number,
  size: number,
  effect: RenderCriticalEffectV4 | null | undefined,
): void {
  if (effect === null || effect === undefined) return;
  const hull = Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius] as const;
  });
  drawCriticalEffect(
    canvasKit,
    canvas,
    scope,
    {
      silhouette,
      hull,
      facePaths: [silhouette],
      labels: [],
      size,
    },
    effect,
  );
}
