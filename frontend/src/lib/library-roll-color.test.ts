import chroma from "chroma-js";
import { describe, expect, it } from "vitest";
import {
  generateLibraryRollColorSuggestions,
  isLibraryRollColorDistinct,
  libraryRollColorVariants,
} from "./library-roll-color";

const LIGHT_SURFACES = [
  chroma.hsl(35, 0.42, 0.84),
  chroma.hsl(36, 0.36, 0.88),
  chroma.hsl(34, 0.3, 0.8),
];
const DARK_SURFACES = [chroma.hsl(0, 0, 0.039), chroma.hsl(0, 0, 0.149)];

describe("Library roll name colors", () => {
  it.each(["#FF0000", "#00FF00", "#0000FF", "#F083B5", "#464794"])(
    "derives contrast-safe light and dark variants from %s",
    (baseColor) => {
      const variants = libraryRollColorVariants(baseColor);

      for (const surface of LIGHT_SURFACES) {
        expect(chroma.contrast(variants.light, surface)).toBeGreaterThanOrEqual(4.5);
      }
      for (const surface of DARK_SURFACES) {
        expect(chroma.contrast(variants.dark, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(variants.light).toMatch(/^#[0-9A-F]{6}$/);
      expect(variants.dark).toMatch(/^#[0-9A-F]{6}$/);
    },
  );

  it("preserves chromatic hue while changing lightness", () => {
    const baseColor = "#F083B5";
    const baseHue = chroma(baseColor).get("hsl.h");
    const variants = libraryRollColorVariants(baseColor);

    expect(chroma(variants.light).get("hsl.h")).toBeCloseTo(baseHue, 0);
    expect(chroma(variants.dark).get("hsl.h")).toBeCloseTo(baseHue, 0);
  });

  it("rejects suggestions that are too close to an existing color", () => {
    expect(isLibraryRollColorDistinct("#F083B5", ["#F083B5"])).toBe(false);
    expect(isLibraryRollColorDistinct("#005D1F", ["#F083B5"])).toBe(true);
  });

  it("generates five theme-compatible suggestions that exclude used colors", () => {
    const initial = generateLibraryRollColorSuggestions([]);
    const used = [...initial, "#123456", "not-a-color"];
    const suggestions = generateLibraryRollColorSuggestions(used);

    expect(initial).toHaveLength(5);
    expect(suggestions).toHaveLength(5);
    expect(new Set(suggestions).size).toBe(5);
    expect(suggestions.every((color) => !used.includes(color))).toBe(true);
    expect(suggestions.every((color) => /^#[0-9A-F]{6}$/u.test(color))).toBe(true);
    for (const color of suggestions) {
      const variants = libraryRollColorVariants(color);
      expect(LIGHT_SURFACES.every((surface) =>
        chroma.contrast(variants.light, surface) >= 4.5,
      )).toBe(true);
      expect(DARK_SURFACES.every((surface) =>
        chroma.contrast(variants.dark, surface) >= 4.5,
      )).toBe(true);
    }
  });
});
