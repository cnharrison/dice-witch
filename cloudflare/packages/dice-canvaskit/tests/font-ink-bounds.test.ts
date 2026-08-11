import {
  FONT_IDS_V4,
  formatEngravingLabelV4,
} from "@dice-witch/dice-v4-model";
import type { Font } from "canvaskit-wasm";
import { describe, expect, it } from "vitest";
import { CANVASKIT_FONT_DATA_V4 } from "../src/font-assets";
import {
  measureFontInkBoundsV4,
  type FontInkBoundsV4,
} from "../src/font-ink-bounds";
import { loadCanvasKitV4 } from "../src/runtime";

const COMPARISON_SIZE_V4 = 512;

function boundsAtSize(
  font: Font,
  value: string,
  size: number,
): FontInkBoundsV4 {
  font.setSize(size);
  const glyphs = font.getGlyphIDs(value);
  const widths = font.getGlyphWidths(glyphs);
  const glyphBounds = font.getGlyphBounds(glyphs);
  let advance = 0;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  widths.forEach((width, index) => {
    const offset = index * 4;
    left = Math.min(left, advance + (glyphBounds[offset] ?? Number.NaN));
    top = Math.min(top, glyphBounds[offset + 1] ?? Number.NaN);
    right = Math.max(
      right,
      advance + (glyphBounds[offset + 2] ?? Number.NaN),
    );
    bottom = Math.max(bottom, glyphBounds[offset + 3] ?? Number.NaN);
    advance += width;
  });
  return {
    left: left / size,
    top: top / size,
    right: right / size,
    bottom: bottom / size,
  };
}

describe("CanvasKit V4 font ink bounds", () => {
  it("remain stable across large measurement sizes for every facet numeral", async () => {
    const canvasKit = await loadCanvasKitV4();
    for (const fontId of FONT_IDS_V4) {
      const typeface = canvasKit.Typeface.MakeTypefaceFromData(
        CANVASKIT_FONT_DATA_V4[fontId].slice(0),
      );
      if (typeface === null) {
        throw new Error(`CanvasKit V4 test typeface is invalid: ${fontId}`);
      }
      const font = new canvasKit.Font(typeface, 1);
      try {
        font.setEdging(canvasKit.FontEdging.AntiAlias);
        font.setHinting(canvasKit.FontHinting.None);
        font.setLinearMetrics(true);
        font.setSubpixel(true);
        for (let value = 1; value <= 12; value += 1) {
          const text = formatEngravingLabelV4(fontId, String(value));
          const measured = measureFontInkBoundsV4(font, text);
          const comparison = boundsAtSize(
            font,
            text,
            COMPARISON_SIZE_V4,
          );
          expect(measured.left).toBeCloseTo(comparison.left, 2);
          expect(measured.top).toBeCloseTo(comparison.top, 2);
          expect(measured.right).toBeCloseTo(comparison.right, 2);
          expect(measured.bottom).toBeCloseTo(comparison.bottom, 2);
        }
      } finally {
        font.delete();
        typeface.delete();
      }
    }
  });
});
