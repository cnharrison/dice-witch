import { env } from "cloudflare:workers";
import type { GatewayEnv } from "../../workers/gateway/src/environment";

const discordRest = {
  captureAudienceSnapshotV1: () => Promise.resolve({
    version: 1 as const,
    capturedAt: 1_720_000_000_000,
    liveGuilds: 0,
    estimatedGuildMemberships: 0,
    shardCount: 1,
    guildCountsByShard: [0],
  }),
  listCurrentGuildIdsPage: () =>
    Promise.resolve({ guildIds: [], nextAfter: null }),
  logGuildLifecycle: () => Promise.resolve({ status: "delivered" as const }),
  reportBotListStats: () => Promise.resolve({
    status: "reported" as const,
    servers: 0,
    users: 0,
    topggHttpStatus: 200,
    discordBotListHttpStatus: 200,
  }),
  reportBotListStatsV1: () => Promise.resolve({
    status: "reported" as const,
    version: 1 as const,
    capturedAt: 1_720_000_000_000,
    liveGuilds: 0,
    estimatedGuildMemberships: 0,
    shardCount: 1,
    guildCountsByShard: [0],
    topggHttpStatus: 200,
    discordBotListHttpStatus: 200,
  }),
} satisfies GatewayEnv["DISCORD_REST"];

export const gatewayTestEnv: GatewayEnv = {
  ...env,
  DISCORD_BOT_TOKEN:
    "development-token-first-part.second.development-token-third-part",
  GATEWAY_CONTROL_TOKEN: "gateway-control-token-at-least-32-characters",
  DISCORD_REST: discordRest,
};
