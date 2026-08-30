import assert from "node:assert/strict";
import test from "node:test";

import { bakeProductionThumbnails } from "./production-thumbs-bake.mjs";

const sha = "a".repeat(40);
const version = {
  version: 2,
  catalogVersion: 3,
  rendererRevision: "canvaskit-v4-r42",
  cacheRevision: 5,
};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pngResponse() {
  return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

test("bakes the exact production catalog and verifies public PNGs", async () => {
  const requests = [];
  const responses = [
    jsonResponse({ environment: "production", build: { sha, time: "2026-08-30T21:52:11.000Z" } }),
    jsonResponse(version),
    jsonResponse({ ...version, baked: 47, skipped: 0, total: 47 }),
    pngResponse(),
    pngResponse(),
    pngResponse(),
    pngResponse(),
  ];
  const result = await bakeProductionThumbnails(
    { expectedSha: sha, bakeSecret: "bake-secret-canary" },
    async (url, init) => {
      requests.push({ url: String(url), init });
      const response = responses.shift();
      assert.ok(response);
      return response;
    },
  );

  assert.deepEqual(result, {
    status: "passed",
    baked: 47,
    total: 47,
    verifiedPngs: 4,
    version,
  });
  assert.equal(requests[2]?.init?.method, "POST");
  assert.equal(
    new Headers(requests[2]?.init?.headers).get("x-appearance-thumbs-bake-secret"),
    "bake-secret-canary",
  );
  assert.equal(requests[2]?.init?.body, "{}");
  assert.equal(requests.length, 7);
  assert.ok(
    requests.some(({ url }) => url.endsWith("/font/fraunces.png")),
  );
});

test("fails before baking when production is not on the exact SHA", async () => {
  let requests = 0;
  await assert.rejects(
    bakeProductionThumbnails(
      { expectedSha: sha, bakeSecret: "bake-secret-canary" },
      async () => {
        requests += 1;
        return jsonResponse({
          environment: "production",
          build: { sha: "b".repeat(40), time: "2026-08-30T21:52:11.000Z" },
        });
      },
    ),
    /does not match the expected SHA/,
  );
  assert.equal(requests, 1);
});

test("rejects partial, repeated, or malformed bake results", async () => {
  for (const bakeResult of [
    { ...version, baked: 40, skipped: 7, total: 47 },
    { ...version, baked: 46, skipped: 0, total: 47 },
    { ...version, baked: 0, skipped: 0, total: 0 },
  ]) {
    const responses = [
      jsonResponse({ environment: "production", build: { sha, time: "2026-08-30T21:52:11.000Z" } }),
      jsonResponse(version),
      jsonResponse(bakeResult),
    ];
    await assert.rejects(
      bakeProductionThumbnails(
        { expectedSha: sha, bakeSecret: "bake-secret-canary" },
        async () => responses.shift(),
      ),
      /initial production thumbnail bake was incomplete/,
    );
  }
});
