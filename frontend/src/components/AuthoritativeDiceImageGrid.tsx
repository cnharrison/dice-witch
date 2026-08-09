import type { RenderedRollImage } from "@/types/dice";
import * as React from "react";

const DICE_CELL_SIZE = 150;
const ICON_AREA_HEIGHT = 37;
const SOURCE_MAX_COLUMNS = 10;

type AuthoritativeDiceImageGridProps = {
  image: RenderedRollImage;
  groupSizes: readonly number[];
  iconsByGroup?: readonly (readonly (readonly string[])[])[];
  blankFaces?: boolean;
};

type SourceCell = {
  groupIndex: number;
  dieIndex: number;
  sourceColumn: number;
  sourceRow: number;
};

function sourceCells(groupSizes: readonly number[]): SourceCell[][] {
  let sourceRow = 0;
  return groupSizes.map((groupSize, groupIndex) => {
    const cells = Array.from({ length: groupSize }, (_, dieIndex) => ({
      groupIndex,
      dieIndex,
      sourceColumn: dieIndex % SOURCE_MAX_COLUMNS,
      sourceRow: sourceRow + Math.floor(dieIndex / SOURCE_MAX_COLUMNS),
    }));
    sourceRow += Math.ceil(groupSize / SOURCE_MAX_COLUMNS);
    return cells;
  });
}

export function AuthoritativeDiceImageGrid({
  image,
  groupSizes,
  iconsByGroup,
  blankFaces = false,
}: AuthoritativeDiceImageGridProps) {
  const cells = React.useMemo(() => sourceCells(groupSizes), [groupSizes]);
  const hasIcons =
    iconsByGroup?.some((group) =>
      group.some((icons) => icons.length > 0),
    ) ?? false;
  const rowHeight = DICE_CELL_SIZE + (hasIcons ? ICON_AREA_HEIGHT : 0);
  const sourceRows = groupSizes.reduce(
    (total, size) => total + Math.ceil(size / SOURCE_MAX_COLUMNS),
    0,
  );
  const sourceColumns = Math.max(
    ...groupSizes.map((size) => Math.min(size, SOURCE_MAX_COLUMNS)),
  );
  if (
    groupSizes.length === 0 ||
    groupSizes.some((size) => !Number.isSafeInteger(size) || size < 1)
  ) {
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        Authoritative dice image layout is invalid.
      </p>
    );
  }

  const source = `data:${image.contentType};base64,${image.base64}`;
  const canCropUniformCells =
    image.width === sourceColumns * DICE_CELL_SIZE &&
    image.height === sourceRows * rowHeight;
  if (!canCropUniformCells) {
    return (
      <div
        role="img"
        aria-label={blankFaces ? "Prepared blank dice" : "Rendered dice result"}
        className="w-full overflow-x-auto"
      >
        <div className="flex w-max min-w-full justify-center">
          <img
            data-authoritative-image
            src={source}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none max-w-none select-none"
            style={{ width: image.width, height: image.height }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={blankFaces ? "Prepared blank dice" : "Rendered dice result"}
      className="flex w-full flex-col items-center gap-0 overflow-x-hidden"
    >
      {cells.map((group, groupIndex) => (
        <div
          key={groupIndex}
          data-dice-group={groupIndex}
          className="flex w-full flex-wrap justify-center"
        >
          {group.map((cell) => (
            <div
              key={cell.dieIndex}
              data-dice-cell={`${String(cell.groupIndex)}:${String(cell.dieIndex)}`}
              className="relative shrink-0 overflow-hidden"
              style={{ width: DICE_CELL_SIZE, height: rowHeight }}
            >
              <img
                src={source}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{
                  width: image.width,
                  height: image.height,
                  left: -cell.sourceColumn * DICE_CELL_SIZE,
                  top: -cell.sourceRow * rowHeight,
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
