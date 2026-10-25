import { z } from "zod";
import { DurableObject } from "cloudflare:workers";
import { setTimeout as delay } from "node:timers/promises";
import { authorized, smallBody } from "./staging-auth.ts";
import { FixtureDelay } from "./staging-fixture.mjs";
export { FixtureData, FixtureDiscordRest } from "./staging-fixture.mjs";

const DataMutationId = z.string().min(1);

// The Discord fixture runs on the test host. Only small, durable data-service
// counters remain here, so a fixture actor reset cannot destroy Discord sessions.
export class FixtureController extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS fixture_value (name TEXT PRIMARY KEY, value INTEGER NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS fixture_mutation (id TEXT PRIMARY KEY)");
  }

  configure(knownGuilds) {
    if (knownGuilds !== true && knownGuilds !== false) throw new Error("Invalid fixture guild mode");
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM fixture_value");
      this.ctx.storage.sql.exec("DELETE FROM fixture_mutation");
      for (const [name, value] of [["known", Number(knownGuilds)], ["slow", 0], ["lifecycle", 0], ["directory", 0]]) {
        this.ctx.storage.sql.exec("INSERT INTO fixture_value VALUES (?, ?)", name, value);
      }
    });
  }

  value(name) {
    return this.ctx.storage.sql.exec("SELECT value FROM fixture_value WHERE name = ?", name).one().value;
  }

  slow(milliseconds) {
    this.ctx.storage.sql.exec("UPDATE fixture_value SET value = ? WHERE name = 'slow'", FixtureDelay.parse(milliseconds));
  }

  stats() { return { lifecycle: this.value("lifecycle"), directory: this.value("directory") }; }

  async data(path, body) {
    if (Date.now() >= Number(this.env.EXPIRES_AT)) throw new Error("Benchmark deployment expired");
    const input = JSON.parse(body);
    if (path === "/internal/guilds/filter") return JSON.stringify({ guildIds: this.value("known") ? input.guildIds : [] });
    if (path !== "/internal/guilds/lifecycle" && path !== "/internal/discord-channel-context") throw new Error("Unexpected fixture data route");
    const milliseconds = this.value("slow");
    if (milliseconds) await delay(milliseconds);
    const counter = path === "/internal/guilds/lifecycle" ? "lifecycle" : "directory";
    const duplicate = this.ctx.storage.transactionSync(() => {
      if (counter === "lifecycle") {
        if (!DataMutationId.safeParse(input.mutationId).success) throw new Error("Missing lifecycle mutation identity");
        const result = this.ctx.storage.sql.exec("INSERT OR IGNORE INTO fixture_mutation VALUES (?)", input.mutationId);
        if (result.rowsWritten === 0) return true;
      }
      this.ctx.storage.sql.exec("UPDATE fixture_value SET value = value + 1 WHERE name = ?", counter);
      return false;
    });
    if (duplicate) return JSON.stringify({ status: "applied", guildName: "Fixture Guild" });
    return JSON.stringify(counter === "lifecycle" ? { status: "applied", guildName: "Fixture Guild" } : { status: "applied" });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const scheme = url.pathname === "/bot" ? "Bot" : "Bearer";
    const token = scheme === "Bot" ? env.DISCORD_BOT_TOKEN : env.GATEWAY_CONTROL_TOKEN;
    if (!(await authorized(request, token, scheme))) return new Response(null, { status: 401 });
    if (Date.now() >= Number(env.EXPIRES_AT) && url.pathname !== "/stop" && url.pathname !== "/probe") return new Response(null, { status: 410 });
    url.protocol = "https:";
    url.hostname = env.FIXTURE_HOSTNAME;
    url.port = "";
    const body = request.method === "POST" ? await smallBody(request) : undefined;
    if (body === null) return new Response(null, { status: 413 });
    const headers = new Headers(request.headers);
    headers.delete("host");
    const response = await fetch(url, { method: request.method, headers, body, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) throw new Error("Fixture redirects are not allowed");
    if (!response.ok) return response;
    const result = await response.json();
    const controller = env.FIXTURE.getByName("memory-benchmark");
    if (url.pathname === "/configure") await controller.configure(JSON.parse(body).knownGuilds);
    if (url.pathname === "/slow") await controller.slow(JSON.parse(body).milliseconds);
    if (result.counters) Object.assign(result.counters, await controller.stats());
    return Response.json(result);
  },
};
