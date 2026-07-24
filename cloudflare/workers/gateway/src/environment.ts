import type { DiscordAudienceCaptureV1 } from "../../../packages/discord-contracts/src";
import {
  readWorkerSecret,
  type WorkerSecretSource,
} from "../../../packages/worker-secrets/src";

export const GATEWAY_COORDINATOR_NAME = "development-generation-1";
export const GATEWAY_PARTITION_NAME = "development-shard-0";

export type GatewayEnv = Omit<
  GatewayBindings,
  | "DISCORD_GATEWAY_BOT_URL"
  | "GATEWAY_MODE"
  | "GATEWAY_ALLOWED_HOSTNAME"
  | "GATEWAY_FLEET_CONNECTION_CAPACITY"
  | "DISCORD_REST"
> & {
  DISCORD_BOT_TOKEN: WorkerSecretSource;
  GATEWAY_CONTROL_TOKEN: WorkerSecretSource;
  DISCORD_GATEWAY_BOT_URL: string;
  GATEWAY_MODE: "single" | "fleet";
  GATEWAY_ALLOWED_HOSTNAME: string;
  GATEWAY_FLEET_CONNECTION_CAPACITY: string;
  DISCORD_REST: {
    captureAudienceSnapshotV1(input: {
      shardCount: number;
    }): Promise<DiscordAudienceCaptureV1>;
    listCurrentGuildIdsPage(after: string | null): Promise<unknown>;
    logGuildLifecycle(input: unknown): Promise<unknown>;
    reportBotListStats(): Promise<{
      status: "reported" | "failed" | "skipped";
      servers: number;
      users: number;
      topggHttpStatus: number | null;
      discordBotListHttpStatus: number | null;
    }>;
    reportBotListStatsV1(input: { shardCount: number }): Promise<
      DiscordAudienceCaptureV1 & {
        status: "reported" | "failed" | "skipped";
        topggHttpStatus: number | null;
        discordBotListHttpStatus: number | null;
      }
    >;
  };
};

const DISCORD_BOT_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export async function discordBotToken(env: GatewayEnv): Promise<string> {
  const token = await readWorkerSecret(
    env.DISCORD_BOT_TOKEN,
    "DISCORD_BOT_TOKEN",
  );
  if (
    token.length < 50 ||
    token.length > 200 ||
    !DISCORD_BOT_TOKEN.test(token)
  ) {
    throw new Error("DISCORD_BOT_TOKEN is invalid");
  }
  return token;
}

export async function gatewayControlToken(env: GatewayEnv): Promise<string> {
  const token = await readWorkerSecret(
    env.GATEWAY_CONTROL_TOKEN,
    "GATEWAY_CONTROL_TOKEN",
  );
  if (token.length < 32 || token.length > 256) {
    throw new Error("GATEWAY_CONTROL_TOKEN is invalid");
  }
  return token;
}

export function allowedGatewayHostname(env: GatewayEnv): string {
  const hostname = env.GATEWAY_ALLOWED_HOSTNAME;
  const url = new URL(`https://${hostname}`);
  if (
    url.hostname !== hostname ||
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Allowed Gateway hostname is invalid");
  }
  return hostname;
}

export function discordGatewayBotUrl(env: GatewayEnv): string {
  const url = new URL(env.DISCORD_GATEWAY_BOT_URL);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Discord Gateway Bot URL is invalid");
  }
  return url.href;
}
