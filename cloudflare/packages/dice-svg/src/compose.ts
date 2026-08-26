import {
  generateD4,
  generateD6,
  generateD8,
  generateD10,
  generateD12,
  generateD20,
  generateDF,
  generateDPercent,
  generateGeneric,
} from "./dice";
import generateLinearGradientFill from "./fills/generateLinearGradientFill";
import patternFills from "./fills/generatePatternFills";
import {
  arrowThroughIcon,
  blankIcon,
  bullseyeIcon,
  chevronDownIcon,
  chevronUpIcon,
  critIcon,
  dizzyFaceIcon,
  explosionIcon,
  recycleIcon,
  snowflakeIcon,
  trashcanIcon,
} from "./icons";
import type {
  ComposedSvg,
  GenerateDieProps,
  IconName,
  RenderDie,
  RenderTargetV3,
} from "./types";
import { validateRenderRequest } from "./validate";
import type { ValidationInput } from "./validationBoundary";

const DICE_SIZE = 150;
const ICON_SIZE = 37;
const MAX_DICE_PER_ROW = 10;

type DiceGenerator = (props: GenerateDieProps) => string;
const diceGenerators = new Map<RenderDie["sides"], DiceGenerator>([
  [4, generateD4],
  [6, generateD6],
  [8, generateD8],
  [10, generateD10],
  [12, generateD12],
  [20, generateD20],
  ["%", generateDPercent],
  ["F", generateDF],
]);

const icons = {
  trashcan: trashcanIcon,
  explosion: explosionIcon,
  recycle: recycleIcon,
  chevronUp: chevronUpIcon,
  chevronDown: chevronDownIcon,
  "target-success": bullseyeIcon,
  "critical-success": critIcon,
  "critical-failure": dizzyFaceIcon,
  penetrate: arrowThroughIcon,
  unique: snowflakeIcon,
  blank: blankIcon,
} satisfies Record<IconName, string>;

export type RenderedDie = {
  svg: string;
  icons: IconName[];
  target?: RenderTargetV3;
};

function paginate<T>(groups: T[][]): T[][] {
  return groups.flatMap((group) =>
    Array.from(
      { length: Math.ceil(group.length / MAX_DICE_PER_ROW) },
      (_, index) =>
        group.slice(
          index * MAX_DICE_PER_ROW,
          (index + 1) * MAX_DICE_PER_ROW,
        ),
    ),
  );
}

function namespaceSvg(svg: string, namespace: string): string {
  const classNames = new Set<string>();
  for (const match of svg.matchAll(/\bclass="([^"]+)"/g)) {
    for (const className of match[1]?.split(/\s+/) ?? []) {
      if (className) classNames.add(className);
    }
  }

  let namespaced = svg
    .replace(/\bid="([^"]+)"/g, `id="${namespace}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${namespace}-$1)`)
    .replace(/\b(xlink:href|href)="#([^"]+)"/g, `$1="#${namespace}-$2"`)
    .replace(/\bclass="([^"]+)"/g, (_, value: string) => {
      const classes = value
        .split(/\s+/)
        .filter(Boolean)
        .map((className) => `${namespace}-${className}`);
      return `class="${classes.join(" ")}"`;
    });

  for (const className of classNames) {
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    namespaced = namespaced.replace(
      new RegExp(`\\.${escapedClassName}(?![\\w-])`, "g"),
      `.${namespace}-${className}`,
    );
  }
  return namespaced;
}

function getSvgViewBox(attributes: string): string {
  const viewBox = attributes.match(/\bviewBox="([^"]+)"/i)?.[1];
  if (viewBox) return viewBox;

  const width = attributes.match(/\bwidth="([0-9.]+)"/i)?.[1];
  const height = attributes.match(/\bheight="([0-9.]+)"/i)?.[1];
  if (!width || !height) {
    throw new Error("Nested SVG must define a viewBox or numeric dimensions");
  }
  return `0 0 ${width} ${height}`;
}

function placeSvg(
  source: string,
  namespace: string,
  x: number,
  y: number,
  width: number,
  height: number,
  renderTarget?: string,
): string {
  const namespaced = namespaceSvg(source.trim(), namespace);
  const match = namespaced.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i);
  if (!match?.[1] || match[2] === undefined) {
    throw new Error("Generated image is not a complete SVG document");
  }

  const targetAttribute =
    renderTarget === undefined ? "" : ` data-render-target="${renderTarget}"`;
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}"${targetAttribute} viewBox="${getSvgViewBox(match[1])}" preserveAspectRatio="xMidYMid meet">${match[2]}</svg>`;
}

function createFill(die: RenderDie) {
  if (die.fill.type === "gradient") {
    return generateLinearGradientFill(die.color, die.secondaryColor);
  }

  return patternFills[die.fill.pattern](die.color, die.secondaryColor);
}

function getIconSpacing(iconCount: number): number {
  if (iconCount === 1) return 0.375;
  if (iconCount === 2) return 0.26;
  if (iconCount === 3) return 0.19;
  if (iconCount === 0) return 0;
  throw new Error(`Unsupported icon count: ${String(iconCount)}`);
}

function renderDie(die: RenderDie): string {
  const generator = diceGenerators.get(die.sides) ?? generateGeneric;
  const numericSides =
    die.sides === "%" || die.sides === "F" ? undefined : die.sides;
  const displayValue =
    numericSides !== undefined && die.rolled > numericSides
      ? ((die.rolled - 1) % numericSides) + 1
      : die.rolled;

  return generator({
    result: displayValue,
    sides: die.sides,
    textColor: die.textColor,
    outlineColor: die.outlineColor,
    solidFill: die.color,
    patternFill: createFill(die),
  });
}

export function composeRenderedDiceGrid(groups: RenderedDie[][]): ComposedSvg {
  const diceCount = groups.reduce(
    (total, group) => total + group.length,
    0,
  );
  const rows = paginate(groups);
  const hasIcons = rows.some((row) => row.some((die) => die.icons.length > 0));
  const rowHeight = DICE_SIZE + (hasIcons ? ICON_SIZE : 0);
  const width = DICE_SIZE * Math.max(...rows.map((row) => row.length));
  const height = rowHeight * rows.length;
  let nestedSvgs = "";
  let dieIndex = 0;

  rows.forEach((row, rowIndex) => {
    row.forEach((die, columnIndex) => {
      const x = columnIndex * DICE_SIZE;
      const y = rowIndex * rowHeight;
      nestedSvgs += placeSvg(
        die.svg,
        `dw-die-${dieIndex}`,
        x,
        y,
        DICE_SIZE,
        DICE_SIZE,
        die.target,
      );

      const iconSpacing = getIconSpacing(die.icons.length);
      die.icons.forEach((icon, iconIndex) => {
        nestedSvgs += placeSvg(
          icons[icon],
          `dw-icon-${dieIndex}-${iconIndex}`,
          x + DICE_SIZE * iconSpacing * (iconIndex + 1),
          y + DICE_SIZE,
          ICON_SIZE,
          ICON_SIZE,
        );
      });
      dieIndex += 1;
    });
  });

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${nestedSvgs}</svg>`,
    width,
    height,
    diceCount,
    rowCount: rows.length,
  };
}

export function composeDiceSvg(input: ValidationInput): ComposedSvg {
  const request = validateRenderRequest(input);
  return composeRenderedDiceGrid(
    request.groups.map((group) =>
      group.map((die) => ({
        svg: renderDie(die),
        icons: die.icons,
      })),
    ),
  );
}
