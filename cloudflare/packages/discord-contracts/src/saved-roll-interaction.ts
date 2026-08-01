import {
  extractRollLoggingContext,
  type RollLoggingContext,
} from "./roll-interaction";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const SAVED_ROLL_SELECTION = /^(mine|server):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAVED_ROLL_COMPONENT = /^saved-roll:v1:([1-9][0-9]{16,19}):(mine|server|previous|next|run|copy|select|rename|run:(?:mine|server):.+)$/;
const MAX_TYPED_SELECTION_LENGTH = 256;

export type SavedRollInteractionScope = {
  applicationId: string;
  guildId?: string;
};

type SavedRollInteractionContext = {
  id: string;
  applicationId: string;
  token: string;
  guildId: string | null;
  channelId: string;
  loggingContext: RollLoggingContext | null;
  userId: string;
  username: string;
};

export type SavedRollInteraction =
  | (SavedRollInteractionContext & {
      kind: "command";
      selection: string | null;
    })
  | (SavedRollInteractionContext & {
      kind: "autocomplete";
      query: string;
    })
  | (SavedRollInteractionContext & {
      kind: "component";
      sessionId: string;
      action: "mine" | "server" | "previous" | "next" | "run" | "copy" | "select";
      selection: string | null;
    })
  | (SavedRollInteractionContext & {
      kind: "modal";
      sessionId: string;
      name: string;
    });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireSnowflake(value: unknown, name: string): string {
  if (typeof value !== "string" || !SNOWFLAKE.test(value)) {
    throw new Error(`${name} must be a Discord Snowflake`);
  }
  return value;
}

function parseContext(
  value: Record<string, unknown>,
  scope: SavedRollInteractionScope,
): SavedRollInteractionContext {
  const applicationId = requireSnowflake(
    value.application_id,
    "Saved roll application id",
  );
  if (applicationId !== scope.applicationId) {
    throw new Error("Saved roll application does not match");
  }
  const guildId =
    value.guild_id === undefined
      ? null
      : requireSnowflake(value.guild_id, "Saved roll guild id");
  if (
    scope.guildId !== undefined &&
    guildId !== null &&
    guildId !== scope.guildId
  ) {
    throw new Error("Saved roll guild does not match");
  }
  const token = value.token;
  if (typeof token !== "string" || !INTERACTION_TOKEN.test(token)) {
    throw new Error("Saved roll interaction token is invalid");
  }
  const member = value.member;
  const user = isRecord(member) && isRecord(member.user) ? member.user : value.user;
  if (
    !isRecord(user) ||
    typeof user.username !== "string" ||
    user.username.length < 1 ||
    user.username.length > 32
  ) {
    throw new Error("Saved roll user is invalid");
  }
  const userId = requireSnowflake(user.id, "Saved roll user id");
  const channelId = requireSnowflake(value.channel_id, "Saved roll channel id");
  let loggingContext: RollLoggingContext;
  try {
    loggingContext = extractRollLoggingContext(value, guildId, channelId);
  } catch {
    throw new Error("Saved roll channel is invalid");
  }
  return {
    id: requireSnowflake(value.id, "Saved roll interaction id"),
    applicationId,
    token,
    guildId,
    channelId,
    loggingContext,
    userId,
    username: user.username,
  };
}

function parseCommandOption(
  value: unknown,
  autocomplete: boolean,
): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new Error("Saved roll command options are invalid");
  }
  const option = value[0];
  if (
    option.name !== "name" ||
    option.type !== 3 ||
    typeof option.value !== "string" ||
    option.value.length > MAX_TYPED_SELECTION_LENGTH ||
    (autocomplete ? option.focused !== true : option.focused !== undefined)
  ) {
    throw new Error("Saved roll command option is invalid");
  }
  return option.value;
}

export function parseSavedRollInteraction(
  value: unknown,
  scope: SavedRollInteractionScope,
): SavedRollInteraction | null {
  if (!isRecord(value)) throw new Error("Interaction must be an object");
  if (value.type !== 2 && value.type !== 3 && value.type !== 4 && value.type !== 5) return null;
  if (!isRecord(value.data)) throw new Error("Saved roll data is invalid");
  const data = value.data;
  if (value.type === 2 || value.type === 4) {
    if (data.name !== "library" || data.type !== 1) return null;
    const context = parseContext(value, scope);
    const selection = parseCommandOption(data.options, value.type === 4);
    if (value.type === 4) {
      return { ...context, kind: "autocomplete", query: selection ?? "" };
    }
    return { ...context, kind: "command", selection };
  }
  if (typeof data.custom_id !== "string") return null;
  const match = SAVED_ROLL_COMPONENT.exec(data.custom_id);
  if (match === null) return null;
  const sessionId = match[1];
  const componentValue = match[2];
  if (componentValue === undefined) {
    throw new Error("Saved roll component is invalid");
  }
  const encodedRunSelection = componentValue.startsWith("run:")
    ? componentValue.slice(4)
    : null;
  const matchedAction = encodedRunSelection === null ? componentValue : "run";
  if (value.type === 5) {
    if (
      matchedAction !== "rename" ||
      !Array.isArray(data.components) ||
      data.components.length !== 1 ||
      !isRecord(data.components[0]) ||
      !Array.isArray(data.components[0].components) ||
      data.components[0].components.length !== 1 ||
      !isRecord(data.components[0].components[0])
    ) {
      throw new Error("Saved roll rename modal is invalid");
    }
    const input = data.components[0].components[0];
    if (
      input.type !== 4 ||
      input.custom_id !== "saved-roll-name" ||
      typeof input.value !== "string"
    ) {
      throw new Error("Saved roll rename modal is invalid");
    }
    if (sessionId === undefined) {
      throw new Error("Saved roll component session is invalid");
    }
    return {
      ...parseContext(value, scope),
      kind: "modal",
      sessionId,
      name: input.value,
    };
  }
  if (matchedAction === "rename") {
    throw new Error("Saved roll component is invalid");
  }
  const action = matchedAction as Extract<
    SavedRollInteraction,
    { kind: "component" }
  >["action"];
  let selection: string | null = encodedRunSelection;
  if (action === "select") {
    if (
      data.component_type !== 3 ||
      !Array.isArray(data.values) ||
      data.values.length !== 1 ||
      typeof data.values[0] !== "string" ||
      !SAVED_ROLL_SELECTION.test(data.values[0])
    ) {
      throw new Error("Saved roll component selection is invalid");
    }
    selection = data.values[0];
  } else {
    if (
      (selection !== null && !SAVED_ROLL_SELECTION.test(selection)) ||
      data.component_type !== 2 ||
      data.values !== undefined
    ) {
      throw new Error(
        selection === null
          ? "Saved roll component is invalid"
          : "Saved roll component selection is invalid",
      );
    }
  }
  if (sessionId === undefined) {
    throw new Error("Saved roll component session is invalid");
  }
  return {
    ...parseContext(value, scope),
    kind: "component",
    sessionId,
    action,
    selection,
  };
}

export function isSavedRollSelection(value: string): boolean {
  return SAVED_ROLL_SELECTION.test(value);
}
