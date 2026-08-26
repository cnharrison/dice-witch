import {
  buildSaveRollDuplicateResponse,
  buildSaveRollErrorResponse,
  buildSaveRollModalResponse,
  buildSaveRollSuccessResponse,
  buildWebAppRouteUrl,
  type ParsedSaveRollInteractionV1,
  type SaveRollIntent,
  type SaveRollSourceV1,
  type SaveRollTitleMode,
} from "../../../packages/discord-contracts/src";
import { parseSavedRollNameV1 } from "../../../packages/saved-rolls/src/name";
import type {
  FetchPort,
  SaveRollIntentNamespace,
} from "./ports";
import {
  fetchVisibleSavedRolls,
  type VisibleSavedRollList,
  type VisibleSavedRollV1,
} from "./saved-roll-picker";
import {
  parseSaveMutationStatus,
  parseSaveRollIntentResult,
  type SaveRollIntentResult,
} from "./service-results";

const DISCORD_API_BASE = "https://discord.com/api/v10";

type SaveRollHandlerEnv = {
  DATA_SERVICE: FetchPort;
  ROLL_WORK: SaveRollIntentNamespace;
  WEB_DELIVERY_WORK: SaveRollIntentNamespace;
  WEB_APP_URL: string;
};

type PersonalLibraryState = {
  duplicate: VisibleSavedRollV1 | null;
  defaultName: string | null;
  defaultTitleMode: SaveRollTitleMode;
  nameConflict: boolean;
};

function matchingRoll(
  savedRoll: VisibleSavedRollV1,
  intent: SaveRollIntent,
): boolean {
  return savedRoll.notation === intent.notation &&
    savedRoll.repetitions === intent.repetitions;
}

function exactComposition(
  savedRoll: VisibleSavedRollV1,
  intent: SaveRollIntent,
  title: string | null,
): boolean {
  return matchingRoll(savedRoll, intent) && savedRoll.title === title;
}

function reusableTitleMode(
  savedRoll: VisibleSavedRollV1,
  intent: SaveRollIntent,
): SaveRollTitleMode | null {
  if (!matchingRoll(savedRoll, intent)) return null;
  if (savedRoll.title === null) return "none";
  return savedRoll.title === savedRoll.displayName ? "name" : null;
}

export function personalLibraryState(
  library: VisibleSavedRollList,
  intent: SaveRollIntent,
  title = intent.title,
): PersonalLibraryState {
  const duplicate = library.savedRolls.find((savedRoll) =>
    exactComposition(savedRoll, intent, title)
  ) ?? null;
  const defaultState = {
    duplicate,
    defaultName: null,
    defaultTitleMode: "name" as const,
    nameConflict: false,
  };
  if (intent.defaultName === null) return defaultState;

  let parsedDefault;
  try {
    parsedDefault = parseSavedRollNameV1(intent.defaultName);
  } catch {
    return defaultState;
  }
  const sameName = library.savedRolls.find(
    (savedRoll) => savedRoll.comparisonKey === parsedDefault.comparisonKey,
  );
  if (sameName !== undefined) {
    const defaultTitleMode = reusableTitleMode(sameName, intent);
    if (defaultTitleMode !== null) {
      return {
        duplicate,
        defaultName: sameName.displayName,
        defaultTitleMode,
        nameConflict: false,
      };
    }
  }
  const nameConflict = sameName !== undefined &&
    !exactComposition(sameName, intent, title);
  return {
    duplicate,
    defaultName: nameConflict ? null : parsedDefault.displayName,
    defaultTitleMode: "name",
    nameConflict,
  };
}

async function resolveIntent(
  env: SaveRollHandlerEnv,
  source: SaveRollSourceV1,
): Promise<SaveRollIntentResult> {
  const namespace = source.kind === "discord"
    ? env.ROLL_WORK
    : env.WEB_DELIVERY_WORK;
  const objectName = source.kind === "discord"
    ? source.id
    : `${source.userId}:${source.id}`;
  return parseSaveRollIntentResult(
    await namespace.getByName(objectName).getSaveRollIntent(),
  );
}

async function fetchPersonalLibrary(
  env: SaveRollHandlerEnv,
  userId: string,
): Promise<VisibleSavedRollList> {
  const visible = await fetchVisibleSavedRolls(
    env.DATA_SERVICE,
    userId,
    null,
  );
  return visible.mine;
}

function unavailableMessage(status: "expired" | "missing"): string {
  return status === "expired"
    ? "This Save roll button expired after 90 days. Roll it again to save a new copy."
    : "This roll is no longer available to save.";
}

function libraryUrl(env: SaveRollHandlerEnv): string {
  return buildWebAppRouteUrl(env.WEB_APP_URL, "library");
}

function duplicateResponse(
  env: SaveRollHandlerEnv,
  duplicate: VisibleSavedRollV1,
): ReturnType<typeof buildSaveRollDuplicateResponse> {
  return buildSaveRollDuplicateResponse(duplicate.displayName, libraryUrl(env));
}

function selectedTitle(
  interaction: ParsedSaveRollInteractionV1,
  intent: SaveRollIntent,
  name: string,
): { status: "valid"; title: string | null } | { status: "invalid"; message: string } {
  if (interaction.titleMode === "keep") {
    return { status: "valid", title: intent.title };
  }
  if (interaction.titleMode === "none") {
    return { status: "valid", title: null };
  }
  if (interaction.titleMode !== "name") {
    return { status: "invalid", message: "Choose a valid roll title option." };
  }
  if (name.length > 256) {
    return {
      status: "invalid",
      message: "That library name is too long to use as a title. Choose another title option.",
    };
  }
  return { status: "valid", title: name };
}

export async function openSaveRollModal(
  interaction: ParsedSaveRollInteractionV1,
  env: SaveRollHandlerEnv,
) {
  let resolved: SaveRollIntentResult;
  try {
    resolved = await resolveIntent(env, interaction.source);
  } catch {
    return buildSaveRollErrorResponse("Save roll is temporarily unavailable.");
  }
  if (resolved.status !== "available") {
    return buildSaveRollErrorResponse(unavailableMessage(resolved.status));
  }
  let library: VisibleSavedRollList;
  try {
    library = await fetchPersonalLibrary(env, interaction.userId);
  } catch {
    return buildSaveRollErrorResponse("Your personal library is temporarily unavailable.");
  }
  const state = personalLibraryState(library, resolved.intent);
  if (state.duplicate !== null) {
    return duplicateResponse(env, state.duplicate);
  }
  return buildSaveRollModalResponse(interaction.source, {
    defaultName: state.defaultName,
    defaultTitleMode: state.defaultTitleMode,
    nameConflict: state.nameConflict,
  });
}

async function deterministicUuidV4(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  const bytes = digest.slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function postData(
  env: SaveRollHandlerEnv,
  path: string,
  body: string,
): Promise<Response> {
  return env.DATA_SERVICE.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

async function ensureUser(
  env: SaveRollHandlerEnv,
  interaction: ParsedSaveRollInteractionV1,
  occurredAt: number,
): Promise<boolean> {
  try {
    const response = await postData(
      env,
      "/internal/saved-rolls/v1/ensure-user",
      JSON.stringify({
        userId: interaction.userId,
        username: interaction.username,
        occurredAt,
      }),
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function editOriginal(
  interaction: ParsedSaveRollInteractionV1,
  response: ReturnType<typeof buildSaveRollErrorResponse>,
): Promise<void> {
  const result = await fetch(
    `${DISCORD_API_BASE}/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...response.data,
        content: null,
        embeds: [],
      }),
    },
  );
  if (!result.ok) throw new Error("Private Save roll response failed");
}

function nameConflictResponse(
  interaction: ParsedSaveRollInteractionV1,
): ReturnType<typeof buildSaveRollErrorResponse> {
  return buildSaveRollErrorResponse(
    "That name is already used by another roll in your personal library.",
    interaction.source,
  );
}

async function submitSaveRoll(
  interaction: ParsedSaveRollInteractionV1,
  env: SaveRollHandlerEnv,
): Promise<ReturnType<typeof buildSaveRollErrorResponse>> {
  let name;
  try {
    name = parseSavedRollNameV1(interaction.name);
  } catch {
    return buildSaveRollErrorResponse(
      "Enter a valid library name using 1 through 80 Unicode characters.",
      interaction.source,
    );
  }

  let resolved: SaveRollIntentResult;
  let library: VisibleSavedRollList;
  try {
    [resolved, library] = await Promise.all([
      resolveIntent(env, interaction.source),
      fetchPersonalLibrary(env, interaction.userId),
    ]);
  } catch {
    return buildSaveRollErrorResponse("Save roll is temporarily unavailable.");
  }
  if (resolved.status !== "available") {
    return buildSaveRollErrorResponse(unavailableMessage(resolved.status));
  }
  const intent = resolved.intent;
  const titleSelection = selectedTitle(interaction, intent, name.displayName);
  if (titleSelection.status === "invalid") {
    return buildSaveRollErrorResponse(
      titleSelection.message,
      interaction.source,
      "Try again",
    );
  }
  const state = personalLibraryState(library, intent, titleSelection.title);
  if (state.duplicate !== null) {
    return duplicateResponse(env, state.duplicate);
  }
  if (
    library.savedRolls.some(
      (savedRoll) => savedRoll.comparisonKey === name.comparisonKey,
    )
  ) {
    return nameConflictResponse(interaction);
  }

  const occurredAt = Date.now();
  if (!(await ensureUser(env, interaction, occurredAt))) {
    return buildSaveRollErrorResponse("Your personal library is temporarily unavailable.");
  }
  const id = await deterministicUuidV4(`save-roll:${interaction.interactionId}`);
  let response: Response;
  try {
    response = await postData(
      env,
      intent.source === "library"
        ? "/internal/saved-rolls/v2/copy"
        : "/internal/saved-rolls/v2/create",
      JSON.stringify({
        owner: { type: "user", userId: interaction.userId },
        actorUserId: interaction.userId,
        authorizationUpdatedAt: null,
        id,
        expectedListRevision: library.listRevision,
        draft: {
          version: 2,
          name: name.displayName,
          notation: intent.notation,
          title: titleSelection.title,
          repetitions: intent.repetitions,
          nameColor: intent.nameColor,
        },
        pinned: false,
        mutationId: `discord-save-roll:${interaction.interactionId}`,
        occurredAt,
      }),
    );
  } catch {
    return buildSaveRollErrorResponse("Save roll is temporarily unavailable.");
  }
  let status;
  try {
    status = parseSaveMutationStatus(await response.json());
  } catch {
    return buildSaveRollErrorResponse("Save roll is temporarily unavailable.");
  }
  if (status === "applied" || status === "existing") {
    return buildSaveRollSuccessResponse(
      name.displayName,
      libraryUrl(env),
    );
  }
  if (status === "name_conflict") {
    return nameConflictResponse(interaction);
  }
  if (status === "cap_reached") {
    return buildSaveRollErrorResponse(
      "Your personal library is full. Remove a roll before saving another.",
    );
  }
  if (status === "list_revision_conflict") {
    try {
      const latest = await fetchPersonalLibrary(env, interaction.userId);
      const duplicate = personalLibraryState(
        latest,
        intent,
        titleSelection.title,
      ).duplicate;
      if (duplicate !== null) return duplicateResponse(env, duplicate);
    } catch {
      return buildSaveRollErrorResponse("Your personal library is temporarily unavailable.");
    }
    return buildSaveRollErrorResponse(
      "Your personal library changed while saving. Try Save roll again.",
      interaction.source,
      "Try again",
    );
  }
  return buildSaveRollErrorResponse("Save roll is temporarily unavailable.");
}

export async function completeSaveRollSubmit(
  interaction: ParsedSaveRollInteractionV1,
  env: SaveRollHandlerEnv,
): Promise<void> {
  const response = await submitSaveRoll(interaction, env);
  await editOriginal(interaction, response);
}
