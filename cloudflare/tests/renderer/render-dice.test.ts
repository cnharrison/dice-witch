import { describe, expect, it } from "vitest";
import {
  renderDiceToPng,
  type IconName,
  type RenderDie,
} from "../../packages/dice-svg/src";

function createDie(
  sides: RenderDie["sides"],
  rolled: number,
  icons: IconName[] = [],
): RenderDie {
  return {
    sides,
    rolled,
    color: "#6f42c1",
    secondaryColor: "#24143d",
    textColor: "#faf9f6",
    outlineColor: "#000000",
    icons,
    fill: { type: "gradient" },
  };
}

function pngDimension(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

describe("renderDiceToPng", () => {
  it("renders standard, percentile, Fudge, and generic dice with the bundled font", async () => {
    const result = await renderDiceToPng({
      version: 1,
      groups: [[
        createDie(20, 17),
        createDie("%", 90),
        createDie(10, 0),
        createDie("F", -1),
        createDie(37, 23),
        createDie(999, 999),
      ]],
    });

    expect(result.version).toBe(1);
    expect(pngDimension(result.png, 16)).toBe(900);
    expect(pngDimension(result.png, 20)).toBe(150);
    expect(result.png.byteLength).toBeGreaterThan(10_000);
  });

  it("renders the maximum-height 50-group image", async () => {
    const groups = Array.from({ length: 50 }, (_, index) => [
      createDie(20, (index % 20) + 1, ["critical-success"]),
    ]);
    const result = await renderDiceToPng({ version: 1, groups });

    expect(pngDimension(result.png, 16)).toBe(150);
    expect(pngDimension(result.png, 20)).toBe(9350);
    expect(result.png.byteLength).toBeLessThan(10_000_000);
    expect(result.diceCount).toBe(50);
  });
});
