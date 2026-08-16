export const GRID_DIE_SIZE_R38 = 150;
export const GRID_GROUP_COLUMN_GAP_R38 = 75;
export const GRID_GROUP_ROW_GAP_R38 = 30;

const GRID_MAX_COLUMNS_R38 = 10;
const GRID_MAX_DICE_R38 = 50;
// Matches the approved Discord mobile media envelope.
const MOBILE_DISPLAY_WIDTH_R38 = 450;
const MOBILE_DISPLAY_HEIGHT_R38 = 700;

type SourceDieR38<Die> = {
  die: Die;
  groupIndex: number;
  dieIndex: number;
};

type GroupSegmentR38<Die> = {
  groupIndex: number;
  dice: readonly SourceDieR38<Die>[];
};

type CandidateRowR38<Die> = {
  segments: readonly GroupSegmentR38<Die>[];
};

export type GridLayoutRowR38<Die> = {
  dice: readonly Die[];
  groupIndices: readonly number[];
  dieIndices: readonly number[];
  columnOffsets: readonly number[];
  width: number;
  offsetX: number;
  y: number;
};

export type GridLayoutR38<Die> = {
  mode: "stacked" | "compact";
  capacity: number;
  rows: readonly GridLayoutRowR38<Die>[];
  rowCount: number;
  rowHeight: number;
  width: number;
  height: number;
  diceCount: number;
};

type KeepTogetherR38<Die> = (left: Die, right: Die) => boolean;

export type DynamicGridLayoutOptionsR38<Die> = {
  groups: readonly (readonly Die[])[];
  rowHeight: number;
  keepTogether?: KeepTogetherR38<Die>;
};

type PartitionR38<Die> = {
  score: number;
  rows: readonly (readonly SourceDieR38<Die>[])[];
};

type ScaleR38 = { numerator: number; denominator: number };

function sourceGroupsR38<Die>(
  groups: readonly (readonly Die[])[],
): readonly (readonly SourceDieR38<Die>[])[] {
  return groups.map((group, groupIndex) =>
    group.map((die, dieIndex) => ({ die, groupIndex, dieIndex })),
  );
}

function compareLengthsR38(
  left: readonly (readonly unknown[])[],
  right: readonly (readonly unknown[])[],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference =
      (left[index]?.length ?? 0) - (right[index]?.length ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function betterPartitionR38<Die>(
  candidate: PartitionR38<Die>,
  current: PartitionR38<Die> | null,
): boolean {
  if (current === null || candidate.score < current.score) return true;
  return candidate.score === current.score &&
    compareLengthsR38(candidate.rows, current.rows) > 0;
}

function balancedRowsR38<Die>(
  group: readonly SourceDieR38<Die>[],
  capacity: number,
  keepTogether: KeepTogetherR38<Die> | undefined,
): readonly (readonly SourceDieR38<Die>[])[] | null {
  if (group.length <= capacity) return [group];
  const minimumRowCount = Math.ceil(group.length / capacity);
  for (
    let rowCount = minimumRowCount;
    rowCount <= group.length;
    rowCount += 1
  ) {
    const cache = new Map<string, PartitionR38<Die> | null>();
    const partition = (
      offset: number,
      remainingRows: number,
    ): PartitionR38<Die> | null => {
      const key = `${String(offset)}:${String(remainingRows)}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      if (remainingRows === 1) {
        const length = group.length - offset;
        const result = length >= 1 && length <= capacity
          ? {
              score: (length * rowCount - group.length) ** 2,
              rows: [group.slice(offset)],
            }
          : null;
        cache.set(key, result);
        return result;
      }

      const minimumEnd = Math.max(
        offset + 1,
        group.length - (remainingRows - 1) * capacity,
      );
      const maximumEnd = Math.min(
        offset + capacity,
        group.length - (remainingRows - 1),
      );
      let best: PartitionR38<Die> | null = null;
      for (let end = minimumEnd; end <= maximumEnd; end += 1) {
        const left = group[end - 1];
        const right = group[end];
        if (
          left !== undefined &&
          right !== undefined &&
          keepTogether?.(left.die, right.die) === true
        ) {
          continue;
        }
        const remainder = partition(end, remainingRows - 1);
        if (remainder === null) continue;
        const length = end - offset;
        const candidate: PartitionR38<Die> = {
          score:
            (length * rowCount - group.length) ** 2 + remainder.score,
          rows: [group.slice(offset, end), ...remainder.rows],
        };
        if (betterPartitionR38(candidate, best)) best = candidate;
      }
      cache.set(key, best);
      return best;
    };
    const result = partition(0, rowCount);
    if (result !== null) return result.rows;
  }
  return null;
}

function stackedRowsR38<Die>(
  groups: readonly (readonly SourceDieR38<Die>[])[],
  keepTogether: KeepTogetherR38<Die> | undefined,
): readonly CandidateRowR38<Die>[] {
  return groups.flatMap((group, groupIndex) => {
    const rows = balancedRowsR38(group, GRID_MAX_COLUMNS_R38, keepTogether);
    if (rows === null) {
      throw new Error("r38 could not keep paired dice together");
    }
    return rows.map((dice) => ({
      segments: [{ groupIndex, dice }],
    }));
  });
}

function compactRowsR38<Die>(
  groups: readonly (readonly SourceDieR38<Die>[])[],
  capacity: number,
  keepTogether: KeepTogetherR38<Die> | undefined,
): readonly CandidateRowR38<Die>[] | null {
  const rows: CandidateRowR38<Die>[] = [];
  let segments: GroupSegmentR38<Die>[] = [];
  let rowDiceCount = 0;
  const flush = () => {
    if (segments.length === 0) return;
    rows.push({ segments });
    segments = [];
    rowDiceCount = 0;
  };

  for (const [groupIndex, group] of groups.entries()) {
    if (group.length > capacity) {
      flush();
      const wrapped = balancedRowsR38(group, capacity, keepTogether);
      if (wrapped === null) return null;
      rows.push(...wrapped.map((dice) => ({
        segments: [{ groupIndex, dice }],
      })));
      continue;
    }
    if (rowDiceCount + group.length > capacity) flush();
    segments.push({ groupIndex, dice: group });
    rowDiceCount += group.length;
  }
  flush();
  return rows;
}

function candidateRowR38<Die>(
  row: CandidateRowR38<Die>,
): Omit<GridLayoutRowR38<Die>, "offsetX" | "y"> {
  const dice: Die[] = [];
  const groupIndices: number[] = [];
  const dieIndices: number[] = [];
  const columnOffsets: number[] = [];
  let offset = 0;
  row.segments.forEach((segment, segmentIndex) => {
    if (segmentIndex > 0) offset += GRID_GROUP_COLUMN_GAP_R38;
    segment.dice.forEach((source) => {
      dice.push(source.die);
      groupIndices.push(source.groupIndex);
      dieIndices.push(source.dieIndex);
      columnOffsets.push(offset);
      offset += GRID_DIE_SIZE_R38;
    });
  });
  return {
    dice,
    groupIndices,
    dieIndices,
    columnOffsets,
    width: offset,
  };
}

function continuationRowR38<Die>(
  previous: CandidateRowR38<Die>,
  current: CandidateRowR38<Die>,
): boolean {
  const previousSegment = previous.segments.length === 1
    ? previous.segments[0]
    : undefined;
  const currentSegment = current.segments.length === 1
    ? current.segments[0]
    : undefined;
  const previousLast = previousSegment?.dice.at(-1);
  const currentFirst = currentSegment?.dice[0];
  return previousSegment !== undefined &&
    currentSegment !== undefined &&
    previousSegment.groupIndex === currentSegment.groupIndex &&
    previousLast !== undefined &&
    currentFirst !== undefined &&
    previousLast.dieIndex + 1 === currentFirst.dieIndex;
}

function buildCandidateR38<Die>(
  mode: "stacked" | "compact",
  capacity: number,
  rows: readonly CandidateRowR38<Die>[],
  rowHeight: number,
  diceCount: number,
): GridLayoutR38<Die> {
  const measuredRows = rows.map(candidateRowR38);
  const contentWidth = Math.max(...measuredRows.map(({ width }) => width));
  const width = Math.max(contentWidth, rowHeight * 2);
  let y = 0;
  const placedRows = measuredRows.map((row, index): GridLayoutRowR38<Die> => {
    if (index > 0) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (previous === undefined || current === undefined) {
        throw new Error("r38 row sequence is invalid");
      }
      y += rowHeight;
      if (mode === "compact" && !continuationRowR38(previous, current)) {
        y += GRID_GROUP_ROW_GAP_R38;
      }
    }
    return {
      ...row,
      offsetX: (width - row.width) / 2,
      y,
    };
  });
  const lastRow = placedRows.at(-1);
  if (lastRow === undefined) throw new Error("r38 layout has no rows");
  return {
    mode,
    capacity,
    rows: placedRows,
    rowCount: placedRows.length,
    rowHeight,
    width,
    height: lastRow.y + rowHeight,
    diceCount,
  };
}

function projectedScaleR38(layout: GridLayoutR38<unknown>): ScaleR38 {
  let scale: ScaleR38 = { numerator: 1, denominator: 1 };
  const limits: readonly ScaleR38[] = [
    { numerator: MOBILE_DISPLAY_WIDTH_R38, denominator: layout.width },
    { numerator: MOBILE_DISPLAY_HEIGHT_R38, denominator: layout.height },
  ];
  for (const limit of limits) {
    if (
      limit.numerator * scale.denominator <
      scale.numerator * limit.denominator
    ) {
      scale = limit;
    }
  }
  return scale;
}

function compareProjectedScaleR38(
  left: GridLayoutR38<unknown>,
  right: GridLayoutR38<unknown>,
): number {
  const leftScale = projectedScaleR38(left);
  const rightScale = projectedScaleR38(right);
  return leftScale.numerator * rightScale.denominator -
    rightScale.numerator * leftScale.denominator;
}

function betterLayoutR38<Die>(
  candidate: GridLayoutR38<Die>,
  current: GridLayoutR38<Die>,
): boolean {
  const scaleComparison = compareProjectedScaleR38(candidate, current);
  if (scaleComparison !== 0) return scaleComparison > 0;
  if (candidate.height !== current.height) {
    return candidate.height < current.height;
  }
  if (candidate.width !== current.width) {
    return candidate.width < current.width;
  }
  if (candidate.mode !== current.mode) return candidate.mode === "stacked";
  return candidate.capacity < current.capacity;
}

export function createDynamicGridLayoutR38<Die>(
  options: DynamicGridLayoutOptionsR38<Die>,
): GridLayoutR38<Die> {
  const { groups, rowHeight, keepTogether } = options;
  if (groups.length === 0) throw new Error("r38 groups must be a non-empty array");
  if (groups.some((group) => group.length === 0)) {
    throw new Error("r38 groups must not contain empty groups");
  }
  if (!Number.isInteger(rowHeight) || rowHeight < GRID_DIE_SIZE_R38) {
    throw new Error("r38 row height is invalid");
  }
  const diceCount = groups.reduce((total, group) => total + group.length, 0);
  if (diceCount > GRID_MAX_DICE_R38) {
    throw new Error("r38 layout exceeds 50 dice");
  }

  const sources = sourceGroupsR38(groups);
  let best = buildCandidateR38(
    "stacked",
    GRID_MAX_COLUMNS_R38,
    stackedRowsR38(sources, keepTogether),
    rowHeight,
    diceCount,
  );
  if (groups.length === 1) return best;

  for (let capacity = 1; capacity <= GRID_MAX_COLUMNS_R38; capacity += 1) {
    const rows = compactRowsR38(sources, capacity, keepTogether);
    if (rows === null) continue;
    const candidate = buildCandidateR38(
      "compact",
      capacity,
      rows,
      rowHeight,
      diceCount,
    );
    if (betterLayoutR38(candidate, best)) best = candidate;
  }
  return best;
}
