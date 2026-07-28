import { pathToFileURL } from "node:url";

const ALLOWED_WORKERS = new Set([
  "data",
  "discord-rest",
  "roll",
  "gateway",
  "interactions",
  "web-api",
]);
const FULL_SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RUN_ID = /^[0-9]+$/;
const SNOWFLAKE = /^[0-9]{17,20}$/;
const WEBHOOK_PATH = /^\/api\/webhooks\/[0-9]{17,20}\/[A-Za-z0-9._-]+$/;
const MAX_RESPONSE_BYTES = 64 * 1_024;

const STATUS_PRESENTATION = new Map([
  ["success", { label: "succeeded", color: 0x22c55e }],
  ["failure", { label: "failed", color: 0xef4444 }],
  ["cancelled", { label: "cancelled", color: 0xf59e0b }],
]);

function requireWorkerSelection(workers) {
  const selected = workers.split(",");
  if (
    selected.length === 0 ||
    !selected.includes("web-api") ||
    new Set(selected).size !== selected.length ||
    selected.some((worker) => !ALLOWED_WORKERS.has(worker))
  ) {
    throw new Error("Invalid production worker selection");
  }
}

function requireDiscordWebhookUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Discord webhook URL is invalid");
  }
  if (
    url.origin !== "https://discord.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !WEBHOOK_PATH.test(url.pathname)
  ) {
    throw new Error("Discord webhook URL must be a native discord.com webhook endpoint");
  }
  return url;
}

export function buildDeploymentNotification({
  status,
  sha,
  workers,
  repository,
  serverUrl,
  runId,
  now = new Date(),
}) {
  const presentation = STATUS_PRESENTATION.get(status);
  if (!presentation) throw new Error("Invalid production deployment status");
  if (!FULL_SHA.test(sha)) throw new Error("Invalid production commit SHA");
  requireWorkerSelection(workers);
  if (!REPOSITORY.test(repository)) throw new Error("Invalid GitHub repository");
  if (serverUrl !== "https://github.com") throw new Error("Invalid GitHub server URL");
  if (!RUN_ID.test(runId)) throw new Error("Invalid GitHub Actions run ID");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Invalid notification timestamp");
  }

  const runUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
  return {
    username: "Dice Witch Deployments",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `Production deployment ${presentation.label}`,
        url: runUrl,
        color: presentation.color,
        fields: [
          { name: "Workers", value: workers, inline: true },
          { name: "Commit", value: `\`${sha.slice(0, 12)}\``, inline: true },
        ],
        footer: { text: repository },
        timestamp: now.toISOString(),
      },
    ],
  };
}

export async function sendDiscordDeploymentNotification(
  webhookUrl,
  payload,
  fetchImpl = fetch,
) {
  const url = requireDiscordWebhookUrl(webhookUrl);
  url.searchParams.set("wait", "true");

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) {
    throw new Error(`Discord webhook returned HTTP ${response.status}`);
  }

  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    throw new Error("Discord webhook response exceeded the size limit");
  }

  let message;
  try {
    message = JSON.parse(text);
  } catch {
    throw new Error("Discord webhook did not return a confirmed message");
  }
  if (!SNOWFLAKE.test(message?.id) || !SNOWFLAKE.test(message?.channel_id)) {
    throw new Error("Discord webhook did not return a confirmed message");
  }
  return { messageId: message.id, channelId: message.channel_id };
}

function requiredEnvironmentValue(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const payload = buildDeploymentNotification({
    status: requiredEnvironmentValue("DEPLOYMENT_STATUS"),
    sha: requiredEnvironmentValue("REQUESTED_SHA"),
    workers: requiredEnvironmentValue("SELECTED_WORKERS"),
    repository: requiredEnvironmentValue("GITHUB_REPOSITORY"),
    serverUrl: requiredEnvironmentValue("GITHUB_SERVER_URL"),
    runId: requiredEnvironmentValue("GITHUB_RUN_ID"),
  });
  await sendDiscordDeploymentNotification(
    requiredEnvironmentValue("DISCORD_DEPLOY_WEBHOOK_URL"),
    payload,
  );
  console.log("Confirmed Discord production deployment notification");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Discord notification failed");
    process.exitCode = 1;
  });
}
