import assert from "node:assert/strict";
import test from "node:test";
import { runStagingSmoke } from "./staging-smoke.mjs";

const expectedSha = "a".repeat(40);
const targets = {
  webOrigin: "https://web.example.com",
  rollOrigin: "https://roll.example.com",
  gatewayOrigin: "https://gateway.example.com",
  expectedSha,
};

function responseFor(url) {
  const { origin, pathname } = new URL(url);
  if (origin === targets.webOrigin && pathname === "/") {
    return new Response('<html><div id="root"></div></html>', {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (origin === targets.webOrigin && pathname === "/api/meta") {
    return Response.json({
      environment: "staging",
      build: { sha: expectedSha, time: "2026-07-15T12:00:00.000Z" },
    });
  }
  if (origin === targets.webOrigin && pathname === "/api/auth/session") {
    return Response.json({ user: null }, { status: 401 });
  }
  if (origin === targets.webOrigin && pathname === "/interactions") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (origin === targets.rollOrigin && pathname === "/health") {
    return Response.json({
      ok: true,
      service: "dice-witch-roll",
      renderVersion: 4,
    });
  }
  if (origin === targets.gatewayOrigin && pathname === "/health") {
    return Response.json({ ok: true, service: "dice-witch-gateway-staging" });
  }
  return Response.json({ error: "unexpected request" }, { status: 500 });
}

test("checks the public staging surface without authentication", async () => {
  const requests = [];
  const result = await runStagingSmoke(targets, async (url, init) => {
    requests.push({ url, method: init?.method ?? "GET" });
    return responseFor(url);
  });

  assert.equal(result.status, "passed");
  assert.equal(result.checks.length, 6);
  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      "https://web.example.com/",
      "https://web.example.com/api/meta",
      "https://web.example.com/api/auth/session",
      "https://web.example.com/interactions",
      "https://roll.example.com/health",
      "https://gateway.example.com/health",
    ],
  );
});

test("fails when static assets are not healthy", async () => {
  await assert.rejects(
    runStagingSmoke(targets, async (url) => {
      if (url === "https://web.example.com/") {
        return new Response("broken", { status: 502 });
      }
      return responseFor(url);
    }),
    /web root expected HTTP 200, received 502/,
  );
});

test("rejects a staging Roll Worker that is not emitting V4", async () => {
  await assert.rejects(
    runStagingSmoke(targets, async (url) => {
      if (url === "https://roll.example.com/health") {
        return Response.json({
          ok: true,
          service: "dice-witch-roll",
          renderVersion: 3,
        });
      }
      return responseFor(url);
    }),
    /roll health response is invalid/,
  );
});

test("rejects a different deployed SHA", async () => {
  await assert.rejects(
    runStagingSmoke(targets, async (url) => {
      if (url.endsWith("/api/meta")) {
        return Response.json({
          environment: "staging",
          build: { sha: "b".repeat(40), time: "2026-07-15T12:00:00.000Z" },
        });
      }
      return responseFor(url);
    }),
    /metadata SHA does not match the expected source SHA/,
  );
});

test("rejects an authenticated anonymous-session response", async () => {
  await assert.rejects(
    runStagingSmoke(targets, async (url) => {
      if (url.endsWith("/api/auth/session")) {
        return Response.json({ user: { id: "unexpected" } });
      }
      return responseFor(url);
    }),
    /anonymous session expected HTTP 401, received 200/,
  );
});
