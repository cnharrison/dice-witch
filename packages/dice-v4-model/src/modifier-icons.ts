import { rendererRevisionPolicyV4 } from "./renderer-revision";
import type { IconNameV4, RendererRevisionV4 } from "./types";

export const MODIFIER_ICON_VIEWBOX_SIZE_V4 = 64;
export const LEGACY_MODIFIER_ICON_SIZE_V4 = 37;
export const SIGNAL_DISK_MODIFIER_ICON_SIZE_V4 = 42;

export type ModifierIconDesignV4 = "legacy-r1" | "signal-disks-r8";
export type ModifierIconPathSegmentV4 =
  | readonly ["M" | "L", x: number, y: number]
  | readonly [
      "C",
      controlX1: number,
      controlY1: number,
      controlX2: number,
      controlY2: number,
      x: number,
      y: number,
    ]
  | readonly ["Z"];

export type ModifierIconCommandV4 =
  | {
      kind: "circle";
      x: number;
      y: number;
      radius: number;
      fill: string;
    }
  | {
      kind: "ellipse";
      x: number;
      y: number;
      radiusX: number;
      radiusY: number;
      stroke: string;
      strokeWidth: number;
    }
  | {
      kind: "path";
      segments: readonly ModifierIconPathSegmentV4[];
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    };

export type DrawableModifierIconNameV4 = Exclude<IconNameV4, "blank">;

const DARK = "#24152d";
const WHITE = "#ffffff";

const ACCENTS = Object.freeze({
  trashcan: "#ff5968",
  explosion: "#ff9f1c",
  recycle: "#35d07f",
  chevronUp: "#63d56f",
  chevronDown: "#ff5364",
  "target-success": "#55c7f3",
  "critical-success": "#ffd447",
  "critical-failure": "#ff4967",
  penetrate: "#64a9ff",
  unique: "#8ca8ff",
} satisfies Record<DrawableModifierIconNameV4, string>);

const M = (x: number, y: number): ModifierIconPathSegmentV4 => ["M", x, y];
const L = (x: number, y: number): ModifierIconPathSegmentV4 => ["L", x, y];
const C = (
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  x: number,
  y: number,
): ModifierIconPathSegmentV4 => [
  "C",
  controlX1,
  controlY1,
  controlX2,
  controlY2,
  x,
  y,
];
const Z = (): ModifierIconPathSegmentV4 => ["Z"];

function token(accent: string): ModifierIconCommandV4[] {
  return [
    { kind: "circle", x: 32, y: 32, radius: 30, fill: DARK },
    { kind: "circle", x: 32, y: 32, radius: 27.5, fill: accent },
  ];
}

function strokePath(
  segments: readonly ModifierIconPathSegmentV4[],
  strokeWidth = 5,
): ModifierIconCommandV4 {
  return { kind: "path", segments, stroke: WHITE, strokeWidth };
}

function filledPath(
  segments: readonly ModifierIconPathSegmentV4[],
  fill: string,
): ModifierIconCommandV4 {
  return { kind: "path", segments, fill };
}

const starburst = [
  M(32, 10),
  L(37.2, 21.4),
  L(49, 17.2),
  L(44.8, 28.9),
  L(56, 34),
  L(44.8, 39.1),
  L(49, 50.8),
  L(37.2, 46.6),
  L(32, 58),
  L(26.8, 46.6),
  L(15, 50.8),
  L(19.2, 39.1),
  L(8, 34),
  L(19.2, 28.9),
  L(15, 17.2),
  L(26.8, 21.4),
  Z(),
] as const;

const designs: Record<DrawableModifierIconNameV4, ModifierIconCommandV4[]> = {
  trashcan: [
    ...token(ACCENTS.trashcan),
    strokePath([
      M(22, 24), L(42, 24), L(40, 49), L(24, 49), Z(),
      M(19, 20), L(45, 20),
      M(27, 20), L(27, 15), L(37, 15), L(37, 20),
      M(29, 29), L(29, 43),
      M(35, 29), L(35, 43),
    ]),
  ],
  explosion: [
    ...token(ACCENTS.explosion),
    filledPath(starburst, WHITE),
    { kind: "circle", x: 32, y: 34, radius: 7, fill: DARK },
  ],
  recycle: [
    ...token(ACCENTS.recycle),
    strokePath([
      M(20, 28), C(24, 17, 37, 15, 45, 22),
      M(42, 15), L(47, 23), L(38, 24),
      M(44, 39), C(40, 50, 27, 52, 19, 44),
      M(22, 51), L(17, 43), L(26, 42),
    ]),
  ],
  chevronUp: [
    ...token(ACCENTS.chevronUp),
    strokePath([M(17, 40), L(32, 25), L(47, 40)], 7),
  ],
  chevronDown: [
    ...token(ACCENTS.chevronDown),
    strokePath([M(17, 25), L(32, 40), L(47, 25)], 7),
  ],
  "target-success": [
    ...token(ACCENTS["target-success"]),
    { kind: "circle", x: 29, y: 35, radius: 16, fill: WHITE },
    { kind: "circle", x: 29, y: 35, radius: 11, fill: ACCENTS["target-success"] },
    { kind: "circle", x: 29, y: 35, radius: 6, fill: WHITE },
    strokePath([M(29, 35), L(49, 15)], 4),
    filledPath([M(45, 14), L(51, 12), L(49, 18), Z()], WHITE),
  ],
  "critical-success": [
    ...token(ACCENTS["critical-success"]),
    filledPath(starburst, WHITE),
    strokePath([M(22, 32), L(29, 39), L(43, 24)], 5),
  ],
  "critical-failure": [
    ...token(ACCENTS["critical-failure"]),
    strokePath([
      M(18, 42), L(18, 34), C(18, 24, 24, 17, 32, 17),
      C(40, 17, 46, 24, 46, 34), L(46, 42),
      L(41, 47), L(36, 44), L(32, 48), L(28, 44), L(23, 47), Z(),
      M(23, 29), L(28, 34), M(28, 29), L(23, 34),
      M(36, 29), L(41, 34), M(41, 29), L(36, 34),
    ]),
  ],
  penetrate: [
    ...token(ACCENTS.penetrate),
    {
      kind: "ellipse",
      x: 29,
      y: 32,
      radiusX: 10,
      radiusY: 17,
      stroke: WHITE,
      strokeWidth: 5,
    },
    strokePath([M(10, 32), L(49, 32)], 5),
    filledPath([M(43, 23), L(53, 32), L(43, 41), Z()], WHITE),
  ],
  unique: [
    ...token(ACCENTS.unique),
    strokePath([
      M(32, 12), L(32, 52), M(15, 22), L(49, 42), M(15, 42), L(49, 22),
      M(26, 17), L(32, 22), L(38, 17),
      M(26, 47), L(32, 42), L(38, 47),
      M(18, 29), L(26, 28), L(24, 21),
      M(46, 35), L(38, 36), L(40, 43),
      M(18, 35), L(26, 36), L(24, 43),
      M(46, 29), L(38, 28), L(40, 21),
    ], 4),
  ],
};

function freezeCommands(
  commands: ModifierIconCommandV4[],
): readonly ModifierIconCommandV4[] {
  for (const command of commands) {
    if (command.kind === "path") {
      command.segments.forEach(Object.freeze);
      Object.freeze(command.segments);
    }
    Object.freeze(command);
  }
  return Object.freeze(commands);
}

export const SIGNAL_DISK_MODIFIER_ICONS_V4 = Object.freeze(
  Object.fromEntries(
    Object.entries(designs).map(([name, commands]) => [
      name,
      freezeCommands(commands),
    ]),
  ) as Record<DrawableModifierIconNameV4, readonly ModifierIconCommandV4[]>,
);

export function modifierIconDesignV4(
  rendererRevision: RendererRevisionV4,
): ModifierIconDesignV4 {
  return rendererRevisionPolicyV4(rendererRevision).modifierIcons;
}

export function modifierIconSizeV4(
  rendererRevision: RendererRevisionV4,
): number {
  return modifierIconDesignV4(rendererRevision) === "signal-disks-r8"
    ? SIGNAL_DISK_MODIFIER_ICON_SIZE_V4
    : LEGACY_MODIFIER_ICON_SIZE_V4;
}

const ICON_SPACING_V4 = Object.freeze({
  0: 0,
  1: 0.375,
  2: 0.26,
  3: 0.19,
} as const);

export function modifierIconLeftV4(
  iconCount: 0 | 1 | 2 | 3,
  slotIndex: number,
  rendererRevision: RendererRevisionV4,
): number {
  if (!Number.isSafeInteger(slotIndex) || slotIndex < 0 || slotIndex >= iconCount) {
    throw new Error("Modifier icon slot index is invalid");
  }
  const legacyLeft = 150 * ICON_SPACING_V4[iconCount] * (slotIndex + 1);
  return legacyLeft -
    (modifierIconSizeV4(rendererRevision) - LEGACY_MODIFIER_ICON_SIZE_V4) / 2;
}
