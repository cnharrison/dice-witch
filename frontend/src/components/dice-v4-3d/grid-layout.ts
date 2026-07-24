import type { IconNameV4 } from "@dice-witch/dice-v4-model";

export const THREE_DICE_GRID_CELL_SIZE_V4 = 150;
export const THREE_DICE_GRID_ICON_AREA_HEIGHT_V4 = 37;
export const THREE_DICE_GRID_ICON_ROW_HEIGHT_V4 = 187;
export const THREE_DICE_GRID_MAX_COLUMNS_V4 = 10;
export const THREE_DICE_GRID_MAX_DICE_V4 = 50;

export type ThreeDiceGridViewportV4 = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ThreeDiceGridCellV4<Die> = {
  die: Die;
  groupIndex: number;
  groupDieIndex: number;
  rowIndex: number;
  columnIndex: number;
  viewport: ThreeDiceGridViewportV4;
  iconViewport: ThreeDiceGridViewportV4 | null;
};

export type ThreeDiceGridRowV4<Die> = {
  groupIndex: number;
  groupRowIndex: number;
  height: number;
  cells: readonly ThreeDiceGridCellV4<Die>[];
};

export type ThreeDiceGridLayoutV4<Die> = {
  rows: readonly ThreeDiceGridRowV4<Die>[];
  diceCount: number;
  columnCount: number;
  maximumColumns: number;
  width: number;
  height: number;
};

export function createThreeDiceGridLayoutV4<Die>(
  groups: readonly (readonly Die[])[],
  iconsForDie: (die: Die) => readonly IconNameV4[],
  maximumColumns = THREE_DICE_GRID_MAX_COLUMNS_V4,
): ThreeDiceGridLayoutV4<Die> {
  if (
    !Number.isSafeInteger(maximumColumns) ||
    maximumColumns < 1 ||
    maximumColumns > THREE_DICE_GRID_MAX_COLUMNS_V4
  ) {
    throw new Error("Three.js V4 grid maximum columns must be from 1 through 10");
  }
  if (groups.length === 0) {
    throw new Error("Three.js V4 grid groups must be a non-empty array");
  }
  if (groups.some((group) => group.length === 0)) {
    throw new Error("Three.js V4 grid groups must not contain empty groups");
  }
  const diceCount = groups.reduce((total, group) => total + group.length, 0);
  if (diceCount > THREE_DICE_GRID_MAX_DICE_V4) {
    throw new Error("Three.js V4 grid exceeds 50 dice");
  }

  const rowInputs = groups.flatMap((group, groupIndex) =>
    Array.from(
      {
        length: Math.ceil(group.length / maximumColumns),
      },
      (_, groupRowIndex) => {
        const dice = group.slice(
          groupRowIndex * maximumColumns,
          (groupRowIndex + 1) * maximumColumns,
        );
        const iconSets = dice.map(iconsForDie);
        if (iconSets.some((icons) => icons.length > 3)) {
          throw new Error("Three.js V4 grid supports at most three modifier icons");
        }
        return {
          groupIndex,
          groupRowIndex,
          dice,
          hasIconArea: iconSets.some((icons) => icons.length > 0),
        };
      },
    ),
  );
  const columnCount = Math.max(...rowInputs.map(({ dice }) => dice.length));
  const rowHeights = rowInputs.map(({ hasIconArea }) =>
    hasIconArea
      ? THREE_DICE_GRID_ICON_ROW_HEIGHT_V4
      : THREE_DICE_GRID_CELL_SIZE_V4,
  );
  const height = rowHeights.reduce((total, rowHeight) => total + rowHeight, 0);
  let top = 0;
  const rows = rowInputs.map(
    ({ groupIndex, groupRowIndex, dice, hasIconArea }, rowIndex) => {
      const rowHeight = rowHeights[rowIndex];
      if (rowHeight === undefined) {
        throw new Error("Three.js V4 grid row height is missing");
      }
      const viewportY = height - top - THREE_DICE_GRID_CELL_SIZE_V4;
      const iconViewportY = height - top - rowHeight;
      top += rowHeight;
      return {
        groupIndex,
        groupRowIndex,
        height: rowHeight,
        cells: dice.map((die, columnIndex) => ({
          die,
          groupIndex,
          groupDieIndex:
            groupRowIndex * maximumColumns + columnIndex,
          rowIndex,
          columnIndex,
          viewport: {
            x: columnIndex * THREE_DICE_GRID_CELL_SIZE_V4,
            y: viewportY,
            width: THREE_DICE_GRID_CELL_SIZE_V4,
            height: THREE_DICE_GRID_CELL_SIZE_V4,
          },
          iconViewport: hasIconArea
            ? {
                x: columnIndex * THREE_DICE_GRID_CELL_SIZE_V4,
                y: iconViewportY,
                width: THREE_DICE_GRID_CELL_SIZE_V4,
                height: THREE_DICE_GRID_ICON_AREA_HEIGHT_V4,
              }
            : null,
        })),
      };
    },
  );

  return {
    rows,
    diceCount,
    columnCount,
    maximumColumns,
    width: columnCount * THREE_DICE_GRID_CELL_SIZE_V4,
    height,
  };
}
