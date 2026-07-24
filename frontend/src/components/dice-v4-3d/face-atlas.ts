import {
  CANONICAL_FACE_VALUES_V4,
  D20_R4_ORIENTATION_MARK_OPTICAL_SCALE_V4,
  createEngravingLayerRecipeV4,
  enhanceD4EngravingLayerRecipeV4,
  engravingFontScaleV4,
  formatFaceLabelV4,
  minimumConvexPolygonClearanceV4,
  projectGeometryVectorV4,
  requiresOrientationMarkV4,
  type EngravingContrastEdgeV4,
  type EngravingLayerColorV4,
  type EngravingLayerRecipeV4,
  type GeometryCameraV4,
  type GeometryIdV4,
  type LabelContainmentPointV4,
  type PhysicalGeometryFaceV4,
  type PhysicalGeometryLabelV4,
  type PhysicalPolyhedralMeshV4,
  type ProjectedPolyhedralGeometryV4,
  type RenderAppearanceV4,
  type RendererRevisionV4,
  type SphericalGeometryDescriptorV4,
} from "@dice-witch/dice-v4-model";
import {
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Float32BufferAttribute,
  LinearFilter,
  SRGBColorSpace,
} from "three";

const FACE_ATLAS_TILE_SIZE_V4 = 192;
const FACE_ATLAS_GUTTER_V4 = 1;
const LABEL_REFERENCE_SIZE_V4 = 100;
const FACET_INK_FILL_RATIO_V4 = 0.8;
const ENGRAVING_DEPTH_RATIO_V4 = 0.04;
const ENGRAVING_WALL_DEPTH_FRACTION_V4 = 0.22;
const LABEL_SURFACE_OFFSET_V4 = 0.006;
const LABEL_VISIBLE_GAP_PIXELS_V4 = 0.75;
const LABEL_EDGE_HALF_WIDTH_PIXELS_V4 = 0.5;
const LABEL_REQUIRED_CLEARANCE_RATIO_V4 =
  (LABEL_VISIBLE_GAP_PIXELS_V4 + LABEL_EDGE_HALF_WIDTH_PIXELS_V4) / 150;
const LABEL_FIT_ITERATIONS_V4 = 24;
const MINIMUM_LABEL_FONT_SCALE_BY_FORM_V4 = Object.freeze({
  standard: 0.35,
  sharp: 0.35,
  "crystal-cut": 0.325,
  "hollow-cage": 0.17,
} satisfies Record<PhysicalPolyhedralMeshV4["form"], number>);
const LABEL_RASTER_PADDING_PIXELS_V4 = 1;
const ORIENTATION_MARK_GAP_RATIO_V4 = 0.02;
const ORIENTATION_MARK_HALF_WIDTH_RATIO_V4 = 0.2;
const ORIENTATION_MARK_STROKE_RATIO_V4 = 0.026;

type FaceAtlasLayoutV4 = {
  faceCount: number;
  columns: number;
  rows: number;
  tileSize: number;
  gutter: number;
  cellSize: number;
  width: number;
  height: number;
};

export type PhysicalLabelAtlasSourceV4 = {
  canvas: HTMLCanvasElement;
  geometryId: GeometryIdV4;
  result: number;
  labelCount: number;
  minimumVisibleLabelGapPixelsAt150: number;
  minimumVisibleLabelFontScale: number;
  resultLabelFontScale: number;
};

export type PolyhedralLabelAtlasResourcesV4 = PhysicalLabelAtlasSourceV4 & {
  geometry: BufferGeometry;
  texture: CanvasTexture;
};

export function createFaceAtlasLayoutV4(
  faceCount: number,
): FaceAtlasLayoutV4 {
  if (!Number.isSafeInteger(faceCount) || faceCount < 1) {
    throw new Error("Three.js V4 face atlas count is invalid");
  }
  const columns = Math.ceil(Math.sqrt(faceCount));
  const rows = Math.ceil(faceCount / columns);
  const cellSize = FACE_ATLAS_TILE_SIZE_V4 + FACE_ATLAS_GUTTER_V4 * 2;
  return {
    faceCount,
    columns,
    rows,
    tileSize: FACE_ATLAS_TILE_SIZE_V4,
    gutter: FACE_ATLAS_GUTTER_V4,
    cellSize,
    width: columns * cellSize,
    height: rows * cellSize,
  };
}

export function faceAtlasUvV4(
  layout: FaceAtlasLayoutV4,
  faceIndex: number,
  u: number,
  v: number,
): readonly [number, number] {
  if (
    !Number.isSafeInteger(faceIndex) ||
    faceIndex < 0 ||
    faceIndex >= layout.faceCount ||
    !Number.isFinite(u) ||
    u < 0 ||
    u > 1 ||
    !Number.isFinite(v) ||
    v < 0 ||
    v > 1
  ) {
    throw new Error("Three.js V4 face atlas coordinate is invalid");
  }
  const column = faceIndex % layout.columns;
  const row = Math.floor(faceIndex / layout.columns);
  return [
    (column * layout.cellSize + layout.gutter + 0.5 + u * (layout.tileSize - 1)) /
      layout.width,
    (row * layout.cellSize + layout.gutter + 0.5 + v * (layout.tileSize - 1)) /
      layout.height,
  ];
}

function requireCanvasContextV4(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Three.js V4 label atlas canvas is unavailable");
  }
  return context;
}

function drawOrientationMarkV4(
  context: CanvasRenderingContext2D,
  centerX: number,
  baseline: number,
  descent: number,
  fontSize: number,
  strokeExpansion = 0,
): void {
  context.lineWidth =
    Math.max(1, fontSize * ORIENTATION_MARK_STROKE_RATIO_V4) +
    strokeExpansion;
  context.beginPath();
  const y = baseline + descent + fontSize * ORIENTATION_MARK_GAP_RATIO_V4;
  const halfWidth = fontSize * ORIENTATION_MARK_HALF_WIDTH_RATIO_V4;
  context.moveTo(centerX - halfWidth, y);
  context.lineTo(centerX + halfWidth, y);
  context.stroke();
}

function engravingColorComponentsV4(
  color: string,
): readonly [red: number, green: number, blue: number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error("Three.js V4 engraving color is invalid");
  }
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ];
}

function engravingCssColorV4(color: EngravingLayerColorV4): string {
  return `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
}

function engravingLayerRecipeV4(
  appearance: RenderAppearanceV4,
  enhanceD4Finish = false,
): EngravingLayerRecipeV4 {
  const [red, green, blue] = engravingColorComponentsV4(
    appearance.engraving.color,
  );
  const recipe = createEngravingLayerRecipeV4(
    appearance.engraving.finish,
    red,
    green,
    blue,
  );
  return enhanceD4Finish
    ? enhanceD4EngravingLayerRecipeV4(appearance.engraving.finish, recipe)
    : recipe;
}

function drawEngravingPassV4(
  context: CanvasRenderingContext2D,
  text: string,
  hasOrientationMark: boolean,
  centerX: number,
  x: number,
  baseline: number,
  descent: number,
  fontSize: number,
  color: EngravingLayerColorV4,
  blur: number,
  offsetX: number,
  offsetY: number,
): void {
  const cssColor = engravingCssColorV4(color);
  context.fillStyle = cssColor;
  context.strokeStyle = cssColor;
  context.filter = blur > 0 ? `blur(${String(blur)}px)` : "none";
  context.fillText(text, x + offsetX, baseline + offsetY);
  if (hasOrientationMark) {
    drawOrientationMarkV4(
      context,
      centerX + offsetX,
      baseline + offsetY,
      descent,
      fontSize,
    );
  }
}

function drawEngravingContrastEdgeV4(
  context: CanvasRenderingContext2D,
  text: string,
  hasOrientationMark: boolean,
  centerX: number,
  x: number,
  baseline: number,
  descent: number,
  fontSize: number,
  edge: EngravingContrastEdgeV4,
  offsetX: number,
  offsetY: number,
): void {
  const edgeWidth = fontSize * edge.widthRatio;
  const channel = edge.color === "#ffffff" ? 255 : 0;
  const cssColor = `rgba(${channel}, ${channel}, ${channel}, ${edge.opacity})`;
  context.filter = "none";
  context.lineJoin = "round";
  context.lineWidth = edgeWidth * 2;
  context.strokeStyle = cssColor;
  context.strokeText(text, x + offsetX, baseline + offsetY);
  if (hasOrientationMark) {
    drawOrientationMarkV4(
      context,
      centerX + offsetX,
      baseline + offsetY,
      descent,
      fontSize,
      edgeWidth * 2,
    );
  }
}

function dotPoint3V4(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function facePolygonForLabelV4(
  face: PhysicalGeometryFaceV4,
  label: PhysicalGeometryLabelV4,
): readonly LabelContainmentPointV4[] {
  return face.vertices.map((vertex) => {
    const relative = [
      vertex[0] - label.origin[0],
      vertex[1] - label.origin[1],
      vertex[2] - label.origin[2],
    ] as const;
    return [
      dotPoint3V4(relative, label.right),
      dotPoint3V4(relative, label.up),
    ];
  });
}

function labelInkCornersV4(
  label: PhysicalGeometryLabelV4,
  referenceInkWidth: number,
  referenceInkHeight: number,
  referenceSize: number,
  fontSize: number,
  tileSize: number,
  hasOrientationMark: boolean,
): readonly LabelContainmentPointV4[] {
  const inkScale = fontSize / referenceSize;
  const orientationStrokeWidth = Math.max(
    1,
    fontSize * ORIENTATION_MARK_STROKE_RATIO_V4,
  );
  const orientationHalfWidth = hasOrientationMark
    ? fontSize * ORIENTATION_MARK_HALF_WIDTH_RATIO_V4 +
      orientationStrokeWidth / 2
    : 0;
  const halfWidthPixels =
    Math.max((referenceInkWidth * inkScale) / 2, orientationHalfWidth) +
    LABEL_RASTER_PADDING_PIXELS_V4;
  const halfHeightPixels =
    (referenceInkHeight * inkScale) / 2 + LABEL_RASTER_PADDING_PIXELS_V4;
  const orientationBottomPixels = hasOrientationMark
    ? fontSize * ORIENTATION_MARK_GAP_RATIO_V4 + orientationStrokeWidth / 2
    : 0;
  const halfWidth = (halfWidthPixels / tileSize) * label.maxWidth;
  const top = (halfHeightPixels / tileSize) * label.maxHeight;
  const bottom =
    ((halfHeightPixels + orientationBottomPixels) / tileSize) * label.maxHeight;
  return [
    [-halfWidth, -bottom],
    [halfWidth, -bottom],
    [halfWidth, top],
    [-halfWidth, top],
  ];
}

type LabelContainmentFrameV4 = {
  polygon: readonly LabelContainmentPointV4[];
  origin: LabelContainmentPointV4;
  right: LabelContainmentPointV4;
  up: LabelContainmentPointV4;
  requiredClearance: number;
  visible: boolean;
};

type FittedPhysicalLabelV4 = {
  fontSize: number;
  fontScale: number;
  clearance: number;
};

type UniformInkDimensionsV4 = {
  width: number;
  height: number;
};

const D20_UNIFORM_INK_DIMENSIONS_BY_FONT_V4 = new Map<
  string,
  UniformInkDimensionsV4
>();

function transformedLabelInkCornersV4(
  frame: LabelContainmentFrameV4,
  corners: readonly LabelContainmentPointV4[],
): readonly LabelContainmentPointV4[] {
  return corners.map(([x, y]) => [
    frame.origin[0] + frame.right[0] * x + frame.up[0] * y,
    frame.origin[1] + frame.right[1] * x + frame.up[1] * y,
  ]);
}

function fitPhysicalLabelFontV4(
  label: PhysicalGeometryLabelV4,
  frame: LabelContainmentFrameV4,
  referenceInkWidth: number,
  referenceInkHeight: number,
  referenceSize: number,
  maximumFontSize: number,
  availableWidth: number,
  availableHeight: number,
  tileSize: number,
  hasOrientationMark: boolean,
  minimumFontScale: number,
  uniformInkDimensions: UniformInkDimensionsV4 | null,
  engravingFontScale: number,
): FittedPhysicalLabelV4 {
  const clearance = (fontSize: number): number =>
    minimumConvexPolygonClearanceV4(
      frame.polygon,
      transformedLabelInkCornersV4(
        frame,
        labelInkCornersV4(
          label,
          referenceInkWidth,
          referenceInkHeight,
          referenceSize,
          fontSize,
          tileSize,
          hasOrientationMark,
        ),
      ),
    );
  const fitToClearance = (
    maximum: number,
    clearanceAt: (fontSize: number) => number,
  ): number => {
    if (clearanceAt(maximum) >= frame.requiredClearance) return maximum;
    let lower = maximum * minimumFontScale;
    if (clearanceAt(lower) < frame.requiredClearance) {
      throw new Error("Three.js V4 label cannot preserve edge clearance");
    }
    let upper = maximum;
    for (let iteration = 0; iteration < LABEL_FIT_ITERATIONS_V4; iteration += 1) {
      const candidate = (lower + upper) / 2;
      if (clearanceAt(candidate) >= frame.requiredClearance) lower = candidate;
      else upper = candidate;
    }
    return lower;
  };
  const uniformMaximumFontSize =
    uniformInkDimensions === null
      ? Number.POSITIVE_INFINITY
      : fitToClearance(
          referenceSize *
            Math.min(
              availableWidth / uniformInkDimensions.width,
              availableHeight / uniformInkDimensions.height,
            ),
          (fontSize) =>
            minimumConvexPolygonClearanceV4(
              frame.polygon,
              transformedLabelInkCornersV4(
                frame,
                labelInkCornersV4(
                  label,
                  uniformInkDimensions.width,
                  uniformInkDimensions.height,
                  referenceSize,
                  fontSize,
                  tileSize,
                  false,
                ),
              ),
            ),
        );
  const fittedMaximumFontSize =
    Math.min(maximumFontSize, uniformMaximumFontSize) * engravingFontScale;
  const uniformFontScale =
    uniformInkDimensions !== null && hasOrientationMark
      ? D20_R4_ORIENTATION_MARK_OPTICAL_SCALE_V4
      : 1;
  const fontSize =
    fitToClearance(fittedMaximumFontSize, clearance) * uniformFontScale;
  return {
    fontSize,
    fontScale: fontSize / maximumFontSize,
    clearance: clearance(fontSize),
  };
}

function drawPhysicalLabelV4(
  context: CanvasRenderingContext2D,
  label: PhysicalGeometryLabelV4,
  text: string,
  hasOrientationMark: boolean,
  containment: LabelContainmentFrameV4,
  labelIndex: number,
  engraving: EngravingLayerRecipeV4,
  fontFamily: string,
  layout: FaceAtlasLayoutV4,
  minimumFontScale: number,
  uniformInkDimensions: UniformInkDimensionsV4 | null = null,
  engravingFontScale = 1,
  contrastEdge: EngravingContrastEdgeV4 | null = null,
): FittedPhysicalLabelV4 {
  if (text === "") {
    return {
      fontSize: 0,
      fontScale: 1,
      clearance: Number.POSITIVE_INFINITY,
    };
  }

  const column = labelIndex % layout.columns;
  const row = Math.floor(labelIndex / layout.columns);
  const centerX = column * layout.cellSize + layout.gutter + layout.tileSize / 2;
  const centerY = row * layout.cellSize + layout.gutter + layout.tileSize / 2;
  const referenceSize = LABEL_REFERENCE_SIZE_V4;
  context.font = `${referenceSize}px "${fontFamily}"`;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const reference = context.measureText(text);
  const inkWidth = reference.actualBoundingBoxLeft + reference.actualBoundingBoxRight;
  const inkHeight = reference.actualBoundingBoxAscent + reference.actualBoundingBoxDescent;
  if (inkWidth <= 0 || inkHeight <= 0) {
    throw new Error("Three.js V4 browser font metrics are invalid");
  }
  const availableWidth =
    ((label.maxWidth - label.opticalInset * 2) / label.maxWidth) *
    layout.tileSize *
    FACET_INK_FILL_RATIO_V4;
  const availableHeight =
    ((label.maxHeight - label.opticalInset * 2) / label.maxHeight) *
    layout.tileSize *
    FACET_INK_FILL_RATIO_V4;
  const maximumFontSize =
    referenceSize *
    Math.min(availableWidth / inkWidth, availableHeight / inkHeight);
  const fitted = fitPhysicalLabelFontV4(
    label,
    containment,
    inkWidth,
    inkHeight,
    referenceSize,
    maximumFontSize,
    availableWidth,
    availableHeight,
    layout.tileSize,
    hasOrientationMark,
    minimumFontScale,
    uniformInkDimensions,
    engravingFontScale,
  );
  const { fontSize } = fitted;
  context.font = `${fontSize}px "${fontFamily}"`;
  const metrics = context.measureText(text);
  const x =
    centerX +
    (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
  const baseline =
    centerY +
    (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  const depth = fontSize * ENGRAVING_DEPTH_RATIO_V4;
  const depthX = depth / Math.SQRT2;
  const depthY = depth / Math.SQRT2;
  const drawPass = (
    color: EngravingLayerColorV4,
    blurRatio: number,
    depthFraction: number,
  ): void => {
    drawEngravingPassV4(
      context,
      text,
      hasOrientationMark,
      centerX,
      x,
      baseline,
      metrics.actualBoundingBoxDescent,
      fontSize,
      color,
      blurRatio * fontSize,
      depthX * depthFraction,
      depthY * depthFraction,
    );
  };
  context.save();
  try {
    if (contrastEdge !== null) {
      drawEngravingContrastEdgeV4(
        context,
        text,
        hasOrientationMark,
        centerX,
        x,
        baseline,
        metrics.actualBoundingBoxDescent,
        fontSize,
        contrastEdge,
        depthX,
        depthY,
      );
    }
    drawPass(engraving.cavity, 0, 0);
    context.globalCompositeOperation = "source-atop";
    drawPass(
      engraving.wall,
      engraving.wallBlur,
      ENGRAVING_WALL_DEPTH_FRACTION_V4,
    );
    drawPass(engraving.ink, 0, 1);
    drawPass(
      engraving.glaze,
      engraving.glazeBlur,
      engraving.glazeDepthFraction,
    );
  } finally {
    context.restore();
  }
  return fitted;
}

function d20UniformInkDimensionsV4(
  context: CanvasRenderingContext2D,
  fontFamily: string,
): UniformInkDimensionsV4 {
  const cached = D20_UNIFORM_INK_DIMENSIONS_BY_FONT_V4.get(fontFamily);
  if (cached !== undefined) return cached;

  context.font = `${LABEL_REFERENCE_SIZE_V4}px "${fontFamily}"`;
  const dimensions = CANONICAL_FACE_VALUES_V4.d20.map((value) => {
    const metrics = context.measureText(formatFaceLabelV4("d20", value));
    return {
      width:
        metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
      height:
        metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
    };
  });
  const width = Math.max(...dimensions.map((value) => value.width));
  const height = Math.max(...dimensions.map((value) => value.height));
  if (width <= 0 || height <= 0) {
    throw new Error("Three.js V4 browser font metrics are invalid");
  }
  const measured = { width, height };
  D20_UNIFORM_INK_DIMENSIONS_BY_FONT_V4.set(fontFamily, measured);
  return measured;
}

function duplicateTileGutterV4(
  context: CanvasRenderingContext2D,
  layout: FaceAtlasLayoutV4,
  faceIndex: number,
): void {
  const x = (faceIndex % layout.columns) * layout.cellSize + layout.gutter;
  const y = Math.floor(faceIndex / layout.columns) * layout.cellSize + layout.gutter;
  const last = layout.tileSize - 1;
  context.drawImage(context.canvas, x, y, layout.tileSize, 1, x, y - 1, layout.tileSize, 1);
  context.drawImage(context.canvas, x, y + last, layout.tileSize, 1, x, y + layout.tileSize, layout.tileSize, 1);
  context.drawImage(context.canvas, x, y, 1, layout.tileSize, x - 1, y, 1, layout.tileSize);
  context.drawImage(context.canvas, x + last, y, 1, layout.tileSize, x + layout.tileSize, y, 1, layout.tileSize);
}

function labelVertexV4(
  label: PhysicalGeometryLabelV4,
  rightDirection: -1 | 1,
  upDirection: -1 | 1,
): readonly [number, number, number] {
  const rightScale = (rightDirection * label.maxWidth) / 2;
  const upScale = (upDirection * label.maxHeight) / 2;
  return [
    label.origin[0] +
      label.normal[0] * LABEL_SURFACE_OFFSET_V4 +
      label.right[0] * rightScale +
      label.up[0] * upScale,
    label.origin[1] +
      label.normal[1] * LABEL_SURFACE_OFFSET_V4 +
      label.right[1] * rightScale +
      label.up[1] * upScale,
    label.origin[2] +
      label.normal[2] * LABEL_SURFACE_OFFSET_V4 +
      label.right[2] * rightScale +
      label.up[2] * upScale,
  ];
}

export function createPhysicalLabelGeometryV4(
  labels: readonly PhysicalGeometryLabelV4[],
  layout: FaceAtlasLayoutV4,
): BufferGeometry {
  if (labels.length !== layout.faceCount) {
    throw new Error("Three.js V4 label atlas layout does not match labels");
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  labels.forEach((label, labelIndex) => {
    const firstVertex = positions.length / 3;
    positions.push(
      ...labelVertexV4(label, -1, -1),
      ...labelVertexV4(label, 1, -1),
      ...labelVertexV4(label, 1, 1),
      ...labelVertexV4(label, -1, 1),
    );
    for (let vertex = 0; vertex < 4; vertex += 1) {
      normals.push(...label.normal);
    }
    for (const [u, v] of [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ] as const) {
      uvs.push(...faceAtlasUvV4(layout, labelIndex, u, v));
    }
    indices.push(
      firstVertex,
      firstVertex + 1,
      firstVertex + 2,
      firstVertex,
      firstVertex + 2,
      firstVertex + 3,
    );
  });

  const geometry = new BufferGeometry();
  try {
    geometry.name = "dice-v4-physical-labels";
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

function physicalContainmentFrameV4(
  face: PhysicalGeometryFaceV4,
  label: PhysicalGeometryLabelV4,
): LabelContainmentFrameV4 {
  return {
    polygon: facePolygonForLabelV4(face, label),
    origin: [0, 0],
    right: [1, 0],
    up: [0, 1],
    requiredClearance: 0,
    visible: false,
  };
}

function projectedContainmentFrameV4(
  projection: ProjectedPolyhedralGeometryV4,
  camera: GeometryCameraV4,
  label: PhysicalGeometryLabelV4,
): LabelContainmentFrameV4 | undefined {
  const face = projection.visibleFaces.find(({ id }) => id === label.faceId);
  if (face === undefined) return undefined;
  const projectedLabel = face.labels[label.faceLabelIndex];
  if (projectedLabel === undefined || projectedLabel.value !== label.value) {
    throw new Error(`Three.js V4 projected label is missing: ${label.faceId}`);
  }
  const surfaceOffset = projectGeometryVectorV4(
    [
      label.normal[0] * LABEL_SURFACE_OFFSET_V4,
      label.normal[1] * LABEL_SURFACE_OFFSET_V4,
      label.normal[2] * LABEL_SURFACE_OFFSET_V4,
    ],
    camera,
  );
  return {
    polygon: face.vertexIndices.map((vertexIndex) => {
      const vertex = projection.vertices[vertexIndex];
      if (vertex === undefined) {
        throw new Error(`Three.js V4 projected face is incomplete: ${face.id}`);
      }
      return vertex.position;
    }),
    origin: [
      projectedLabel.origin[0] + surfaceOffset[0],
      projectedLabel.origin[1] + surfaceOffset[1],
    ],
    right: projectedLabel.right,
    up: projectedLabel.up,
    requiredClearance: LABEL_REQUIRED_CLEARANCE_RATIO_V4,
    visible: true,
  };
}

function createPhysicalLabelAtlasSourceWithPolicyV4(
  physical: PhysicalPolyhedralMeshV4,
  projection: ProjectedPolyhedralGeometryV4,
  camera: GeometryCameraV4,
  appearance: RenderAppearanceV4,
  fontFamily: string,
  clipToTile: boolean,
  rendererRevision?: RendererRevisionV4,
  contrastEdge: EngravingContrastEdgeV4 | null = null,
): PhysicalLabelAtlasSourceV4 {
  if (
    physical.geometryId !== projection.geometryId ||
    physical.result !== projection.result
  ) {
    throw new Error("Three.js V4 physical and projected labels do not match");
  }
  const layout = createFaceAtlasLayoutV4(physical.labels.length);
  const faces = new Map(physical.faces.map((face) => [face.id, face]));
  const visibleClearances: number[] = [];
  const visibleFontScales: number[] = [];
  const visibleResultFontScales: number[] = [];
  const minimumFontScale =
    MINIMUM_LABEL_FONT_SCALE_BY_FORM_V4[physical.form];
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = requireCanvasContextV4(canvas);
  const engraving = engravingLayerRecipeV4(
    appearance,
    (rendererRevision === "canvaskit-v4-r6" ||
      rendererRevision === "canvaskit-v4-r7") &&
      physical.target === "d4",
  );
  const fontScale = engravingFontScaleV4(
    rendererRevision,
    physical.target,
    appearance.engraving.fontId,
  );
  const uniformInkDimensions =
    (rendererRevision === "canvaskit-v4-r4" ||
      rendererRevision === "canvaskit-v4-r5" ||
      rendererRevision === "canvaskit-v4-r6" ||
      rendererRevision === "canvaskit-v4-r7") &&
    physical.target === "d20"
      ? d20UniformInkDimensionsV4(context, fontFamily)
      : null;
  physical.labels.forEach((label, labelIndex) => {
    const face = faces.get(label.faceId);
    if (face === undefined) {
      throw new Error(`Three.js V4 label face is missing: ${label.faceId}`);
    }
    const containment =
      projectedContainmentFrameV4(projection, camera, label) ??
      physicalContainmentFrameV4(face, label);
    const text = formatFaceLabelV4(physical.target, label.value);
    const drawLabel = (): FittedPhysicalLabelV4 =>
      drawPhysicalLabelV4(
        context,
        label,
        text,
        requiresOrientationMarkV4(physical.target, label.value),
        containment,
        labelIndex,
        engraving,
        fontFamily,
        layout,
        minimumFontScale,
        uniformInkDimensions,
        fontScale,
        contrastEdge,
      );
    let fitted: FittedPhysicalLabelV4;
    if (clipToTile) {
      const tileX = (labelIndex % layout.columns) * layout.cellSize;
      const tileY = Math.floor(labelIndex / layout.columns) * layout.cellSize;
      context.save();
      try {
        context.beginPath();
        context.rect(tileX, tileY, layout.cellSize, layout.cellSize);
        context.clip();
        fitted = drawLabel();
      } finally {
        context.restore();
      }
    } else {
      fitted = drawLabel();
    }
    if (containment.visible && Number.isFinite(fitted.clearance)) {
      visibleClearances.push(fitted.clearance);
      visibleFontScales.push(fitted.fontScale);
      if (label.value === physical.result) {
        visibleResultFontScales.push(fitted.fontScale);
      }
    }
    duplicateTileGutterV4(context, layout, labelIndex);
  });

  if (
    visibleClearances.length === 0 ||
    visibleFontScales.length !== visibleClearances.length ||
    visibleResultFontScales.length === 0
  ) {
    throw new Error("Three.js V4 projected labels are empty");
  }
  const minimumVisibleLabelGapPixelsAt150 =
    Math.min(...visibleClearances) * 150 - LABEL_EDGE_HALF_WIDTH_PIXELS_V4;
  if (
    minimumVisibleLabelGapPixelsAt150 <
    LABEL_VISIBLE_GAP_PIXELS_V4 - 1e-6
  ) {
    throw new Error("Three.js V4 label cannot preserve edge clearance");
  }

  return {
    canvas,
    geometryId: physical.geometryId,
    result: physical.result,
    labelCount: physical.labels.length,
    minimumVisibleLabelGapPixelsAt150,
    minimumVisibleLabelFontScale: Math.min(...visibleFontScales),
    resultLabelFontScale: Math.min(...visibleResultFontScales),
  };
}

export function createPhysicalLabelAtlasSourceV4(
  physical: PhysicalPolyhedralMeshV4,
  projection: ProjectedPolyhedralGeometryV4,
  camera: GeometryCameraV4,
  appearance: RenderAppearanceV4,
  fontFamily: string,
  rendererRevision?: RendererRevisionV4,
  contrastEdge: EngravingContrastEdgeV4 | null = null,
): PhysicalLabelAtlasSourceV4 {
  return createPhysicalLabelAtlasSourceWithPolicyV4(
    physical,
    projection,
    camera,
    appearance,
    fontFamily,
    false,
    rendererRevision,
    contrastEdge,
  );
}

export function createTileClippedPhysicalLabelAtlasSourceV4(
  physical: PhysicalPolyhedralMeshV4,
  projection: ProjectedPolyhedralGeometryV4,
  camera: GeometryCameraV4,
  appearance: RenderAppearanceV4,
  fontFamily: string,
  rendererRevision?: RendererRevisionV4,
  contrastEdge: EngravingContrastEdgeV4 | null = null,
): PhysicalLabelAtlasSourceV4 {
  return createPhysicalLabelAtlasSourceWithPolicyV4(
    physical,
    projection,
    camera,
    appearance,
    fontFamily,
    true,
    rendererRevision,
    contrastEdge,
  );
}

function createLabelCanvasTextureV4(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.name = "dice-v4-physical-labels";
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

export function createPhysicalLabelAtlasResourcesFromSourceV4(
  physical: PhysicalPolyhedralMeshV4,
  source: PhysicalLabelAtlasSourceV4,
): PolyhedralLabelAtlasResourcesV4 {
  const layout = createFaceAtlasLayoutV4(source.labelCount);
  if (
    physical.geometryId !== source.geometryId ||
    physical.result !== source.result ||
    physical.labels.length !== source.labelCount ||
    source.canvas.width !== layout.width ||
    source.canvas.height !== layout.height
  ) {
    throw new Error("Three.js V4 label atlas source does not match labels");
  }
  const texture = createLabelCanvasTextureV4(source.canvas);
  try {
    return {
      ...source,
      geometry: createPhysicalLabelGeometryV4(physical.labels, layout),
      texture,
    };
  } catch (error) {
    texture.dispose();
    throw error;
  }
}

function sphericalLabelNormalV4(
  descriptor: SphericalGeometryDescriptorV4,
): [number, number, number] {
  const { origin } = descriptor.labelFrame;
  return [
    origin[0] / descriptor.radius,
    origin[1] / descriptor.radius,
    origin[2] / descriptor.radius,
  ];
}

export function createSphericalLabelAtlasSourceV4(
  descriptor: SphericalGeometryDescriptorV4,
  result: number,
  appearance: RenderAppearanceV4,
  fontFamily: string,
  rendererRevision?: RendererRevisionV4,
  contrastEdge: EngravingContrastEdgeV4 | null = null,
): PhysicalLabelAtlasSourceV4 {
  const layout = createFaceAtlasLayoutV4(1);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = requireCanvasContextV4(canvas);
  const engraving = engravingLayerRecipeV4(appearance);
  const label: PhysicalGeometryLabelV4 = {
    faceId: "sphere",
    faceLabelIndex: 0,
    value: result,
    alignment: "surface",
    normal: sphericalLabelNormalV4(descriptor),
    ...descriptor.labelFrame,
  };
  const containment: LabelContainmentFrameV4 = {
    polygon: [
      [-label.maxWidth / 2, -label.maxHeight / 2],
      [label.maxWidth / 2, -label.maxHeight / 2],
      [label.maxWidth / 2, label.maxHeight / 2],
      [-label.maxWidth / 2, label.maxHeight / 2],
    ],
    origin: [0, 0],
    right: [1, 0],
    up: [0, 1],
    requiredClearance: 0,
    visible: false,
  };
  drawPhysicalLabelV4(
    context,
    label,
    formatFaceLabelV4("other", result),
    requiresOrientationMarkV4("other", result),
    containment,
    0,
    engraving,
    fontFamily,
    layout,
    MINIMUM_LABEL_FONT_SCALE_BY_FORM_V4.standard,
    null,
    engravingFontScaleV4(
      rendererRevision,
      "other",
      appearance.engraving.fontId,
    ),
    contrastEdge,
  );
  duplicateTileGutterV4(context, layout, 0);
  return {
    canvas,
    geometryId: descriptor.id,
    result,
    labelCount: 1,
    minimumVisibleLabelGapPixelsAt150: Number.POSITIVE_INFINITY,
    minimumVisibleLabelFontScale: 1,
    resultLabelFontScale: 1,
  };
}

export function createSphericalLabelGeometryV4(
  descriptor: SphericalGeometryDescriptorV4,
  widthSegments = 16,
  heightSegments = 12,
): BufferGeometry {
  if (
    !Number.isSafeInteger(widthSegments) ||
    widthSegments < 1 ||
    !Number.isSafeInteger(heightSegments) ||
    heightSegments < 1
  ) {
    throw new Error("Three.js V4 spherical label geometry is invalid");
  }
  const { right, up, maxWidth, maxHeight } = descriptor.labelFrame;
  const radius = descriptor.radius;
  const normal = sphericalLabelNormalV4(descriptor);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const layout = createFaceAtlasLayoutV4(1);
  const rowLength = widthSegments + 1;
  for (let row = 0; row <= heightSegments; row += 1) {
    const v = row / heightSegments;
    const y = (v - 0.5) * maxHeight;
    for (let column = 0; column <= widthSegments; column += 1) {
      const u = column / widthSegments;
      const x = (u - 0.5) * maxWidth;
      const depthSquared = radius * radius - x * x - y * y;
      if (depthSquared <= 0) {
        throw new Error("Three.js V4 spherical label exceeds the surface");
      }
      const depth = Math.sqrt(depthSquared);
      const surfaceNormal = [
        (right[0] * x + up[0] * y + normal[0] * depth) / radius,
        (right[1] * x + up[1] * y + normal[1] * depth) / radius,
        (right[2] * x + up[2] * y + normal[2] * depth) / radius,
      ] as const;
      positions.push(
        surfaceNormal[0] * (radius + LABEL_SURFACE_OFFSET_V4),
        surfaceNormal[1] * (radius + LABEL_SURFACE_OFFSET_V4),
        surfaceNormal[2] * (radius + LABEL_SURFACE_OFFSET_V4),
      );
      normals.push(...surfaceNormal);
      uvs.push(...faceAtlasUvV4(layout, 0, u, 1 - v));
    }
  }
  for (let row = 0; row < heightSegments; row += 1) {
    for (let column = 0; column < widthSegments; column += 1) {
      const bottomLeft = row * rowLength + column;
      const bottomRight = bottomLeft + 1;
      const topLeft = (row + 1) * rowLength + column;
      const topRight = topLeft + 1;
      indices.push(
        bottomLeft,
        bottomRight,
        topRight,
        bottomLeft,
        topRight,
        topLeft,
      );
    }
  }

  const geometry = new BufferGeometry();
  try {
    geometry.name = `dice-v4-${descriptor.id}-labels`;
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

export function createSphericalLabelAtlasResourcesFromSourceV4(
  descriptor: SphericalGeometryDescriptorV4,
  result: number,
  source: PhysicalLabelAtlasSourceV4,
): PolyhedralLabelAtlasResourcesV4 {
  const layout = createFaceAtlasLayoutV4(1);
  if (
    source.geometryId !== descriptor.id ||
    source.result !== result ||
    source.labelCount !== 1 ||
    source.canvas.width !== layout.width ||
    source.canvas.height !== layout.height
  ) {
    throw new Error("Three.js V4 spherical label source does not match result");
  }
  const texture = createLabelCanvasTextureV4(source.canvas);
  try {
    return {
      ...source,
      geometry: createSphericalLabelGeometryV4(descriptor),
      texture,
    };
  } catch (error) {
    texture.dispose();
    throw error;
  }
}
