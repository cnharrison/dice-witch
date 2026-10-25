import assert from "node:assert/strict";
import { z } from "zod";

const LogEvent = z.object({
  timestamp: z.number(),
  source: z.object({ message: z.string().optional() }).optional(),
  $metadata: z.object({ message: z.string().optional(), level: z.string().optional() }),
  $workers: z.object({
    scriptName: z.string(), durableObjectId: z.string().optional(), truncated: z.boolean().optional(), outcome: z.string().optional(),
    event: z.object({ request: z.object({ url: z.string() }).optional() }).optional(),
  }),
});

export function stagingErrorEvidence(result, names) {
  const parsed = z.object({ events: z.object({ events: z.array(LogEvent), count: z.number() }) }).parse(result);
  // Refuse incomplete evidence instead of silently dropping events at the API page boundary.
  assert(parsed.events.events.length < 1_000 && parsed.events.count === parsed.events.events.length, "Persisted error query was truncated");
  const events = parsed.events.events.map((event) => {
    assert(names.includes(event.$workers.scriptName), "Unexpected Worker in log evidence");
    assert(!event.$workers.truncated, "Persisted error event was truncated");
    const url = event.$workers.event?.request?.url;
    const intentionalAbort = event.$workers.outcome === "exception" && url !== undefined && new URL(url).pathname === "/restart";
    return { timestamp: event.timestamp, worker: event.$workers.scriptName, objectId: event.$workers.durableObjectId, outcome: event.$workers.outcome, intentionalAbort, message: event.source?.message ?? event.$metadata.message ?? "Unspecified error" };
  });
  return { events, unexpected: events.filter(({ message, intentionalAbort, outcome }) => !intentionalAbort && !(message === "Benchmark persisted restart" && (outcome === undefined || outcome === "exception"))) };
}

export async function collectStagingErrors(accountId, token, names, startedAt) {
  const checkedAt = Date.now();
  // Resource outcomes need not have an error-level console message.
  const selectors = [
    { key: "$metadata.level", operation: "eq", type: "string", value: "error" },
    { key: "$workers.outcome", operation: "in", type: "string", value: "exceededCpu,exceededMemory,internalError,unknown,killSwitch,daemonDown,loadShed,scriptNotFound,exceededWallTime" },
  ];
  const results = await Promise.all(selectors.map(async (selector, index) => {
    const query = {
      queryId: `dice-witch-consolidation-errors-${index}`, dry: true, view: "events", limit: 1_000,
      timeframe: { from: startedAt, to: checkedAt },
      parameters: { datasets: ["cloudflare-workers"], filters: [
        { key: "$workers.scriptName", operation: "in", type: "string", value: names.join(",") },
        selector,
      ] },
    };
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(query), signal: AbortSignal.timeout(30_000), redirect: "error",
    });
    assert(response.ok, "Persisted Worker logs unavailable");
    const body = await response.json();
    assert.equal(body.success, true, "Persisted Worker log query failed");
    return stagingErrorEvidence(body.result, names);
  }));
  return { checkedAt, events: results.flatMap(({ events }) => events), unexpected: results.flatMap(({ unexpected }) => unexpected) };
}
