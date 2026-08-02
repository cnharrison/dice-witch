const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const PNG_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png$/i;
const ATTACHMENT_URL = /^attachment:\/\/[A-Za-z0-9][A-Za-z0-9._-]{0,103}$/;
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

export type InteractionResponseTarget = {
  id: string;
  applicationId: string;
  token: string;
};

export type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  footer?: { text: string };
  image?: { url: string };
};

export type DiscordCustomButton = {
  type: 2;
  style: 1 | 2 | 3 | 4;
  label: string;
  custom_id: string;
  disabled?: boolean;
};

export type DiscordLinkButton = {
  type: 2;
  style: 5;
  label: string;
  url: string;
  disabled?: boolean;
};

export type DiscordButton = DiscordCustomButton | DiscordLinkButton;

export type DiscordStringSelectOption = {
  label: string;
  value: string;
  description?: string;
  default?: boolean;
};

export type DiscordStringSelect = {
  type: 3;
  custom_id: string;
  options: DiscordStringSelectOption[];
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
};

export type DiscordActionRow = {
  type: 1;
  components: Array<DiscordButton | DiscordStringSelect>;
};

export type DiscordTextDisplay = {
  type: 10;
  content: string;
};

export type DiscordUnfurledMediaItem = {
  url: string;
};

export type DiscordThumbnail = {
  type: 11;
  media: DiscordUnfurledMediaItem;
  description?: string;
  spoiler?: boolean;
};

export type DiscordSection = {
  type: 9;
  components: DiscordTextDisplay[];
  accessory: DiscordButton | DiscordThumbnail;
};

export type DiscordMediaGalleryItem = {
  media: DiscordUnfurledMediaItem;
  description?: string;
  spoiler?: boolean;
};

export type DiscordMediaGallery = {
  type: 12;
  items: DiscordMediaGalleryItem[];
};

export type DiscordFile = {
  type: 13;
  file: DiscordUnfurledMediaItem;
  spoiler?: boolean;
};

export type DiscordSeparator = {
  type: 14;
  divider?: boolean;
  spacing?: 1 | 2;
};

export type DiscordContainerChild =
  | DiscordActionRow
  | DiscordSection
  | DiscordTextDisplay
  | DiscordMediaGallery
  | DiscordFile
  | DiscordSeparator;

export type DiscordContainer = {
  type: 17;
  components: DiscordContainerChild[];
  accent_color?: number;
  spoiler?: boolean;
};

export type DiscordTopLevelComponent = DiscordContainerChild | DiscordContainer;

export type DiscordLegacyMessage = {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
  flags?: never;
};

export type DiscordComponentsV2Message = {
  flags: number;
  components: DiscordTopLevelComponent[];
  content?: never;
  embeds?: never;
};

export type DiscordMessage = DiscordLegacyMessage | DiscordComponentsV2Message;

export type DiscordPngAttachment = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  description?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function hasAllowedKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validateTarget(target: InteractionResponseTarget): void {
  if (
    !SNOWFLAKE.test(target.id) ||
    !SNOWFLAKE.test(target.applicationId) ||
    !INTERACTION_TOKEN.test(target.token)
  ) {
    throw new Error("Discord interaction response target is invalid");
  }
}

function validateEmbed(embed: DiscordEmbed): void {
  if (
    (embed.title === undefined &&
      embed.description === undefined &&
      embed.footer === undefined &&
      embed.image === undefined) ||
    (embed.title !== undefined &&
      (embed.title.length === 0 || embed.title.length > MAX_TITLE_LENGTH)) ||
    (embed.description !== undefined &&
      (embed.description.length === 0 ||
        embed.description.length > MAX_DESCRIPTION_LENGTH)) ||
    (embed.color !== undefined &&
      (!Number.isInteger(embed.color) || embed.color < 0 || embed.color > 0xff_ffff)) ||
    (embed.footer !== undefined &&
      (embed.footer.text.length === 0 ||
        embed.footer.text.length > MAX_FOOTER_LENGTH)) ||
    (embed.image !== undefined && !ATTACHMENT_URL.test(embed.image.url))
  ) {
    throw new Error("Discord embed is invalid");
  }
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function isValidMediaUrl(value: string): boolean {
  return ATTACHMENT_URL.test(value) || isValidHttpsUrl(value);
}

function hasComponentType(component: { type: number }, type: number): boolean {
  return component.type === type;
}

function isSeparatorSpacing(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2;
}

function isValidButton(component: DiscordButton): boolean {
  if (
    !hasAllowedKeys(component, ["type", "style", "label", "custom_id", "url", "disabled"]) ||
    !hasComponentType(component, 2) ||
    component.label.length < 1 ||
    component.label.length > 80 ||
    (component.disabled !== undefined && typeof component.disabled !== "boolean")
  ) {
    return false;
  }
  if (component.style === 5) {
    return (
      hasOnlyKeys(
        component,
        component.disabled === undefined
          ? ["type", "style", "label", "url"]
          : ["type", "style", "label", "url", "disabled"],
      ) && isValidHttpsUrl(component.url)
    );
  }
  return (
    [1, 2, 3, 4].includes(component.style) &&
    hasOnlyKeys(
      component,
      component.disabled === undefined
        ? ["type", "style", "label", "custom_id"]
        : ["type", "style", "label", "custom_id", "disabled"],
    ) &&
    component.custom_id.length >= 1 &&
    component.custom_id.length <= 100
  );
}

function isValidSelectOption(option: DiscordStringSelectOption): boolean {
  return (
    hasAllowedKeys(option, ["label", "value", "description", "default"]) &&
    option.label.length >= 1 &&
    option.label.length <= 100 &&
    option.value.length >= 1 &&
    option.value.length <= 100 &&
    (option.description === undefined ||
      (option.description.length >= 1 && option.description.length <= 100)) &&
    (option.default === undefined || typeof option.default === "boolean")
  );
}

function isValidStringSelect(component: DiscordStringSelect): boolean {
  const min = component.min_values ?? 1;
  const max = component.max_values ?? 1;
  return (
    hasAllowedKeys(component, [
      "type",
      "custom_id",
      "options",
      "placeholder",
      "min_values",
      "max_values",
      "disabled",
    ]) &&
    hasComponentType(component, 3) &&
    component.custom_id.length >= 1 &&
    component.custom_id.length <= 100 &&
    component.options.length >= 1 &&
    component.options.length <= 25 &&
    component.options.every(isValidSelectOption) &&
    (component.placeholder === undefined ||
      (component.placeholder.length >= 1 && component.placeholder.length <= 150)) &&
    Number.isInteger(min) &&
    min >= 0 &&
    Number.isInteger(max) &&
    max >= 1 &&
    max <= component.options.length &&
    min <= max &&
    (component.disabled === undefined || typeof component.disabled === "boolean")
  );
}

function validateActionRow(row: DiscordActionRow): void {
  if (
    !hasOnlyKeys(row, ["type", "components"]) ||
    !hasComponentType(row, 1) ||
    row.components.length < 1 ||
    row.components.length > 5
  ) {
    throw new Error("Discord action row is invalid");
  }
  const selects = row.components.filter((component) => component.type === 3);
  if (
    (selects.length > 0 &&
      (row.components.length !== 1 || !isValidStringSelect(selects[0] as DiscordStringSelect))) ||
    (selects.length === 0 &&
      row.components.some((component) => !isValidButton(component as DiscordButton)))
  ) {
    throw new Error("Discord action row is invalid");
  }
}

function validateDescription(value: string | undefined): boolean {
  return (
    value === undefined ||
    (value.length >= 1 && value.length <= MAX_ATTACHMENT_DESCRIPTION_LENGTH)
  );
}

function validateTextDisplay(component: DiscordTextDisplay): void {
  if (
    !hasOnlyKeys(component, ["type", "content"]) ||
    !hasComponentType(component, 10) ||
    component.content.length < 1 ||
    component.content.length > MAX_TEXT_DISPLAY_LENGTH
  ) {
    throw new Error("Discord text display is invalid");
  }
}

function validateThumbnail(component: DiscordThumbnail): void {
  if (
    !hasAllowedKeys(component, ["type", "media", "description", "spoiler"]) ||
    !hasComponentType(component, 11) ||
    !hasOnlyKeys(component.media, ["url"]) ||
    !isValidMediaUrl(component.media.url) ||
    !validateDescription(component.description) ||
    (component.spoiler !== undefined && typeof component.spoiler !== "boolean")
  ) {
    throw new Error("Discord thumbnail is invalid");
  }
}

function validateSection(component: DiscordSection): void {
  if (
    !hasOnlyKeys(component, ["type", "components", "accessory"]) ||
    !hasComponentType(component, 9) ||
    component.components.length < 1 ||
    component.components.length > 3
  ) {
    throw new Error("Discord section is invalid");
  }
  component.components.forEach(validateTextDisplay);
  if (component.accessory.type === 11) validateThumbnail(component.accessory);
  else if (!isValidButton(component.accessory)) {
    throw new Error("Discord section accessory is invalid");
  }
}

function validateMediaGallery(component: DiscordMediaGallery): void {
  if (
    !hasOnlyKeys(component, ["type", "items"]) ||
    !hasComponentType(component, 12) ||
    component.items.length < 1 ||
    component.items.length > 10 ||
    component.items.some(
      (item) =>
        !hasAllowedKeys(item, ["media", "description", "spoiler"]) ||
        !hasOnlyKeys(item.media, ["url"]) ||
        !isValidMediaUrl(item.media.url) ||
        !validateDescription(item.description) ||
        (item.spoiler !== undefined && typeof item.spoiler !== "boolean"),
    )
  ) {
    throw new Error("Discord media gallery is invalid");
  }
}

function validateFile(component: DiscordFile): void {
  if (
    !hasAllowedKeys(component, ["type", "file", "spoiler"]) ||
    !hasComponentType(component, 13) ||
    !hasOnlyKeys(component.file, ["url"]) ||
    !ATTACHMENT_URL.test(component.file.url) ||
    (component.spoiler !== undefined && typeof component.spoiler !== "boolean")
  ) {
    throw new Error("Discord file component is invalid");
  }
}

function validateSeparator(component: DiscordSeparator): void {
  if (
    !hasAllowedKeys(component, ["type", "divider", "spacing"]) ||
    !hasComponentType(component, 14) ||
    (component.divider !== undefined && typeof component.divider !== "boolean") ||
    (component.spacing !== undefined && !isSeparatorSpacing(component.spacing))
  ) {
    throw new Error("Discord separator is invalid");
  }
}

function validateContainerChild(component: DiscordContainerChild): void {
  switch (component.type) {
    case 1:
      validateActionRow(component);
      return;
    case 9:
      validateSection(component);
      return;
    case 10:
      validateTextDisplay(component);
      return;
    case 12:
      validateMediaGallery(component);
      return;
    case 13:
      validateFile(component);
      return;
    case 14:
      validateSeparator(component);
      return;
    default:
      throw new Error("Discord Container child is invalid");
  }
}

function validateContainer(component: DiscordContainer): void {
  if (
    !hasAllowedKeys(component, ["type", "components", "accent_color", "spoiler"]) ||
    !hasComponentType(component, 17) ||
    component.components.length < 1 ||
    component.components.length > 10 ||
    (component.accent_color !== undefined &&
      (!Number.isInteger(component.accent_color) ||
        component.accent_color < 0 ||
        component.accent_color > 0xff_ffff)) ||
    (component.spoiler !== undefined && typeof component.spoiler !== "boolean")
  ) {
    throw new Error("Discord Container is invalid");
  }
  component.components.forEach(validateContainerChild);
}

function componentCount(component: DiscordTopLevelComponent): number {
  if (component.type === 17) {
    return 1 + component.components.reduce(
      (total, child) => total + componentCount(child),
      0,
    );
  }
  if (component.type === 9) {
    return (
      2 +
      component.components.reduce(
        (total, child) => total + componentCount(child),
        0,
      )
    );
  }
  if (component.type === 1) return 1 + component.components.length;
  return 1;
}

function validateV2Components(components: DiscordTopLevelComponent[]): void {
  if (
    components.length < 1 ||
    components.reduce((total, component) => total + componentCount(component), 0) >
      MAX_TOTAL_COMPONENTS
  ) {
    throw new Error("Discord Components V2 message components are invalid");
  }
  for (const component of components) {
    if (component.type === 17) validateContainer(component);
    else validateContainerChild(component);
  }
}

function validateLegacyComponents(rows: DiscordActionRow[]): void {
  if (rows.length < 1 || rows.length > 5) {
    throw new Error("Discord message components are invalid");
  }
  rows.forEach(validateActionRow);
}

export function isComponentsV2Message(
  message: DiscordMessage,
): message is DiscordComponentsV2Message {
  return (
    typeof (message as { flags?: unknown }).flags === "number" &&
    (((message as { flags: number }).flags & DISCORD_COMPONENTS_V2_FLAG) !== 0)
  );
}

export function validateDiscordMessage(value: unknown): DiscordMessage {
  if (!isRecord(value)) throw new Error("Discord message is invalid");
  if (
    typeof value.flags === "number" &&
    (value.flags & DISCORD_COMPONENTS_V2_FLAG) !== 0
  ) {
    if (
      !hasOnlyKeys(value, ["components", "flags"]) ||
      !Number.isInteger(value.flags) ||
      value.flags < 0 ||
      !Array.isArray(value.components)
    ) {
      throw new Error("Discord Components V2 message is invalid");
    }
    validateV2Components(value.components as DiscordTopLevelComponent[]);
    return value;
  }
  if (
    !hasAllowedKeys(value, ["components", "content", "embeds"]) ||
    (value.content !== undefined &&
      (typeof value.content !== "string" ||
        value.content.length < 1 ||
        value.content.length > MAX_CONTENT_LENGTH)) ||
    (value.embeds !== undefined &&
      (!Array.isArray(value.embeds) ||
        value.embeds.length < 1 ||
        value.embeds.length > MAX_EMBEDS)) ||
    (value.components !== undefined && !Array.isArray(value.components)) ||
    (value.content === undefined &&
      value.embeds === undefined &&
      value.components === undefined)
  ) {
    throw new Error("Discord legacy message is invalid");
  }
  (value.embeds as DiscordEmbed[] | undefined)?.forEach(validateEmbed);
  if (value.components !== undefined) {
    validateLegacyComponents(value.components as DiscordActionRow[]);
  }
  return value;
}

function messagePayload(
  message: DiscordMessage,
  ephemeral: boolean | null,
): Record<string, unknown> {
  if (isComponentsV2Message(message)) {
    if (
      (message as { content?: unknown }).content !== undefined ||
      (message as { embeds?: unknown }).embeds !== undefined
    ) {
      throw new Error("Components V2 messages cannot contain content or embeds");
    }
    if (!Number.isInteger(message.flags) || message.flags < 0) {
      throw new Error("Discord message flags are invalid");
    }
    validateV2Components(message.components);
    const flags =
      ephemeral === true
        ? message.flags | DISCORD_EPHEMERAL_FLAG
        : message.flags;
    if (ephemeral === false && (flags & DISCORD_EPHEMERAL_FLAG) !== 0) {
      throw new Error("Public Discord followups cannot be ephemeral");
    }
    return {
      flags,
      components: message.components,
      allowed_mentions: { parse: [] },
    };
  }

  if (
    message.content !== undefined &&
    (message.content.length === 0 || message.content.length > MAX_CONTENT_LENGTH)
  ) {
    throw new Error("Discord message content is invalid");
  }
  if (
    message.embeds !== undefined &&
    (message.embeds.length === 0 || message.embeds.length > MAX_EMBEDS)
  ) {
    throw new Error("Discord message embeds are invalid");
  }
  if (
    message.content === undefined &&
    message.embeds === undefined &&
    message.components === undefined
  ) {
    throw new Error("Discord message must contain content, embeds, or components");
  }
  message.embeds?.forEach(validateEmbed);
  if (message.components !== undefined) validateLegacyComponents(message.components);
  return {
    ...(message.content === undefined ? {} : { content: message.content }),
    ...(message.embeds === undefined ? {} : { embeds: message.embeds }),
    ...(message.components === undefined ? {} : { components: message.components }),
    ...(ephemeral === null
      ? {}
      : { flags: ephemeral ? DISCORD_EPHEMERAL_FLAG : 0 }),
    allowed_mentions: { parse: [] },
  };
}

function jsonRequest(url: string, method: string, body: unknown): Request {
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
  // API v10 requires edit-only empty resets when an existing legacy message
  // first receives IS_COMPONENTS_V2; these fields do not become message content.
  return jsonRequest(
    `${interactionWebhookUrl(target)}/messages/@original`,
    "PATCH",
    isComponentsV2Message(message)
      ? { ...payload, content: null, embeds: [] }
      : payload,
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

function validateAttachment(attachment: DiscordPngAttachment): void {
  if (
    !PNG_FILENAME.test(attachment.filename) ||
    attachment.contentType !== "image/png" ||
    attachment.bytes.byteLength === 0 ||
    attachment.bytes.byteLength > MAX_ATTACHMENT_BYTES ||
    !validateDescription(attachment.description)
  ) {
    throw new Error("Discord PNG attachment is invalid");
  }
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
  validateAttachment(attachment);
  if (mode === "edit-followup" && !SNOWFLAKE.test(followupMessageId ?? "")) {
    throw new Error("Discord followup message id is invalid");
  }
  const payload = messagePayload(message, null);
  validateSingleAttachmentReference(message, attachment.filename);
  const metadata = {
    id: 0,
    filename: attachment.filename,
    ...(attachment.description === undefined
      ? {}
      : { description: attachment.description }),
  };
  let deliveryMetadata: Record<string, unknown> = {};
  if (mode === "followup") {
    deliveryMetadata = { nonce: target.id, enforce_nonce: true };
  } else if (isComponentsV2Message(message)) {
    deliveryMetadata = { content: null, embeds: [] };
  }
  const form = new FormData();
  form.set(
    "payload_json",
    JSON.stringify({
      ...payload,
      ...deliveryMetadata,
      attachments: [metadata],
    }),
  );
  form.set(
    "files[0]",
    new Blob([attachment.bytes.slice().buffer], {
      type: attachment.contentType,
    }),
    attachment.filename,
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
