import {
  CANONICAL_FACE_VALUES_V4,
  D20_R4_ORIENTATION_MARK_OPTICAL_SCALE_V4,
  FONT_IDS_V4,
  IDENTITY_TEXTURE_PLACEMENT_V4,
  createEngravingLayerRecipeV4,
  enhanceD4EngravingLayerRecipeV4,
  formatFaceLabelV4,
  projectPolyhedralGeometryV4,
  rendererRevisionPolicyV4,
  requiresOrientationMarkV4,
  SOURCE_TEXTURE_SIZE_V4,
  modifierIconLeftV4,
  modifierIconSizeV4,
  isIdentityTexturePlacementV4,
  texturePlacementKeyV4,
  texturePlacementUniformsV4,
  type AppearanceTargetV4,
  type EngravingContrastEdgeV4,
  type EngravingFinishV4,
  type EngravingLayerRecipeV4,
  type FaceLabelSetV4,
  type FontIdV4,
  type IconNameV4,
  type MaterialFamilyV4,
  type PolyhedralGeometryDescriptorV4,
  type ProjectedGeometryFaceV4,
  type ProjectedGeometryLabelV4,
  type ProjectedPolyhedralGeometryV4,
  type RenderCriticalEffectV4,
  type RenderLightingV4,
  type RendererRevisionPolicyV4,
  type RendererRevisionV4,
  type SphericalGeometryDescriptorV4,
  type TexturePlacementV4,
  type TextureRasterV4,
  type TextureScopeV4,
} from "@dice-witch/dice-v4-model";
import type {
  Canvas,
  Font,
  Image,
  Paint,
  Path,
  PathBuilder,
  RuntimeEffect,
  Shader,
  Surface,
} from "canvaskit-wasm";
import {
  CanvasKitResourceScopeV4,
  withCanvasKitResourcesSyncV4,
} from "./resources";
import {
  criticalEffectOutsetV4,
  drawPolyhedralCriticalEffectV4,
  drawSphericalCriticalEffectV4,
} from "./critical-effects";
import type { CanvasKitFontDataV4 } from "./font-assets";
import { measureFontInkBoundsV4 } from "./font-ink-bounds";
import {
  minimumConvexPolygonClearanceV4,
  type LabelContainmentPointV4,
} from "./label-containment";
import {
  resolvePolyhedralLightingOverlayV4,
  resolveSphereLightingParametersV4,
  usesClassicBaselineSphereShaderV4,
  type SphereLightingParametersV4,
} from "./lighting";
import { CanvasKitModifierIconPainterV4 } from "./modifier-icons";
import type { CanvasKitRuntimeV4 } from "./runtime";
import type { SphericalMaterialRasterV4 } from "./spherical-material-raster";

const MIN_RENDER_SIZE_V4 = 64;
const MAX_RENDER_SIZE_V4 = 1_200;
const GRID_DIE_SIZE_V4 = 150;
const GROUP_ROW_DIE_GAP_R10_V4 = 8;
const GROUP_ROW_DIE_GAP_R11_V4 = 60;
const GROUP_ROW_DIE_STRIDE_R12_V4 = 150;
const MAX_GRID_COLUMNS_V4 = 10;
const MAX_GRID_DICE_V4 = 50;
const COMPACT_GRID_TARGET_ASPECT_V4 = 2;
const OCTAHEDRAL_ATLAS_MIN_DICE_V4 = 4;
const OCTAHEDRAL_ATLAS_SIZE_V4 = 192;
const SPHERE_BACKGROUND_MIN_DICE_V4 = 3;
const ENGRAVING_DEPTH_RATIO_V4 = 0.04;
const ENGRAVING_WALL_DEPTH_FRACTION_V4 = 0.22;
const ORIENTATION_MARK_Y_RATIO_V4 = 0.36;
const ORIENTATION_MARK_GAP_RATIO_V4 = 0.02;
const ORIENTATION_MARK_HALF_WIDTH_RATIO_V4 = 0.2;
const ORIENTATION_MARK_STROKE_RATIO_V4 = 0.026;
const ORIENTATION_MARK_MINIMUM_STROKE_V4 = 0.025;
const REQUIRED_FONT_CHARACTERS_V4 = "0123456789+−";
const FACET_INK_FILL_RATIO_V4 = 0.8;
const D20_R3_LABEL_CLEARANCE_RATIO_V4 = 0.75 / GRID_DIE_SIZE_V4;
const D20_R3_MINIMUM_FONT_SCALE_V4 = 0.35;
const D20_R3_LABEL_FIT_ITERATIONS_V4 = 24;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const TEXTURE_PLACEMENT_SHADER_V4 = `
uniform shader materialTexture;
uniform float2 textureCenter;
uniform float2 rotation;
uniform float2 artworkOffset;
half4 main(float2 position) {
  float2 translated = position - textureCenter - artworkOffset;
  float2 source = float2(
    rotation.x * translated.x + rotation.y * translated.y,
    -rotation.y * translated.x + rotation.x * translated.y
  ) + textureCenter;
  return materialTexture.eval(source);
}`;
const CHECKER_SHADER_V4 = `
uniform float2 textureSize;
half4 main(float2 position) {
  float2 cell = floor(position / (textureSize / 8.0));
  float checker = mod(cell.x + cell.y, 2.0);
  half3 violet = half3(0.47, 0.06, 0.74);
  half3 cyan = half3(0.02, 0.76, 0.9);
  return half4(mix(violet, cyan, checker), 1.0);
}`;
const OCTAHEDRAL_DECODE_V4 = `
float3 decodeOctahedral(float2 uv) {
  float2 folded = uv * 2.0 - 1.0;
  float3 direction = float3(
    folded.x,
    folded.y,
    1.0 - abs(folded.x) - abs(folded.y)
  );
  float correction = clamp(-direction.z, 0.0, 1.0);
  direction.x += direction.x >= 0.0 ? -correction : correction;
  direction.y += direction.y >= 0.0 ? -correction : correction;
  return normalize(direction);
}`;
const OCTAHEDRAL_CHECKER_SHADER_V4 = `
uniform float textureSize;
${OCTAHEDRAL_DECODE_V4}
half4 main(float2 position) {
  float3 direction = decodeOctahedral(position / textureSize);
  float3 cell = floor((direction + 1.0) * 4.0);
  float checker = mod(cell.x + cell.y + cell.z, 2.0);
  half3 violet = half3(0.47, 0.06, 0.74);
  half3 cyan = half3(0.02, 0.76, 0.9);
  return half4(mix(violet, cyan, checker), 1.0);
}`;
const OCTAHEDRAL_TEXTURE_SHADER_V4 = `
uniform shader materialTexture;
uniform float mappingSize;
uniform float textureSize;
${OCTAHEDRAL_DECODE_V4}
half4 main(float2 position) {
  float3 direction = decodeOctahedral(position / mappingSize);
  float3 weights = pow(abs(direction), float3(8.0));
  weights /= weights.x + weights.y + weights.z;
  float2 yz = (direction.yz * 0.5 + 0.5) * textureSize;
  float2 xz = (direction.xz * 0.5 + 0.5) * textureSize;
  float2 xy = (direction.xy * 0.5 + 0.5) * textureSize;
  half3 color =
    materialTexture.eval(yz).rgb * weights.x +
    materialTexture.eval(xz).rgb * weights.y +
    materialTexture.eval(xy).rgb * weights.z;
  return half4(color, 1.0);
}`;
const SPHERE_CHECKER_SHADER_V4 = `
uniform float2 sphereCenter;
uniform float sphereRadius;
half4 main(float2 position) {
  float2 point = (position - sphereCenter) / sphereRadius;
  float radiusSquared = dot(point, point);
  if (radiusSquared > 1.0) return half4(0.0);
  float z = sqrt(max(0.0, 1.0 - radiusSquared));
  float3 normal = normalize(float3(point.x, -point.y, z));
  float longitude = atan(point.x, z);
  float latitude = asin(clamp(-point.y, -1.0, 1.0));
  float2 cell = floor(float2(
    4.0 + longitude * 4.0 / 3.141592653589793,
    4.0 - latitude * 8.0 / 3.141592653589793
  ));
  float checker = mod(cell.x + cell.y, 2.0);
  float3 violet = float3(0.47, 0.06, 0.74);
  float3 cyan = float3(0.02, 0.76, 0.9);
  float3 base = mix(violet, cyan, checker);
  float3 light = normalize(float3(-0.42, 0.58, 0.82));
  float diffuse = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - max(normal.z, 0.0), 2.4);
  float3 color = base * (0.52 + diffuse * 0.62) + float3(rim * 0.08);
  return half4(clamp(color, 0.0, 1.0), 1.0);
}`;
const SPHERE_TEXTURE_SHADER_V4 = `
uniform shader materialTexture;
uniform float2 sphereCenter;
uniform float sphereRadius;
uniform float textureSize;
half4 main(float2 position) {
  float2 point = (position - sphereCenter) / sphereRadius;
  float radiusSquared = dot(point, point);
  if (radiusSquared > 1.0) return half4(0.0);
  float z = sqrt(max(0.0, 1.0 - radiusSquared));
  float3 normal = normalize(float3(point.x, -point.y, z));
  float longitude = atan(point.x, z);
  float latitude = asin(clamp(-point.y, -1.0, 1.0));
  float2 uv = float2(
    0.5 + longitude / 6.283185307179586,
    0.5 - latitude / 3.141592653589793
  );
  float3 base = materialTexture.eval(uv * textureSize).rgb;
  float3 light = normalize(float3(-0.42, 0.58, 0.82));
  float diffuse = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - max(normal.z, 0.0), 2.4);
  float3 color = base * (0.52 + diffuse * 0.62) + float3(rim * 0.08);
  return half4(clamp(color, 0.0, 1.0), 1.0);
}`;
const SPHERE_LIGHTING_FUNCTION_V4 = `
float lightingShade(float3 normal) {
  float diffuse = max(dot(normal, normalize(lightDirection)), 0.0);
  return ambientLight +
    max(normal.z, 0.0) * intrinsicLight +
    diffuse * directionalLight;
}
float lightingRim(float3 normal) {
  return pow(1.0 - max(normal.z, 0.0), 2.4) * rimLight;
}`;
const SPHERE_LIT_CHECKER_SHADER_V4 = `
uniform float2 sphereCenter;
uniform float sphereRadius;
uniform float3 lightDirection;
uniform float ambientLight;
uniform float intrinsicLight;
uniform float directionalLight;
uniform float rimLight;
${SPHERE_LIGHTING_FUNCTION_V4}
half4 main(float2 position) {
  float2 point = (position - sphereCenter) / sphereRadius;
  float radiusSquared = dot(point, point);
  if (radiusSquared > 1.0) return half4(0.0);
  float z = sqrt(max(0.0, 1.0 - radiusSquared));
  float3 normal = normalize(float3(point.x, -point.y, z));
  float longitude = atan(point.x, z);
  float latitude = asin(clamp(-point.y, -1.0, 1.0));
  float2 cell = floor(float2(
    4.0 + longitude * 4.0 / 3.141592653589793,
    4.0 - latitude * 8.0 / 3.141592653589793
  ));
  float checker = mod(cell.x + cell.y, 2.0);
  float3 violet = float3(0.47, 0.06, 0.74);
  float3 cyan = float3(0.02, 0.76, 0.9);
  float3 base = mix(violet, cyan, checker);
  float3 color = base * lightingShade(normal) + float3(lightingRim(normal));
  return half4(clamp(color, 0.0, 1.0), 1.0);
}`;
const SPHERE_LIT_TEXTURE_SHADER_V4 = `
uniform shader materialTexture;
uniform float2 sphereCenter;
uniform float sphereRadius;
uniform float textureSize;
uniform float3 lightDirection;
uniform float ambientLight;
uniform float intrinsicLight;
uniform float directionalLight;
uniform float rimLight;
${SPHERE_LIGHTING_FUNCTION_V4}
half4 main(float2 position) {
  float2 point = (position - sphereCenter) / sphereRadius;
  float radiusSquared = dot(point, point);
  if (radiusSquared > 1.0) return half4(0.0);
  float z = sqrt(max(0.0, 1.0 - radiusSquared));
  float3 normal = normalize(float3(point.x, -point.y, z));
  float longitude = atan(point.x, z);
  float latitude = asin(clamp(-point.y, -1.0, 1.0));
  float2 uv = float2(
    0.5 + longitude / 6.283185307179586,
    0.5 - latitude / 3.141592653589793
  );
  float3 base = materialTexture.eval(uv * textureSize).rgb;
  float3 color = base * lightingShade(normal) + float3(lightingRim(normal));
  return half4(clamp(color, 0.0, 1.0), 1.0);
}`;
const SPHERE_LABEL_SHADER_V4 = `
uniform shader labelTexture;
uniform float2 sphereCenter;
uniform float sphereRadius;
half4 main(float2 position) {
  float2 point = (position - sphereCenter) / sphereRadius;
  float radiusSquared = dot(point, point);
  if (radiusSquared > 1.0) return half4(0.0);
  float surfaceDepth = sqrt(max(0.0001, 1.0 - radiusSquared));
  float2 tangent = point / surfaceDepth;
  float surfaceArc = tangent.x * tangent.x * 0.18;
  tangent.y += surfaceArc;
  float2 source = sphereCenter + tangent * sphereRadius;
  return labelTexture.eval(source);
}`;
const SPHERE_LOCAL_FRAME_LABEL_SHADER_V4 = `
uniform shader labelTexture;
uniform float2 sphereCenter;
uniform float sphereRadius;
uniform float3 labelNormal;
uniform float3 labelRight;
uniform float3 labelUp;
half4 main(float2 position) {
  float2 point = (position - sphereCenter) / sphereRadius;
  float radiusSquared = dot(point, point);
  if (radiusSquared > 1.0) return half4(0.0);
  float z = sqrt(max(0.0, 1.0 - radiusSquared));
  float3 normal = float3(point.x, -point.y, z);
  if (dot(normal, labelNormal) <= 0.0) return half4(0.0);
  float2 local = float2(dot(normal, labelRight), dot(normal, labelUp));
  float2 source = sphereCenter + float2(local.x, -local.y) * sphereRadius;
  return labelTexture.eval(source);
}`;

export type RenderedGeometryV4 = {
  png: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  visibleFaceCount: number;
};

export type CanvasKitGeometryRendererOptionsV4 = {
  canvasKit: CanvasKitRuntimeV4;
  defaultFontId: FontIdV4;
  fontDataById: CanvasKitFontDataV4;
};

export type PolyhedralRenderPolicyV4 =
  | "legacy"
  | "d20-r3"
  | "standard-r4"
  | "standard-r5"
  | "standard-r6"
  | "standard-r7";

function assertPolyhedralRenderPolicyV4(
  value: unknown,
): asserts value is PolyhedralRenderPolicyV4 {
  if (
    value !== "legacy" &&
    value !== "d20-r3" &&
    value !== "standard-r4" &&
    value !== "standard-r5" &&
    value !== "standard-r6" &&
    value !== "standard-r7"
  ) {
    throw new Error("CanvasKit V4 polyhedral render policy is invalid");
  }
}

export type RenderCanonicalGeometryV4Options = {
  geometry: PolyhedralGeometryDescriptorV4;
  result: number;
  size?: number;
  engravingColor?: string;
  engravingFinish?: EngravingFinishV4;
  engravingContrastEdge?: EngravingContrastEdgeV4;
  engravingFontScale?: number;
  d6FiveOpticalOffsetX?: number;
  lighting?: RenderLightingV4;
  materialFamily?: MaterialFamilyV4;
  requiresLocalSeparation?: boolean;
  criticalEffect?: RenderCriticalEffectV4 | null;
  criticalOuterGlow?: boolean;
  renderPolicy?: PolyhedralRenderPolicyV4;
  allowD20LabelClearanceShortfall?: boolean;
  faceLabelSet?: FaceLabelSetV4;
  blankFaces?: boolean;
};

export type RenderTexturedGeometryV4Options =
  RenderCanonicalGeometryV4Options & {
    texture: TextureRasterV4;
    texturePlacement?: TexturePlacementV4;
    textureScope?: TextureScopeV4;
  };

export type RenderCanonicalSphereV4Options = {
  geometry: SphericalGeometryDescriptorV4;
  sides: number;
  result: number;
  size?: number;
  engravingColor?: string;
  engravingFinish?: EngravingFinishV4;
  engravingContrastEdge?: EngravingContrastEdgeV4;
  engravingFontScale?: number;
  lighting?: RenderLightingV4;
  materialFamily?: MaterialFamilyV4;
  requiresLocalSeparation?: boolean;
  criticalEffect?: RenderCriticalEffectV4 | null;
  renderPolicy?: PolyhedralRenderPolicyV4;
  blankFaces?: boolean;
};

export type RenderTexturedSphereV4Options = RenderCanonicalSphereV4Options & {
  texture: TextureRasterV4;
  texturePlacement?: TexturePlacementV4;
};

export type RenderCanonicalPolyhedralGridDieV4 = Omit<
  RenderCanonicalGeometryV4Options,
  "size"
>;

export type RenderPolyhedralGridV4Options = {
  groups: readonly (readonly RenderCanonicalPolyhedralGridDieV4[])[];
};

export type RenderedPolyhedralGridV4 = RenderedGeometryV4 & {
  diceCount: number;
  rowCount: number;
};

export type RenderGeometryGridDieV4 =
  | (Omit<RenderCanonicalGeometryV4Options, "size"> & {
      kind: "polyhedral";
      fontId: FontIdV4;
      texture?: TextureRasterV4;
      textureMapping?:
        | "source"
        | "octahedral-atlas"
        | "projected-texture"
        | "bounded-projected-texture";
      texturePlacement?: TexturePlacementV4;
      textureScope?: TextureScopeV4;
      icons?: readonly IconNameV4[];
    })
  | (Omit<RenderCanonicalSphereV4Options, "size"> & {
      kind: "sphere";
      fontId: FontIdV4;
      texture?: TextureRasterV4;
      texturePlacement?: TexturePlacementV4;
      materialRaster?: SphericalMaterialRasterV4;
      icons?: readonly IconNameV4[];
    });

export type RenderGeometryGridV4Options = {
  rendererRevision: RendererRevisionV4;
  groups: readonly (readonly RenderGeometryGridDieV4[])[];
};

export type RenderedGeometryGridV4 = RenderedPolyhedralGridV4;

function usesStandardR4PresentationV4(
  renderPolicy: PolyhedralRenderPolicyV4,
): boolean {
  return (
    renderPolicy === "standard-r4" ||
    renderPolicy === "standard-r5" ||
    renderPolicy === "standard-r6" ||
    renderPolicy === "standard-r7"
  );
}

function requireRenderSize(size: number): void {
  if (
    !Number.isInteger(size) ||
    size < MIN_RENDER_SIZE_V4 ||
    size > MAX_RENDER_SIZE_V4
  ) {
    throw new Error(
      `CanvasKit V4 geometry size must be from ${String(MIN_RENDER_SIZE_V4)} through ${String(MAX_RENDER_SIZE_V4)}`,
    );
  }
}

function requireSphereResult(sides: number, result: number): void {
  if (!Number.isInteger(sides) || sides < 1 || sides > 999) {
    throw new Error("CanvasKit V4 Other sides must be from 1 through 999");
  }
  if (!Number.isInteger(result) || result < 1 || result > sides) {
    throw new Error(
      `CanvasKit V4 Other result must be from 1 through ${String(sides)}`,
    );
  }
}

function requireTextureRaster(texture: TextureRasterV4): void {
  const width: number = texture.width;
  const height: number = texture.height;
  if (
    width !== SOURCE_TEXTURE_SIZE_V4 ||
    height !== SOURCE_TEXTURE_SIZE_V4 ||
    texture.pixels.byteLength !== width * height * 4
  ) {
    throw new Error("CanvasKit V4 material texture pixel length is invalid");
  }
}

function wrappedGroupRows<Die>(
  groups: readonly (readonly Die[])[],
): readonly (readonly Die[])[] {
  return groups.flatMap((group) =>
    Array.from(
      { length: Math.ceil(group.length / MAX_GRID_COLUMNS_V4) },
      (_, rowIndex) =>
        group.slice(
          rowIndex * MAX_GRID_COLUMNS_V4,
          (rowIndex + 1) * MAX_GRID_COLUMNS_V4,
        ),
    ),
  );
}

function balancedGroupRows<Die>(
  groups: readonly (readonly Die[])[],
): readonly (readonly Die[])[] {
  return groups.flatMap((group) => {
    const rowCount = Math.ceil(group.length / MAX_GRID_COLUMNS_V4);
    const shortRowLength = Math.floor(group.length / rowCount);
    const longRowCount = group.length % rowCount;
    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const offset =
        rowIndex * shortRowLength + Math.min(rowIndex, longRowCount);
      const rowLength = shortRowLength + (rowIndex < longRowCount ? 1 : 0);
      return group.slice(offset, offset + rowLength);
    });
  });
}

function balancedGroupRowsKeepingPairs<Die>(
  groups: readonly (readonly Die[])[],
  keepTogether: (left: Die, right: Die) => boolean,
): readonly (readonly Die[])[] {
  return groups.flatMap((group) => {
    const balanced = balancedGroupRows([group]);
    const splitsPair = balanced.some((row, index) => {
      const next = balanced[index + 1];
      const left = row.at(-1);
      const right = next?.[0];
      return left !== undefined && right !== undefined && keepTogether(left, right);
    });
    if (!splitsPair) return balanced;

    const minimumRowCount = Math.ceil(group.length / MAX_GRID_COLUMNS_V4);
    for (
      let rowCount = minimumRowCount;
      rowCount <= group.length;
      rowCount += 1
    ) {
      const targetLength = group.length / rowCount;
      const cache = new Map<string, { score: number; rows: Die[][] } | null>();
      const partition = (
        offset: number,
        remainingRows: number,
      ): { score: number; rows: Die[][] } | null => {
        const key = `${String(offset)}:${String(remainingRows)}`;
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
        if (remainingRows === 1) {
          const length = group.length - offset;
          const result = length >= 1 && length <= MAX_GRID_COLUMNS_V4
            ? {
                score: (length - targetLength) ** 2,
                rows: [[...group.slice(offset)]],
              }
            : null;
          cache.set(key, result);
          return result;
        }

        const minimumEnd = Math.max(
          offset + 1,
          group.length - (remainingRows - 1) * MAX_GRID_COLUMNS_V4,
        );
        const maximumEnd = Math.min(
          offset + MAX_GRID_COLUMNS_V4,
          group.length - (remainingRows - 1),
        );
        let best: { score: number; rows: Die[][] } | null = null;
        for (let end = minimumEnd; end <= maximumEnd; end += 1) {
          const left = group[end - 1];
          const right = group[end];
          if (
            left !== undefined &&
            right !== undefined &&
            keepTogether(left, right)
          ) {
            continue;
          }
          const remainder = partition(end, remainingRows - 1);
          if (remainder === null) continue;
          const length = end - offset;
          const candidate = {
            score: (length - targetLength) ** 2 + remainder.score,
            rows: [[...group.slice(offset, end)], ...remainder.rows],
          };
          if (best === null || candidate.score < best.score) best = candidate;
        }
        cache.set(key, best);
        return best;
      };
      const result = partition(0, rowCount);
      if (result !== null) return result.rows;
    }
    throw new Error("CanvasKit V4 could not keep paired dice together");
  });
}

function packCompactGridRows<Die>(
  groups: readonly (readonly Die[])[],
  columnCount: number,
): readonly (readonly Die[])[] {
  const rows: Die[][] = [];
  let row: Die[] = [];
  for (const group of groups) {
    if (row.length > 0 && group.length > columnCount - row.length) {
      rows.push(row);
      row = [];
    }
    for (let offset = 0; offset < group.length;) {
      const take = Math.min(columnCount - row.length, group.length - offset);
      row.push(...group.slice(offset, offset + take));
      offset += take;
      if (row.length === columnCount) {
        rows.push(row);
        row = [];
      }
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

function compactGridRows<Die>(
  groups: readonly (readonly Die[])[],
  rowHeight: number,
): readonly (readonly Die[])[] {
  const minimumColumns = Math.min(
    Math.max(...groups.map((group) => group.length)),
    MAX_GRID_COLUMNS_V4,
  );
  const score = (rows: readonly (readonly Die[])[]) => {
    const width = Math.max(...rows.map((row) => row.length)) * GRID_DIE_SIZE_V4;
    const aspect = width / (rows.length * rowHeight);
    return Math.abs(Math.log(aspect / COMPACT_GRID_TARGET_ASPECT_V4));
  };
  let bestRows = packCompactGridRows(groups, minimumColumns);
  let bestScore = score(bestRows);
  for (
    let columnCount = minimumColumns + 1;
    columnCount <= MAX_GRID_COLUMNS_V4;
    columnCount += 1
  ) {
    const rows = packCompactGridRows(groups, columnCount);
    const candidateScore = score(rows);
    if (candidateScore < bestScore) {
      bestRows = rows;
      bestScore = candidateScore;
    }
  }
  return bestRows;
}

type GroupRowSpacingV4 =
  | { mode: "visual-gap"; pixels: number }
  | { mode: "fixed-stride"; pixels: number };

function groupRowSpacingV4(
  layout: RendererRevisionPolicyV4["gridLayout"],
): GroupRowSpacingV4 | undefined {
  if (layout === "group-rows-r10") {
    return { mode: "visual-gap", pixels: GROUP_ROW_DIE_GAP_R10_V4 };
  }
  if (layout === "group-rows-r11") {
    return { mode: "visual-gap", pixels: GROUP_ROW_DIE_GAP_R11_V4 };
  }
  if (
    layout === "group-rows-r12" ||
    layout === "group-rows-r13" ||
    layout === "group-rows-r14"
  ) {
    return { mode: "fixed-stride", pixels: GROUP_ROW_DIE_STRIDE_R12_V4 };
  }
  return undefined;
}

function geometryGridLayout<Die>(
  groups: readonly (readonly Die[])[],
  name: "geometry grid" | "polyhedral grid",
  hasIcons: boolean,
  iconSize: number,
  layout: RendererRevisionPolicyV4["gridLayout"],
  visualBoundsForDie?: (die: Die) => { left: number; right: number },
  keepTogether?: (left: Die, right: Die) => boolean,
): {
  rows: readonly (readonly Die[])[];
  rowOffsets: readonly number[];
  diceCount: number;
  width: number;
  height: number;
  rowHeight: number;
  columnOffsets: readonly (readonly number[])[];
} {
  if (groups.length === 0) {
    throw new Error(
      `CanvasKit V4 ${name} groups must be a non-empty array`,
    );
  }
  if (groups.some((group) => group.length === 0)) {
    throw new Error(
      `CanvasKit V4 ${name} groups must not contain empty groups`,
    );
  }
  const diceCount = groups.reduce((total, group) => total + group.length, 0);
  if (diceCount > MAX_GRID_DICE_V4) {
    throw new Error(`CanvasKit V4 ${name} exceeds 50 dice`);
  }
  const rowHeight = GRID_DIE_SIZE_V4 + (hasIcons ? iconSize : 0);
  let rows: readonly (readonly Die[])[];
  if (layout === "legacy" || layout === "group-rows-r13") {
    rows = wrappedGroupRows(groups);
  } else if (layout === "group-rows-r14") {
    rows = keepTogether === undefined
      ? balancedGroupRows(groups)
      : balancedGroupRowsKeepingPairs(groups, keepTogether);
  } else if (layout === "compact-r9") {
    rows = compactGridRows(groups, rowHeight);
  } else {
    rows = groups;
  }
  const groupRowSpacing = groupRowSpacingV4(layout);
  if (groupRowSpacing !== undefined && visualBoundsForDie === undefined) {
    throw new Error(`CanvasKit V4 ${name} visual bounds are required`);
  }
  const columnOffsets = rows.map((row) => {
    if (groupRowSpacing === undefined || visualBoundsForDie === undefined) {
      return row.map((_, index) => index * GRID_DIE_SIZE_V4);
    }
    const bounds = row.map(visualBoundsForDie);
    for (const { left, right } of bounds) {
      if (
        !Number.isFinite(left) ||
        !Number.isFinite(right) ||
        right <= left ||
        right - left > GRID_DIE_SIZE_V4 * 2
      ) {
        throw new Error(`CanvasKit V4 ${name} visual bounds are invalid`);
      }
    }
    const offsets = [0];
    for (let index = 1; index < row.length; index += 1) {
      const previous = bounds[index - 1];
      const current = bounds[index];
      if (previous === undefined || current === undefined) {
        throw new Error(`CanvasKit V4 ${name} row is invalid`);
      }
      const previousOffset = offsets[index - 1];
      if (previousOffset === undefined) {
        throw new Error(`CanvasKit V4 ${name} row offset is missing`);
      }
      offsets.push(
        groupRowSpacing.mode === "fixed-stride"
          ? previousOffset + groupRowSpacing.pixels
          : previousOffset +
            Math.ceil(
              previous.right + groupRowSpacing.pixels - current.left,
            ),
      );
    }
    return offsets;
  });
  const fullRowWidths = columnOffsets.map((offsets) => {
    const lastOffset = offsets.at(-1);
    if (lastOffset === undefined) {
      throw new Error(`CanvasKit V4 ${name} row offset is missing`);
    }
    return lastOffset + GRID_DIE_SIZE_V4;
  });
  const visualCenters = rows.map((row, rowIndex) => {
    const fullWidth = fullRowWidths[rowIndex];
    if (fullWidth === undefined) {
      throw new Error(`CanvasKit V4 ${name} row width is missing`);
    }
    if (
      groupRowSpacing === undefined ||
      visualBoundsForDie === undefined ||
      row.length === 1
    ) {
      return fullWidth / 2;
    }
    const first = row[0];
    const last = row.at(-1);
    const lastOffset = columnOffsets[rowIndex]?.at(-1);
    if (first === undefined || last === undefined || lastOffset === undefined) {
      throw new Error(`CanvasKit V4 ${name} visual center is invalid`);
    }
    return (
      visualBoundsForDie(first).left +
      lastOffset +
      visualBoundsForDie(last).right
    ) / 2;
  });
  const rowWidths = fullRowWidths.map((fullWidth, index) => {
    const visualCenter = visualCenters[index];
    if (visualCenter === undefined) {
      throw new Error(`CanvasKit V4 ${name} visual center is missing`);
    }
    return groupRowSpacing === undefined
      ? fullWidth
      : 2 * Math.max(visualCenter, fullWidth - visualCenter);
  });
  const contentWidth = Math.max(...rowWidths);
  const framed =
    (layout === "compact-r9" && diceCount === 1) ||
    groupRowSpacing !== undefined;
  const width = framed
    ? Math.max(contentWidth, rowHeight * COMPACT_GRID_TARGET_ASPECT_V4)
    : contentWidth;
  const rowOffsets = layout === "legacy"
    ? rows.map(() => 0)
    : visualCenters.map((visualCenter) => (width / 2) - visualCenter);
  return {
    rows,
    rowOffsets,
    diceCount,
    width,
    height: rows.length * rowHeight,
    rowHeight,
    columnOffsets,
  };
}

function createTextureShader(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  texture: TextureRasterV4,
): Shader {
  requireTextureRaster(texture);
  const image = scope.own(
    canvasKit.MakeImage(
      {
        width: texture.width,
        height: texture.height,
        colorType: canvasKit.ColorType.RGBA_8888,
        alphaType: canvasKit.AlphaType.Opaque,
        colorSpace: canvasKit.ColorSpace.SRGB,
      },
      texture.pixels,
      texture.width * 4,
    ),
    "material texture image",
  );
  return scope.own(
    image.makeShaderOptions(
      canvasKit.TileMode.Repeat,
      canvasKit.TileMode.Repeat,
      canvasKit.FilterMode.Linear,
      canvasKit.MipmapMode.None,
    ),
    "material texture shader",
  );
}

function createPlacedTextureShader(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  scope: CanvasKitResourceScopeV4,
  texture: TextureRasterV4,
  placement: TexturePlacementV4,
): Shader {
  const textureShader = createTextureShader(canvasKit, scope, texture);
  if (isIdentityTexturePlacementV4(placement)) return textureShader;
  const { center, cosine, sine, offsetU, offsetV } =
    texturePlacementUniformsV4(placement);
  return scope.own(
    getTexturePlacementEffect(canvasKit, resources).makeShaderWithChildren(
      [center, center, cosine, sine, offsetU, offsetV],
      [textureShader],
    ),
    "placed material texture shader",
  );
}

function createPaint(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
): Paint {
  const paint = scope.own(new canvasKit.Paint(), "paint");
  paint.setAntiAlias(true);
  return paint;
}

function createCageCutEdgePaint(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
): Paint {
  const paint = createPaint(canvasKit, scope);
  paint.setColor(canvasKit.Color4f(0.12, 0.07, 0.02, 0.88));
  paint.setStyle(canvasKit.PaintStyle.Stroke);
  paint.setStrokeWidth(1.5);
  paint.setStrokeJoin(canvasKit.StrokeJoin.Round);
  paint.setStrokeCap(canvasKit.StrokeCap.Round);
  return paint;
}

type EngravingPaintsV4 = {
  cavity: Paint;
  wall: Paint;
  ink: Paint;
  inkGlaze: Paint;
  contrastEdge: {
    paint: Paint;
    widthRatio: number;
  } | null;
  glazeDepthFraction: number;
};

function engravingInkComponents(
  color: string | undefined,
): readonly [red: number, green: number, blue: number] {
  if (color === undefined) return [0.98, 0.95, 0.86];
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error("CanvasKit V4 engraving color is invalid");
  }
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ];
}

function engravingPaintRecipe(
  finish: EngravingFinishV4,
  red: number,
  green: number,
  blue: number,
  enhanceD4Finish: boolean,
): EngravingLayerRecipeV4 {
  try {
    const recipe = createEngravingLayerRecipeV4(finish, red, green, blue);
    return enhanceD4Finish
      ? enhanceD4EngravingLayerRecipeV4(finish, recipe)
      : recipe;
  } catch {
    throw new Error(
      `CanvasKit V4 engraving finish is invalid: ${finish}`,
    );
  }
}

function createEngravingPaints(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  color?: string,
  finish: EngravingFinishV4 = "matte-ink",
  enhanceD4Finish = false,
  contrastEdge?: EngravingContrastEdgeV4,
): EngravingPaintsV4 {
  const [red, green, blue] = engravingInkComponents(color);
  const recipe = engravingPaintRecipe(
    finish,
    red,
    green,
    blue,
    enhanceD4Finish,
  );
  const cavity = createPaint(canvasKit, scope);
  cavity.setColor(canvasKit.Color4f(...recipe.cavity));
  const wallMaskFilter = scope.own(
    canvasKit.MaskFilter.MakeBlur(
      canvasKit.BlurStyle.Normal,
      recipe.wallBlur,
      true,
    ),
    "engraving wall mask filter",
  );
  const wall = createPaint(canvasKit, scope);
  wall.setColor(canvasKit.Color4f(...recipe.wall));
  wall.setBlendMode(canvasKit.BlendMode.SrcATop);
  wall.setMaskFilter(wallMaskFilter);
  const ink = createPaint(canvasKit, scope);
  ink.setColor(canvasKit.Color4f(...recipe.ink));
  ink.setBlendMode(canvasKit.BlendMode.SrcATop);
  const inkGlazeMaskFilter = scope.own(
    canvasKit.MaskFilter.MakeBlur(
      canvasKit.BlurStyle.Inner,
      recipe.glazeBlur,
      true,
    ),
    "engraving ink glaze mask filter",
  );
  const inkGlaze = createPaint(canvasKit, scope);
  inkGlaze.setColor(canvasKit.Color4f(...recipe.glaze));
  inkGlaze.setBlendMode(canvasKit.BlendMode.SrcATop);
  inkGlaze.setMaskFilter(inkGlazeMaskFilter);
  let contrastEdgePaint: EngravingPaintsV4["contrastEdge"] = null;
  if (contrastEdge !== undefined) {
    const channel = contrastEdge.color === "#ffffff" ? 1 : 0;
    const paint = createPaint(canvasKit, scope);
    paint.setColor(
      canvasKit.Color4f(channel, channel, channel, contrastEdge.opacity),
    );
    paint.setStyle(canvasKit.PaintStyle.Stroke);
    paint.setStrokeJoin(canvasKit.StrokeJoin.Round);
    paint.setStrokeCap(canvasKit.StrokeCap.Round);
    contrastEdgePaint = { paint, widthRatio: contrastEdge.widthRatio };
  }
  return {
    cavity,
    wall,
    ink,
    inkGlaze,
    contrastEdge: contrastEdgePaint,
    glazeDepthFraction: recipe.glazeDepthFraction,
  };
}

const LOCAL_SEPARATION_OPACITY_V4 = 0.6;

type PhysicalSeparationV4 = {
  color: "black" | "white";
  opacity: number;
};

function resolvePhysicalSeparationV4(
  color?: string,
  finish: EngravingFinishV4 = "matte-ink",
): PhysicalSeparationV4 {
  const [red, green, blue] = engravingInkComponents(color);
  const [inkRed, inkGreen, inkBlue] = engravingPaintRecipe(
    finish,
    red,
    green,
    blue,
    false,
  ).ink;
  const brightness =
    inkRed * 0.2126 + inkGreen * 0.7152 + inkBlue * 0.0722;
  return {
    color: brightness < 0.5 ? "white" : "black",
    opacity: LOCAL_SEPARATION_OPACITY_V4,
  };
}

function createPhysicalSeparationPaint(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  color?: string,
  finish: EngravingFinishV4 = "matte-ink",
): Paint {
  const separation = resolvePhysicalSeparationV4(color, finish);
  const channel = separation.color === "white" ? 1 : 0;
  const paint = createPaint(canvasKit, scope);
  paint.setColor(
    canvasKit.Color4f(channel, channel, channel, separation.opacity),
  );
  return paint;
}

function physicalSeparationPaintForSphere(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  options: RenderCanonicalSphereV4Options,
): Paint | undefined {
  return options.requiresLocalSeparation
    ? createPhysicalSeparationPaint(
        canvasKit,
        scope,
        options.engravingColor,
        options.engravingFinish,
      )
    : undefined;
}

function createFacePath(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  face: ProjectedGeometryFaceV4,
  positions: readonly number[],
): Path {
  const builder: PathBuilder = new canvasKit.PathBuilder();
  try {
    const [firstIndex, ...remainingIndices] = face.vertexIndices;
    if (firstIndex === undefined) {
      throw new Error(`CanvasKit V4 face ${face.id} has no vertices`);
    }
    const firstX = positions[firstIndex * 2];
    const firstY = positions[firstIndex * 2 + 1];
    if (firstX === undefined || firstY === undefined) {
      throw new Error(`CanvasKit V4 face ${face.id} vertex is missing`);
    }
    builder.moveTo(firstX, firstY);
    for (const vertexIndex of remainingIndices) {
      const x = positions[vertexIndex * 2];
      const y = positions[vertexIndex * 2 + 1];
      if (x === undefined || y === undefined) {
        throw new Error(`CanvasKit V4 face ${face.id} vertex is missing`);
      }
      builder.lineTo(x, y);
    }
    builder.close();
    return scope.own(builder.detachAndDelete(), `face ${face.id} path`);
  } catch (error) {
    builder.delete();
    throw error;
  }
}

function drawFaceEdge(
  canvas: Canvas,
  paint: Paint,
  face: ProjectedGeometryFaceV4,
  positions: readonly number[],
  start: number,
  end: number,
): void {
  const startIndex = face.vertexIndices[start];
  const endIndex = face.vertexIndices[end];
  const startX = startIndex === undefined ? undefined : positions[startIndex * 2];
  const startY =
    startIndex === undefined ? undefined : positions[startIndex * 2 + 1];
  const endX = endIndex === undefined ? undefined : positions[endIndex * 2];
  const endY = endIndex === undefined ? undefined : positions[endIndex * 2 + 1];
  if (
    startX === undefined ||
    startY === undefined ||
    endX === undefined ||
    endY === undefined
  ) {
    throw new Error(`CanvasKit V4 face ${face.id} edge is incomplete`);
  }
  canvas.drawLine(startX, startY, endX, endY, paint);
}

function drawFaceBorder(
  canvas: Canvas,
  path: Path,
  primaryPaint: Paint,
  cutEdgePaint: Paint,
  face: ProjectedGeometryFaceV4,
  positions: readonly number[],
  geometry: PolyhedralGeometryDescriptorV4,
  size: number,
): void {
  if (geometry.form !== "hollow-cage") {
    canvas.drawPath(path, primaryPaint);
    return;
  }
  if (face.id.startsWith("frame-")) {
    drawFaceEdge(canvas, primaryPaint, face, positions, 0, 1);
    drawFaceEdge(canvas, cutEdgePaint, face, positions, 2, 3);
    return;
  }
  if (face.id.startsWith("spoke-")) {
    if (size > GRID_DIE_SIZE_V4) canvas.drawPath(path, cutEdgePaint);
    return;
  }
  if (face.id.startsWith("plaque-")) {
    canvas.drawPath(path, cutEdgePaint);
    return;
  }
  throw new Error(`CanvasKit V4 hollow-cage face ${face.id} is invalid`);
}

type GeometryMeshV4 = {
  positions: number[];
  texturePositions: number[];
  indices: number[];
};

function faceLocalGeometryMesh(
  projection: ProjectedPolyhedralGeometryV4,
  textureSize: number,
  placement: TexturePlacementV4,
): GeometryMeshV4 {
  if (placement.offsetU !== 0 || placement.offsetV !== 0) {
    throw new Error(
      "CanvasKit V4 face-local texture scope does not support offsets",
    );
  }
  const { cosine, sine } = texturePlacementUniformsV4(placement);
  const rotatedSpan = Math.abs(cosine) + Math.abs(sine);
  const mesh: GeometryMeshV4 = {
    positions: [],
    texturePositions: [],
    indices: [],
  };
  for (const face of projection.visibleFaces) {
    const points = face.vertexIndices.map((vertexIndex) => {
      const point = projection.vertices[vertexIndex]?.position;
      if (point === undefined) {
        throw new Error(`CanvasKit V4 face ${face.id} mesh is incomplete`);
      }
      return point;
    });
    const left = Math.min(...points.map(([x]) => x));
    const top = Math.min(...points.map(([, y]) => y));
    const width = Math.max(...points.map(([x]) => x)) - left;
    const height = Math.max(...points.map(([, y]) => y)) - top;
    if (!(width > 0) || !(height > 0)) {
      throw new Error(`CanvasKit V4 face ${face.id} bounds are singular`);
    }
    for (let index = 1; index < points.length - 1; index += 1) {
      const first = points[0];
      const second = points[index];
      const third = points[index + 1];
      if (first === undefined || second === undefined || third === undefined) {
        throw new Error(`CanvasKit V4 face ${face.id} mesh is incomplete`);
      }
      const firstIndex = mesh.positions.length / 2;
      for (const point of [first, second, third]) {
        mesh.positions.push(point[0], point[1]);
        const x = (point[0] - left) / width - 0.5;
        const y = (point[1] - top) / height - 0.5;
        mesh.texturePositions.push(
          ((cosine * x + sine * y) / rotatedSpan + 0.5) *
            (textureSize - 1),
          ((-sine * x + cosine * y) / rotatedSpan + 0.5) *
            (textureSize - 1),
        );
      }
      mesh.indices.push(firstIndex, firstIndex + 1, firstIndex + 2);
    }
  }
  return mesh;
}

function geometryMesh(
  projection: ProjectedPolyhedralGeometryV4,
  textureSize: number,
  textureScope: TextureScopeV4,
  texturePlacement: TexturePlacementV4,
  textureMapping:
    | "geometry"
    | "projected-texture"
    | "bounded-projected-texture" = "geometry",
): GeometryMeshV4 {
  if (
    textureMapping === "projected-texture" ||
    textureMapping === "bounded-projected-texture"
  ) {
    if (textureScope === "face-local") {
      throw new Error("CanvasKit V4 projected texture requires die-wide scope");
    }
    let texturePositions: number[];
    if (textureMapping === "projected-texture") {
      texturePositions = projection.mesh.positions.flatMap(([x, y]) => [
        x * textureSize,
        y * textureSize,
      ]);
    } else {
      const xs = projection.mesh.positions.map(([x]) => x);
      const ys = projection.mesh.positions.map(([, y]) => y);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      const span = Math.max(right - left, bottom - top);
      if (!Number.isFinite(span) || span <= 0) {
        throw new Error("CanvasKit V4 projected texture bounds are invalid");
      }
      texturePositions = projection.mesh.positions.flatMap(([x, y]) => [
        ((x - centerX) / span + 0.5) * (textureSize - 1),
        ((y - centerY) / span + 0.5) * (textureSize - 1),
      ]);
    }
    return {
      positions: projection.mesh.positions.flatMap(([x, y]) => [x, y]),
      texturePositions,
      indices: [...projection.mesh.indices],
    };
  }
  if (textureScope === "face-local") {
    return faceLocalGeometryMesh(
      projection,
      textureSize,
      texturePlacement,
    );
  }
  return {
    positions: projection.mesh.positions.flatMap(([x, y]) => [x, y]),
    texturePositions: projection.mesh.skinCoordinates.flatMap(([u, v]) => [
      u * textureSize,
      v * textureSize,
    ]),
    indices: [...projection.mesh.indices],
  };
}

function createSpherePath(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  center: number,
  radius: number,
): Path {
  const builder: PathBuilder = new canvasKit.PathBuilder();
  try {
    builder.addOval(
      canvasKit.LTRBRect(
        center - radius,
        center - radius,
        center + radius,
        center + radius,
      ),
    );
    return scope.own(builder.detachAndDelete(), "sphere path");
  } catch (error) {
    builder.delete();
    throw error;
  }
}

function textWidth(font: Font, value: string): number {
  const glyphs = font.getGlyphIDs(value);
  if ([...glyphs].some((glyph) => glyph === 0)) {
    throw new Error(`CanvasKit V4 font is missing glyphs for ${value}`);
  }
  return [...font.getGlyphWidths(glyphs)].reduce(
    (total, width) => total + width,
    0,
  );
}

type LocalTextBoundsV4 = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type FittedInkTextV4 = {
  x: number;
  baseline: number;
  orientationMarkY: number | null;
  bounds: LocalTextBoundsV4;
};

type NormalizedInkTextV4 = {
  x: number;
  baseline: number;
  orientationMarkY: number | null;
  bounds: LocalTextBoundsV4;
};

type LabelContainmentV4 = {
  polygon: readonly LabelContainmentPointV4[];
  requiredClearance: number;
};

type UniformInkDimensionsV4 = {
  width: number;
  height: number;
};

const D20_UNIFORM_INK_DIMENSIONS_BY_FONT_V4 = new WeakMap<
  Font,
  UniformInkDimensionsV4
>();

function availableLabelSize(label: ProjectedGeometryLabelV4): {
  width: number;
  height: number;
} {
  const width = label.maxWidth - label.opticalInset * 2;
  const height = label.maxHeight - label.opticalInset * 2;
  if (
    !Number.isFinite(label.opticalInset) ||
    label.opticalInset < 0 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    throw new Error("CanvasKit V4 label optical inset is invalid");
  }
  return { width, height };
}

function fitFont(font: Font, value: string, label: ProjectedGeometryLabelV4): void {
  font.setSize(1);
  const width = textWidth(font, value);
  const metrics = font.getMetrics();
  const height = metrics.descent - metrics.ascent;
  if (width <= 0 || height <= 0) {
    throw new Error("CanvasKit V4 font metrics are invalid");
  }
  const available = availableLabelSize(label);
  font.setSize(
    Math.min(available.width / width, available.height / height) * 0.82,
  );
}

function maximumInkFontSize(
  normalized: NormalizedInkTextV4,
  label: ProjectedGeometryLabelV4,
): number {
  const available = availableLabelSize(label);
  return (
    Math.min(
      available.width /
        (normalized.bounds.right - normalized.bounds.left),
      available.height /
        (normalized.bounds.bottom - normalized.bounds.top),
    ) * FACET_INK_FILL_RATIO_V4
  );
}

function fitInkFont(
  font: Font,
  value: string,
  label: ProjectedGeometryLabelV4,
  hasOrientationMark: boolean,
  maximumFontSize = Number.POSITIVE_INFINITY,
): FittedInkTextV4 {
  const normalized = normalizedInkText(font, value, hasOrientationMark);
  const fontSize = Math.min(
    maximumInkFontSize(normalized, label),
    maximumFontSize,
  );
  font.setSize(fontSize);
  return scaleNormalizedInkText(normalized, fontSize);
}

function normalizedInkText(
  font: Font,
  value: string,
  hasOrientationMark: boolean,
): NormalizedInkTextV4 {
  let { left, top, right, bottom } = measureFontInkBoundsV4(font, value);
  const x = -(left + right) / 2;
  left += x;
  right += x;
  const baseline = -(top + bottom) / 2;
  top += baseline;
  bottom += baseline;
  return {
    x,
    baseline,
    orientationMarkY: hasOrientationMark
      ? bottom + ORIENTATION_MARK_GAP_RATIO_V4
      : null,
    bounds: { left, top, right, bottom },
  };
}

function d20UniformInkDimensions(font: Font): UniformInkDimensionsV4 {
  const cached = D20_UNIFORM_INK_DIMENSIONS_BY_FONT_V4.get(font);
  if (cached !== undefined) return cached;

  const dimensions = CANONICAL_FACE_VALUES_V4.d20.map((value) => {
    const { bounds } = normalizedInkText(
      font,
      formatFaceLabelV4("d20", value),
      false,
    );
    return {
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
    };
  });
  const measured = {
    width: Math.max(...dimensions.map(({ width }) => width)),
    height: Math.max(...dimensions.map(({ height }) => height)),
  };
  D20_UNIFORM_INK_DIMENSIONS_BY_FONT_V4.set(font, measured);
  return measured;
}

function uniformInkFontSize(
  dimensions: UniformInkDimensionsV4,
  label: ProjectedGeometryLabelV4,
): number {
  const available = availableLabelSize(label);
  return (
    Math.min(
      available.width / dimensions.width,
      available.height / dimensions.height,
    ) * FACET_INK_FILL_RATIO_V4
  );
}

function scaleNormalizedInkText(
  normalized: NormalizedInkTextV4,
  fontSize: number,
): FittedInkTextV4 {
  const bounds = {
    left: normalized.bounds.left * fontSize,
    top: normalized.bounds.top * fontSize,
    right: normalized.bounds.right * fontSize,
    bottom: normalized.bounds.bottom * fontSize,
  };
  const orientationMarkY =
    normalized.orientationMarkY === null
      ? null
      : normalized.orientationMarkY * fontSize;
  if (orientationMarkY !== null) {
    const halfStroke =
      Math.max(
        ORIENTATION_MARK_MINIMUM_STROKE_V4,
        fontSize * ORIENTATION_MARK_STROKE_RATIO_V4,
      ) / 2;
    bounds.left = Math.min(
      bounds.left,
      -fontSize * ORIENTATION_MARK_HALF_WIDTH_RATIO_V4 - halfStroke,
    );
    bounds.right = Math.max(
      bounds.right,
      fontSize * ORIENTATION_MARK_HALF_WIDTH_RATIO_V4 + halfStroke,
    );
    bounds.top = Math.min(bounds.top, orientationMarkY - halfStroke);
    bounds.bottom = Math.max(bounds.bottom, orientationMarkY + halfStroke);
  }
  return {
    x: normalized.x * fontSize,
    baseline: normalized.baseline * fontSize,
    orientationMarkY,
    bounds,
  };
}

function transformedLabelCorners(
  bounds: LocalTextBoundsV4,
  rightX: number,
  rightY: number,
  downX: number,
  downY: number,
  originX: number,
  originY: number,
): readonly LabelContainmentPointV4[] {
  return ([
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.right, bounds.bottom],
    [bounds.left, bounds.bottom],
  ] as const).map(
    ([localX, localY]): LabelContainmentPointV4 => [
      originX + rightX * localX + downX * localY,
      originY + rightY * localX + downY * localY,
    ],
  );
}

function fitTriangleSafeFont(
  font: Font,
  value: string,
  label: ProjectedGeometryLabelV4,
  hasOrientationMark: boolean,
  rightX: number,
  rightY: number,
  downX: number,
  downY: number,
  originX: number,
  originY: number,
  containment: LabelContainmentV4,
  uniformInkDimensions: UniformInkDimensionsV4 | null = null,
  uniformFontScale = 1,
  allowClearanceShortfall = false,
): FittedInkTextV4 {
  const normalized = normalizedInkText(font, value, hasOrientationMark);
  const clearanceForBounds = (
    bounds: LocalTextBoundsV4,
    fontSize: number,
  ): number => {
    const [depthX, depthY] = engravingDepthOffset(
      rightX,
      rightY,
      downX,
      downY,
      fontSize,
    );
    const padding = Math.max(Math.abs(depthX), Math.abs(depthY));
    const corners = transformedLabelCorners(
      {
        left: bounds.left - padding,
        top: bounds.top - padding,
        right: bounds.right + padding,
        bottom: bounds.bottom + padding,
      },
      rightX,
      rightY,
      downX,
      downY,
      originX,
      originY,
    );
    return minimumConvexPolygonClearanceV4(containment.polygon, corners);
  };
  const fitToClearance = (
    maximumFontSize: number,
    clearanceAt: (fontSize: number) => number,
  ): number => {
    if (clearanceAt(maximumFontSize) >= containment.requiredClearance) {
      return maximumFontSize;
    }
    let lower = maximumFontSize * D20_R3_MINIMUM_FONT_SCALE_V4;
    if (clearanceAt(lower) < containment.requiredClearance) {
      if (allowClearanceShortfall) return lower;
      throw new Error("CanvasKit V4 d20 label cannot preserve edge clearance");
    }
    let upper = maximumFontSize;
    for (
      let iteration = 0;
      iteration < D20_R3_LABEL_FIT_ITERATIONS_V4;
      iteration += 1
    ) {
      const candidate = (lower + upper) / 2;
      if (clearanceAt(candidate) >= containment.requiredClearance) {
        lower = candidate;
      } else {
        upper = candidate;
      }
    }
    return lower;
  };
  const uniformMaximumFontSize =
    uniformInkDimensions === null
      ? Number.POSITIVE_INFINITY
      : fitToClearance(
          uniformInkFontSize(uniformInkDimensions, label),
          (fontSize) =>
            clearanceForBounds(
              {
                left: (-uniformInkDimensions.width * fontSize) / 2,
                top: (-uniformInkDimensions.height * fontSize) / 2,
                right: (uniformInkDimensions.width * fontSize) / 2,
                bottom: (uniformInkDimensions.height * fontSize) / 2,
              },
              fontSize,
            ),
        );
  const maximumFontSize = Math.min(
    maximumInkFontSize(normalized, label),
    uniformMaximumFontSize,
  );
  const fontSize =
    fitToClearance(maximumFontSize, (candidate) =>
      clearanceForBounds(
        scaleNormalizedInkText(normalized, candidate).bounds,
        candidate,
      ),
    ) * uniformFontScale;

  font.setSize(fontSize);
  return scaleNormalizedInkText(normalized, fontSize);
}

function usesInkBoundsFit(target: AppearanceTargetV4): boolean {
  return target === "d8" || target === "d12";
}

function drawEngravingPass(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  value: string,
  orientationMarkY: number | null,
  font: Font,
  paint: Paint,
  x: number,
  baseline: number,
  offsetX: number,
  offsetY: number,
  orientationStrokeExpansion = 0,
): void {
  canvas.drawText(value, x + offsetX, baseline + offsetY, paint, font);
  if (orientationMarkY === null) return;

  paint.setStrokeWidth(
    Math.max(
      ORIENTATION_MARK_MINIMUM_STROKE_V4,
      font.getSize() * ORIENTATION_MARK_STROKE_RATIO_V4,
    ) + orientationStrokeExpansion,
  );
  paint.setStrokeCap(canvasKit.StrokeCap.Round);
  const markY = orientationMarkY + offsetY;
  const halfWidth = font.getSize() * ORIENTATION_MARK_HALF_WIDTH_RATIO_V4;
  canvas.drawLine(
    -halfWidth + offsetX,
    markY,
    halfWidth + offsetX,
    markY,
    paint,
  );
}

function engravingDepthOffset(
  rightX: number,
  rightY: number,
  downX: number,
  downY: number,
  fontSize: number,
): readonly [x: number, y: number] {
  const determinant = rightX * downY - rightY * downX;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new Error("CanvasKit V4 label transform is singular");
  }
  const squaredScale =
    rightX * rightX + rightY * rightY + downX * downX + downY * downY;
  const scaleDiscriminant = Math.max(
    0,
    squaredScale * squaredScale - 4 * determinant * determinant,
  );
  const projectedScale = Math.sqrt(
    Math.max(0, (squaredScale - Math.sqrt(scaleDiscriminant)) / 2),
  );
  const depthPixels = fontSize * projectedScale * ENGRAVING_DEPTH_RATIO_V4;
  const screenDepth = depthPixels / Math.SQRT2;
  return [
    (downY * screenDepth - downX * screenDepth) / determinant,
    (-rightY * screenDepth + rightX * screenDepth) / determinant,
  ];
}

type LabelPixelBoundsV4 = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function transformedLabelBounds(
  left: number,
  top: number,
  right: number,
  bottom: number,
  rightX: number,
  rightY: number,
  downX: number,
  downY: number,
  originX: number,
  originY: number,
): LabelPixelBoundsV4 {
  const corners = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ] as const;
  const x = corners.map(
    ([localX, localY]) => originX + rightX * localX + downX * localY,
  );
  const y = corners.map(
    ([localX, localY]) => originY + rightY * localX + downY * localY,
  );
  return {
    left: Math.min(...x),
    top: Math.min(...y),
    right: Math.max(...x),
    bottom: Math.max(...y),
  };
}

function drawLabel(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  path: Path,
  label: ProjectedGeometryLabelV4,
  target: AppearanceTargetV4,
  size: number,
  font: Font,
  engraving: EngravingPaintsV4,
  containment: LabelContainmentV4 | null = null,
  uniformInkDimensions: UniformInkDimensionsV4 | null = null,
  engravingFontScale = 1,
  allowD20LabelClearanceShortfall = false,
  faceLabelSet?: FaceLabelSetV4,
  opticalOffsetX = 0,
): LabelPixelBoundsV4 | null {
  const value = formatFaceLabelV4(target, label.value, faceLabelSet);
  if (value === "") return null;
  const hasOrientationMark = requiresOrientationMarkV4(
    target,
    label.value,
    faceLabelSet,
  );
  const rightX = label.right[0] * size;
  const rightY = label.right[1] * size;
  const downX = -label.up[0] * size;
  const downY = -label.up[1] * size;
  const originX = label.origin[0] * size;
  const originY = label.origin[1] * size;
  let x: number;
  let baseline: number;
  let orientationMarkY: number | null;
  let textBounds: LocalTextBoundsV4;
  const uniformFontScale =
    uniformInkDimensions !== null && hasOrientationMark
      ? D20_R4_ORIENTATION_MARK_OPTICAL_SCALE_V4
      : 1;
  const maximumFontSize =
    uniformInkDimensions === null
      ? Number.POSITIVE_INFINITY
      : uniformInkFontSize(uniformInkDimensions, label) * uniformFontScale;
  if (containment !== null) {
    const fitted = fitTriangleSafeFont(
      font,
      value,
      label,
      hasOrientationMark,
      rightX,
      rightY,
      downX,
      downY,
      originX,
      originY,
      containment,
      uniformInkDimensions,
      uniformFontScale,
      allowD20LabelClearanceShortfall,
    );
    x = fitted.x;
    baseline = fitted.baseline;
    orientationMarkY = fitted.orientationMarkY;
    textBounds = fitted.bounds;
  } else if (usesInkBoundsFit(target) || uniformInkDimensions !== null) {
    const fitted = fitInkFont(
      font,
      value,
      label,
      hasOrientationMark,
      maximumFontSize,
    );
    x = fitted.x;
    baseline = fitted.baseline;
    orientationMarkY = fitted.orientationMarkY;
    textBounds = fitted.bounds;
  } else {
    fitFont(font, value, label);
    const width = textWidth(font, value);
    const metrics = font.getMetrics();
    x = -width / 2;
    baseline = -(metrics.ascent + metrics.descent) / 2;
    orientationMarkY = hasOrientationMark
      ? baseline + font.getSize() * ORIENTATION_MARK_Y_RATIO_V4
      : null;
    textBounds = {
      left: x,
      top: baseline + metrics.ascent,
      right: x + width,
      bottom: hasOrientationMark
        ? baseline + font.getSize() * 0.39
        : baseline + metrics.descent,
    };
  }
  if (
    !Number.isFinite(engravingFontScale) ||
    engravingFontScale <= 0 ||
    engravingFontScale > 1
  ) {
    throw new Error("CanvasKit V4 engraving font scale is invalid");
  }
  if (engravingFontScale !== 1) {
    font.setSize(font.getSize() * engravingFontScale);
    x *= engravingFontScale;
    baseline *= engravingFontScale;
    if (orientationMarkY !== null) orientationMarkY *= engravingFontScale;
    textBounds = {
      left: textBounds.left * engravingFontScale,
      top: textBounds.top * engravingFontScale,
      right: textBounds.right * engravingFontScale,
      bottom: textBounds.bottom * engravingFontScale,
    };
  }
  if (!Number.isFinite(opticalOffsetX) || Math.abs(opticalOffsetX) > 0.25) {
    throw new Error("CanvasKit V4 label optical offset is invalid");
  }
  x += opticalOffsetX;
  textBounds = {
    ...textBounds,
    left: textBounds.left + opticalOffsetX,
    right: textBounds.right + opticalOffsetX,
  };
  const [depthX, depthY] = engravingDepthOffset(
    rightX,
    rightY,
    downX,
    downY,
    font.getSize(),
  );
  const contrastEdgeWidth =
    engraving.contrastEdge?.widthRatio === undefined
      ? 0
      : font.getSize() * engraving.contrastEdge.widthRatio;
  const layerPadding =
    Math.max(Math.abs(depthX), Math.abs(depthY)) + contrastEdgeWidth;
  const localBounds = {
    left: textBounds.left - layerPadding,
    top: textBounds.top - layerPadding,
    right: textBounds.right + layerPadding,
    bottom: textBounds.bottom + layerPadding,
  };
  const pixelBounds = transformedLabelBounds(
    localBounds.left,
    localBounds.top,
    localBounds.right,
    localBounds.bottom,
    rightX,
    rightY,
    downX,
    downY,
    originX,
    originY,
  );

  canvas.save();
  try {
    if (containment === null) {
      canvas.clipPath(path, canvasKit.ClipOp.Intersect, true);
    }
    canvas.concat([
      rightX,
      downX,
      originX,
      rightY,
      downY,
      originY,
      0,
      0,
      1,
    ]);
    canvas.saveLayer(
      undefined,
      canvasKit.LTRBRect(
        localBounds.left,
        localBounds.top,
        localBounds.right,
        localBounds.bottom,
      ),
    );
    try {
      drawEngravingPass(
        canvasKit,
        canvas,
        value,
        orientationMarkY,
        font,
        engraving.cavity,
        x,
        baseline,
        0,
        0,
      );
      drawEngravingPass(
        canvasKit,
        canvas,
        value,
        orientationMarkY,
        font,
        engraving.wall,
        x,
        baseline,
        depthX * ENGRAVING_WALL_DEPTH_FRACTION_V4,
        depthY * ENGRAVING_WALL_DEPTH_FRACTION_V4,
      );
      if (engraving.contrastEdge !== null) {
        engraving.contrastEdge.paint.setStrokeWidth(contrastEdgeWidth * 2);
        drawEngravingPass(
          canvasKit,
          canvas,
          value,
          orientationMarkY,
          font,
          engraving.contrastEdge.paint,
          x,
          baseline,
          depthX,
          depthY,
          contrastEdgeWidth * 2,
        );
      }
      drawEngravingPass(
        canvasKit,
        canvas,
        value,
        orientationMarkY,
        font,
        engraving.ink,
        x,
        baseline,
        depthX,
        depthY,
      );
      drawEngravingPass(
        canvasKit,
        canvas,
        value,
        orientationMarkY,
        font,
        engraving.inkGlaze,
        x,
        baseline,
        depthX * engraving.glazeDepthFraction,
        depthY * engraving.glazeDepthFraction,
      );
    } finally {
      canvas.restore();
    }
  } finally {
    canvas.restore();
  }
  return pixelBounds;
}

function encodeSurface(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  surface: Surface,
): Uint8Array<ArrayBuffer> {
  surface.flush();
  const image = scope.own(surface.makeImageSnapshot(), "geometry image");
  const encoded = image.encodeToBytes(canvasKit.ImageFormat.PNG, 100);
  if (encoded === null) throw new Error("CanvasKit V4 PNG encoding failed");
  const png = new Uint8Array(encoded);
  if (!PNG_SIGNATURE.every((byte, index) => png[index] === byte)) {
    throw new Error("CanvasKit V4 encoded output is not a PNG");
  }
  return png;
}

type GeometryShaderFactoryV4 = (
  scope: CanvasKitResourceScopeV4,
  size: number,
) => Shader;

function drawUniqueProjectedEdges(
  canvas: Canvas,
  faces: readonly ProjectedGeometryFaceV4[],
  positions: readonly number[],
  paint: Paint,
): void {
  const drawn = new Set<string>();
  for (const face of faces) {
    for (let index = 0; index < face.vertexIndices.length; index += 1) {
      const startIndex = face.vertexIndices[index];
      const endIndex = face.vertexIndices[(index + 1) % face.vertexIndices.length];
      if (startIndex === undefined || endIndex === undefined) {
        throw new Error("CanvasKit V4 face edge is missing");
      }
      const key = `${Math.min(startIndex, endIndex)}:${Math.max(startIndex, endIndex)}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const startX = positions[startIndex * 2];
      const startY = positions[startIndex * 2 + 1];
      const endX = positions[endIndex * 2];
      const endY = positions[endIndex * 2 + 1];
      if (
        startX === undefined ||
        startY === undefined ||
        endX === undefined ||
        endY === undefined
      ) {
        throw new Error("CanvasKit V4 face edge position is missing");
      }
      canvas.drawLine(startX, startY, endX, endY, paint);
    }
  }
}

function drawPolyhedralGeometry(
  canvasKit: CanvasKitRuntimeV4,
  font: Font,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  {
    geometry,
    result,
    size = 600,
    engravingColor,
    engravingFinish,
    engravingContrastEdge,
    engravingFontScale = 1,
    d6FiveOpticalOffsetX = 0,
    lighting,
    materialFamily,
    requiresLocalSeparation = false,
    criticalEffect,
    criticalOuterGlow = false,
    renderPolicy = "legacy",
    allowD20LabelClearanceShortfall = false,
    faceLabelSet,
    blankFaces = false,
  }: RenderCanonicalGeometryV4Options,
  textureSize: number,
  createShader: GeometryShaderFactoryV4,
  textureScope: TextureScopeV4 = "die-wide",
  texturePlacement: TexturePlacementV4 = IDENTITY_TEXTURE_PLACEMENT_V4,
  textureMapping:
    | "geometry"
    | "projected-texture"
    | "bounded-projected-texture" = "geometry",
): number {
  requireRenderSize(size);
  assertPolyhedralRenderPolicyV4(renderPolicy);
  if (renderPolicy === "d20-r3" && geometry.id !== "d20-standard-r2") {
    throw new Error("CanvasKit V4 d20 r3 render policy requires d20-standard-r2");
  }
  if (
    geometry.id === "d20-standard-r2" &&
    renderPolicy !== "d20-r3" &&
    !usesStandardR4PresentationV4(renderPolicy)
  ) {
    throw new Error(
      "CanvasKit V4 d20-standard-r2 requires d20 r3 or standard r4/r5/r6/r7 render policy",
    );
  }
  const projection = projectPolyhedralGeometryV4(geometry, result);
  const positions = projection.vertices.flatMap(({ position }) => [
    position[0] * size,
    position[1] * size,
  ]);
  const mesh = geometryMesh(
    projection,
    textureSize,
    textureScope,
    texturePlacement,
    textureMapping,
  );
  const vertices = scope.own(
    canvasKit.MakeVertices(
      canvasKit.VertexMode.Triangles,
      mesh.positions.map((coordinate) => coordinate * size),
      mesh.texturePositions,
      null,
      mesh.indices,
      false,
    ),
    "geometry vertices",
  );
  const materialPaint = createPaint(canvasKit, scope);
  materialPaint.setShader(createShader(scope, size));
  const shadePaint = createPaint(canvasKit, scope);
  const borderPaint = createPaint(canvasKit, scope);
  borderPaint.setColor(canvasKit.Color4f(0.01, 0.005, 0.02, 1));
  borderPaint.setStyle(canvasKit.PaintStyle.Stroke);
  const standardThinBorder =
    renderPolicy === "d20-r3" ||
    (usesStandardR4PresentationV4(renderPolicy) &&
      geometry.form !== "hollow-cage");
  const separatorWidth = standardThinBorder ? 1 : 3;
  borderPaint.setStrokeWidth(separatorWidth);
  const usesAngularSeparators =
    geometry.form === "sharp" || geometry.form === "crystal-cut";
  borderPaint.setStrokeJoin(
    usesAngularSeparators
      ? canvasKit.StrokeJoin.Bevel
      : canvasKit.StrokeJoin.Round,
  );
  if (geometry.form === "hollow-cage" || standardThinBorder) {
    borderPaint.setStrokeCap(canvasKit.StrokeCap.Round);
  }
  const cutEdgePaint =
    geometry.form === "hollow-cage"
      ? createCageCutEdgePaint(canvasKit, scope)
      : borderPaint;
  const engraving = createEngravingPaints(
    canvasKit,
    scope,
    engravingColor,
    engravingFinish,
    (renderPolicy === "standard-r5" ||
      renderPolicy === "standard-r6" ||
      renderPolicy === "standard-r7") &&
      geometry.target === "d4",
    engravingContrastEdge,
  );
  const facePaths = projection.visibleFaces.map((face) =>
    createFacePath(canvasKit, scope, face, positions),
  );
  const uniformInkDimensions =
    !blankFaces &&
    usesStandardR4PresentationV4(renderPolicy) &&
    geometry.target === "d20"
      ? d20UniformInkDimensions(font)
      : null;

  canvas.drawVertices(vertices, canvasKit.BlendMode.SrcOver, materialPaint);
  projection.visibleFaces.forEach((face, index) => {
    const path = facePaths[index];
    if (path === undefined) throw new Error("CanvasKit V4 face path is missing");
    const overlay = resolvePolyhedralLightingOverlayV4(
      face.normal,
      lighting,
      materialFamily,
    );
    if (overlay.alpha > 0) {
      shadePaint.setColor(
        overlay.color === "black"
          ? canvasKit.Color4f(0.01, 0.005, 0.02, 1)
          : canvasKit.Color4f(1, 1, 1, 1),
      );
      shadePaint.setAlphaf(overlay.alpha);
      canvas.drawPath(path, shadePaint);
    }
  });
  if (requiresLocalSeparation) {
    const separationPaint = createPhysicalSeparationPaint(
      canvasKit,
      scope,
      engravingColor,
      engravingFinish,
    );
    facePaths.forEach((path) => {
      canvas.drawPath(path, separationPaint);
    });
  }
  if (standardThinBorder) {
    drawUniqueProjectedEdges(
      canvas,
      projection.visibleFaces,
      positions,
      borderPaint,
    );
  } else {
    projection.visibleFaces.forEach((face, index) => {
      const path = facePaths[index];
      if (path === undefined) {
        throw new Error("CanvasKit V4 face path is missing");
      }
      drawFaceBorder(
        canvas,
        path,
        borderPaint,
        cutEdgePaint,
        face,
        positions,
        geometry,
        size,
      );
    });
  }
  if (!blankFaces) projection.visibleFaces.forEach((face, index) => {
    const path = facePaths[index];
    if (path === undefined) throw new Error("CanvasKit V4 face path is missing");
    const containment: LabelContainmentV4 | null =
      (renderPolicy === "d20-r3" ||
        (usesStandardR4PresentationV4(renderPolicy) &&
          geometry.id === "d20-standard-r2"))
        ? {
            polygon: face.vertexIndices.map((vertexIndex) => {
              const x = positions[vertexIndex * 2];
              const y = positions[vertexIndex * 2 + 1];
              if (x === undefined || y === undefined) {
                throw new Error("CanvasKit V4 face position is missing");
              }
              return [x, y] as const;
            }),
            requiredClearance:
              separatorWidth / 2 + size * D20_R3_LABEL_CLEARANCE_RATIO_V4,
          }
        : null;
    face.labels.forEach((label) => {
      drawLabel(
        canvasKit,
        canvas,
        path,
        label,
        geometry.target,
        size,
        font,
        engraving,
        containment,
        uniformInkDimensions,
        engravingFontScale,
        allowD20LabelClearanceShortfall,
        faceLabelSet,
        geometry.target === "d6" && label.value === 5
          ? d6FiveOpticalOffsetX
          : 0,
      );
    });
  });
  if (criticalEffect !== null && criticalEffect !== undefined) {
    drawPolyhedralCriticalEffectV4(
      canvasKit,
      canvas,
      scope,
      projection,
      facePaths,
      size,
      criticalEffect,
      criticalOuterGlow,
    );
  }
  return projection.visibleFaces.length;
}

// CanvasKit drawing is synchronous. Dispose each outer scope before the first
// await so unresolved concurrent calls cannot retain surfaces in WASM.
async function renderPolyhedralGeometry(
  canvasKit: CanvasKitRuntimeV4,
  font: Font,
  options: RenderCanonicalGeometryV4Options,
  textureSize: number,
  createShader: GeometryShaderFactoryV4,
  textureScope: TextureScopeV4 = "die-wide",
  texturePlacement: TexturePlacementV4 = IDENTITY_TEXTURE_PLACEMENT_V4,
): Promise<RenderedGeometryV4> {
  const size = options.size ?? 600;
  requireRenderSize(size);
  const rendered = withCanvasKitResourcesSyncV4((scope) => {
    const surface = scope.own(
      canvasKit.MakeSurface(size, size),
      "geometry surface",
      (owned) => {
        owned.dispose();
      },
    );
    const canvas = surface.getCanvas();
    canvas.clear(canvasKit.TRANSPARENT);
    const visibleFaceCount = drawPolyhedralGeometry(
      canvasKit,
      font,
      canvas,
      scope,
      options,
      textureSize,
      createShader,
      textureScope,
      texturePlacement,
    );
    return {
      png: encodeSurface(canvasKit, scope, surface),
      width: size,
      height: size,
      visibleFaceCount,
    };
  });
  await Promise.resolve();
  return rendered;
}

function renderWithGeometryRenderer(
  canvasKit: CanvasKitRuntimeV4,
  font: Font,
  faceEffect: RuntimeEffect,
  octahedralEffect: RuntimeEffect,
  options: RenderCanonicalGeometryV4Options,
): Promise<RenderedGeometryV4> {
  const size = options.size ?? 600;
  const usesOctahedralMapping =
    options.geometry.skinMapping.kind === "view-octahedral";
  const effect = usesOctahedralMapping ? octahedralEffect : faceEffect;
  return renderPolyhedralGeometry(
    canvasKit,
    font,
    options,
    size,
    (scope) =>
      scope.own(
        effect.makeShader(usesOctahedralMapping ? [size] : [size, size]),
        "geometry material shader",
      ),
  );
}

async function renderGeometryGridSurface<Die>(
  canvasKit: CanvasKitRuntimeV4,
  groups: readonly (readonly Die[])[],
  name: "geometry grid" | "polyhedral grid",
  rendererRevision: RendererRevisionV4,
  drawDie: (
    canvas: Canvas,
    scope: CanvasKitResourceScopeV4,
    sharedScope: CanvasKitResourceScopeV4,
    die: Die,
  ) => number,
  iconsForDie?: (die: Die) => readonly IconNameV4[],
  visualBoundsForDie?: (die: Die) => { left: number; right: number },
  verticalOffsetForDie?: (die: Die) => number,
  sharedIconsForPair?: (
    left: Die,
    right: Die,
  ) => readonly IconNameV4[] | undefined,
): Promise<RenderedGeometryGridV4> {
  const hasIcons =
    iconsForDie !== undefined &&
    groups.some((group) => group.some((die) => iconsForDie(die).length > 0));
  const {
    rows,
    rowOffsets,
    diceCount,
    width,
    height,
    rowHeight,
    columnOffsets,
  } = geometryGridLayout(
    groups,
    name,
    hasIcons,
    modifierIconSizeV4(rendererRevision),
    rendererRevisionPolicyV4(rendererRevision).gridLayout,
    visualBoundsForDie,
    sharedIconsForPair === undefined
      ? undefined
      : (left, right) => sharedIconsForPair(left, right) !== undefined,
  );
  const rendered = withCanvasKitResourcesSyncV4((scope) => {
    const surface = scope.own(
      canvasKit.MakeSurface(width, height),
      `${name} surface`,
      (owned) => {
        owned.dispose();
      },
    );
    const canvas = surface.getCanvas();
    canvas.clear(canvasKit.TRANSPARENT);
    const iconPainter = hasIcons
      ? new CanvasKitModifierIconPainterV4(canvasKit, scope)
      : undefined;
    let visibleFaceCount = 0;
    rows.forEach((row, rowIndex) => {
      const sharedIconPairs = new Map<number, readonly IconNameV4[]>();
      if (sharedIconsForPair !== undefined) {
        for (let index = 0; index < row.length - 1; index += 1) {
          const left = row[index];
          const right = row[index + 1];
          if (left === undefined || right === undefined) continue;
          const icons = sharedIconsForPair(left, right);
          if (icons !== undefined) sharedIconPairs.set(index, icons);
        }
      }
      row.forEach((die, columnIndex) => {
        const rowOffset = rowOffsets[rowIndex];
        const columnOffset = columnOffsets[rowIndex]?.[columnIndex];
        if (rowOffset === undefined || columnOffset === undefined) {
          throw new Error(`CanvasKit V4 ${name} die offset is missing`);
        }
        canvas.save();
        try {
          canvas.translate(
            rowOffset + columnOffset,
            rowIndex * rowHeight,
          );
          visibleFaceCount += withCanvasKitResourcesSyncV4((dieScope) => {
            canvas.save();
            try {
              canvas.translate(0, verticalOffsetForDie?.(die) ?? 0);
              return drawDie(canvas, dieScope, scope, die);
            } finally {
              canvas.restore();
            }
          });
          if (
            iconPainter !== undefined &&
            iconsForDie !== undefined &&
            !sharedIconPairs.has(columnIndex - 1) &&
            !sharedIconPairs.has(columnIndex)
          ) {
            iconPainter.draw(canvas, iconsForDie(die), rendererRevision);
          }
        } finally {
          canvas.restore();
        }
      });
      if (iconPainter !== undefined) {
        sharedIconPairs.forEach((icons, columnIndex) => {
          const leftOffset = columnOffsets[rowIndex]?.[columnIndex];
          const rightOffset = columnOffsets[rowIndex]?.[columnIndex + 1];
          const rowOffset = rowOffsets[rowIndex];
          if (
            leftOffset === undefined ||
            rightOffset === undefined ||
            rowOffset === undefined
          ) {
            throw new Error(`CanvasKit V4 ${name} shared icon offset is missing`);
          }
          canvas.save();
          try {
            canvas.translate(
              rowOffset + (leftOffset + rightOffset) / 2,
              rowIndex * rowHeight,
            );
            iconPainter.draw(canvas, icons, rendererRevision);
          } finally {
            canvas.restore();
          }
        });
      }
    });
    return {
      png: encodeSurface(canvasKit, scope, surface),
      width,
      height,
      visibleFaceCount,
      diceCount,
      rowCount: rows.length,
    };
  });
  await Promise.resolve();
  return rendered;
}

function renderPolyhedralGridWithGeometryRenderer(
  canvasKit: CanvasKitRuntimeV4,
  font: Font,
  faceEffect: RuntimeEffect,
  octahedralEffect: RuntimeEffect,
  { groups }: RenderPolyhedralGridV4Options,
): Promise<RenderedPolyhedralGridV4> {
  return renderGeometryGridSurface(
    canvasKit,
    groups,
    "polyhedral grid",
    "canvaskit-v4-r1",
    (canvas, scope, _sharedScope, die) => {
      const usesOctahedralMapping =
        die.geometry.skinMapping.kind === "view-octahedral";
      const effect = usesOctahedralMapping
        ? octahedralEffect
        : faceEffect;
      return drawPolyhedralGeometry(
        canvasKit,
        font,
        canvas,
        scope,
        { ...die, size: GRID_DIE_SIZE_V4 },
        GRID_DIE_SIZE_V4,
        (shaderScope) =>
          shaderScope.own(
            effect.makeShader(
              usesOctahedralMapping
                ? [GRID_DIE_SIZE_V4]
                : [GRID_DIE_SIZE_V4, GRID_DIE_SIZE_V4],
            ),
            "geometry grid material shader",
          ),
      );
    },
  );
}

function renderTexturedWithGeometryRenderer(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  {
    texture,
    texturePlacement = IDENTITY_TEXTURE_PLACEMENT_V4,
    textureScope = "die-wide",
    ...options
  }: RenderTexturedGeometryV4Options,
): Promise<RenderedGeometryV4> {
  const usesOctahedralMapping =
    options.geometry.skinMapping.kind === "view-octahedral";
  return renderPolyhedralGeometry(
    canvasKit,
    resources.defaultFont,
    options,
    texture.width,
    (scope) => {
      const textureShader = createPlacedTextureShader(
        canvasKit,
        resources,
        scope,
        texture,
        textureScope === "face-local"
          ? IDENTITY_TEXTURE_PLACEMENT_V4
          : texturePlacement,
      );
      if (textureScope === "face-local") return textureShader;
      return usesOctahedralMapping
        ? scope.own(
            resources.octahedralTextureEffect.makeShaderWithChildren(
              [texture.width, texture.width],
              [textureShader],
            ),
            "geometry octahedral texture shader",
          )
        : textureShader;
    },
    textureScope,
    texturePlacement,
  );
}

type SphereShaderFactoryV4 = (
  scope: CanvasKitResourceScopeV4,
  center: number,
  radius: number,
) => Shader;

function sphereLightingParameterUniforms(
  parameters: SphereLightingParametersV4,
): number[] {
  return [
    ...parameters.lightDirection,
    parameters.ambient,
    parameters.intrinsic,
    parameters.directional,
    parameters.rim,
  ];
}

function sphereLightingUniforms(
  center: number,
  radius: number,
  parameters: SphereLightingParametersV4,
): number[] {
  return [
    center,
    center,
    radius,
    ...sphereLightingParameterUniforms(parameters),
  ];
}

function sphereTextureLightingUniforms(
  center: number,
  radius: number,
  textureSize: number,
  parameters: SphereLightingParametersV4,
): number[] {
  return [
    center,
    center,
    radius,
    textureSize,
    ...sphereLightingParameterUniforms(parameters),
  ];
}

function sphereLabelDrawBounds(
  source: LabelPixelBoundsV4,
  center: number,
  radius: number,
): LabelPixelBoundsV4 {
  const tangentLeft = (source.left - center) / radius;
  const tangentRight = (source.right - center) / radius;
  const minimumTangentX =
    tangentLeft <= 0 && tangentRight >= 0
      ? 0
      : Math.min(Math.abs(tangentLeft), Math.abs(tangentRight));
  const maximumTangentX = Math.max(
    Math.abs(tangentLeft),
    Math.abs(tangentRight),
  );
  const minimumArc = minimumTangentX * minimumTangentX * 0.18;
  const maximumArc = maximumTangentX * maximumTangentX * 0.18;
  const tangentTop = (source.top - center) / radius - maximumArc;
  const tangentBottom = (source.bottom - center) / radius - minimumArc;
  const projectTangent = (value: number) => value / Math.hypot(1, value);
  const padding = 2;
  return {
    left: Math.floor(center + radius * projectTangent(tangentLeft) - padding),
    top: Math.floor(center + radius * projectTangent(tangentTop) - padding),
    right: Math.ceil(center + radius * projectTangent(tangentRight) + padding),
    bottom: Math.ceil(center + radius * projectTangent(tangentBottom) + padding),
  };
}

function createSphereBorderPaint(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  renderPolicy: PolyhedralRenderPolicyV4,
): Paint {
  const paint = createPaint(canvasKit, scope);
  paint.setColor(canvasKit.Color4f(0.01, 0.005, 0.02, 1));
  paint.setStyle(canvasKit.PaintStyle.Stroke);
  paint.setStrokeWidth(usesStandardR4PresentationV4(renderPolicy) ? 1 : 3);
  return paint;
}

function drawSphericalBackground(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  center: number,
  radius: number,
  createShader: SphereShaderFactoryV4,
  separationPaint: Paint | undefined,
  renderPolicy: PolyhedralRenderPolicyV4,
): Path {
  const path = createSpherePath(canvasKit, scope, center, radius);
  const shader = createShader(scope, center, radius);
  const materialPaint = createPaint(canvasKit, scope);
  materialPaint.setShader(shader);
  const borderPaint = createSphereBorderPaint(
    canvasKit,
    scope,
    renderPolicy,
  );
  canvas.drawPath(path, materialPaint);
  if (separationPaint !== undefined) {
    canvas.drawPath(path, separationPaint);
  }
  canvas.drawPath(path, borderPaint);
  return path;
}

function drawSphericalLabel(
  canvasKit: CanvasKitRuntimeV4,
  font: Font,
  labelEffect: RuntimeEffect,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  path: Path,
  geometry: SphericalGeometryDescriptorV4,
  result: number,
  size: number,
  center: number,
  radius: number,
  engravingColor?: string,
  engravingFinish?: EngravingFinishV4,
  engravingContrastEdge?: EngravingContrastEdgeV4,
  engravingFontScale = 1,
): void {
  const labelSurface = scope.own(
    canvasKit.MakeSurface(size, size),
    "sphere label surface",
    (owned) => {
      owned.dispose();
    },
  );
  const engraving = createEngravingPaints(
    canvasKit,
    scope,
    engravingColor,
    engravingFinish,
    false,
    engravingContrastEdge,
  );
  const height = geometry.camera.orthographicHeight;
  const usesLocalFrame = geometry.labelMapping === "local-frame-r19";
  const labelCanvas = labelSurface.getCanvas();
  labelCanvas.clear(canvasKit.TRANSPARENT);
  const labelBounds = drawLabel(
    canvasKit,
    labelCanvas,
    path,
    {
      value: result,
      alignment: "viewer-upright",
      origin: usesLocalFrame
        ? [0.5, 0.5]
        : [
            0.5 + geometry.labelFrame.origin[0] / height,
            0.5 - geometry.labelFrame.origin[1] / height,
          ],
      right: usesLocalFrame
        ? [1 / height, 0]
        : [
            geometry.labelFrame.right[0] / height,
            -geometry.labelFrame.right[1] / height,
          ],
      up: usesLocalFrame
        ? [0, -1 / height]
        : [
            geometry.labelFrame.up[0] / height,
            -geometry.labelFrame.up[1] / height,
          ],
      maxWidth: geometry.labelFrame.maxWidth,
      maxHeight: geometry.labelFrame.maxHeight,
      opticalInset: geometry.labelFrame.opticalInset,
    },
    "other",
    size,
    font,
    engraving,
    null,
    null,
    engravingFontScale,
  );
  if (labelBounds === null) {
    throw new Error("CanvasKit V4 sphere label is empty");
  }
  labelSurface.flush();
  const labelImage = scope.own(
    labelSurface.makeImageSnapshot(),
    "sphere label image",
  );
  const labelTexture = scope.own(
    labelImage.makeShaderOptions(
      canvasKit.TileMode.Decal,
      canvasKit.TileMode.Decal,
      canvasKit.FilterMode.Linear,
      canvasKit.MipmapMode.None,
    ),
    "sphere label texture",
  );
  const labelShader = scope.own(
    labelEffect.makeShaderWithChildren(
      usesLocalFrame
        ? [
            center,
            center,
            radius,
            ...geometry.labelFrame.origin,
            ...geometry.labelFrame.right,
            ...geometry.labelFrame.up,
          ]
        : [center, center, radius],
      [labelTexture],
    ),
    "sphere label shader",
  );
  const labelPaint = createPaint(canvasKit, scope);
  labelPaint.setShader(labelShader);
  if (usesLocalFrame) {
    canvas.drawPath(path, labelPaint);
  } else {
    const labelDrawBounds = sphereLabelDrawBounds(labelBounds, center, radius);
    canvas.drawRect(
      canvasKit.LTRBRect(
        labelDrawBounds.left,
        labelDrawBounds.top,
        labelDrawBounds.right,
        labelDrawBounds.bottom,
      ),
      labelPaint,
    );
  }
}

function sphericalGeometryMetrics({
  geometry,
  sides,
  result,
  size = 600,
}: RenderCanonicalSphereV4Options): {
  size: number;
  center: number;
  radius: number;
} {
  requireRenderSize(size);
  requireSphereResult(sides, result);
  if (
    !Number.isFinite(geometry.camera.orthographicHeight) ||
    geometry.camera.orthographicHeight <= 0 ||
    !Number.isFinite(geometry.radius) ||
    geometry.radius <= 0
  ) {
    throw new Error("CanvasKit V4 sphere geometry dimensions must be positive");
  }
  return {
    size,
    center: size / 2,
    radius: (geometry.radius / geometry.camera.orthographicHeight) * size,
  };
}

function drawSphericalGeometry(
  canvasKit: CanvasKitRuntimeV4,
  font: Font,
  labelEffect: RuntimeEffect,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  options: RenderCanonicalSphereV4Options,
  createShader: SphereShaderFactoryV4,
): number {
  const {
    geometry,
    result,
    engravingColor,
    engravingFinish,
    engravingContrastEdge,
    engravingFontScale = 1,
    renderPolicy = "legacy",
    blankFaces = false,
  } = options;
  assertPolyhedralRenderPolicyV4(renderPolicy);
  if (renderPolicy === "d20-r3") {
    throw new Error("CanvasKit V4 d20 r3 render policy is invalid for spheres");
  }
  const { size, center, radius } = sphericalGeometryMetrics(options);
  const separationPaint = physicalSeparationPaintForSphere(
    canvasKit,
    scope,
    options,
  );
  const path = drawSphericalBackground(
    canvasKit,
    canvas,
    scope,
    center,
    radius,
    createShader,
    separationPaint,
    renderPolicy,
  );
  if (!blankFaces) {
    drawSphericalLabel(
      canvasKit,
      font,
      labelEffect,
      canvas,
      scope,
      path,
      geometry,
      result,
      size,
      center,
      radius,
      engravingColor,
      engravingFinish,
      engravingContrastEdge,
      engravingFontScale,
    );
  }
  if (options.criticalEffect !== null && options.criticalEffect !== undefined) {
    drawSphericalCriticalEffectV4(
      canvasKit,
      canvas,
      scope,
      path,
      center,
      radius,
      size,
      options.criticalEffect,
    );
  }
  return 1;
}

async function renderSphericalGeometry(
  canvasKit: CanvasKitRuntimeV4,
  font: Font,
  labelEffect: RuntimeEffect,
  options: RenderCanonicalSphereV4Options,
  createShader: SphereShaderFactoryV4,
): Promise<RenderedGeometryV4> {
  const size = options.size ?? 600;
  requireRenderSize(size);
  const rendered = withCanvasKitResourcesSyncV4((scope) => {
    const surface = scope.own(
      canvasKit.MakeSurface(size, size),
      "sphere surface",
      (owned) => {
        owned.dispose();
      },
    );
    const canvas = surface.getCanvas();
    canvas.clear(canvasKit.TRANSPARENT);
    const visibleFaceCount = drawSphericalGeometry(
      canvasKit,
      font,
      labelEffect,
      canvas,
      scope,
      options,
      createShader,
    );
    return {
      png: encodeSurface(canvasKit, scope, surface),
      width: size,
      height: size,
      visibleFaceCount,
    };
  });
  await Promise.resolve();
  return rendered;
}

function renderSphereWithGeometryRenderer(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  options: RenderCanonicalSphereV4Options,
): Promise<RenderedGeometryV4> {
  const usesClassicBaseline = usesClassicBaselineSphereShaderV4(
    options.lighting,
    options.materialFamily,
  );
  const parameters = resolveSphereLightingParametersV4(
    options.lighting,
    options.materialFamily,
  );
  return renderSphericalGeometry(
    canvasKit,
    resources.defaultFont,
    sphereLabelEffect(resources, options.geometry),
    options,
    (scope, center, radius) =>
      scope.own(
        usesClassicBaseline
          ? resources.sphereEffect.makeShader([center, center, radius])
          : resources.sphereLitEffect.makeShader(
              sphereLightingUniforms(center, radius, parameters),
            ),
        "sphere material shader",
      ),
  );
}

function renderTexturedSphereWithGeometryRenderer(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  {
    texture,
    texturePlacement = IDENTITY_TEXTURE_PLACEMENT_V4,
    ...options
  }: RenderTexturedSphereV4Options,
): Promise<RenderedGeometryV4> {
  const usesClassicBaseline = usesClassicBaselineSphereShaderV4(
    options.lighting,
    options.materialFamily,
  );
  const parameters = resolveSphereLightingParametersV4(
    options.lighting,
    options.materialFamily,
  );
  return renderSphericalGeometry(
    canvasKit,
    resources.defaultFont,
    sphereLabelEffect(resources, options.geometry),
    options,
    (scope, center, radius) => {
      const textureShader = createPlacedTextureShader(
        canvasKit,
        resources,
        scope,
        texture,
        texturePlacement,
      );
      return scope.own(
        usesClassicBaseline
          ? resources.sphereTextureEffect.makeShaderWithChildren(
              [center, center, radius, texture.width],
              [textureShader],
            )
          : resources.sphereLitTextureEffect.makeShaderWithChildren(
              sphereTextureLightingUniforms(
                center,
                radius,
                texture.width,
                parameters,
              ),
              [textureShader],
            ),
        "sphere textured material shader",
      );
    },
  );
}

type GeometryRendererResourcesV4 = {
  scope: CanvasKitResourceScopeV4;
  defaultFont: Font;
  fonts: ReadonlyMap<FontIdV4, Font>;
  texturePlacementEffect?: RuntimeEffect;
  polyhedralEffect: RuntimeEffect;
  octahedralEffect: RuntimeEffect;
  octahedralTextureEffect: RuntimeEffect;
  sphereEffect: RuntimeEffect;
  sphereTextureEffect: RuntimeEffect;
  sphereLitEffect: RuntimeEffect;
  sphereLitTextureEffect: RuntimeEffect;
  sphereLabelEffect: RuntimeEffect;
  sphereLocalFrameLabelEffect: RuntimeEffect;
};

function sphereLabelEffect(
  resources: GeometryRendererResourcesV4,
  geometry: SphericalGeometryDescriptorV4,
): RuntimeEffect {
  return geometry.labelMapping === "local-frame-r19"
    ? resources.sphereLocalFrameLabelEffect
    : resources.sphereLabelEffect;
}

function getTexturePlacementEffect(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
): RuntimeEffect {
  if (resources.texturePlacementEffect !== undefined) {
    return resources.texturePlacementEffect;
  }
  let shaderError = "";
  const effect = resources.scope.own(
    canvasKit.RuntimeEffect.Make(TEXTURE_PLACEMENT_SHADER_V4, (error) => {
      shaderError = error;
    }),
    `texture placement shader (${shaderError})`,
  );
  resources.texturePlacementEffect = effect;
  return effect;
}

function geometryFont(
  resources: GeometryRendererResourcesV4,
  fontId: FontIdV4,
): Font {
  const font = resources.fonts.get(fontId);
  if (font === undefined) {
    throw new Error(`CanvasKit V4 font is not initialized: ${fontId}`);
  }
  return font;
}

type PlacedTextureCacheV4<Value> = Map<
  TextureRasterV4,
  Map<string, Value>
>;

type GeometryGridShaderCacheV4 = {
  atlasedOctahedralTextures: Map<TextureRasterV4, ReadonlySet<string>>;
  materialTextures: PlacedTextureCacheV4<Shader>;
  octahedralTextures: PlacedTextureCacheV4<Shader>;
  sphereMaterialImages: Map<SphericalMaterialRasterV4, Image>;
  sphereBackgrounds: PlacedTextureCacheV4<
    Map<SphericalGeometryDescriptorV4, Image>
  >;
  sphereBackgroundUses: PlacedTextureCacheV4<
    Map<SphericalGeometryDescriptorV4, number>
  >;
  sphereTextures: PlacedTextureCacheV4<Map<number, Shader>>;
};

function valuesByTexturePlacement<Value>(
  cache: PlacedTextureCacheV4<Value>,
  texture: TextureRasterV4,
): Map<string, Value> {
  let values = cache.get(texture);
  if (values === undefined) {
    values = new Map<string, Value>();
    cache.set(texture, values);
  }
  return values;
}

function sharedMaterialTextureShader(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  scope: CanvasKitResourceScopeV4,
  cache: GeometryGridShaderCacheV4,
  texture: TextureRasterV4,
  placement: TexturePlacementV4 = IDENTITY_TEXTURE_PLACEMENT_V4,
): Shader {
  const shaders = valuesByTexturePlacement(cache.materialTextures, texture);
  const placementKey = texturePlacementKeyV4(placement);
  let shader = shaders.get(placementKey);
  if (shader === undefined) {
    shader = createPlacedTextureShader(
      canvasKit,
      resources,
      scope,
      texture,
      placement,
    );
    shaders.set(placementKey, shader);
  }
  return shader;
}

function sharedSphereTextureShader(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  scope: CanvasKitResourceScopeV4,
  cache: GeometryGridShaderCacheV4,
  texture: TextureRasterV4,
  placement: TexturePlacementV4,
  center: number,
  radius: number,
): Shader {
  const shadersByPlacement = valuesByTexturePlacement(
    cache.sphereTextures,
    texture,
  );
  const placementKey = texturePlacementKeyV4(placement);
  let shadersByRadius = shadersByPlacement.get(placementKey);
  if (shadersByRadius === undefined) {
    shadersByRadius = new Map<number, Shader>();
    shadersByPlacement.set(placementKey, shadersByRadius);
  }
  let shader = shadersByRadius.get(radius);
  if (shader === undefined) {
    const textureShader = sharedMaterialTextureShader(
      canvasKit,
      resources,
      scope,
      cache,
      texture,
      placement,
    );
    shader = scope.own(
      resources.sphereTextureEffect.makeShaderWithChildren(
        [center, center, radius, texture.width],
        [textureShader],
      ),
      "sphere textured grid material shader",
    );
    shadersByRadius.set(radius, shader);
  }
  return shader;
}

function createSphericalBackgroundImage(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  shader: Shader,
  center: number,
  radius: number,
  renderPolicy: PolyhedralRenderPolicyV4,
): Image {
  const surface = scope.own(
    canvasKit.MakeSurface(GRID_DIE_SIZE_V4, GRID_DIE_SIZE_V4),
    "sphere grid background surface",
    (owned) => {
      owned.dispose();
    },
  );
  const canvas = surface.getCanvas();
  canvas.clear(canvasKit.TRANSPARENT);
  drawSphericalBackground(
    canvasKit,
    canvas,
    scope,
    center,
    radius,
    () => shader,
    undefined,
    renderPolicy,
  );
  surface.flush();
  return scope.own(
    surface.makeImageSnapshot(),
    "sphere grid background image",
  );
}

function sharedSphericalMaterialImage(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  cache: GeometryGridShaderCacheV4,
  raster: SphericalMaterialRasterV4,
): Image {
  const width: number = raster.width;
  const height: number = raster.height;
  if (
    width !== GRID_DIE_SIZE_V4 ||
    height !== GRID_DIE_SIZE_V4 ||
    raster.pixels.length !== width * height * 4
  ) {
    throw new Error("CanvasKit V4 spherical material raster is invalid");
  }
  let image = cache.sphereMaterialImages.get(raster);
  if (image === undefined) {
    image = scope.own(
      canvasKit.MakeImage(
        {
          width: raster.width,
          height: raster.height,
          colorType: canvasKit.ColorType.RGBA_8888,
          alphaType: canvasKit.AlphaType.Unpremul,
          colorSpace: canvasKit.ColorSpace.SRGB,
        },
        raster.pixels,
        raster.width * 4,
      ),
      "sphere material raster image",
    );
    cache.sphereMaterialImages.set(raster, image);
  }
  return image;
}

function drawSphericalMaterialImage(
  canvasKit: CanvasKitRuntimeV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  image: Image,
  center: number,
  radius: number,
  separationPaint: Paint | undefined,
  renderPolicy: PolyhedralRenderPolicyV4,
): Path {
  const path = createSpherePath(canvasKit, scope, center, radius);
  canvas.save();
  try {
    canvas.clipPath(path, canvasKit.ClipOp.Intersect, true);
    canvas.drawImage(image, 0, 0);
  } finally {
    canvas.restore();
  }
  if (separationPaint !== undefined) {
    canvas.drawPath(path, separationPaint);
  }
  const borderPaint = createSphereBorderPaint(
    canvasKit,
    scope,
    renderPolicy,
  );
  canvas.drawPath(path, borderPaint);
  return path;
}

function createOctahedralTextureAtlasShader(
  canvasKit: CanvasKitRuntimeV4,
  scope: CanvasKitResourceScopeV4,
  effect: RuntimeEffect,
  texture: TextureRasterV4,
  textureShader: Shader,
): Shader {
  const atlasShader = scope.own(
    effect.makeShaderWithChildren(
      [OCTAHEDRAL_ATLAS_SIZE_V4, texture.width],
      [textureShader],
    ),
    "octahedral texture atlas effect shader",
  );
  const surface = scope.own(
    canvasKit.MakeSurface(
      OCTAHEDRAL_ATLAS_SIZE_V4,
      OCTAHEDRAL_ATLAS_SIZE_V4,
    ),
    "octahedral texture atlas surface",
    (owned) => {
      owned.dispose();
    },
  );
  const paint = createPaint(canvasKit, scope);
  paint.setShader(atlasShader);
  const canvas = surface.getCanvas();
  canvas.clear(canvasKit.TRANSPARENT);
  canvas.drawRect(
    canvasKit.LTRBRect(
      0,
      0,
      OCTAHEDRAL_ATLAS_SIZE_V4,
      OCTAHEDRAL_ATLAS_SIZE_V4,
    ),
    paint,
  );
  surface.flush();
  const image = scope.own(
    surface.makeImageSnapshot(),
    "octahedral texture atlas image",
  );
  return scope.own(
    image.makeShaderOptions(
      canvasKit.TileMode.Repeat,
      canvasKit.TileMode.Repeat,
      canvasKit.FilterMode.Linear,
      canvasKit.MipmapMode.None,
    ),
    "octahedral texture atlas shader",
  );
}

type RenderPolyhedralGeometryGridDieV4 = Extract<
  RenderGeometryGridDieV4,
  { kind: "polyhedral" }
>;
type RenderSphereGeometryGridDieV4 = Extract<
  RenderGeometryGridDieV4,
  { kind: "sphere" }
>;
type RenderGridAppearanceOptionsV4 = Pick<
  RenderCanonicalGeometryV4Options,
  | "blankFaces"
  | "criticalEffect"
  | "criticalOuterGlow"
  | "engravingColor"
  | "engravingFinish"
  | "engravingContrastEdge"
  | "engravingFontScale"
  | "d6FiveOpticalOffsetX"
  | "faceLabelSet"
  | "lighting"
  | "materialFamily"
  | "renderPolicy"
  | "requiresLocalSeparation"
>;

function gridAppearanceOptions(
  die: RenderGeometryGridDieV4,
): RenderGridAppearanceOptionsV4 {
  const options: RenderGridAppearanceOptionsV4 = {};
  if (die.blankFaces !== undefined) options.blankFaces = die.blankFaces;
  if (die.criticalEffect !== null && die.criticalEffect !== undefined) {
    options.criticalEffect = die.criticalEffect;
  }
  if (die.kind === "polyhedral" && die.criticalOuterGlow !== undefined) {
    options.criticalOuterGlow = die.criticalOuterGlow;
  }
  if (die.engravingColor !== undefined) {
    options.engravingColor = die.engravingColor;
  }
  if (die.engravingFinish !== undefined) {
    options.engravingFinish = die.engravingFinish;
  }
  if (die.engravingContrastEdge !== undefined) {
    options.engravingContrastEdge = die.engravingContrastEdge;
  }
  if (die.engravingFontScale !== undefined) {
    options.engravingFontScale = die.engravingFontScale;
  }
  if (die.kind === "polyhedral" && die.d6FiveOpticalOffsetX !== undefined) {
    options.d6FiveOpticalOffsetX = die.d6FiveOpticalOffsetX;
  }
  if (die.kind === "polyhedral" && die.faceLabelSet !== undefined) {
    options.faceLabelSet = die.faceLabelSet;
  }
  if (die.lighting !== undefined) options.lighting = die.lighting;
  if (die.materialFamily !== undefined) {
    options.materialFamily = die.materialFamily;
  }
  if (die.renderPolicy !== undefined) {
    options.renderPolicy = die.renderPolicy;
  }
  if (die.requiresLocalSeparation !== undefined) {
    options.requiresLocalSeparation = die.requiresLocalSeparation;
  }
  return options;
}

function drawSphereGridLabel(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  die: RenderSphereGeometryGridDieV4,
  path: Path,
  size: number,
  center: number,
  radius: number,
): number {
  if (!die.blankFaces) drawSphericalLabel(
    canvasKit,
    geometryFont(resources, die.fontId),
    sphereLabelEffect(resources, die.geometry),
    canvas,
    scope,
    path,
    die.geometry,
    die.result,
    size,
    center,
    radius,
    die.engravingColor,
    die.engravingFinish,
    die.engravingContrastEdge,
    die.engravingFontScale,
  );
  if (die.criticalEffect !== null && die.criticalEffect !== undefined) {
    drawSphericalCriticalEffectV4(
      canvasKit,
      canvas,
      scope,
      path,
      center,
      radius,
      size,
      die.criticalEffect,
    );
  }
  return 1;
}

function drawSphereGeometryGridDie(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  sharedScope: CanvasKitResourceScopeV4,
  shaderCache: GeometryGridShaderCacheV4,
  die: RenderSphereGeometryGridDieV4,
): number {
  const options: RenderCanonicalSphereV4Options = {
    geometry: die.geometry,
    sides: die.sides,
    result: die.result,
    size: GRID_DIE_SIZE_V4,
    ...gridAppearanceOptions(die),
  };
  const texture = die.texture;
  const placement =
    die.texturePlacement ?? IDENTITY_TEXTURE_PLACEMENT_V4;
  const placementKey = texturePlacementKeyV4(placement);
  const materialRaster = die.materialRaster;
  if (texture !== undefined && materialRaster !== undefined) {
    throw new Error(
      "CanvasKit V4 sphere grid die cannot use texture and material raster together",
    );
  }
  if (materialRaster !== undefined) {
    const { size, center, radius } = sphericalGeometryMetrics(options);
    const image = sharedSphericalMaterialImage(
      canvasKit,
      sharedScope,
      shaderCache,
      materialRaster,
    );
    const separationPaint = physicalSeparationPaintForSphere(
      canvasKit,
      scope,
      options,
    );
    const path = drawSphericalMaterialImage(
      canvasKit,
      canvas,
      scope,
      image,
      center,
      radius,
      separationPaint,
      options.renderPolicy ?? "legacy",
    );
    return drawSphereGridLabel(
      canvasKit,
      resources,
      canvas,
      scope,
      die,
      path,
      size,
      center,
      radius,
    );
  }
  const usesClassicBaseline = usesClassicBaselineSphereShaderV4(
    options.lighting,
    options.materialFamily,
  );
  const lightingParameters = resolveSphereLightingParametersV4(
    options.lighting,
    options.materialFamily,
  );
  if (texture === undefined) {
    return drawSphericalGeometry(
      canvasKit,
      geometryFont(resources, die.fontId),
      sphereLabelEffect(resources, options.geometry),
      canvas,
      scope,
      options,
      (shaderScope, center, radius) =>
        shaderScope.own(
          usesClassicBaseline
            ? resources.sphereEffect.makeShader([center, center, radius])
            : resources.sphereLitEffect.makeShader(
                sphereLightingUniforms(center, radius, lightingParameters),
              ),
          "sphere grid material shader",
        ),
    );
  }
  const { size, center, radius } = sphericalGeometryMetrics(options);
  if (!usesClassicBaseline) {
    const textureShader = sharedMaterialTextureShader(
      canvasKit,
      resources,
      sharedScope,
      shaderCache,
      texture,
      placement,
    );
    const sphereShader = scope.own(
      resources.sphereLitTextureEffect.makeShaderWithChildren(
        sphereTextureLightingUniforms(
          center,
          radius,
          texture.width,
          lightingParameters,
        ),
        [textureShader],
      ),
      "lit sphere textured grid material shader",
    );
    return drawSphericalGeometry(
      canvasKit,
      geometryFont(resources, die.fontId),
      sphereLabelEffect(resources, options.geometry),
      canvas,
      scope,
      options,
      () => sphereShader,
    );
  }
  const sphereShader = sharedSphereTextureShader(
    canvasKit,
    resources,
    sharedScope,
    shaderCache,
    texture,
    placement,
    center,
    radius,
  );
  const backgroundUses =
    shaderCache.sphereBackgroundUses
      .get(texture)
      ?.get(placementKey)
      ?.get(die.geometry) ?? 0;
  if (
    options.requiresLocalSeparation ||
    backgroundUses < SPHERE_BACKGROUND_MIN_DICE_V4
  ) {
    return drawSphericalGeometry(
      canvasKit,
      geometryFont(resources, die.fontId),
      sphereLabelEffect(resources, options.geometry),
      canvas,
      scope,
      options,
      () => sphereShader,
    );
  }
  const backgroundsByPlacement = valuesByTexturePlacement(
    shaderCache.sphereBackgrounds,
    texture,
  );
  let backgroundsByGeometry = backgroundsByPlacement.get(placementKey);
  if (backgroundsByGeometry === undefined) {
    backgroundsByGeometry = new Map<SphericalGeometryDescriptorV4, Image>();
    backgroundsByPlacement.set(placementKey, backgroundsByGeometry);
  }
  let background = backgroundsByGeometry.get(die.geometry);
  if (background === undefined) {
    background = createSphericalBackgroundImage(
      canvasKit,
      sharedScope,
      sphereShader,
      center,
      radius,
      options.renderPolicy ?? "legacy",
    );
    backgroundsByGeometry.set(die.geometry, background);
  }
  canvas.drawImage(background, 0, 0);
  const path = createSpherePath(canvasKit, scope, center, radius);
  return drawSphereGridLabel(
    canvasKit,
    resources,
    canvas,
    scope,
    die,
    path,
    size,
    center,
    radius,
  );
}

function drawPolyhedralGeometryGridDie(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  sharedScope: CanvasKitResourceScopeV4,
  shaderCache: GeometryGridShaderCacheV4,
  die: RenderPolyhedralGeometryGridDieV4,
  allowD20LabelClearanceShortfall: boolean,
): number {
  const font = geometryFont(resources, die.fontId);
  const options: RenderCanonicalGeometryV4Options = {
    geometry: die.geometry,
    result: die.result,
    size: GRID_DIE_SIZE_V4,
    ...gridAppearanceOptions(die),
    allowD20LabelClearanceShortfall,
  };
  const usesOctahedralMapping =
    die.geometry.skinMapping.kind === "view-octahedral";
  const usesSuppliedOctahedralAtlas =
    die.textureMapping === "octahedral-atlas";
  const usesProjectedTexture =
    die.textureMapping === "projected-texture" ||
    die.textureMapping === "bounded-projected-texture";
  const texture = die.texture;
  const placement =
    die.texturePlacement ?? IDENTITY_TEXTURE_PLACEMENT_V4;
  const textureScope = die.textureScope ?? "die-wide";
  const placementKey = texturePlacementKeyV4(placement);
  if (usesProjectedTexture && textureScope === "face-local") {
    throw new Error(
      "CanvasKit V4 projected texture requires die-wide scope",
    );
  }
  if (usesSuppliedOctahedralAtlas && !usesOctahedralMapping) {
    throw new Error(
      "CanvasKit V4 octahedral texture atlas requires octahedral geometry",
    );
  }
  if (usesSuppliedOctahedralAtlas && textureScope === "face-local") {
    throw new Error(
      "CanvasKit V4 face-local texture scope requires a source texture",
    );
  }
  if (usesSuppliedOctahedralAtlas && texture === undefined) {
    throw new Error(
      "CanvasKit V4 octahedral texture atlas requires a supplied texture",
    );
  }
  if (
    usesSuppliedOctahedralAtlas &&
    !isIdentityTexturePlacementV4(placement)
  ) {
    throw new Error(
      "CanvasKit V4 supplied octahedral texture atlas is already placed",
    );
  }
  if (texture === undefined) {
    const effect = usesOctahedralMapping
      ? resources.octahedralEffect
      : resources.polyhedralEffect;
    return drawPolyhedralGeometry(
      canvasKit,
      font,
      canvas,
      scope,
      options,
      GRID_DIE_SIZE_V4,
      (shaderScope) =>
        shaderScope.own(
          effect.makeShader(
            usesOctahedralMapping
              ? [GRID_DIE_SIZE_V4]
              : [GRID_DIE_SIZE_V4, GRID_DIE_SIZE_V4],
          ),
          "polyhedral grid material shader",
        ),
    );
  }

  const textureShader = sharedMaterialTextureShader(
    canvasKit,
    resources,
    sharedScope,
    shaderCache,
    texture,
    textureScope === "face-local"
      ? IDENTITY_TEXTURE_PLACEMENT_V4
      : placement,
  );
  if (textureScope === "face-local") {
    return drawPolyhedralGeometry(
      canvasKit,
      font,
      canvas,
      scope,
      options,
      texture.width,
      () => textureShader,
      textureScope,
      placement,
    );
  }
  if (usesProjectedTexture) {
    return drawPolyhedralGeometry(
      canvasKit,
      font,
      canvas,
      scope,
      options,
      texture.width,
      () => textureShader,
      textureScope,
      placement,
      die.textureMapping === "bounded-projected-texture"
        ? "bounded-projected-texture"
        : "projected-texture",
    );
  }
  if (!usesOctahedralMapping || usesSuppliedOctahedralAtlas) {
    return drawPolyhedralGeometry(
      canvasKit,
      font,
      canvas,
      scope,
      options,
      texture.width,
      () => textureShader,
    );
  }
  const usesAtlas =
    shaderCache.atlasedOctahedralTextures
      .get(texture)
      ?.has(placementKey) ?? false;
  const octahedralShaders = valuesByTexturePlacement(
    shaderCache.octahedralTextures,
    texture,
  );
  let octahedralShader = octahedralShaders.get(placementKey);
  if (octahedralShader === undefined) {
    octahedralShader = usesAtlas
      ? createOctahedralTextureAtlasShader(
          canvasKit,
          sharedScope,
          resources.octahedralTextureEffect,
          texture,
          textureShader,
        )
      : sharedScope.own(
          resources.octahedralTextureEffect.makeShaderWithChildren(
            [texture.width, texture.width],
            [textureShader],
          ),
          "polyhedral octahedral texture grid shader",
        );
    octahedralShaders.set(placementKey, octahedralShader);
  }
  return drawPolyhedralGeometry(
    canvasKit,
    font,
    canvas,
    scope,
    options,
    usesAtlas ? OCTAHEDRAL_ATLAS_SIZE_V4 : texture.width,
    () => octahedralShader,
  );
}

function drawGeometryGridDie(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  canvas: Canvas,
  scope: CanvasKitResourceScopeV4,
  sharedScope: CanvasKitResourceScopeV4,
  shaderCache: GeometryGridShaderCacheV4,
  die: RenderGeometryGridDieV4,
  allowD20LabelClearanceShortfall: boolean,
): number {
  if (die.kind === "sphere") {
    return drawSphereGeometryGridDie(
      canvasKit,
      resources,
      canvas,
      scope,
      sharedScope,
      shaderCache,
      die,
    );
  }
  return drawPolyhedralGeometryGridDie(
    canvasKit,
    resources,
    canvas,
    scope,
    sharedScope,
    shaderCache,
    die,
    allowD20LabelClearanceShortfall,
  );
}

function atlasedOctahedralTextures(
  groups: RenderGeometryGridV4Options["groups"],
): Map<TextureRasterV4, ReadonlySet<string>> {
  const counts: PlacedTextureCacheV4<number> = new Map();
  for (const group of groups) {
    for (const die of group) {
      if (
        die.kind === "polyhedral" &&
        die.texture !== undefined &&
        die.textureMapping !== "projected-texture" &&
        die.textureMapping !== "bounded-projected-texture" &&
        die.geometry.skinMapping.kind === "view-octahedral"
      ) {
        const placementKey = texturePlacementKeyV4(
          die.texturePlacement ?? IDENTITY_TEXTURE_PLACEMENT_V4,
        );
        const countsByPlacement = valuesByTexturePlacement(
          counts,
          die.texture,
        );
        countsByPlacement.set(
          placementKey,
          (countsByPlacement.get(placementKey) ?? 0) + 1,
        );
      }
    }
  }
  return new Map(
    [...counts].map(([texture, countsByPlacement]) => [
      texture,
      new Set(
        [...countsByPlacement]
          .filter(([, count]) => count >= OCTAHEDRAL_ATLAS_MIN_DICE_V4)
          .map(([placementKey]) => placementKey),
      ),
    ]),
  );
}

function sphereBackgroundUses(
  groups: RenderGeometryGridV4Options["groups"],
): PlacedTextureCacheV4<Map<SphericalGeometryDescriptorV4, number>> {
  const uses: PlacedTextureCacheV4<
    Map<SphericalGeometryDescriptorV4, number>
  > = new Map();
  for (const group of groups) {
    for (const die of group) {
      if (die.kind !== "sphere" || die.texture === undefined) continue;
      const placementKey = texturePlacementKeyV4(
        die.texturePlacement ?? IDENTITY_TEXTURE_PLACEMENT_V4,
      );
      const usesByPlacement = valuesByTexturePlacement(uses, die.texture);
      let usesByGeometry = usesByPlacement.get(placementKey);
      if (usesByGeometry === undefined) {
        usesByGeometry = new Map<SphericalGeometryDescriptorV4, number>();
        usesByPlacement.set(placementKey, usesByGeometry);
      }
      usesByGeometry.set(
        die.geometry,
        (usesByGeometry.get(die.geometry) ?? 0) + 1,
      );
    }
  }
  return uses;
}

type GeometryGridDieVisualBoundsV4 = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function geometryGridDieVisualBounds(
  die: RenderGeometryGridDieV4,
  rendererRevision: RendererRevisionV4,
): GeometryGridDieVisualBoundsV4 {
  let artworkLeft: number;
  let artworkTop: number;
  let artworkRight: number;
  let artworkBottom: number;
  if (die.kind === "sphere") {
    const { center, radius } = sphericalGeometryMetrics({
      geometry: die.geometry,
      sides: die.sides,
      result: die.result,
      size: GRID_DIE_SIZE_V4,
    });
    artworkLeft = center - radius;
    artworkTop = center - radius;
    artworkRight = center + radius;
    artworkBottom = center + radius;
  } else {
    const projection = projectPolyhedralGeometryV4(die.geometry, die.result);
    const horizontalPositions = projection.vertices.map(
      ({ position }) => position[0] * GRID_DIE_SIZE_V4,
    );
    const verticalPositions = projection.vertices.map(
      ({ position }) => position[1] * GRID_DIE_SIZE_V4,
    );
    artworkLeft = Math.min(...horizontalPositions);
    artworkTop = Math.min(...verticalPositions);
    artworkRight = Math.max(...horizontalPositions);
    artworkBottom = Math.max(...verticalPositions);
  }
  const outlinePadding = 1;
  const effectOutset = criticalEffectOutsetV4(
    GRID_DIE_SIZE_V4,
    die.criticalEffect,
    die.kind === "polyhedral" && die.criticalOuterGlow === true,
  );
  let left = Math.floor(artworkLeft - outlinePadding - effectOutset);
  const top = Math.floor(artworkTop - outlinePadding - effectOutset);
  let right = Math.ceil(artworkRight + outlinePadding + effectOutset);
  const bottom = Math.ceil(artworkBottom + outlinePadding + effectOutset);
  const icons = die.icons ?? [];
  if (icons.length > 3) {
    throw new Error("CanvasKit V4 modifier icon count is invalid");
  }
  const iconCount = icons.length as 0 | 1 | 2 | 3;
  const iconSize = modifierIconSizeV4(rendererRevision);
  icons.forEach((icon, index) => {
    if (icon === "blank") return;
    const iconLeft = modifierIconLeftV4(
      iconCount,
      index,
      rendererRevision,
    );
    left = Math.min(left, iconLeft);
    right = Math.max(right, iconLeft + iconSize);
  });
  return { left, top, right, bottom };
}

function visualCenterOffsetV4(
  { top, bottom }: GeometryGridDieVisualBoundsV4,
): number {
  return (GRID_DIE_SIZE_V4 - top - bottom) / 2;
}

function sharedPercentileIconsV4(
  left: RenderGeometryGridDieV4,
  right: RenderGeometryGridDieV4,
): readonly IconNameV4[] | undefined {
  if (
    left.kind !== "polyhedral" ||
    right.kind !== "polyhedral" ||
    left.geometry.target !== "percentile" ||
    right.geometry.target !== "d10" ||
    right.faceLabelSet !== "percentile-ones"
  ) {
    return undefined;
  }
  const leftIcons = left.icons ?? [];
  const rightIcons = right.icons ?? [];
  return leftIcons.length > 0 &&
    leftIcons.length === rightIcons.length &&
    leftIcons.every((icon, index) => icon === rightIcons[index])
    ? leftIcons
    : undefined;
}

function renderGeometryGridWithGeometryRenderer(
  canvasKit: CanvasKitRuntimeV4,
  resources: GeometryRendererResourcesV4,
  { groups, rendererRevision }: RenderGeometryGridV4Options,
): Promise<RenderedGeometryGridV4> {
  const policy = rendererRevisionPolicyV4(rendererRevision);
  const sharedIconsForPair = policy.sharedPercentileModifierIcons
    ? sharedPercentileIconsV4
    : undefined;
  const shaderCache: GeometryGridShaderCacheV4 = {
    atlasedOctahedralTextures: atlasedOctahedralTextures(groups),
    materialTextures: new Map(),
    octahedralTextures: new Map(),
    sphereMaterialImages: new Map(),
    sphereBackgrounds: new Map(),
    sphereBackgroundUses: sphereBackgroundUses(groups),
    sphereTextures: new Map(),
  };
  return renderGeometryGridSurface(
    canvasKit,
    groups,
    "geometry grid",
    rendererRevision,
    (canvas, scope, sharedScope, die) =>
      drawGeometryGridDie(
        canvasKit,
        resources,
        canvas,
        scope,
        sharedScope,
        shaderCache,
        die,
        policy.allowD20LabelClearanceShortfall,
      ),
    (die) => die.icons ?? [],
    (die) => geometryGridDieVisualBounds(die, rendererRevision),
    policy.gridVerticalAlignment === "visual-center-r24"
      ? (die) =>
          visualCenterOffsetV4(
            geometryGridDieVisualBounds(die, rendererRevision),
          )
      : undefined,
    sharedIconsForPair,
  );
}

function initializeGeometryRendererV4(
  canvasKit: CanvasKitRuntimeV4,
  defaultFontId: FontIdV4,
  fontDataById: CanvasKitFontDataV4,
): GeometryRendererResourcesV4 {
  const scope = new CanvasKitResourceScopeV4();
  try {
    const fonts = new Map<FontIdV4, Font>();
    for (const fontId of FONT_IDS_V4) {
      if (!Object.hasOwn(fontDataById, fontId)) {
        throw new Error(`CanvasKit V4 font data is missing: ${fontId}`);
      }
      const fontData = fontDataById[fontId];
      if (!(fontData instanceof ArrayBuffer) || fontData.byteLength === 0) {
        throw new Error(`CanvasKit V4 font data is invalid: ${fontId}`);
      }
      const typeface = scope.own(
        canvasKit.Typeface.MakeTypefaceFromData(fontData),
        `geometry typeface ${fontId}`,
      );
      const font = scope.own(
        new canvasKit.Font(typeface, 1),
        `geometry font ${fontId}`,
      );
      font.setEdging(canvasKit.FontEdging.AntiAlias);
      font.setHinting(canvasKit.FontHinting.None);
      font.setLinearMetrics(true);
      font.setSubpixel(true);
      if (
        [...font.getGlyphIDs(REQUIRED_FONT_CHARACTERS_V4)].some(
          (glyphId) => glyphId === 0,
        )
      ) {
        throw new Error(`CanvasKit V4 font glyph coverage is invalid: ${fontId}`);
      }
      fonts.set(fontId, font);
    }
    const defaultFont = fonts.get(defaultFontId);
    if (defaultFont === undefined) {
      throw new Error(`CanvasKit V4 default font id is invalid: ${defaultFontId}`);
    }
    let shaderError = "";
    const polyhedralEffect = scope.own(
      canvasKit.RuntimeEffect.Make(CHECKER_SHADER_V4, (error) => {
        shaderError = error;
      }),
      `geometry shader (${shaderError})`,
    );
    let octahedralShaderError = "";
    const octahedralEffect = scope.own(
      canvasKit.RuntimeEffect.Make(OCTAHEDRAL_CHECKER_SHADER_V4, (error) => {
        octahedralShaderError = error;
      }),
      `octahedral geometry shader (${octahedralShaderError})`,
    );
    let octahedralTextureShaderError = "";
    const octahedralTextureEffect = scope.own(
      canvasKit.RuntimeEffect.Make(OCTAHEDRAL_TEXTURE_SHADER_V4, (error) => {
        octahedralTextureShaderError = error;
      }),
      `octahedral texture shader (${octahedralTextureShaderError})`,
    );
    let sphereShaderError = "";
    const sphereEffect = scope.own(
      canvasKit.RuntimeEffect.Make(SPHERE_CHECKER_SHADER_V4, (error) => {
        sphereShaderError = error;
      }),
      `sphere geometry shader (${sphereShaderError})`,
    );
    let sphereTextureShaderError = "";
    const sphereTextureEffect = scope.own(
      canvasKit.RuntimeEffect.Make(SPHERE_TEXTURE_SHADER_V4, (error) => {
        sphereTextureShaderError = error;
      }),
      `sphere texture shader (${sphereTextureShaderError})`,
    );
    let sphereLitShaderError = "";
    const sphereLitEffect = scope.own(
      canvasKit.RuntimeEffect.Make(SPHERE_LIT_CHECKER_SHADER_V4, (error) => {
        sphereLitShaderError = error;
      }),
      `lit sphere geometry shader (${sphereLitShaderError})`,
    );
    let sphereLitTextureShaderError = "";
    const sphereLitTextureEffect = scope.own(
      canvasKit.RuntimeEffect.Make(SPHERE_LIT_TEXTURE_SHADER_V4, (error) => {
        sphereLitTextureShaderError = error;
      }),
      `lit sphere texture shader (${sphereLitTextureShaderError})`,
    );
    let sphereLabelShaderError = "";
    const sphereLabelEffect = scope.own(
      canvasKit.RuntimeEffect.Make(SPHERE_LABEL_SHADER_V4, (error) => {
        sphereLabelShaderError = error;
      }),
      `sphere label shader (${sphereLabelShaderError})`,
    );
    let sphereLocalFrameLabelShaderError = "";
    const sphereLocalFrameLabelEffect = scope.own(
      canvasKit.RuntimeEffect.Make(
        SPHERE_LOCAL_FRAME_LABEL_SHADER_V4,
        (error) => {
          sphereLocalFrameLabelShaderError = error;
        },
      ),
      `sphere local-frame label shader (${sphereLocalFrameLabelShaderError})`,
    );
    return {
      scope,
      defaultFont,
      fonts,
      polyhedralEffect,
      octahedralEffect,
      octahedralTextureEffect,
      sphereEffect,
      sphereTextureEffect,
      sphereLitEffect,
      sphereLitTextureEffect,
      sphereLabelEffect,
      sphereLocalFrameLabelEffect,
    };
  } catch (initializationError) {
    try {
      scope.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [initializationError, cleanupError],
        "CanvasKit V4 geometry initialization and cleanup failed",
        { cause: cleanupError },
      );
    }
    throw initializationError;
  }
}

export class CanvasKitGeometryRendererV4 {
  readonly #canvasKit: CanvasKitRuntimeV4;
  readonly #resources: GeometryRendererResourcesV4;
  #disposed = false;

  constructor({
    canvasKit,
    defaultFontId,
    fontDataById,
  }: CanvasKitGeometryRendererOptionsV4) {
    this.#canvasKit = canvasKit;
    this.#resources = initializeGeometryRendererV4(
      canvasKit,
      defaultFontId,
      fontDataById,
    );
  }

  render(
    options: RenderCanonicalGeometryV4Options,
  ): Promise<RenderedGeometryV4> {
    if (this.#disposed) {
      throw new Error("CanvasKit V4 geometry renderer is disposed");
    }
    return renderWithGeometryRenderer(
      this.#canvasKit,
      this.#resources.defaultFont,
      this.#resources.polyhedralEffect,
      this.#resources.octahedralEffect,
      options,
    );
  }

  renderGeometryGrid(
    options: RenderGeometryGridV4Options,
  ): Promise<RenderedGeometryGridV4> {
    if (this.#disposed) {
      throw new Error("CanvasKit V4 geometry renderer is disposed");
    }
    return renderGeometryGridWithGeometryRenderer(
      this.#canvasKit,
      this.#resources,
      options,
    );
  }

  renderPolyhedralGrid(
    options: RenderPolyhedralGridV4Options,
  ): Promise<RenderedPolyhedralGridV4> {
    if (this.#disposed) {
      throw new Error("CanvasKit V4 geometry renderer is disposed");
    }
    return renderPolyhedralGridWithGeometryRenderer(
      this.#canvasKit,
      this.#resources.defaultFont,
      this.#resources.polyhedralEffect,
      this.#resources.octahedralEffect,
      options,
    );
  }

  renderTextured(
    options: RenderTexturedGeometryV4Options,
  ): Promise<RenderedGeometryV4> {
    if (this.#disposed) {
      throw new Error("CanvasKit V4 geometry renderer is disposed");
    }
    return renderTexturedWithGeometryRenderer(
      this.#canvasKit,
      this.#resources,
      options,
    );
  }

  renderSphere(
    options: RenderCanonicalSphereV4Options,
  ): Promise<RenderedGeometryV4> {
    if (this.#disposed) {
      throw new Error("CanvasKit V4 geometry renderer is disposed");
    }
    return renderSphereWithGeometryRenderer(
      this.#canvasKit,
      this.#resources,
      options,
    );
  }

  renderTexturedSphere(
    options: RenderTexturedSphereV4Options,
  ): Promise<RenderedGeometryV4> {
    if (this.#disposed) {
      throw new Error("CanvasKit V4 geometry renderer is disposed");
    }
    return renderTexturedSphereWithGeometryRenderer(
      this.#canvasKit,
      this.#resources,
      options,
    );
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#resources.scope.dispose();
  }
}
