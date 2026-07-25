import assert from "node:assert/strict";
import test from "node:test";
import {
  runProductionSmoke,
  runProductionSmokeWithPropagationRetry,
} from "./production-smoke.mjs";

const sha = "a".repeat(40);

function response(url, metadataSha = sha) {
  const pathname = new URL(url).pathname;
  if (pathname === "/") {
    return new Response('<main id="root"></main>', {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (pathname === "/api/meta") {
    return Response.json({
      environment: "production",
      build: { sha: metadataSha, time: "2026-07-25T04:21:05.000Z" },
    });
  }
  if (pathname === "/api/auth/session") {
    return Response.json({ user: null }, { status: 401 });
  }
  if (pathname === "/api/stats/public") {
    return Response.json({ liveGuilds: 23_436, knownDiceWitchUsers: 73_476, shardCount: 23 });
  }
  if (pathname === "/interactions") {
    return Response.json({}, { status: 404 });
  }
  throw new Error(`Unexpected URL ${url}`);
}

test("checks production identity and public boundaries without authenticated side effects", async () => {
  const result = await runProductionSmoke(
    { webOrigin: "https://dicewit.ch", expectedSha: sha },
    (url, init) => {
      if (new URL(url).pathname === "/interactions" && init.method === "POST") {
        return Promise.resolve(Response.json({}, { status: 401 }));
      }
      return Promise.resolve(response(url));
    },
  );
  assert.equal(result.status, "passed");
  assert.deepEqual(result.checks.at(-1), ["interaction POST boundary", 401]);
});

test("rejects alternate production targets and unexpected boundary responses", async () => {
  await assert.rejects(
    runProductionSmoke(
      { webOrigin: "https://example.com", expectedSha: sha },
      () => Promise.resolve(new Response()),
    ),
    /must be https:\/\/dicewit\.ch/,
  );
  await assert.rejects(
    runProductionSmoke(
      { webOrigin: "https://dicewit.ch", expectedSha: sha },
      (url) => Promise.resolve(response(url, "b".repeat(40))),
    ),
    /metadata SHA does not match/,
  );
});

test("retries only bounded metadata propagation mismatches", async () => {
  let metadataRequests = 0;
  let waits = 0;
  const fetchImplementation = (url, init) => {
    if (new URL(url).pathname === "/api/meta") metadataRequests += 1;
    if (new URL(url).pathname === "/interactions" && init.method === "POST") {
      return Promise.resolve(Response.json({}, { status: 401 }));
    }
    return Promise.resolve(response(url, metadataRequests < 2 ? "b".repeat(40) : sha));
  };
  const result = await runProductionSmokeWithPropagationRetry(
    { webOrigin: "https://dicewit.ch", expectedSha: sha },
    fetchImplementation,
    () => {
      waits += 1;
      return Promise.resolve();
    },
  );
  assert.equal(result.status, "passed");
  assert.equal(waits, 1);
});

test("allows the public production route time to converge after deployment", async () => {
  let metadataRequests = 0;
  const fetchImplementation = (url, init) => {
    if (new URL(url).pathname === "/api/meta") metadataRequests += 1;
    if (new URL(url).pathname === "/interactions" && init.method === "POST") {
      return Promise.resolve(Response.json({}, { status: 401 }));
    }
    return Promise.resolve(response(url, metadataRequests < 35 ? "b".repeat(40) : sha));
  };

  const result = await runProductionSmokeWithPropagationRetry(
    { webOrigin: "https://dicewit.ch", expectedSha: sha },
    fetchImplementation,
    () => Promise.resolve(),
  );

  assert.equal(result.status, "passed");
  assert.equal(metadataRequests, 35);
});
