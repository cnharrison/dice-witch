import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  D1DiscordChannelDirectoryRepository,
  DISCORD_CHANNEL_DIRECTORY_TTL_MS,
} from "../../workers/data/src/discord-channel-directory-repository";
import {
  recordDiscordChannelDirectoryMutation,
  resolveDiscordChannelContextCachedV1,
} from "../../workers/data/src/discord-channel-directory-service";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const guildId = "100000000000000002";
const channelId = "100000000000000003";
const now = 1_783_800_000_000;

function upsert(
  observedAt: number,
  channelName = "dice-rolls",
) {
  return {
    version: 1 as const,
    operation: "upsert" as const,
    source: "gateway" as const,
    guildId,
    channelId,
    channelName,
    channelType: 0 as const,
    observedAt,
  };
}

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.prepare("DELETE FROM discord_channel_directory").run();
});

describe("Discord channel directory", () => {
  it("retains the newest bounded context and protects deletes from stale replay", async () => {
    const repository = new D1DiscordChannelDirectoryRepository(dataEnv.DATA);
    await expect(repository.apply(upsert(now), now)).resolves.toEqual({
      status: "applied",
    });
    await expect(repository.apply(upsert(now - 1, "stale-name"), now)).resolves
      .toEqual({ status: "existing" });
    await expect(repository.find(guildId, channelId, now)).resolves.toMatchObject({
      status: "resolved",
      channelName: "dice-rolls",
      channelType: 0,
      source: "gateway",
    });

    await repository.apply({
      version: 1,
      operation: "delete",
      source: "gateway",
      guildId,
      channelId,
      observedAt: now + 1,
    }, now + 1);
    await expect(repository.apply(upsert(now), now + 2)).resolves.toEqual({
      status: "existing",
    });
    await expect(repository.find(guildId, channelId, now + 2)).resolves
      .toMatchObject({ status: "deleted" });
    await expect(
      repository.find(
        guildId,
        channelId,
        now + DISCORD_CHANNEL_DIRECTORY_TTL_MS + 2,
      ),
    ).resolves.toBeNull();
  });

  it("resolves from cache before Discord REST and caches a REST miss", async () => {
    const resolveDiscordChannelContextV1 = vi.fn(() => Promise.resolve({
      status: "resolved" as const,
      channelName: "resolved-rolls",
      channelType: 11 as const,
    }));
    const serviceEnv = {
      DATA: dataEnv.DATA,
      DISCORD_REST: { resolveDiscordChannelContextV1 },
    };
    const request = { version: 1, guildId, channelId };

    await expect(
      resolveDiscordChannelContextCachedV1(serviceEnv, request, now),
    ).resolves.toEqual({
      status: "resolved",
      channelName: "resolved-rolls",
      channelType: 11,
    });
    await expect(
      resolveDiscordChannelContextCachedV1(serviceEnv, request, now + 1),
    ).resolves.toEqual({
      status: "resolved",
      channelName: "resolved-rolls",
      channelType: 11,
    });
    expect(resolveDiscordChannelContextV1).toHaveBeenCalledOnce();
  });

  it("validates bounded internal mutations and ignores expired observations", async () => {
    const stale = await recordDiscordChannelDirectoryMutation(
      new Request("https://data.internal/internal/discord-channel-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(upsert(now - DISCORD_CHANNEL_DIRECTORY_TTL_MS - 1)),
      }),
      { DATA: dataEnv.DATA },
      now,
    );
    expect(stale.status).toBe(200);
    await expect(stale.json()).resolves.toEqual({ status: "stale" });

    const invalid = await recordDiscordChannelDirectoryMutation(
      new Request("https://data.internal/internal/discord-channel-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...upsert(now), channelName: "" }),
      }),
      { DATA: dataEnv.DATA },
      now,
    );
    expect(invalid.status).toBe(400);
    await expect(
      new D1DiscordChannelDirectoryRepository(dataEnv.DATA).find(
        guildId,
        channelId,
        now,
      ),
    ).resolves.toBeNull();
  });
});
