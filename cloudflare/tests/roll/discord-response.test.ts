import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildDeferredResponse,
  buildDeleteOriginalResponse,
  buildEditFollowupResponseWithFile,
  buildEditOriginalResponse,
  buildEditOriginalResponseWithFile,
  buildFollowupResponse,
  buildFollowupResponseWithFile,
  buildPublicFollowupResponse,
  DISCORD_COMPONENTS_V2_FLAG,
  validateDiscordMessage,
} from "../../packages/discord-contracts/src";

const target = {
  id: "1400000000000000000",
  applicationId: "100000000000000001",
  token: "interaction-token-value",
};
const MalformedComponentsMessageSchema = z.strictObject({
  flags: z.number(),
  content: z.string(),
  components: z.array(z.strictObject({
    type: z.number(),
    content: z.string(),
  })),
});

function malformedComponentsMessage(
  value: z.input<typeof MalformedComponentsMessageSchema>,
): Parameters<typeof buildEditOriginalResponse>[1] {
  const parsed = MalformedComponentsMessageSchema.parse(value);
  // SAFETY: This parsed fixture combines mutually exclusive fields to exercise the message validator boundary.
  return parsed as Parameters<typeof buildEditOriginalResponse>[1];
}

function formText(form: FormData, name: string): string {
  return z.string().parse(form.get(name));
}

function formFile(form: FormData, name: string): File {
  return z.instanceof(File).parse(form.get(name));
}

describe("Discord interaction response requests", () => {
  it("builds an immediate public deferred response", async () => {
    const request = buildDeferredResponse(target, false);

    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://discord.com/api/v10/interactions/1400000000000000000/interaction-token-value/callback",
    );
    await expect(request.json()).resolves.toEqual({ type: 5 });
  });

  it("sets the ephemeral flag only on the initial defer", async () => {
    const request = buildDeferredResponse(target, true);

    await expect(request.json()).resolves.toEqual({
      type: 5,
      data: { flags: 64 },
    });
  });

  it("deletes the original interaction response", () => {
    const request = buildDeleteOriginalResponse(target);

    expect(request.method).toBe("DELETE");
    expect(request.url).toBe(
      "https://discord.com/api/v10/webhooks/100000000000000001/interaction-token-value/messages/@original",
    );
    expect(request.body).toBeNull();
  });

  it("edits the original response without permitting mentions", async () => {
    const request = buildEditOriginalResponse(target, {
      content: "Result: 17",
      embeds: [{ title: "Attack", description: "1d20+5: [12]+5 = 17" }],
    });

    expect(request.method).toBe("PATCH");
    expect(request.url).toBe(
      "https://discord.com/api/v10/webhooks/100000000000000001/interaction-token-value/messages/@original",
    );
    await expect(request.json()).resolves.toEqual({
      content: "Result: 17",
      embeds: [{ title: "Attack", description: "1d20+5: [12]+5 = 17" }],
      allowed_mentions: { parse: [] },
    });
  });

  it("builds a Components V2 response without legacy content or embeds", async () => {
    const request = buildEditOriginalResponse(target, {
      flags: 1 << 15,
      components: [
        { type: 10, content: "_the dice clatter across the table_" },
        {
          type: 17,
          accent_color: 0x96_6f_33,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: "## Attack" }],
              accessory: {
                type: 2,
                style: 2,
                label: "Save",
                custom_id: "save-roll:v1:d:1400000000000000000",
              },
            },
            { type: 10, content: "1d20+5: [12]+5 = 17" },
          ],
        },
      ],
    });

    await expect(request.json()).resolves.toEqual({
      flags: 1 << 15,
      components: [
        { type: 10, content: "_the dice clatter across the table_" },
        {
          type: 17,
          accent_color: 0x96_6f_33,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: "## Attack" }],
              accessory: {
                type: 2,
                style: 2,
                label: "Save",
                custom_id: "save-roll:v1:d:1400000000000000000",
              },
            },
            { type: 10, content: "1d20+5: [12]+5 = 17" },
          ],
        },
      ],
      allowed_mentions: { parse: [] },
      content: null,
      embeds: [],
    });
  });

  it("combines Components V2 with the ephemeral followup flag", async () => {
    const request = buildFollowupResponse(
      target,
      {
        flags: 1 << 15,
        components: [{ type: 10, content: "Private diagnostic" }],
      },
      true,
    );

    await expect(request.json()).resolves.toEqual({
      flags: (1 << 15) | 64,
      components: [{ type: 10, content: "Private diagnostic" }],
      allowed_mentions: { parse: [] },
    });
  });

  it("rejects legacy fields on Components V2 messages", () => {
    expect(() =>
      buildEditOriginalResponse(
        target,
        malformedComponentsMessage({
          flags: 1 << 15,
          content: "legacy content",
          components: [{ type: 10, content: "V2 text" }],
        }),
      ),
    ).toThrow("Components V2 messages cannot contain content or embeds");
  });

  it("rejects an ephemeral Components V2 message as a public followup", () => {
    expect(() =>
      buildPublicFollowupResponse(target, {
        flags: DISCORD_COMPONENTS_V2_FLAG | 64,
        components: [{ type: 10, content: "Private diagnostic" }],
      })
    ).toThrow("Public Discord followups cannot be ephemeral");
  });

  it("creates an explicitly ephemeral followup", async () => {
    const request = buildFollowupResponse(
      target,
      { content: "Private diagnostic" },
      true,
    );

    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://discord.com/api/v10/webhooks/100000000000000001/interaction-token-value",
    );
    await expect(request.json()).resolves.toEqual({
      content: "Private diagnostic",
      flags: 64,
      allowed_mentions: { parse: [] },
    });
  });

  it("creates a replay-safe public clatter followup and waits for its id", async () => {
    const request = buildPublicFollowupResponse(target, { content: "_clatter_" });

    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://discord.com/api/v10/webhooks/100000000000000001/interaction-token-value?wait=true",
    );
    await expect(request.json()).resolves.toEqual({
      content: "_clatter_",
      allowed_mentions: { parse: [] },
      flags: 0,
      nonce: `c${target.id}`,
      enforce_nonce: true,
    });
  });

  it("builds a multipart original-response edit with attachment metadata", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const expectedBytes = png.slice().buffer;
    const request = buildEditOriginalResponseWithFile(
      target,
      {
        embeds: [
          {
            description: "1d20: [17] = 17",
            image: { url: "attachment://dice.png" },
          },
        ],
      },
      {
        filename: "dice.png",
        contentType: "image/png",
        bytes: png,
        description: "Rendered dice result",
      },
    );

    png.fill(0);
    expect(request.method).toBe("PATCH");
    expect(request.headers.get("content-type")).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    const form = await request.formData();
    expect([...form.keys()]).toEqual(["payload_json", "files[0]"]);
    const payload = formText(form, "payload_json");
    expect(JSON.parse(payload)).toEqual({
      embeds: [
        {
          description: "1d20: [17] = 17",
          image: { url: "attachment://dice.png" },
        },
      ],
      allowed_mentions: { parse: [] },
      attachments: [
        {
          id: 0,
          filename: "dice.png",
          description: "Rendered dice result",
        },
      ],
    });
    const file = formFile(form, "files[0]");
    expect(file).toMatchObject({
      name: "dice.png",
      size: 4,
      type: "image/png",
    });
    await expect(file.arrayBuffer()).resolves.toEqual(expectedBytes);
  });

  it("builds a V2 media gallery attachment response", async () => {
    const request = buildEditOriginalResponseWithFile(
      target,
      {
        flags: 1 << 15,
        components: [
          {
            type: 12,
            items: [
              {
                media: { url: "attachment://dice.png" },
                description: "Rendered dice result",
              },
            ],
          },
        ],
      },
      {
        filename: "dice.png",
        contentType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71]),
        description: "Rendered dice result",
      },
    );

    const form = await request.formData();
    const payload = formText(form, "payload_json");
    expect(JSON.parse(payload)).toMatchObject({
      flags: 1 << 15,
      content: null,
      embeds: [],
      components: [
        {
          type: 12,
          items: [
            {
              media: { url: "attachment://dice.png" },
              description: "Rendered dice result",
            },
          ],
        },
      ],
      attachments: [
        {
          id: 0,
          filename: "dice.png",
          description: "Rendered dice result",
        },
      ],
    });
  });

  it("edits an identified public followup with the final attachment", async () => {
    const request = buildEditFollowupResponseWithFile(
      target,
      "1500000000000000000",
      { embeds: [{ image: { url: "attachment://dice.png" } }] },
      {
        filename: "dice.png",
        contentType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71]),
      },
    );

    expect(request.method).toBe("PATCH");
    expect(request.url).toBe(
      "https://discord.com/api/v10/webhooks/100000000000000001/interaction-token-value/messages/1500000000000000000",
    );
    const form = await request.formData();
    const payload = formText(form, "payload_json");
    expect(JSON.parse(payload)).toMatchObject({
      attachments: [{ id: 0, filename: "dice.png" }],
    });
    expect(JSON.parse(payload)).not.toHaveProperty("nonce");
  });

  it("builds a replay-safe public multipart followup", async () => {
    const request = buildFollowupResponseWithFile(
      target,
      {
        embeds: [
          {
            description: "1d20: [17] = 17",
            image: { url: "attachment://dice.png" },
          },
        ],
      },
      {
        filename: "dice.png",
        contentType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71]),
      },
    );

    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://discord.com/api/v10/webhooks/100000000000000001/interaction-token-value?wait=true",
    );
    const form = await request.formData();
    const payload = formText(form, "payload_json");
    expect(JSON.parse(payload)).toMatchObject({
      nonce: target.id,
      enforce_nonce: true,
      attachments: [{ id: 0, filename: "dice.png" }],
    });
  });

  it.each([
    { message: {}, target },
    { message: { content: "" }, target },
    { message: { content: "x".repeat(2_001) }, target },
    { message: { embeds: [] }, target },
    { message: { embeds: [{}] }, target },
    {
      message: { content: "result" },
      target: { ...target, token: "../unsafe" },
    },
  ])("rejects unsafe message input %#", ({ message, target: requestTarget }) => {
    expect(() => buildEditOriginalResponse(requestTarget, message)).toThrow();
  });

  it("requires Components V2 attachment references to match the file", () => {
    expect(() =>
      buildEditOriginalResponseWithFile(
        target,
        {
          flags: DISCORD_COMPONENTS_V2_FLAG,
          components: [{ type: 10, content: "result" }],
        },
        {
          filename: "dice.png",
          contentType: "image/png",
          bytes: new Uint8Array([1]),
        },
      )
    ).toThrow(
      "Discord Components V2 attachment reference does not match the file",
    );
  });

  it("rejects an embed that references a different attachment", () => {
    expect(() =>
      buildEditOriginalResponseWithFile(
        target,
        { embeds: [{ image: { url: "attachment://other.png" } }] },
        {
          filename: "dice.png",
          contentType: "image/png",
          bytes: new Uint8Array([1]),
        },
      ),
    ).toThrow("Discord embed attachment reference does not match the file");
  });

  it.each([
    { filename: "../dice.png", bytes: new Uint8Array([1]) },
    { filename: "dice.txt", bytes: new Uint8Array([1]) },
    { filename: "dice.png", bytes: new Uint8Array() },
    { filename: "dice.png", bytes: new Uint8Array(10 * 1024 * 1024 + 1) },
  ])("rejects unsafe attachment input %#", ({ filename, bytes }) => {
    expect(() =>
      buildEditOriginalResponseWithFile(
        target,
        { content: "result" },
        { filename, contentType: "image/png", bytes },
      ),
    ).toThrow();
  });

  it("validates strict legacy and Components V2 message trees", () => {
    expect(() =>
      validateDiscordMessage({ content: "result", extra: true })
    ).toThrow("Discord legacy message is invalid");
    expect(() =>
      validateDiscordMessage({
        flags: DISCORD_COMPONENTS_V2_FLAG,
        components: [{ type: 10, content: "result", extra: true }],
      })
    ).toThrow("Discord text display is invalid");
    expect(() =>
      validateDiscordMessage({
        flags: DISCORD_COMPONENTS_V2_FLAG,
        components: [{
          type: 1,
          components: [
            {
              type: 3,
              custom_id: "select",
              options: [{ label: "One", value: "one" }],
            },
            { type: 2, style: 2, label: "Other", custom_id: "other" },
          ],
        }],
      })
    ).toThrow("Discord action row is invalid");
  });

  it("enforces the aggregate Components V2 component limit", () => {
    const component = { type: 10 as const, content: "result" };
    expect(
      validateDiscordMessage({
        flags: DISCORD_COMPONENTS_V2_FLAG,
        components: Array.from({ length: 40 }, () => component),
      }),
    ).toBeTruthy();
    expect(() =>
      validateDiscordMessage({
        flags: DISCORD_COMPONENTS_V2_FLAG,
        components: Array.from({ length: 41 }, () => component),
      })
    ).toThrow("Discord Components V2 message components are invalid");
  });

  it("preserves target, message, attachment, then followup-id validation order", () => {
    const invalidTarget = { ...target, token: "../unsafe" };
    const invalidAttachment = {
      filename: "dice.txt",
      contentType: "image/png" as const,
      bytes: new Uint8Array(),
    };
    expect(() =>
      buildEditFollowupResponseWithFile(
        invalidTarget,
        "bad-id",
        {},
        invalidAttachment,
      )
    ).toThrow("Discord interaction response target is invalid");
    expect(() =>
      buildEditFollowupResponseWithFile(
        target,
        "bad-id",
        {},
        invalidAttachment,
      )
    ).toThrow("Discord message must contain content, embeds, or components");
    expect(() =>
      buildEditFollowupResponseWithFile(
        target,
        "bad-id",
        { content: "result" },
        invalidAttachment,
      )
    ).toThrow("Discord PNG attachment is invalid");
    expect(() =>
      buildEditFollowupResponseWithFile(
        target,
        "bad-id",
        { content: "result" },
        {
          filename: "dice.png",
          contentType: "image/png",
          bytes: new Uint8Array([1]),
        },
      )
    ).toThrow("Discord followup message id is invalid");
  });
});
