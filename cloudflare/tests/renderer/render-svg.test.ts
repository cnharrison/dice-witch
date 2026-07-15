import { describe, expect, it } from "vitest";
import { renderSvgToPng } from "../../packages/dice-svg/src/rasterize";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function readPngDimension(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

describe("renderSvgToPng", () => {
  it("rasterizes an SVG to a PNG with the requested dimensions", async () => {
    const png = await renderSvgToPng(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><rect width="2" height="3" fill="#663399"/></svg>',
    );

    expect([...png.subarray(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);
    expect(readPngDimension(png, 16)).toBe(2);
    expect(readPngDimension(png, 20)).toBe(3);
  });

  it("rejects an empty SVG document", async () => {
    await expect(renderSvgToPng("  ")).rejects.toThrow("SVG document is required");
  });
});
