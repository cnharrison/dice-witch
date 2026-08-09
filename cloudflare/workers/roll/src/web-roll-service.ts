import {
  canonicalJsonV4,
  serializeRenderRequestV4,
  type PublicRenderModelV4,
  type RenderDieV4,
  type RenderRequestV4,
} from "@dice-witch/dice-v4-model";
import { WorkerEntrypoint } from "cloudflare:workers";
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
  type EffectiveAppearanceRecipesV3,
  type EffectiveAppearanceV4,
} from "../../../packages/dice-appearance/src";
import {
  renderBlankDiceRequestV3ToPng,
  renderDiceRequestV2ToPng,
  renderDiceRequestV3ToPng,
  type RenderDieV3,
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
} from "../../../packages/discord-contracts/src";
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
} from "../../../packages/roll-render-model/src";
import {
  loadEffectiveAppearanceV2,
  loadEffectiveAppearanceV3,
  loadEffectiveAppearanceV4,
  type AppearanceDataService,
} from "./appearance";
import {
  parseRollRenderVersion,
  parseRollViewPolicy,
  type RollRenderVersion,
  type RollViewPolicy,
} from "./render-version";
import type { WebDeliveryExecutionResult } from "./web-delivery-work";
type WebRollEnv = RollBindings;

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

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

export function parseWebSavedRollAttribution(
  value: unknown,
): WebSavedRollAttribution {
  if (!isRecord(value)) {
    throw new Error("Web Library roll attribution is invalid");
  }
  if (
    (!hasExactKeys(value, ["name", "scope"]) &&
      !hasExactKeys(value, ["name", "nameColor", "scope"])) ||
    (value.scope !== "personal" && value.scope !== "guild") ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 1_024 ||
    (value.nameColor !== undefined &&
      value.nameColor !== null &&
      (typeof value.nameColor !== "string" ||
        !/^#[0-9A-F]{6}$/.test(value.nameColor)))
  ) {
    throw new Error("Web Library roll attribution is invalid");
  }
  return {
    scope: value.scope,
    name: value.name,
    nameColor: typeof value.nameColor === "string" ? value.nameColor : null,
  };
}

function validateRequest(value: unknown): WebRollRequest {
  const legacyKeys = [
    "guildId",
    "notation",
    "repetitions",
    "title",
    "userId",
    "username",
  ] as const;
  const hasSavedRoll = isRecord(value) && value.savedRoll !== undefined;
  const hasSaveRollCustomId = isRecord(value) &&
    value.saveRollCustomId !== undefined;
  const requestKeys = [
    ...legacyKeys,
    ...(hasSavedRoll ? ["savedRoll" as const] : []),
    ...(hasSaveRollCustomId ? ["saveRollCustomId" as const] : []),
  ];
  const prepared =
    isRecord(value) &&
    hasExactKeys(value, [...requestKeys, "appearanceDigest", "renderSeed"]);
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, requestKeys) && !prepared) ||
    (prepared &&
      (typeof value.appearanceDigest !== "string" ||
        !/^[0-9a-f]{64}$/.test(value.appearanceDigest))) ||
    typeof value.notation !== "string" ||
    value.notation.length < 1 ||
    value.notation.length > 6_000 ||
    (prepared &&
      (typeof value.renderSeed !== "number" ||
        !Number.isInteger(value.renderSeed) ||
        value.renderSeed < 0 ||
        value.renderSeed > 0xffff_ffff)) ||
    typeof value.repetitions !== "number" ||
    !Number.isSafeInteger(value.repetitions) ||
    value.repetitions < 1 ||
    value.repetitions > 50 ||
    typeof value.username !== "string" ||
    value.username.length < 1 ||
    value.username.length > 32 ||
    typeof value.userId !== "string" ||
    !SNOWFLAKE.test(value.userId) ||
    typeof value.guildId !== "string" ||
    !SNOWFLAKE.test(value.guildId) ||
    (hasSaveRollCustomId &&
      (typeof value.saveRollCustomId !== "string" ||
        value.saveRollCustomId.length < 1 ||
        value.saveRollCustomId.length > 100 ||
        !value.saveRollCustomId.startsWith("save-roll:v1:w:"))) ||
    (value.title !== null &&
      (typeof value.title !== "string" ||
        value.title.length < 1 ||
        value.title.length > 256))
  ) {
    throw new Error("Web roll request is invalid");
  }
  return {
    notation: value.notation,
    repetitions: value.repetitions,
    username: value.username,
    title: value.title,
    userId: value.userId,
    guildId: value.guildId,
    ...(hasSavedRoll
      ? { savedRoll: parseWebSavedRollAttribution(value.savedRoll) }
      : {}),
    ...(hasSaveRollCustomId
      ? { saveRollCustomId: value.saveRollCustomId as string }
      : {}),
    ...(prepared
      ? {
          renderSeed: value.renderSeed as number,
          appearanceDigest: value.appearanceDigest as string,
        }
      : {}),
  };
}

function validatePreparationRequest(
  value: unknown,
): WebRollPreparationRequest {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ["guildId", "notation", "repetitions", "userId"]) &&
      !hasExactKeys(value, [
        "guildId",
        "notation",
        "renderSeed",
        "repetitions",
        "userId",
      ])) ||
    typeof value.notation !== "string" ||
    value.notation.length < 1 ||
    value.notation.length > 6_000 ||
    typeof value.repetitions !== "number" ||
    !Number.isSafeInteger(value.repetitions) ||
    value.repetitions < 1 ||
    value.repetitions > 50 ||
    (value.renderSeed !== undefined &&
      (typeof value.renderSeed !== "number" ||
        !Number.isInteger(value.renderSeed) ||
        value.renderSeed < 0 ||
        value.renderSeed > 0xffff_ffff)) ||
    typeof value.userId !== "string" ||
    !SNOWFLAKE.test(value.userId) ||
    typeof value.guildId !== "string" ||
    !SNOWFLAKE.test(value.guildId)
  ) {
    throw new Error("Web roll preparation request is invalid");
  }
  return {
    notation: value.notation,
    repetitions: value.repetitions,
    userId: value.userId,
    guildId: value.guildId,
    ...(value.renderSeed === undefined ? {} : { renderSeed: value.renderSeed }),
  };
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
    case "percentile":
      return [
        { sides: "%", rolled: 90, modifiers },
        { sides: 10, rolled: 9, modifiers },
      ];
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

export function buildAppearancePreviewRenderRequest(
  value: unknown,
): RenderRequestV2 {
  const request = parseAppearancePreviewRequest(
    value,
    APPEARANCE_VALIDATION_CATALOG,
  );
  const recipes = Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, request.recipe]),
  ) as EffectiveAppearanceRecipesV1;
  return buildRollRenderRequestV2(
    previewOutcome(request.target, request.state, request.seed),
    request.seed,
    recipes,
  );
}

export function buildAppearancePreviewRenderRequestV3(
  value: unknown,
): RenderRequestV3 {
  const request = parseAppearancePreviewRequestV2(
    value,
    APPEARANCE_VALIDATION_CATALOG,
  );
  const recipes = Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, request.recipe]),
  ) as EffectiveAppearanceRecipesV2;
  return buildRollRenderRequestV3(
    previewOutcome(request.target, request.state, request.seed),
    request.seed,
    recipes,
  );
}

export function buildAppearancePreviewRenderRequestV4(
  value: unknown,
): RenderRequestV4 {
  const request = parseAppearancePreviewRequestV3(value);
  const recipes = Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, request.recipe]),
  ) as EffectiveAppearanceRecipesV3;
  return buildRollRenderRequestV4(
    previewOutcome(request.target, request.state, request.seed),
    request.seed,
    recipes,
  );
}

export function buildAppearancePreviewRenderRequestR20V4(
  value: unknown,
): RenderRequestV4 {
  const request = parseAppearancePreviewRequestV4(value);
  const effectiveAppearance: EffectiveAppearanceV4 = {
    version: 4,
    recipes: Object.fromEntries(
      APPEARANCE_TARGETS.map((target) => [target, request.recipe]),
    ) as EffectiveAppearanceV4["recipes"],
    diceView: request.diceView,
  };
  return buildRollRenderRequestR20V4(
    previewOutcome(request.target, request.state, request.seed),
    request.seed,
    effectiveAppearance,
  );
}

export async function renderAppearancePreview(
  value: unknown,
): Promise<AppearancePreviewResult> {
  return {
    ...(await renderDiceRequestV2ToPng(
      buildAppearancePreviewRenderRequest(value),
    )),
    contentType: "image/png",
  };
}

export async function renderAppearancePreviewV2(
  value: unknown,
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
  value: unknown,
  createRenderer: DiceRequestRendererFactoryV4 =
    createCanvasKitRequestRendererV4,
): Promise<AppearancePreviewResultV3> {
  return renderAppearancePreviewRequestV4(
    buildAppearancePreviewRenderRequestV4(value),
    createRenderer,
  );
}

export function renderAppearancePreviewV4(
  value: unknown,
  createRenderer: DiceRequestRendererFactoryV4 =
    createCanvasKitRequestRendererV4,
): Promise<AppearancePreviewResultV3> {
  return renderAppearancePreviewRequestV4(
    buildAppearancePreviewRenderRequestR20V4(value),
    createRenderer,
  );
}

function randomSeed(): number {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (seed === undefined) throw new Error("Roll seed generation failed");
  return seed;
}

type LoadedWebAppearance =
  | { version: 3; recipes: EffectiveAppearanceRecipesV2 }
  | { version: 4; viewPolicy: "r19"; recipes: EffectiveAppearanceRecipesV3 }
  | { version: 4; viewPolicy: "r20"; effective: EffectiveAppearanceV4 };

async function loadWebAppearance(
  dataService: AppearanceDataService,
  version: RollRenderVersion,
  viewPolicy: RollViewPolicy,
  userId: string,
  guildId: string,
): Promise<LoadedWebAppearance> {
  if (version === 3) {
    if (viewPolicy !== "r19") {
      throw new Error("ROLL_VIEW_POLICY r20 requires ROLL_RENDER_VERSION 4");
    }
    return {
      version,
      recipes: await loadEffectiveAppearanceV2(dataService, userId, guildId),
    };
  }
  return viewPolicy === "r20"
    ? {
        version,
        viewPolicy,
        effective: await loadEffectiveAppearanceV4(
          dataService,
          userId,
          guildId,
        ),
      }
    : {
        version,
        viewPolicy,
        recipes: await loadEffectiveAppearanceV3(
          dataService,
          userId,
          guildId,
        ),
      };
}

async function renderAppearanceDigest(
  renderRequest: RenderRequestV3 | RenderRequestV4,
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
      return {
        identity,
        target: die.target,
        ...("sides" in die ? { sides: die.sides } : {}),
        ...("form" in die ? { form: die.form } : {}),
        appearance: { ...die.appearance, effect: null },
      };
    })
    .filter(({ identity }) => !identity.includes(":generated:"))
    .sort((left, right) => left.identity.localeCompare(right.identity));
  const contract = {
    version: renderRequest.version,
    ...(renderRequest.version === 4
      ? { rendererRevision: renderRequest.rendererRevision }
      : {}),
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
): RenderRequestV3 | RenderRequestV4 {
  if (appearance.version === 3) {
    return buildRollRenderRequestV3(outcome, renderSeed, appearance.recipes);
  }
  return appearance.viewPolicy === "r20"
    ? buildRollRenderRequestR20V4(outcome, renderSeed, appearance.effective)
    : buildRollRenderRequestV4(outcome, renderSeed, appearance.recipes);
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

function legacySides(die: RenderDieV3): number | "%" | "F" {
  switch (die.target) {
    case "d4":
      return 4;
    case "d6":
      return 6;
    case "d8":
      return 8;
    case "d10":
    case "d10-original":
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

function legacyColors(die: RenderDieV3): {
  color: string;
  secondaryColor: string;
} {
  const surface = die.appearance.surface;
  if (surface.type === "solid") {
    return { color: surface.color, secondaryColor: surface.color };
  }
  if (surface.type === "gradient") {
    return { color: surface.colors[0], secondaryColor: surface.colors[1] };
  }
  return {
    color: surface.primaryColor,
    secondaryColor: surface.secondaryColor,
  };
}

function legacyDieV3(die: RenderDieV3): WebRollDie {
  return {
    sides: legacySides(die),
    rolled: die.result,
    value: die.result,
    icon: die.icons,
    ...legacyColors(die),
    textColor: die.appearance.textColor,
  };
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

function webDiceArray(
  renderRequest: RenderRequestV3 | RenderRequestV4,
): WebRollDie[][] {
  return renderRequest.version === 3
    ? renderRequest.groups.map((group) => group.map(legacyDieV3))
    : renderRequest.groups.map((group) => group.map(legacyDieV4));
}

export async function prepareWebRoll(
  value: unknown,
  dataService: AppearanceDataService,
  configuredRenderVersion: unknown,
  configuredViewPolicy: unknown,
): Promise<WebRollPreparationResult> {
  const request = validatePreparationRequest(value);
  const renderSeed = request.renderSeed ?? randomSeed();
  const version = parseRollRenderVersion(configuredRenderVersion);
  const viewPolicy = parseRollViewPolicy(configuredViewPolicy);
  const appearance = await loadWebAppearance(
    dataService,
    version,
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
  const rendered =
    renderRequest.version === 3
      ? await renderBlankDiceRequestV3ToPng(renderRequest)
      : await renderV4WithSingleRetry(
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
    ...(renderRequest.version === 4 ? { renderModel: renderRequest } : {}),
  };
}

export async function executeWebRoll(
  value: unknown,
  dataService: AppearanceDataService,
  configuredRenderVersion: unknown,
  configuredViewPolicy: unknown,
  createRollSeed: () => number = randomSeed,
  createRenderSeed: () => number = randomSeed,
): Promise<WebRollResult> {
  const request = validateRequest(value);
  const renderSeed = request.renderSeed ?? createRenderSeed();
  const version = parseRollRenderVersion(configuredRenderVersion);
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
    version,
    viewPolicy,
    request.userId,
    request.guildId,
  );
  const outcome = executeRoll({
    notation: parseNotationArgs(request.notation),
    repetitions: request.repetitions,
    seed: createRollSeed(),
    stableAppearanceIdentities: true,
    preserveOutOfRangePhysicalFaces: version === 4,
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
  const rendered =
    renderRequest.version === 3
      ? await renderDiceRequestV3ToPng(renderRequest)
      : await renderV4WithSingleRetry(
          serializeRenderRequestV4(renderRequest),
          createCanvasKitRequestRendererV4,
        );
  const filename = "dice-witch-roll.png";
  const clatter = rollClatterText(outcome, outcome.seed);
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
    ...(renderRequest.version === 4 ? { renderModel: renderRequest } : {}),
    appearanceIdentities: appearanceIdentities(outcome),
    rerolledAppearanceIdentities: rerolledAppearanceIdentities(outcome),
    discord: {
      payload: buildRollResultMessage(outcome, {
        source: "web",
        title: request.title,
        repetitions: request.repetitions,
        username: request.username,
        filename,
        ...(request.saveRollCustomId === undefined
          ? {}
          : { saveRollCustomId: request.saveRollCustomId }),
        ...(request.savedRoll === undefined
          ? {}
          : {
              savedRoll: {
                scope: request.savedRoll.scope === "personal" ? "Mine" : "Server",
                name: request.savedRoll.name,
              },
            }),
      }),
      clatter,
      resultText: rollResultText(outcome),
      filename,
      png: rendered.png,
    },
  };
}

export class WebRollService extends WorkerEntrypoint<WebRollEnv> {
  prepare(value: unknown): Promise<WebRollPreparationResult> {
    return prepareWebRoll(
      value,
      this.env.DATA_SERVICE,
      this.env.ROLL_RENDER_VERSION,
      this.env.ROLL_VIEW_POLICY,
    );
  }

  async execute(value: unknown): Promise<WebRollResult> {
    if (isRecord(value) && typeof value.deliveryId === "string") {
      if (typeof value.userId !== "string") {
        throw new Error("Web delivery user identity is missing");
      }
      const delivery = (await this.env.WEB_DELIVERY_WORK
        .getByName(`${value.userId}:${value.deliveryId}`)
        .execute(value)) as unknown as WebDeliveryExecutionResult;
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

  preview(value: unknown): Promise<AppearancePreviewResult> {
    return renderAppearancePreview(value);
  }

  previewV2(value: unknown): Promise<AppearancePreviewResultV2> {
    return renderAppearancePreviewV2(value);
  }

  previewV3(value: unknown): Promise<AppearancePreviewResultV3> {
    return renderAppearancePreviewV3(value);
  }

  previewV4(value: unknown): Promise<AppearancePreviewResultV3> {
    return renderAppearancePreviewV4(value);
  }
}
