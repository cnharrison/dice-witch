import type { SchemaInput } from "../../../packages/discord-contracts/src/schema-primitives";
import {
  parseDiscordChannelContextRequestV1,
  parseDiscordChannelDirectoryMutationV1,
  type DiscordChannelContextRequestV1,
  type DiscordChannelContextResultV1,
  type DiscordChannelDirectoryMutationV1,
} from "../../../packages/discord-contracts/src";
import {
  D1DiscordChannelDirectoryRepository,
  DISCORD_CHANNEL_DIRECTORY_TTL_MS,
  type DiscordChannelDirectoryMutationResult,
} from "./discord-channel-directory-repository";

const MAX_CHANNEL_DIRECTORY_BODY_BYTES = 2 * 1_024;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export type DiscordChannelContextResolver = {
  resolveDiscordChannelContextV1(
    request: DiscordChannelContextRequestV1,
  ): Promise<DiscordChannelContextResultV1>;
};

export type DiscordChannelDirectoryServiceEnv = {
  DATA: D1Database;
  DISCORD_REST: DiscordChannelContextResolver;
};

export type DiscordChannelDirectoryRecordResult =
  | DiscordChannelDirectoryMutationResult
  | Readonly<{ status: "stale" }>;

export async function applyDiscordChannelDirectoryMutation(
  db: D1Database,
  mutation: DiscordChannelDirectoryMutationV1,
  now: number,
): Promise<DiscordChannelDirectoryRecordResult> {
  if (mutation.observedAt < now - DISCORD_CHANNEL_DIRECTORY_TTL_MS) {
    return { status: "stale" };
  }
  if (mutation.observedAt > now + MAX_FUTURE_SKEW_MS) {
    throw new Error("Discord channel directory timestamp is invalid");
  }
  return new D1DiscordChannelDirectoryRepository(db).apply(mutation, now);
}

export async function recordDiscordChannelDirectoryMutation(
  request: Request,
  env: Pick<DiscordChannelDirectoryServiceEnv, "DATA">,
  now = Date.now(),
): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_CHANNEL_DIRECTORY_BODY_BYTES
  ) {
    return Response.json(
      { error: "Discord channel directory request is too large" },
      { status: 413 },
    );
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_CHANNEL_DIRECTORY_BODY_BYTES) {
    return Response.json(
      { error: "Discord channel directory request is too large" },
      { status: 413 },
    );
  }
  let mutation: DiscordChannelDirectoryMutationV1;
  try {
    mutation = parseDiscordChannelDirectoryMutationV1(
      JSON.parse(new TextDecoder().decode(body)),
    );
  } catch {
    return Response.json(
      { error: "Discord channel directory request is invalid" },
      { status: 400 },
    );
  }
  if (mutation.observedAt > now + MAX_FUTURE_SKEW_MS) {
    return Response.json(
      { error: "Discord channel directory request is invalid" },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      await applyDiscordChannelDirectoryMutation(env.DATA, mutation, now),
    );
  } catch {
    return Response.json(
      { error: "Discord channel directory write failed" },
      { status: 500 },
    );
  }
}

export async function resolveDiscordChannelContextCachedV1(
  env: DiscordChannelDirectoryServiceEnv,
  value: SchemaInput,
  now: number,
): Promise<DiscordChannelContextResultV1> {
  const request = parseDiscordChannelContextRequestV1(value);
  const repository = new D1DiscordChannelDirectoryRepository(env.DATA);
  const cached = await repository.find(
    request.guildId,
    request.channelId,
    now,
  );
  if (cached?.status === "resolved") {
    return {
      status: "resolved",
      channelName: cached.channelName,
      channelType: cached.channelType,
    };
  }
  if (cached?.status === "deleted") {
    return { status: "unavailable", httpStatus: 404 };
  }

  const result = await env.DISCORD_REST.resolveDiscordChannelContextV1(request);
  if (result.status === "resolved") {
    try {
      await repository.apply({
        version: 1,
        operation: "upsert",
        source: "rest",
        guildId: request.guildId,
        channelId: request.channelId,
        channelName: result.channelName,
        channelType: result.channelType,
        observedAt: now,
      }, now);
    } catch {
      console.warn(JSON.stringify({
        level: "warn",
        message: "Discord channel context cache write failed",
        resolutionSource: "rest",
      }));
    }
  }
  return result;
}

export function cleanDiscordChannelDirectory(
  db: D1Database,
  now: number,
): Promise<number> {
  return new D1DiscordChannelDirectoryRepository(db).deleteExpired(now);
}
