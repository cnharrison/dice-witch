const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const PNG_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png$/i;
const EPHEMERAL_FLAG = 64;
const MAX_CONTENT_LENGTH = 2_000;
const MAX_EMBEDS = 10;
const MAX_TITLE_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 4_096;
const MAX_FOOTER_LENGTH = 2_048;
const MAX_ATTACHMENT_DESCRIPTION_LENGTH = 1_024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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

export type DiscordMessage = {
  content?: string;
  embeds?: DiscordEmbed[];
};

export type DiscordPngAttachment = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  description?: string;
};

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
    (embed.image !== undefined &&
      !/^attachment:\/\/[A-Za-z0-9][A-Za-z0-9._-]{0,103}$/.test(
        embed.image.url,
      ))
  ) {
    throw new Error("Discord embed is invalid");
  }
}

function messagePayload(
  message: DiscordMessage,
  ephemeral: boolean | null,
): Record<string, unknown> {
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
  if (message.content === undefined && message.embeds === undefined) {
    throw new Error("Discord message must contain content or embeds");
  }
  message.embeds?.forEach(validateEmbed);
  return {
    ...(message.content === undefined ? {} : { content: message.content }),
    ...(message.embeds === undefined ? {} : { embeds: message.embeds }),
    ...(ephemeral === null ? {} : { flags: ephemeral ? EPHEMERAL_FLAG : 0 }),
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
    ephemeral ? { type: 5, data: { flags: EPHEMERAL_FLAG } } : { type: 5 },
  );
}

export function buildEditOriginalResponse(
  target: InteractionResponseTarget,
  message: DiscordMessage,
): Request {
  validateTarget(target);
  return jsonRequest(
    `${interactionWebhookUrl(target)}/messages/@original`,
    "PATCH",
    messagePayload(message, null),
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

function validateAttachment(attachment: DiscordPngAttachment): void {
  if (
    !PNG_FILENAME.test(attachment.filename) ||
    attachment.contentType !== "image/png" ||
    attachment.bytes.byteLength === 0 ||
    attachment.bytes.byteLength > MAX_ATTACHMENT_BYTES ||
    (attachment.description !== undefined &&
      (attachment.description.length === 0 ||
        attachment.description.length > MAX_ATTACHMENT_DESCRIPTION_LENGTH))
  ) {
    throw new Error("Discord PNG attachment is invalid");
  }
}

export function buildEditOriginalResponseWithFile(
  target: InteractionResponseTarget,
  message: DiscordMessage,
  attachment: DiscordPngAttachment,
): Request {
  validateTarget(target);
  validateAttachment(attachment);
  const payload = messagePayload(message, null);
  const attachmentUrl = `attachment://${attachment.filename}`;
  if (
    message.embeds?.some(
      (embed) =>
        embed.image !== undefined && embed.image.url !== attachmentUrl,
    ) ?? false
  ) {
    throw new Error(
      "Discord embed attachment reference does not match the file",
    );
  }
  const metadata = {
    id: 0,
    filename: attachment.filename,
    ...(attachment.description === undefined
      ? {}
      : { description: attachment.description }),
  };
  const form = new FormData();
  form.set(
    "payload_json",
    JSON.stringify({ ...payload, attachments: [metadata] }),
  );
  form.set(
    "files[0]",
    new Blob([attachment.bytes.slice().buffer], {
      type: attachment.contentType,
    }),
    attachment.filename,
  );
  return new Request(
    `${interactionWebhookUrl(target)}/messages/@original`,
    { method: "PATCH", body: form },
  );
}
