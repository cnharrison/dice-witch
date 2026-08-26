import {
  MODIFIER_ICON_VIEWBOX_SIZE_V4,
  SIGNAL_DISK_MODIFIER_ICONS_V4,
  modifierIconDesignV4,
  modifierIconLeftV4,
  modifierIconSizeV4,
  type IconNameV4,
  type ModifierIconCommandV4,
  type RendererRevisionV4,
} from "@dice-witch/dice-v4-model";
import type { Canvas, Paint, PathBuilder } from "canvaskit-wasm";
import type { CanvasKitResourceScopeV4 } from "./resources";
import type { CanvasKitRuntimeV4 } from "./runtime";


type PointV4 = readonly [x: number, y: number];

type PaintStyleV4 = "fill" | "stroke";

function colorComponents(color: string): readonly [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
}

export class CanvasKitModifierIconPainterV4 {
  readonly #canvasKit: CanvasKitRuntimeV4;
  readonly #scope: CanvasKitResourceScopeV4;
  readonly #paints = new Map<string, Paint>();

  constructor(
    canvasKit: CanvasKitRuntimeV4,
    scope: CanvasKitResourceScopeV4,
  ) {
    this.#canvasKit = canvasKit;
    this.#scope = scope;
  }

  #paint(
    color: string,
    style: PaintStyleV4 = "fill",
    strokeWidth = 0,
    antiAlias = false,
  ): Paint {
    const key = `${color}|${style}|${String(strokeWidth)}|${String(antiAlias)}`;
    let paint = this.#paints.get(key);
    if (paint !== undefined) return paint;
    const [red, green, blue] = colorComponents(color);
    paint = this.#scope.own(new this.#canvasKit.Paint(), "modifier icon paint");
    paint.setAntiAlias(antiAlias);
    paint.setColor(this.#canvasKit.Color4f(red, green, blue, 1));
    if (style === "stroke") {
      paint.setStyle(this.#canvasKit.PaintStyle.Stroke);
      paint.setStrokeWidth(strokeWidth);
      paint.setStrokeCap(this.#canvasKit.StrokeCap.Round);
      paint.setStrokeJoin(this.#canvasKit.StrokeJoin.Round);
    }
    this.#paints.set(key, paint);
    return paint;
  }

  #signalPaint(
    color: string,
    style: PaintStyleV4 = "fill",
    strokeWidth = 0,
  ): Paint {
    return this.#paint(color, style, strokeWidth, true);
  }

  #polygon(
    canvas: Canvas,
    points: readonly PointV4[],
    color: string,
  ): void {
    const builder: PathBuilder = new this.#canvasKit.PathBuilder();
    let path;
    try {
      const first = points[0];
      if (first === undefined) return;
      builder.moveTo(first[0], first[1]);
      points.slice(1).forEach(([x, y]) => builder.lineTo(x, y));
      builder.close();
      path = this.#scope.own(
        builder.detachAndDelete(),
        "modifier icon path",
      );
      canvas.drawPath(path, this.#paint(color));
      this.#scope.delete(path);
    } catch (error) {
      if (path === undefined) builder.delete();
      throw error;
    }
  }

  #star(
    canvas: Canvas,
    centerX: number,
    centerY: number,
    outerRadius: number,
    innerRadius: number,
    points: number,
    color: string,
  ): void {
    this.#polygon(
      canvas,
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

  #badge(canvas: Canvas, color: string): void {
    canvas.drawCircle(32, 32, 30.5, this.#paint("#24152d"));
    canvas.drawCircle(32, 32, 28.5, this.#paint(color));
  }

  #line(
    canvas: Canvas,
    color: string,
    width: number,
    from: PointV4,
    to: PointV4,
  ): void {
    canvas.drawLine(
      from[0],
      from[1],
      to[0],
      to[1],
      this.#paint(color, "stroke", width),
    );
  }

  #drawTrashcan(canvas: Canvas): void {
    this.#badge(canvas, "#ce2029");
    canvas.drawRect(
      this.#canvasKit.XYWHRect(21, 24, 22, 25),
      this.#paint("#ffffff"),
    );
    canvas.drawRect(
      this.#canvasKit.XYWHRect(18, 18, 28, 6),
      this.#paint("#ffffff"),
    );
    canvas.drawRect(
      this.#canvasKit.XYWHRect(26, 13, 12, 5),
      this.#paint("#ffffff"),
    );
    [27, 32, 37].forEach((x) => {
      this.#line(canvas, "#ce2029", 2.2, [x, 29], [x, 44]);
    });
  }

  #drawExplosion(canvas: Canvas): void {
    this.#star(canvas, 32, 32, 31, 20, 12, "#24152d");
    this.#star(canvas, 32, 32, 28, 17, 12, "#f4511e");
    this.#star(canvas, 32, 32, 18, 11, 10, "#ffca28");
    canvas.drawCircle(32, 32, 6, this.#paint("#ffffff"));
  }

  #drawRecycle(canvas: Canvas): void {
    this.#badge(canvas, "#159447");
    const segments: readonly [PointV4, PointV4, readonly PointV4[]][] = [
      [[25, 19], [43, 26], [[43, 20], [51, 28], [41, 31]]],
      [[45, 35], [34, 48], [[41, 49], [29, 52], [33, 41]]],
      [[23, 46], [17, 29], [[12, 34], [16, 21], [25, 28]]],
    ];
    segments.forEach(([from, to, arrow]) => {
      this.#line(canvas, "#ffffff", 5, from, to);
      this.#polygon(canvas, arrow, "#ffffff");
    });
  }

  #drawChevron(canvas: Canvas, direction: "up" | "down"): void {
    this.#badge(canvas, direction === "up" ? "#52a447" : "#ce2029");
    const points =
      direction === "up"
        ? ([[18, 38], [32, 24], [46, 38]] as const)
        : ([[18, 26], [32, 40], [46, 26]] as const);
    this.#line(canvas, "#ffffff", 7, points[0], points[1]);
    this.#line(canvas, "#ffffff", 7, points[1], points[2]);
  }

  #drawTarget(canvas: Canvas): void {
    this.#badge(canvas, "#87ceeb");
    canvas.drawCircle(29, 35, 18, this.#paint("#ce2029"));
    canvas.drawCircle(29, 35, 12, this.#paint("#ffffff"));
    canvas.drawCircle(29, 35, 6, this.#paint("#ce2029"));
    this.#line(canvas, "#ffffff", 4, [29, 35], [49, 15]);
    this.#polygon(canvas, [[49, 15], [45, 16], [48, 20], [57, 8]], "#ffffff");
  }

  #drawCriticalSuccess(canvas: Canvas): void {
    this.#star(canvas, 32, 32, 31, 21, 12, "#24152d");
    this.#star(canvas, 32, 32, 28, 19, 12, "#fcc24c");
    canvas.drawCircle(32, 32, 13, this.#paint("#e12579"));
    this.#line(canvas, "#ffffff", 5, [32, 21], [32, 35]);
    canvas.drawCircle(32, 43, 2.8, this.#paint("#ffffff"));
  }

  #drawCriticalFailure(canvas: Canvas): void {
    this.#badge(canvas, "#ce2029");
    this.#line(canvas, "#ffffff", 4.5, [18, 20], [28, 30]);
    this.#line(canvas, "#ffffff", 4.5, [28, 20], [18, 30]);
    this.#line(canvas, "#ffffff", 4.5, [36, 20], [46, 30]);
    this.#line(canvas, "#ffffff", 4.5, [46, 20], [36, 30]);
    this.#line(canvas, "#ffffff", 4.5, [21, 45], [32, 37]);
    this.#line(canvas, "#ffffff", 4.5, [32, 37], [43, 45]);
  }

  #drawPenetrate(canvas: Canvas): void {
    this.#badge(canvas, "#33435c");
    canvas.drawOval(
      this.#canvasKit.LTRBRect(17, 13, 37, 51),
      this.#paint("#56aaff", "stroke", 5),
    );
    this.#line(canvas, "#ffffff", 5, [10, 32], [49, 32]);
    this.#polygon(canvas, [[46, 22], [58, 32], [46, 42]], "#ffffff");
  }

  #drawUnique(canvas: Canvas): void {
    this.#badge(canvas, "#4a86e8");
    for (let index = 0; index < 3; index += 1) {
      const angle = (index * Math.PI) / 3;
      const x = Math.cos(angle) * 20;
      const y = Math.sin(angle) * 20;
      this.#line(canvas, "#ffffff", 4, [32 - x, 32 - y], [32 + x, 32 + y]);
    }
    const branches: readonly [PointV4, PointV4][] = [
      [[16, 24], [22, 24]], [[16, 40], [22, 40]],
      [[42, 24], [48, 24]], [[42, 40], [48, 40]],
      [[27, 15], [30, 20]], [[37, 15], [34, 20]],
      [[27, 49], [30, 44]], [[37, 49], [34, 44]],
    ];
    branches.forEach(([from, to]) => {
      this.#line(canvas, "#ffffff", 3, from, to);
    });
  }

  #drawVectorCommand(
    canvas: Canvas,
    command: ModifierIconCommandV4,
  ): void {
    if (command.kind === "circle") {
      canvas.drawCircle(
        command.x,
        command.y,
        command.radius,
        this.#signalPaint(command.fill),
      );
      return;
    }
    if (command.kind === "ellipse") {
      canvas.drawOval(
        this.#canvasKit.LTRBRect(
          command.x - command.radiusX,
          command.y - command.radiusY,
          command.x + command.radiusX,
          command.y + command.radiusY,
        ),
        this.#signalPaint(command.stroke, "stroke", command.strokeWidth),
      );
      return;
    }

    const builder: PathBuilder = new this.#canvasKit.PathBuilder();
    let path;
    try {
      for (const segment of command.segments) {
        switch (segment[0]) {
          case "M":
            builder.moveTo(segment[1], segment[2]);
            break;
          case "L":
            builder.lineTo(segment[1], segment[2]);
            break;
          case "C":
            builder.cubicTo(
              segment[1],
              segment[2],
              segment[3],
              segment[4],
              segment[5],
              segment[6],
            );
            break;
          case "Z":
            builder.close();
            break;
        }
      }
      path = this.#scope.own(
        builder.detachAndDelete(),
        "modifier icon vector path",
      );
      if (command.fill !== undefined) {
        canvas.drawPath(path, this.#signalPaint(command.fill));
      }
      if (command.stroke !== undefined && command.strokeWidth !== undefined) {
        canvas.drawPath(
          path,
          this.#signalPaint(command.stroke, "stroke", command.strokeWidth),
        );
      }
      this.#scope.delete(path);
    } catch (error) {
      if (path === undefined) builder.delete();
      throw error;
    }
  }

  #drawSignalDisk(canvas: Canvas, icon: IconNameV4): void {
    if (icon === "blank") return;
    for (const command of SIGNAL_DISK_MODIFIER_ICONS_V4[icon]) {
      this.#drawVectorCommand(canvas, command);
    }
  }

  #drawIcon(canvas: Canvas, icon: IconNameV4): void {
    switch (icon) {
      case "trashcan":
        this.#drawTrashcan(canvas);
        break;
      case "explosion":
        this.#drawExplosion(canvas);
        break;
      case "recycle":
        this.#drawRecycle(canvas);
        break;
      case "chevronUp":
        this.#drawChevron(canvas, "up");
        break;
      case "chevronDown":
        this.#drawChevron(canvas, "down");
        break;
      case "target-success":
        this.#drawTarget(canvas);
        break;
      case "critical-success":
        this.#drawCriticalSuccess(canvas);
        break;
      case "critical-failure":
        this.#drawCriticalFailure(canvas);
        break;
      case "penetrate":
        this.#drawPenetrate(canvas);
        break;
      case "unique":
        this.#drawUnique(canvas);
        break;
      case "blank":
        break;
      default:
        throw new Error(`CanvasKit V4 modifier icon is invalid: ${String(icon)}`);
    }
  }

  draw(
    canvas: Canvas,
    icons: readonly IconNameV4[],
    rendererRevision: RendererRevisionV4,
  ): void {
    if (icons.length > 3) {
      throw new Error("CanvasKit V4 supports at most three modifier icons");
    }
    let iconCount: 0 | 1 | 2 | 3;
    switch (icons.length) {
      case 0:
      case 1:
      case 2:
      case 3:
        iconCount = icons.length;
        break;
      default:
        throw new Error("CanvasKit V4 supports at most three modifier icons");
    }
    const iconSize = modifierIconSizeV4(rendererRevision);
    const design = modifierIconDesignV4(rendererRevision);
    icons.forEach((icon, index) => {
      canvas.save();
      try {
        canvas.translate(
          modifierIconLeftV4(iconCount, index, rendererRevision),
          150,
        );
        canvas.scale(
          iconSize / MODIFIER_ICON_VIEWBOX_SIZE_V4,
          iconSize / MODIFIER_ICON_VIEWBOX_SIZE_V4,
        );
        if (design === "signal-disks-r8") {
          this.#drawSignalDisk(canvas, icon);
        } else {
          this.#drawIcon(canvas, icon);
        }
      } finally {
        canvas.restore();
      }
    });
  }
}
