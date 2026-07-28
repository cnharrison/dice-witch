import { describe, expect, it } from "vitest";
import {
  buildDeferredResponse,
  buildDeleteOriginalResponse,
  buildEditFollowupResponseWithFile,
  buildEditOriginalResponse,
  buildEditOriginalResponseWithFile,
  buildFollowupResponse,
  buildFollowupResponseWithFile,
  buildPublicFollowupResponse,
} from "../../packages/discord-contracts/src";

const target = {
  id: "1400000000000000000",
  applicationId: "100000000000000001",
  token: "interaction-token-value",
};

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

    expect(request.method).toBe("PATCH");
    expect(request.headers.get("content-type")).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    const form = await request.formData();
    const payload = form.get("payload_json");
    expect(typeof payload).toBe("string");
    if (typeof payload !== "string") {
      throw new Error("Multipart payload_json is missing");
    }
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
    const file = form.get("files[0]");
    expect(file).toBeInstanceOf(File);
    expect(file).toMatchObject({
      name: "dice.png",
      size: 4,
      type: "image/png",
    });
    await expect((file as File).arrayBuffer()).resolves.toEqual(png.buffer);
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
    const payload = form.get("payload_json");
    if (typeof payload !== "string") {
      throw new Error("Multipart payload_json is missing");
    }
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
    const payload = form.get("payload_json");
    if (typeof payload !== "string") {
      throw new Error("Multipart payload_json is missing");
    }
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
});
