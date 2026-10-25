import { gatewayPartitionAssignments, validateGatewaySessionCheckpoint, type GatewayPartitionCommand } from "../../packages/gateway-protocol/src";
import { discordBotToken, gatewayControlToken, type GatewayEnv } from "../../workers/gateway/src/environment";
import localWorker, { benchmarkEnv, GatewayPartition as LocalPartition } from "./worker";
import { authorized, smallBody, tokenDigest } from "./staging-auth";
import { fixtureDestination } from "./staging-policy";
export { GatewayCoordinator } from "./worker";

declare const BENCHMARK_FIXTURE_HOSTNAME: string;
type StagingEnv = GatewayEnv & Pick<GatewayMemoryBindings, "EXPIRES_AT" | "SOURCE_SHA">;

export class GatewayPartition extends LocalPartition {
  private readonly deadline: number;
  private readonly sourceSha: string;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: StagingEnv) {
    super(ctx, env);
    this.deadline = Number(env.EXPIRES_AT);
    this.sourceSha = env.SOURCE_SHA;
    if (!Number.isSafeInteger(this.deadline) || env.GATEWAY_ALLOWED_HOSTNAME !== BENCHMARK_FIXTURE_HOSTNAME || env.DISCORD_GATEWAY_BOT_URL !== `https://${BENCHMARK_FIXTURE_HOSTNAME}/bot`) {
      throw new Error("Benchmark destinations or deadline are invalid");
    }
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.list();
      for (const [key, value] of stored) {
        if (key !== "gateway-checkpoint-v1" && !/^gateway-(fleet-)?checkpoint-v1:[0-9]+:[0-9]+:[0-9]+$/.test(key)) continue;
        const checkpoint = validateGatewaySessionCheckpoint(value);
        if (checkpoint.resumeGatewayUrl !== null) fixtureDestination(checkpoint.resumeGatewayUrl);
      }
      if (Date.now() >= this.deadline) await this.shutdownFleet();
    });
  }

  private armDeadline(): void {
    if (Date.now() >= this.deadline) throw new Error("Benchmark has expired");
    if (this.expiryTimer !== null) return;
    this.expiryTimer = setTimeout(() => {
      this.ctx.waitUntil(this.shutdownFleet().catch(() => {
        console.error(JSON.stringify({ level: "error", message: "Benchmark deadline shutdown failed" }));
      }));
    }, this.deadline - Date.now());
  }

  override async executeFleetCommand(command: GatewayPartitionCommand): Promise<void> {
    this.armDeadline();
    await super.executeFleetCommand(command);
  }

  override async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/probe") return Response.json({ sourceSha: this.sourceSha, expiresAt: this.deadline, tokenDigest: await tokenDigest(await discordBotToken(this.env)) });
    if (path === "/diagnostic") return Response.json({ activationId: this.status().activationId, deadline: this.deadline });
    if (path === "/restart") {
      if (Date.now() >= this.deadline) return new Response(null, { status: 410 });
      this.ctx.abort("Benchmark persisted restart");
    }
    return super.fetch(request);
  }

  override async alarm(): Promise<void> {
    if (Date.now() >= this.deadline) {
      await this.shutdownFleet();
      return;
    }
    this.armDeadline();
    await super.alarm();
  }

  override async shutdownFleet(): Promise<void> {
    await super.shutdownFleet();
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }
}

export default {
  async fetch(request: Request, env: StagingEnv): Promise<Response> {
    if (!(await authorized(request, await gatewayControlToken(env)))) return new Response(null, { status: 401 });
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ sourceSha: env.SOURCE_SHA, expiresAt: Number(env.EXPIRES_AT), capacity: Number(env.GATEWAY_FLEET_CONNECTION_CAPACITY) });
    if (Date.now() >= Number(env.EXPIRES_AT) && url.pathname !== "/stop") return new Response(null, { status: 410 });
    if (!["/start", "/status", "/inventory", "/recover", "/stop", "/restart", "/diagnostic", "/probe"].includes(url.pathname)) return new Response(null, { status: 404 });
    const mutation = ["/start", "/recover", "/stop", "/restart"].includes(url.pathname);
    if (request.method !== (mutation ? "POST" : "GET")) return new Response(null, { status: 405 });
    if (mutation && await smallBody(request) === null) return new Response(null, { status: 413 });
    if (url.pathname === "/restart" || url.pathname === "/diagnostic" || url.pathname === "/probe") {
      const assignment = gatewayPartitionAssignments(25, Number(env.GATEWAY_FLEET_CONNECTION_CAPACITY))[Number(url.searchParams.get("partition"))];
      if (assignment === undefined) return new Response(null, { status: 400 });
      return benchmarkEnv(env).GATEWAY_PARTITION.getByName(assignment.partitionName).fetch(new Request(`https://benchmark${url.pathname}`));
    }
    return localWorker.fetch(request, env);
  },
} satisfies ExportedHandler<StagingEnv>;
