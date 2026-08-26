import { z } from "zod";
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
import {
  boundaryObjectSchema,
  boundedNameSchema,
  interactionTokenSchema,
  nonNegativeSafeIntegerSchema,
  positiveSafeIntegerSchema,
  type BoundaryObject,
  type SchemaInput,
  snowflakeSchema,
  strictObjectSchema,
  uuidV4Schema,
} from "./schema-primitives";

const SAVE_ROLL_CUSTOM_ID = /^save-roll:v([12]):([dw]):([^:]+)(?::(retry|submit))?$/;
const SAVE_ROLL_NAME_CUSTOM_ID = "save-roll-name";
const SAVE_ROLL_TITLE_MODE_CUSTOM_ID = "save-roll-title-mode";
const SAVE_ROLL_TITLE_MODES = ["name", "none"] as const;
const MAX_TITLE_LENGTH = 256;

export const ROLL_SAVE_INTENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

const SaveRollSourceSchema = z.discriminatedUnion("kind", [
  strictObjectSchema({ kind: z.literal("discord"), id: snowflakeSchema }),
  strictObjectSchema({
    kind: z.literal("web"),
    id: uuidV4Schema,
    userId: snowflakeSchema,
  }),
]);
const SaveRollTitleModeSchema = z.enum(SAVE_ROLL_TITLE_MODES);
const saveRollIntentFields = {
  source: z.enum(["fresh", "library"]),
  notation: z.string().min(1).max(MAX_NOTATION_LENGTH),
  title: z.nullable(z.string().min(1).max(MAX_TITLE_LENGTH)),
  repetitions: positiveSafeIntegerSchema.max(MAX_REPETITIONS),
  nameColor: z.nullable(z.string()),
  createdAt: nonNegativeSafeIntegerSchema,
  expiresAt: nonNegativeSafeIntegerSchema,
};
const SaveRollIntentV1Schema = strictObjectSchema({
  version: z.literal(1),
  ...saveRollIntentFields,
  defaultName: z.string().min(1).max(4_000),
}).refine(
  ({ createdAt, expiresAt }) =>
    expiresAt === createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
);
const SaveRollIntentV2Schema = strictObjectSchema({
  version: z.literal(2),
  ...saveRollIntentFields,
  defaultName: z.nullable(z.string().min(1).max(4_000)),
}).superRefine((intent, context) => {
  if (intent.expiresAt !== intent.createdAt + ROLL_SAVE_INTENT_RETENTION_MS) {
    context.addIssue({ code: "custom", message: "Intent expiry is invalid" });
  }
  if (
    intent.defaultName === null &&
    (intent.source !== "fresh" ||
      intent.title !== null ||
      intent.repetitions <= 1)
  ) {
    context.addIssue({ code: "custom", message: "Default name is invalid" });
  }
});
const SaveRollIntentSchema = z.discriminatedUnion("version", [
  SaveRollIntentV1Schema,
  SaveRollIntentV2Schema,
]);

export type SaveRollSourceV1 = z.infer<typeof SaveRollSourceSchema>;
export type SaveRollIntentV1 = z.infer<typeof SaveRollIntentV1Schema>;
export type SaveRollIntentV2 = z.infer<typeof SaveRollIntentV2Schema>;
export type SaveRollIntent = z.infer<typeof SaveRollIntentSchema>;
export type SaveRollTitleMode = z.infer<typeof SaveRollTitleModeSchema>;

export type ParsedSaveRollInteractionV1 = {
  kind: "open" | "submit";
  source: SaveRollSourceV1;
  retry: boolean;
  name: string | null;
  titleMode: SaveRollTitleMode | "keep" | null;
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
      component: DiscordModalTextInput | DiscordModalStringSelect;
    }>;
  };
};

const SaveRollInteractionSchema = z.looseObject({
  type: z.union([z.literal(3), z.literal(5)]),
  id: snowflakeSchema,
  application_id: snowflakeSchema,
  token: interactionTokenSchema,
  channel_id: snowflakeSchema,
  guild_id: snowflakeSchema.optional(),
  data: boundaryObjectSchema,
});
const SaveRollUserSchema = z.looseObject({
  id: snowflakeSchema,
  username: boundedNameSchema(1, 32),
});
const ModalLabelSchema = z.looseObject({
  type: z.literal(18),
  component: boundaryObjectSchema,
});
const ModalComponentsSchema = z.array(z.unknown());
const LegacyNameInputSchema = z.looseObject({
  type: z.literal(4),
  value: z.string(),
});
const TitleModeInputSchema = z.looseObject({
  type: z.literal(3),
  values: z.tuple([SaveRollTitleModeSchema]),
});

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
  if (discriminator === "d") {
    const source = SaveRollSourceSchema.safeParse({ kind: "discord", id: value });
    return source.success ? source.data : null;
  }
  if (discriminator !== "w") return null;
  const separator = value.indexOf(".");
  if (separator < 1) return null;
  const source = SaveRollSourceSchema.safeParse({
    kind: "web",
    userId: value.slice(0, separator),
    id: value.slice(separator + 1),
  });
  return source.success ? source.data : null;
}

function parseUser(value: BoundaryObject): {
  userId: string;
  username: string;
} | null {
  const member = boundaryObjectSchema.safeParse(value.member);
  const memberUser = member.success
    ? boundaryObjectSchema.safeParse(member.data.user)
    : null;
  const user = SaveRollUserSchema.safeParse(
    memberUser?.success ? memberUser.data : value.user,
  );
  return user.success
    ? { userId: user.data.id, username: user.data.username }
    : null;
}

function parseModalComponents(
  value: SchemaInput,
  expectedCustomIds: readonly string[],
): Map<string, BoundaryObject> | null {
  const labels = ModalComponentsSchema.safeParse(value);
  if (!labels.success || labels.data.length !== expectedCustomIds.length) {
    return null;
  }
  const components = new Map<string, BoundaryObject>();
  for (const labelValue of labels.data) {
    const label = ModalLabelSchema.safeParse(labelValue);
    if (!label.success) return null;
    const customId = z.string().safeParse(label.data.component.custom_id);
    if (
      !customId.success ||
      !expectedCustomIds.includes(customId.data) ||
      components.has(customId.data)
    ) {
      return null;
    }
    components.set(customId.data, label.data.component);
  }
  return components;
}

function parseLegacySubmission(value: SchemaInput): {
  name: string;
  titleMode: "keep";
} | null {
  const components = parseModalComponents(value, [SAVE_ROLL_NAME_CUSTOM_ID]);
  const name = LegacyNameInputSchema.safeParse(
    components?.get(SAVE_ROLL_NAME_CUSTOM_ID),
  );
  return name.success
    ? { name: name.data.value, titleMode: "keep" }
    : null;
}

function parseTitleAwareSubmission(value: SchemaInput): {
  name: string;
  titleMode: SaveRollTitleMode;
} | null {
  const components = parseModalComponents(value, [
    SAVE_ROLL_NAME_CUSTOM_ID,
    SAVE_ROLL_TITLE_MODE_CUSTOM_ID,
  ]);
  const name = LegacyNameInputSchema.safeParse(
    components?.get(SAVE_ROLL_NAME_CUSTOM_ID),
  );
  const mode = TitleModeInputSchema.safeParse(
    components?.get(SAVE_ROLL_TITLE_MODE_CUSTOM_ID),
  );
  if (!name.success || !mode.success) return null;
  return { name: name.data.value, titleMode: mode.data.values[0] };
}

function buildVersionedSaveRollCustomId(
  source: SaveRollSourceV1,
  action: "retry" | "submit" | undefined,
  version: 1 | 2,
): string {
  const parsedSource = SaveRollSourceSchema.safeParse(source);
  if (!parsedSource.success) {
    throw new Error("Save roll source is invalid");
  }
  const discriminator = parsedSource.data.kind === "discord" ? "d" : "w";
  const sourceId = parsedSource.data.kind === "discord"
    ? parsedSource.data.id
    : `${parsedSource.data.userId}.${parsedSource.data.id}`;
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
  value: SchemaInput,
  options: { applicationId: string },
): ParsedSaveRollInteractionV1 | null {
  if (!snowflakeSchema.safeParse(options.applicationId).success) return null;
  const interaction = SaveRollInteractionSchema.safeParse(value);
  if (
    !interaction.success ||
    interaction.data.application_id !== options.applicationId
  ) {
    return null;
  }
  const user = parseUser(interaction.data);
  if (user === null) return null;

  const customId = z.string().safeParse(interaction.data.data.custom_id);
  if (!customId.success) return null;
  const match = SAVE_ROLL_CUSTOM_ID.exec(customId.data);
  if (match === null) return null;
  const customIdVersion = match[1] === "2" ? 2 : 1;
  const source = parseSaveRollSource(match[2] ?? "", match[3] ?? "");
  if (source === null) return null;
  const action = match[4];

  if (
    interaction.data.type === 3 &&
    (interaction.data.data.component_type !== 2 ||
      (action !== undefined && action !== "retry"))
  ) {
    return null;
  }
  if (interaction.data.type === 5 && action !== "submit") return null;

  let submission: {
    name: string;
    titleMode: SaveRollTitleMode | "keep";
  } | null = null;
  if (interaction.data.type === 5) {
    submission = customIdVersion === 1
      ? parseLegacySubmission(interaction.data.data.components)
      : parseTitleAwareSubmission(interaction.data.data.components);
    if (submission === null) return null;
  }

  return {
    kind: interaction.data.type === 3 ? "open" : "submit",
    source,
    retry: action === "retry",
    name: submission?.name ?? null,
    titleMode: submission?.titleMode ?? null,
    interactionId: interaction.data.id,
    applicationId: options.applicationId,
    token: interaction.data.token,
    userId: user.userId,
    username: user.username,
    guildId: interaction.data.guild_id ?? null,
    channelId: interaction.data.channel_id,
  };
}

export function parseSaveRollIntent(value: SchemaInput): SaveRollIntent {
  const intent = SaveRollIntentSchema.safeParse(value);
  if (!intent.success) {
    throw new Error("Save roll intent is invalid");
  }
  let nameColor: string | null;
  try {
    nameColor = parseSavedRollNameColorV2(intent.data.nameColor);
  } catch {
    throw new Error("Save roll intent is invalid");
  }
  const fields = {
    source: intent.data.source,
    notation: intent.data.notation,
    title: intent.data.title,
    repetitions: intent.data.repetitions,
    nameColor,
    createdAt: intent.data.createdAt,
    expiresAt: intent.data.expiresAt,
  };
  if (intent.data.version === 1) {
    return {
      ...fields,
      version: intent.data.version,
      defaultName: intent.data.defaultName,
    };
  }
  return {
    ...fields,
    version: intent.data.version,
    defaultName: intent.data.defaultName,
  };
}

export function parseSaveRollIntentV1(value: SchemaInput): SaveRollIntentV1 {
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

export function buildSaveRollModalResponse(
  source: SaveRollSourceV1,
  options: {
    defaultName: string | null;
    defaultTitleMode: SaveRollTitleMode;
    nameConflict: boolean;
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

  const nameTitleOption: DiscordModalStringSelect["options"][number] = {
    label: "Use name above as title",
    value: "name",
  };
  const noTitleOption: DiscordModalStringSelect["options"][number] = {
    label: "No title",
    value: "none",
  };
  if (options.defaultTitleMode === "name") nameTitleOption.default = true;
  else noTitleOption.default = true;

  return {
    type: 9,
    data: {
      custom_id: buildVersionedSaveRollCustomId(source, "submit", 2),
      title: "Save roll",
      components: [
        {
          type: 18,
          label: "Name",
          component: nameInput,
        },
        {
          type: 18,
          label: "Displayed rolled title",
          component: {
            type: 3,
            custom_id: SAVE_ROLL_TITLE_MODE_CUSTOM_ID,
            required: true,
            min_values: 1,
            max_values: 1,
            options: [nameTitleOption, noTitleOption],
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

type PrivateMessageResponse = {
  type: 4;
  data: {
    flags: number;
    allowed_mentions: { parse: [] };
    components: DiscordTopLevelComponent[];
  };
};

function buildPrivateMessageResponse(
  components: DiscordTopLevelComponent[],
): PrivateMessageResponse {
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
