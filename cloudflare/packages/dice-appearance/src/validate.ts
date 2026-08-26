import * as z from "zod";
import {
  APPEARANCE_GRADIENT_COLOR_SOURCES,
  APPEARANCE_GRADIENT_SCOPES,
  APPEARANCE_LIGHTING_DIRECTIONS,
  APPEARANCE_LIGHTING_MODES,
  APPEARANCE_LIGHTING_STRENGTHS,
  APPEARANCE_LINEAR_DIRECTIONS,
  APPEARANCE_RECIPE_COMPATIBILITIES,
  APPEARANCE_TARGETS,
  type AppearanceCatalog,
  type AppearanceColors,
  type AppearanceColorsV2,
  type AppearanceFill,
  type AppearanceFillSelection,
  type AppearanceFontSelection,
  type AppearanceGradientV2,
  type AppearanceLightingV2,
  type AppearanceProfileV1,
  type AppearanceProfileV2,
  type AppearanceRecipeV1,
  type AppearanceRecipeV2,
  type AppearanceSelection,
  type CustomDesignV1,
  type CustomDesignV2,
  type DesignReference,
  type GuildAppearanceProfileV1,
  type GuildAppearanceProfileV2,
} from "./types";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DESIGNS = 10;
const MAX_DESIGN_NAME_LENGTH = 50;
const MAX_CATALOG_ID_LENGTH = 64;
const MAX_SELECTION_WEIGHT = 1_000;
const MAX_TOTAL_SELECTION_WEIGHT = 10_000;

type ValidationInput = z.input<z.ZodUnknown>;
type BoundaryRecord = z.output<z.ZodRecord<z.ZodString, z.ZodUnknown>>;

const nonRecordValueSchema = z.union([
  z.null(),
  z.undefined(),
  z.string(),
  z.number(),
  z.nan(),
  z.literal(Number.POSITIVE_INFINITY),
  z.literal(Number.NEGATIVE_INFINITY),
  z.boolean(),
  z.bigint(),
  z.symbol(),
  z.function(),
]);
const objectValueSchema = z.custom<object>(
  (value) =>
    !nonRecordValueSchema.safeParse(value).success && !Array.isArray(value),
);
const boundaryRecordSchema = z.custom<BoundaryRecord>((value) => {
  const objectValue = objectValueSchema.safeParse(value);
  if (!objectValue.success) return false;
  const prototype = Reflect.getPrototypeOf(objectValue.data);
  return prototype === Object.prototype || prototype === null;
});
const colorSchema = z
  .string()
  .regex(HEX_COLOR)
  .transform((value) => value.toLowerCase());
const catalogIdSchema = z.string().min(1).max(MAX_CATALOG_ID_LENGTH);
const selectionWeightSchema = z
  .number()
  .refine(Number.isSafeInteger)
  .min(1)
  .max(MAX_SELECTION_WEIGHT);
const uuidV4Schema = z.string().regex(UUID_V4);
const designNameSchema = z.string();
const appearanceVariationSchema = z.enum(["fixed", "curated", "wild"]);
const appearanceVariationScopeSchema = z.enum(["die", "group", "roll"]);
const appearanceTargetSchema = z.enum(APPEARANCE_TARGETS);

function isRecord(value: ValidationInput): value is BoundaryRecord {
  return boundaryRecordSchema.safeParse(value).success;
}

function hasExactKeys(
  value: BoundaryRecord,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

function requireRecord(
  value: ValidationInput,
  expectedKeys: readonly string[],
  message: string,
): BoundaryRecord {
  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new Error(message);
  }
  return value;
}

function parseColor(value: ValidationInput): string {
  const parsed = colorSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Appearance color must be a six-digit hex color");
  }
  return parsed.data;
}

function supportedId(
  value: ValidationInput,
  supported: readonly string[],
  message: string,
): string {
  const parsed = catalogIdSchema.safeParse(value);
  if (!parsed.success || !supported.includes(parsed.data)) {
    throw new Error(message);
  }
  return parsed.data;
}

function parseColors(value: ValidationInput): AppearanceColors {
  if (!isRecord(value)) {
    throw new Error("Appearance colors are invalid");
  }
  if (value.mode === "tonal" || value.mode === "random") {
    if (!hasExactKeys(value, ["mode", "primary"])) {
      throw new Error("Appearance colors are invalid");
    }
    return { mode: value.mode, primary: parseColor(value.primary) };
  }
  if (
    value.mode !== "palette" ||
    !hasExactKeys(value, ["colors", "mode"]) ||
    !Array.isArray(value.colors) ||
    value.colors.length < 2 ||
    value.colors.length > 6
  ) {
    throw new Error("Appearance colors are invalid");
  }
  const colors = value.colors.map(parseColor);
  if (new Set(colors).size !== colors.length) {
    throw new Error("Appearance palette colors must be distinct");
  }
  return { mode: "palette", colors };
}

function parseColorsV2(value: ValidationInput): AppearanceColorsV2 {
  if (!isRecord(value)) {
    throw new Error("Appearance colors are invalid");
  }
  if (
    value.mode === "random-pair" ||
    value.mode === "vivid-random-pair"
  ) {
    if (!hasExactKeys(value, ["mode"])) {
      throw new Error("Appearance colors are invalid");
    }
    return { mode: value.mode };
  }
  if (value.mode !== "palette") return parseColors(value);
  if (
    !hasExactKeys(value, ["colors", "mode"]) ||
    !Array.isArray(value.colors) ||
    value.colors.length < 2 ||
    value.colors.length > 6
  ) {
    throw new Error("Appearance colors are invalid");
  }
  const colors = value.colors.map(parseColor);
  if (new Set(colors).size < 2) {
    throw new Error("Appearance palette must contain at least two distinct colors");
  }
  return { mode: "palette", colors };
}

function parseFill(value: ValidationInput, catalog: AppearanceCatalog): AppearanceFill {
  if (!isRecord(value)) {
    throw new Error("Appearance fill is invalid");
  }
  if (value.type === "solid" || value.type === "gradient") {
    if (!hasExactKeys(value, ["type"])) {
      throw new Error("Appearance fill is invalid");
    }
    return { type: value.type };
  }
  if (value.type !== "pattern" || !hasExactKeys(value, ["patternId", "type"])) {
    throw new Error("Appearance fill is invalid");
  }
  return {
    type: "pattern",
    patternId: supportedId(
      value.patternId,
      catalog.patternIds,
      "Appearance pattern id is not supported",
    ),
  };
}

function parseSelectionWeight(value: ValidationInput): number {
  const parsed = selectionWeightSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Appearance selection weight must be from 1 through ${String(MAX_SELECTION_WEIGHT)}`,
    );
  }
  return parsed.data;
}

function validateTotalWeight(options: readonly { weight: number }[]): void {
  const total = options.reduce((sum, { weight }) => sum + weight, 0);
  if (total > MAX_TOTAL_SELECTION_WEIGHT) {
    throw new Error(
      `Appearance selection weights must total at most ${String(MAX_TOTAL_SELECTION_WEIGHT)}`,
    );
  }
}

function fillKey(fill: AppearanceFill): string {
  return fill.type === "pattern" ? `pattern:${fill.patternId}` : fill.type;
}

function parseFillSelection(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): AppearanceFillSelection {
  if (!isRecord(value)) {
    throw new Error("Appearance fill selection is invalid");
  }
  if (value.mode === "fixed") {
    if (!hasExactKeys(value, ["mode", "value"])) {
      throw new Error("Appearance fill selection is invalid");
    }
    return { mode: "fixed", value: parseFill(value.value, catalog) };
  }
  const maximumOptions = catalog.patternIds.length + 2;
  if (value.mode === "allowlist") {
    if (
      !hasExactKeys(value, ["mode", "values"]) ||
      !Array.isArray(value.values) ||
      value.values.length < 1 ||
      value.values.length > maximumOptions
    ) {
      throw new Error("Appearance fill selection is invalid");
    }
    return {
      mode: "allowlist",
      values: value.values.map((fill) => parseFill(fill, catalog)),
    };
  }
  if (
    value.mode !== "weighted" ||
    !hasExactKeys(value, ["mode", "options"]) ||
    !Array.isArray(value.options) ||
    value.options.length < 1 ||
    value.options.length > maximumOptions
  ) {
    throw new Error("Appearance fill selection is invalid");
  }
  const options = value.options.map((option) => {
    const record = requireRecord(
      option,
      ["value", "weight"],
      "Appearance weighted fill is invalid",
    );
    return {
      value: parseFill(record.value, catalog),
      weight: parseSelectionWeight(record.weight),
    };
  });
  if (
    new Set(options.map(({ value: fill }) => fillKey(fill))).size !==
    options.length
  ) {
    throw new Error("Appearance weighted fills must be distinct");
  }
  validateTotalWeight(options);
  return { mode: "weighted", options };
}

function parseFontSelection(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): AppearanceFontSelection {
  if (!isRecord(value)) {
    throw new Error("Appearance font selection is invalid");
  }
  if (value.mode === "fixed") {
    if (!hasExactKeys(value, ["fontId", "mode"])) {
      throw new Error("Appearance font selection is invalid");
    }
    return {
      mode: "fixed",
      fontId: supportedId(
        value.fontId,
        catalog.fontIds,
        "Appearance font id is not supported",
      ),
    };
  }
  if (value.mode === "allowlist") {
    if (
      !hasExactKeys(value, ["fontIds", "mode"]) ||
      !Array.isArray(value.fontIds) ||
      value.fontIds.length < 1 ||
      value.fontIds.length > catalog.fontIds.length
    ) {
      throw new Error("Appearance font selection is invalid");
    }
    return {
      mode: "allowlist",
      fontIds: value.fontIds.map((fontId) =>
        supportedId(
          fontId,
          catalog.fontIds,
          "Appearance font id is not supported",
        ),
      ),
    };
  }
  if (
    value.mode !== "weighted" ||
    !hasExactKeys(value, ["mode", "options"]) ||
    !Array.isArray(value.options) ||
    value.options.length < 1 ||
    value.options.length > catalog.fontIds.length
  ) {
    throw new Error("Appearance font selection is invalid");
  }
  const options = value.options.map((option) => {
    const record = requireRecord(
      option,
      ["fontId", "weight"],
      "Appearance weighted font is invalid",
    );
    return {
      fontId: supportedId(
        record.fontId,
        catalog.fontIds,
        "Appearance font id is not supported",
      ),
      weight: parseSelectionWeight(record.weight),
    };
  });
  if (new Set(options.map(({ fontId }) => fontId)).size !== options.length) {
    throw new Error("Appearance weighted fonts must be distinct");
  }
  validateTotalWeight(options);
  return { mode: "weighted", options };
}

export function parseAppearanceRecipe(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): AppearanceRecipeV1 {
  const recipe = requireRecord(
    value,
    ["colors", "fill", "font", "variation", "varyBy", "version"],
    "Appearance recipe has invalid fields",
  );
  const variation = appearanceVariationSchema.safeParse(recipe.variation);
  const varyBy = appearanceVariationScopeSchema.safeParse(recipe.varyBy);
  if (recipe.version !== 1 || !variation.success || !varyBy.success) {
    throw new Error("Appearance recipe is invalid");
  }
  return {
    version: 1,
    variation: variation.data,
    varyBy: varyBy.data,
    colors: parseColors(recipe.colors),
    fill: parseFillSelection(recipe.fill, catalog),
    font: parseFontSelection(recipe.font, catalog),
  };
}

type SelectionMessages = {
  invalid: string;
  unsupported: string;
  duplicate: string;
  weightedOption: string;
};

function supportedValue<Value extends string>(
  value: ValidationInput,
  supported: readonly Value[],
  message: string,
): Value {
  const parsed = z.enum(supported).safeParse(value);
  if (!parsed.success) throw new Error(message);
  return parsed.data;
}

function parseValueSelection<Value extends string>(
  value: ValidationInput,
  supported: readonly Value[],
  messages: SelectionMessages,
): AppearanceSelection<Value> {
  if (!isRecord(value)) {
    throw new Error(messages.invalid);
  }
  if (value.mode === "fixed") {
    if (!hasExactKeys(value, ["mode", "value"])) {
      throw new Error(messages.invalid);
    }
    return {
      mode: "fixed",
      value: supportedValue(value.value, supported, messages.unsupported),
    };
  }
  if (value.mode === "allowlist") {
    if (
      !hasExactKeys(value, ["mode", "values"]) ||
      !Array.isArray(value.values) ||
      value.values.length < 1 ||
      value.values.length > supported.length
    ) {
      throw new Error(messages.invalid);
    }
    const values = value.values.map((option) =>
      supportedValue(option, supported, messages.unsupported),
    );
    if (new Set(values).size !== values.length) {
      throw new Error(messages.duplicate);
    }
    return { mode: "allowlist", values };
  }
  if (
    value.mode !== "weighted" ||
    !hasExactKeys(value, ["mode", "options"]) ||
    !Array.isArray(value.options) ||
    value.options.length < 1 ||
    value.options.length > supported.length
  ) {
    throw new Error(messages.invalid);
  }
  const options = value.options.map((option) => {
    const record = requireRecord(
      option,
      ["value", "weight"],
      messages.weightedOption,
    );
    return {
      value: supportedValue(record.value, supported, messages.unsupported),
      weight: parseSelectionWeight(record.weight),
    };
  });
  if (new Set(options.map(({ value: option }) => option)).size !== options.length) {
    throw new Error(messages.duplicate);
  }
  validateTotalWeight(options);
  return { mode: "weighted", options };
}

function parseGradientV2(value: ValidationInput): AppearanceGradientV2 {
  const gradient = requireRecord(
    value,
    ["colorSource", "direction", "scope"],
    "Appearance gradient V2 has invalid fields",
  );
  return {
    colorSource: supportedValue(
      gradient.colorSource,
      APPEARANCE_GRADIENT_COLOR_SOURCES,
      "Appearance gradient color source is not supported",
    ),
    scope: parseValueSelection(
      gradient.scope,
      APPEARANCE_GRADIENT_SCOPES,
      {
        invalid: "Appearance gradient scope selection is invalid",
        unsupported: "Appearance gradient scope is not supported",
        duplicate: "Appearance gradient scopes must be distinct",
        weightedOption: "Appearance weighted gradient scope is invalid",
      },
    ),
    direction: parseValueSelection(
      gradient.direction,
      APPEARANCE_LINEAR_DIRECTIONS,
      {
        invalid: "Appearance linear direction selection is invalid",
        unsupported: "Appearance linear direction is not supported",
        duplicate: "Appearance linear directions must be distinct",
        weightedOption: "Appearance weighted linear direction is invalid",
      },
    ),
  };
}

function parseLightingV2(value: ValidationInput): AppearanceLightingV2 {
  const lighting = requireRecord(
    value,
    ["direction", "mode", "strength"],
    "Appearance lighting V2 has invalid fields",
  );
  return {
    mode: parseValueSelection(lighting.mode, APPEARANCE_LIGHTING_MODES, {
      invalid: "Appearance lighting mode selection is invalid",
      unsupported: "Appearance lighting mode is not supported",
      duplicate: "Appearance lighting modes must be distinct",
      weightedOption: "Appearance weighted lighting mode is invalid",
    }),
    strength: parseValueSelection(
      lighting.strength,
      APPEARANCE_LIGHTING_STRENGTHS,
      {
        invalid: "Appearance lighting strength selection is invalid",
        unsupported: "Appearance lighting strength is not supported",
        duplicate: "Appearance lighting strengths must be distinct",
        weightedOption: "Appearance weighted lighting strength is invalid",
      },
    ),
    direction: parseValueSelection(
      lighting.direction,
      APPEARANCE_LIGHTING_DIRECTIONS,
      {
        invalid: "Appearance lighting direction selection is invalid",
        unsupported: "Appearance lighting direction is not supported",
        duplicate: "Appearance lighting directions must be distinct",
        weightedOption: "Appearance weighted lighting direction is invalid",
      },
    ),
  };
}

function isFixedSelection<Value>(
  selection: AppearanceSelection<Value>,
  expected: Value,
): boolean {
  return selection.mode === "fixed" && selection.value === expected;
}

function validateTreatmentCompatibility(recipe: AppearanceRecipeV2): void {
  if (recipe.compatibility === "legacy-v1") {
    if (
      recipe.colors.mode === "random-pair" ||
      recipe.colors.mode === "vivid-random-pair" ||
      (recipe.colors.mode === "palette" &&
        new Set(recipe.colors.colors).size !== recipe.colors.colors.length)
    ) {
      throw new Error("Legacy appearance recipe colors are invalid");
    }
    if (
      recipe.gradient.colorSource !== "resolved-pair" ||
      !isFixedSelection(recipe.gradient.scope, "repeated") ||
      !isFixedSelection(recipe.gradient.direction, "top-to-bottom") ||
      !isFixedSelection(recipe.lighting.mode, "facet") ||
      !isFixedSelection(recipe.lighting.strength, "subtle") ||
      !isFixedSelection(recipe.lighting.direction, "upper-left")
    ) {
      throw new Error("Legacy appearance recipe treatment is invalid");
    }
    return;
  }
  if (recipe.gradient.colorSource !== "full-palette") {
    throw new Error("Native appearance recipes require full-palette gradients");
  }
}

export function parseAppearanceRecipeV2(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): AppearanceRecipeV2 {
  const recipe = requireRecord(
    value,
    [
      "colors",
      "compatibility",
      "fill",
      "font",
      "gradient",
      "lighting",
      "variation",
      "varyBy",
      "version",
    ],
    "Appearance recipe V2 has invalid fields",
  );
  const variation = appearanceVariationSchema.safeParse(recipe.variation);
  const varyBy = appearanceVariationScopeSchema.safeParse(recipe.varyBy);
  if (recipe.version !== 2 || !variation.success || !varyBy.success) {
    throw new Error("Appearance recipe V2 is invalid");
  }
  const parsed: AppearanceRecipeV2 = {
    version: 2,
    compatibility: supportedValue(
      recipe.compatibility,
      APPEARANCE_RECIPE_COMPATIBILITIES,
      "Appearance recipe V2 is invalid",
    ),
    variation: variation.data,
    varyBy: varyBy.data,
    colors: parseColorsV2(recipe.colors),
    fill: parseFillSelection(recipe.fill, catalog),
    font: parseFontSelection(recipe.font, catalog),
    gradient: parseGradientV2(recipe.gradient),
    lighting: parseLightingV2(recipe.lighting),
  };
  validateTreatmentCompatibility(parsed);
  return parsed;
}

function parseDesign(value: ValidationInput, catalog: AppearanceCatalog): CustomDesignV1 {
  const design = requireRecord(
    value,
    ["id", "name", "recipe"],
    "Appearance design has invalid fields",
  );
  const id = uuidV4Schema.safeParse(design.id);
  if (!id.success) {
    throw new Error("Appearance design id must be a UUID v4");
  }
  const parsedName = designNameSchema.safeParse(design.name);
  if (!parsedName.success) {
    throw new Error("Appearance design name is invalid");
  }
  const name = parsedName.data.trim();
  if (name.length < 1 || name.length > MAX_DESIGN_NAME_LENGTH) {
    throw new Error("Appearance design name is invalid");
  }
  return {
    id: id.data.toLowerCase(),
    name,
    recipe: parseAppearanceRecipe(design.recipe, catalog),
  };
}

function parseDesignV2(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): CustomDesignV2 {
  const design = requireRecord(
    value,
    ["id", "name", "recipe"],
    "Appearance design has invalid fields",
  );
  const id = uuidV4Schema.safeParse(design.id);
  if (!id.success) {
    throw new Error("Appearance design id must be a UUID v4");
  }
  const parsedName = designNameSchema.safeParse(design.name);
  if (!parsedName.success) {
    throw new Error("Appearance design name is invalid");
  }
  const name = parsedName.data.trim();
  if (name.length < 1 || name.length > MAX_DESIGN_NAME_LENGTH) {
    throw new Error("Appearance design name is invalid");
  }
  return {
    id: id.data.toLowerCase(),
    name,
    recipe: parseAppearanceRecipeV2(design.recipe, catalog),
  };
}

function parseReference(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): DesignReference {
  const reference = requireRecord(
    value,
    ["id", "source"],
    "Appearance design reference is invalid",
  );
  if (reference.source === "builtin") {
    return {
      source: "builtin",
      id: supportedId(
        reference.id,
        catalog.builtinStyleIds,
        "Appearance built-in style id is not supported",
      ),
    };
  }
  const id = uuidV4Schema.safeParse(reference.id);
  if (reference.source !== "custom" || !id.success) {
    throw new Error("Appearance design reference is invalid");
  }
  return { source: "custom", id: id.data.toLowerCase() };
}

function assertOwnedReference(
  reference: DesignReference | null,
  designIds: ReadonlySet<string>,
): void {
  if (reference?.source === "custom" && !designIds.has(reference.id)) {
    throw new Error("Appearance custom design reference is missing");
  }
}

function parseAssignments(
  value: ValidationInput,
  catalog: AppearanceCatalog,
  designIds: ReadonlySet<string>,
): AppearanceProfileV1["assignments"] {
  const assignments = requireRecord(
    value,
    ["all", "overrides"],
    "Appearance assignments have invalid fields",
  );
  const all =
    assignments.all === null
      ? null
      : parseReference(assignments.all, catalog);
  if (!isRecord(assignments.overrides)) {
    throw new Error("Appearance overrides are invalid");
  }
  const overrides: AppearanceProfileV1["assignments"]["overrides"] = {};
  for (const [target, reference] of Object.entries(assignments.overrides)) {
    const parsedTarget = appearanceTargetSchema.safeParse(target);
    if (!parsedTarget.success) {
      throw new Error("Appearance override target is not supported");
    }
    overrides[parsedTarget.data] = parseReference(reference, catalog);
  }

  assertOwnedReference(all, designIds);
  for (const reference of Object.values(overrides)) {
    assertOwnedReference(reference, designIds);
  }
  return { all, overrides };
}

export function parseAppearanceProfile(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): AppearanceProfileV1 {
  const profile = requireRecord(
    value,
    ["assignments", "designs", "version"],
    "Appearance profile has invalid fields",
  );
  if (
    profile.version !== 1 ||
    !Array.isArray(profile.designs) ||
    profile.designs.length > MAX_DESIGNS
  ) {
    if (Array.isArray(profile.designs) && profile.designs.length > MAX_DESIGNS) {
      throw new Error("Appearance profile must contain at most ten designs");
    }
    throw new Error("Appearance profile is invalid");
  }
  const designs = profile.designs.map((design) => parseDesign(design, catalog));
  const designIds = new Set(designs.map(({ id }) => id));
  if (designIds.size !== designs.length) {
    throw new Error("Appearance design ids must be unique");
  }

  return {
    version: 1,
    designs,
    assignments: parseAssignments(profile.assignments, catalog, designIds),
  };
}

export function parseAppearanceProfileV2(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): AppearanceProfileV2 {
  const profile = requireRecord(
    value,
    ["assignments", "designs", "version"],
    "Appearance profile V2 has invalid fields",
  );
  if (
    profile.version !== 2 ||
    !Array.isArray(profile.designs) ||
    profile.designs.length > MAX_DESIGNS
  ) {
    if (Array.isArray(profile.designs) && profile.designs.length > MAX_DESIGNS) {
      throw new Error("Appearance profile must contain at most ten designs");
    }
    throw new Error("Appearance profile V2 is invalid");
  }
  const designs = profile.designs.map((design) =>
    parseDesignV2(design, catalog),
  );
  const designIds = new Set(designs.map(({ id }) => id));
  if (designIds.size !== designs.length) {
    throw new Error("Appearance design ids must be unique");
  }

  return {
    version: 2,
    designs,
    assignments: parseAssignments(profile.assignments, catalog, designIds),
  };
}

export function parseGuildAppearanceProfile(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): GuildAppearanceProfileV1 {
  const guildProfile = requireRecord(
    value,
    ["assignments", "designs", "mode", "version"],
    "Guild appearance profile has invalid fields",
  );
  if (
    guildProfile.mode !== "off" &&
    guildProfile.mode !== "default" &&
    guildProfile.mode !== "enforced"
  ) {
    throw new Error("Guild appearance mode is invalid");
  }
  const profile = parseAppearanceProfile(
    {
      version: guildProfile.version,
      designs: guildProfile.designs,
      assignments: guildProfile.assignments,
    },
    catalog,
  );
  return { ...profile, mode: guildProfile.mode };
}

export function parseGuildAppearanceProfileV2(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): GuildAppearanceProfileV2 {
  const guildProfile = requireRecord(
    value,
    ["assignments", "designs", "mode", "version"],
    "Guild appearance profile V2 has invalid fields",
  );
  if (
    guildProfile.mode !== "off" &&
    guildProfile.mode !== "default" &&
    guildProfile.mode !== "enforced"
  ) {
    throw new Error("Guild appearance mode is invalid");
  }
  const profile = parseAppearanceProfileV2(
    {
      version: guildProfile.version,
      designs: guildProfile.designs,
      assignments: guildProfile.assignments,
    },
    catalog,
  );
  return { ...profile, mode: guildProfile.mode };
}
