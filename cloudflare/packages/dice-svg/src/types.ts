export type PatternFill = {
  name: string;
  string: string;
};

export type GenerateDieProps = {
  result: number;
  sides?: DiceSides;
  textColor?: string;
  outlineColor?: string;
  solidFill?: string;
  patternFill?: PatternFill;
  borderWidth?: string;
  width?: string;
  height?: string;
};

export type DiceSides = number | "%" | "F";

export type IconName =
  | "trashcan"
  | "explosion"
  | "recycle"
  | "chevronUp"
  | "chevronDown"
  | "target-success"
  | "critical-success"
  | "critical-failure"
  | "penetrate"
  | "unique"
  | "blank";

export const PATTERN_NAMES_V1_V2 = [
  "checkerboard",
  "dots",
  "stripes",
  "stars",
  "zigzag",
  "triangles",
  "honeycomb",
  "circuit",
  "crosshatch",
  "swirl",
] as const;

export const PATTERN_NAMES_V3 = [
  ...PATTERN_NAMES_V1_V2,
  "checkerboard-v2",
  "dots-v2",
  "stripes-v2",
  "triangles-v2",
  "crosshatch-v2",
] as const;

export type PatternNameV1V2 = (typeof PATTERN_NAMES_V1_V2)[number];
export type PatternName = PatternNameV1V2;
export type PatternNameV3 = (typeof PATTERN_NAMES_V3)[number];

export type RenderFill =
  | { type: "gradient" }
  | { type: "pattern"; pattern: PatternNameV1V2 };

export type RenderDie = {
  sides: DiceSides;
  rolled: number;
  color: string;
  secondaryColor: string;
  textColor: string;
  outlineColor: string;
  icons: IconName[];
  fill: RenderFill;
};

export type RenderRequest = {
  version: 1;
  groups: RenderDie[][];
};

export const APPEARANCE_FONT_IDS = [
  "liberation-sans",
  "new-rocker",
  "stencil-ops",
  "creeping-horror",
  "special-elite",
  "luckiest-guy",
  "fontdiner-swanky",
  "syncopate",
] as const;

export type AppearanceFontId = (typeof APPEARANCE_FONT_IDS)[number];

export type RenderAppearanceFillV2 =
  | { type: "solid" }
  | { type: "gradient" }
  | { type: "pattern"; pattern: PatternNameV1V2 };

export type RenderAppearanceV2 = {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  outlineColor: "#000000";
  fill: RenderAppearanceFillV2;
  fontId: AppearanceFontId;
  effect: "critical-success" | "critical-failure" | null;
  requiresLocalSeparation: boolean;
};

export type RenderTargetV2 =
  | "d4"
  | "d6"
  | "d8"
  | "d10"
  | "d12"
  | "d20"
  | "percentile"
  | "fudge"
  | "other";

type RenderDieV2Base = {
  result: number;
  appearance: RenderAppearanceV2;
  icons: IconName[];
};

export type RenderDieV2 =
  | (RenderDieV2Base & {
      target: Exclude<RenderTargetV2, "other">;
    })
  | (RenderDieV2Base & {
      target: "other";
      sides: number;
    });

export type RenderRequestV2 = {
  version: 2;
  groups: RenderDieV2[][];
};

export type RenderGradientScopeV3 = "repeated" | "die-wide";

export type RenderLinearDirectionV3 =
  | "top-to-bottom"
  | "upper-right-to-lower-left"
  | "right-to-left"
  | "lower-right-to-upper-left"
  | "bottom-to-top"
  | "lower-left-to-upper-right"
  | "left-to-right"
  | "upper-left-to-lower-right";

export type RenderLightingStrengthV3 = "gentle" | "subtle" | "strong";

export type RenderLightingDirectionV3 =
  | "top"
  | "upper-left"
  | "upper-right"
  | "left"
  | "right";

export type RenderSurfaceV3 =
  | { type: "solid"; color: string }
  | {
      type: "gradient";
      colors: [string, string, ...string[]];
      scope: RenderGradientScopeV3;
      direction: RenderLinearDirectionV3;
    }
  | {
      type: "pattern";
      pattern: PatternNameV3;
      primaryColor: string;
      secondaryColor: string;
    };

export type RenderLightingV3 =
  | { mode: "none" }
  | { mode: "facet"; strength: RenderLightingStrengthV3 }
  | {
      mode: "directional" | "combined";
      strength: RenderLightingStrengthV3;
      direction: RenderLightingDirectionV3;
    };

export type RenderAppearanceV3 = {
  surface: RenderSurfaceV3;
  lighting: RenderLightingV3;
  textColor: "#111111" | "#faf9f6";
  outlineColor: "#000000";
  fontId: AppearanceFontId;
  effect: "critical-success" | "critical-failure" | null;
  requiresLocalSeparation: boolean;
};

export type RenderTargetV3 =
  | "d4"
  | "d6"
  | "d8"
  | "d10"
  | "d10-original"
  | "d12"
  | "d20"
  | "percentile"
  | "fudge"
  | "other";

type RenderDieV3Base = {
  result: number;
  appearance: RenderAppearanceV3;
  icons: IconName[];
};

export type RenderDieV3 =
  | (RenderDieV3Base & {
      target: Exclude<RenderTargetV3, "other">;
    })
  | (RenderDieV3Base & {
      target: "other";
      sides: number;
    });

export type RenderRequestV3 = {
  version: 3;
  groups: RenderDieV3[][];
};

export type ComposedSvg = {
  svg: string;
  width: number;
  height: number;
  diceCount: number;
  rowCount: number;
};

export type RenderResult = Omit<ComposedSvg, "svg"> & {
  version: 1;
  png: Uint8Array;
};

export type RenderResultV2 = Omit<ComposedSvg, "svg"> & {
  version: 2;
  png: Uint8Array;
};

export type RenderResultV3 = Omit<ComposedSvg, "svg"> & {
  version: 3;
  png: Uint8Array;
};
