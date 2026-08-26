import { describe, expect, it } from "vitest";
import {
  THREE_DICE_GRID_CELL_SIZE_V4,
  THREE_DICE_GRID_ICON_AREA_HEIGHT_V4,
  THREE_DICE_GRID_ICON_ROW_HEIGHT_V4,
  createThreeDiceGridLayoutV4,
} from "./grid-layout";

describe("V4 Three.js grid layout", () => {
  it("uses 150px cells, at most ten columns, and preserves group rows", () => {
    const groups = [
      Array.from({ length: 12 }, (_, index) => `first-${String(index)}`),
      Array.from({ length: 3 }, (_, index) => `second-${String(index)}`),
      Array.from({ length: 11 }, (_, index) => `third-${String(index)}`),
    ];

    const layout = createThreeDiceGridLayoutV4(groups, () => []);

    expect(THREE_DICE_GRID_CELL_SIZE_V4).toBe(150);
    expect(layout).toMatchObject({
      diceCount: 26,
      columnCount: 10,
      width: 1_500,
      height: 750,
    });
    expect(layout.rows.map(({ groupIndex, groupRowIndex, height, cells }) => ({
      groupIndex,
      groupRowIndex,
      height,
      dice: cells.map(({ die }) => die),
    }))).toEqual([
      {
        groupIndex: 0,
        groupRowIndex: 0,
        height: 150,
        dice: groups[0]?.slice(0, 10),
      },
      {
        groupIndex: 0,
        groupRowIndex: 1,
        height: 150,
        dice: groups[0]?.slice(10),
      },
      {
        groupIndex: 1,
        groupRowIndex: 0,
        height: 150,
        dice: groups[1],
      },
      {
        groupIndex: 2,
        groupRowIndex: 0,
        height: 150,
        dice: groups[2]?.slice(0, 10),
      },
      {
        groupIndex: 2,
        groupRowIndex: 1,
        height: 150,
        dice: groups[2]?.slice(10),
      },
    ]);
    expect(layout.rows[0]?.cells[0]).toMatchObject({
      groupIndex: 0,
      groupDieIndex: 0,
      rowIndex: 0,
      columnIndex: 0,
      viewport: { x: 0, y: 600, width: 150, height: 150 },
      iconViewport: null,
    });
    expect(layout.rows[4]?.cells[0]).toMatchObject({
      groupIndex: 2,
      groupDieIndex: 10,
      rowIndex: 4,
      columnIndex: 0,
      viewport: { x: 0, y: 0, width: 150, height: 150 },
      iconViewport: null,
    });
  });

  it("wraps full-size result cells to the available responsive columns", () => {
    const layout = createThreeDiceGridLayoutV4(
      [[1, 2, 3, 4, 5], [6, 7]],
      () => [],
      2,
    );

    expect(layout).toMatchObject({
      diceCount: 7,
      maximumColumns: 2,
      columnCount: 2,
      width: 300,
      height: 600,
    });
    expect(layout.rows.map(({ cells }) => cells.map(({ die }) => die))).toEqual([
      [1, 2],
      [3, 4],
      [5],
      [6, 7],
    ]);
  });

  it("keeps each input group on a fresh output row", () => {
    const layout = createThreeDiceGridLayoutV4(
      [[1, 2], [3, 4]],
      () => [],
    );

    expect(layout.rows.map(({ cells }) => cells.map(({ die }) => die))).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(layout).toMatchObject({
      diceCount: 4,
      columnCount: 2,
      width: 300,
      height: 300,
    });
  });

  it("rejects empty, malformed, and oversized grids", () => {
    expect(() => createThreeDiceGridLayoutV4([], () => [])).toThrow(
      "Three.js V4 grid groups must be a non-empty array",
    );
    expect(() => createThreeDiceGridLayoutV4([[1], []], () => [])).toThrow(
      "Three.js V4 grid groups must not contain empty groups",
    );
    expect(() =>
      createThreeDiceGridLayoutV4(
        [Array.from({ length: 51 }, (_, index) => index)],
        () => [],
      ),
    ).toThrow("Three.js V4 grid exceeds 50 dice");
    expect(() => createThreeDiceGridLayoutV4([[1]], () => [], 0)).toThrow(
      "Three.js V4 grid maximum columns must be from 1 through 10",
    );
  });

  it("reserves one 37px icon area for every icon-bearing row", () => {
    const groups = [
      [
        { id: "one", icons: ["unique"] as const },
        { id: "two", icons: [] as const },
      ],
      [{ id: "three", icons: ["blank", "recycle"] as const }],
      [{ id: "four", icons: [] as const }],
    ];

    const layout = createThreeDiceGridLayoutV4(
      groups,
      ({ icons }) => icons,
    );

    expect(THREE_DICE_GRID_ICON_AREA_HEIGHT_V4).toBe(37);
    expect(THREE_DICE_GRID_ICON_ROW_HEIGHT_V4).toBe(187);
    expect(layout).toMatchObject({ width: 300, height: 524 });
    expect(layout.rows.map(({ height }) => height)).toEqual([187, 187, 150]);
    expect(layout.rows[0]?.cells[0]).toMatchObject({
      viewport: { x: 0, y: 374, width: 150, height: 150 },
      iconViewport: { x: 0, y: 337, width: 150, height: 37 },
    });
    expect(layout.rows[0]?.cells[1]?.iconViewport).toEqual({
      x: 150,
      y: 337,
      width: 150,
      height: 37,
    });
    expect(layout.rows[1]?.cells[0]).toMatchObject({
      viewport: { x: 0, y: 187, width: 150, height: 150 },
      iconViewport: { x: 0, y: 150, width: 150, height: 37 },
    });
    expect(layout.rows[2]?.cells[0]).toMatchObject({
      viewport: { x: 0, y: 0, width: 150, height: 150 },
      iconViewport: null,
    });
  });

  it("supports the bounded 50 one-die icon rows and rejects excess icons", () => {
    const groups = Array.from({ length: 50 }, (_, index) => [
      { index, icons: ["blank"] as const },
    ]);
    const layout = createThreeDiceGridLayoutV4(
      groups,
      ({ icons }) => icons,
    );

    expect(layout).toMatchObject({
      diceCount: 50,
      columnCount: 1,
      width: 150,
      height: 9_350,
    });
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect(() =>
      createThreeDiceGridLayoutV4(
        [[{ icons: ["trashcan", "explosion", "recycle", "unique"] }]],
        ({ icons }) => icons as ["trashcan", "explosion", "recycle", "unique"],
      ),
    ).toThrow("Three.js V4 grid supports at most three modifier icons");
  });
});
