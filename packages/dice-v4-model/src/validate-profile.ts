import {
  isMaterialFormCompatibleV4,
  isPolyhedralFormImplementedForTargetV4,
} from "./compatibility";
import {
  DICE_VIEW_AZIMUTH_MODES_V4,
  DICE_VIEW_AZIMUTH_RANGE_V4,
  DICE_VIEW_ELEVATION_RANGE_V4,
  DICE_VIEW_MODES_V4,
} from "./dice-view-preferences";
import {
  APPEARANCE_PALETTE_COLOR_RANGE_V3,
  APPEARANCE_SELECTION_WEIGHT_RANGE_V3,
  MAX_APPEARANCE_DESIGN_NAME_CHARACTERS_V3,
  MAX_APPEARANCE_DESIGNS_V3,
  MAX_BUILTIN_APPEARANCE_STYLES_V3,
  MAX_MATERIAL_SELECTION_OPTIONS_V3,
  MAX_PROFILE_JSON_CHARACTERS_V3,
  MAX_TOTAL_APPEARANCE_SELECTION_WEIGHT_V3,
} from "./limits";
import { canonicalJsonV4 } from "./random";
import {
  APPEARANCE_COLOR_DISTRIBUTIONS_V3,
  APPEARANCE_FORM_POLICIES_V3,
  APPEARANCE_RANDOMIZATION_POLICIES_V3,
  APPEARANCE_TARGETS_V4,
  APPEARANCE_VARIATIONS_V3,
  APPEARANCE_VARIATION_SCOPES_V3,
  ENGRAVING_FINISHES_V4,
  FONT_IDS_V4,
  GRADIENT_SCOPES_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_MODES_V4,
  LIGHTING_STRENGTHS_V4,
  LINEAR_DIRECTIONS_V4,
  POLYHEDRAL_FORMS_V4,
} from "./registries";
import type {
  AppearanceAssignmentsV3,
  AppearanceColorsV3,
  AppearanceDesignReferenceV3,
  AppearanceMaterialV4,
  AppearanceProfileV3,
  AppearanceProfileV4,
  AppearanceRecipeV3,
  AppearanceSelection,
  AppearanceTargetV4,
  PolyhedralFormV4,
  AppearanceValidationCatalogV3,
  CustomAppearanceDesignV3,
  DiceViewAzimuthV4,
  DiceViewPreferencesV4,
  FontIdV4,
  GuildAppearanceProfileV3,
  GuildAppearanceProfileV4,
} from "./types";
import { parseAppearanceMaterialV4 } from "./validate-render-request";
import {
  hasExactKeys,
  hexColor,
  isRecord,
  requireExactRecord,
  supportedValue,
} from "./validation";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATALOG_ID = /^[a-z][a-z0-9-]{0,63}$/;
type SelectionParser<Value> = (value: unknown, path: string) => Value;

function parseWeight(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < APPEARANCE_SELECTION_WEIGHT_RANGE_V3.minimum ||
    value > APPEARANCE_SELECTION_WEIGHT_RANGE_V3.maximum
  ) {
    throw new Error("Appearance selection weight must be from 1 through 1000");
  }
  return value;
}

function validateTotalWeight(options: readonly { weight: number }[]): void {
  if (
    options.reduce((sum, option) => sum + option.weight, 0) >
    MAX_TOTAL_APPEARANCE_SELECTION_WEIGHT_V3
  ) {
    throw new Error("Appearance selection weights must total at most 10000");
  }
}

function parseSelection<Value>(
  value: unknown,
  parseValue: SelectionParser<Value>,
  maximumOptions: number,
  label: string,
): AppearanceSelection<Value> {
  if (!isRecord(value) || typeof value.mode !== "string") {
    throw new Error(`${label} selection is invalid`);
  }
  if (value.mode === "fixed") {
    if (!hasExactKeys(value, ["mode", "value"])) {
      throw new Error(`${label} selection is invalid`);
    }
    return { mode: "fixed", value: parseValue(value.value, label) };
  }
  if (value.mode === "allowlist") {
    if (
      !hasExactKeys(value, ["mode", "values"]) ||
      !Array.isArray(value.values) ||
      value.values.length < 1 ||
      value.values.length > maximumOptions
    ) {
      throw new Error(`${label} selection is invalid`);
    }
    const values = value.values.map((option) => parseValue(option, label));
    if (new Set(values.map(canonicalJsonV4)).size !== values.length) {
      throw new Error(`${label} values must be distinct`);
    }
    return { mode: "allowlist", values };
  }
  if (
    value.mode !== "weighted" ||
    !hasExactKeys(value, ["mode", "options"]) ||
    !Array.isArray(value.options) ||
    value.options.length < 1 ||
    value.options.length > maximumOptions
  ) {
    throw new Error(`${label} selection is invalid`);
  }
  const options = value.options.map((option) => {
    const parsed = requireExactRecord(
      option,
      ["value", "weight"],
      `${label} weighted option is invalid`,
    );
    return {
      value: parseValue(parsed.value, label),
      weight: parseWeight(parsed.weight),
    };
  });
  if (
    new Set(options.map((option) => canonicalJsonV4(option.value))).size !==
    options.length
  ) {
    throw new Error(`${label} values must be distinct`);
  }
  validateTotalWeight(options);
  return { mode: "weighted", options };
}

function parseStringSelection<Value extends string>(
  value: unknown,
  supported: readonly Value[],
  label: string,
): AppearanceSelection<Value> {
  return parseSelection(
    value,
    (option) =>
      supportedValue(option, supported, `${label} value is not supported`),
    supported.length,
    label,
  );
}

function parseColors(value: unknown): AppearanceColorsV3 {
  if (!isRecord(value) || typeof value.mode !== "string") {
    throw new Error("Appearance colors are invalid");
  }
  if (
    value.mode === "solid" ||
    value.mode === "tonal" ||
    value.mode === "random"
  ) {
    if (!hasExactKeys(value, ["mode", "primary"])) {
      throw new Error("Appearance colors are invalid");
    }
    try {
      return { mode: value.mode, primary: hexColor(value.primary, "color") };
    } catch {
      throw new Error("Appearance colors are invalid");
    }
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
  if (
    value.mode !== "palette" ||
    !hasExactKeys(value, ["colors", "mode"]) ||
    !Array.isArray(value.colors) ||
    value.colors.length < APPEARANCE_PALETTE_COLOR_RANGE_V3.minimum ||
    value.colors.length > APPEARANCE_PALETTE_COLOR_RANGE_V3.maximum
  ) {
    throw new Error("Appearance colors are invalid");
  }
  let colors: string[];
  try {
    colors = value.colors.map((color) => hexColor(color, "color"));
  } catch {
    throw new Error("Appearance colors are invalid");
  }
  if (new Set(colors).size < 2) {
    throw new Error("Appearance colors are invalid");
  }
  return { mode: "palette", colors };
}

function parseMaterialSelection(
  value: unknown,
): AppearanceSelection<AppearanceMaterialV4> {
  return parseSelection(
    value,
    parseAppearanceMaterialV4,
    MAX_MATERIAL_SELECTION_OPTIONS_V3,
    "Appearance recipe material",
  );
}

function selectionValues<Value>(selection: AppearanceSelection<Value>): Value[] {
  if (selection.mode === "fixed") return [selection.value];
  if (selection.mode === "allowlist") return selection.values;
  return selection.options.map((option) => option.value);
}

function validateFaceLocalGradientForms(
  materials: AppearanceSelection<AppearanceMaterialV4>,
  forms: AppearanceSelection<PolyhedralFormV4>,
  scopes: AppearanceRecipeV3["gradient"]["scope"],
): void {
  const hasRepeatedGradient = selectionValues(scopes).includes("repeated");
  const hasClassicGradient = selectionValues(materials).some(
    (material) =>
      material.family === "classic" && material.treatment === "gradient",
  );
  const hasNonstandardClassicForm = selectionValues(forms).some(
    (form) =>
      form !== "standard" && isMaterialFormCompatibleV4("classic", form),
  );
  if (
    hasRepeatedGradient &&
    hasClassicGradient &&
    hasNonstandardClassicForm
  ) {
    throw new Error(
      "Appearance repeated gradient requires standard polyhedral form",
    );
  }
}

function validateMaterialForms(
  materials: AppearanceSelection<AppearanceMaterialV4>,
  forms: AppearanceSelection<PolyhedralFormV4>,
): void {
  const materialValues = selectionValues(materials);
  const formValues = selectionValues(forms);
  if (
    materialValues.some(
      (material) =>
        !formValues.some((form) =>
          isMaterialFormCompatibleV4(material.family, form),
        ),
    )
  ) {
    throw new Error(
      "Appearance material selection has no compatible polyhedral form",
    );
  }
  if (
    formValues.some(
      (form) =>
        !materialValues.some((material) =>
          isMaterialFormCompatibleV4(material.family, form),
        ),
    )
  ) {
    throw new Error("Appearance form selection has no compatible material");
  }
}

export function parseAppearanceRecipeV3(value: unknown): AppearanceRecipeV3 {
  const recipe = requireExactRecord(
    value,
    [
      ...(isRecord(value) && Object.hasOwn(value, "colorDistribution")
        ? ["colorDistribution"]
        : []),
      "colors",
      "engraving",
      "font",
      "form",
      "gradient",
      "lighting",
      "material",
      ...(isRecord(value) && Object.hasOwn(value, "randomization")
        ? ["randomization"]
        : []),
      "variation",
      "varyBy",
      "version",
    ],
    "Appearance recipe V3 has invalid fields",
  );
  if (recipe.version !== 3) {
    throw new Error("Appearance recipe version must be 3");
  }
  const form = requireExactRecord(
    recipe.form,
    [
      "other",
      ...(isRecord(recipe.form) && Object.hasOwn(recipe.form, "policy")
        ? ["policy"]
        : []),
      "polyhedral",
    ],
    "Appearance form has invalid fields",
  );
  if (form.other !== "sphere") {
    throw new Error("Appearance Other form must be sphere");
  }
  const gradient = requireExactRecord(
    recipe.gradient,
    ["direction", "scope"],
    "Appearance gradient has invalid fields",
  );
  const lighting = requireExactRecord(
    recipe.lighting,
    ["direction", "mode", "strength"],
    "Appearance lighting has invalid fields",
  );
  const parsed: AppearanceRecipeV3 = {
    version: 3,
    variation: supportedValue(
      recipe.variation,
      APPEARANCE_VARIATIONS_V3,
      "Appearance variation is not supported",
    ),
    varyBy: supportedValue(
      recipe.varyBy,
      APPEARANCE_VARIATION_SCOPES_V3,
      "Appearance variation scope is not supported",
    ),
    ...(Object.hasOwn(recipe, "randomization")
      ? {
          randomization: supportedValue(
            recipe.randomization,
            APPEARANCE_RANDOMIZATION_POLICIES_V3,
            "Appearance randomization policy is not supported",
          ),
        }
      : {}),
    ...(Object.hasOwn(recipe, "colorDistribution")
      ? {
          colorDistribution: supportedValue(
            recipe.colorDistribution,
            APPEARANCE_COLOR_DISTRIBUTIONS_V3,
            "Appearance color distribution is not supported",
          ),
        }
      : {}),
    colors: parseColors(recipe.colors),
    material: parseMaterialSelection(recipe.material),
    form: {
      ...(Object.hasOwn(form, "policy")
        ? {
            policy: supportedValue(
              form.policy,
              APPEARANCE_FORM_POLICIES_V3,
              "Appearance form policy is not supported",
            ),
          }
        : {}),
      polyhedral: parseStringSelection(
        form.polyhedral,
        POLYHEDRAL_FORMS_V4,
        "Appearance form",
      ),
      other: "sphere",
    },
    font: parseStringSelection(recipe.font, FONT_IDS_V4, "Appearance font"),
    engraving: parseStringSelection(
      recipe.engraving,
      ENGRAVING_FINISHES_V4,
      "Appearance engraving",
    ),
    gradient: {
      scope: parseStringSelection(
        gradient.scope,
        GRADIENT_SCOPES_V4,
        "Appearance gradient scope",
      ),
      direction: parseStringSelection(
        gradient.direction,
        LINEAR_DIRECTIONS_V4,
        "Appearance gradient direction",
      ),
    },
    lighting: {
      mode: parseStringSelection(
        lighting.mode,
        LIGHTING_MODES_V4,
        "Appearance lighting mode",
      ),
      strength: parseStringSelection(
        lighting.strength,
        LIGHTING_STRENGTHS_V4,
        "Appearance lighting strength",
      ),
      direction: parseStringSelection(
        lighting.direction,
        LIGHTING_DIRECTIONS_V4,
        "Appearance lighting direction",
      ),
    },
  };
  if (
    parsed.randomization === "one-palette-color-v1" &&
    parsed.colors.mode !== "palette"
  ) {
    throw new Error("One-color palette randomization requires a palette");
  }
  if (
    parsed.colorDistribution === "one-per-die" &&
    parsed.colors.mode !== "palette"
  ) {
    throw new Error("One-per-die color distribution requires a palette");
  }
  if (parsed.form.policy === undefined) {
    validateMaterialForms(parsed.material, parsed.form.polyhedral);
    validateFaceLocalGradientForms(
      parsed.material,
      parsed.form.polyhedral,
      parsed.gradient.scope,
    );
  }
  return parsed;
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

function parseDesign(value: unknown): CustomAppearanceDesignV3 {
  const design = requireExactRecord(
    value,
    ["id", "name", "recipe"],
    "Appearance design has invalid fields",
  );
  if (typeof design.id !== "string" || !UUID_V4.test(design.id)) {
    throw new Error("Appearance design id must be a UUID v4");
  }
  if (typeof design.name !== "string") {
    throw new Error("Appearance design name is invalid");
  }
  const name = design.name.trim();
  if (
    name.length < 1 ||
    name.length > MAX_APPEARANCE_DESIGN_NAME_CHARACTERS_V3 ||
    containsControlCharacter(name)
  ) {
    throw new Error("Appearance design name is invalid");
  }
  return {
    id: design.id.toLowerCase(),
    name,
    recipe: parseAppearanceRecipeV3(design.recipe),
  };
}

function builtinIds(catalog: AppearanceValidationCatalogV3): ReadonlySet<string> {
  if (
    !Array.isArray(catalog.builtinStyleIds) ||
    catalog.builtinStyleIds.length < 1 ||
    catalog.builtinStyleIds.length > MAX_BUILTIN_APPEARANCE_STYLES_V3 ||
    catalog.builtinStyleIds.some(
      (id) => typeof id !== "string" || !CATALOG_ID.test(id),
    ) ||
    new Set(catalog.builtinStyleIds).size !== catalog.builtinStyleIds.length
  ) {
    throw new Error("Appearance validation catalog is invalid");
  }
  return new Set(catalog.builtinStyleIds);
}

function parseReference(
  value: unknown,
  supportedBuiltins: ReadonlySet<string>,
): AppearanceDesignReferenceV3 {
  const reference = requireExactRecord(
    value,
    ["id", "source"],
    "Appearance design reference is invalid",
  );
  if (reference.source === "builtin") {
    if (
      typeof reference.id !== "string" ||
      !supportedBuiltins.has(reference.id)
    ) {
      throw new Error("Appearance built-in style id is not supported");
    }
    return { source: "builtin", id: reference.id };
  }
  if (
    reference.source !== "custom" ||
    typeof reference.id !== "string" ||
    !UUID_V4.test(reference.id)
  ) {
    throw new Error("Appearance design reference is invalid");
  }
  return { source: "custom", id: reference.id.toLowerCase() };
}

function requireOwnedReference(
  reference: AppearanceDesignReferenceV3 | null,
  designIds: ReadonlySet<string>,
): void {
  if (reference?.source === "custom" && !designIds.has(reference.id)) {
    throw new Error("Appearance custom design reference is missing");
  }
}

function parseAssignments(
  value: unknown,
  supportedBuiltins: ReadonlySet<string>,
  designIds: ReadonlySet<string>,
): AppearanceAssignmentsV3 {
  const assignments = requireExactRecord(
    value,
    ["all", "overrides"],
    "Appearance assignments have invalid fields",
  );
  const all =
    assignments.all === null
      ? null
      : parseReference(assignments.all, supportedBuiltins);
  if (!isRecord(assignments.overrides)) {
    throw new Error("Appearance overrides are invalid");
  }
  const overrides: AppearanceAssignmentsV3["overrides"] = {};
  for (const [target, reference] of Object.entries(assignments.overrides)) {
    if (!APPEARANCE_TARGETS_V4.includes(target as AppearanceTargetV4)) {
      throw new Error("Appearance override target is not supported");
    }
    overrides[target as keyof typeof overrides] = parseReference(
      reference,
      supportedBuiltins,
    );
  }
  requireOwnedReference(all, designIds);
  for (const reference of Object.values(overrides)) {
    requireOwnedReference(reference, designIds);
  }
  return { all, overrides };
}

function validateAssignedCustomForms(
  designs: readonly CustomAppearanceDesignV3[],
  assignments: AppearanceAssignmentsV3,
): void {
  const designsById = new Map(designs.map((design) => [design.id, design]));
  for (const target of APPEARANCE_TARGETS_V4) {
    if (target === "other") continue;
    const reference = assignments.overrides[target] ?? assignments.all;
    if (reference?.source !== "custom") continue;
    const design = designsById.get(reference.id);
    if (design === undefined) {
      throw new Error("Appearance custom design reference is missing");
    }
    if (
      design.recipe.form.policy === undefined &&
      selectionValues(design.recipe.form.polyhedral).some(
        (form) =>
          !isPolyhedralFormImplementedForTargetV4(
            target,
            form,
            "canvaskit-v4-r32",
          ),
      )
    ) {
      throw new Error(
        `Appearance custom design form is not implemented for ${target}`,
      );
    }
  }
}

function parseDiceViewAzimuthV4(
  value: unknown,
  path: string,
): DiceViewAzimuthV4 {
  const azimuth = requireExactRecord(
    value,
    ["customDegrees", "mode"],
    `${path} has invalid fields`,
  );
  if (
    !DICE_VIEW_AZIMUTH_MODES_V4.includes(
      azimuth.mode as (typeof DICE_VIEW_AZIMUTH_MODES_V4)[number],
    )
  ) {
    throw new Error(`${path}.mode is invalid`);
  }
  if (
    typeof azimuth.customDegrees !== "number" ||
    !Number.isSafeInteger(azimuth.customDegrees) ||
    azimuth.customDegrees < DICE_VIEW_AZIMUTH_RANGE_V4.minimum ||
    azimuth.customDegrees > DICE_VIEW_AZIMUTH_RANGE_V4.maximum ||
    azimuth.customDegrees % DICE_VIEW_AZIMUTH_RANGE_V4.step !== 0
  ) {
    throw new Error(`${path}.customDegrees must be from -45 through 45 by 5`);
  }
  return {
    mode: azimuth.mode as DiceViewAzimuthV4["mode"],
    customDegrees: azimuth.customDegrees,
  };
}

export function parseDiceViewPreferencesV4(
  value: unknown,
): DiceViewPreferencesV4 {
  const diceView = requireExactRecord(
    value,
    ["azimuth", "elevationDegrees", "mode"],
    "Dice view preferences V4 have invalid fields",
  );
  if (
    typeof diceView.elevationDegrees !== "number" ||
    !Number.isSafeInteger(diceView.elevationDegrees) ||
    diceView.elevationDegrees < DICE_VIEW_ELEVATION_RANGE_V4.minimum ||
    diceView.elevationDegrees > DICE_VIEW_ELEVATION_RANGE_V4.maximum
  ) {
    throw new Error("Dice view elevationDegrees must be from 30 through 55");
  }
  if (
    !DICE_VIEW_MODES_V4.includes(
      diceView.mode as (typeof DICE_VIEW_MODES_V4)[number],
    )
  ) {
    throw new Error("Dice view mode is invalid");
  }
  const azimuth = requireExactRecord(
    diceView.azimuth,
    ["all", "overrides"],
    "Dice view azimuth has invalid fields",
  );
  if (!isRecord(azimuth.overrides)) {
    throw new Error("Dice view azimuth overrides are invalid");
  }
  const overrides: DiceViewPreferencesV4["azimuth"]["overrides"] = {};
  for (const [target, override] of Object.entries(azimuth.overrides)) {
    if (!APPEARANCE_TARGETS_V4.includes(target as AppearanceTargetV4)) {
      throw new Error("Dice view azimuth override target is not supported");
    }
    overrides[target as AppearanceTargetV4] = parseDiceViewAzimuthV4(
      override,
      `Dice view azimuth override ${target}`,
    );
  }
  return {
    elevationDegrees: diceView.elevationDegrees,
    mode: diceView.mode as DiceViewPreferencesV4["mode"],
    azimuth: {
      all: parseDiceViewAzimuthV4(azimuth.all, "Dice view azimuth all"),
      overrides,
    },
  };
}

function parseProfileContents(
  profile: Record<string, unknown>,
  catalog: AppearanceValidationCatalogV3,
): Pick<AppearanceProfileV3, "assignments" | "designs"> {
  if (!Array.isArray(profile.designs)) {
    throw new Error("Appearance profile designs must be an array");
  }
  if (profile.designs.length > MAX_APPEARANCE_DESIGNS_V3) {
    throw new Error("Appearance profile must contain at most ten designs");
  }
  const designs = profile.designs.map(parseDesign);
  const designIds = new Set(designs.map((design) => design.id));
  if (designIds.size !== designs.length) {
    throw new Error("Appearance design ids must be unique");
  }
  const assignments = parseAssignments(
    profile.assignments,
    builtinIds(catalog),
    designIds,
  );
  validateAssignedCustomForms(designs, assignments);
  return { designs, assignments };
}

function validateProfileSize(
  profile: AppearanceProfileV3 | AppearanceProfileV4,
): void {
  if (JSON.stringify(profile).length > MAX_PROFILE_JSON_CHARACTERS_V3) {
    throw new Error("Appearance profile exceeds 65536 characters");
  }
}

export function parseAppearanceProfileV3(
  value: unknown,
  catalog: AppearanceValidationCatalogV3,
): AppearanceProfileV3 {
  const profile = requireExactRecord(
    value,
    ["assignments", "designs", "version"],
    "Appearance profile V3 has invalid fields",
  );
  if (profile.version !== 3) {
    throw new Error("Appearance profile version must be 3");
  }
  const parsed: AppearanceProfileV3 = {
    version: 3,
    ...parseProfileContents(profile, catalog),
  };
  validateProfileSize(parsed);
  return parsed;
}

export function validateAppearanceProfileFontsV4(
  profile: Pick<AppearanceProfileV4, "designs">,
  supportedFontIds: readonly FontIdV4[],
): void {
  const supported = new Set<FontIdV4>(supportedFontIds);
  for (const { recipe } of profile.designs) {
    if (selectionValues(recipe.font).some((fontId) => !supported.has(fontId))) {
      throw new Error("Appearance profile font is not supported by the active catalog");
    }
  }
}

export function parseAppearanceProfileV4(
  value: unknown,
  catalog: AppearanceValidationCatalogV3,
): AppearanceProfileV4 {
  const profile = requireExactRecord(
    value,
    ["assignments", "designs", "diceView", "version"],
    "Appearance profile V4 has invalid fields",
  );
  if (profile.version !== 4) {
    throw new Error("Appearance profile version must be 4");
  }
  const parsed: AppearanceProfileV4 = {
    version: 4,
    ...parseProfileContents(profile, catalog),
    diceView: parseDiceViewPreferencesV4(profile.diceView),
  };
  validateProfileSize(parsed);
  return parsed;
}

function parseGuildMode(value: unknown): GuildAppearanceProfileV3["mode"] {
  if (value !== "off" && value !== "default" && value !== "enforced") {
    throw new Error("Guild appearance mode is invalid");
  }
  return value;
}

export function parseGuildAppearanceProfileV3(
  value: unknown,
  catalog: AppearanceValidationCatalogV3,
): GuildAppearanceProfileV3 {
  const guild = requireExactRecord(
    value,
    ["assignments", "designs", "mode", "version"],
    "Guild appearance profile V3 has invalid fields",
  );
  const profile = parseAppearanceProfileV3(
    {
      version: guild.version,
      designs: guild.designs,
      assignments: guild.assignments,
    },
    catalog,
  );
  const parsed: GuildAppearanceProfileV3 = {
    ...profile,
    mode: parseGuildMode(guild.mode),
  };
  validateProfileSize(parsed);
  return parsed;
}

export function parseGuildAppearanceProfileV4(
  value: unknown,
  catalog: AppearanceValidationCatalogV3,
): GuildAppearanceProfileV4 {
  const guild = requireExactRecord(
    value,
    ["assignments", "designs", "diceView", "mode", "version"],
    "Guild appearance profile V4 has invalid fields",
  );
  const profile = parseAppearanceProfileV4(
    {
      version: guild.version,
      designs: guild.designs,
      assignments: guild.assignments,
      diceView: guild.diceView,
    },
    catalog,
  );
  const parsed: GuildAppearanceProfileV4 = {
    ...profile,
    mode: parseGuildMode(guild.mode),
  };
  validateProfileSize(parsed);
  return parsed;
}
