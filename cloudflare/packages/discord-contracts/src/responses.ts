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

export type DiscordButton = {
  type: 2;
  style: 1 | 2 | 3 | 4;
  label: string;
  custom_id: string;
};

export type DiscordActionRow = {
  type: 1;
  components: DiscordButton[];
};

export type DiscordMessage = {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
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

function validateComponents(rows: DiscordActionRow[]): void {
  if (
    rows.length < 1 ||
    rows.length > 5 ||
    rows.some(
      (row) =>
        row.components.length < 1 ||
        row.components.length > 5 ||
        row.components.some(
          (component) =>
            ![1, 2, 3, 4].includes(component.style) ||
            component.label.length < 1 ||
            component.label.length > 80 ||
            component.custom_id.length < 1 ||
            component.custom_id.length > 100,
        ),
    )
  ) {
    throw new Error("Discord message components are invalid");
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
  if (
    message.content === undefined &&
    message.embeds === undefined &&
    message.components === undefined
  ) {
    throw new Error("Discord message must contain content, embeds, or components");
  }
  message.embeds?.forEach(validateEmbed);
  if (message.components !== undefined) validateComponents(message.components);
  return {
    ...(message.content === undefined ? {} : { content: message.content }),
    ...(message.embeds === undefined ? {} : { embeds: message.embeds }),
    ...(message.components === undefined ? {} : { components: message.components }),
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
    (attachment.description !== undefined &&
      (attachment.description.length === 0 ||
        attachment.description.length > MAX_ATTACHMENT_DESCRIPTION_LENGTH))
  ) {
    throw new Error("Discord PNG attachment is invalid");
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
    JSON.stringify({
      ...payload,
      ...(mode === "followup"
        ? { nonce: target.id, enforce_nonce: true }
        : {}),
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
