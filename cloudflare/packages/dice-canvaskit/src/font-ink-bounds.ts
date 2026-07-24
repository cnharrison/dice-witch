import type { Font } from "canvaskit-wasm";

const FONT_INK_MEASUREMENT_SIZE_V4 = 1_024;

export type FontInkBoundsV4 = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export function measureFontInkBoundsV4(
  font: Font,
  value: string,
): FontInkBoundsV4 {
  font.setSize(FONT_INK_MEASUREMENT_SIZE_V4);
  const glyphs = font.getGlyphIDs(value);
  if ([...glyphs].some((glyph) => glyph === 0)) {
    throw new Error(`CanvasKit V4 font is missing glyphs for ${value}`);
  }

  const widths = font.getGlyphWidths(glyphs);
  const glyphBounds = font.getGlyphBounds(glyphs);
  let advance = 0;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  widths.forEach((width, index) => {
    const offset = index * 4;
    const glyphLeft = glyphBounds[offset];
    const glyphTop = glyphBounds[offset + 1];
    const glyphRight = glyphBounds[offset + 2];
    const glyphBottom = glyphBounds[offset + 3];
    if (
      glyphLeft === undefined ||
      glyphTop === undefined ||
      glyphRight === undefined ||
      glyphBottom === undefined
    ) {
      throw new Error("CanvasKit V4 font glyph bounds are invalid");
    }
    left = Math.min(left, advance + glyphLeft);
    top = Math.min(top, glyphTop);
    right = Math.max(right, advance + glyphRight);
    bottom = Math.max(bottom, glyphBottom);
    advance += width;
  });

  const scale = 1 / FONT_INK_MEASUREMENT_SIZE_V4;
  const normalized = {
    left: left * scale,
    top: top * scale,
    right: right * scale,
    bottom: bottom * scale,
  };
  if (
    !Number.isFinite(normalized.left) ||
    !Number.isFinite(normalized.top) ||
    !Number.isFinite(normalized.right) ||
    !Number.isFinite(normalized.bottom) ||
    normalized.right <= normalized.left ||
    normalized.bottom <= normalized.top
  ) {
    throw new Error("CanvasKit V4 font glyph bounds are invalid");
  }
  return normalized;
}
