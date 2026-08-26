import * as z from "zod";
import {
  APPEARANCE_PALETTE_COLOR_RANGE_V3,
  APPEARANCE_PERCENTAGE_RANGE_V4,
  APPEARANCE_SELECTION_WEIGHT_RANGE_V3,
  APPEARANCE_TARGETS_V4,
  APPEARANCE_TEXTURE_SCALE_RANGE_V4,
  APPEARANCE_VARIATIONS_V3,
  APPEARANCE_VARIATION_SCOPES_V3,
  CLASSIC_FINISHES_V4,
  CLASSIC_OPACITIES_V4,
  CLASSIC_TREATMENTS_V4,
  ELEMENTAL_STYLES_V4,
  ENGRAVING_FINISHES_V4,
  FANTASY_ESSENCES_V4,
  FANTASY_FINISHES_V4,
  FONT_IDS_V4,
  GEMSTONE_FINISHES_V4,
  GEMSTONE_STYLES_V4,
  GLASS_FINISHES_V4,
  GLASS_STYLES_V4,
  GRADIENT_SCOPES_V4,
  HOLLOW_METAL_CONSTRUCTIONS_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_MODES_V4,
  LIGHTING_STRENGTHS_V4,
  LINEAR_DIRECTIONS_V4,
  LIQUID_CORE_STYLES_V4,
  MATERIAL_FAMILIES_V4,
  MAX_APPEARANCE_DESIGN_NAME_CHARACTERS_V3,
  MAX_APPEARANCE_DESIGNS_V3,
  MAX_BUILTIN_APPEARANCE_STYLES_V3,
  MAX_MATERIAL_SELECTION_OPTIONS_V3,
  MAX_PROFILE_JSON_CHARACTERS_V3,
  MAX_TOTAL_APPEARANCE_SELECTION_WEIGHT_V3,
  METALS_V4,
  METAL_FINISHES_V4,
  PAINT_STYLES_V4,
  PATTERN_IDS_V4,
  POLYHEDRAL_FORMS_V4,
  RESIN_FINISHES_V4,
  RESIN_INCLUSIONS_V4,
  SHARP_RESIN_STYLES_V4,
  STONE_FINISHES_V4,
  STONE_STYLES_V4,
  WOOD_FINISHES_V4,
  WOOD_STYLES_V4,
  isMaterialFormCompatibleV4,
  isPolyhedralFormImplementedForTargetV4,
  parseAppearanceMaterialV4,
  parseAppearanceProfileV4,
  parseAppearanceRecipeV3,
  parseGuildAppearanceProfileV4,
  parseDiceViewPreferencesV4,
  type AppearanceProfileV4,
  type AppearanceRecipeV3,
  type AppearanceTargetV4,
  type GuildAppearanceProfileV4,
  type DiceViewPreferencesV4,
  type MaterialFamilyV4,
  type RenderFormV4,
} from "@dice-witch/dice-v4-model";
import type {
  AppearanceCatalogV3,
  AppearancePreviewV4,
  AppearanceProfileResource,
} from "../types/appearance";
import { AppearanceApiError } from "./appearance-api-error";
import { appConfig } from "./config";
export { PERSONAL_APPEARANCE_BOOTSTRAP_V4_QUERY_KEY } from "./appearance-query";

const CATALOG_ROOT_KEYS = [
  "bounds",
  "collectorStyleIds",
  "colorModes",
  "colorSchemeStyleIds",
  "completeLookStyleIds",
  "defaultStyleId",
  "editorDefaults",
  "engravingFinishes",
  "featuredPatternIds",
  "featuredStyleIds",
  "fonts",
  "forms",
  "gradient",
  "lighting",
  "materials",
  "patterns",
  "selectionModes",
  "styles",
  "targets",
  "variationScopes",
  "variations",
  "version",
] as const;
const STYLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const GUILD_ID = /^[1-9][0-9]{16,19}$/;
const PREVIEW_STATES = ["normal", "critical-success", "critical-failure"] as const;
const COLOR_MODES = [
  "solid",
  "tonal",
  "random",
  "palette",
  "random-pair",
  "vivid-random-pair",
] as const;
const SELECTION_MODES = ["fixed", "allowlist", "weighted"] as const;
const R34_PUBLIC_FONT_IDS_V4 = FONT_IDS_V4.filter(
  (fontId) => fontId !== "jetbrains-mono",
);
const R37_PUBLIC_FONT_IDS_V4 = R34_PUBLIC_FONT_IDS_V4.map((fontId) => {
  if (fontId === "liberation-sans") return "barlow-condensed";
  if (fontId === "barlow-condensed") return "jetbrains-mono";
  return fontId;
});
const PUBLIC_FONT_CATALOGS_V3 = [
  R34_PUBLIC_FONT_IDS_V4,
  R37_PUBLIC_FONT_IDS_V4,
] as const;
const MAX_LABEL_CHARACTERS = 80;
const MAX_DESCRIPTION_CHARACTERS = 240;
const MAX_PREVIEW_DIMENSION = 2_000;
const MAX_PREVIEW_BASE64_CHARACTERS = 12_000_000;

type Range = Readonly<{ minimum: number; maximum: number; step: number }>;
type MaterialDefinition = Readonly<{
  options: Readonly<Record<string, readonly string[]>>;
  ranges: Readonly<Record<string, Range>>;
  styleDefaults?: readonly string[];
}>;

const MATERIAL_DEFINITIONS = {
  classic: {
    options: {
      treatments: CLASSIC_TREATMENTS_V4,
      finishes: CLASSIC_FINISHES_V4,
      opacities: CLASSIC_OPACITIES_V4,
    },
    ranges: { textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4 },
  },
  "sharp-resin": {
    options: {
      styles: SHARP_RESIN_STYLES_V4,
      inclusions: RESIN_INCLUSIONS_V4,
      finishes: RESIN_FINISHES_V4,
    },
    ranges: {
      clarity: APPEARANCE_PERCENTAGE_RANGE_V4,
      inclusionDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
  },
  "liquid-core": {
    options: {
      cores: LIQUID_CORE_STYLES_V4,
      finishes: RESIN_FINISHES_V4,
    },
    ranges: {
      clarity: APPEARANCE_PERCENTAGE_RANGE_V4,
      particleDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
  },
  gemstone: {
    options: { stones: GEMSTONE_STYLES_V4, finishes: GEMSTONE_FINISHES_V4 },
    ranges: {
      veinDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
  },
  glass: {
    options: { styles: GLASS_STYLES_V4, finishes: GLASS_FINISHES_V4 },
    ranges: {
      clarity: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
  },
  stone: {
    options: { stones: STONE_STYLES_V4, finishes: STONE_FINISHES_V4 },
    ranges: {
      grainDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
  },
  metal: {
    options: { metals: METALS_V4, finishes: METAL_FINISHES_V4 },
    ranges: {
      patinaStrength: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
  },
  "hollow-metal": {
    options: {
      constructions: HOLLOW_METAL_CONSTRUCTIONS_V4,
      metals: METALS_V4,
      finishes: METAL_FINISHES_V4,
    },
    ranges: {
      openness: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
  },
  wood: {
    options: { woods: WOOD_STYLES_V4, finishes: WOOD_FINISHES_V4 },
    ranges: {
      grainDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
  },
  fantasy: {
    options: { essences: FANTASY_ESSENCES_V4, finishes: FANTASY_FINISHES_V4 },
    ranges: {
      intensity: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
  },
  elemental: {
    options: { styles: ELEMENTAL_STYLES_V4 },
    ranges: {
      fissureDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
      glowIntensity: APPEARANCE_PERCENTAGE_RANGE_V4,
      grainSize: APPEARANCE_PERCENTAGE_RANGE_V4,
      windDirection: { minimum: -45, maximum: 45, step: 1 },
      cloudCover: APPEARANCE_PERCENTAGE_RANGE_V4,
      horizonHeight: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
    styleDefaults: ELEMENTAL_STYLES_V4,
  },
  paint: {
    options: { styles: PAINT_STYLES_V4 },
    ranges: {
      dropDensity: APPEARANCE_PERCENTAGE_RANGE_V4,
      streakLength: APPEARANCE_PERCENTAGE_RANGE_V4,
      textureScale: APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    },
    styleDefaults: PAINT_STYLES_V4,
  },
} as const satisfies Record<MaterialFamilyV4, MaterialDefinition>;

const boundaryValueSchema = z.unknown();
type BoundaryValue = z.input<typeof boundaryValueSchema>;
const jsonObjectSchema = z.record(z.string(), z.json());
type JsonObject = z.infer<typeof jsonObjectSchema>;
const stringSchema = z.string();
const booleanSchema = z.boolean();

function isString(value: BoundaryValue): value is string {
  return stringSchema.safeParse(value).success;
}

function isRecord(value: BoundaryValue): value is JsonObject {
  return jsonObjectSchema.safeParse(value).success;
}

function hasExactKeys(
  value: JsonObject,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function requireRecord(
  value: BoundaryValue,
  keys: readonly string[],
  message: string,
): JsonObject {
  if (!isRecord(value) || !hasExactKeys(value, keys)) throw new Error(message);
  return value;
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

function isBoundedText(value: BoundaryValue, maximum = MAX_LABEL_CHARACTERS): value is string {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !containsControlCharacter(value)
  );
}

function requireExactStringArray(
  value: BoundaryValue,
  expected: readonly string[],
  message: string,
): void {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error(message);
  }
}

function requireOptionCatalog(
  value: BoundaryValue,
  expectedIds: readonly string[],
  message: string,
): void {
  if (!Array.isArray(value) || value.length !== expectedIds.length) {
    throw new Error(message);
  }
  for (let index = 0; index < value.length; index += 1) {
    const option = requireRecord(value[index], ["id", "name"], message);
    if (option.id !== expectedIds[index] || !isBoundedText(option.name)) {
      throw new Error(message);
    }
  }
}

function requireOptionCatalogVariant(
  value: BoundaryValue,
  expectedCatalogs: readonly (readonly string[])[],
  message: string,
): void {
  const expectedIds = expectedCatalogs.find(
    (candidate) =>
      Array.isArray(value) &&
      value.length === candidate.length &&
      value.every(
        (entry, index) =>
          isRecord(entry) && entry.id === candidate[index],
      ),
  );
  if (expectedIds === undefined) throw new Error(message);
  requireOptionCatalog(value, expectedIds, message);
}

function requireRange(value: BoundaryValue, expected: Range, message: string): void {
  const range = requireRecord(value, ["maximum", "minimum", "step"], message);
  if (
    range.minimum !== expected.minimum ||
    range.maximum !== expected.maximum ||
    range.step !== expected.step
  ) {
    throw new Error(message);
  }
}

function requireSubset(
  value: BoundaryValue,
  supported: ReadonlySet<string>,
  message: string,
): void {
  if (
    !Array.isArray(value) ||
    value.some((entry) => !isString(entry) || !supported.has(entry)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(message);
  }
}

// SAFETY: The surrounding validation establishes the AppearanceTargetV4 invariant used below.
function validateStyles(catalog: JsonObject): ReadonlySet<string> {
  if (
    !Array.isArray(catalog.styles) ||
    catalog.styles.length < 1 ||
    catalog.styles.length > MAX_BUILTIN_APPEARANCE_STYLES_V3
  ) {
    throw new Error("Appearance style catalog is invalid");
  }
  const ids = new Set<string>();
  for (const value of catalog.styles) {
    if (!isRecord(value)) throw new Error("Appearance style catalog is invalid");
    const keys = value.overrides === undefined
      ? ["description", "id", "name", "recipe"]
      : ["description", "id", "name", "overrides", "recipe"];
    const style = requireRecord(value, keys, "Appearance style catalog is invalid");
    if (
      !isString(style.id) ||
      !STYLE_ID.test(style.id) ||
      ids.has(style.id) ||
      !isBoundedText(style.name) ||
      !isBoundedText(style.description, MAX_DESCRIPTION_CHARACTERS)
    ) {
      throw new Error("Appearance style catalog is invalid");
    }
    parseAppearanceRecipeV3(style.recipe);
    if (style.overrides !== undefined) {
      if (!isRecord(style.overrides)) {
        throw new Error("Appearance style overrides are invalid");
      }
      for (const [target, recipe] of Object.entries(style.overrides)) {
        if (!APPEARANCE_TARGETS_V4.includes(target as AppearanceTargetV4)) {
          throw new Error("Appearance style overrides are invalid");
        }
        parseAppearanceRecipeV3(recipe);
      }
    }
    ids.add(style.id);
  }
  if (!isString(catalog.defaultStyleId) || !ids.has(catalog.defaultStyleId)) {
    throw new Error("Appearance default style is invalid");
  }
  requireSubset(catalog.featuredStyleIds, ids, "Appearance featured styles are invalid");
  requireSubset(catalog.collectorStyleIds, ids, "Appearance material styles are invalid");
  requireSubset(catalog.colorSchemeStyleIds, ids, "Appearance color schemes are invalid");
  requireSubset(catalog.completeLookStyleIds, ids, "Appearance complete looks are invalid");
  return ids;
}

function validateMaterials(value: BoundaryValue): void {
  if (!Array.isArray(value) || value.length !== MATERIAL_FAMILIES_V4.length) {
    throw new Error("Appearance material catalog is invalid");
  }
  for (let index = 0; index < MATERIAL_FAMILIES_V4.length; index += 1) {
    const family = MATERIAL_FAMILIES_V4[index];
    if (family === undefined) throw new Error("Appearance material catalog is invalid");
    const definition: MaterialDefinition = MATERIAL_DEFINITIONS[family];
    const expectedKeys = [
      "defaultValue",
      "family",
      "name",
      ...Object.keys(definition.options),
      ...Object.keys(definition.ranges),
      ...(definition.styleDefaults === undefined ? [] : ["styleDefaults"]),
    ];
    const material = requireRecord(
      value[index],
      expectedKeys,
      "Appearance material catalog is invalid",
    );
    if (material.family !== family || !isBoundedText(material.name)) {
      throw new Error("Appearance material catalog is invalid");
    }
    if (parseAppearanceMaterialV4(material.defaultValue).family !== family) {
      throw new Error("Appearance material catalog is invalid");
    }
    for (const [key, ids] of Object.entries(definition.options)) {
      requireOptionCatalog(
        material[key],
        ids,
        "Appearance material catalog is invalid",
      );
    }
    for (const [key, range] of Object.entries(definition.ranges)) {
      requireRange(material[key], range, "Appearance material catalog is invalid");
    }
    if (definition.styleDefaults !== undefined) {
      if (
        !Array.isArray(material.styleDefaults) ||
        material.styleDefaults.length !== definition.styleDefaults.length
      ) {
        throw new Error("Appearance material catalog is invalid");
      }
      material.styleDefaults.forEach((entry, defaultIndex) => {
        const parsed = parseAppearanceMaterialV4(entry);
        if (
          parsed.family !== family ||
          !("style" in parsed) ||
          parsed.style !== definition.styleDefaults?.[defaultIndex]
        ) {
          throw new Error("Appearance material catalog is invalid");
        }
      });
    }
  }
}

function expectedFormTargets(form: RenderFormV4): readonly AppearanceTargetV4[] {
  if (form === "sphere") return ["other"];
  return APPEARANCE_TARGETS_V4.filter(
    (target): target is Exclude<AppearanceTargetV4, "other"> =>
      target !== "other" &&
      isPolyhedralFormImplementedForTargetV4(
        target,
        form,
        "canvaskit-v4-r32",
      ),
  );
}

function expectedFormFamilies(form: RenderFormV4): readonly MaterialFamilyV4[] {
  return form === "sphere"
    ? MATERIAL_FAMILIES_V4
    : MATERIAL_FAMILIES_V4.filter((family) =>
        isMaterialFormCompatibleV4(family, form),
      );
}

function validateForms(value: BoundaryValue): void {
  const forms: readonly RenderFormV4[] = [...POLYHEDRAL_FORMS_V4, "sphere"];
  if (!Array.isArray(value) || value.length !== forms.length) {
    throw new Error("Appearance form catalog is invalid");
  }
  for (let index = 0; index < forms.length; index += 1) {
    const expectedForm = forms[index];
    const form = requireRecord(
      value[index],
      ["id", "materialFamilies", "name", "targets"],
      "Appearance form catalog is invalid",
    );
    if (form.id !== expectedForm || !isBoundedText(form.name)) {
      throw new Error("Appearance form catalog is invalid");
    }
    requireExactStringArray(
      form.targets,
      expectedFormTargets(expectedForm),
      "Appearance form catalog is invalid",
    );
    requireExactStringArray(
      form.materialFamilies,
      expectedFormFamilies(expectedForm),
      "Appearance form catalog is invalid",
    );
  }
}

// SAFETY: The surrounding validation establishes the (typeof PATTERN_IDS_V4)[number] invariant used below.
function validateEditorDefaults(value: BoundaryValue): void {
  const defaults = requireRecord(
    value,
    ["palette", "patternId", "primaryColor"],
    "Appearance editor defaults are invalid",
  );
  if (
    !isString(defaults.primaryColor) ||
    !HEX_COLOR.test(defaults.primaryColor) ||
    !Array.isArray(defaults.palette) ||
    defaults.palette.length < APPEARANCE_PALETTE_COLOR_RANGE_V3.minimum ||
    defaults.palette.length > APPEARANCE_PALETTE_COLOR_RANGE_V3.maximum ||
    defaults.palette.some(
      (color) => !isString(color) || !HEX_COLOR.test(color),
    ) ||
    !isString(defaults.patternId) ||
    !PATTERN_IDS_V4.includes(defaults.patternId as (typeof PATTERN_IDS_V4)[number])
  ) {
    throw new Error("Appearance editor defaults are invalid");
  }
}

function validateBounds(value: BoundaryValue): void {
  const bounds = requireRecord(
    value,
    [
      "maximumDesignNameCharacters",
      "maximumDesigns",
      "maximumMaterialOptions",
      "maximumProfileJsonCharacters",
      "maximumTotalSelectionWeight",
      "paletteColors",
      "percentage",
      "selectionWeight",
      "textureScale",
    ],
    "Appearance catalog bounds are invalid",
  );
  const palette = requireRecord(
    bounds.paletteColors,
    ["maximum", "minimum"],
    "Appearance catalog bounds are invalid",
  );
  if (
    palette.minimum !== APPEARANCE_PALETTE_COLOR_RANGE_V3.minimum ||
    palette.maximum !== APPEARANCE_PALETTE_COLOR_RANGE_V3.maximum ||
    bounds.maximumTotalSelectionWeight !== MAX_TOTAL_APPEARANCE_SELECTION_WEIGHT_V3 ||
    bounds.maximumMaterialOptions !== MAX_MATERIAL_SELECTION_OPTIONS_V3 ||
    bounds.maximumDesigns !== MAX_APPEARANCE_DESIGNS_V3 ||
    bounds.maximumDesignNameCharacters !==
      MAX_APPEARANCE_DESIGN_NAME_CHARACTERS_V3 ||
    bounds.maximumProfileJsonCharacters !== MAX_PROFILE_JSON_CHARACTERS_V3
  ) {
    throw new Error("Appearance catalog bounds are invalid");
  }
  requireRange(
    bounds.percentage,
    APPEARANCE_PERCENTAGE_RANGE_V4,
    "Appearance catalog bounds are invalid",
  );
  requireRange(
    bounds.textureScale,
    APPEARANCE_TEXTURE_SCALE_RANGE_V4,
    "Appearance catalog bounds are invalid",
  );
  requireRange(
    bounds.selectionWeight,
    APPEARANCE_SELECTION_WEIGHT_RANGE_V3,
    "Appearance catalog bounds are invalid",
  );
}

export function parseAppearanceCatalogV3(value: BoundaryValue): AppearanceCatalogV3 {
  const catalog = requireRecord(value, CATALOG_ROOT_KEYS, "Appearance catalog V3 is invalid");
  if (catalog.version !== 3) throw new Error("Appearance catalog V3 is invalid");
  validateStyles(catalog);
  requireOptionCatalog(catalog.targets, APPEARANCE_TARGETS_V4, "Appearance target catalog is invalid");
  requireOptionCatalog(catalog.patterns, PATTERN_IDS_V4, "Appearance pattern catalog is invalid");
  requireOptionCatalogVariant(
    catalog.fonts,
    PUBLIC_FONT_CATALOGS_V3,
    "Appearance font catalog is invalid",
  );
  requireOptionCatalog(
    catalog.engravingFinishes,
    ENGRAVING_FINISHES_V4,
    "Appearance engraving catalog is invalid",
  );
  requireOptionCatalog(catalog.variations, APPEARANCE_VARIATIONS_V3, "Appearance variation catalog is invalid");
  requireOptionCatalog(
    catalog.variationScopes,
    APPEARANCE_VARIATION_SCOPES_V3,
    "Appearance variation scope catalog is invalid",
  );
  requireOptionCatalog(catalog.colorModes, COLOR_MODES, "Appearance color mode catalog is invalid");
  requireOptionCatalog(
    catalog.selectionModes,
    SELECTION_MODES,
    "Appearance selection mode catalog is invalid",
  );
  validateMaterials(catalog.materials);
  validateForms(catalog.forms);

  const gradient = requireRecord(catalog.gradient, ["directions", "scopes"], "Appearance gradient catalog is invalid");
  requireOptionCatalog(gradient.scopes, GRADIENT_SCOPES_V4, "Appearance gradient catalog is invalid");
  requireOptionCatalog(gradient.directions, LINEAR_DIRECTIONS_V4, "Appearance gradient catalog is invalid");
  const lighting = requireRecord(
    catalog.lighting,
    ["directions", "modes", "strengths"],
    "Appearance lighting catalog is invalid",
  );
  requireOptionCatalog(lighting.modes, LIGHTING_MODES_V4, "Appearance lighting catalog is invalid");
  requireOptionCatalog(lighting.strengths, LIGHTING_STRENGTHS_V4, "Appearance lighting catalog is invalid");
  requireOptionCatalog(lighting.directions, LIGHTING_DIRECTIONS_V4, "Appearance lighting catalog is invalid");
  requireSubset(catalog.featuredPatternIds, new Set(PATTERN_IDS_V4), "Appearance featured patterns are invalid");
  validateEditorDefaults(catalog.editorDefaults);
  validateBounds(catalog.bounds);
  // SAFETY: The surrounding validation establishes the AppearanceCatalogV3 invariant used below.
  return structuredClone(value) as AppearanceCatalogV3;
}

function parseProfileV4(
  value: BoundaryValue,
  catalog: AppearanceCatalogV3,
  guild: boolean,
): AppearanceProfileV4 | GuildAppearanceProfileV4 {
  const validationCatalog = {
    builtinStyleIds: catalog.styles.map(({ id }) => id),
  };
  return guild
    ? parseGuildAppearanceProfileV4(value, validationCatalog)
    : parseAppearanceProfileV4(value, validationCatalog);
}

export function parseAppearanceProfileResourceV4(
  value: BoundaryValue,
  catalog: AppearanceCatalogV3,
  guild: boolean,
): AppearanceProfileResource<AppearanceProfileV4 | GuildAppearanceProfileV4> {
  const resource = requireRecord(
    value,
    ["canRestorePreviousMix", "profile", "revision"],
    "Appearance profile V4 response is invalid",
  );
  if (
    !Number.isSafeInteger(resource.revision) ||
    Number(resource.revision) < 0 ||
    !booleanSchema.safeParse(resource.canRestorePreviousMix).success
  ) {
    throw new Error("Appearance profile V4 response is invalid");
  }
  return {
    revision: Number(resource.revision),
    canRestorePreviousMix: resource.canRestorePreviousMix,
    profile:
      resource.profile === null
        ? null
        : parseProfileV4(resource.profile, catalog, guild),
  };
}

function apiUrl(path: string): string {
  return `${appConfig.apiBase}${path}`;
}

function clientError(code: string, status: number): AppearanceApiError {
  return new AppearanceApiError(code, status);
}

async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw clientError("appearance_web_api_unavailable", 0);
  }
}

async function parseResponse<Value>(
  response: Response,
  code: string,
  parse: (value: BoundaryValue) => Value,
): Promise<Value> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw clientError(code, 502);
  }
  try {
    return parse(value);
  } catch {
    throw clientError(code, 502);
  }
}

async function responseError(response: Response): Promise<AppearanceApiError> {
  let code = `appearance_http_${response.status}`;
  try {
    const value: unknown = await response.json();
    if (
      isRecord(value) &&
      hasExactKeys(value, ["error"]) &&
      isString(value.error)
    ) {
      code = value.error;
    } else if (
      isRecord(value) &&
      hasExactKeys(value, ["revision", "status"]) &&
      value.status === "revision_conflict" &&
      Number.isSafeInteger(value.revision) &&
      Number(value.revision) >= 0
    ) {
      code = "appearance_revision_conflict";
    } else if (
      isRecord(value) &&
      hasExactKeys(value, ["status"]) &&
      value.status === "mutation_conflict"
    ) {
      code = "appearance_mutation_conflict";
    }
  } catch {
    // The status remains authoritative when a response body is not JSON.
  }
  return new AppearanceApiError(code, response.status);
}

async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) throw await responseError(response);
  return response;
}

export async function getAppearanceCatalogV4(): Promise<AppearanceCatalogV3> {
  const response = await requireOk(
    await apiFetch(
      apiUrl(`/api/appearance/v4/catalog?build=${encodeURIComponent(appConfig.buildSha)}`),
      { credentials: "include" },
    ),
  );
  return parseResponse(
    response,
    "appearance_catalog_response_invalid",
    parseAppearanceCatalogV3,
  );
}

export type AppearanceThumbsVersionV4 = Readonly<{
  version: 2;
  catalogVersion: number;
  rendererRevision: string;
  cacheRevision: number;
}>;

const appearanceThumbsVersionSchema = z.object({
  version: z.literal(2),
  catalogVersion: z.number().int(),
  rendererRevision: z.string(),
  cacheRevision: z.number().int().min(1),
});

function parseAppearanceThumbsVersionV4(
  value: BoundaryValue,
): AppearanceThumbsVersionV4 {
  const parsed = appearanceThumbsVersionSchema.safeParse(value);
  if (!parsed.success) throw new Error("Appearance thumbs version is invalid");
  return parsed.data;
}

export async function getAppearanceThumbsVersionV4(): Promise<AppearanceThumbsVersionV4> {
  const response = await requireOk(
    await apiFetch(apiUrl("/api/appearance/thumbs/version"), {
      credentials: "include",
    }),
  );
  return parseResponse(
    response,
    "appearance_thumbs_version_invalid",
    parseAppearanceThumbsVersionV4,
  );
}

async function getGuildProfileV4(
  path: string,
  catalog: AppearanceCatalogV3,
): Promise<AppearanceProfileResource<GuildAppearanceProfileV4>> {
  const response = await requireOk(
    await apiFetch(apiUrl(path), { credentials: "include" }),
  );
  // SAFETY: The surrounding validation establishes the AppearanceProfileResource<GuildAppearanceProfileV4> invariant used below.
  return parseResponse(
    response,
    "appearance_profile_response_invalid",
    (value) =>
      parseAppearanceProfileResourceV4(
        value,
        catalog,
        true,
      ) as AppearanceProfileResource<GuildAppearanceProfileV4>,
  );
}

export type PersonalAppearanceBootstrapV4 = Readonly<{
  catalog: AppearanceCatalogV3;
  resource: AppearanceProfileResource<AppearanceProfileV4>;
}>;

export async function getPersonalAppearanceBootstrapV4(): Promise<PersonalAppearanceBootstrapV4> {
  const catalogPromise = getAppearanceCatalogV4();
  const profileResponsePromise = apiFetch(
    apiUrl("/api/appearance/v4/me/state"),
    {
      credentials: "include",
    },
  ).then(requireOk);
  const [catalog, profileResponse] = await Promise.all([
    catalogPromise,
    profileResponsePromise,
  ]);
  const resource = await parseResponse(
    profileResponse,
    "appearance_profile_response_invalid",
    (value) => parseAppearanceProfileResourceV4(value, catalog, false),
  );
  // SAFETY: The surrounding validation establishes the AppearanceProfileResource<AppearanceProfileV4> invariant used below.
  return {
    catalog,
    resource: resource as AppearanceProfileResource<AppearanceProfileV4>,
  };
}

export function getGuildAppearanceProfileV4(
  guildId: string,
  catalog: AppearanceCatalogV3,
): Promise<AppearanceProfileResource<GuildAppearanceProfileV4>> {
  if (!GUILD_ID.test(guildId)) {
    return Promise.reject(clientError("appearance_guild_id_invalid", 400));
  }
  return getGuildProfileV4(
    `/api/guilds/${guildId}/appearance/v4/state`,
    catalog,
  );
}

function parseSavedProfileV4(
  value: BoundaryValue,
  catalog: AppearanceCatalogV3,
  guild: boolean,
): AppearanceProfileResource<AppearanceProfileV4 | GuildAppearanceProfileV4> {
  const saved = requireRecord(
    value,
    ["canRestorePreviousMix", "profile", "revision", "status"],
    "Appearance profile V4 save response is invalid",
  );
  if (saved.status !== "applied" && saved.status !== "existing") {
    throw new Error("Appearance profile V4 save response is invalid");
  }
  return parseAppearanceProfileResourceV4(
    {
      revision: saved.revision,
      profile: saved.profile,
      canRestorePreviousMix: saved.canRestorePreviousMix,
    },
    catalog,
    guild,
  );
}

async function mutateProfileV4(
  path: string,
  method: "POST" | "PUT",
  expectedRevision: number,
  profile: BoundaryValue,
  catalog: AppearanceCatalogV3,
  guild: boolean,
): Promise<
  AppearanceProfileResource<AppearanceProfileV4 | GuildAppearanceProfileV4>
> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw clientError("appearance_expected_revision_invalid", 400);
  }
  let parsedProfile: AppearanceProfileV4 | GuildAppearanceProfileV4;
  try {
    parsedProfile = parseProfileV4(profile, catalog, guild);
  } catch {
    throw clientError("appearance_profile_invalid", 400);
  }
  const response = await requireOk(
    await apiFetch(apiUrl(path), {
      method,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({ expectedRevision, profile: parsedProfile }),
    }),
  );
  return parseResponse(
    response,
    "appearance_profile_save_response_invalid",
    (value) => parseSavedProfileV4(value, catalog, guild),
  );
}

export function putPersonalAppearanceProfileV4(
  expectedRevision: number,
  profile: BoundaryValue,
  catalog: AppearanceCatalogV3,
): Promise<AppearanceProfileResource<AppearanceProfileV4>> {
  // SAFETY: The response parser establishes the personal profile resource invariant.
  return mutateProfileV4(
    "/api/appearance/v4/me/state",
    "PUT",
    expectedRevision,
    profile,
    catalog,
    false,
  ) as Promise<AppearanceProfileResource<AppearanceProfileV4>>;
}

export function resetPersonalAppearanceProfileV4(
  expectedRevision: number,
  profile: AppearanceProfileV4,
  catalog: AppearanceCatalogV3,
): Promise<AppearanceProfileResource<AppearanceProfileV4>> {
  // SAFETY: The response parser establishes the personal profile resource invariant.
  return mutateProfileV4(
    "/api/appearance/v4/me/state/reset",
    "POST",
    expectedRevision,
    profile,
    catalog,
    false,
  ) as Promise<AppearanceProfileResource<AppearanceProfileV4>>;
}

export function restorePersonalAppearanceProfileV4(
  expectedRevision: number,
  profile: AppearanceProfileV4,
  catalog: AppearanceCatalogV3,
): Promise<AppearanceProfileResource<AppearanceProfileV4>> {
  // SAFETY: The response parser establishes the personal profile resource invariant.
  return mutateProfileV4(
    "/api/appearance/v4/me/state/restore",
    "POST",

    expectedRevision,
    profile,
    catalog,
    false,
  ) as Promise<AppearanceProfileResource<AppearanceProfileV4>>;
}

export function putGuildAppearanceProfileV4(
  guildId: string,
  expectedRevision: number,
  profile: GuildAppearanceProfileV4,
  catalog: AppearanceCatalogV3,
): Promise<AppearanceProfileResource<GuildAppearanceProfileV4>> {
  if (!GUILD_ID.test(guildId)) {
    return Promise.reject(clientError("appearance_guild_id_invalid", 400));
  }
  // SAFETY: The response parser establishes the guild profile resource invariant.
  return mutateProfileV4(
    `/api/guilds/${guildId}/appearance/v4/state`,
    "PUT",
    expectedRevision,
    profile,
    catalog,
    true,
  ) as Promise<AppearanceProfileResource<GuildAppearanceProfileV4>>;
}

export function resetGuildAppearanceProfileV4(
  guildId: string,
  expectedRevision: number,
  profile: GuildAppearanceProfileV4,
  catalog: AppearanceCatalogV3,
): Promise<AppearanceProfileResource<GuildAppearanceProfileV4>> {
  if (!GUILD_ID.test(guildId)) {
    return Promise.reject(clientError("appearance_guild_id_invalid", 400));
  }
  // SAFETY: The response parser establishes the guild profile resource invariant.
  return mutateProfileV4(
    `/api/guilds/${guildId}/appearance/v4/state/reset`,
    "POST",
    expectedRevision,
    profile,
    catalog,
    true,
  ) as Promise<AppearanceProfileResource<GuildAppearanceProfileV4>>;
}

export function restoreGuildAppearanceProfileV4(
  guildId: string,
  expectedRevision: number,
  profile: GuildAppearanceProfileV4,
  catalog: AppearanceCatalogV3,
): Promise<AppearanceProfileResource<GuildAppearanceProfileV4>> {
  if (!GUILD_ID.test(guildId)) {
    return Promise.reject(clientError("appearance_guild_id_invalid", 400));
  }
  // SAFETY: The response parser establishes the guild profile resource invariant.
  return mutateProfileV4(
    `/api/guilds/${guildId}/appearance/v4/state/restore`,
    "POST",

    expectedRevision,
    profile,
    catalog,
    true,
  ) as Promise<AppearanceProfileResource<GuildAppearanceProfileV4>>;
}

// SAFETY: The surrounding validation establishes the AppearanceTargetV4 and (typeof PREVIEW_STATES)[number] invariant used below.
function parsePreviewInput(value: BoundaryValue) {
  const input = requireRecord(
    value,
    ["recipe", "seed", "state", "target"],
    "Appearance preview V4 request is invalid",
  );
  if (
    (input.target !== "all" &&
      !APPEARANCE_TARGETS_V4.includes(input.target as AppearanceTargetV4)) ||
    !Number.isInteger(input.seed) ||
    Number(input.seed) < 0 ||
    Number(input.seed) > 0xffff_ffff ||
    !PREVIEW_STATES.includes(input.state as (typeof PREVIEW_STATES)[number])
  ) {
    throw new Error("Appearance preview V4 request is invalid");
  }
  // SAFETY: The surrounding validation establishes the AppearanceTargetV4 | "all" and (typeof PREVIEW_STATES)[number] invariant used below.
  return {
    target: input.target as AppearanceTargetV4 | "all",
    recipe: parseAppearanceRecipeV3(input.recipe),
    seed: Number(input.seed),
    state: input.state as (typeof PREVIEW_STATES)[number],
  };
}

type PreviewOverridesV4 = Partial<Record<AppearanceTargetV4, AppearanceRecipeV3>>;

// Per-die designs refine the ALL composite; absent for single-target
// previews, which already carry the exact recipe.
// SAFETY: The surrounding validation establishes the AppearanceTargetV4 invariant used below.
function parsePreviewOverridesV4(
  value: BoundaryValue,
  target: AppearanceTargetV4 | "all",
): PreviewOverridesV4 {
  if (target !== "all" || !isRecord(value)) {
    throw new Error("Appearance preview V4 request is invalid");
  }
  const entries = Object.entries(value);
  if (
    entries.length === 0 ||
    !entries.every(([key]) =>
      APPEARANCE_TARGETS_V4.includes(key as AppearanceTargetV4),
    )
  ) {
    throw new Error("Appearance preview V4 request is invalid");
  }
  return Object.fromEntries(
    entries.map(([key, recipe]) => [key, parseAppearanceRecipeV3(recipe)]),
  );
}

function parsePreviewInputV4(value: BoundaryValue):
  ReturnType<typeof parsePreviewInput> & {
    diceView: DiceViewPreferencesV4;
    overrides?: PreviewOverridesV4;
  } {
  const baseKeys = ["diceView", "recipe", "seed", "state", "target"];
  const withOverrides = isRecord(value) && "overrides" in value;
  const input = requireRecord(
    value,
    withOverrides ? [...baseKeys, "overrides"] : baseKeys,
    "Appearance preview V4 request is invalid",
  );
  const base = {
    ...parsePreviewInput({
      recipe: input.recipe,
      seed: input.seed,
      state: input.state,
      target: input.target,
    }),
    diceView: parseDiceViewPreferencesV4(input.diceView),
  };
  if (!withOverrides) return base;
  return {
    ...base,
    overrides: parsePreviewOverridesV4(input.overrides, base.target),
  };
}

function parsePreviewResponse(value: BoundaryValue): AppearancePreviewV4 {
  const preview = requireRecord(
    value,
    [
      "base64",
      "contentType",
      "height",
      "version",
      "width",
    ],
    "Appearance preview V4 response is invalid",
  );
  if (
    preview.version !== 4 ||
    preview.contentType !== "image/png" ||
    !Number.isInteger(preview.width) ||
    Number(preview.width) < 1 ||
    Number(preview.width) > MAX_PREVIEW_DIMENSION ||
    !Number.isInteger(preview.height) ||
    Number(preview.height) < 1 ||
    Number(preview.height) > MAX_PREVIEW_DIMENSION ||
    !isString(preview.base64) ||
    preview.base64.length < 4 ||
    preview.base64.length > MAX_PREVIEW_BASE64_CHARACTERS ||
    preview.base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(preview.base64)
  ) {
    throw new Error("Appearance preview V4 response is invalid");
  }
  const image = {
    contentType: "image/png" as const,
    width: Number(preview.width),
    height: Number(preview.height),
    base64: preview.base64,
  };
  return { version: 4, ...image };
}

export async function getAppearancePreviewV4(
  value: BoundaryValue,
  signal?: AbortSignal,
): Promise<AppearancePreviewV4> {
  let input: ReturnType<typeof parsePreviewInputV4>;
  try {
    input = parsePreviewInputV4(value);
  } catch {
    throw clientError("appearance_preview_request_invalid", 400);
  }
  const request: RequestInit = {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  };
  if (signal !== undefined) request.signal = signal;
  const response = await requireOk(
    await apiFetch(apiUrl("/api/appearance/v4/preview"), request),
  );
  return parseResponse(
    response,
    "appearance_preview_response_invalid",
    parsePreviewResponse,
  );
}
