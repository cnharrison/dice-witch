import * as gateway from "../../workers/gateway/src/discord-gateway";
export * from "../../workers/gateway/src/discord-gateway";

declare const BENCHMARK_FIXTURE_HOSTNAME: string;

export function fixtureDestination(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "wss:" || url.hostname !== BENCHMARK_FIXTURE_HOSTNAME || url.pathname !== "/socket" || url.port || url.username || url.password || url.hash) {
    throw new Error("Benchmark blocked a non-fixture Gateway destination");
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "v" && key !== "encoding") throw new Error("Benchmark Gateway URL has an unexpected parameter");
  }
}

export function normalizeDiscordGatewayUrl(...args: Parameters<typeof gateway.normalizeDiscordGatewayUrl>): string {
  fixtureDestination(args[0]);
  if (args[1] !== BENCHMARK_FIXTURE_HOSTNAME) throw new Error("Benchmark fixture hostname is not configured");
  return gateway.normalizeDiscordGatewayUrl(...args);
}

export function parseGatewayBotResponse(...args: Parameters<typeof gateway.parseGatewayBotResponse>): ReturnType<typeof gateway.parseGatewayBotResponse> {
  const result = gateway.parseGatewayBotResponse(...args);
  fixtureDestination(result.url);
  return result;
}

export function parseGatewayMessage(...args: Parameters<typeof gateway.parseGatewayMessage>): ReturnType<typeof gateway.parseGatewayMessage> {
  const result = gateway.parseGatewayMessage(...args);
  if (result.type === "ready") fixtureDestination(result.resumeGatewayUrl);
  return result;
}
