import { exports } from "cloudflare:workers";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  DISCORD_GLOBAL_COMMANDS,
  isComponentsV2Message,
  rollLogContextDescription,
  validateDiscordMessage,
  type DiscordTopLevelComponent,
  type RollLogArtifactV1,
} from "../../packages/discord-contracts/src";
import {
  captureAudienceSnapshot,
  createGameDetectionAnnouncementV1,
  createRollLifecycleAlertV1,
  createRollLifecycleAlertV2,
  deliverChannelRollMessageV1,
  deliverRollLogV1,
  deliverWebRoll,
  fetchPublicStats,
  inspectDiscordMessageExistence,
  inspectMembership,
  inspectRollerGuild,
  listCurrentGuildIds,
  listCurrentGuildIdsPage,
  listMemberTextChannels,
  listTextChannels,
  logGuildLifecycle,
  logRoll,
  registerDevelopmentGuildCommands,
  registerGlobalCommands,
  reportBotListStats,
  resolveDiscordChannelContextV1,
  resolveGameDetectionChannelContextV1,
  sendRollHelper,
  updateRollLifecycleAlertV1,
  updateRollLifecycleAlertV2,
} from "../../workers/discord-rest/src";

const guildId = "100000000000000001";
const audienceCapturedAt = 1_767_225_600_123;
const userId = "100000000000000003";
const adminRoleId = "100000000000000005";
const SnowflakeSchema = z.string().regex(/^[1-9]\d{16,19}$/u);
const AllowedMentionsSchema = z.strictObject({ parse: z.tuple([]) });
const AttachmentMetadataSchema = z.strictObject({
  id: z.union([z.literal(0), z.literal("0")]),
  filename: z.string(),
  description: z.string(),
});
const ComponentsV2RequestEnvelopeSchema = z.strictObject({
  flags: z.number().int().nonnegative(),
  components: z.array(z.json()).min(1),
  allowed_mentions: AllowedMentionsSchema,
  nonce: z.string().optional(),
  enforce_nonce: z.boolean().optional(),
  content: z.null().optional(),
  embeds: z.tuple([]).optional(),
  attachments: z.array(AttachmentMetadataSchema).optional(),
});
const MultipartRequestSchema = z.strictObject({
  payloadJson: z.string(),
  file: z.instanceof(File),
});
const LegacyWebRollRequestSchema = z.strictObject({
  embeds: z.tuple([]),
  content: z.null().optional(),
  nonce: SnowflakeSchema.optional(),
  enforce_nonce: z.literal(true).optional(),
  allowed_mentions: AllowedMentionsSchema,
  attachments: z.array(AttachmentMetadataSchema).length(1),
});
const JsonErrorResponseSchema = z.strictObject({ error: z.string() });
const DmChannelRequestSchema = z.strictObject({ recipient_id: SnowflakeSchema });
const BotListStatsSchema = z.union([
  z.strictObject({ server_count: z.number().int().nonnegative() }),
  z.strictObject({ guilds: z.number().int().nonnegative() }),
]);
const RollLogContextSchema = z.strictObject({
  kind: z.literal("guild-partial"),
  guildId: SnowflakeSchema,
  guildName: z.string().nullable(),
  channelId: SnowflakeSchema,
  channelName: z.string().nullable(),
  channelType: z.number().int().nullable(),
});
const RollLogTelemetryFields = {
  telemetryVersion: z.literal(2),
  subsystem: z.literal("private-roll-log"),
  rollId: SnowflakeSchema,
  interactionId: SnowflakeSchema,
  source: z.literal("discord"),
  notation: z.string(),
  userId: SnowflakeSchema,
  username: z.string(),
  guildId: SnowflakeSchema,
  channelId: SnowflakeSchema,
  context: RollLogContextSchema,
  guildName: z.string().nullable(),
  channelName: z.string().nullable(),
  channelType: z.number().int().nullable(),
  title: z.string().nullable(),
  destinationPayload: z.json(),
  destinationDeliveredAt: z.number().int().nonnegative(),
  imageStatus: z.literal("available"),
  imageFilename: z.string(),
  imageUnavailableReason: z.null(),
};
const InaccessibleRollLogTelemetrySchema = z.strictObject({
  ...RollLogTelemetryFields,
  logicalShard: z.null(),
  level: z.literal("warn"),
  message: z.literal("Discord roll log context is inaccessible"),
  userImpact: z.literal("none"),
  failureKind: z.literal("context-inaccessible"),
  channelHttpStatus: z.literal(403),
  guildHttpStatus: z.literal(200),
});
const DeliveredRollLogTelemetrySchema = z.strictObject({
  ...RollLogTelemetryFields,
  logicalShard: z.strictObject({ status: z.literal("unavailable") }),
  level: z.literal("info"),
  message: z.literal("Private roll log delivered"),
  logMessageId: SnowflakeSchema,
  userImpact: z.literal("none"),
  httpStatus: z.literal(200),
});

type ComponentsV2Request = Omit<
  z.output<typeof ComponentsV2RequestEnvelopeSchema>,
  "components"
> & { components: DiscordTopLevelComponent[] };
type RequestFetch = NonNullable<Parameters<typeof registerGlobalCommands>[1]>;

function controlText(
  control: Extract<DiscordTopLevelComponent, { type: 1 }>["components"][number],
): string {
  return control.type === 2
    ? control.label
    : control.options.map((option) => option.label).join("\n");
}

function discordComponentText(component: DiscordTopLevelComponent): string {
  switch (component.type) {
    case 1:
      return component.components.map(controlText).join("\n");
    case 9:
      return [
        componentText(component.components),
        component.accessory.type === 2
          ? component.accessory.label
          : component.accessory.description ?? "",
      ].filter(Boolean).join("\n");
    case 10:
      return component.content;
    case 12:
      return component.items.map((item) => item.description ?? "").join("\n");
    case 13:
    case 14:
      return "";
    case 17:
      return componentText(component.components);
  }
}

function componentText(components: readonly DiscordTopLevelComponent[]): string {
  return components.map(discordComponentText).filter(Boolean).join("\n");
}

function sectionAccessoryUrl(
  accessory: Extract<DiscordTopLevelComponent, { type: 9 }>["accessory"],
): string | null {
  if (accessory.type === 11) return accessory.media.url;
  return accessory.style === 5 ? accessory.url : null;
}

function discordComponentUrls(component: DiscordTopLevelComponent): string[] {
  switch (component.type) {
    case 1:
      return component.components.flatMap((control) =>
        control.type === 2 && control.style === 5 ? [control.url] : []
      );
    case 9:
      return [
        ...component.components.flatMap(discordComponentUrls),
        sectionAccessoryUrl(component.accessory),
      ].filter((url): url is string => url !== null);
    case 12:
      return component.items.map((item) => item.media.url);
    case 13:
      return [component.file.url];
    case 17:
      return component.components.flatMap(discordComponentUrls);
    case 10:
    case 14:
      return [];
  }
}

function componentUrls(components: readonly DiscordTopLevelComponent[]): string[] {
  return components.flatMap(discordComponentUrls);
}

function discordComponentCustomIds(
  component: DiscordTopLevelComponent,
): string[] {
  switch (component.type) {
    case 1:
      return component.components.flatMap((control) => {
        if (control.type === 3) return [control.custom_id];
        return control.style === 5 ? [] : [control.custom_id];
      });
    case 9:
      return [
        ...component.components.flatMap(discordComponentCustomIds),
        component.accessory.type === 2 && component.accessory.style !== 5
          ? component.accessory.custom_id
          : null,
      ].filter((customId): customId is string => customId !== null);
    case 17:
      return component.components.flatMap(discordComponentCustomIds);
    case 10:
    case 12:
    case 13:
    case 14:
      return [];
  }
}

function componentCustomIds(
  components: readonly DiscordTopLevelComponent[],
): string[] {
  return components.flatMap(discordComponentCustomIds);
}

function parseComponentsV2RequestBody(encoded: string): ComponentsV2Request {
  const envelope = ComponentsV2RequestEnvelopeSchema.safeParse(
    JSON.parse(encoded),
  );
  if (!envelope.success) throw new Error("Discord request payload is invalid");
  const message = validateDiscordMessage({
    flags: envelope.data.flags,
    components: envelope.data.components,
  });
  if (!isComponentsV2Message(message)) {
    throw new Error("Discord request payload must use Components V2");
  }
  return { ...envelope.data, components: message.components };
}

async function parseComponentsV2Request(
  request: Request,
): Promise<ComponentsV2Request> {
  return parseComponentsV2RequestBody(await request.text());
}

async function parseMultipartRequest(request: Request) {
  const form = await request.formData();
  const multipart = MultipartRequestSchema.safeParse({
    payloadJson: form.get("payload_json"),
    file: form.get("files[0]"),
  });
  if (!multipart.success) throw new Error("Discord multipart request is invalid");
  return multipart.data;
}

async function parseJsonRequest<T>(
  request: Request | Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) throw new Error("JSON request fixture is invalid");
  return parsed.data;
}

const logPng = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);

function rollLogArtifact(): RollLogArtifactV1 {
  return {
    version: 1,
    rollId: "1400000000000000001",
    source: "discord",
    notation: "1d20",
    user: { id: userId, username: "roller" },
    guildId,
    channelId: "100000000000000010",
    context: {
      kind: "guild",
      guildId,
      guildName: "Fixture Guild",
      channelId: "100000000000000010",
      channelName: "dice-rolls",
      channelType: 0,
    },
    destinationDeliveredAt: 1_750_000_000_000,
    payload: {
      content: "_...clatter..._",
      embeds: [
        {
          description: "1d20: [20] = 20",
          color: 0x96_6f_33,
          footer: { text: "sent to roller via discord" },
          image: { url: "attachment://dice-1400000000000000001.png" },
        },
      ],
    },
    image: {
      status: "available",
      filename: "dice-1400000000000000001.png",
      png: logPng,
    },
  };
}

const env = {
  DISCORD_APPLICATION_ID: "100000000000000001",
  DISCORD_BOT_TOKEN: "fixture.bot.token",
  DISCORD_TEST_GUILD_ID: "100000000000000002",
  INVITE_LINK: "https://discord.com/oauth2/authorize?client_id=100000000000000001",
  SUPPORT_SERVER_LINK: "https://discord.gg/fixture",
  LOG_OUTPUT_CHANNEL_ID: "100000000000000099",
  ROLL_LIFECYCLE_ALERT_CHANNEL_ID: "100000000000000098",
  GAME_DETECTION_CHANNEL_ID: "100000000000000097",
  TOPGG_KEY: "fixture-topgg-token",
  DISCORD_BOT_LIST_KEY: "fixture-discord-bot-list-token",
};

function gameDetectionAnnouncement() {
  return {
    version: 1 as const,
    detectionId: "1400000000000000001:0123456789abcdef",
    sessionId: "1400000000000000001",
    previousGameId: null,
    gameId: "dungeons-and-dragons-5e-2014",
    gameName: "Dungeons & Dragons fifth edition (2014)",
    confidence: "strong" as const,
    detectedAt: 1_750_000_010_000,
    scope: "guild" as const,
    guildId,
    channelId: "100000000000000010",
    guildName: "Fixture Guild",
    channelName: "dice-rolls",
    rollCount: 6,
    sessionStartedAt: 1_750_000_000_000,
    sessionLastRollAt: 1_750_000_009_000,
  };
}

function lifecycleAlert(alertMessageId: string | null = null) {
  return {
    version: 1 as const,
    interactionId: "1400000000000000001",
    alertMessageId,
    state: alertMessageId === null ? "delivery_started" as const : "delivered" as const,
    deferredAt: 1_749_999_999_990,
    acceptedAt: 1_750_000_000_000,
    deliveryStartedAt: 1_750_000_000_010,
    terminalAt: alertMessageId === null ? null : 1_750_000_120_000,
    attempts: 2,
    httpStatus: alertMessageId === null ? null : 200,
    failurePhase: null,
    failureCode: null,
    context: {
      version: 1 as const,
      applicationId: "100000000000000001",
      notation: "1d20",
      request: { notation: ["1d20"], repetitions: 1 },
      title: "Initiative",
      savedRoll: null,
      userId,
      username: "roller",
      guildId,
      channelId: "100000000000000010",
      guildName: "Fixture Guild",
      channelName: "dice-rolls",
      channelType: 0,
      outcome: { version: 1, outcomes: [], errors: [] },
      rollSeed: 1,
      renderSeed: 2,
      renderVersion: 4,
      rendererRevision: "canvaskit-v4-r8",
      destinationPayload: null,
    },
  };
}

function lifecycleAlertV2(alertMessageId: string | null = null) {
  return {
    ...lifecycleAlert(alertMessageId),
    version: 2 as const,
    receivedAt: 1_749_999_999_980,
    diagnostics: {
      handlerStartedAt: 1_749_999_999_985,
      acknowledgementPreparedAt: 1_749_999_999_995,
      acknowledgementType: 5 as const,
      firstProviderAttemptAt: 1_750_000_000_010,
      clatterSucceededAt: 1_750_000_000_020,
      discordErrorCode: alertMessageId === null ? 10_015 : null,
      discordOperation:
        alertMessageId === null ? "edit-original-result" as const : null,
      originalResponseMessageId: "100000000000000087",
      originalResponseProbe: alertMessageId === null ? "missing" as const : null,
    },
  };
}

describe("Discord REST service", () => {
  it("posts a silent idempotent game detection only to its dedicated private channel", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST");
      expect(request.url).toBe(
        "https://discord.com/api/v10/channels/100000000000000097/messages",
      );
      const payload = await parseComponentsV2Request(request);
      expect(payload).toMatchObject({
        flags: (1 << 12) | (1 << 15),
        nonce: "g000000010123456789abcdef",
        enforce_nonce: true,
        allowed_mentions: { parse: [] },
      });
      const text = componentText(payload.components);
      expect(text).toContain("Game detected");
      expect(text).toContain("Dungeons & Dragons");
      expect(text).toContain("Fixture Guild");
      expect(text).not.toMatch(/Attack|Initiative|fixture-player/);
      return Response.json({ id: "100000000000000087" });
    });

    await expect(
      createGameDetectionAnnouncementV1(
        env,
        gameDetectionAnnouncement(),
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "delivered",
      messageId: "100000000000000087",
      httpStatus: 200,
    });
    expect(discordFetch).toHaveBeenCalledOnce();
  });

  it("renders a detection with genuinely unavailable display names", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      const payload = await parseComponentsV2Request(request);
      const text = componentText(payload.components);
      expect(text).toContain(`Guild ${guildId}`);
      expect(text).toContain("<#100000000000000010>");
      expect(text).not.toContain("Unknown");
      return Response.json({ id: "100000000000000086" });
    });

    await expect(
      createGameDetectionAnnouncementV1(
        env,
        {
          ...gameDetectionAnnouncement(),
          guildName: null,
          channelName: null,
        },
        discordFetch,
      ),
    ).resolves.toMatchObject({ status: "delivered" });
  });

  it("resolves a channel through the shared authenticated Discord boundary", async () => {
    const discordFetch = vi.fn((request: Request) => {
      expect(request.method).toBe("GET");
      expect(request.url).toBe(
        "https://discord.com/api/v10/channels/100000000000000010",
      );
      return Promise.resolve(Response.json({
        id: "100000000000000010",
        guild_id: guildId,
        name: "resolved-rolls",
        type: 0,
      }));
    });

    await expect(
      resolveDiscordChannelContextV1(
        env,
        {
          version: 1,
          guildId,
          channelId: "100000000000000010",
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "resolved",
      channelName: "resolved-rolls",
      channelType: 0,
    });
  });

  it("returns bounded retry guidance for a rate-limited channel lookup", async () => {
    const discordFetch = vi.fn(() => Promise.resolve(
      Response.json(
        { message: "rate limited" },
        { status: 429, headers: { "retry-after": "0.5" } },
      ),
    ));

    await expect(
      resolveGameDetectionChannelContextV1(
        env,
        {
          version: 1,
          guildId,
          channelId: "100000000000000010",
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "retryable",
      httpStatus: 429,
      retryAfterMs: 500,
    });
  });

  it("creates one silent token-free lifecycle alert with diagnostic JSON", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST");
      expect(request.url).toBe(
        "https://discord.com/api/v10/channels/100000000000000098/messages",
      );
      const { payloadJson, file } = await parseMultipartRequest(request);
      const payload = parseComponentsV2RequestBody(payloadJson);
      expect(payload).toMatchObject({
        flags: (1 << 12) | (1 << 15),
        allowed_mentions: { parse: [] },
        nonce: "l1400000000000000001",
        enforce_nonce: true,
      });
      expect(componentUrls(payload.components)).toContain(
        "attachment://roll-lifecycle-1400000000000000001.json",
      );
      expect(componentText(payload.components)).toContain(
        "\\*\\*\\<@140000000000000099\\>\\*\\*",
      );
      expect(file.name).toBe("roll-lifecycle-1400000000000000001.json");
      const diagnostic = await file.text();
      expect(diagnostic).toContain('"notation": "1d20"');
      expect(diagnostic).not.toMatch(/token|image_bytes|png/i);
      return Response.json({ id: "100000000000000088" });
    });

    const alert = lifecycleAlert();
    await expect(
      createRollLifecycleAlertV1(env, {
        ...alert,
        context: {
          ...alert.context,
          username: "**<@140000000000000099>**",
        },
      }, discordFetch),
    ).resolves.toEqual({
      status: "delivered",
      messageId: "100000000000000088",
      httpStatus: 200,
    });
  });

  it("uses stable destination identifiers when lifecycle names are unavailable", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      const { payloadJson } = await parseMultipartRequest(request);
      const payload = parseComponentsV2RequestBody(payloadJson);
      const text = componentText(payload.components);
      expect(text).toContain(`Guild ${guildId}`);
      expect(text).toContain("<#100000000000000010>");
      expect(text).not.toContain("Unknown");
      return Response.json({ id: "100000000000000088" });
    });
    const alert = lifecycleAlert();
    await expect(
      createRollLifecycleAlertV1(
        env,
        {
          ...alert,
          context: {
            ...alert.context,
            guildName: null,
            channelName: null,
            channelType: null,
          },
        },
        discordFetch,
      ),
    ).resolves.toMatchObject({ status: "delivered" });
  });

  it("creates a V2 alert with safe timing and destination diagnostics", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      const { payloadJson, file } = await parseMultipartRequest(request);
      const payload = parseComponentsV2RequestBody(payloadJson);
      const text = componentText(payload.components);
      expect(text).toContain("Created → handler 5 ms");
      if (request.method === "POST") {
        expect(text).toContain("Discord 10015");
        expect(text).toContain("original message missing");
      } else {
        expect(text).toContain("No Discord error code");
        expect(payload).toMatchObject({ content: null, embeds: [] });
      }
      expect(await file.text()).not.toMatch(/fixture\.interaction\.token|authorization/i);
      return Response.json({ id: "100000000000000088" });
    });

    await expect(
      createRollLifecycleAlertV2(env, lifecycleAlertV2(), discordFetch),
    ).resolves.toMatchObject({ status: "delivered" });
    await expect(
      updateRollLifecycleAlertV2(
        env,
        lifecycleAlertV2("100000000000000088"),
        discordFetch,
      ),
    ).resolves.toMatchObject({ status: "delivered" });
  });

  it.each([
    [200, null, "exists"],
    [403, null, "inaccessible"],
    [404, 10_008, "missing"],
    [404, 10_003, "inaccessible"],
    [429, null, "probe-failed"],
  ] as const)(
    "classifies a read-only message probe (%s)",
    async (status, code, outcome) => {
      const discordFetch = vi.fn((request: Request) => {
        expect(request.method).toBe("GET");
        expect(request.url).toBe(
          "https://discord.com/api/v10/channels/100000000000000010/messages/100000000000000087",
        );
        return Promise.resolve(
          code === null
            ? new Response(null, { status })
            : Response.json({ code }, { status }),
        );
      });
      await expect(inspectDiscordMessageExistence(
        env,
        {
          channelId: "100000000000000010",
          messageId: "100000000000000087",
        },
        discordFetch,
      )).resolves.toEqual({ outcome });
    },
  );

  it("bounds a malformed message-probe response", async () => {
    const discordFetch = vi.fn(() => Promise.resolve(
      new Response(JSON.stringify({ code: 10_008, padding: "x".repeat(9_000) }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    ));
    await expect(inspectDiscordMessageExistence(
      env,
      {
        channelId: "100000000000000010",
        messageId: "100000000000000087",
      },
      discordFetch,
    )).resolves.toEqual({ outcome: "probe-failed" });
  });

  it("edits the original lifecycle alert when delivery recovers", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("PATCH");
      expect(request.url).toBe(
        "https://discord.com/api/v10/channels/100000000000000098/messages/100000000000000088",
      );
      const { payloadJson } = await parseMultipartRequest(request);
      const payload = parseComponentsV2RequestBody(payloadJson);
      expect(payload.nonce).toBeUndefined();
      expect(componentText(payload.components)).toContain("Recovered");
      return Response.json({ id: "100000000000000088" });
    });

    await expect(
      updateRollLifecycleAlertV1(
        env,
        lifecycleAlert("100000000000000088"),
        discordFetch,
      ),
    ).resolves.toMatchObject({
      status: "delivered",
      messageId: "100000000000000088",
    });
  });

  it("does not expose a public HTTP API", async () => {
    const response = await exports.default.fetch(
      new Request("https://discord-rest.test/"),
    );

    expect(response.status).toBe(404);
    expect(await parseJsonRequest(response, JsonErrorResponseSchema)).toEqual({
      error: "Not found",
    });
  });

  it("delivers one complete multipart roll log with honest shard provenance", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(
        `/api/v10/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`,
      );
      const { payloadJson, file } = await parseMultipartRequest(request);
      const payload = parseComponentsV2RequestBody(payloadJson);
      expect(payload).toMatchObject({
        nonce: "log:1400000000000000001",
        enforce_nonce: true,
        allowed_mentions: { parse: [] },
        attachments: [
          {
            id: 0,
            filename: "dice-1400000000000000001.png",
            description: "Rendered dice result",
          },
        ],
        flags: 1 << 15,
      });
      expect(payload.components).toHaveLength(1);
      const text = componentText(payload.components);
      expect(text).toContain("## receivedCommand: /roll");
      expect(componentUrls(payload.components)).toContain(
        "attachment://dice-1400000000000000001.png",
      );
      expect(payload).not.toHaveProperty("content");
      expect(text).not.toContain("[HTTP]");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(logPng);
      return Response.json({ id: "100000000000000088" });
    });

    await expect(
      deliverRollLogV1(
        env,
        {
          artifact: rollLogArtifact(),
          logicalShard: {
            status: "available",
            shardId: 2,
            shardCount: 4,
            generation: 16,
          },
        },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered", httpStatus: 200 });
  });

  it("keeps one log embed when a web result has an optional title", async () => {
    const artifact: RollLogArtifactV1 = { ...rollLogArtifact(), source: "web" };
    const resultEmbed = artifact.payload.embeds?.[0];
    if (resultEmbed === undefined) throw new Error("Result embed fixture is missing");
    const discordFetch = vi.fn(async (request: Request) => {
      const { payloadJson } = await parseMultipartRequest(request);
      const payload = parseComponentsV2RequestBody(payloadJson);
      expect(payload.flags).toBe(1 << 15);
      expect(payload.components).toHaveLength(1);
      const text = componentText(payload.components);
      expect(text).toContain("## receivedCommand: /roll");
      expect(text).toContain(
        "user: **roller** [Web]\nchannel: **dice\\-rolls**\nguild: **Fixture Guild** [Shard 1]\n\n**Enchanted sword**\n1d20: [20] = 20",
      );
      expect(text).toContain(
        "-# from personal library · Initiative · from server library · Decoy",
      );
      return Response.json({ id: "100000000000000088" });
    });

    await expect(
      deliverRollLogV1(
        env,
        {
          artifact: {
            ...artifact,
            payload: {
              ...artifact.payload,
              embeds: [
                {
                  ...resultEmbed,
                  title: "Enchanted sword",
                  footer: {
                    text:
                      "sent to roller via web · from personal library · Initiative · from server library · Decoy",
                  },
                },
              ],
            },
          },
          logicalShard: {
            status: "available",
            shardId: 0,
            shardCount: 1,
            generation: 16,
          },
        },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered", httpStatus: 200 });
  });

  it("delivers a durable invalid-roll log without an attachment", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      expect(request.headers.get("content-type")).toBe("application/json");
      const payload = await parseComponentsV2Request(request);
      expect(payload.attachments).toBeUndefined();
      expect(payload.flags).toBe(1 << 15);
      expect(payload.components).toHaveLength(1);
      const container = payload.components[0];
      if (container?.type !== 17) {
        throw new Error("Invalid-roll log container is missing");
      }
      expect(container).toMatchObject({
        type: 17,
        accent_color: 0xff_00_00,
      });
      const textDisplays = container.components.filter(
        (component) => component.type === 10,
      );
      const description = textDisplays.find(
        (component) => component.content !== "## invalidRoll: /roll",
      )?.content;
      expect(description).toHaveLength(4_000);
      expect(description).toMatch(/^user: \*\*roller\*\* \[Discord\]\nchannel:/);
      expect(description).toContain("\nroll: ");
      expect(description).toContain("\n\n🚫🎲 Invalid dice notation!");
      return Response.json({ id: "100000000000000088" });
    });
    const artifact = rollLogArtifact();

    await expect(
      deliverRollLogV1(
        env,
        {
          artifact: {
            ...artifact,
            notation: "x".repeat(6_000),
            payload: { content: "🚫🎲 Invalid dice notation!" },
            image: { status: "unavailable", reason: "not-applicable" },
          },
          logicalShard: {
            status: "available",
            shardId: 0,
            shardCount: 1,
            generation: 16,
          },
        },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered", httpStatus: 200 });
    expect(discordFetch).toHaveBeenCalledOnce();
  });

  it("resolves missing HTTP interaction names before logging", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname.endsWith("/channels/100000000000000010")) {
        return Response.json({
          id: "100000000000000010",
          guild_id: guildId,
          name: "live-rolls",
          type: 0,
        });
      }
      if (pathname.endsWith(`/guilds/${guildId}`)) {
        return Response.json({ id: guildId, name: "Live Guild" });
      }
      const { payloadJson } = await parseMultipartRequest(request);
      const payload = parseComponentsV2RequestBody(payloadJson);
      expect(payload.components).toHaveLength(1);
      expect(componentText(payload.components)).toContain(
        "channel: **live\\-rolls**\nguild: **Live Guild** [Shard 1]",
      );
      return Response.json({ id: "100000000000000088" });
    });
    const artifact = rollLogArtifact();

    await expect(
      deliverRollLogV1(
        env,
        {
          artifact: { ...artifact, context: null },
          logicalShard: {
            status: "available",
            shardId: 0,
            shardCount: 1,
            generation: 16,
          },
        },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered", httpStatus: 200 });
    expect(discordFetch).toHaveBeenCalledTimes(3);
  });

  it("resolves only the missing part of signed roll-log context", async () => {
    const artifact = rollLogArtifact();
    const discordFetch = vi.fn(async (request: Request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname.endsWith(`/guilds/${guildId}`)) {
        return Response.json({ id: guildId, name: "Resolved Guild" });
      }
      expect(pathname).toBe(
        `/api/v10/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`,
      );
      const { payloadJson } = await parseMultipartRequest(request);
      const payload = parseComponentsV2RequestBody(payloadJson);
      expect(componentText(payload.components)).toContain(
        "channel: **signed\\-rolls**\nguild: **Resolved Guild**",
      );
      return Response.json({ id: "100000000000000088" });
    });

    await expect(
      deliverRollLogV1(
        env,
        {
          artifact: {
            ...artifact,
            context: {
              kind: "guild",
              guildId,
              guildName: null,
              channelId: artifact.channelId,
              channelName: "signed-rolls",
              channelType: 0,
            },
          },
          logicalShard: {
            status: "available",
            shardId: 0,
            shardCount: 1,
            generation: 16,
          },
        },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered", httpStatus: 200 });
    expect(discordFetch).toHaveBeenCalledTimes(2);
    expect(discordFetch.mock.calls.map(([request]) => request.url)).not.toContain(
      `https://discord.com/api/v10/channels/${artifact.channelId}`,
    );
  });

  it("emits complete roll-log telemetry without credentials or PNG bytes", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const artifact = rollLogArtifact();
    const discordFetch = vi.fn((request: Request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname.endsWith(`/channels/${artifact.channelId}`)) {
        return Promise.resolve(
          Response.json({ message: "forbidden" }, { status: 403 }),
        );
      }
      if (pathname.endsWith(`/guilds/${artifact.guildId}`)) {
        return Promise.resolve(
          Response.json({ id: guildId, name: "Fixture Guild" }),
        );
      }
      return Promise.resolve(
        Response.json({ id: "100000000000000088" }),
      );
    });

    try {
      await expect(
        deliverRollLogV1(
          env,
          {
            artifact: { ...artifact, context: null },
            logicalShard: { status: "unavailable" },
          },
          discordFetch,
        ),
      ).resolves.toEqual({ status: "delivered", httpStatus: 200 });

      const inaccessibleText = z.string().parse(consoleWarn.mock.calls[0]?.[0]);
      const inaccessible = InaccessibleRollLogTelemetrySchema.parse(
        JSON.parse(inaccessibleText),
      );
      expect(inaccessible).toMatchObject({
        telemetryVersion: 2,
        subsystem: "private-roll-log",
        rollId: artifact.rollId,
        source: "discord",
        notation: "1d20",
        userId,
        username: "roller",
        guildId,
        channelId: "100000000000000010",
        guildName: "Fixture Guild",
        channelName: null,
        context: {
          kind: "guild-partial",
          guildId,
          guildName: "Fixture Guild",
          channelId: "100000000000000010",
          channelName: null,
          channelType: null,
        },
        userImpact: "none",
        channelHttpStatus: 403,
        guildHttpStatus: 200,
      });
      expect(inaccessible.destinationPayload).toEqual(artifact.payload);
      const deliveredText = z.string().parse(consoleInfo.mock.calls[0]?.[0]);
      const delivered = DeliveredRollLogTelemetrySchema.parse(
        JSON.parse(deliveredText),
      );
      expect(delivered).toMatchObject({
        telemetryVersion: 2,
        subsystem: "private-roll-log",
        rollId: artifact.rollId,
        source: "discord",
        notation: "1d20",
        userId,
        username: "roller",
        guildId,
        channelId: "100000000000000010",
        guildName: "Fixture Guild",
        channelName: null,
        context: {
          kind: "guild-partial",
          guildId,
          guildName: "Fixture Guild",
          channelId: "100000000000000010",
          channelName: null,
          channelType: null,
        },
        title: null,
        destinationDeliveredAt: 1_750_000_000_000,
        logicalShard: { status: "unavailable" },
        imageStatus: "available",
        imageFilename: "dice-1400000000000000001.png",
        logMessageId: "100000000000000088",
        userImpact: "none",
        httpStatus: 200,
      });
      expect(delivered.destinationPayload).toEqual(artifact.payload);
      expect(JSON.stringify([inaccessible, delivered])).not.toMatch(
        /fixture\.bot\.token|fixture-topgg-token|fixture-discord-bot-list-token|image_bytes/i,
      );
      expect(delivered).not.toHaveProperty("imageBytes");
    } finally {
      consoleWarn.mockRestore();
      consoleInfo.mockRestore();
    }
  });

  it("renders unknown log destinations as plain text", () => {
    expect(
      rollLogContextDescription(
        { ...rollLogArtifact(), context: null },
        {
          status: "available",
          shardId: 0,
          shardCount: 1,
          generation: 16,
        },
        { channelName: null, guildName: null },
      ),
    ).toBe(
      "user: **roller** [Discord]\nunknown channel\nunknown guild [Shard 1]",
    );
  });

  it.each([403, 404])(
    "delivers a durable roll log when Discord context returns %i",
    async (contextStatus) => {
      const discordFetch = vi.fn(async (request: Request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname.endsWith("/channels/100000000000000010")) {
          return Response.json(
            { message: "unavailable" },
            { status: contextStatus },
          );
        }
        if (pathname.endsWith(`/guilds/${guildId}`)) {
          return Response.json({ id: guildId, name: "Fixture Guild" });
        }
        const { payloadJson } = await parseMultipartRequest(request);
        const payload = parseComponentsV2RequestBody(payloadJson);
        expect(componentText(payload.components)).toContain(
          "unknown channel\nguild: **Fixture Guild** [Shard 1]",
        );
        return Response.json({ id: "100000000000000088" });
      });
      const artifact = rollLogArtifact();

      await expect(
        deliverRollLogV1(
          env,
          {
            artifact: { ...artifact, context: null },
            logicalShard: {
              status: "available",
              shardId: 0,
              shardCount: 1,
              generation: 16,
            },
          },
          discordFetch,
        ),
      ).resolves.toEqual({ status: "delivered", httpStatus: 200 });
      expect(discordFetch).toHaveBeenCalledTimes(3);
    },
  );

  it("retries a durable roll log when missing context is rate limited", async () => {
    const discordFetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json(
          { message: "rate limited" },
          { status: 429, headers: { "retry-after": "2.5" } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ id: guildId, name: "Fixture Guild" }),
      );
    const artifact = rollLogArtifact();

    await expect(
      deliverRollLogV1(
        env,
        {
          artifact: { ...artifact, context: null },
          logicalShard: { status: "unavailable" },
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "retryable",
      httpStatus: 429,
      retryAfterMs: 2_500,
    });
    expect(discordFetch).toHaveBeenCalledTimes(2);
  });

  it("classifies an explicit image rejection for text fallback", async () => {
    await expect(
      deliverRollLogV1(
        env,
        {
          artifact: rollLogArtifact(),
          logicalShard: { status: "unavailable" },
        },
        () => Promise.resolve(Response.json({ code: 50_045 }, { status: 400 })),
      ),
    ).resolves.toEqual({ status: "image-rejected", httpStatus: 400 });
  });

  it("registers the canonical global command schema", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("PUT");
      expect(new URL(request.url).pathname).toBe(
        `/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`,
      );
      const commands = await parseJsonRequest(request, z.json());
      expect(commands).toEqual(DISCORD_GLOBAL_COMMANDS);
      return Response.json(
        DISCORD_GLOBAL_COMMANDS.map((command, index) => ({
          ...command,
          id: (100000000000000010n + BigInt(index)).toString(),
        })),
      );
    });

    await expect(registerGlobalCommands(env, discordFetch)).resolves.toEqual({
      status: "registered",
      commandNames: [
        "knowledgebase",
        "library",
        "prefs",
        "roll",
        "status",
        "web",
      ],
    });
  });

  it("registers the canonical schema for the development guild", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(
        `/api/v10/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_TEST_GUILD_ID}/commands`,
      );
      expect(await parseJsonRequest(request, z.json())).toEqual(
        DISCORD_GLOBAL_COMMANDS,
      );
      return Response.json(
        DISCORD_GLOBAL_COMMANDS.map((command, index) => ({
          ...command,
          id: (100000000000000010n + BigInt(index)).toString(),
        })),
      );
    });

    await expect(
      registerDevelopmentGuildCommands(env, discordFetch),
    ).resolves.toEqual({
      status: "registered",
      commandNames: [
        "knowledgebase",
        "library",
        "prefs",
        "roll",
        "status",
        "web",
      ],
    });
  });

  it("sums live Discord guild and member counts", async () => {
    const discordFetch = vi.fn((request: Request) => {
      const url = new URL(request.url);
      expect(url.pathname).toBe("/api/v10/users/@me/guilds");
      expect(url.searchParams.get("limit")).toBe("200");
      expect(url.searchParams.get("with_counts")).toBe("true");
      return Promise.resolve(
        Response.json(
          url.searchParams.has("after")
            ? []
            : [
                { id: guildId, approximate_member_count: 42 },
                { id: "100000000000000002", approximate_member_count: 8 },
              ],
        ),
      );
    });

    await expect(fetchPublicStats(env, 2, discordFetch)).resolves.toEqual({
      liveGuilds: 2,
      estimatedGuildMemberships: 50,
      shardCount: 2,
      guildCountsByShard: [2, 0],
    });
  });

  it("continues after Discord returns a short non-empty bot guild page", async () => {
    const firstPage = Array.from({ length: 199 }, (_, index) => ({
      id: (100000000000000001n + BigInt(index)).toString(),
      approximate_member_count: 1,
    }));
    const finalGuild = {
      id: "100000000000000500",
      approximate_member_count: 1,
    };
    const discordFetch = vi.fn((request: Request) => {
      const after = new URL(request.url).searchParams.get("after");
      if (after === null) return Promise.resolve(Response.json(firstPage));
      if (after === firstPage.at(-1)?.id) {
        return Promise.resolve(Response.json([finalGuild]));
      }
      expect(after).toBe(finalGuild.id);
      return Promise.resolve(Response.json([]));
    });

    await expect(fetchPublicStats(env, 1, discordFetch)).resolves.toEqual({
      liveGuilds: 200,
      estimatedGuildMemberships: 200,
      shardCount: 1,
      guildCountsByShard: [200],
    });
    expect(discordFetch).toHaveBeenCalledTimes(3);
  });

  it("rejects a non-advancing public-stats cursor", async () => {
    const discordFetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json([
          { id: "100000000000000500", approximate_member_count: 1 },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json([
          { id: "100000000000000400", approximate_member_count: 1 },
        ]),
      );

    await expect(fetchPublicStats(env, 1, discordFetch)).rejects.toThrow(
      "Discord guild stats response is invalid",
    );
  });

  it("rejects a shard count above Discord's coordinated maximum", async () => {
    const discordFetch = vi.fn<RequestFetch>();

    await expect(fetchPublicStats(env, 1_001, discordFetch)).rejects.toThrow(
      "Discord guild stats shard count is invalid",
    );
    expect(discordFetch).not.toHaveBeenCalled();
  });

  it("honors Discord retry_after while collecting public stats", async () => {
    const discordFetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json({ retry_after: 0.01 }, { status: 429 }),
      )
      .mockResolvedValueOnce(
        Response.json([{ id: guildId, approximate_member_count: 42 }]),
      )
      .mockResolvedValueOnce(Response.json([]));
    const wait = vi.fn(() => Promise.resolve());

    await expect(fetchPublicStats(env, 2, discordFetch, wait)).resolves.toEqual({
      liveGuilds: 1,
      estimatedGuildMemberships: 42,
      shardCount: 2,
      guildCountsByShard: [1, 0],
    });
    expect(wait).toHaveBeenCalledWith(10);
  });

  it("captures an audience snapshot without calling bot-list APIs", async () => {
    const discordFetch = vi.fn<(request: Request) => Promise<Response>>(
      (request) =>
        Promise.resolve(
          Response.json(
            new URL(request.url).searchParams.has("after")
              ? []
              : [{ id: guildId, approximate_member_count: 42 }],
          ),
        ),
    );

    await expect(
      captureAudienceSnapshot(env, 2, discordFetch, audienceCapturedAt),
    ).resolves.toEqual({
      version: 1,
      capturedAt: audienceCapturedAt,
      liveGuilds: 1,
      estimatedGuildMemberships: 42,
      shardCount: 2,
      guildCountsByShard: [1, 0],
    });
    expect(discordFetch).toHaveBeenCalledTimes(2);
    expect(new URL(discordFetch.mock.calls[0]?.[0].url ?? "").hostname).toBe(
      "discord.com",
    );
  });

  it("reports the live guild total to both legacy bot listings", async () => {
    const requests: Request[] = [];
    const externalFetch = vi.fn((request: Request) => {
      requests.push(request.clone());
      const url = new URL(request.url);
      return Promise.resolve(
        url.hostname === "discord.com"
          ? Response.json(
              url.searchParams.has("after")
                ? []
                : [
                    { id: guildId, approximate_member_count: 42 },
                    {
                      id: "100000000000000002",
                      approximate_member_count: 8,
                    },
                  ],
            )
          : new Response(null, { status: 200 }),
      );
    });

    await expect(
      reportBotListStats(env, 2, externalFetch, audienceCapturedAt),
    ).resolves.toEqual({
      status: "reported",
      version: 1,
      capturedAt: audienceCapturedAt,
      liveGuilds: 2,
      estimatedGuildMemberships: 50,
      shardCount: 2,
      guildCountsByShard: [2, 0],
      topggHttpStatus: 200,
      discordBotListHttpStatus: 200,
    });
    const topgg = requests.find(({ url }) => new URL(url).hostname === "top.gg");
    const discordBotList = requests.find(
      ({ url }) => new URL(url).hostname === "discordbotlist.com",
    );
    if (topgg === undefined || discordBotList === undefined) {
      throw new Error("Bot-list requests are missing");
    }
    expect(new URL(topgg.url).pathname).toBe(
      `/api/bots/${env.DISCORD_APPLICATION_ID}/stats`,
    );
    expect(topgg.headers.get("authorization")).toBe(env.TOPGG_KEY);
    expect(await parseJsonRequest(topgg, BotListStatsSchema)).toEqual({
      server_count: 2,
    });
    expect(new URL(discordBotList.url).pathname).toBe(
      `/api/v1/bots/${env.DISCORD_APPLICATION_ID}/stats`,
    );
    expect(discordBotList.headers.get("authorization")).toBe(
      env.DISCORD_BOT_LIST_KEY,
    );
    expect(await parseJsonRequest(discordBotList, BotListStatsSchema)).toEqual({
      guilds: 2,
    });
  });

  it("preserves the legacy no-guild skip without calling bot listings", async () => {
    const externalFetch = vi.fn(() => Promise.resolve(Response.json([])));

    await expect(
      reportBotListStats(env, 2, externalFetch, audienceCapturedAt),
    ).resolves.toEqual({
      status: "skipped",
      version: 1,
      capturedAt: audienceCapturedAt,
      liveGuilds: 0,
      estimatedGuildMemberships: 0,
      shardCount: 2,
      guildCountsByShard: [0, 0],
      topggHttpStatus: null,
      discordBotListHttpStatus: null,
    });
    expect(externalFetch).toHaveBeenCalledOnce();
  });

  it("attempts both bot listings and returns sanitized failure statuses", async () => {
    const externalFetch = vi.fn((request: Request) => {
      const url = new URL(request.url);
      if (url.hostname === "discord.com") {
        return Promise.resolve(
          Response.json(
            url.searchParams.has("after")
              ? []
              : [{ id: guildId, approximate_member_count: 42 }],
          ),
        );
      }
      if (url.hostname === "top.gg") {
        return Promise.resolve(new Response(null, { status: 429 }));
      }
      return Promise.reject(new Error("fixture network failure with secret"));
    });

    await expect(
      reportBotListStats(env, 2, externalFetch, audienceCapturedAt),
    ).resolves.toEqual({
      status: "failed",
      version: 1,
      capturedAt: audienceCapturedAt,
      liveGuilds: 1,
      estimatedGuildMemberships: 42,
      shardCount: 2,
      guildCountsByShard: [1, 0],
      topggHttpStatus: 429,
      discordBotListHttpStatus: null,
    });
    expect(externalFetch).toHaveBeenCalledTimes(4);
  });

  it("requires explicit bot-list credentials before any request", async () => {
    const externalFetch = vi.fn<RequestFetch>();

    await expect(
      reportBotListStats(
        { ...env, TOPGG_KEY: "" },
        2,
        externalFetch,
        audienceCapturedAt,
      ),
    ).rejects.toThrow("Bot list reporting configuration is invalid");
    expect(externalFetch).not.toHaveBeenCalled();
  });

  it("honors Discord retry_after when a guild page is rate limited", async () => {
    const discordFetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json({ retry_after: 0.01 }, { status: 429 }),
      )
      .mockResolvedValueOnce(Response.json([{ id: guildId }]));
    const sleep = vi.fn(() => Promise.resolve());

    await expect(
      listCurrentGuildIdsPage(env, null, discordFetch, sleep),
    ).resolves.toEqual({ guildIds: [guildId], nextAfter: guildId });
    expect(sleep).toHaveBeenCalledWith(10);
    expect(discordFetch).toHaveBeenCalledTimes(2);
  });

  it("returns a cursor for every non-empty service-binding page", async () => {
    const guilds = [{ id: guildId }];
    const discordFetch = vi.fn(() => Promise.resolve(Response.json(guilds)));

    await expect(
      listCurrentGuildIdsPage(env, null, discordFetch),
    ).resolves.toEqual({ guildIds: [guildId], nextAfter: guildId });
    expect(discordFetch).toHaveBeenCalledOnce();
  });

  it("rejects a non-advancing service-binding cursor", async () => {
    const discordFetch = vi.fn(() =>
      Promise.resolve(Response.json([{ id: "100000000000000400" }])),
    );

    await expect(
      listCurrentGuildIdsPage(
        env,
        "100000000000000500",
        discordFetch,
      ),
    ).rejects.toThrow("Discord guild list response is invalid");
  });

  it("lists the complete current guild set with validated pagination", async () => {
    const firstPage = Array.from({ length: 200 }, (_, index) => ({
      id: (100000000000000001n + BigInt(index)).toString(),
    }));
    const finalGuildId = "100000000000000500";
    const discordFetch = vi.fn((request: Request) => {
      const url = new URL(request.url);
      expect(url.pathname).toBe("/api/v10/users/@me/guilds");
      expect(url.searchParams.get("limit")).toBe("200");
      const after = url.searchParams.get("after");
      if (after === null) return Promise.resolve(Response.json(firstPage));
      if (after === firstPage.at(-1)?.id) {
        return Promise.resolve(Response.json([{ id: finalGuildId }]));
      }
      expect(after).toBe(finalGuildId);
      return Promise.resolve(Response.json([]));
    });

    await expect(listCurrentGuildIds(env, discordFetch)).resolves.toEqual([
      ...firstPage.map(({ id }) => id),
      finalGuildId,
    ]);
    expect(discordFetch).toHaveBeenCalledTimes(3);
  });

  it("returns only text and announcement channels", async () => {
    const discordFetch = vi.fn(() =>
      Promise.resolve(
        Response.json([
          { id: "100000000000000010", name: "general", type: 0 },
          { id: "100000000000000011", name: "news", type: 5 },
          { id: "100000000000000012", name: "voice", type: 2 },
        ]),
      ),
    );

    await expect(listTextChannels(env, guildId, discordFetch)).resolves.toEqual([
      { id: "100000000000000010", name: "general", type: 0 },
      { id: "100000000000000011", name: "news", type: 5 },
    ]);
  });

  it("lists only text channels where the member can use Dice Witch and both can post", async () => {
    const memberRoleId = "100000000000000006";
    const botId = "100000000000000007";
    const botRoleId = "100000000000000008";
    const useApplicationCommands = String(1n << 31n);
    const discordFetch = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith(`/members/${userId}`)) {
        return Promise.resolve(Response.json({
          roles: [memberRoleId],
          communication_disabled_until: null,
        }));
      }
      if (path.endsWith(`/members/${botId}`)) {
        return Promise.resolve(Response.json({
          roles: [botRoleId],
          communication_disabled_until: null,
        }));
      }
      if (path.endsWith("/roles")) {
        return Promise.resolve(Response.json([
          { id: guildId, name: "@everyone", permissions: "3072" },
          {
            id: memberRoleId,
            name: "Players",
            permissions: useApplicationCommands,
          },
          { id: botRoleId, name: "Dice Witch", permissions: "0" },
        ]));
      }
      if (path === `/api/v10/guilds/${guildId}`) {
        return Promise.resolve(Response.json({ owner_id: "100000000000000099" }));
      }
      if (path.endsWith("/channels")) {
        return Promise.resolve(Response.json([
          {
            id: "100000000000000010",
            name: "general",
            type: 0,
            permission_overwrites: [],
          },
          {
            id: "100000000000000011",
            name: "staff",
            type: 0,
            permission_overwrites: [
              { id: guildId, type: 0, allow: "0", deny: "1024" },
            ],
          },
          {
            id: "100000000000000012",
            name: "players",
            type: 0,
            permission_overwrites: [
              { id: guildId, type: 0, allow: "0", deny: "1024" },
              { id: memberRoleId, type: 0, allow: "1024", deny: "0" },
              { id: botRoleId, type: 0, allow: "1024", deny: "0" },
            ],
          },
          {
            id: "100000000000000013",
            name: "read-only",
            type: 5,
            permission_overwrites: [
              { id: userId, type: 1, allow: "0", deny: "2048" },
            ],
          },
          {
            id: "100000000000000014",
            name: "bot-blocked",
            type: 0,
            permission_overwrites: [
              { id: botId, type: 1, allow: "0", deny: "2048" },
            ],
          },
          {
            id: "100000000000000015",
            name: "commands-blocked",
            type: 0,
            permission_overwrites: [
              {
                id: userId,
                type: 1,
                allow: "0",
                deny: useApplicationCommands,
              },
            ],
          },
        ]));
      }
      throw new Error(`Unexpected Discord route ${path}`);
    });

    const memberEnv = { ...env, DISCORD_APPLICATION_ID: botId };
    await expect(
      listMemberTextChannels(memberEnv, guildId, userId, discordFetch),
    ).resolves.toEqual([
      { id: "100000000000000010", name: "general", type: 0 },
      { id: "100000000000000012", name: "players", type: 0 },
    ]);
    await expect(
      inspectRollerGuild(memberEnv, guildId, userId, discordFetch),
    ).resolves.toEqual({
      status: "found",
      isAdmin: false,
      isDiceWitchAdmin: false,
      hasUsableChannel: true,
    });
  });

  it("creates and edits a standalone channel roll message", async () => {
    const channelId = "100000000000000010";
    const rollId = "1400000000000000001";
    const messageId = "100000000000000020";
    let attempt = 0;
    const discordFetch = vi.fn(async (request: Request) => {
      attempt += 1;
      expect(request.headers.get("authorization")).toBe(
        `Bot ${env.DISCORD_BOT_TOKEN}`,
      );
      const path = new URL(request.url).pathname;
      if (attempt === 1) {
        expect(request.method).toBe("POST");
        expect(path).toBe(`/api/v10/channels/${channelId}/messages`);
        const payload = await parseComponentsV2Request(request);
        expect(payload).toEqual({
          flags: 1 << 15,
          components: [{ type: 10, content: "_clatter_" }],
          allowed_mentions: { parse: [] },
          nonce: `c${rollId}`,
          enforce_nonce: true,
        });
      } else {
        expect(request.method).toBe("PATCH");
        expect(path).toBe(
          `/api/v10/channels/${channelId}/messages/${messageId}`,
        );
        const { payloadJson, file } = await parseMultipartRequest(request);
        const payload = parseComponentsV2RequestBody(payloadJson);
        expect(payload).toEqual({
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
          allowed_mentions: { parse: [] },
          content: null,
          embeds: [],
          attachments: [
            {
              id: 0,
              filename: "dice.png",
              description: "Rendered dice result",
            },
          ],
        });
        expect(file.name).toBe("dice.png");
      }
      return Response.json({ id: messageId });
    });

    await expect(
      deliverChannelRollMessageV1(
        env,
        {
          version: 1,
          operation: "create-clatter",
          rollId,
          channelId,
          payload: {
            flags: 1 << 15,
            components: [{ type: 10, content: "_clatter_" }],
          },
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "delivered",
      messageId,
      httpStatus: 200,
    });
    await expect(
      deliverChannelRollMessageV1(
        env,
        {
          version: 1,
          operation: "edit-result",
          channelId,
          messageId,
          payload: {
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
          filename: "dice.png",
          png: new Uint8Array([137, 80, 78, 71]),
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "delivered",
      messageId,
      httpStatus: 200,
    });
    expect(attempt).toBe(2);
  });

  it("creates a standalone result directly when dice delay is disabled", async () => {
    const channelId = "100000000000000010";
    const rollId = "1400000000000000001";
    const discordFetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST");
      expect(new URL(request.url).pathname).toBe(
        `/api/v10/channels/${channelId}/messages`,
      );
      const { payloadJson } = await parseMultipartRequest(request);
      const payload = parseComponentsV2RequestBody(payloadJson);
      expect(payload).toMatchObject({
        flags: 1 << 15,
        nonce: rollId,
        enforce_nonce: true,
        allowed_mentions: { parse: [] },
      });
      expect(payload).not.toHaveProperty("message_reference");
      return Response.json({ id: "100000000000000020" });
    });

    await expect(
      deliverChannelRollMessageV1(
        env,
        {
          version: 1,
          operation: "create-result",
          rollId,
          channelId,
          payload: {
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
          filename: "dice.png",
          png: new Uint8Array([137, 80, 78, 71]),
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "delivered",
      messageId: "100000000000000020",
      httpStatus: 200,
    });
  });

  it("classifies standalone channel delivery failures", async () => {
    const input = {
      version: 1 as const,
      operation: "create-clatter" as const,
      rollId: "1400000000000000001",
      channelId: "100000000000000010",
      payload: {
        flags: 1 << 15,
        components: [{ type: 10 as const, content: "_clatter_" }],
      },
    };

    await expect(
      deliverChannelRollMessageV1(env, {
        ...input,
        payload: { ...input.payload, flags: (1 << 15) | (1 << 6) },
      }),
    ).rejects.toThrow("Channel roll message delivery request is invalid");
    await expect(
      deliverChannelRollMessageV1(
        env,
        input,
        vi.fn(() => Promise.reject(new Error("network unavailable"))),
      ),
    ).resolves.toEqual({
      status: "retryable",
      httpStatus: null,
      retryAfterMs: null,
    });
    await expect(
      deliverChannelRollMessageV1(
        env,
        input,
        vi.fn(() =>
          Promise.resolve(
            new Response(null, {
              status: 429,
              headers: { "retry-after": "1.25" },
            }),
          )
        ),
      ),
    ).resolves.toEqual({
      status: "retryable",
      httpStatus: 429,
      retryAfterMs: 1_250,
    });
    await expect(
      deliverChannelRollMessageV1(
        env,
        input,
        vi.fn(() =>
          Promise.resolve(Response.json({ code: 50_013 }, { status: 403 }))
        ),
      ),
    ).resolves.toEqual({
      status: "failed",
      httpStatus: 403,
      discordErrorCode: 50_013,
    });
    await expect(
      deliverChannelRollMessageV1(
        env,
        input,
        vi.fn(() => Promise.resolve(Response.json({ id: "invalid" }))),
      ),
    ).resolves.toEqual({ status: "invalid_response" });
  });

  it("delivers a rendered web roll only to a channel in the guild", async () => {
    const channelId = "100000000000000010";
    const discordFetch = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith("/channels")) {
        return Response.json([{ id: channelId, name: "general", type: 0 }]);
      }
      expect(path).toBe(`/api/v10/channels/${channelId}/messages`);
      const { payloadJson, file } = await parseMultipartRequest(request);
      const payload = LegacyWebRollRequestSchema.parse(JSON.parse(payloadJson));
      expect(payload).toEqual({
        embeds: [],
        nonce: "1400000000000000001",
        enforce_nonce: true,
        allowed_mentions: { parse: [] },
        attachments: [
          {
            id: 0,
            filename: "dice-witch-roll.png",
            description: "Rendered dice result",
          },
        ],
      });
      expect(file.name).toBe("dice-witch-roll.png");
      return Response.json({ id: "100000000000000020" });
    });

    await expect(
      deliverWebRoll(
        env,
        {
          rollId: "1400000000000000001",
          guildId,
          channelId,
          payload: { embeds: [] },
          clatter: "_clatter_",
          filename: "dice-witch-roll.png",
          png: new Uint8Array([137, 80, 78, 71]),
          skipDelay: true,
          delayMs: 0,
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "delivered",
      messageId: "100000000000000020",
    });
  });

  it("rejects a successful web delivery without a message id", async () => {
    const channelId = "100000000000000010";
    const discordFetch = vi.fn((request: Request) =>
      Promise.resolve(
        new URL(request.url).pathname.endsWith("/channels")
          ? Response.json([{ id: channelId, name: "general", type: 0 }])
          : Response.json({ id: "invalid" }),
      )
    );

    await expect(
      deliverWebRoll(
        env,
        {
          rollId: "1400000000000000001",
          guildId,
          channelId,
          payload: { embeds: [] },
          clatter: "_clatter_",
          filename: "dice-witch-roll.png",
          png: new Uint8Array([137, 80, 78, 71]),
          skipDelay: true,
          delayMs: 0,
        },
        discordFetch,
      ),
    ).rejects.toThrow("Discord web roll response is invalid");
  });

  it("edits the public web clatter message into the rendered result", async () => {
    const channelId = "100000000000000010";
    const clatterMessageId = "100000000000000020";
    const wait = vi.fn(() => Promise.resolve());
    let deliveryAttempt = 0;
    const discordFetch = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith("/channels")) {
        return Response.json([{ id: channelId, name: "general", type: 0 }]);
      }
      deliveryAttempt += 1;
      if (deliveryAttempt === 1) {
        expect(request.method).toBe("POST");
        expect(path).toBe(`/api/v10/channels/${channelId}/messages`);
        const payload = await parseComponentsV2Request(request);
        expect(payload).toEqual({
          flags: 1 << 15,
          components: [{ type: 10, content: "_clatter_" }],
          allowed_mentions: { parse: [] },
          nonce: "c1400000000000000001",
          enforce_nonce: true,
        });
        return Response.json({ id: clatterMessageId });
      }
      expect(request.method).toBe("PATCH");
      expect(path).toBe(
        `/api/v10/channels/${channelId}/messages/${clatterMessageId}`,
      );
      const { payloadJson } = await parseMultipartRequest(request);
      const payload = LegacyWebRollRequestSchema.parse(JSON.parse(payloadJson));
      expect(payload).toEqual({
        embeds: [],
        content: null,
        allowed_mentions: { parse: [] },
        attachments: [
          {
            id: 0,
            filename: "dice-witch-roll.png",
            description: "Rendered dice result",
          },
        ],
      });
      return Response.json({ id: clatterMessageId });
    });

    await expect(
      deliverWebRoll(
        env,
        {
          rollId: "1400000000000000001",
          guildId,
          channelId,
          payload: { embeds: [] },
          clatter: "_clatter_",
          filename: "dice-witch-roll.png",
          png: new Uint8Array([137, 80, 78, 71]),
          skipDelay: false,
          delayMs: 1_234,
        },
        discordFetch,
        wait,
      ),
    ).resolves.toEqual({
      status: "delivered",
      messageId: clatterMessageId,
    });
    expect(wait).toHaveBeenCalledWith(1_234);
    expect(deliveryAttempt).toBe(2);
  });

  it("logs the exact V2 guild lifecycle container", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      const payload = await parseComponentsV2Request(request);
      expect(payload).toMatchObject({
        flags: 1 << 15,
        enforce_nonce: true,
        components: [
          {
            type: 17,
            accent_color: 65280,
            components: [
              { type: 10, content: "## guildAdd\nFixture Guild" },
            ],
          },
        ],
        allowed_mentions: { parse: [] },
      });
      return Response.json({ id: "100000000000000021" });
    });

    await expect(
      logGuildLifecycle(
        env,
        {
          mutationId: "gateway:17:0:42:GUILD_CREATE",
          eventType: "guildAdd",
          guildName: "Fixture Guild",
        },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered" });
  });

  it("sends requested knowledge base help by DM with nonce enforcement", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === "/api/v10/users/@me/channels") {
        expect(await parseJsonRequest(request, DmChannelRequestSchema)).toEqual({
          recipient_id: userId,
        });
        return Response.json({ id: "100000000000000010" });
      }
      expect(url.pathname).toBe("/api/v10/channels/100000000000000010/messages");
      const payload = await parseComponentsV2Request(request);
      expect(payload).toMatchObject({
        flags: 1 << 15,
        nonce: "100000000000000020",
        enforce_nonce: true,
        components: [
          expect.objectContaining({ type: 17, accent_color: 0x00_00_ff }),
        ],
      });
      expect(componentText(payload.components)).toContain(
        "https://dicewit.ch/docs/dice-notation",
      );
      expect(payload.components).toHaveLength(1);
      expect(componentCustomIds(payload.components)).toContain(
        "knowledgebase-topic",
      );
      return Response.json({ id: "100000000000000021" });
    });

    await expect(
      sendRollHelper(
        env,
        { rollId: "100000000000000020", userId },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered" });
  });

  it.each([0, 2, 13, 15, 16] as const)(
    "logs signed context without a Discord lookup for channel type %i",
    async (channelType) => {
      const channelId = "100000000000000010";
      const discordFetch = vi.fn(async (request: Request) => {
        expect(new URL(request.url).pathname).toBe(
          `/api/v10/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`,
        );
        const payload = await parseComponentsV2Request(request);
        expect(payload).toEqual({
          flags: 1 << 15,
          nonce: "log:100000000000000020",
          enforce_nonce: true,
          components: [
            {
              type: 17,
              accent_color: 10066329,
              components: [
                {
                  type: 10,
                  content:
                    "## receivedCommand: /roll\n2d20 \\+ 5 from **alice** [Discord] in channel **general** on **Test Guild** [HTTP]",
                },
              ],
            },
          ],
          allowed_mentions: { parse: [] },
        });
        return Response.json({ id: "100000000000000021" });
      });

      await expect(
        logRoll(
          env,
          {
            rollId: "100000000000000020",
            source: "discord",
            notation: "2d20 + 5",
            username: "alice",
            guildId,
            channelId,
            context: {
              kind: "guild",
              guildId,
              guildName: "Test Guild",
              channelId,
              channelName: "general",
              channelType,
            },
          },
          discordFetch,
        ),
      ).resolves.toEqual({ status: "delivered" });
      expect(discordFetch).toHaveBeenCalledOnce();
    },
  );

  it("formats signed thread context safely without a Discord lookup", async () => {
    const channelId = "100000000000000010";
    const discordFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(
        `/api/v10/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`,
      );
      const payload = await parseComponentsV2Request(request);
      expect(componentText(payload.components)).toContain(
        "1d20 from **alice** [Discord] in thread **rules\\_\\*** on **Guild \\[One\\]** [HTTP]",
      );
      return Response.json({ id: "100000000000000021" });
    });

    await expect(
      logRoll(
        env,
        {
          rollId: "100000000000000020",
          source: "discord",
          notation: "1d20",
          username: "alice",
          guildId,
          channelId,
          context: {
            kind: "guild",
            guildId,
            guildName: "Guild [One]",
            channelId,
            channelName: "rules_*",
            channelType: 11,
          },
        },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered" });
    expect(discordFetch).toHaveBeenCalledOnce();
  });

  it("logs signed DM context without a Discord lookup", async () => {
    const channelId = "100000000000000010";
    const discordFetch = vi.fn(async (request: Request) => {
      const payload = await parseComponentsV2Request(request);
      expect(componentText(payload.components)).toContain(
        "1d20 from **alice** [Discord] in **DM** [HTTP]",
      );
      return Response.json({ id: "100000000000000021" });
    });

    await expect(
      logRoll(
        env,
        {
          rollId: "100000000000000020",
          source: "discord",
          notation: "1d20",
          username: "alice",
          guildId: null,
          channelId,
          context: { kind: "dm", channelId },
        },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered" });
    expect(discordFetch).toHaveBeenCalledOnce();
  });

  it("classifies a transient roll-log context lookup for durable retry", async () => {
    const discordFetch = vi.fn(() =>
      Promise.resolve(Response.json({ message: "temporary" }, { status: 503 })),
    );

    await expect(
      logRoll(
        env,
        {
          rollId: "100000000000000020",
          source: "discord",
          notation: "1d20",
          username: "alice",
          guildId,
          channelId: "100000000000000010",
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "retryable",
      stage: "context",
      httpStatus: 503,
    });
  });

  it("prioritizes a transient context failure over inaccessible context", async () => {
    const discordFetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json({ message: "forbidden" }, { status: 403 }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: "rate limited" }, { status: 429 }),
      );

    await expect(
      logRoll(
        env,
        {
          rollId: "100000000000000020",
          source: "discord",
          notation: "1d20",
          username: "alice",
          guildId,
          channelId: "100000000000000010",
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "retryable",
      stage: "context",
      httpStatus: 429,
    });
  });

  it.each([403, 404])(
    "logs a roll with unavailable context after Discord returns %i",
    async (contextStatus) => {
      const discordFetch = vi.fn(async (request: Request) => {
        const url = new URL(request.url);
        if (url.pathname === "/api/v10/channels/100000000000000010") {
          return Response.json(
            { message: "unavailable" },
            { status: contextStatus },
          );
        }
        if (url.pathname === `/api/v10/guilds/${guildId}`) {
          return Response.json({ id: guildId, name: "Test Guild" });
        }
        expect(url.pathname).toBe(
          `/api/v10/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`,
        );
        const payload = await parseComponentsV2Request(request);
        expect(payload).toMatchObject({
          flags: 1 << 15,
          nonce: "log:100000000000000020",
          enforce_nonce: true,
        });
        expect(componentText(payload.components)).toContain(
          "1d20 from **alice** [Discord] in an **inaccessible channel/server** [HTTP]",
        );
        return Response.json({ id: "100000000000000021" });
      });

      await expect(
        logRoll(
          env,
          {
            rollId: "100000000000000020",
            source: "discord",
            notation: "1d20",
            username: "alice",
            guildId,
            channelId: "100000000000000010",
          },
          discordFetch,
        ),
      ).resolves.toEqual({ status: "delivered" });
      expect(discordFetch).toHaveBeenCalledTimes(3);
    },
  );

  it("logs the Discord error code and retries a roll-log delivery 404", async () => {
    const channelId = "100000000000000010";
    const discordFetch = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === `/api/v10/channels/${channelId}`) {
        return Promise.resolve(
          Response.json({
            id: channelId,
            guild_id: guildId,
            name: "general",
            type: 0,
          }),
        );
      }
      if (path === `/api/v10/guilds/${guildId}`) {
        return Promise.resolve(Response.json({ id: guildId, name: "Test Guild" }));
      }
      return Promise.resolve(
        Response.json(
          { code: 10_008, message: "unknown message" },
          {
            status: 404,
            headers: { "x-ratelimit-remaining": "4" },
          },
        ),
      );
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        logRoll(
          env,
          {
            rollId: "100000000000000020",
            source: "discord",
            notation: "1d20",
            username: "alice",
            guildId,
            channelId,
          },
          discordFetch,
        ),
      ).resolves.toEqual({
        status: "retryable",
        stage: "delivery",
        httpStatus: 404,
      });
      expect(consoleError).toHaveBeenCalledWith(
        JSON.stringify({
          level: "error",
          message: "Discord roll log delivery was rejected",
          httpStatus: 404,
          discordCode: 10_008,
          failedRequestCount: null,
          rateLimitRemaining: 4,
          retryAfterSeconds: null,
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("rejects a terminal context failure other than inaccessible context", async () => {
    const discordFetch = vi.fn(() =>
      Promise.resolve(Response.json({ message: "unauthorized" }, { status: 401 })),
    );

    await expect(
      logRoll(
        env,
        {
          rollId: "100000000000000020",
          source: "discord",
          notation: "1d20",
          username: "alice",
          guildId,
          channelId: "100000000000000010",
        },
        discordFetch,
      ),
    ).resolves.toEqual({
      status: "failed",
      stage: "context",
      httpStatus: 401,
    });
    expect(discordFetch).toHaveBeenCalledTimes(2);
  });

  it("finds the exact legacy Dice Witch Admin role", async () => {
    const discordFetch = vi.fn((request: Request) => {
      expect(request.headers.get("authorization")).toBe(
        "Bot fixture.bot.token",
      );
      const path = new URL(request.url).pathname;
      if (path.endsWith(`/members/${userId}`)) {
        return Promise.resolve(Response.json({ roles: [adminRoleId] }));
      }
      if (path.endsWith("/roles")) {
        return Promise.resolve(
          Response.json([
            { id: guildId, name: "@everyone", permissions: "0" },
            {
              id: adminRoleId,
              name: "Dice Witch Admin",
              permissions: "0",
            },
          ]),
        );
      }
      expect(path).toBe(`/api/v10/guilds/${guildId}`);
      return Promise.resolve(
        Response.json({ owner_id: "100000000000000099" }),
      );
    });

    await expect(
      inspectMembership(env, guildId, userId, discordFetch),
    ).resolves.toEqual({
      status: "found",
      isAdmin: false,
      isDiceWitchAdmin: true,
    });
    expect(discordFetch).toHaveBeenCalledTimes(3);
  });

  it("does not grant a same-named role the member does not hold", async () => {
    const discordFetch = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      if (path.includes("/members/")) {
        return Promise.resolve(Response.json({ roles: [] }));
      }
      if (path.endsWith("/roles")) {
        return Promise.resolve(
          Response.json([
            { id: guildId, name: "@everyone", permissions: "0" },
            {
              id: adminRoleId,
              name: "Dice Witch Admin",
              permissions: "0",
            },
          ]),
        );
      }
      return Promise.resolve(
        Response.json({ owner_id: "100000000000000099" }),
      );
    });

    await expect(
      inspectMembership(env, guildId, userId, discordFetch),
    ).resolves.toEqual({
      status: "found",
      isAdmin: false,
      isDiceWitchAdmin: false,
    });
  });

  it("recognizes Discord Administrator role permissions and guild ownership", async () => {
    const adminByRole = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      if (path.includes("/members/")) {
        return Promise.resolve(Response.json({ roles: [adminRoleId] }));
      }
      if (path.endsWith("/roles")) {
        return Promise.resolve(
          Response.json([
            { id: guildId, name: "@everyone", permissions: "0" },
            { id: adminRoleId, name: "Admin", permissions: "8" },
          ]),
        );
      }
      return Promise.resolve(
        Response.json({ owner_id: "100000000000000099" }),
      );
    });
    await expect(
      inspectMembership(env, guildId, userId, adminByRole),
    ).resolves.toMatchObject({ status: "found", isAdmin: true });

    const adminByOwnership = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      if (path.includes("/members/")) {
        return Promise.resolve(Response.json({ roles: [] }));
      }
      if (path.endsWith("/roles")) {
        return Promise.resolve(
          Response.json([
            { id: guildId, name: "@everyone", permissions: "0" },
          ]),
        );
      }
      return Promise.resolve(Response.json({ owner_id: userId }));
    });
    await expect(
      inspectMembership(env, guildId, userId, adminByOwnership),
    ).resolves.toMatchObject({ status: "found", isAdmin: true });
  });

  it("returns missing without requesting roles when the user left", async () => {
    const discordFetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 404 })),
    );

    await expect(
      inspectMembership(env, guildId, userId, discordFetch),
    ).resolves.toEqual({ status: "missing" });
    expect(discordFetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed Discord responses and identifiers", async () => {
    await expect(
      inspectMembership(env, "001", userId, vi.fn<RequestFetch>()),
    ).rejects.toThrow("Membership identifiers are invalid");
    await expect(
      inspectMembership(
        env,
        guildId,
        userId,
        vi.fn(() => Promise.resolve(Response.json({ roles: ["bad"] }))),
      ),
    ).rejects.toThrow("Discord guild member response is invalid");
  });
});
