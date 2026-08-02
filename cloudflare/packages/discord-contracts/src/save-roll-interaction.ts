import {
  MAX_NOTATION_LENGTH,
  MAX_REPETITIONS,
} from "../../roll-domain/src/constants";
import { parseSavedRollNameColorV2 } from "../../saved-rolls/src/color";
import {
  DISCORD_COMPONENTS_V2_FLAG,
  DISCORD_EPHEMERAL_FLAG,
  type DiscordContainer,
  type DiscordTopLevelComponent,
} from "./responses";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAVE_ROLL_CUSTOM_ID = /^save-roll:v([12]):([dw]):([^:]+)(?::(retry|submit))?$/;
const SAVE_ROLL_NAME_CUSTOM_ID = "save-roll-name";
const SAVE_ROLL_TITLE_MODE_CUSTOM_ID = "save-roll-title-mode";
const SAVE_ROLL_TITLE_MODES = ["keep", "name", "none"] as const;
const MAX_TITLE_LENGTH = 256;

export const ROLL_SAVE_INTENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

export type SaveRollSourceV1 =
  | { kind: "discord"; id: string }
  | { kind: "web"; id: string; userId: string };

type SaveRollIntentFields = {
  source: "fresh" | "library";
  notation: string;
  title: string | null;
  repetitions: number;
  nameColor: string | null;
  createdAt: number;
  expiresAt: number;
};

export type SaveRollIntentV1 = SaveRollIntentFields & {
  version: 1;
  defaultName: string;
};

export type SaveRollIntentV2 = SaveRollIntentFields & {
  version: 2;
  defaultName: string | null;
};

export type SaveRollIntent = SaveRollIntentV1 | SaveRollIntentV2;
export type SaveRollTitleMode = typeof SAVE_ROLL_TITLE_MODES[number];

export type ParsedSaveRollInteractionV1 = {
  kind: "open" | "submit";
  source: SaveRollSourceV1;
  retry: boolean;
  name: string | null;
  titleMode: SaveRollTitleMode | null;
  interactionId: string;
  applicationId: string;
  token: string;
  userId: string;
  username: string;
  guildId: string | null;
  channelId: string;
};

type DiscordModalTextInput = {
  type: 4;
  custom_id: string;
  style: 1;
  min_length?: number;
  max_length: number;
  required: boolean;
  value?: string;
  placeholder?: string;
};

type DiscordModalStringSelect = {
  type: 3;
  custom_id: string;
  required: true;
  min_values: 1;
  max_values: 1;
  options: Array<{
    label: string;
    value: SaveRollTitleMode;
    default?: true;
  }>;
};

type SaveRollModalResponseV2 = {
  type: 9;
  data: {
    custom_id: string;
    title: string;
    components: Array<{
      type: 18;
      label: string;
      description: string;
      component: DiscordModalTextInput | DiscordModalStringSelect;
    }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSaveRollTitleMode(value: unknown): value is SaveRollTitleMode {
  return typeof value === "string" &&
    (SAVE_ROLL_TITLE_MODES as readonly string[]).includes(value);
}

function selectedModalValue(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== 1) return null;
  return value[0] as unknown;
}

function escapeDiscordMarkdown(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replace(/([*_~|])/g, "\\$1")
    .replaceAll("<", "\\<")
    .replaceAll(">", "\\>");
}

function parseSaveRollSource(
  discriminator: string,
  value: string,
): SaveRollSourceV1 | null {
  if (discriminator === "d" && SNOWFLAKE.test(value)) {
    return { kind: "discord", id: value };
  }
  if (discriminator === "w") {
    const separator = value.indexOf(".");
    const userId = value.slice(0, separator);
    const id = value.slice(separator + 1);
    if (separator > 0 && SNOWFLAKE.test(userId) && UUID_V4.test(id)) {
      return { kind: "web", id, userId };
    }
  }
  return null;
}

function parseUser(value: Record<string, unknown>): {
  userId: string;
  username: string;
} | null {
  const member = isRecord(value.member) ? value.member : null;
  let user: Record<string, unknown> | null = null;
  if (member !== null && isRecord(member.user)) user = member.user;
  else if (isRecord(value.user)) user = value.user;
  if (
    user === null ||
    typeof user.id !== "string" ||
    !SNOWFLAKE.test(user.id) ||
    typeof user.username !== "string" ||
    user.username.length < 1 ||
    user.username.length > 32
  ) {
    return null;
  }
  return { userId: user.id, username: user.username };
}

function parseModalComponents(
  value: unknown,
  expectedCustomIds: readonly string[],
): Map<string, Record<string, unknown>> | null {
  if (!Array.isArray(value) || value.length !== expectedCustomIds.length) {
    return null;
  }
  const components = new Map<string, Record<string, unknown>>();
  for (const label of value) {
    if (!isRecord(label) || label.type !== 18 || !isRecord(label.component)) {
      return null;
    }
    const customId = label.component.custom_id;
    if (
      typeof customId !== "string" ||
      !expectedCustomIds.includes(customId) ||
      components.has(customId)
    ) {
      return null;
    }
    components.set(customId, label.component);
  }
  return components;
}

function parseLegacySubmission(value: unknown): {
  name: string;
  titleMode: "keep";
} | null {
  const components = parseModalComponents(value, [SAVE_ROLL_NAME_CUSTOM_ID]);
  const name = components?.get(SAVE_ROLL_NAME_CUSTOM_ID);
  return name?.type === 4 && typeof name.value === "string"
    ? { name: name.value, titleMode: "keep" }
    : null;
}

function parseTitleAwareSubmission(value: unknown): {
  name: string;
  titleMode: SaveRollTitleMode;
} | null {
  const components = parseModalComponents(value, [
    SAVE_ROLL_NAME_CUSTOM_ID,
    SAVE_ROLL_TITLE_MODE_CUSTOM_ID,
  ]);
  const name = components?.get(SAVE_ROLL_NAME_CUSTOM_ID);
  const mode = components?.get(SAVE_ROLL_TITLE_MODE_CUSTOM_ID);
  const selectedMode = selectedModalValue(mode?.values);
  if (
    name?.type !== 4 ||
    typeof name.value !== "string" ||
    mode?.type !== 3 ||
    !isSaveRollTitleMode(selectedMode)
  ) {
    return null;
  }
  return { name: name.value, titleMode: selectedMode };
}

function buildVersionedSaveRollCustomId(
  source: SaveRollSourceV1,
  action: "retry" | "submit" | undefined,
  version: 1 | 2,
): string {
  if (
    (source.kind === "discord" && !SNOWFLAKE.test(source.id)) ||
    (source.kind === "web" &&
      (!SNOWFLAKE.test(source.userId) || !UUID_V4.test(source.id)))
  ) {
    throw new Error("Save roll source is invalid");
  }
  const discriminator = source.kind === "discord" ? "d" : "w";
  const sourceId = source.kind === "discord"
    ? source.id
    : `${source.userId}.${source.id}`;
  const customId = `save-roll:v${String(version)}:${discriminator}:${sourceId}${
    action === undefined ? "" : `:${action}`
  }`;
  if (customId.length > 100) throw new Error("Save roll custom id is invalid");
  return customId;
}

export function buildSaveRollCustomId(
  source: SaveRollSourceV1,
  action?: "retry" | "submit",
): string {
  return buildVersionedSaveRollCustomId(source, action, 1);
}

export function parseSaveRollInteraction(
  value: unknown,
  options: { applicationId: string },
): ParsedSaveRollInteractionV1 | null {
  if (
    !SNOWFLAKE.test(options.applicationId) ||
    !isRecord(value) ||
    (value.type !== 3 && value.type !== 5) ||
    typeof value.id !== "string" ||
    !SNOWFLAKE.test(value.id) ||
    value.application_id !== options.applicationId ||
    typeof value.token !== "string" ||
    !INTERACTION_TOKEN.test(value.token) ||
    typeof value.channel_id !== "string" ||
    !SNOWFLAKE.test(value.channel_id) ||
    (value.guild_id !== undefined &&
      (typeof value.guild_id !== "string" || !SNOWFLAKE.test(value.guild_id))) ||
    !isRecord(value.data)
  ) {
    return null;
  }
  const user = parseUser(value);
  if (user === null) return null;

  const data = value.data;
  const customId = data.custom_id;
  if (typeof customId !== "string") return null;
  const match = SAVE_ROLL_CUSTOM_ID.exec(customId);
  if (match === null) return null;
  const customIdVersion = match[1] === "2" ? 2 : 1;
  const source = parseSaveRollSource(match[2] ?? "", match[3] ?? "");
  if (source === null) return null;
  const action = match[4];

  if (
    value.type === 3 &&
    (data.component_type !== 2 ||
      (action !== undefined && action !== "retry"))
  ) {
    return null;
  }
  if (value.type === 5 && action !== "submit") return null;
  let submission: ReturnType<typeof parseLegacySubmission> |
    ReturnType<typeof parseTitleAwareSubmission> = null;
  if (value.type === 5) {
    submission = customIdVersion === 1
      ? parseLegacySubmission(data.components)
      : parseTitleAwareSubmission(data.components);
    if (submission === null) return null;
  }

  return {
    kind: value.type === 3 ? "open" : "submit",
    source,
    retry: action === "retry",
    name: submission?.name ?? null,
    titleMode: submission?.titleMode ?? null,
    interactionId: value.id,
    applicationId: options.applicationId,
    token: value.token,
    userId: user.userId,
    username: user.username,
    guildId: typeof value.guild_id === "string" ? value.guild_id : null,
    channelId: value.channel_id,
  };
}

export function parseSaveRollIntent(value: unknown): SaveRollIntent {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !==
      "createdAt,defaultName,expiresAt,nameColor,notation,repetitions,source,title,version" ||
    (value.version !== 1 && value.version !== 2) ||
    (value.source !== "fresh" && value.source !== "library") ||
    typeof value.notation !== "string" ||
    value.notation.length < 1 ||
    value.notation.length > MAX_NOTATION_LENGTH ||
    (value.title !== null &&
      (typeof value.title !== "string" ||
        value.title.length < 1 ||
        value.title.length > MAX_TITLE_LENGTH)) ||
    typeof value.repetitions !== "number" ||
    !Number.isSafeInteger(value.repetitions) ||
    value.repetitions < 1 ||
    value.repetitions > MAX_REPETITIONS ||
    (value.defaultName !== null &&
      (typeof value.defaultName !== "string" ||
        value.defaultName.length < 1 ||
        value.defaultName.length > 4_000)) ||
    (value.defaultName === null &&
      (value.version !== 2 ||
        value.source !== "fresh" ||
        value.title !== null ||
        value.repetitions <= 1)) ||
    !nonNegativeSafeInteger(value.createdAt) ||
    !nonNegativeSafeInteger(value.expiresAt) ||
    value.expiresAt !== value.createdAt + ROLL_SAVE_INTENT_RETENTION_MS
  ) {
    throw new Error("Save roll intent is invalid");
  }
  let nameColor: string | null;
  try {
    nameColor = parseSavedRollNameColorV2(value.nameColor);
  } catch {
    throw new Error("Save roll intent is invalid");
  }
  const fields: SaveRollIntentFields = {
    source: value.source,
    notation: value.notation,
    title: value.title,
    repetitions: value.repetitions,
    nameColor,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  };
  return value.version === 1
    ? { ...fields, version: 1, defaultName: value.defaultName as string }
    : { ...fields, version: 2, defaultName: value.defaultName };
}

export function parseSaveRollIntentV1(value: unknown): SaveRollIntentV1 {
  const intent = parseSaveRollIntent(value);
  if (intent.version !== 1) throw new Error("Save roll intent is invalid");
  return intent;
}

export function saveRollIntentIdentity(intent: SaveRollIntent): string {
  return JSON.stringify({
    source: intent.source,
    notation: intent.notation,
    title: intent.title,
    repetitions: intent.repetitions,
    defaultName: intent.defaultName,
    nameColor: intent.nameColor,
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
  });
}

function defaultSaveRollTitleMode(
  sourceKind: "fresh" | "library",
  sourceTitle: string | null,
): "keep" | "name" | "none" {
  if (sourceTitle !== null) return "keep";
  if (sourceKind === "fresh") return "name";
  return "none";
}

export function buildSaveRollModalResponse(
  source: SaveRollSourceV1,
  options: {
    defaultName: string | null;
    nameConflict: boolean;
    sourceKind: "fresh" | "library";
    sourceTitle: string | null;
  },
): SaveRollModalResponseV2 {
  const nameInput: DiscordModalTextInput = {
    type: 4,
    custom_id: SAVE_ROLL_NAME_CUSTOM_ID,
    style: 1,
    min_length: 1,
    max_length: 4_000,
    required: true,
  };
  if (options.defaultName !== null) nameInput.value = options.defaultName;
  else nameInput.placeholder = options.nameConflict
    ? "Choose a different name"
    : "Name this roll";

  const defaultTitleMode = defaultSaveRollTitleMode(
    options.sourceKind,
    options.sourceTitle,
  );
  const titleOptions: DiscordModalStringSelect["options"] = [];
  if (options.sourceTitle !== null) {
    titleOptions.push({
      label: "Keep current title",
      value: "keep",
      ...(defaultTitleMode === "keep" ? { default: true as const } : {}),
    });
  }
  titleOptions.push(
    {
      label: "Use name above as title",
      value: "name",
      ...(defaultTitleMode === "name" ? { default: true as const } : {}),
    },
    {
      label: "No roll title",
      value: "none",
      ...(defaultTitleMode === "none" ? { default: true as const } : {}),
    },
  );

  return {
    type: 9,
    data: {
      custom_id: buildVersionedSaveRollCustomId(source, "submit", 2),
      title: "Save roll",
      components: [
        {
          type: 18,
          label: "Personal library roll name",
          description: options.nameConflict
            ? "That name is already used. Choose a different name."
            : "You can edit this name before saving.",
          component: nameInput,
        },
        {
          type: 18,
          label: "Roll title",
          description: "Choose how the saved roll should be titled.",
          component: {
            type: 3,
            custom_id: SAVE_ROLL_TITLE_MODE_CUSTOM_ID,
            required: true,
            min_values: 1,
            max_values: 1,
            options: titleOptions,
          },
        },
      ],
    },
  };
}

function escapedTextDisplay(value: string): string {
  const escaped = escapeDiscordMarkdown(value);
  if (escaped.length < 1 || escaped.length > 4_000) {
    throw new Error("Save roll message is invalid");
  }
  return escaped;
}

function validatedLibraryUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("Save roll library URL is invalid");
  }
  return url.href;
}

function buildPrivateMessageResponse(
  components: DiscordTopLevelComponent[],
): { type: 4; data: { flags: number; allowed_mentions: { parse: [] }; components: DiscordTopLevelComponent[] } } {
  return {
    type: 4,
    data: {
      flags: DISCORD_COMPONENTS_V2_FLAG | DISCORD_EPHEMERAL_FLAG,
      allowed_mentions: { parse: [] },
      components,
    },
  };
}

export function buildSaveRollErrorResponse(
  message: string,
  source?: SaveRollSourceV1,
  retryLabel = "Try another name",
): ReturnType<typeof buildPrivateMessageResponse> {
  const container: DiscordContainer = {
    type: 17,
    accent_color: 0xe7_4c_3c,
    components: [
      {
        type: 10,
        content: escapedTextDisplay(message),
      },
    ],
  };
  if (source !== undefined) {
    container.components.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          custom_id: buildSaveRollCustomId(source, "retry"),
          label: retryLabel,
        },
      ],
    });
  }
  return buildPrivateMessageResponse([container]);
}

export function buildSaveRollDuplicateResponse(
  name: string,
  libraryUrl: string,
): ReturnType<typeof buildPrivateMessageResponse> {
  return buildPrivateMessageResponse([
    {
      type: 17,
      accent_color: 0xf1_c4_0f,
      components: [
        {
          type: 10,
          content: escapedTextDisplay(
            `A copy of this roll already exists in your personal library as “${name}”.`,
          ),
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: "Open library",
              url: validatedLibraryUrl(libraryUrl),
            },
          ],
        },
      ],
    },
  ]);
}

export function buildSaveRollSuccessResponse(
  name: string,
  libraryUrl: string,
): ReturnType<typeof buildPrivateMessageResponse> {
  return buildPrivateMessageResponse([
    {
      type: 17,
      accent_color: 0x2e_cc_71,
      components: [
        {
          type: 10,
          content: escapedTextDisplay(
            `Saved “${name}” to your personal library.`,
          ),
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: "Open library",
              url: validatedLibraryUrl(libraryUrl),
            },
          ],
        },
      ],
    },
  ]);
}
