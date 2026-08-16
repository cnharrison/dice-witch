import { describe, expect, it } from "vitest";
import {
  createDynamicGridLayoutR38,
  GRID_DIE_SIZE_R38,
  GRID_GROUP_COLUMN_GAP_R38,
  GRID_GROUP_ROW_GAP_R38,
} from "../src/grid-layout-r38";

type TestDie = { id: string; pairedWithNext?: boolean };

function groups(lengths: readonly number[]): TestDie[][] {
  return lengths.map((length, groupIndex) =>
    Array.from({ length }, (_, dieIndex) => ({
      id: `${String(groupIndex)}:${String(dieIndex)}`,
    })),
  );
}

function repeatedPairs(count: number): TestDie[][] {
  return groups(Array.from({ length: count }, () => 2));
}

function layout(lengths: readonly number[]) {
  return createDynamicGridLayoutR38({
    groups: groups(lengths),
    rowHeight: GRID_DIE_SIZE_R38,
  });
}

describe("r38 dynamic group grid", () => {
  it("keeps six repeated pairs stacked and compacts seven through the 50-die maximum", () => {
    const six = createDynamicGridLayoutR38({
      groups: repeatedPairs(6),
      rowHeight: GRID_DIE_SIZE_R38,
    });
    const seven = createDynamicGridLayoutR38({
      groups: repeatedPairs(7),
      rowHeight: GRID_DIE_SIZE_R38,
    });
    const eight = createDynamicGridLayoutR38({
      groups: repeatedPairs(8),
      rowHeight: GRID_DIE_SIZE_R38,
    });
    const maximum = createDynamicGridLayoutR38({
      groups: repeatedPairs(25),
      rowHeight: GRID_DIE_SIZE_R38,
    });

    expect(six).toMatchObject({
      mode: "stacked",
      width: 300,
      height: 900,
      diceCount: 12,
      rowCount: 6,
    });
    expect(seven).toMatchObject({
      mode: "compact",
      capacity: 4,
      width: 675,
      height: 690,
      rowCount: 4,
    });
    expect(eight).toMatchObject({
      mode: "compact",
      capacity: 4,
      width: 675,
      height: 690,
      rowCount: 4,
    });
    expect(maximum).toMatchObject({
      mode: "compact",
      capacity: 6,
      width: 1_050,
      height: 1_590,
      diceCount: 50,
      rowCount: 9,
    });
    expect(maximum.rows[0]).toMatchObject({
      y: 0,
      width: 1_050,
      offsetX: 0,
      groupIndices: [0, 0, 1, 1, 2, 2],
      dieIndices: [0, 1, 0, 1, 0, 1],
      columnOffsets: [0, 150, 375, 525, 750, 900],
    });
    expect(maximum.rows.at(-1)).toMatchObject({
      y: 1_440,
      width: 300,
      offsetX: 375,
      groupIndices: [24, 24],
      columnOffsets: [0, 150],
    });
  });

  it("wraps wide repetitions only in compact candidates that improve display size", () => {
    const result = layout([10, 10, 10, 10, 10]);

    expect(result).toMatchObject({
      mode: "compact",
      capacity: 5,
      width: 750,
      height: 1_620,
      diceCount: 50,
      rowCount: 10,
    });
    expect(result.rows.map(({ y }) => y)).toEqual([
      0,
      150,
      330,
      480,
      660,
      810,
      990,
      1_140,
      1_320,
      1_470,
    ]);
    expect(result.rows.map(({ groupIndices }) => [...new Set(groupIndices)]))
      .toEqual([[0], [0], [1], [1], [2], [2], [3], [3], [4], [4]]);
  });

  it("keeps whole uneven groups in order with distinct group spacing", () => {
    const result = layout([2, 3, 1, 2, 4, 2, 3, 1, 2, 4, 2, 3, 1, 2, 4, 2, 3, 1, 2]);
    const sourceOrder = result.rows.flatMap((row) =>
      row.dice.map(({ id }) => id),
    );

    expect(sourceOrder).toEqual(groups([2, 3, 1, 2, 4, 2, 3, 1, 2, 4, 2, 3, 1, 2, 4, 2, 3, 1, 2]).flat().map(({ id }) => id));
    for (const row of result.rows) {
      for (let index = 1; index < row.dice.length; index += 1) {
        const previousGroup = row.groupIndices[index - 1];
        const currentGroup = row.groupIndices[index];
        const previousOffset = row.columnOffsets[index - 1];
        const currentOffset = row.columnOffsets[index];
        if (
          previousGroup === undefined ||
          currentGroup === undefined ||
          previousOffset === undefined ||
          currentOffset === undefined
        ) {
          throw new Error("Expected complete r38 row metadata");
        }
        expect(currentOffset - previousOffset).toBe(
          GRID_DIE_SIZE_R38 +
            (previousGroup === currentGroup ? 0 : GRID_GROUP_COLUMN_GAP_R38),
        );
      }
    }
    for (let index = 1; index < result.rows.length; index += 1) {
      const previous = result.rows[index - 1];
      const current = result.rows[index];
      if (previous === undefined || current === undefined) {
        throw new Error("Expected consecutive r38 rows");
      }
      const previousGroup = previous.groupIndices.at(-1);
      const currentGroup = current.groupIndices[0];
      expect(current.y - previous.y - GRID_DIE_SIZE_R38).toBe(
        previousGroup === currentGroup ? 0 : GRID_GROUP_ROW_GAP_R38,
      );
    }
  });

  it("never separates an indivisible pair across rows or groups", () => {
    const pairedGroups = groups([10, 10, 10, 10, 10]);
    for (const group of pairedGroups) {
      const pairStart = group[4];
      if (pairStart === undefined) throw new Error("Expected a pair start die");
      group[4] = { ...pairStart, pairedWithNext: true };
    }
    const result = createDynamicGridLayoutR38({
      groups: pairedGroups,
      rowHeight: GRID_DIE_SIZE_R38,
      keepTogether: (left) => left.pairedWithNext === true,
    });

    for (let groupIndex = 0; groupIndex < pairedGroups.length; groupIndex += 1) {
      const row = result.rows.find((candidate) =>
        candidate.groupIndices.some(
          (candidateGroup, index) =>
            candidateGroup === groupIndex && candidate.dieIndices[index] === 4,
        ),
      );
      const pairStart = row?.dieIndices.findIndex(
        (dieIndex, index) => row.groupIndices[index] === groupIndex && dieIndex === 4,
      );
      expect(pairStart).not.toBeUndefined();
      expect(pairStart).not.toBe(-1);
      if (row === undefined || pairStart === undefined || pairStart < 0) {
        throw new Error("Expected paired dice in an r38 row");
      }
      expect(row.groupIndices[pairStart + 1]).toBe(groupIndex);
      expect(row.dieIndices[pairStart + 1]).toBe(5);
      const leftOffset = row.columnOffsets[pairStart];
      const rightOffset = row.columnOffsets[pairStart + 1];
      if (leftOffset === undefined || rightOffset === undefined) {
        throw new Error("Expected paired die offsets");
      }
      expect(rightOffset - leftOffset).toBe(GRID_DIE_SIZE_R38);
    }
  });

  it("keeps every pair in a single wide group adjacent", () => {
    const singleGroup = groups([14]);
    const group = singleGroup[0];
    if (group === undefined) throw new Error("Expected a percentile group");
    for (let index = 0; index < 14; index += 2) {
      const pairStart = group[index];
      if (pairStart === undefined) throw new Error("Expected a pair start die");
      group[index] = { ...pairStart, pairedWithNext: true };
    }
    const result = createDynamicGridLayoutR38({
      groups: singleGroup,
      rowHeight: GRID_DIE_SIZE_R38,
      keepTogether: (left) => left.pairedWithNext === true,
    });

    expect(result.rows.map(({ dice }) => dice.length).sort((a, b) => a - b))
      .toEqual([6, 8]);
    for (const row of result.rows) {
      for (let index = 0; index < row.dice.length; index += 2) {
        const left = row.columnOffsets[index];
        const right = row.columnOffsets[index + 1];
        if (left === undefined || right === undefined) {
          throw new Error("Expected adjacent pair offsets");
        }
        expect(right - left).toBe(GRID_DIE_SIZE_R38);
      }
    }
  });

  it("rejects empty groups and requests over the 50-dice limit", () => {
    expect(() =>
      createDynamicGridLayoutR38({ groups: [[]], rowHeight: 150 }),
    ).toThrow("r38 groups must not contain empty groups");
    expect(() => layout([26, 25])).toThrow("r38 layout exceeds 50 dice");
  });
});
