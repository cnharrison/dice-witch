import {
  canonicalJsonV4,
  RENDERER_REVISIONS_V4,
  serializeRenderRequestV4,
  validateRenderRequestV4,
  type PublicRenderModelV4,
  type RenderDieV4,
  type RenderRequestV4,
  type RendererRevisionV4,
} from "@dice-witch/dice-v4-model";
import { createDefaultDiceViewPreferencesV4 } from "@dice-witch/dice-v4-model/dice-view-preferences";
import { WorkerEntrypoint } from "cloudflare:workers";
import { z } from "zod";
import {
  createCanvasKitRequestRendererV4,
  renderV4WithSingleRetry,
  type DiceRequestRendererFactoryV4,
} from "../../../packages/dice-canvaskit/src";
import {
  APPEARANCE_TARGETS,
  APPEARANCE_VALIDATION_CATALOG,
  parseAppearancePreviewRequest,
  parseAppearancePreviewRequestV2,
  parseAppearancePreviewRequestV3,
  parseAppearancePreviewRequestV4,
  type AppearancePreviewState,
  type AppearanceTarget,
  type EffectiveAppearanceRecipesV1,
  type EffectiveAppearanceRecipesV2,
  type EffectiveAppearanceV4,
} from "../../../packages/dice-appearance/src";
import {
  renderDiceRequestV2ToPng,
  renderDiceRequestV3ToPng,
  type RenderRequestV2,
  type RenderRequestV3,
  type RenderResultV2,
  type RenderResultV3,
} from "../../../packages/dice-svg/src";
import {
  buildRollResultMessage,
  rollClatterText,
  rollErrorText,
  rollResultText,
  type RollResultMessageOptions,
} from "../../../packages/discord-contracts/src";
import {
  safeIntegerSchema,
  seedSchema,
  snowflakeSchema,
  type SchemaInput,
} from "../../../packages/discord-contracts/src/schema-primitives";
import {
  executeRoll,
  parseNotationArgs,
  prepareRollAppearance,
  type RollDie,
  type RollExecutionResult,
} from "../../../packages/roll-domain/src";
import {
  buildRollRenderRequestV2,
  buildRollRenderRequestV3,
  buildRollRenderRequestV4,
  buildRollRenderRequestR20V4,
  buildRollRenderRequestR21V4,
  buildRollRenderRequestR22V4,
  buildRollRenderRequestR23V4,
  buildRollRenderRequestR24V4,
  buildRollRenderRequestR25V4,
  buildRollRenderRequestR26V4,
  buildRollRenderRequestR27V4,
  buildRollRenderRequestR28V4,
  buildRollRenderRequestR29V4,
  buildRollRenderRequestR30V4,
  buildRollRenderRequestR31V4,
  buildRollRenderRequestR32V4,
  buildRollRenderRequestR33V4,
  buildRollRenderRequestR34V4,
  buildRollRenderRequestR35V4,
  buildRollRenderRequestR36V4,
  buildRollRenderRequestR37V4,
  buildRollRenderRequestR38V4,
  buildRollRenderRequestR39V4,
  buildRollRenderRequestR40V4,
  buildRollRenderRequestR41V4,
  buildRollRenderRequestR42V4,
} from "../../../packages/roll-render-model/src";
import { parseSavedRollNameColorV2 } from "../../../packages/saved-rolls/src";
import {
  loadEffectiveAppearanceV4,
  type AppearanceDataService,
} from "./appearance";
import {
  parseRollRenderVersion,
  parseRollViewPolicy,
  type RollViewPolicy,
} from "./render-version";
import type { WebDeliveryExecutionResult } from "./web-delivery-work";

type WebDeliveryWorkPort = {
  execute(value: SchemaInput): Promise<SchemaInput>;
};

type WebRollEnv = {
  DATA_SERVICE: AppearanceDataService;
  ROLL_RENDER_VERSION: SchemaInput;
  ROLL_VIEW_POLICY: SchemaInput;
  WEB_DELIVERY_WORK: {
    getByName(name: string): WebDeliveryWorkPort;
  };
};

const ROLL_VIEW_BUILDERS_V4 = {
  r20: buildRollRenderRequestR20V4,
  r21: buildRollRenderRequestR21V4,
  r22: buildRollRenderRequestR22V4,
  r23: buildRollRenderRequestR23V4,
  r24: buildRollRenderRequestR24V4,
  r25: buildRollRenderRequestR25V4,
  r26: buildRollRenderRequestR26V4,
  r27: buildRollRenderRequestR27V4,
  r28: buildRollRenderRequestR28V4,
  r29: buildRollRenderRequestR29V4,
  r30: buildRollRenderRequestR30V4,
  r31: buildRollRenderRequestR31V4,
  r32: buildRollRenderRequestR32V4,
  r33: buildRollRenderRequestR33V4,
  r34: buildRollRenderRequestR34V4,
  r35: buildRollRenderRequestR35V4,
  r36: buildRollRenderRequestR36V4,
  r37: buildRollRenderRequestR37V4,
  r38: buildRollRenderRequestR38V4,
  r39: buildRollRenderRequestR39V4,
  r40: buildRollRenderRequestR40V4,
  r41: buildRollRenderRequestR41V4,
  r42: buildRollRenderRequestR42V4,
} satisfies Record<
  Exclude<RollViewPolicy, "r19">,
  typeof buildRollRenderRequestR20V4
>;

type WebRollDie = {
  sides: number | "%" | "F";
  rolled: number;
  value: number;
  icon: string[];
  color: string;
  secondaryColor: string;
  textColor: string;
};

export type WebRollDeliveryStatus =
  | "delivered"
  | "failed"
  | "pending"
  | "permission_error";

export type WebRollResult =
  | { status: "conflict" | "expired" | "invalid" | "stale"; message: string }
  | {
      status: "rolled";
      message: string;
      diceArray: WebRollDie[][];
      resultArray: Array<{ output: string; results: number }>;
      renderedImage: {
        contentType: "image/png";
        width: number;
        height: number;
        png: Uint8Array;
      };
      renderModel?: PublicRenderModelV4;
      appearanceIdentities: string[][];
      rerolledAppearanceIdentities: string[];
      deliveryStatus?: WebRollDeliveryStatus;
      discord: {
        payload: unknown;
        clatter: string;
        resultText: string;
        filename: string;
        png: Uint8Array;
      };
    };

export type WebSavedRollAttribution = {
  scope: "personal" | "guild";
  name: string;
  nameColor: string | null;
};

type WebRollRequest = {
  notation: string;
  repetitions: number;
  username: string;
  title: string | null;
  userId: string;
  guildId: string;
  savedRoll?: WebSavedRollAttribution;
  saveRollCustomId?: string;
  textResultCustomId?: string;
  renderSeed?: number;
  appearanceDigest?: string;
};

type WebRollPreparationRequest = Pick<
  WebRollRequest,
  "guildId" | "notation" | "repetitions" | "userId"
> & { renderSeed?: number };

export type WebRollPreparationResult =
  | { status: "invalid"; message: string }
  | {
      status: "prepared";
      renderSeed: number;
      appearanceDigest: string;
      groupSizes: number[];
      appearanceIdentities: string[][];
      renderedImage: {
        contentType: "image/png";
        width: number;
        height: number;
        png: Uint8Array;
      };
      renderModel?: PublicRenderModelV4;
    };

export type AppearancePreviewResult = RenderResultV2 & {
  contentType: "image/png";
};

export type AppearancePreviewResultV2 = RenderResultV3 & {
  contentType: "image/png";
};

export type AppearancePreviewResultV3 = {
  version: 4;
  contentType: "image/png";
  width: number;
  height: number;
  diceCount: number;
  rowCount: number;
  png: Uint8Array;
};

export type AppearancePreviewResultV4 = AppearancePreviewResultV3;

const WebSavedRollAttributionSchema = z.union([
  z.strictObject({
    scope: z.enum(["personal", "guild"]),
    name: z.string().min(1).max(1_024),
  }),
  z.strictObject({
    scope: z.enum(["personal", "guild"]),
    name: z.string().min(1).max(1_024),
    nameColor: z.unknown(),
  }),
]);
const WebRollRequestSchema = z.strictObject({
  notation: z.string().min(1).max(6_000),
  repetitions: safeIntegerSchema.min(1).max(50),
  username: z.string().min(1).max(32),
  title: z.nullable(z.string().min(1).max(256)),
  userId: snowflakeSchema,
  guildId: snowflakeSchema,
  savedRoll: z.unknown().optional(),
  saveRollCustomId: z
    .string()
    .min(1)
    .max(100)
    .startsWith("save-roll:v1:w:")
    .optional(),
  textResultCustomId: z
    .string()
    .min(1)
    .max(100)
    .startsWith("text-result:v1:w:")
    .optional(),
  renderSeed: seedSchema.optional(),
  appearanceDigest: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
});
const WebRollPreparationRequestSchema = z.strictObject({
  notation: z.string().min(1).max(6_000),
  repetitions: safeIntegerSchema.min(1).max(50),
  userId: snowflakeSchema,
  guildId: snowflakeSchema,
  renderSeed: seedSchema.optional(),
});

function invalidWebSavedRollAttribution(): Error {
  return new Error("Web Library roll attribution is invalid");
}

export function parseWebSavedRollAttribution(
  value: SchemaInput,
): WebSavedRollAttribution {
  const result = WebSavedRollAttributionSchema.safeParse(value);
  if (!result.success) throw invalidWebSavedRollAttribution();

  let nameColor: string | null = null;
  if ("nameColor" in result.data && result.data.nameColor !== undefined) {
    try {
      nameColor = parseSavedRollNameColorV2(result.data.nameColor);
    } catch {
      throw invalidWebSavedRollAttribution();
    }
  }
  return {
    scope: result.data.scope,
    name: result.data.name,
    nameColor,
  };
}

function validateRequest(value: SchemaInput): WebRollRequest {
  const result = WebRollRequestSchema.safeParse(value);
  if (!result.success) throw new Error("Web roll request is invalid");
  const request = result.data;
  const hasSavedRoll = Object.hasOwn(request, "savedRoll") &&
    request.savedRoll !== undefined;
  const hasSaveRollCustomId = Object.hasOwn(request, "saveRollCustomId") &&
    request.saveRollCustomId !== undefined;
  const hasTextResultCustomId = Object.hasOwn(request, "textResultCustomId") &&
    request.textResultCustomId !== undefined;
  const hasRenderSeed = Object.hasOwn(request, "renderSeed") &&
    request.renderSeed !== undefined;
  const hasAppearanceDigest = Object.hasOwn(request, "appearanceDigest") &&
    request.appearanceDigest !== undefined;
  if (
    Object.hasOwn(request, "savedRoll") !== hasSavedRoll ||
    Object.hasOwn(request, "saveRollCustomId") !== hasSaveRollCustomId ||
    Object.hasOwn(request, "textResultCustomId") !== hasTextResultCustomId ||
    Object.hasOwn(request, "renderSeed") !== hasRenderSeed ||
    Object.hasOwn(request, "appearanceDigest") !== hasAppearanceDigest ||
    hasRenderSeed !== hasAppearanceDigest
  ) {
    throw new Error("Web roll request is invalid");
  }

  const parsed: WebRollRequest = {
    notation: request.notation,
    repetitions: request.repetitions,
    username: request.username,
    title: request.title,
    userId: request.userId,
    guildId: request.guildId,
  };
  if (request.savedRoll !== undefined) {
    parsed.savedRoll = parseWebSavedRollAttribution(request.savedRoll);
  }
  if (request.saveRollCustomId !== undefined) {
    parsed.saveRollCustomId = request.saveRollCustomId;
  }
  if (request.textResultCustomId !== undefined) {
    parsed.textResultCustomId = request.textResultCustomId;
  }
  if (
    request.renderSeed !== undefined &&
    request.appearanceDigest !== undefined
  ) {
    parsed.renderSeed = request.renderSeed;
    parsed.appearanceDigest = request.appearanceDigest;
  }
  return parsed;
}

function validatePreparationRequest(
  value: SchemaInput,
): WebRollPreparationRequest {
  const result = WebRollPreparationRequestSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Web roll preparation request is invalid");
  }
  const request: WebRollPreparationRequest = {
    notation: result.data.notation,
    repetitions: result.data.repetitions,
    userId: result.data.userId,
    guildId: result.data.guildId,
  };
  if (result.data.renderSeed !== undefined) {
    request.renderSeed = result.data.renderSeed;
  }
  return request;
}

function previewDice(
  target: AppearanceTarget,
  modifiers: string[],
): RollDie[] {
  switch (target) {
    case "d4":
      return [{ sides: 4, rolled: 4, modifiers }];
    case "d6":
      return [{ sides: 6, rolled: 6, modifiers }];
    case "d8":
      return [{ sides: 8, rolled: 8, modifiers }];
    case "d10":
      return [{ sides: 10, rolled: 9, modifiers }];
    case "d12":
      return [{ sides: 12, rolled: 12, modifiers }];
    case "d20":
      return [{ sides: 20, rolled: 20, modifiers }];
    case "percentile": {
      const identity = "appearance-preview:percentile:0";
      return [
        {
          sides: "%",
          rolled: 90,
          modifiers,
          appearanceDieIdentity: `${identity}:percentile`,
        },
        {
          sides: 10,
          rolled: 9,
          modifiers,
          appearanceDieIdentity: `${identity}:ones`,
        },
      ];
    }
    case "fudge":
      return [{ sides: "F", rolled: 1, modifiers }];
    case "other":
      return [{ sides: 100, rolled: 73, modifiers }];
  }
}

function previewOutcome(
  target: AppearanceTarget | "all",
  state: AppearancePreviewState,
  seed: number,
): RollExecutionResult {
  const modifiers = state === "normal" ? [] : [state];
  const targets = target === "all" ? APPEARANCE_TARGETS : [target];
  const dice = targets.flatMap((previewTarget) =>
    previewDice(previewTarget, modifiers),
  );
  const rows = target === "all" ? [dice.slice(0, 5), dice.slice(5)] : [dice];
  return {
    version: 1,
    seed,
    outcomes: rows.map((row) => ({
      notation: "appearance-preview",
      output: "appearance-preview",
      total: 0,
      dice: row,
    })),
    errors: [],
  };
}

function completePreviewRecipes<Recipe>(
  recipe: Recipe,
  overrides: Readonly<Partial<Record<AppearanceTarget, Recipe>>> | undefined,
) {
  return {
    d4: overrides?.d4 ?? recipe,
    d6: overrides?.d6 ?? recipe,
    d8: overrides?.d8 ?? recipe,
    d10: overrides?.d10 ?? recipe,
    d12: overrides?.d12 ?? recipe,
    d20: overrides?.d20 ?? recipe,
    percentile: overrides?.percentile ?? recipe,
    fudge: overrides?.fudge ?? recipe,
    other: overrides?.other ?? recipe,
  };
}

export function buildAppearancePreviewRenderRequest(
  value: SchemaInput,
): RenderRequestV2 {
  const request = parseAppearancePreviewRequest(
    value,
    APPEARANCE_VALIDATION_CATALOG,
  );
  const recipes: EffectiveAppearanceRecipesV1 = completePreviewRecipes(
    request.recipe,
    undefined,
  );
  return buildRollRenderRequestV2(
    previewOutcome(request.target, request.state, request.seed),
    request.seed,
    recipes,
  );
}

export function buildAppearancePreviewRenderRequestV3(
  value: SchemaInput,
): RenderRequestV3 {
  const request = parseAppearancePreviewRequestV2(
    value,
    APPEARANCE_VALIDATION_CATALOG,
  );
  const recipes: EffectiveAppearanceRecipesV2 = completePreviewRecipes(
    request.recipe,
    undefined,
  );
  return buildRollRenderRequestV3(
    previewOutcome(request.target, request.state, request.seed),
    request.seed,
    recipes,
  );
}

export function buildAppearancePreviewRenderRequestV4(
  value: SchemaInput,
): RenderRequestV4 {
  const request = parseAppearancePreviewRequestV3(value);
  const effectiveAppearance: EffectiveAppearanceV4 = {
    version: 4,
    recipes: completePreviewRecipes(request.recipe, undefined),
    diceView: createDefaultDiceViewPreferencesV4(),
  };
  return buildRollRenderRequestR34V4(
    previewOutcome(request.target, request.state, request.seed),
    request.seed,
    effectiveAppearance,
  );
}

export function buildAppearancePreviewRenderRequestR19V4(
  value: SchemaInput,
): RenderRequestV4 {
  const request = parseAppearancePreviewRequestV4(value);
  return buildRollRenderRequestV4(
    previewOutcome(request.target, request.state, request.seed),
    request.seed,
    completePreviewRecipes(request.recipe, request.overrides),
  );
}

function buildResolvedAppearancePreviewRenderRequestV4(
  value: SchemaInput,
  buildRequest: typeof buildRollRenderRequestR20V4,
): RenderRequestV4 {
  const request = parseAppearancePreviewRequestV4(value);
  const effectiveAppearance: EffectiveAppearanceV4 = {
    version: 4,
    recipes: completePreviewRecipes(request.recipe, request.overrides),
    diceView: request.diceView,
  };
  return buildRequest(
    previewOutcome(request.target, request.state, request.seed),
    request.seed,
    effectiveAppearance,
  );
}

export function buildAppearancePreviewRenderRequestR20V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR20V4,
  );
}

export function buildAppearancePreviewRenderRequestR21V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR21V4,
  );
}

export function buildAppearancePreviewRenderRequestR22V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR22V4,
  );
}

export function buildAppearancePreviewRenderRequestR23V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR23V4,
  );
}

export function buildAppearancePreviewRenderRequestR24V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR24V4,
  );
}

export function buildAppearancePreviewRenderRequestR25V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR25V4,
  );
}

export function buildAppearancePreviewRenderRequestR26V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR26V4,
  );
}

export function buildAppearancePreviewRenderRequestR27V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR27V4,
  );
}

export function buildAppearancePreviewRenderRequestR28V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR28V4,
  );
}

export function buildAppearancePreviewRenderRequestR29V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR29V4,
  );
}

export function buildAppearancePreviewRenderRequestR30V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR30V4,
  );
}

export function buildAppearancePreviewRenderRequestR31V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR31V4,
  );
}

export function buildAppearancePreviewRenderRequestR32V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR32V4,
  );
}

export function buildAppearancePreviewRenderRequestR33V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR33V4,
  );
}

export function buildAppearancePreviewRenderRequestR34V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR34V4,
  );
}

export function buildAppearancePreviewRenderRequestR35V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR35V4,
  );
}

export function buildAppearancePreviewRenderRequestR36V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR36V4,
  );
}

export function buildAppearancePreviewRenderRequestR37V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR37V4,
  );
}

export function buildAppearancePreviewRenderRequestR38V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR38V4,
  );
}

export function buildAppearancePreviewRenderRequestR39V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR39V4,
  );
}

export function buildAppearancePreviewRenderRequestR40V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR40V4,
  );
}

export function buildAppearancePreviewRenderRequestR41V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR41V4,
  );
}

export function buildAppearancePreviewRenderRequestR42V4(
  value: SchemaInput,
): RenderRequestV4 {
  return buildResolvedAppearancePreviewRenderRequestV4(
    value,
    buildRollRenderRequestR42V4,
  );
}

export function buildAppearancePreviewRenderRequestForPolicyV4(
  value: SchemaInput,
  viewPolicy: RollViewPolicy,
): RenderRequestV4 {
  switch (viewPolicy) {
    case "r19":
      return buildAppearancePreviewRenderRequestR19V4(value);
    case "r20":
      return buildAppearancePreviewRenderRequestR20V4(value);
    case "r21":
      return buildAppearancePreviewRenderRequestR21V4(value);
    case "r22":
      return buildAppearancePreviewRenderRequestR22V4(value);
    case "r23":
      return buildAppearancePreviewRenderRequestR23V4(value);
    case "r24":
      return buildAppearancePreviewRenderRequestR24V4(value);
    case "r25":
      return buildAppearancePreviewRenderRequestR25V4(value);
    case "r26":
      return buildAppearancePreviewRenderRequestR26V4(value);
    case "r27":
      return buildAppearancePreviewRenderRequestR27V4(value);
    case "r28":
      return buildAppearancePreviewRenderRequestR28V4(value);
    case "r29":
      return buildAppearancePreviewRenderRequestR29V4(value);
    case "r30":
      return buildAppearancePreviewRenderRequestR30V4(value);
    case "r31":
      return buildAppearancePreviewRenderRequestR31V4(value);
    case "r32":
      return buildAppearancePreviewRenderRequestR32V4(value);
    case "r33":
      return buildAppearancePreviewRenderRequestR33V4(value);
    case "r34":
      return buildAppearancePreviewRenderRequestR34V4(value);
    case "r35":
      return buildAppearancePreviewRenderRequestR35V4(value);
    case "r36":
      return buildAppearancePreviewRenderRequestR36V4(value);
    case "r37":
      return buildAppearancePreviewRenderRequestR37V4(value);
    case "r38":
      return buildAppearancePreviewRenderRequestR38V4(value);
    case "r39":
      return buildAppearancePreviewRenderRequestR39V4(value);
    case "r40":
      return buildAppearancePreviewRenderRequestR40V4(value);
    case "r41":
      return buildAppearancePreviewRenderRequestR41V4(value);
    case "r42":
      return buildAppearancePreviewRenderRequestR42V4(value);
  }
}

export async function renderAppearancePreview(
  value: SchemaInput,
): Promise<AppearancePreviewResult> {
  return {
    ...(await renderDiceRequestV2ToPng(
      buildAppearancePreviewRenderRequest(value),
    )),
    contentType: "image/png",
  };
}

export async function renderAppearancePreviewV2(
  value: SchemaInput,
): Promise<AppearancePreviewResultV2> {
  return {
    ...(await renderDiceRequestV3ToPng(
      buildAppearancePreviewRenderRequestV3(value),
    )),
    contentType: "image/png",
  };
}

async function renderAppearancePreviewRequestV4(
  request: RenderRequestV4,
  createRenderer: DiceRequestRendererFactoryV4,
): Promise<AppearancePreviewResultV3> {
  const rendered = await renderV4WithSingleRetry(
    serializeRenderRequestV4(request),
    createRenderer,
    { preserveGroupRows: true },
  );
  return {
    version: 4,
    contentType: "image/png",
    width: rendered.width,
    height: rendered.height,
    diceCount: rendered.diceCount,
    rowCount: rendered.rowCount,
    png: rendered.png,
  };
}

export function renderAppearancePreviewV3(
  value: SchemaInput,
  createRenderer: DiceRequestRendererFactoryV4 =
    createCanvasKitRequestRendererV4,
): Promise<AppearancePreviewResultV3> {
  return renderAppearancePreviewRequestV4(
    buildAppearancePreviewRenderRequestV4(value),
    createRenderer,
  );
}

export function renderAppearancePreviewV4(
  value: SchemaInput,
  viewPolicy: RollViewPolicy,
  createRenderer: DiceRequestRendererFactoryV4 =
    createCanvasKitRequestRendererV4,
): Promise<AppearancePreviewResultV4> {
  return renderAppearancePreviewRequestV4(
    buildAppearancePreviewRenderRequestForPolicyV4(value, viewPolicy),
    createRenderer,
  );
}

function randomSeed(): number {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (seed === undefined) throw new Error("Roll seed generation failed");
  return seed;
}

type LoadedWebAppearance = {
  viewPolicy: RollViewPolicy;
  effective: EffectiveAppearanceV4;
};

async function loadWebAppearance(
  dataService: AppearanceDataService,
  viewPolicy: RollViewPolicy,
  userId: string,
  guildId: string,
): Promise<LoadedWebAppearance> {
  return {
    viewPolicy,
    effective: await loadEffectiveAppearanceV4(dataService, userId, guildId),
  };
}

async function renderAppearanceDigest(
  renderRequest: RenderRequestV4,
  outcome: RollExecutionResult,
): Promise<string> {
  const renderedDice = renderRequest.groups.flat();
  const outcomeDice = outcome.outcomes.flatMap(({ dice }) => dice);
  if (renderedDice.length !== outcomeDice.length) {
    throw new Error("Web roll appearance identity shape does not match render data");
  }
  const dice = renderedDice
    .map((die, index) => {
      const identity = outcomeDice[index]?.appearanceDieIdentity;
      if (identity === undefined) {
        throw new Error("Web roll appearance identity is missing");
      }
      const digestDie = {
        identity,
        target: die.target,
        form: die.form,
        appearance: { ...die.appearance, effect: null },
      };
      if (die.target === "other") {
        return { ...digestDie, sides: die.sides };
      }
      return digestDie;
    })
    .filter(({ identity }) => !identity.includes(":generated:"))
    .sort((left, right) => left.identity.localeCompare(right.identity));
  const contract = {
    version: renderRequest.version,
    rendererRevision: renderRequest.rendererRevision,
    dice,
  };
  const bytes = new TextEncoder().encode(canonicalJsonV4(contract));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function buildWebRenderRequest(
  outcome: RollExecutionResult,
  renderSeed: number,
  appearance: LoadedWebAppearance,
): RenderRequestV4 {
  return appearance.viewPolicy === "r19"
    ? buildRollRenderRequestV4(
        outcome,
        renderSeed,
        appearance.effective.recipes,
      )
    : ROLL_VIEW_BUILDERS_V4[appearance.viewPolicy](
        outcome,
        renderSeed,
        appearance.effective,
      );
}

function appearanceIdentities(outcome: RollExecutionResult): string[][] {
  return outcome.outcomes.map(({ dice }) =>
    dice.map(({ appearanceDieIdentity }) => {
      if (appearanceDieIdentity === undefined) {
        throw new Error("Web roll appearance identity is missing");
      }
      return appearanceDieIdentity;
    }),
  );
}

function rerolledAppearanceIdentities(
  outcome: RollExecutionResult,
): string[] {
  return outcome.outcomes.flatMap(({ dice }) => {
    const available = new Set(
      dice.map(({ appearanceDieIdentity }) => {
        if (appearanceDieIdentity === undefined) {
          throw new Error("Web roll appearance identity is missing");
        }
        return appearanceDieIdentity;
      }),
    );
    const rerolled = new Set<string>();
    for (const die of dice) {
      if (
        !die.modifiers.some(
          (modifier) =>
            modifier === "re-roll" ||
            modifier === "re-roll-once" ||
            modifier === "reroll",
        )
      ) {
        continue;
      }
      const identity = die.appearanceDieIdentity;
      if (identity === undefined) {
        throw new Error("Web roll appearance identity is missing");
      }
      rerolled.add(identity);
      if (die.sides === "%" && identity.endsWith(":percentile")) {
        const onesIdentity = `${identity.slice(0, -":percentile".length)}:ones`;
        if (!available.has(onesIdentity)) {
          throw new Error("Web roll percentile appearance identity is missing");
        }
        rerolled.add(onesIdentity);
      }
    }
    return [...rerolled];
  });
}

function legacySidesV4(die: RenderDieV4): number | "%" | "F" {
  switch (die.target) {
    case "d4":
      return 4;
    case "d6":
      return 6;
    case "d8":
      return 8;
    case "d10":
      return 10;
    case "d12":
      return 12;
    case "d20":
      return 20;
    case "percentile":
      return "%";
    case "fudge":
      return "F";
    case "other":
      return die.sides;
  }
}

function legacyDieV4(die: RenderDieV4): WebRollDie {
  return {
    sides: legacySidesV4(die),
    rolled: die.result,
    value: die.result,
    icon: die.icons,
    color: die.appearance.palette[0],
    secondaryColor: die.appearance.palette[1],
    textColor: die.appearance.engraving.color,
  };
}

function webDiceArray(renderRequest: RenderRequestV4): WebRollDie[][] {
  return renderRequest.groups.map((group) => group.map(legacyDieV4));
}

export async function prepareWebRoll(
  value: SchemaInput,
  dataService: AppearanceDataService,
  configuredRenderVersion: SchemaInput,
  configuredViewPolicy: SchemaInput,
): Promise<WebRollPreparationResult> {
  const request = validatePreparationRequest(value);
  const renderSeed = request.renderSeed ?? randomSeed();
  parseRollRenderVersion(configuredRenderVersion);
  const viewPolicy = parseRollViewPolicy(configuredViewPolicy);
  const appearance = await loadWebAppearance(
    dataService,
    viewPolicy,
    request.userId,
    request.guildId,
  );
  const outcome = prepareRollAppearance({
    notation: parseNotationArgs(request.notation),
    repetitions: request.repetitions,
    seed: renderSeed,
    stableAppearanceIdentities: true,
  });
  if (outcome.outcomes.length === 0) {
    return {
      status: "invalid",
      message: rollErrorText(outcome),
    };
  }
  const renderRequest = buildWebRenderRequest(
    outcome,
    renderSeed,
    appearance,
  );
  const digest = await renderAppearanceDigest(renderRequest, outcome);
  const rendered = await renderV4WithSingleRetry(
    serializeRenderRequestV4(renderRequest),
    createCanvasKitRequestRendererV4,
    { blankFaces: true },
  );
  return {
    status: "prepared",
    renderSeed,
    appearanceDigest: digest,
    groupSizes: renderRequest.groups.map((group) => group.length),
    appearanceIdentities: appearanceIdentities(outcome),
    renderedImage: {
      contentType: "image/png",
      width: rendered.width,
      height: rendered.height,
      png: rendered.png,
    },
    renderModel: renderRequest,
  };
}

export async function executeWebRoll(
  value: SchemaInput,
  dataService: AppearanceDataService,
  configuredRenderVersion: SchemaInput,
  configuredViewPolicy: SchemaInput,
  createRollSeed: () => number = randomSeed,
  createRenderSeed: () => number = randomSeed,
): Promise<WebRollResult> {
  const request = validateRequest(value);
  const renderSeed = request.renderSeed ?? createRenderSeed();
  parseRollRenderVersion(configuredRenderVersion);
  const viewPolicy = parseRollViewPolicy(configuredViewPolicy);
  const validation = prepareRollAppearance({
    notation: parseNotationArgs(request.notation),
    repetitions: request.repetitions,
    seed: renderSeed,
    stableAppearanceIdentities: true,
  });
  if (validation.outcomes.length === 0) {
    return {
      status: "invalid",
      message: rollErrorText(validation),
    };
  }
  const appearance = await loadWebAppearance(
    dataService,
    viewPolicy,
    request.userId,
    request.guildId,
  );
  const outcome = executeRoll({
    notation: parseNotationArgs(request.notation),
    repetitions: request.repetitions,
    seed: createRollSeed(),
    stableAppearanceIdentities: true,
    preserveOutOfRangePhysicalFaces: true,
  });
  if (outcome.outcomes.length === 0) {
    return {
      status: "invalid",
      message: rollErrorText(outcome),
    };
  }

  const renderRequest = buildWebRenderRequest(
    outcome,
    renderSeed,
    appearance,
  );
  if (
    request.appearanceDigest !== undefined &&
    (await renderAppearanceDigest(renderRequest, outcome)) !==
      request.appearanceDigest
  ) {
    return {
      status: "stale",
      message: "Prepared appearance has changed; prepare the roll again",
    };
  }
  const rendered = await renderV4WithSingleRetry(
    serializeRenderRequestV4(renderRequest),
    createCanvasKitRequestRendererV4,
  );
  const filename = "dice-witch-roll.png";
  const clatter = rollClatterText(outcome, outcome.seed);
  const messageOptions: RollResultMessageOptions = {
    source: "web",
    title: request.title,
    repetitions: request.repetitions,
    username: request.username,
    filename,
  };
  if (request.saveRollCustomId !== undefined) {
    messageOptions.saveRollCustomId = request.saveRollCustomId;
  }
  if (request.textResultCustomId !== undefined) {
    messageOptions.textResultCustomId = request.textResultCustomId;
  }
  if (request.savedRoll !== undefined) {
    messageOptions.savedRoll = {
      scope: request.savedRoll.scope === "personal" ? "Mine" : "Server",
      name: request.savedRoll.name,
    };
  }
  return {
    status: "rolled",
    message: "Roll processed successfully",
    diceArray: webDiceArray(renderRequest),
    resultArray: outcome.outcomes.map(({ output, total }) => ({
      output,
      results: total,
    })),
    renderedImage: {
      contentType: "image/png",
      width: rendered.width,
      height: rendered.height,
      png: rendered.png,
    },
    renderModel: renderRequest,
    appearanceIdentities: appearanceIdentities(outcome),
    rerolledAppearanceIdentities: rerolledAppearanceIdentities(outcome),
    discord: {
      payload: buildRollResultMessage(outcome, messageOptions),
      clatter,
      resultText: rollResultText(outcome),
      filename,
      png: rendered.png,
    },
  };
}

const WebDeliveryRouteSchema = z.object({
  deliveryId: z.string(),
  userId: z.unknown().optional(),
});
const WebRollDieSchema = z.strictObject({
  sides: z.union([z.number(), z.literal("%"), z.literal("F")]),
  rolled: z.number(),
  value: z.number(),
  icon: z.array(z.string()),
  color: z.string(),
  secondaryColor: z.string(),
  textColor: z.string(),
});
const WebRenderedImageSchema = z.strictObject({
  contentType: z.literal("image/png"),
  width: safeIntegerSchema.positive(),
  height: safeIntegerSchema.positive(),
  png: z.instanceof(Uint8Array),
});
const WebRolledResultSchema = z.strictObject({
  status: z.literal("rolled"),
  message: z.string(),
  diceArray: z.array(z.array(WebRollDieSchema)),
  resultArray: z.array(
    z.strictObject({ output: z.string(), results: z.number() }),
  ),
  renderedImage: WebRenderedImageSchema,
  renderModel: z.unknown().optional(),
  appearanceIdentities: z.array(z.array(z.string())),
  rerolledAppearanceIdentities: z.array(z.string()),
  deliveryStatus: z
    .enum(["delivered", "failed", "pending", "permission_error"])
    .optional(),
  discord: z.strictObject({
    payload: z.unknown(),
    clatter: z.string(),
    resultText: z.string(),
    filename: z.string(),
    png: z.instanceof(Uint8Array),
  }),
});
const WebDeliveryExecutionResultSchema = z.union([
  z.strictObject({ status: z.literal("conflict") }),
  z.strictObject({ status: z.literal("expired") }),
  z.strictObject({
    status: z.literal("invalid"),
    roll: z.strictObject({ status: z.literal("invalid"), message: z.string() }),
  }),
  z.strictObject({
    status: z.literal("stale"),
    roll: z.strictObject({ status: z.literal("stale"), message: z.string() }),
  }),
  z.strictObject({
    status: z.enum(["delivered", "failed", "pending", "permission_error"]),
    roll: WebRolledResultSchema,
  }),
]);

type RolledWebRollResult = Extract<WebRollResult, { status: "rolled" }>;

function parseRolledWebDeliveryResult(
  value: z.output<typeof WebRolledResultSchema>,
): RolledWebRollResult {
  let result: RolledWebRollResult;
  if (value.renderModel === undefined) {
    result = {
      status: "rolled",
      message: value.message,
      diceArray: value.diceArray,
      resultArray: value.resultArray,
      renderedImage: value.renderedImage,
      appearanceIdentities: value.appearanceIdentities,
      rerolledAppearanceIdentities: value.rerolledAppearanceIdentities,
      discord: value.discord,
    };
  } else {
    result = {
      status: "rolled",
      message: value.message,
      diceArray: value.diceArray,
      resultArray: value.resultArray,
      renderedImage: value.renderedImage,
      renderModel: validateRenderRequestV4(value.renderModel),
      appearanceIdentities: value.appearanceIdentities,
      rerolledAppearanceIdentities: value.rerolledAppearanceIdentities,
      discord: value.discord,
    };
  }
  if (value.deliveryStatus !== undefined) {
    result.deliveryStatus = value.deliveryStatus;
  }
  return result;
}

function parseWebDeliveryExecutionResult(
  value: SchemaInput,
): WebDeliveryExecutionResult {
  const result = WebDeliveryExecutionResultSchema.safeParse(value);
  if (!result.success) throw new Error("Web delivery response is invalid");
  if (
    result.data.status === "conflict" ||
    result.data.status === "expired"
  ) {
    return result.data;
  }
  if (result.data.status === "invalid" || result.data.status === "stale") {
    return result.data;
  }
  return {
    status: result.data.status,
    roll: parseRolledWebDeliveryResult(result.data.roll),
  };
}

export class WebRollService extends WorkerEntrypoint<WebRollEnv> {
  prepare(value: SchemaInput): Promise<WebRollPreparationResult> {
    return prepareWebRoll(
      value,
      this.env.DATA_SERVICE,
      this.env.ROLL_RENDER_VERSION,
      this.env.ROLL_VIEW_POLICY,
    );
  }

  async execute(value: SchemaInput): Promise<WebRollResult> {
    const route = WebDeliveryRouteSchema.safeParse(value);
    if (route.success) {
      const userId = z.string().safeParse(route.data.userId);
      if (!userId.success) {
        throw new Error("Web delivery user identity is missing");
      }
      const delivery = parseWebDeliveryExecutionResult(
        await this.env.WEB_DELIVERY_WORK
          .getByName(`${userId.data}:${route.data.deliveryId}`)
          .execute(value),
      );
      switch (delivery.status) {
        case "conflict":
          return {
            status: "conflict",
            message: "Web delivery identity conflicts with an existing roll",
          };
        case "expired":
          return {
            status: "expired",
            message: "Web delivery result has expired",
          };
        case "invalid":
        case "stale":
          return delivery.roll;
        default:
          return { ...delivery.roll, deliveryStatus: delivery.status };
      }
    }
    return executeWebRoll(
      value,
      this.env.DATA_SERVICE,
      this.env.ROLL_RENDER_VERSION,
      this.env.ROLL_VIEW_POLICY,
    );
  }

  previewV4(value: SchemaInput): Promise<AppearancePreviewResultV4> {
    return renderAppearancePreviewV4(
      value,
      parseRollViewPolicy(this.env.ROLL_VIEW_POLICY),
    );
  }

  previewRendererRevisionV4(): RendererRevisionV4 {
    return rendererRevisionForViewPolicyV4(
      parseRollViewPolicy(this.env.ROLL_VIEW_POLICY),
    );
  }
}

function isRendererRevisionV4(value: string): value is RendererRevisionV4 {
  return RENDERER_REVISIONS_V4.some((revision) => revision === value);
}

function rendererRevisionForViewPolicyV4(
  policy: RollViewPolicy,
): RendererRevisionV4 {
  const revision = `canvaskit-v4-${policy}`;
  if (!isRendererRevisionV4(revision)) {
    throw new Error(`Roll view policy ${policy} has no renderer revision`);
  }
  return revision;
}
