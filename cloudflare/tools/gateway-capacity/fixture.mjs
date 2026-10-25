import { setTimeout as delay } from "node:timers/promises";
import { Buffer } from "node:buffer";
import { z } from "zod";

const FixtureFrame = z.string().max(65_536);
const KnownGuilds = z.boolean();

export const SHARDS = 25;
export const FIXTURE_TOKEN = "development-token-first-part.second.development-token-third-part";

export function guildIds(shardId, count) {
  const base = (100000000000000000n >> 22n) / BigInt(SHARDS) * BigInt(SHARDS);
  return Array.from({ length: count }, (_, index) =>
    String((base + BigInt(shardId + index * SHARDS)) << 22n),
  );
}

export function guildPayload(id, channelCount) {
  return {
    id,
    name: `Fixture Guild ${id}`,
    icon: null,
    owner_id: String(BigInt(id) + 1n),
    member_count: 64,
    approximate_member_count: 64,
    preferred_locale: "en-US",
    joined_at: "2026-09-01T00:00:00.000Z",
    unavailable: false,
    roles: Array.from({ length: 10 }, (_, index) => ({
      id: String(BigInt(id) + BigInt(100 + index)),
      name: `Role ${index}`,
      permissions: "104324673",
      color: 0,
      position: index,
      hoist: false,
      managed: false,
      mentionable: false,
    })),
    channels: Array.from({ length: channelCount }, (_, index) => ({
      id: String(BigInt(id) + BigInt(1_000 + index)),
      guild_id: id,
      type: 0,
      name: `channel-${index}`,
      position: index,
      topic: "Synthetic channel topic. ".repeat(10),
      parent_id: null,
      permission_overwrites: [],
      nsfw: false,
      rate_limit_per_user: 0,
      last_message_id: null,
    })),
    emojis: [],
    features: [],
    members: [],
    presences: [],
    voice_states: [],
    threads: [],
  };
}

function isFixtureShardId(value) {
  return Number.isInteger(value) && value >= 0 && value < SHARDS;
}

export function createFixture({ Response, WebSocketPair, guildCount, channelCount, heartbeatMs, token, gatewayUrl, botUrl, knownGuilds }) {
  if (!token || !gatewayUrl || !botUrl || !KnownGuilds.safeParse(knownGuilds).success) throw new Error("Fixture token and destinations are required");
  const ids = Array.from({ length: SHARDS }, (_, shardId) =>
    guildIds(shardId, Math.floor(guildCount / SHARDS) + Number(shardId < guildCount % SHARDS)),
  );
  const connections = new Map();
  const sockets = new Set();
  const retiringSockets = new Set();
  let connectionAttempts = 0;
  const sequences = Array(SHARDS).fill(0);
  const heartbeatSequences = Array(SHARDS).fill(null);
  const reconnecting = new Set();
  const counters = { identifies: 0, resumes: 0, heartbeats: 0, lifecycle: 0, directory: 0, sent: 0, sentBytes: 0 };
  const errors = [];
  // Each connection can authenticate and close once; the 256-attempt guard bounds this history.
  const diagnostics = { closes: [], resumes: [] };
  let slowMs = 0;
  let stopping = false;

  function send(shardId, eventType, data) {
    const socket = connections.get(shardId);
    if (socket === undefined) throw new Error(`Fixture shard ${shardId} is disconnected`);
    const payload = JSON.stringify({ op: 0, s: ++sequences[shardId], t: eventType, d: data });
    socket.send(payload);
    counters.sent += 1;
    counters.sentBytes += Buffer.byteLength(payload);
  }

  return {
    ids,
    counters,
    errors,
    sequences,
    heartbeatSequences,
    diagnostics,
    setSlowMs(value) { slowMs = value; },
    connectedCount() { return connections.size; },
    async outbound(request) {
      const url = new URL(request.url);
      if (url.href === botUrl) {
        return Response.json({
          url: gatewayUrl,
          shards: SHARDS,
          session_start_limit: { total: 10_000, remaining: 10_000, reset_after: 86_400_000, max_concurrency: SHARDS },
        });
      }
      if (url.hostname !== new URL(gatewayUrl).hostname || request.headers.get("upgrade") !== "websocket") {
        throw new Error(`Benchmark blocked outbound request: ${url.origin}${url.pathname}`);
      }
      const currentSockets = [...sockets].filter((socket) => socket.readyState === 1 && !retiringSockets.has(socket));
      if (currentSockets.length >= SHARDS || sockets.size >= SHARDS * 2 || ++connectionAttempts > 256) throw new Error("Fixture connection budget exceeded");
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      sockets.add(server);
      let shardId;
      let incomingMessages = 0;
      const authenticationTimer = setTimeout(() => {
        if (shardId === undefined && server.readyState === 1) server.close(4004, "Authentication expired");
      }, 5_000);
      server.addEventListener("message", ({ data }) => {
        if (server.readyState !== 1 || retiringSockets.has(server)) return;
        try {
          if (++incomingMessages > 1_024) throw new Error("Fixture incoming frame budget exceeded");
          if (!FixtureFrame.safeParse(data).success) throw new Error("Invalid fixture frame");
          const message = JSON.parse(data);
          if (message.op === 2) {
            if (shardId !== undefined) throw new Error("Repeated fixture authentication");
            if (message.d.token !== token) {
              throw new Error("Benchmark received an unexpected bot token");
            }
            shardId = message.d.shard[0];
            if (!isFixtureShardId(shardId)) throw new Error("Invalid fixture shard");
            if (connections.get(shardId)?.readyState === 1 && !retiringSockets.has(connections.get(shardId))) throw new Error("Duplicate fixture shard");
            clearTimeout(authenticationTimer);
            connections.set(shardId, server);
            counters.identifies += 1;
            send(shardId, "READY", {
              session_id: `fixture-session-${shardId}`,
              resume_gateway_url: gatewayUrl,
              guilds: ids[shardId].map((id) => ({ id, unavailable: true })),
            });
          } else if (message.op === 6) {
            if (shardId !== undefined) throw new Error("Repeated fixture authentication");
            shardId = Number(message.d.session_id.replace("fixture-session-", ""));
            if (!isFixtureShardId(shardId)) throw new Error("Invalid fixture session");
            if (message.d.token !== token || message.d.seq !== sequences[shardId]) {
              throw new Error("RESUME did not restore the fixture token and drained sequence");
            }
            if (connections.get(shardId)?.readyState === 1 && !retiringSockets.has(connections.get(shardId))) throw new Error("Duplicate fixture shard");
            clearTimeout(authenticationTimer);
            connections.set(shardId, server);
            counters.resumes += 1;
            diagnostics.resumes.push({ shardId, sequence: message.d.seq, at: Date.now() });
            send(shardId, "RESUMED", {});
          } else if (message.op === 1) {
            counters.heartbeats += 1;
            heartbeatSequences[shardId] = message.d;
            server.send(JSON.stringify({ op: 11, d: null }));
            // Keep the controlled reconnect after its ACK, not racing an in-flight heartbeat.
            if (reconnecting.delete(shardId)) {
              retiringSockets.add(server);
              server.send(JSON.stringify({ op: 7, d: null }));
            }
          } else if (message.op !== 3) {
            throw new Error(`Unexpected fixture opcode ${message.op}`);
          }
        } catch (error) {
          errors.push(error.message);
          const authFailure = error instanceof Error && (/unexpected bot token|RESUME did not restore/.test(error.message));
          if (server.readyState === 1) server.close(authFailure ? 4004 : 4000, "fixture-error");
        }
      });
      server.addEventListener("close", ({ code, reason }) => {
        // Peer-supplied close text must not enter saved diagnostics.
        const reasonTag = reason === "heartbeat-ack-timeout" || reason === "gateway-reconnect"
          ? reason
          : "unrecognized";
        diagnostics.closes.push({ shardId: isFixtureShardId(shardId) ? shardId : null, code, reasonTag, at: Date.now() });
        clearTimeout(authenticationTimer);
        if (server.readyState !== 3) server.close();
        sockets.delete(server);
        retiringSockets.delete(server);
        if (connections.get(shardId) === server) connections.delete(shardId);
        if (!stopping && shardId === undefined) errors.push("Socket closed before authentication");
      });
      server.send(JSON.stringify({ op: 10, d: { heartbeat_interval: heartbeatMs } }));
      return new Response(null, { status: 101, webSocket: client });
    },
    async data(request) {
      const path = new URL(request.url).pathname;
      if (path === "/internal/guilds/filter") {
        const { guildIds } = await request.json();
        return Response.json({ guildIds: knownGuilds ? guildIds : [] });
      }
      if (path !== "/internal/guilds/lifecycle" && path !== "/internal/discord-channel-context") {
        throw new Error(`Benchmark blocked data request: ${path}`);
      }
      await request.json();
      if (slowMs > 0) await delay(slowMs);
      if (path === "/internal/guilds/lifecycle") {
        counters.lifecycle += 1;
        return Response.json({ status: "applied", guildName: "Fixture Guild" });
      }
      counters.directory += 1;
      return Response.json({ status: "applied" });
    },
    async replay({ countPerShard, rate, channelUpdates = false, signal }) {
      const counts = ids.map((shardIds) => Math.min(shardIds.length, countPerShard));
      const total = counts.reduce((sum, count) => sum + count, 0);
      const start = performance.now();
      let sent = 0;
      for (let index = 0; index < Math.max(...counts); index += 1) {
        signal.throwIfAborted();
        for (let shardId = 0; shardId < SHARDS; shardId += 1) {
          if (index >= counts[shardId]) continue;
          const id = ids[shardId][index];
          const payload = channelUpdates
            ? { id: String(BigInt(id) + 1_000n), guild_id: id, type: 0, name: `updated-${index}` }
            : guildPayload(id, channelCount);
          send(shardId, channelUpdates ? "CHANNEL_UPDATE" : "GUILD_CREATE", payload);
          sent += 1;
        }
        const wait = sent / rate * 1_000 - (performance.now() - start);
        if (wait > 0) await delay(wait, undefined, { signal });
      }
      return { messages: total, milliseconds: performance.now() - start };
    },
    reconnectAll() {
      if (connections.size !== SHARDS) throw new Error("Cannot reconnect an incomplete fixture");
      for (const shardId of connections.keys()) reconnecting.add(shardId);
    },
    close(code = 1000) {
      stopping = true;
      for (const socket of sockets) {
        if (socket.readyState === 1) socket.close(code, "fixture-stop");
      }
    },
  };
}
