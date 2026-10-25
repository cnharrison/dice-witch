import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { z } from "zod";
import { createFixture } from "./fixture.mjs";
import { gatewayControlToken } from "../../workers/gateway/src/environment.ts";
import { authorized, smallBody, tokenDigest } from "./staging-auth.ts";

const Profile = z.strictObject({
  runId: z.string().uuid(),
  guilds: z.number().int().min(24).max(24_303),
  channels: z.number().int().min(1).max(40),
  heartbeatMs: z.union([z.literal(1_000), z.literal(41_250)]),
  knownGuilds: z.boolean(),
});
const Replay = z.strictObject({ countPerShard: z.number().int().min(1).max(24_303), rate: z.number().int().min(24).max(600), channelUpdates: z.boolean() });
const DataPath = z.string();
const DataBody = z.string().max(65_536);
const CONTROLLER = "memory-benchmark";

export class FixtureController extends DurableObject {
  fixture;
  profile;
  lostRunId;
  replaying = false;
  abort;

  constructor(ctx, env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get("profile");
      if (stored !== undefined) this.lostRunId = stored.runId;
    });
  }

  async probe() {
    const digest = await tokenDigest(this.env.DISCORD_BOT_TOKEN);
    return {
      sourceSha: this.env.SOURCE_SHA,
      expiresAt: Number(this.env.EXPIRES_AT),
      tokenDigest: digest,
      hasProfile: this.fixture !== undefined,
      lostRunId: this.lostRunId ?? null,
      connected: this.fixture?.connectedCount() ?? 0,
    };
  }

  async configure(value) {
    if (Date.now() >= Number(this.env.EXPIRES_AT)) throw new Error("Benchmark deployment expired");
    if (this.fixture || this.lostRunId) throw new Error("Fixture must be stopped before configuration");
    this.profile = Profile.parse(value);
    this.abort = new AbortController();
    this.fixture = createFixture({
      Response, WebSocketPair,
      guildCount: this.profile.guilds,
      channelCount: this.profile.channels,
      heartbeatMs: this.profile.heartbeatMs,
      knownGuilds: this.profile.knownGuilds,
      token: this.env.DISCORD_BOT_TOKEN,
      gatewayUrl: `wss://${this.env.FIXTURE_HOSTNAME}/socket`,
      botUrl: `https://${this.env.FIXTURE_HOSTNAME}/bot`,
    });
    await this.ctx.storage.put("profile", this.profile);
    await this.ctx.storage.setAlarm(Math.min(Date.now() + 12 * 60_000, Number(this.env.EXPIRES_AT)));
    return this.stats();
  }

  active() {
    if (this.lostRunId) throw new Error("Fixture restarted during a profile");
    if (!this.fixture || !this.profile || !this.abort) throw new Error("Fixture profile is not active");
    if (Date.now() >= Number(this.env.EXPIRES_AT)) throw new Error("Benchmark deployment expired");
    return this.fixture;
  }

  stats() {
    const fixture = this.active();
    return {
      runId: this.profile.runId,
      counters: fixture.counters,
      errors: fixture.errors,
      sequences: fixture.sequences,
      heartbeatSequences: fixture.heartbeatSequences,
      diagnostics: fixture.diagnostics,
      guildCounts: fixture.ids.map((ids) => ids.length),
      connected: fixture.connectedCount(),
      replaying: this.replaying,
    };
  }

  async replay(value) {
    const fixture = this.active();
    if (this.replaying || fixture.connectedCount() !== 25) throw new Error("Fixture replay is not ready");
    const profile = Replay.parse(value);
    this.replaying = true;
    try {
      const result = await fixture.replay({ ...profile, signal: this.abort.signal });
      return { ...result, ...this.stats() };
    } finally {
      this.replaying = false;
    }
  }

  slow(milliseconds) {
    if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 50) throw new Error("Invalid fixture service delay");
    this.active().setSlowMs(milliseconds);
    return this.stats();
  }

  reconnect() {
    this.active().reconnectAll();
    return this.stats();
  }

  async data(path, body) {
    const fixture = this.active();
    if (!DataPath.safeParse(path).success || !DataBody.safeParse(body).success) throw new Error("Invalid fixture data request");
    return fixture.data(new Request(`https://data.internal${path}`, { method: "POST", body }));
  }

  async stop() {
    this.abort?.abort(new Error("Fixture profile stopped"));
    this.fixture?.close(4004);
    this.fixture = undefined;
    this.profile = undefined;
    this.lostRunId = undefined;
    await this.ctx.storage.delete("profile");
    await this.ctx.storage.deleteAlarm();
    return { status: "stopped" };
  }

  async alarm() { await this.stop(); }

  async fetch(request) {
    return this.active().outbound(request);
  }
}

export class FixtureData extends WorkerEntrypoint {
  async fetch(request) {
    return this.env.FIXTURE.getByName(CONTROLLER).data(new URL(request.url).pathname, await request.text());
  }
}

export class FixtureDiscordRest extends WorkerEntrypoint {
  logGuildLifecycle() { return { status: "delivered" }; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/socket") {
      if (request.headers.get("upgrade") !== "websocket") return new Response(null, { status: 400 });
      if (Date.now() >= Number(env.EXPIRES_AT)) return new Response(null, { status: 410 });
      return env.FIXTURE.getByName(CONTROLLER).fetch(request);
    }
    const scheme = url.pathname === "/bot" ? "Bot" : "Bearer";
    const token = scheme === "Bot" ? env.DISCORD_BOT_TOKEN : await gatewayControlToken(env);
    if (!(await authorized(request, token, scheme))) return new Response(null, { status: 401 });
    if (url.pathname === "/health") return Response.json({ sourceSha: env.SOURCE_SHA, expiresAt: Number(env.EXPIRES_AT) });
    if (Date.now() >= Number(env.EXPIRES_AT) && url.pathname !== "/stop" && url.pathname !== "/probe") return new Response(null, { status: 410 });
    const controller = env.FIXTURE.getByName(CONTROLLER);
    if (url.pathname === "/bot") return controller.fetch(request);
    if (url.pathname === "/probe" && request.method === "GET") return Response.json(await controller.probe());
    if (url.pathname === "/stats" && request.method === "GET") return Response.json(await controller.stats());
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (Number(request.headers.get("content-length")) > 4_096) return new Response(null, { status: 413 });
    const text = await smallBody(request);
    if (text === null) return new Response(null, { status: 413 });
    let result;
    switch (url.pathname) {
      case "/configure": result = await controller.configure(JSON.parse(text)); break;
      case "/replay": result = await controller.replay(JSON.parse(text)); break;
      case "/slow": result = await controller.slow(JSON.parse(text).milliseconds); break;
      case "/reconnect": result = await controller.reconnect(); break;
      case "/stop": result = await controller.stop(); break;
      default: return new Response(null, { status: 404 });
    }
    return Response.json(result);
  },
};
