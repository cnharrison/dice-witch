import { z } from "zod";
import {
  boundaryObjectSchema,
  interactionTokenSchema,
  type SchemaInput,
  snowflakeSchema,
  strictObjectSchema,
} from "./schema-primitives";

const PNG_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png$/iu;
const ATTACHMENT_URL = /^attachment:\/\/[A-Za-z0-9][A-Za-z0-9._-]{0,103}$/u;
export const DISCORD_EPHEMERAL_FLAG = 1 << 6;
export const DISCORD_SUPPRESS_NOTIFICATIONS_FLAG = 1 << 12;
export const DISCORD_COMPONENTS_V2_FLAG = 1 << 15;
const MAX_CONTENT_LENGTH = 2_000;
const MAX_EMBEDS = 10;
const MAX_TITLE_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 4_096;
const MAX_FOOTER_LENGTH = 2_048;
const MAX_TEXT_DISPLAY_LENGTH = 4_000;
const MAX_ATTACHMENT_DESCRIPTION_LENGTH = 1_024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_COMPONENTS = 40;

const LegacyContentSchema = z.string().min(1).max(MAX_CONTENT_LENGTH);
const ComponentInputsSchema = z.array(z.unknown());
const EmbedInputsSchema = ComponentInputsSchema.min(1).max(MAX_EMBEDS);
const ActionRowInputsSchema = ComponentInputsSchema.min(1).max(5);
const ColorSchema = z.number().int().min(0).max(0xff_ffff);
const AttachmentDescriptionSchema = z
  .string()
  .min(1)
  .max(MAX_ATTACHMENT_DESCRIPTION_LENGTH);
const AttachmentUrlSchema = z.string().regex(ATTACHMENT_URL);
const HttpsUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
});
const MediaUrlSchema = z.union([AttachmentUrlSchema, HttpsUrlSchema]);

const InteractionResponseTargetSchema = strictObjectSchema({
  id: snowflakeSchema,
  applicationId: snowflakeSchema,
  token: interactionTokenSchema,
});
export type InteractionResponseTarget = z.infer<
  typeof InteractionResponseTargetSchema
>;

const DiscordEmbedSchema = strictObjectSchema({
  title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
  description: z.string().min(1).max(MAX_DESCRIPTION_LENGTH).optional(),
  color: ColorSchema.optional(),
  footer: strictObjectSchema({
    text: z.string().min(1).max(MAX_FOOTER_LENGTH),
  }).optional(),
  image: strictObjectSchema({ url: AttachmentUrlSchema }).optional(),
}).refine(
  (embed) =>
    embed.title !== undefined ||
    embed.description !== undefined ||
    embed.footer !== undefined ||
    embed.image !== undefined,
);
export type DiscordEmbed = z.infer<typeof DiscordEmbedSchema>;

const DiscordCustomButtonSchema = strictObjectSchema({
  type: z.literal(2),
  style: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  label: z.string().min(1).max(80),
  custom_id: z.string().min(1).max(100),
  disabled: z.boolean().optional(),
});
export type DiscordCustomButton = z.infer<
  typeof DiscordCustomButtonSchema
>;

const DiscordLinkButtonSchema = strictObjectSchema({
  type: z.literal(2),
  style: z.literal(5),
  label: z.string().min(1).max(80),
  url: HttpsUrlSchema,
  disabled: z.boolean().optional(),
});
export type DiscordLinkButton = z.infer<typeof DiscordLinkButtonSchema>;

const DiscordButtonSchema = z.discriminatedUnion("style", [
  DiscordCustomButtonSchema,
  DiscordLinkButtonSchema,
]);
export type DiscordButton = z.infer<typeof DiscordButtonSchema>;

const DiscordStringSelectOptionSchema = strictObjectSchema({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(100),
  description: z.string().min(1).max(100).optional(),
  default: z.boolean().optional(),
});
export type DiscordStringSelectOption = z.infer<
  typeof DiscordStringSelectOptionSchema
>;

const DiscordStringSelectSchema = strictObjectSchema({
  type: z.literal(3),
  custom_id: z.string().min(1).max(100),
  options: z.array(DiscordStringSelectOptionSchema).min(1).max(25),
  placeholder: z.string().min(1).max(150).optional(),
  min_values: z.number().int().min(0).optional(),
  max_values: z.number().int().min(1).optional(),
  disabled: z.boolean().optional(),
}).superRefine((select, context) => {
  const minimum = select.min_values ?? 1;
  const maximum = select.max_values ?? 1;
  if (maximum > select.options.length || minimum > maximum) {
    context.addIssue({ code: "custom", message: "Invalid select limits" });
  }
});
export type DiscordStringSelect = z.infer<
  typeof DiscordStringSelectSchema
>;

const DiscordActionRowSchema = strictObjectSchema({
  type: z.literal(1),
  components: z
    .array(z.union([DiscordButtonSchema, DiscordStringSelectSchema]))
    .min(1)
    .max(5),
}).superRefine((row, context) => {
  const selects = row.components.filter((component) => component.type === 3);
  if (selects.length > 0 && row.components.length !== 1) {
    context.addIssue({ code: "custom", message: "Invalid action row layout" });
  }
});
export type DiscordActionRow = z.infer<typeof DiscordActionRowSchema>;

const DiscordTextDisplaySchema = strictObjectSchema({
  type: z.literal(10),
  content: z.string().min(1).max(MAX_TEXT_DISPLAY_LENGTH),
});
export type DiscordTextDisplay = z.infer<typeof DiscordTextDisplaySchema>;

const DiscordUnfurledMediaItemSchema = strictObjectSchema({
  url: MediaUrlSchema,
});
export type DiscordUnfurledMediaItem = z.infer<
  typeof DiscordUnfurledMediaItemSchema
>;

const DiscordThumbnailSchema = strictObjectSchema({
  type: z.literal(11),
  media: DiscordUnfurledMediaItemSchema,
  description: AttachmentDescriptionSchema.optional(),
  spoiler: z.boolean().optional(),
});
export type DiscordThumbnail = z.infer<typeof DiscordThumbnailSchema>;

const DiscordSectionSchema = strictObjectSchema({
  type: z.literal(9),
  components: z.array(DiscordTextDisplaySchema).min(1).max(3),
  accessory: z.union([DiscordButtonSchema, DiscordThumbnailSchema]),
});
export type DiscordSection = z.infer<typeof DiscordSectionSchema>;

const DiscordMediaGalleryItemSchema = strictObjectSchema({
  media: DiscordUnfurledMediaItemSchema,
  description: AttachmentDescriptionSchema.optional(),
  spoiler: z.boolean().optional(),
});
export type DiscordMediaGalleryItem = z.infer<
  typeof DiscordMediaGalleryItemSchema
>;

const DiscordMediaGallerySchema = strictObjectSchema({
  type: z.literal(12),
  items: z.array(DiscordMediaGalleryItemSchema).min(1).max(10),
});
export type DiscordMediaGallery = z.infer<
  typeof DiscordMediaGallerySchema
>;

const DiscordFileSchema = strictObjectSchema({
  type: z.literal(13),
  file: strictObjectSchema({ url: AttachmentUrlSchema }),
  spoiler: z.boolean().optional(),
});
export type DiscordFile = z.infer<typeof DiscordFileSchema>;

const DiscordSeparatorSchema = strictObjectSchema({
  type: z.literal(14),
  divider: z.boolean().optional(),
  spacing: z.union([z.literal(1), z.literal(2)]).optional(),
});
export type DiscordSeparator = z.infer<typeof DiscordSeparatorSchema>;

const DiscordContainerChildSchema = z.discriminatedUnion("type", [
  DiscordActionRowSchema,
  DiscordSectionSchema,
  DiscordTextDisplaySchema,
  DiscordMediaGallerySchema,
  DiscordFileSchema,
  DiscordSeparatorSchema,
]);
export type DiscordContainerChild = z.infer<
  typeof DiscordContainerChildSchema
>;

const DiscordContainerSchema = strictObjectSchema({
  type: z.literal(17),
  components: z.array(DiscordContainerChildSchema).min(1).max(10),
  accent_color: ColorSchema.optional(),
  spoiler: z.boolean().optional(),
});
export type DiscordContainer = z.infer<typeof DiscordContainerSchema>;

const DiscordTopLevelComponentSchema = z.discriminatedUnion("type", [
  DiscordActionRowSchema,
  DiscordSectionSchema,
  DiscordTextDisplaySchema,
  DiscordMediaGallerySchema,
  DiscordFileSchema,
  DiscordSeparatorSchema,
  DiscordContainerSchema,
]);
export type DiscordTopLevelComponent = z.infer<
  typeof DiscordTopLevelComponentSchema
>;

export type DiscordLegacyMessage = {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
  flags?: never;
};

const ComponentsV2FlagsSchema = z
  .number()
  .int()
  .nonnegative()
  .refine((flags) => (flags & DISCORD_COMPONENTS_V2_FLAG) !== 0);
export type DiscordComponentsV2Message = {
  flags: z.infer<typeof ComponentsV2FlagsSchema>;
  components: DiscordTopLevelComponent[];
  content?: never;
  embeds?: never;
};
export type DiscordMessage =
  | DiscordLegacyMessage
  | DiscordComponentsV2Message;

const DiscordPngAttachmentSchema = strictObjectSchema({
  filename: z.string().regex(PNG_FILENAME),
  contentType: z.literal("image/png"),
  bytes: z.custom<Uint8Array>((value) => value instanceof Uint8Array).refine(
    (bytes) => bytes.byteLength > 0 && bytes.byteLength <= MAX_ATTACHMENT_BYTES,
  ),
  description: AttachmentDescriptionSchema.optional(),
});
export type DiscordPngAttachment = z.infer<
  typeof DiscordPngAttachmentSchema
>;

const ComponentsV2DiscriminatorSchema = z.looseObject({
  flags: z
    .number()
    .refine((flags) => (flags & DISCORD_COMPONENTS_V2_FLAG) !== 0),
});
const ComponentsV2LegacyFieldsSchema = z.looseObject({
  content: z.undefined().optional(),
  embeds: z.undefined().optional(),
});
const ComponentDiscriminatorSchema = z.looseObject({ type: z.number() });
const LegacyMessageEnvelopeSchema = strictObjectSchema({
  content: LegacyContentSchema.optional(),
  embeds: EmbedInputsSchema.optional(),
  components: ActionRowInputsSchema.optional(),
}).refine(
  (message) =>
    message.content !== undefined ||
    message.embeds !== undefined ||
    message.components !== undefined,
);
const ComponentsV2MessageEnvelopeSchema = strictObjectSchema({
  flags: z.number().int().nonnegative(),
  components: ComponentInputsSchema.min(1),
});
const ComponentsV2PayloadEnvelopeSchema = z.looseObject({
  flags: z.number().int().nonnegative(),
  components: ComponentInputsSchema.min(1),
  content: z.undefined().optional(),
  embeds: z.undefined().optional(),
});
const SectionEnvelopeSchema = strictObjectSchema({
  type: z.literal(9),
  components: ComponentInputsSchema.min(1).max(3),
  accessory: z.unknown(),
});
const ContainerEnvelopeSchema = strictObjectSchema({
  type: z.literal(17),
  components: ComponentInputsSchema.min(1).max(10),
  accent_color: ColorSchema.optional(),
  spoiler: z.boolean().optional(),
});

type AllowedMentions = { parse: [] };
type LegacyMessagePayload = {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
  flags?: number;
  allowed_mentions: AllowedMentions;
};
type LegacyMessageFields = Omit<LegacyMessagePayload, "allowed_mentions">;
type ComponentsV2MessagePayload = DiscordComponentsV2Message & {
  allowed_mentions: AllowedMentions;
};
type MessagePayload = LegacyMessagePayload | ComponentsV2MessagePayload;
type DiscordRequestBody = {
  type?: 5;
  data?: { flags: number };
  content?: string | null;
  embeds?: DiscordEmbed[];
  components?: DiscordTopLevelComponent[];
  flags?: number;
  allowed_mentions?: AllowedMentions;
  nonce?: string;
  enforce_nonce?: boolean;
};
type AttachmentMetadata = {
  id: 0;
  filename: string;
  description?: string;
};
type MultipartPayload = DiscordRequestBody & {
  attachments: AttachmentMetadata[];
};

function componentCount(component: DiscordTopLevelComponent): number {
  switch (component.type) {
    case 17:
      return 1 + component.components.reduce(
        (total, child) => total + componentCount(child),
        0,
      );
    case 9:
      return 2 + component.components.length;
    case 1:
      return 1 + component.components.length;
    default:
      return 1;
  }
}

function requireTextDisplay(value: SchemaInput): DiscordTextDisplay {
  const result = DiscordTextDisplaySchema.safeParse(value);
  if (!result.success) throw new Error("Discord text display is invalid");
  return result.data;
}

function requireActionRow(value: SchemaInput): DiscordActionRow {
  const result = DiscordActionRowSchema.safeParse(value);
  if (!result.success) throw new Error("Discord action row is invalid");
  return result.data;
}

function requireSection(value: SchemaInput): DiscordSection {
  const section = SectionEnvelopeSchema.safeParse(value);
  if (!section.success) throw new Error("Discord section is invalid");
  const components = section.data.components.map(requireTextDisplay);
  const accessory = ComponentDiscriminatorSchema.safeParse(section.data.accessory);
  if (!accessory.success) {
    throw new Error("Discord section accessory is invalid");
  }
  if (accessory.data.type === 11) {
    const thumbnail = DiscordThumbnailSchema.safeParse(section.data.accessory);
    if (!thumbnail.success) throw new Error("Discord thumbnail is invalid");
    return { type: 9, components, accessory: thumbnail.data };
  }
  const button = DiscordButtonSchema.safeParse(section.data.accessory);
  if (!button.success) throw new Error("Discord section accessory is invalid");
  return { type: 9, components, accessory: button.data };
}

function requireContainerChild(value: SchemaInput): DiscordContainerChild {
  const component = ComponentDiscriminatorSchema.safeParse(value);
  if (!component.success) throw new Error("Discord Container child is invalid");
  switch (component.data.type) {
    case 1:
      return requireActionRow(value);
    case 9:
      return requireSection(value);
    case 10:
      return requireTextDisplay(value);
    case 12: {
      const gallery = DiscordMediaGallerySchema.safeParse(value);
      if (!gallery.success) throw new Error("Discord media gallery is invalid");
      return gallery.data;
    }
    case 13: {
      const file = DiscordFileSchema.safeParse(value);
      if (!file.success) throw new Error("Discord file component is invalid");
      return file.data;
    }
    case 14: {
      const separator = DiscordSeparatorSchema.safeParse(value);
      if (!separator.success) throw new Error("Discord separator is invalid");
      return separator.data;
    }
    default:
      throw new Error("Discord Container child is invalid");
  }
}

function requireContainer(value: SchemaInput): DiscordContainer {
  const container = ContainerEnvelopeSchema.safeParse(value);
  if (!container.success) throw new Error("Discord Container is invalid");
  const result: DiscordContainer = {
    type: 17,
    components: container.data.components.map(requireContainerChild),
  };
  if (container.data.accent_color !== undefined) {
    result.accent_color = container.data.accent_color;
  }
  if (container.data.spoiler !== undefined) result.spoiler = container.data.spoiler;
  return result;
}

function requireTopLevelComponent(
  value: SchemaInput,
): DiscordTopLevelComponent {
  const result = DiscordTopLevelComponentSchema.safeParse(value);
  if (result.success) return result.data;
  const component = ComponentDiscriminatorSchema.safeParse(value);
  if (component.success && component.data.type === 17) {
    return requireContainer(value);
  }
  return requireContainerChild(value);
}

function requireV2Components(
  values: SchemaInput[],
): DiscordTopLevelComponent[] {
  const components = values.map(requireTopLevelComponent);
  const count = components.reduce(
    (total, component) => total + componentCount(component),
    0,
  );
  if (count > MAX_TOTAL_COMPONENTS) {
    throw new Error("Discord Components V2 message components are invalid");
  }
  return components;
}

function validateTarget(target: InteractionResponseTarget): void {
  if (!InteractionResponseTargetSchema.safeParse(target).success) {
    throw new Error("Discord interaction response target is invalid");
  }
}

export function isComponentsV2Message(
  message: DiscordMessage,
): message is DiscordComponentsV2Message {
  return ComponentsV2DiscriminatorSchema.safeParse(message).success;
}

export function validateDiscordMessage(value: SchemaInput): DiscordMessage {
  const boundary = boundaryObjectSchema.safeParse(value);
  if (!boundary.success) throw new Error("Discord message is invalid");

  if (ComponentsV2DiscriminatorSchema.safeParse(boundary.data).success) {
    const message = ComponentsV2MessageEnvelopeSchema.safeParse(boundary.data);
    if (!message.success) {
      throw new Error("Discord Components V2 message is invalid");
    }
    return {
      flags: message.data.flags,
      components: requireV2Components(message.data.components),
    };
  }

  const message = LegacyMessageEnvelopeSchema.safeParse(boundary.data);
  if (!message.success) throw new Error("Discord legacy message is invalid");
  const result: DiscordLegacyMessage = {};
  if (message.data.content !== undefined) result.content = message.data.content;
  if (message.data.embeds !== undefined) {
    result.embeds = message.data.embeds.map((embed) => {
      const parsed = DiscordEmbedSchema.safeParse(embed);
      if (!parsed.success) throw new Error("Discord embed is invalid");
      return parsed.data;
    });
  }
  if (message.data.components !== undefined) {
    result.components = message.data.components.map(requireActionRow);
  }
  return result;
}

function messagePayload(
  message: DiscordMessage,
  ephemeral: boolean | null,
): MessagePayload {
  if (isComponentsV2Message(message)) {
    if (!ComponentsV2LegacyFieldsSchema.safeParse(message).success) {
      throw new Error("Components V2 messages cannot contain content or embeds");
    }
    if (!ComponentsV2FlagsSchema.safeParse(message.flags).success) {
      throw new Error("Discord message flags are invalid");
    }
    const parsed = ComponentsV2PayloadEnvelopeSchema.safeParse(message);
    if (!parsed.success) {
      throw new Error("Discord Components V2 message components are invalid");
    }
    const components = requireV2Components(parsed.data.components);
    const flags = ephemeral === true
      ? parsed.data.flags | DISCORD_EPHEMERAL_FLAG
      : parsed.data.flags;
    if (ephemeral === false && (flags & DISCORD_EPHEMERAL_FLAG) !== 0) {
      throw new Error("Public Discord followups cannot be ephemeral");
    }
    return {
      flags,
      components,
      allowed_mentions: { parse: [] },
    };
  }

  const content = LegacyContentSchema.safeParse(message.content);
  if (message.content !== undefined && !content.success) {
    throw new Error("Discord message content is invalid");
  }
  const embeds = EmbedInputsSchema.safeParse(message.embeds);
  if (message.embeds !== undefined && !embeds.success) {
    throw new Error("Discord message embeds are invalid");
  }
  const rows = ActionRowInputsSchema.safeParse(message.components);
  if (message.components !== undefined && !rows.success) {
    throw new Error("Discord message components are invalid");
  }
  if (
    message.content === undefined &&
    message.embeds === undefined &&
    message.components === undefined
  ) {
    throw new Error("Discord message must contain content, embeds, or components");
  }

  const fields: LegacyMessageFields = {};
  if (content.success) fields.content = content.data;
  if (embeds.success) {
    fields.embeds = embeds.data.map((embed) => {
      const parsed = DiscordEmbedSchema.safeParse(embed);
      if (!parsed.success) throw new Error("Discord embed is invalid");
      return parsed.data;
    });
  }
  if (rows.success) fields.components = rows.data.map(requireActionRow);
  if (ephemeral !== null) {
    fields.flags = ephemeral ? DISCORD_EPHEMERAL_FLAG : 0;
  }
  return { ...fields, allowed_mentions: { parse: [] } };
}

function jsonRequest(
  url: string,
  method: string,
  body: DiscordRequestBody,
): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function interactionCallbackUrl(target: InteractionResponseTarget): string {
  return `https://discord.com/api/v10/interactions/${target.id}/${target.token}/callback`;
}

function interactionWebhookUrl(target: InteractionResponseTarget): string {
  return `https://discord.com/api/v10/webhooks/${target.applicationId}/${target.token}`;
}

export function buildDeferredResponse(
  target: InteractionResponseTarget,
  ephemeral: boolean,
): Request {
  validateTarget(target);
  return jsonRequest(
    interactionCallbackUrl(target),
    "POST",
    ephemeral
      ? { type: 5, data: { flags: DISCORD_EPHEMERAL_FLAG } }
      : { type: 5 },
  );
}

export function buildReadOriginalResponse(
  target: InteractionResponseTarget,
): Request {
  validateTarget(target);
  return new Request(`${interactionWebhookUrl(target)}/messages/@original`, {
    method: "GET",
  });
}

export function buildDeleteOriginalResponse(
  target: InteractionResponseTarget,
): Request {
  validateTarget(target);
  return new Request(`${interactionWebhookUrl(target)}/messages/@original`, {
    method: "DELETE",
  });
}

export function buildEditOriginalResponse(
  target: InteractionResponseTarget,
  message: DiscordMessage,
): Request {
  validateTarget(target);
  const payload = messagePayload(message, null);
  if (!isComponentsV2Message(message)) {
    return jsonRequest(
      `${interactionWebhookUrl(target)}/messages/@original`,
      "PATCH",
      payload,
    );
  }
  return jsonRequest(
    `${interactionWebhookUrl(target)}/messages/@original`,
    "PATCH",
    { ...payload, content: null, embeds: [] },
  );
}

export function buildFollowupResponse(
  target: InteractionResponseTarget,
  message: DiscordMessage,
  ephemeral: boolean,
): Request {
  validateTarget(target);
  return jsonRequest(
    interactionWebhookUrl(target),
    "POST",
    messagePayload(message, ephemeral),
  );
}

export function buildPublicFollowupResponse(
  target: InteractionResponseTarget,
  message: DiscordMessage,
): Request {
  validateTarget(target);
  return jsonRequest(
    `${interactionWebhookUrl(target)}?wait=true`,
    "POST",
    {
      ...messagePayload(message, false),
      nonce: `c${target.id}`,
      enforce_nonce: true,
    },
  );
}

function validateAttachment(
  attachment: DiscordPngAttachment,
): DiscordPngAttachment {
  const parsed = DiscordPngAttachmentSchema.safeParse(attachment);
  if (!parsed.success) {
    throw new Error("Discord PNG attachment is invalid");
  }
  return parsed.data;
}

function collectAttachmentUrls(component: DiscordTopLevelComponent): string[] {
  switch (component.type) {
    case 17:
      return component.components.flatMap(collectAttachmentUrls);
    case 9:
      return component.accessory.type === 11 &&
          ATTACHMENT_URL.test(component.accessory.media.url)
        ? [component.accessory.media.url]
        : [];
    case 12:
      return component.items
        .map((item) => item.media.url)
        .filter((url) => ATTACHMENT_URL.test(url));
    case 13:
      return [component.file.url];
    default:
      return [];
  }
}

function validateSingleAttachmentReference(
  message: DiscordMessage,
  filename: string,
): void {
  const expected = `attachment://${filename}`;
  if (isComponentsV2Message(message)) {
    const references = message.components.flatMap(collectAttachmentUrls);
    if (references.length < 1 || references.some((url) => url !== expected)) {
      throw new Error(
        "Discord Components V2 attachment reference does not match the file",
      );
    }
    return;
  }
  if (
    message.embeds?.some(
      (embed) => embed.image !== undefined && embed.image.url !== expected,
    ) ?? false
  ) {
    throw new Error("Discord embed attachment reference does not match the file");
  }
}

function responseWithFile(
  target: InteractionResponseTarget,
  message: DiscordMessage,
  attachment: DiscordPngAttachment,
  mode: "edit-original" | "followup" | "edit-followup",
  followupMessageId?: string,
): Request {
  validateTarget(target);
  const payload = messagePayload(message, null);
  const parsedAttachment = validateAttachment(attachment);
  if (mode === "edit-followup" && !snowflakeSchema.safeParse(followupMessageId).success) {
    throw new Error("Discord followup message id is invalid");
  }
  validateSingleAttachmentReference(message, parsedAttachment.filename);

  const metadata: AttachmentMetadata = {
    id: 0,
    filename: parsedAttachment.filename,
  };
  if (parsedAttachment.description !== undefined) {
    metadata.description = parsedAttachment.description;
  }

  let multipartPayload: MultipartPayload;
  if (mode === "followup") {
    multipartPayload = {
      ...payload,
      nonce: target.id,
      enforce_nonce: true,
      attachments: [metadata],
    };
  } else if (isComponentsV2Message(message)) {
    multipartPayload = {
      ...payload,
      content: null,
      embeds: [],
      attachments: [metadata],
    };
  } else {
    multipartPayload = { ...payload, attachments: [metadata] };
  }

  const form = new FormData();
  form.set("payload_json", JSON.stringify(multipartPayload));
  form.set(
    "files[0]",
    new Blob([parsedAttachment.bytes.slice().buffer], {
      type: parsedAttachment.contentType,
    }),
    parsedAttachment.filename,
  );

  let url = `${interactionWebhookUrl(target)}/messages/@original`;
  if (mode === "followup") url = `${interactionWebhookUrl(target)}?wait=true`;
  else if (mode === "edit-followup") {
    url = `${interactionWebhookUrl(target)}/messages/${followupMessageId ?? ""}`;
  }
  return new Request(url, {
    method: mode === "followup" ? "POST" : "PATCH",
    body: form,
  });
}

export function buildEditOriginalResponseWithFile(
  target: InteractionResponseTarget,
  message: DiscordMessage,
  attachment: DiscordPngAttachment,
): Request {
  return responseWithFile(target, message, attachment, "edit-original");
}

export function buildFollowupResponseWithFile(
  target: InteractionResponseTarget,
  message: DiscordMessage,
  attachment: DiscordPngAttachment,
): Request {
  return responseWithFile(target, message, attachment, "followup");
}

export function buildEditFollowupResponseWithFile(
  target: InteractionResponseTarget,
  followupMessageId: string,
  message: DiscordMessage,
  attachment: DiscordPngAttachment,
): Request {
  return responseWithFile(
    target,
    message,
    attachment,
    "edit-followup",
    followupMessageId,
  );
}
