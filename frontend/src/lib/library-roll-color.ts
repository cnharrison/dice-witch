import chroma from "chroma-js";

const LIBRARY_ROLL_SUGGESTION_COUNT = 5;
const LIBRARY_ROLL_SUGGESTION_HUE_OFFSET = 330;
const LIBRARY_ROLL_SUGGESTION_LIGHTNESSES = [0.48, 0.58, 0.38] as const;
const LIBRARY_ROLL_SUGGESTION_SATURATIONS = [0.72, 0.58] as const;

export const MINIMUM_LIBRARY_ROLL_COLOR_DISTANCE = 18;
const LIGHT_SURFACES = [
  chroma.hsl(35, 0.42, 0.84),
  chroma.hsl(36, 0.36, 0.88),
  chroma.hsl(34, 0.3, 0.8),
];
const DARK_SURFACES = [chroma.hsl(0, 0, 0.039), chroma.hsl(0, 0, 0.149)];
const MINIMUM_TEXT_CONTRAST = 4.5;
const DERIVED_TEXT_CONTRAST = 4.55;

export type LibraryRollColorVariants = Readonly<{
  light: string;
  dark: string;
}>;

export function libraryRollColorVariants(baseColor: string): LibraryRollColorVariants {
  return {
    light: accessibleVariant(baseColor, LIGHT_SURFACES, "darken"),
    dark: accessibleVariant(baseColor, DARK_SURFACES, "brighten"),
  };
}

export function isLibraryRollColorDistinct(
  candidate: string,
  existingColors: Iterable<string>,
): boolean {
  const existing = [...existingColors].filter((color) => chroma.valid(color));
  return existing.length === 0 || Math.min(
    ...existing.map((color) => chroma.deltaE(candidate, color)),
  ) >= MINIMUM_LIBRARY_ROLL_COLOR_DISTANCE;
}

export function generateLibraryRollColorSuggestions(
  unavailableColors: Iterable<string>,
  count = LIBRARY_ROLL_SUGGESTION_COUNT,
): string[] {
  const unavailable = [...unavailableColors]
    .filter((color) => chroma.valid(color))
    .map((color) => chroma(color).hex().toUpperCase());
  const excluded = new Set(unavailable);
  const candidates: string[] = [];

  for (const lightness of LIBRARY_ROLL_SUGGESTION_LIGHTNESSES) {
    for (const saturation of LIBRARY_ROLL_SUGGESTION_SATURATIONS) {
      for (let step = 0; step < 72; step += 1) {
        const hue = (LIBRARY_ROLL_SUGGESTION_HUE_OFFSET + step * 5) % 360;
        const color = chroma.hsl(hue, saturation, lightness).hex().toUpperCase();
        if (!excluded.has(color) && !candidates.includes(color)) candidates.push(color);
      }
    }
  }

  const suggestions: string[] = [];
  while (suggestions.length < count && candidates.length > 0) {
    const comparisons = [...unavailable, ...suggestions];
    let selectedIndex = 0;
    let selectedDistance = -1;
    candidates.forEach((candidate, index) => {
      const distance = comparisons.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(...comparisons.map((color) => chroma.deltaE(candidate, color)));
      if (distance > selectedDistance) {
        selectedDistance = distance;
        selectedIndex = index;
      }
    });
    const [selected] = candidates.splice(selectedIndex, 1);
    if (selected !== undefined) suggestions.push(selected);
  }

  return suggestions;
}

function accessibleVariant(
  baseColor: string,
  surfaces: readonly chroma.Color[],
  direction: "brighten" | "darken",
): string {
  const base = chroma(baseColor);
  if (surfaces.every((surface) => chroma.contrast(base, surface) >= MINIMUM_TEXT_CONTRAST)) {
    return base.hex().toUpperCase();
  }

  const [hue, saturation] = base.hsl();
  const fixedHue = Number.isFinite(hue) ? hue : 0;
  let low = 0;
  let high = 1;
  let result = direction === "darken" ? chroma("#000000") : chroma("#FFFFFF");
  for (let index = 0; index < 24; index += 1) {
    const lightness = (low + high) / 2;
    const candidate = chroma.hsl(fixedHue, saturation, lightness);
    const passes = surfaces.every(
      (surface) => chroma.contrast(candidate, surface) >= DERIVED_TEXT_CONTRAST,
    );
    if (passes) {
      result = candidate;
      if (direction === "darken") low = lightness;
      else high = lightness;
    } else if (direction === "darken") {
      high = lightness;
    } else {
      low = lightness;
    }
  }
  return result.hex().toUpperCase();
}
