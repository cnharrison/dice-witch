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
const SAVE_ROLL_CUSTOM_ID = /^save-roll:v1:([dw]):([^:]+)(?::(retry|submit))?$/;
const SAVE_ROLL_NAME_CUSTOM_ID = "save-roll-name";
const MAX_TITLE_LENGTH = 256;

export const ROLL_SAVE_INTENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

export type SaveRollSourceV1 =
  | { kind: "discord"; id: string }
  | { kind: "web"; id: string; userId: string };

export type SaveRollIntentV1 = {
  version: 1;
  source: "fresh" | "library";
  notation: string;
  title: string | null;
  repetitions: number;
  defaultName: string;
  nameColor: string | null;
  createdAt: number;
  expiresAt: number;
};

export type ParsedSaveRollInteractionV1 = {
  kind: "open" | "submit";
  source: SaveRollSourceV1;
  retry: boolean;
  name: string | null;
  interactionId: string;
  applicationId: string;
  token: string;
  userId: string;
  username: string;
  guildId: string | null;
  channelId: string;
};

type SaveRollModalResponseV1 = {
  type: 9;
  data: {
    custom_id: string;
    title: string;
    components: Array<{
      type: 18;
      label: string;
      description: string;
      component: {
        type: 4;
        custom_id: string;
        style: 1;
        min_length: 1;
        max_length: 4_000;
        required: true;
        value?: string;
        placeholder?: string;
      };
    }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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

function parseSubmittedName(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    return null;
  }
  const label = value[0];
  if (label.type !== 18 || !isRecord(label.component)) return null;
  const input = label.component;
  return input.type === 4 &&
    input.custom_id === SAVE_ROLL_NAME_CUSTOM_ID &&
    typeof input.value === "string"
    ? input.value
    : null;
}

export function buildSaveRollCustomId(
  source: SaveRollSourceV1,
  action?: "retry" | "submit",
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
  const customId = `save-roll:v1:${discriminator}:${sourceId}${
    action === undefined ? "" : `:${action}`
  }`;
  if (customId.length > 100) throw new Error("Save roll custom id is invalid");
  return customId;
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
  const source = parseSaveRollSource(match[1] ?? "", match[2] ?? "");
  if (source === null) return null;
  const action = match[3];

  if (
    value.type === 3 &&
    (data.component_type !== 2 ||
      (action !== undefined && action !== "retry"))
  ) {
    return null;
  }
  if (value.type === 5 && action !== "submit") return null;
  const name = value.type === 5 ? parseSubmittedName(data.components) : null;
  if (value.type === 5 && name === null) return null;

  return {
    kind: value.type === 3 ? "open" : "submit",
    source,
    retry: action === "retry",
    name,
    interactionId: value.id,
    applicationId: options.applicationId,
    token: value.token,
    userId: user.userId,
    username: user.username,
    guildId: typeof value.guild_id === "string" ? value.guild_id : null,
    channelId: value.channel_id,
  };
}

export function parseSaveRollIntentV1(value: unknown): SaveRollIntentV1 {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !==
      "createdAt,defaultName,expiresAt,nameColor,notation,repetitions,source,title,version" ||
    value.version !== 1 ||
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
    typeof value.defaultName !== "string" ||
    value.defaultName.length < 1 ||
    value.defaultName.length > 4_000 ||
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
  return {
    version: 1,
    source: value.source,
    notation: value.notation,
    title: value.title,
    repetitions: value.repetitions,
    defaultName: value.defaultName,
    nameColor,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  };
}

export function buildSaveRollModalResponse(
  source: SaveRollSourceV1,
  options: { defaultName: string | null; nameConflict: boolean },
): SaveRollModalResponseV1 {
  const component: SaveRollModalResponseV1["data"]["components"][number]["component"] = {
    type: 4,
    custom_id: SAVE_ROLL_NAME_CUSTOM_ID,
    style: 1,
    min_length: 1,
    max_length: 4_000,
    required: true,
  };
  if (options.defaultName !== null) component.value = options.defaultName;
  else component.placeholder = options.nameConflict
    ? "Choose a different name"
    : "Name this roll";

  return {
    type: 9,
    data: {
      custom_id: buildSaveRollCustomId(source, "submit"),
      title: "Save roll",
      components: [
        {
          type: 18,
          label: "Personal Library roll name",
          description: options.nameConflict
            ? "That name is already used. Choose a different name."
            : "You can edit this name before saving.",
          component,
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
    throw new Error("Save roll Library URL is invalid");
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
          label: "Try another name",
        },
      ],
    });
  }
  return buildPrivateMessageResponse([container]);
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
            `Saved “${name}” to your Personal Library.`,
          ),
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: "Open Library",
              url: validatedLibraryUrl(libraryUrl),
            },
          ],
        },
      ],
    },
  ]);
}
