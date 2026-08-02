import {
  buildSaveRollErrorResponse,
  buildSaveRollModalResponse,
  buildSaveRollSuccessResponse,
  buildWebAppRouteUrl,
  type ParsedSaveRollInteractionV1,
  type SaveRollIntentV1,
  type SaveRollSourceV1,
} from "../../../packages/discord-contracts/src";
import { parseSavedRollNameV1 } from "../../../packages/saved-rolls/src/name";
import {
  fetchVisibleSavedRolls,
  type VisibleSavedRollList,
  type VisibleSavedRollV1,
} from "./saved-roll-picker";

const DISCORD_API_BASE = "https://discord.com/api/v10";

type SaveRollIntentResult =
  | { status: "available"; intent: SaveRollIntentV1 }
  | { status: "expired" | "missing" };

type SaveRollIntentStub = {
  getSaveRollIntent(): Promise<SaveRollIntentResult>;
};

type SaveRollHandlerEnv = {
  DATA_SERVICE: Fetcher;
  ROLL_WORK: DurableObjectNamespace;
  WEB_DELIVERY_WORK: DurableObjectNamespace;
  WEB_APP_URL: string;
};

type PersonalLibraryState = {
  duplicate: VisibleSavedRollV1 | null;
  defaultName: string | null;
  nameConflict: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactComposition(
  savedRoll: VisibleSavedRollV1,
  intent: SaveRollIntentV1,
): boolean {
  return savedRoll.notation === intent.notation &&
    savedRoll.title === intent.title &&
    savedRoll.repetitions === intent.repetitions;
}

export function personalLibraryState(
  library: VisibleSavedRollList,
  intent: SaveRollIntentV1,
): PersonalLibraryState {
  const duplicate = library.savedRolls.find((savedRoll) =>
    exactComposition(savedRoll, intent)
  ) ?? null;
  let parsedDefault;
  try {
    parsedDefault = parseSavedRollNameV1(intent.defaultName);
  } catch {
    return { duplicate, defaultName: null, nameConflict: false };
  }
  const nameConflict = library.savedRolls.some(
    (savedRoll) =>
      savedRoll.comparisonKey === parsedDefault.comparisonKey &&
      !exactComposition(savedRoll, intent),
  );
  return {
    duplicate,
    defaultName: nameConflict ? null : parsedDefault.displayName,
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
  const stub = namespace.getByName(objectName) as unknown as SaveRollIntentStub;
  return stub.getSaveRollIntent();
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

export async function openSaveRollModal(
  interaction: ParsedSaveRollInteractionV1,
  env: SaveRollHandlerEnv,
): Promise<Record<string, unknown>> {
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
    return buildSaveRollErrorResponse("Your Personal Library is temporarily unavailable.");
  }
  const state = personalLibraryState(library, resolved.intent);
  if (state.duplicate !== null) {
    return buildSaveRollErrorResponse(
      `This exact roll is already in your Personal Library as “${state.duplicate.displayName}”.`,
    );
  }
  return buildSaveRollModalResponse(interaction.source, {
    defaultName: state.defaultName,
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
  body: unknown,
): Promise<Response> {
  return env.DATA_SERVICE.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function ensureUser(
  env: SaveRollHandlerEnv,
  interaction: ParsedSaveRollInteractionV1,
  occurredAt: number,
): Promise<boolean> {
  try {
    const response = await postData(env, "/internal/saved-rolls/v1/ensure-user", {
      userId: interaction.userId,
      username: interaction.username,
      occurredAt,
    });
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
    "That name is already used by another roll in your Personal Library.",
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
      "Enter a valid Library name using 1 through 80 Unicode characters.",
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
  const state = personalLibraryState(library, intent);
  if (state.duplicate !== null) {
    return buildSaveRollErrorResponse(
      `This exact roll is already in your Personal Library as “${state.duplicate.displayName}”.`,
    );
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
    return buildSaveRollErrorResponse("Your Personal Library is temporarily unavailable.");
  }
  const id = await deterministicUuidV4(`save-roll:${interaction.interactionId}`);
  let response: Response;
  try {
    response = await postData(
      env,
      intent.source === "library"
        ? "/internal/saved-rolls/v2/copy"
        : "/internal/saved-rolls/v2/create",
      {
        owner: { type: "user", userId: interaction.userId },
        actorUserId: interaction.userId,
        authorizationUpdatedAt: null,
        id,
        expectedListRevision: library.listRevision,
        draft: {
          version: 2,
          name: name.displayName,
          notation: intent.notation,
          title: intent.title,
          repetitions: intent.repetitions,
          nameColor: intent.nameColor,
        },
        pinned: false,
        mutationId: `discord-save-roll:${interaction.interactionId}`,
        occurredAt,
      },
    );
  } catch {
    return buildSaveRollErrorResponse("Save roll is temporarily unavailable.");
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return buildSaveRollErrorResponse("Save roll is temporarily unavailable.");
  }
  if (isRecord(result) && (result.status === "applied" || result.status === "existing")) {
    return buildSaveRollSuccessResponse(
      name.displayName,
      buildWebAppRouteUrl(env.WEB_APP_URL, "library"),
    );
  }
  if (isRecord(result) && result.status === "name_conflict") {
    return nameConflictResponse(interaction);
  }
  if (isRecord(result) && result.status === "cap_reached") {
    return buildSaveRollErrorResponse(
      "Your Personal Library is full. Remove a roll before saving another.",
    );
  }
  if (isRecord(result) && result.status === "list_revision_conflict") {
    return buildSaveRollErrorResponse(
      "Your Personal Library changed while saving. Try Save roll again.",
      interaction.source,
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
