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

export type PatternName =
  | "checkerboard"
  | "dots"
  | "stripes"
  | "stars"
  | "zigzag"
  | "triangles"
  | "honeycomb"
  | "circuit"
  | "crosshatch"
  | "swirl";

export type RenderFill =
  | { type: "gradient" }
  | { type: "pattern"; pattern: PatternName };

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
