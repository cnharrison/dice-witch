import type {
  AppearanceCatalogV2,
  AppearanceFill,
  AppearanceRecipeV2,
} from "@/types/appearance";

export const FEATURED_APPEARANCE_STYLE_IDS = [
  "dice-witch",
  "pride",
  "trans",
  "crimson-palette",
  "amber-palette",
  "verdant-palette",
  "azure-palette",
  "monochrome-palette",
  "chaotic",
] as const;
export const FEATURED_APPEARANCE_PATTERN_IDS = [
  "checkerboard",
  "dots",
  "stripes",
  "triangles",
  "crosshatch",
] as const;

export function cloneAppearanceRecipe(
  recipe: AppearanceRecipeV2,
): AppearanceRecipeV2 {
  return structuredClone(recipe);
}

export function createNativeAppearanceTreatment(): Pick<
  AppearanceRecipeV2,
  "compatibility" | "gradient" | "lighting"
> {
  return {
    compatibility: "native-v2",
    gradient: {
      colorSource: "full-palette",
      scope: { mode: "fixed", value: "die-wide" },
      direction: {
        mode: "fixed",
        value: "upper-left-to-lower-right",
      },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

function randomColor(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `#${[...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function distinctRandomColor(existing: readonly string[]): string {
  const colors = new Set(existing);
  let color = randomColor();
  while (colors.has(color)) color = randomColor();
  return color;
}

export function getAppearancePresetStyles(
  catalog: AppearanceCatalogV2,
  retainedStyleId: string,
): AppearanceCatalogV2["styles"] {
  const stylesById = new Map(catalog.styles.map((style) => [style.id, style]));
  const featured = FEATURED_APPEARANCE_STYLE_IDS.map((id) => {
    const style = stylesById.get(id);
    if (style === undefined) throw new Error(`Featured style ${id} is missing`);
    return style;
  });
  if (
    retainedStyleId === "" ||
    FEATURED_APPEARANCE_STYLE_IDS.some((id) => id === retainedStyleId)
  ) {
    return featured;
  }
  const retained = stylesById.get(retainedStyleId);
  if (retained === undefined) {
    throw new Error("Selected appearance style is missing");
  }
  return [...featured, retained];
}

export function getAppearanceFills(
  catalog: AppearanceCatalogV2,
  retained: readonly AppearanceFill[] = [],
): AppearanceFill[] {
  const patternsById = new Map(
    catalog.patterns.map((pattern) => [pattern.id, pattern]),
  );
  const patternIds: string[] = FEATURED_APPEARANCE_PATTERN_IDS.map((id) => {
    if (!patternsById.has(id)) {
      throw new Error(`Featured pattern ${id} is missing`);
    }
    return id;
  });
  for (const fill of retained) {
    if (fill.type !== "pattern" || patternIds.includes(fill.patternId)) continue;
    if (!patternsById.has(fill.patternId)) {
      throw new Error("Selected appearance pattern is missing");
    }
    patternIds.push(fill.patternId);
  }
  return [
    { type: "solid" },
    { type: "gradient" },
    ...patternIds.map((patternId) => ({
      type: "pattern" as const,
      patternId,
    })),
  ];
}

export function appearanceFillKey(fill: AppearanceFill): string {
  return fill.type === "pattern" ? `pattern:${fill.patternId}` : fill.type;
}

export function getAppearanceFillLabel(
  fill: AppearanceFill,
  catalog: AppearanceCatalogV2,
): string {
  if (fill.type === "solid") return "Solid";
  if (fill.type === "gradient") return "Gradient";
  const pattern = catalog.patterns.find(({ id }) => id === fill.patternId);
  if (pattern === undefined) throw new Error("Appearance pattern is missing");
  return pattern.name;
}
