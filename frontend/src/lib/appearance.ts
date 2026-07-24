import { customFetch } from "@/lib/api";
import { appConfig } from "@/lib/config";
import {
  APPEARANCE_TARGETS,
  type AppearanceCatalogV2,
  type AppearanceFill,
  type AppearancePreview,
  type AppearanceProfileResource,
  type AppearanceProfileV2,
  type AppearanceRecipeV2,
  type AppearanceSelection,
  type AppearanceTarget,
  type DesignReference,
  type GuildAppearanceProfileV2,
} from "../types/appearance";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_SELECTION_WEIGHT = 1_000;
const MAX_TOTAL_SELECTION_WEIGHT = 10_000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GRADIENT_SCOPES = ["repeated", "die-wide"] as const;
const LINEAR_DIRECTIONS = [
  "top-to-bottom",
  "upper-right-to-lower-left",
  "right-to-left",
  "lower-right-to-upper-left",
  "bottom-to-top",
  "lower-left-to-upper-right",
  "left-to-right",
  "upper-left-to-lower-right",
] as const;
const LIGHTING_MODES = ["none", "facet", "directional", "combined"] as const;
const LIGHTING_STRENGTHS = ["gentle", "subtle", "strong"] as const;
const LIGHTING_DIRECTIONS = [
  "top",
  "upper-left",
  "upper-right",
  "left",
  "right",
] as const;

export class AppearanceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

function parseOption(value: unknown): { id: string; name: string } {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "name"]) ||
    typeof value.id !== "string" ||
    value.id.length < 1 ||
    value.id.length > 64 ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 64
  ) {
    throw new Error("Appearance catalog option is invalid");
  }
  return { id: value.id, name: value.name };
}

function parseFill(
  value: unknown,
  patternIds: ReadonlySet<string>,
): AppearanceFill {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Appearance fill is invalid");
  }
  if (
    (value.type === "solid" || value.type === "gradient") &&
    hasExactKeys(value, ["type"])
  ) {
    return { type: value.type };
  }
  if (
    value.type !== "pattern" ||
    !hasExactKeys(value, ["patternId", "type"]) ||
    typeof value.patternId !== "string" ||
    !patternIds.has(value.patternId)
  ) {
    throw new Error("Appearance fill is invalid");
  }
  return { type: "pattern", patternId: value.patternId };
}

function parseColor(value: unknown): string {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new Error("Appearance color is invalid");
  }
  return value.toLowerCase();
}

function parseWeight(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_SELECTION_WEIGHT
  ) {
    throw new Error("Appearance selection weight is invalid");
  }
  return value;
}

function validateWeights(options: readonly { weight: number }[]): void {
  if (
    options.reduce((total, { weight }) => total + weight, 0) >
    MAX_TOTAL_SELECTION_WEIGHT
  ) {
    throw new Error("Appearance selection weights are invalid");
  }
}

function parseSelection<Value extends string>(
  value: unknown,
  supported: readonly Value[],
): AppearanceSelection<Value> {
  if (!isRecord(value) || typeof value.mode !== "string") {
    throw new Error("Appearance treatment selection is invalid");
  }
  const parseValue = (candidate: unknown): Value => {
    if (
      typeof candidate !== "string" ||
      !supported.includes(candidate as Value)
    ) {
      throw new Error("Appearance treatment value is invalid");
    }
    return candidate as Value;
  };
  if (value.mode === "fixed" && hasExactKeys(value, ["mode", "value"])) {
    return { mode: "fixed", value: parseValue(value.value) };
  }
  if (
    value.mode === "allowlist" &&
    hasExactKeys(value, ["mode", "values"]) &&
    Array.isArray(value.values) &&
    value.values.length >= 1 &&
    value.values.length <= supported.length
  ) {
    const values = value.values.map(parseValue);
    if (new Set(values).size !== values.length) {
      throw new Error("Appearance treatment values are not unique");
    }
    return { mode: "allowlist", values };
  }
  if (
    value.mode === "weighted" &&
    hasExactKeys(value, ["mode", "options"]) &&
    Array.isArray(value.options) &&
    value.options.length >= 1 &&
    value.options.length <= supported.length
  ) {
    const options = value.options.map((option) => {
      if (!isRecord(option) || !hasExactKeys(option, ["value", "weight"])) {
        throw new Error("Appearance weighted treatment is invalid");
      }
      return {
        value: parseValue(option.value),
        weight: parseWeight(option.weight),
      };
    });
    if (new Set(options.map(({ value: option }) => option)).size !== options.length) {
      throw new Error("Appearance treatment values are not unique");
    }
    validateWeights(options);
    return { mode: "weighted", options };
  }
  throw new Error("Appearance treatment selection is invalid");
}

function isFixedSelection<Value>(
  selection: AppearanceSelection<Value>,
  expected: Value,
): boolean {
  return selection.mode === "fixed" && selection.value === expected;
}

function fillKey(fill: AppearanceFill): string {
  return fill.type === "pattern" ? `pattern:${fill.patternId}` : fill.type;
}

function parseRecipe(
  value: unknown,
  fontIds: ReadonlySet<string>,
  patternIds: ReadonlySet<string>,
): AppearanceRecipeV2 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "colors",
      "compatibility",
      "fill",
      "font",
      "gradient",
      "lighting",
      "variation",
      "varyBy",
      "version",
    ]) ||
    value.version !== 2 ||
    (value.compatibility !== "legacy-v1" &&
      value.compatibility !== "native-v2") ||
    (value.variation !== "fixed" &&
      value.variation !== "curated" &&
      value.variation !== "wild") ||
    (value.varyBy !== "die" &&
      value.varyBy !== "group" &&
      value.varyBy !== "roll") ||
    !isRecord(value.colors) ||
    !isRecord(value.fill) ||
    !isRecord(value.font) ||
    !isRecord(value.gradient) ||
    !hasExactKeys(value.gradient, ["colorSource", "direction", "scope"]) ||
    !isRecord(value.lighting) ||
    !hasExactKeys(value.lighting, ["direction", "mode", "strength"])
  ) {
    throw new Error("Appearance recipe is invalid");
  }

  let colors: AppearanceRecipeV2["colors"];
  if (
    (value.colors.mode === "random-pair" ||
      value.colors.mode === "vivid-random-pair") &&
    hasExactKeys(value.colors, ["mode"])
  ) {
    colors = { mode: value.colors.mode };
  } else if (
    (value.colors.mode === "tonal" || value.colors.mode === "random") &&
    hasExactKeys(value.colors, ["mode", "primary"]) &&
    typeof value.colors.primary === "string" &&
    HEX_COLOR.test(value.colors.primary)
  ) {
    colors = {
      mode: value.colors.mode,
      primary: parseColor(value.colors.primary),
    };
  } else if (
    value.colors.mode === "palette" &&
    hasExactKeys(value.colors, ["colors", "mode"]) &&
    Array.isArray(value.colors.colors) &&
    value.colors.colors.length >= 2 &&
    value.colors.colors.length <= 6 &&
    value.colors.colors.every(
      (color): color is string =>
        typeof color === "string" && HEX_COLOR.test(color),
    )
  ) {
    const parsedColors = value.colors.colors.map(parseColor);
    if (new Set(parsedColors).size < 2) {
      throw new Error("Appearance colors are invalid");
    }
    colors = { mode: "palette", colors: parsedColors };
  } else {
    throw new Error("Appearance colors are invalid");
  }

  let fill: AppearanceRecipeV2["fill"];
  if (
    value.fill.mode === "fixed" &&
    hasExactKeys(value.fill, ["mode", "value"])
  ) {
    fill = { mode: "fixed", value: parseFill(value.fill.value, patternIds) };
  } else if (
    value.fill.mode === "allowlist" &&
    hasExactKeys(value.fill, ["mode", "values"]) &&
    Array.isArray(value.fill.values) &&
    value.fill.values.length >= 1 &&
    value.fill.values.length <= patternIds.size + 2
  ) {
    fill = {
      mode: "allowlist",
      values: value.fill.values.map((item) => parseFill(item, patternIds)),
    };
  } else if (
    value.fill.mode === "weighted" &&
    hasExactKeys(value.fill, ["mode", "options"]) &&
    Array.isArray(value.fill.options) &&
    value.fill.options.length >= 1 &&
    value.fill.options.length <= patternIds.size + 2
  ) {
    const options = value.fill.options.map((option) => {
      if (!isRecord(option) || !hasExactKeys(option, ["value", "weight"])) {
        throw new Error("Appearance weighted fill is invalid");
      }
      return {
        value: parseFill(option.value, patternIds),
        weight: parseWeight(option.weight),
      };
    });
    if (
      new Set(options.map(({ value: option }) => fillKey(option))).size !==
      options.length
    ) {
      throw new Error("Appearance weighted fills are invalid");
    }
    validateWeights(options);
    fill = { mode: "weighted", options };
  } else {
    throw new Error("Appearance fill selection is invalid");
  }

  let font: AppearanceRecipeV2["font"];
  if (
    value.font.mode === "fixed" &&
    hasExactKeys(value.font, ["fontId", "mode"]) &&
    typeof value.font.fontId === "string" &&
    fontIds.has(value.font.fontId)
  ) {
    font = { mode: "fixed", fontId: value.font.fontId };
  } else if (
    value.font.mode === "allowlist" &&
    hasExactKeys(value.font, ["fontIds", "mode"]) &&
    Array.isArray(value.font.fontIds) &&
    value.font.fontIds.length >= 1 &&
    value.font.fontIds.length <= fontIds.size &&
    value.font.fontIds.every(
      (fontId): fontId is string =>
        typeof fontId === "string" && fontIds.has(fontId),
    )
  ) {
    font = { mode: "allowlist", fontIds: [...value.font.fontIds] };
  } else if (
    value.font.mode === "weighted" &&
    hasExactKeys(value.font, ["mode", "options"]) &&
    Array.isArray(value.font.options) &&
    value.font.options.length >= 1 &&
    value.font.options.length <= fontIds.size
  ) {
    const options = value.font.options.map((option) => {
      if (
        !isRecord(option) ||
        !hasExactKeys(option, ["fontId", "weight"]) ||
        typeof option.fontId !== "string" ||
        !fontIds.has(option.fontId)
      ) {
        throw new Error("Appearance weighted font is invalid");
      }
      return { fontId: option.fontId, weight: parseWeight(option.weight) };
    });
    if (new Set(options.map(({ fontId }) => fontId)).size !== options.length) {
      throw new Error("Appearance weighted fonts are invalid");
    }
    validateWeights(options);
    font = { mode: "weighted", options };
  } else {
    throw new Error("Appearance font selection is invalid");
  }

  const colorSource = value.gradient.colorSource;
  if (colorSource !== "resolved-pair" && colorSource !== "full-palette") {
    throw new Error("Appearance gradient color source is invalid");
  }
  const gradient: AppearanceRecipeV2["gradient"] = {
    colorSource,
    scope: parseSelection(value.gradient.scope, GRADIENT_SCOPES),
    direction: parseSelection(value.gradient.direction, LINEAR_DIRECTIONS),
  };
  const lighting: AppearanceRecipeV2["lighting"] = {
    mode: parseSelection(value.lighting.mode, LIGHTING_MODES),
    strength: parseSelection(value.lighting.strength, LIGHTING_STRENGTHS),
    direction: parseSelection(
      value.lighting.direction,
      LIGHTING_DIRECTIONS,
    ),
  };
  if (
    value.compatibility === "legacy-v1" &&
    (colors.mode === "random-pair" ||
      colors.mode === "vivid-random-pair" ||
      (colors.mode === "palette" &&
        new Set(colors.colors).size !== colors.colors.length))
  ) {
    throw new Error("Legacy appearance colors are invalid");
  }
  if (
    value.compatibility === "legacy-v1" &&
    (gradient.colorSource !== "resolved-pair" ||
      !isFixedSelection(gradient.scope, "repeated") ||
      !isFixedSelection(gradient.direction, "top-to-bottom") ||
      !isFixedSelection(lighting.mode, "facet") ||
      !isFixedSelection(lighting.strength, "subtle") ||
      !isFixedSelection(lighting.direction, "upper-left"))
  ) {
    throw new Error("Legacy appearance treatment is invalid");
  }
  if (
    value.compatibility === "native-v2" &&
    gradient.colorSource !== "full-palette"
  ) {
    throw new Error("Native appearance treatment is invalid");
  }

  return {
    version: 2,
    compatibility: value.compatibility,
    variation: value.variation,
    varyBy: value.varyBy,
    colors,
    fill,
    font,
    gradient,
    lighting,
  };
}

function uniqueOptions(
  values: unknown,
  name: string,
): Array<{ id: string; name: string }> {
  if (!Array.isArray(values) || values.length < 1 || values.length > 16) {
    throw new Error(`${name} are invalid`);
  }
  const options = values.map(parseOption);
  if (new Set(options.map(({ id }) => id)).size !== options.length) {
    throw new Error(`${name} ids are not unique`);
  }
  return options;
}

export function parseAppearanceCatalog(value: unknown): AppearanceCatalogV2 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "defaultStyleId",
      "fonts",
      "patterns",
      "styles",
      "version",
    ]) ||
    value.version !== 2 ||
    typeof value.defaultStyleId !== "string" ||
    !Array.isArray(value.styles) ||
    value.styles.length < 24 ||
    value.styles.length > 30
  ) {
    throw new Error("Appearance catalog is invalid");
  }
  const patterns = uniqueOptions(value.patterns, "Appearance patterns");
  const fonts = uniqueOptions(value.fonts, "Appearance fonts");
  const patternIds = new Set(patterns.map(({ id }) => id));
  const fontIds = new Set(fonts.map(({ id }) => id));
  const styles = value.styles.map((style) => {
    if (
      !isRecord(style) ||
      !hasExactKeys(style, ["description", "id", "name", "recipe"]) ||
      typeof style.description !== "string" ||
      style.description.length < 1 ||
      style.description.length > 200
    ) {
      throw new Error("Appearance style is invalid");
    }
    if (
      typeof style.id !== "string" ||
      style.id.length < 1 ||
      style.id.length > 64 ||
      typeof style.name !== "string" ||
      style.name.length < 1 ||
      style.name.length > 64
    ) {
      throw new Error("Appearance style is invalid");
    }
    return {
      id: style.id,
      name: style.name,
      description: style.description,
      recipe: parseRecipe(style.recipe, fontIds, patternIds),
    };
  });
  const styleIds = new Set(styles.map(({ id }) => id));
  if (
    styleIds.size !== styles.length ||
    !styleIds.has(value.defaultStyleId)
  ) {
    throw new Error("Appearance styles are invalid");
  }
  return {
    version: 2,
    defaultStyleId: value.defaultStyleId,
    styles,
    patterns,
    fonts,
  };
}

function parseReference(
  value: unknown,
  builtinIds: ReadonlySet<string>,
): DesignReference {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "source"]) ||
    typeof value.id !== "string"
  ) {
    throw new Error("Appearance reference is invalid");
  }
  if (value.source === "builtin" && builtinIds.has(value.id)) {
    return { source: "builtin", id: value.id };
  }
  if (value.source === "custom" && UUID_V4.test(value.id)) {
    return { source: "custom", id: value.id.toLowerCase() };
  }
  throw new Error("Appearance reference is invalid");
}

function parseProfile(
  value: unknown,
  catalog: AppearanceCatalogV2,
  guild: boolean,
): AppearanceProfileV2 | GuildAppearanceProfileV2 {
  const expectedKeys = guild
    ? ["assignments", "designs", "mode", "version"]
    : ["assignments", "designs", "version"];
  if (
    !isRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    value.version !== 2 ||
    !Array.isArray(value.designs) ||
    value.designs.length > 10 ||
    !isRecord(value.assignments) ||
    !hasExactKeys(value.assignments, ["all", "overrides"]) ||
    !isRecord(value.assignments.overrides) ||
    (guild &&
      value.mode !== "off" &&
      value.mode !== "default" &&
      value.mode !== "enforced")
  ) {
    throw new Error("Appearance profile is invalid");
  }
  const fontIds = new Set(catalog.fonts.map(({ id }) => id));
  const patternIds = new Set(catalog.patterns.map(({ id }) => id));
  const builtinIds = new Set(catalog.styles.map(({ id }) => id));
  const designs = value.designs.map((design) => {
    if (
      !isRecord(design) ||
      !hasExactKeys(design, ["id", "name", "recipe"]) ||
      typeof design.id !== "string" ||
      !UUID_V4.test(design.id) ||
      typeof design.name !== "string"
    ) {
      throw new Error("Appearance design is invalid");
    }
    const name = design.name.trim();
    if (name.length < 1 || name.length > 50) {
      throw new Error("Appearance design is invalid");
    }
    return {
      id: design.id.toLowerCase(),
      name,
      recipe: parseRecipe(design.recipe, fontIds, patternIds),
    };
  });
  const designIds = new Set(designs.map(({ id }) => id));
  if (designIds.size !== designs.length) {
    throw new Error("Appearance design ids are not unique");
  }
  const all =
    value.assignments.all === null
      ? null
      : parseReference(value.assignments.all, builtinIds);
  const overrides: AppearanceProfileV2["assignments"]["overrides"] = {};
  for (const [target, referenceValue] of Object.entries(
    value.assignments.overrides,
  )) {
    if (!APPEARANCE_TARGETS.includes(target as AppearanceTarget)) {
      throw new Error("Appearance target is invalid");
    }
    overrides[target as AppearanceTarget] = parseReference(
      referenceValue,
      builtinIds,
    );
  }
  const references = [all, ...Object.values(overrides)];
  if (
    references.some(
      (reference) =>
        reference?.source === "custom" && !designIds.has(reference.id),
    )
  ) {
    throw new Error("Appearance custom design is missing");
  }
  const profile = {
    version: 2 as const,
    designs,
    assignments: { all, overrides },
  };
  return guild
    ? {
        ...profile,
        mode: value.mode as GuildAppearanceProfileV2["mode"],
      }
    : profile;
}

export function parseAppearanceProfileResource<
  Profile extends AppearanceProfileV2,
>(
  value: unknown,
  catalog: AppearanceCatalogV2,
  guild: boolean,
): AppearanceProfileResource<Profile> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["profile", "revision"]) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    ((value.profile === null) !== (value.revision === 0))
  ) {
    throw new Error("Appearance profile response is invalid");
  }
  return {
    revision: Number(value.revision),
    profile:
      value.profile === null
        ? null
        : (parseProfile(value.profile, catalog, guild) as Profile),
  };
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AppearanceApiError("Appearance response is invalid", 502);
  }
}

export async function getAppearanceCatalog(): Promise<AppearanceCatalogV2> {
  const response = await customFetch(
    `/api/appearance/v2/catalog?build=${appConfig.buildSha}`,
  );
  if (!response.ok) {
    throw new AppearanceApiError("Appearance catalog is unavailable", response.status);
  }
  return parseAppearanceCatalog(await responseJson(response));
}

export async function getAppearanceProfile<
  Profile extends AppearanceProfileV2,
>(
  path: string,
  catalog: AppearanceCatalogV2,
  guild: boolean,
): Promise<AppearanceProfileResource<Profile>> {
  const response = await customFetch(path);
  if (!response.ok) {
    throw new AppearanceApiError("Appearance profile is unavailable", response.status);
  }
  return parseAppearanceProfileResource<Profile>(
    await responseJson(response),
    catalog,
    guild,
  );
}

export async function putAppearanceProfile<
  Profile extends AppearanceProfileV2,
>(
  path: string,
  expectedRevision: number,
  profile: Profile,
  catalog: AppearanceCatalogV2,
  guild: boolean,
): Promise<AppearanceProfileResource<Profile>> {
  const response = await customFetch(path, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify({ expectedRevision, profile }),
  });
  const value = await responseJson(response);
  if (response.status === 409) {
    throw new AppearanceApiError("Appearance profile changed; reload and try again", 409);
  }
  if (
    !response.ok ||
    !isRecord(value) ||
    !hasExactKeys(value, ["profile", "revision", "status"]) ||
    (value.status !== "applied" && value.status !== "existing")
  ) {
    throw new AppearanceApiError(
      "Appearance profile could not be saved",
      response.status,
    );
  }
  return parseAppearanceProfileResource<Profile>(
    { revision: value.revision, profile: value.profile },
    catalog,
    guild,
  );
}

export async function getAppearancePreview(input: {
  target: AppearanceTarget | "all";
  recipe: AppearanceRecipeV2;
  seed: number;
  state: "normal" | "critical-success" | "critical-failure";
}): Promise<AppearancePreview> {
  const response = await customFetch("/api/appearance/v2/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new AppearanceApiError("Appearance preview is unavailable", response.status);
  }
  const value = await responseJson(response);
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["base64", "contentType", "height", "version", "width"]) ||
    value.version !== 2 ||
    value.contentType !== "image/png" ||
    typeof value.base64 !== "string" ||
    !value.base64.startsWith("iVBORw0KGgo") ||
    value.base64.length < 12 ||
    value.base64.length > 12 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64) ||
    value.base64.length % 4 !== 0 ||
    !Number.isSafeInteger(value.width) ||
    Number(value.width) < 1 ||
    Number(value.width) > 4_096 ||
    !Number.isSafeInteger(value.height) ||
    Number(value.height) < 1 ||
    Number(value.height) > 4_096
  ) {
    throw new AppearanceApiError("Appearance preview response is invalid", 502);
  }
  return {
    version: 2,
    contentType: "image/png",
    width: Number(value.width),
    height: Number(value.height),
    base64: value.base64,
  };
}
