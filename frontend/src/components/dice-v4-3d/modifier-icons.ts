import {
  ICON_NAMES_V4,
  LEGACY_MODIFIER_ICON_SIZE_V4,
  MODIFIER_ICON_VIEWBOX_SIZE_V4,
  SIGNAL_DISK_MODIFIER_ICONS_V4,
  modifierIconDesignV4,
  modifierIconLeftV4,
  modifierIconSizeV4,
  type IconNameV4,
  type ModifierIconCommandV4,
  type RenderDieV4,
  type RendererRevisionV4,
} from "@dice-witch/dice-v4-model";
import {
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  SRGBColorSpace,
  Uint16BufferAttribute,
} from "three";
import type { ThreeDiceGridLayoutV4 } from "./grid-layout";

export const THREE_MODIFIER_ICON_SIZE_V4 = LEGACY_MODIFIER_ICON_SIZE_V4;
const ICON_ATLAS_SCALE_R8_V4 = 2;
const DRAWABLE_ICON_NAMES_V4 = ICON_NAMES_V4.filter(
  (icon): icon is Exclude<IconNameV4, "blank"> => icon !== "blank",
);

type PointV4 = readonly [x: number, y: number];

export type ThreeModifierIconPlacementV4 = {
  icon: Exclude<IconNameV4, "blank">;
  groupIndex: number;
  groupDieIndex: number;
  slotIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ThreeModifierIconResourcesV4 = {
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  camera: OrthographicCamera;
  geometry: BufferGeometry;
  material: MeshBasicMaterial;
  texture: CanvasTexture;
  iconCount: number;
  atlasWidth: number;
  atlasHeight: number;
  geometryBytes: number;
  textureBytes: number;
  disposed: boolean;
};

function requireCanvasContextV4(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Three.js V4 modifier-icon canvas is unavailable");
  }
  return context;
}

function polygonV4(
  context: CanvasRenderingContext2D,
  points: readonly PointV4[],
  color: string,
): void {
  const first = points[0];
  if (first === undefined) return;
  context.beginPath();
  context.moveTo(first[0], first[1]);
  points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

function lineV4(
  context: CanvasRenderingContext2D,
  color: string,
  width: number,
  from: PointV4,
  to: PointV4,
): void {
  context.beginPath();
  context.moveTo(from[0], from[1]);
  context.lineTo(to[0], to[1]);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = width;
  context.strokeStyle = color;
  context.stroke();
}

function circleV4(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function drawVectorCommandV4(
  context: CanvasRenderingContext2D,
  command: ModifierIconCommandV4,
): void {
  context.beginPath();
  if (command.kind === "circle") {
    context.arc(command.x, command.y, command.radius, 0, Math.PI * 2);
    context.fillStyle = command.fill;
    context.fill();
    return;
  }
  if (command.kind === "ellipse") {
    context.ellipse(
      command.x,
      command.y,
      command.radiusX,
      command.radiusY,
      0,
      0,
      Math.PI * 2,
    );
    context.lineWidth = command.strokeWidth;
    context.strokeStyle = command.stroke;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
    return;
  }
  for (const segment of command.segments) {
    switch (segment[0]) {
      case "M":
        context.moveTo(segment[1], segment[2]);
        break;
      case "L":
        context.lineTo(segment[1], segment[2]);
        break;
      case "C":
        context.bezierCurveTo(
          segment[1],
          segment[2],
          segment[3],
          segment[4],
          segment[5],
          segment[6],
        );
        break;
      case "Z":
        context.closePath();
        break;
    }
  }
  if (command.fill !== undefined) {
    context.fillStyle = command.fill;
    context.fill();
  }
  if (command.stroke !== undefined && command.strokeWidth !== undefined) {
    context.lineWidth = command.strokeWidth;
    context.strokeStyle = command.stroke;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }
}

function drawSignalDiskV4(
  context: CanvasRenderingContext2D,
  icon: Exclude<IconNameV4, "blank">,
): void {
  for (const command of SIGNAL_DISK_MODIFIER_ICONS_V4[icon]) {
    drawVectorCommandV4(context, command);
  }
}

function starV4(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
  color: string,
): void {
  polygonV4(
    context,
    Array.from({ length: points * 2 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / points;
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      return [
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
      ] as const;
    }),
    color,
  );
}

function badgeV4(context: CanvasRenderingContext2D, color: string): void {
  circleV4(context, 32, 32, 30.5, "#24152d");
  circleV4(context, 32, 32, 28.5, color);
}

function drawTrashcanV4(context: CanvasRenderingContext2D): void {
  badgeV4(context, "#ce2029");
  context.fillStyle = "#ffffff";
  context.fillRect(21, 24, 22, 25);
  context.fillRect(18, 18, 28, 6);
  context.fillRect(26, 13, 12, 5);
  [27, 32, 37].forEach((x) => {
    lineV4(context, "#ce2029", 2.2, [x, 29], [x, 44]);
  });
}

function drawExplosionV4(context: CanvasRenderingContext2D): void {
  starV4(context, 32, 32, 31, 20, 12, "#24152d");
  starV4(context, 32, 32, 28, 17, 12, "#f4511e");
  starV4(context, 32, 32, 18, 11, 10, "#ffca28");
  circleV4(context, 32, 32, 6, "#ffffff");
}

function drawRecycleV4(context: CanvasRenderingContext2D): void {
  badgeV4(context, "#159447");
  const segments: readonly [PointV4, PointV4, readonly PointV4[]][] = [
    [[25, 19], [43, 26], [[43, 20], [51, 28], [41, 31]]],
    [[45, 35], [34, 48], [[41, 49], [29, 52], [33, 41]]],
    [[23, 46], [17, 29], [[12, 34], [16, 21], [25, 28]]],
  ];
  segments.forEach(([from, to, arrow]) => {
    lineV4(context, "#ffffff", 5, from, to);
    polygonV4(context, arrow, "#ffffff");
  });
}

function drawChevronV4(
  context: CanvasRenderingContext2D,
  direction: "up" | "down",
): void {
  badgeV4(context, direction === "up" ? "#52a447" : "#ce2029");
  const points =
    direction === "up"
      ? ([[18, 38], [32, 24], [46, 38]] as const)
      : ([[18, 26], [32, 40], [46, 26]] as const);
  lineV4(context, "#ffffff", 7, points[0], points[1]);
  lineV4(context, "#ffffff", 7, points[1], points[2]);
}

function drawTargetV4(context: CanvasRenderingContext2D): void {
  badgeV4(context, "#87ceeb");
  circleV4(context, 29, 35, 18, "#ce2029");
  circleV4(context, 29, 35, 12, "#ffffff");
  circleV4(context, 29, 35, 6, "#ce2029");
  lineV4(context, "#ffffff", 4, [29, 35], [49, 15]);
  polygonV4(context, [[49, 15], [45, 16], [48, 20], [57, 8]], "#ffffff");
}

function drawCriticalSuccessV4(context: CanvasRenderingContext2D): void {
  starV4(context, 32, 32, 31, 21, 12, "#24152d");
  starV4(context, 32, 32, 28, 19, 12, "#fcc24c");
  circleV4(context, 32, 32, 13, "#e12579");
  lineV4(context, "#ffffff", 5, [32, 21], [32, 35]);
  circleV4(context, 32, 43, 2.8, "#ffffff");
}

function drawCriticalFailureV4(context: CanvasRenderingContext2D): void {
  badgeV4(context, "#ce2029");
  lineV4(context, "#ffffff", 4.5, [18, 20], [28, 30]);
  lineV4(context, "#ffffff", 4.5, [28, 20], [18, 30]);
  lineV4(context, "#ffffff", 4.5, [36, 20], [46, 30]);
  lineV4(context, "#ffffff", 4.5, [46, 20], [36, 30]);
  lineV4(context, "#ffffff", 4.5, [21, 45], [32, 37]);
  lineV4(context, "#ffffff", 4.5, [32, 37], [43, 45]);
}

function drawPenetrateV4(context: CanvasRenderingContext2D): void {
  badgeV4(context, "#33435c");
  context.beginPath();
  context.ellipse(27, 32, 10, 19, 0, 0, Math.PI * 2);
  context.lineWidth = 5;
  context.strokeStyle = "#56aaff";
  context.stroke();
  lineV4(context, "#ffffff", 5, [10, 32], [49, 32]);
  polygonV4(context, [[46, 22], [58, 32], [46, 42]], "#ffffff");
}

function drawUniqueV4(context: CanvasRenderingContext2D): void {
  badgeV4(context, "#4a86e8");
  for (let index = 0; index < 3; index += 1) {
    const angle = (index * Math.PI) / 3;
    const x = Math.cos(angle) * 20;
    const y = Math.sin(angle) * 20;
    lineV4(context, "#ffffff", 4, [32 - x, 32 - y], [32 + x, 32 + y]);
  }
  const branches: readonly [PointV4, PointV4][] = [
    [[16, 24], [22, 24]],
    [[16, 40], [22, 40]],
    [[42, 24], [48, 24]],
    [[42, 40], [48, 40]],
    [[27, 15], [30, 20]],
    [[37, 15], [34, 20]],
    [[27, 49], [30, 44]],
    [[37, 49], [34, 44]],
  ];
  branches.forEach(([from, to]) => {
    lineV4(context, "#ffffff", 3, from, to);
  });
}

function drawIconV4(
  context: CanvasRenderingContext2D,
  icon: Exclude<IconNameV4, "blank">,
): void {
  switch (icon) {
    case "trashcan":
      drawTrashcanV4(context);
      break;
    case "explosion":
      drawExplosionV4(context);
      break;
    case "recycle":
      drawRecycleV4(context);
      break;
    case "chevronUp":
      drawChevronV4(context, "up");
      break;
    case "chevronDown":
      drawChevronV4(context, "down");
      break;
    case "target-success":
      drawTargetV4(context);
      break;
    case "critical-success":
      drawCriticalSuccessV4(context);
      break;
    case "critical-failure":
      drawCriticalFailureV4(context);
      break;
    case "penetrate":
      drawPenetrateV4(context);
      break;
    case "unique":
      drawUniqueV4(context);
      break;
    default:
      throw new Error(`Three.js V4 modifier icon is invalid: ${String(icon)}`);
  }
}

export function createThreeModifierIconPlacementsV4(
  layout: ThreeDiceGridLayoutV4<RenderDieV4>,
  rendererRevision: RendererRevisionV4,
): readonly ThreeModifierIconPlacementV4[] {
  return layout.rows.flatMap((row) =>
    row.cells.flatMap((cell) => {
      const { icons } = cell.die;
      if (icons.length > 3) {
        throw new Error("Three.js V4 supports at most three modifier icons");
      }
      if (icons.length === 0) return [];
      if (cell.iconViewport === null) {
        throw new Error("Three.js V4 modifier-icon viewport is missing");
      }
      const iconCount = icons.length as 1 | 2 | 3;
      const iconSize = modifierIconSizeV4(rendererRevision);
      const y =
        layout.height - cell.iconViewport.y - cell.iconViewport.height;
      return icons.flatMap((icon, slotIndex) =>
        icon === "blank"
          ? []
          : [
              {
                icon,
                groupIndex: cell.groupIndex,
                groupDieIndex: cell.groupDieIndex,
                slotIndex,
                x:
                  cell.iconViewport.x +
                  modifierIconLeftV4(iconCount, slotIndex, rendererRevision),
                y,
                width: iconSize,
                height: iconSize,
              },
            ],
      );
    }),
  );
}

function iconAtlasScaleV4(rendererRevision: RendererRevisionV4): number {
  return modifierIconDesignV4(rendererRevision) === "signal-disks-r8"
    ? ICON_ATLAS_SCALE_R8_V4
    : 1;
}

function iconAtlasCellSizeV4(rendererRevision: RendererRevisionV4): number {
  return (
    (MODIFIER_ICON_VIEWBOX_SIZE_V4 + 2) *
    iconAtlasScaleV4(rendererRevision)
  );
}

export function createThreeModifierIconAtlasSourceV4(
  rendererRevision: RendererRevisionV4,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scale = iconAtlasScaleV4(rendererRevision);
  const gutter = scale;
  const cellSize = iconAtlasCellSizeV4(rendererRevision);
  const design = modifierIconDesignV4(rendererRevision);
  canvas.width = DRAWABLE_ICON_NAMES_V4.length * cellSize;
  canvas.height = cellSize;
  const context = requireCanvasContextV4(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  DRAWABLE_ICON_NAMES_V4.forEach((icon, index) => {
    context.save();
    try {
      context.translate(
        index * cellSize + gutter,
        gutter,
      );
      context.scale(scale, scale);
      if (design === "signal-disks-r8") {
        drawSignalDiskV4(context, icon);
      } else {
        drawIconV4(context, icon);
      }
    } finally {
      context.restore();
    }
  });
  return canvas;
}

function iconAtlasUvV4(
  icon: Exclude<IconNameV4, "blank">,
  canvas: HTMLCanvasElement,
  rendererRevision: RendererRevisionV4,
): readonly [left: number, right: number, top: number, bottom: number] {
  const index = DRAWABLE_ICON_NAMES_V4.indexOf(icon);
  if (index < 0) {
    throw new Error(`Three.js V4 modifier icon is invalid: ${String(icon)}`);
  }
  const scale = iconAtlasScaleV4(rendererRevision);
  const gutter = scale;
  const start = index * iconAtlasCellSizeV4(rendererRevision) + gutter;
  const iconPixels = MODIFIER_ICON_VIEWBOX_SIZE_V4 * scale;
  return [
    (start + 0.5) / canvas.width,
    (start + iconPixels - 0.5) / canvas.width,
    1 - (gutter + 0.5) / canvas.height,
    1 - (gutter + iconPixels - 0.5) / canvas.height,
  ];
}

export function prepareThreeModifierIconAtlasV4(
  layout: ThreeDiceGridLayoutV4<RenderDieV4>,
  rendererRevision: RendererRevisionV4,
): HTMLCanvasElement | null {
  const placements = createThreeModifierIconPlacementsV4(
    layout,
    rendererRevision,
  );
  return placements.length === 0
    ? null
    : createThreeModifierIconAtlasSourceV4(rendererRevision);
}

export function createThreeModifierIconResourcesV4(
  layout: ThreeDiceGridLayoutV4<RenderDieV4>,
  canvas: HTMLCanvasElement | null,
  rendererRevision: RendererRevisionV4,
): ThreeModifierIconResourcesV4 | null {
  const placements = createThreeModifierIconPlacementsV4(
    layout,
    rendererRevision,
  );
  if (placements.length === 0) {
    if (canvas !== null) {
      throw new Error("Three.js V4 modifier-icon atlas is unexpected");
    }
    return null;
  }
  if (canvas === null) {
    throw new Error("Three.js V4 modifier-icon atlas is missing");
  }
  if (
    canvas.width !==
      DRAWABLE_ICON_NAMES_V4.length * iconAtlasCellSizeV4(rendererRevision) ||
    canvas.height !== iconAtlasCellSizeV4(rendererRevision)
  ) {
    throw new Error("Three.js V4 modifier-icon atlas dimensions are invalid");
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  placements.forEach((placement, placementIndex) => {
    const { x, y, width, height } = placement;
    const [left, right, top, bottom] = iconAtlasUvV4(
      placement.icon,
      canvas,
      rendererRevision,
    );
    positions.push(
      x, y, 0,
      x + width, y, 0,
      x + width, y + height, 0,
      x, y + height, 0,
    );
    uvs.push(left, top, right, top, right, bottom, left, bottom);
    const offset = placementIndex * 4;
    indices.push(offset, offset + 2, offset + 1, offset, offset + 3, offset + 2);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  const texture = new CanvasTexture(canvas);
  texture.name = "dice-v4-modifier-icon-atlas";
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  const material = new MeshBasicMaterial({
    alphaTest: 0.02,
    depthTest: false,
    depthWrite: false,
    map: texture,
    transparent: true,
  });
  material.name = "dice-v4-modifier-icons";
  material.toneMapped = false;
  const mesh = new Mesh(geometry, material);
  mesh.name = "dice-v4-modifier-icons";
  mesh.renderOrder = 10;
  const camera = new OrthographicCamera(
    0,
    layout.width,
    0,
    layout.height,
    -1,
    1,
  );
  camera.position.z = 1;
  camera.updateProjectionMatrix();
  return {
    mesh,
    camera,
    geometry,
    material,
    texture,
    iconCount: placements.length,
    atlasWidth: canvas.width,
    atlasHeight: canvas.height,
    geometryBytes:
      positions.length * Float32Array.BYTES_PER_ELEMENT +
      uvs.length * Float32Array.BYTES_PER_ELEMENT +
      indices.length * Uint16Array.BYTES_PER_ELEMENT,
    textureBytes: canvas.width * canvas.height * 4,
    disposed: false,
  };
}

export function disposeThreeModifierIconResourcesV4(
  resources: ThreeModifierIconResourcesV4 | null,
): void {
  if (resources === null || resources.disposed) return;
  resources.disposed = true;
  resources.mesh.removeFromParent();
  resources.geometry.dispose();
  resources.material.dispose();
  resources.texture.dispose();
}
