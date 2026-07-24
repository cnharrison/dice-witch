import { exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  DISCORD_GLOBAL_COMMANDS,
  type RollLogArtifactV1,
} from "../../packages/discord-contracts/src";
import {
  captureAudienceSnapshot,
  deliverRollLogV1,
  deliverWebRoll,
  fetchPublicStats,
  inspectMembership,
  listCurrentGuildIds,
  listCurrentGuildIdsPage,
  listTextChannels,
  logGuildLifecycle,
  logRoll,
  registerDevelopmentGuildCommands,
  registerGlobalCommands,
  reportBotListStats,
  sendRollHelper,
} from "../../workers/discord-rest/src";

const guildId = "100000000000000001";
const audienceCapturedAt = 1_767_225_600_123;
const userId = "100000000000000003";
const adminRoleId = "100000000000000005";
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
          description: "[20] = 20",
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
  TOPGG_KEY: "fixture-topgg-token",
  DISCORD_BOT_LIST_KEY: "fixture-discord-bot-list-token",
};

describe("Discord REST service", () => {
  it("does not expose a public HTTP API", async () => {
    const response = await exports.default.fetch(
      new Request("https://discord-rest.test/"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("delivers one complete multipart roll log with honest shard provenance", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(
        `/api/v10/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`,
      );
      const form = await request.formData();
      const payloadValue = form.get("payload_json");
      const file = form.get("files[0]");
      expect(typeof payloadValue).toBe("string");
      if (typeof payloadValue !== "string" || !(file instanceof File)) {
        throw new Error("Multipart log fixture is invalid");
      }
      const payload = JSON.parse(payloadValue) as {
        content: string;
        nonce: string;
        enforce_nonce: boolean;
        allowed_mentions: { parse: string[] };
        embeds: Array<{ title?: string; description?: string }>;
      };
      expect(payload).toMatchObject({
        content: "_...clatter..._",
        nonce: "log:1400000000000000001",
        enforce_nonce: true,
        allowed_mentions: { parse: [] },
        embeds: [
          { title: "receivedCommand: /roll" },
          { description: "[20] = 20" },
        ],
      });
      expect(payload.embeds[0]?.description).toContain(
        "[Guild shard 2/4 · generation 16]",
      );
      expect(JSON.stringify(payload)).not.toContain("[HTTP]");
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
      const commands = await request.json<unknown>();
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
      commandNames: ["knowledgebase", "prefs", "roll", "status", "web"],
    });
  });

  it("registers the canonical schema for the development guild", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(
        `/api/v10/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_TEST_GUILD_ID}/commands`,
      );
      expect(await request.json<unknown>()).toEqual(DISCORD_GLOBAL_COMMANDS);
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
      commandNames: ["knowledgebase", "prefs", "roll", "status", "web"],
    });
  });

  it("sums live Discord guild and member counts", async () => {
    const discordFetch = vi.fn((request: Request) => {
      const url = new URL(request.url);
      expect(url.pathname).toBe("/api/v10/users/@me/guilds");
      expect(url.searchParams.get("limit")).toBe("200");
      expect(url.searchParams.get("with_counts")).toBe("true");
      return Promise.resolve(
        Response.json([
          { id: guildId, approximate_member_count: 42 },
          { id: "100000000000000002", approximate_member_count: 8 },
        ]),
      );
    });

    await expect(fetchPublicStats(env, 2, discordFetch)).resolves.toEqual({
      liveGuilds: 2,
      estimatedGuildMemberships: 50,
      shardCount: 2,
      guildCountsByShard: [2, 0],
    });
  });

  it("rejects a shard count above Discord's coordinated maximum", async () => {
    const discordFetch = vi.fn();

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
      );
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
    const discordFetch = vi.fn<(request: Request) => Promise<Response>>(() =>
      Promise.resolve(
        Response.json([{ id: guildId, approximate_member_count: 42 }]),
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
    expect(discordFetch).toHaveBeenCalledOnce();
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
          ? Response.json([
              { id: guildId, approximate_member_count: 42 },
              { id: "100000000000000002", approximate_member_count: 8 },
            ])
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
    expect(topgg).toBeDefined();
    expect(new URL(topgg?.url ?? "").pathname).toBe(
      `/api/bots/${env.DISCORD_APPLICATION_ID}/stats`,
    );
    expect(topgg?.headers.get("authorization")).toBe(env.TOPGG_KEY);
    await expect(topgg?.json()).resolves.toEqual({ server_count: 2 });
    expect(discordBotList).toBeDefined();
    expect(new URL(discordBotList?.url ?? "").pathname).toBe(
      `/api/v1/bots/${env.DISCORD_APPLICATION_ID}/stats`,
    );
    expect(discordBotList?.headers.get("authorization")).toBe(
      env.DISCORD_BOT_LIST_KEY,
    );
    await expect(discordBotList?.json()).resolves.toEqual({ guilds: 2 });
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
      const hostname = new URL(request.url).hostname;
      if (hostname === "discord.com") {
        return Promise.resolve(
          Response.json([{ id: guildId, approximate_member_count: 42 }]),
        );
      }
      if (hostname === "top.gg") {
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
    expect(externalFetch).toHaveBeenCalledTimes(3);
  });

  it("requires explicit bot-list credentials before any request", async () => {
    const externalFetch = vi.fn();

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
    ).resolves.toEqual({ guildIds: [guildId], nextAfter: null });
    expect(sleep).toHaveBeenCalledWith(10);
    expect(discordFetch).toHaveBeenCalledTimes(2);
  });

  it("returns one bounded guild page for service-binding pagination", async () => {
    const guilds = [{ id: guildId }];
    const discordFetch = vi.fn(() => Promise.resolve(Response.json(guilds)));

    await expect(
      listCurrentGuildIdsPage(env, null, discordFetch),
    ).resolves.toEqual({ guildIds: [guildId], nextAfter: null });
    expect(discordFetch).toHaveBeenCalledOnce();
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
      expect(after).toBe(firstPage.at(-1)?.id);
      return Promise.resolve(Response.json([{ id: finalGuildId }]));
    });

    await expect(listCurrentGuildIds(env, discordFetch)).resolves.toEqual([
      ...firstPage.map(({ id }) => id),
      finalGuildId,
    ]);
    expect(discordFetch).toHaveBeenCalledTimes(2);
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

  it("delivers a rendered web roll only to a channel in the guild", async () => {
    const channelId = "100000000000000010";
    const discordFetch = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith("/channels")) {
        return Response.json([{ id: channelId, name: "general", type: 0 }]);
      }
      expect(path).toBe(`/api/v10/channels/${channelId}/messages`);
      const form = await request.formData();
      const payloadJson = form.get("payload_json");
      if (typeof payloadJson !== "string") {
        throw new Error("Discord payload is missing");
      }
      expect(JSON.parse(payloadJson)).toEqual({
        embeds: [],
        nonce: "1400000000000000001",
        enforce_nonce: true,
        allowed_mentions: { parse: [] },
      });
      expect(form.get("files[0]")).toBeInstanceOf(File);
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
        },
        discordFetch,
      ),
    ).resolves.toEqual({ status: "delivered" });
  });

  it("logs the exact legacy guild lifecycle embed", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      const payload = await request.json<Record<string, unknown>>();
      expect(payload).toMatchObject({
        enforce_nonce: true,
        embeds: [
          { color: 65280, title: "guildAdd", description: "Fixture Guild" },
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

  it("sends the legacy invalid-roll helper DM with nonce enforcement", async () => {
    const discordFetch = vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === "/api/v10/users/@me/channels") {
        expect(await request.json()).toEqual({ recipient_id: userId });
        return Response.json({ id: "100000000000000010" });
      }
      expect(url.pathname).toBe("/api/v10/channels/100000000000000010/messages");
      const payload = await request.json<Record<string, unknown>>();
      expect(payload).toMatchObject({
        nonce: "100000000000000020",
        enforce_nonce: true,
        embeds: [{ fields: [{ name: "Need help? 😅" }] }],
      });
      expect(payload.components).toHaveLength(3);
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
        const payload: unknown = await request.json();
        expect(payload).toEqual({
          nonce: "log:100000000000000020",
          enforce_nonce: true,
          embeds: [
            {
              color: 10066329,
              title: "receivedCommand: /roll",
              description:
                "2d20 + 5 from **alice [from discord]** in channel **general** on **Test Guild** [HTTP]",
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
      const payload = await request.json<{
        embeds: Array<{ description: string }>;
      }>();
      expect(payload.embeds[0]?.description).toBe(
        "1d20 from **alice [from discord]** in thread **rules\\_\\*** on **Guild \\[One\\]** [HTTP]",
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
      const payload = await request.json<{
        embeds: Array<{ description: string }>;
      }>();
      expect(payload.embeds[0]?.description).toBe(
        "1d20 from **alice [from discord]** in **DM** [HTTP]",
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
        const payload = await request.json<Record<string, unknown>>();
        expect(payload).toMatchObject({
          nonce: "log:100000000000000020",
          enforce_nonce: true,
          embeds: [
            {
              title: "receivedCommand: /roll",
              description:
                "1d20 from **alice [from discord]** in an **inaccessible channel/server** [HTTP]",
            },
          ],
        });
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
      expect(path).toBe(`/api/v10/guilds/${guildId}/roles`);
      return Promise.resolve(
        Response.json([
          { id: guildId, name: "@everyone" },
          { id: adminRoleId, name: "Dice Witch Admin" },
        ]),
      );
    });

    await expect(
      inspectMembership(env, guildId, userId, discordFetch),
    ).resolves.toEqual({ status: "found", isDiceWitchAdmin: true });
    expect(discordFetch).toHaveBeenCalledTimes(2);
  });

  it("does not grant a same-named role the member does not hold", async () => {
    const discordFetch = vi.fn((request: Request) =>
      Promise.resolve(
        new URL(request.url).pathname.includes("/members/")
          ? Response.json({ roles: [] })
          : Response.json([{ id: adminRoleId, name: "Dice Witch Admin" }]),
      ),
    );

    await expect(
      inspectMembership(env, guildId, userId, discordFetch),
    ).resolves.toEqual({ status: "found", isDiceWitchAdmin: false });
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
      inspectMembership(env, "001", userId, vi.fn()),
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
