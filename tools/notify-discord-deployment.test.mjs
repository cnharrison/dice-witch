import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeploymentNotification,
  sendDiscordDeploymentNotification,
} from "./notify-discord-deployment.mjs";

const SHA = "cdf5b95473c622666d87e9963f3d6509c83e9a75";
const WEBHOOK_URL =
  "https://discord.com/api/webhooks/123456789012345678/test-webhook-token";

function notification(overrides = {}) {
  return buildDeploymentNotification({
    status: "success",
    sha: SHA,
    workers: "web-api",
    repository: "cnharrison/dice-witch",
    serverUrl: "https://github.com",
    runId: "30368026083",
    now: new Date("2026-07-28T14:24:41.000Z"),
    ...overrides,
  });
}

test("builds bounded production deployment messages without Discord mentions", () => {
  const payload = notification();

  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].title, "Production deployment succeeded");
  assert.equal(
    payload.embeds[0].url,
    "https://github.com/cnharrison/dice-witch/actions/runs/30368026083",
  );
  assert.deepEqual(payload.embeds[0].fields, [
    { name: "Workers", value: "web-api", inline: true },
    { name: "Commit", value: "`cdf5b95473c6`", inline: true },
  ]);
  assert.equal(payload.embeds[0].timestamp, "2026-07-28T14:24:41.000Z");

  assert.equal(
    notification({ status: "failure" }).embeds[0].title,
    "Production deployment failed",
  );
  assert.equal(
    notification({ status: "cancelled" }).embeds[0].title,
    "Production deployment cancelled",
  );
});

test("rejects malformed notification inputs and unsafe webhook destinations", async () => {
  for (const [overrides, message] of [
    [{ status: "unknown" }, /status/],
    [{ status: "toString" }, /status/],
    [{ sha: "short" }, /commit SHA/],
    [{ workers: "web-api,unknown" }, /worker selection/],
    [{ repository: "not-a-repository" }, /repository/],
    [{ serverUrl: "http://github.com" }, /GitHub server/],
    [{ runId: "not-a-run" }, /run ID/],
  ]) {
    assert.throws(() => notification(overrides), message);
  }

  for (const url of [
    "https://example.com/api/webhooks/123/token",
    `${WEBHOOK_URL}/github`,
    `${WEBHOOK_URL}?wait=false`,
    "https://discord.com/api/webhooks/not-a-snowflake/token",
  ]) {
    await assert.rejects(
      () => sendDiscordDeploymentNotification(url, notification()),
      /Discord webhook URL/,
    );
  }
});

test("requires Discord to confirm that the deployment message was saved", async () => {
  let request;
  const result = await sendDiscordDeploymentNotification(
    WEBHOOK_URL,
    notification(),
    async (url, init) => {
      request = { url: url.href, init };
      return new Response(
        JSON.stringify({ id: "1531692844000000000", channel_id: "987654321098765432" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  );

  assert.deepEqual(result, {
    messageId: "1531692844000000000",
    channelId: "987654321098765432",
  });
  assert.equal(request.url, `${WEBHOOK_URL}?wait=true`);
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(request.init.body), notification());

  await assert.rejects(
    () =>
      sendDiscordDeploymentNotification(
        WEBHOOK_URL,
        notification(),
        async () => new Response(null, { status: 400 }),
      ),
    /HTTP 400/,
  );
  await assert.rejects(
    () =>
      sendDiscordDeploymentNotification(
        WEBHOOK_URL,
        notification(),
        async () => new Response("{}", { status: 200 }),
      ),
    /confirmed message/,
  );
});
