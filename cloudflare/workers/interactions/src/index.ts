import { readWorkerSecret, type WorkerSecretSource } from "../../../packages/worker-secrets/src";
import {
  buildEditOriginalResponse,
  buildKnowledgeBaseResponse,
  buildRollDeliveryPayload,
  buildStaticCommandResponse,
  buildStatusCommandResponse,
  buildStatusUnavailableResponse,
  parseKnowledgeBaseInteraction,
  parseRollInteraction,
  parseStaticInteractionCommand,
  parseStatusCommandInteraction,
  verifyDiscordRequestSignature,
  type StatusGatewaySnapshot,
} from "../../../packages/discord-contracts/src";

export type InteractionEnv = {
  DISCORD_APPLICATION_ID: string;
  DISCORD_PUBLIC_KEY: WorkerSecretSource;
  DISCORD_TEST_GUILD_ID?: string;
  INVITE_LINK: string;
  SUPPORT_SERVER_LINK: string;
  WEB_APP_URL: string;
  DATA_SERVICE: Fetcher;
  GATEWAY_STATUS: {
    getStatusSnapshot(): Promise<unknown>;
  };
  ROLL_WORK: DurableObjectNamespace;
};

const RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: RESPONSE_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInteraction(reason: string): Response {
  console.warn(
    JSON.stringify({ level: "warn", message: "Invalid interaction", reason }),
  );
  return json({ error: "Invalid interaction" }, 400);
}

function interactionError(content: string): Response {
  return json({
    type: 4,
    data: {
      content,
      flags: 64,
      allowed_mentions: { parse: [] },
    },
  });
}

type RollWorkAcceptanceStub = {
  acceptDelivery(value: unknown): Promise<unknown>;
};

type DeferredRoll = {
  id: string;
  applicationId: string;
  token: string;
};

function isAcceptedRollDelivery(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.status === "created" || value.status === "existing") &&
    (value.delivery === "pending" || value.delivery === "delivered")
  );
}

async function acceptDeferredRoll(
  stub: RollWorkAcceptanceStub,
  payload: unknown,
  roll: DeferredRoll,
): Promise<void> {
  try {
    const accepted = await stub.acceptDelivery(payload);
    if (isAcceptedRollDelivery(accepted)) return;
  } catch {
    // The deferred response still needs an explicit terminal error.
  }
  console.error(
    JSON.stringify({
      level: "error",
      message: "Deferred roll acceptance failed",
    }),
  );
  try {
    const response = await fetch(
      buildEditOriginalResponse(roll, {
        content: "This roll could not be accepted. Please try again.",
      }),
    );
    if (!response.ok) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Deferred roll error delivery failed",
          httpStatus: response.status,
        }),
      );
    }
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Deferred roll error delivery failed",
      }),
    );
  }
}

export async function handleInteractionRequest(
  request: Request,
  env: InteractionEnv,
  ctx?: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/interactions") {
    return json({ error: "Not found" }, 404);
  }
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (signature === null || timestamp === null) {
    return json({ error: "Unauthorized" }, 401);
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (
    !(await verifyDiscordRequestSignature({
      publicKey: await readWorkerSecret(
        env.DISCORD_PUBLIC_KEY,
        "DISCORD_PUBLIC_KEY",
      ),
      signature,
      timestamp,
      body,
    }))
  ) {
    return json({ error: "Unauthorized" }, 401);
  }
  let interaction: unknown;
  try {
    interaction = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return invalidInteraction("invalid-json");
  }
  if (!isRecord(interaction)) {
    return invalidInteraction("invalid-payload");
  }
  if (interaction.type === 1) return json({ type: 1 });
  if (interaction.application_id !== env.DISCORD_APPLICATION_ID) {
    return invalidInteraction("application-mismatch");
  }
  let roll;
  try {
    roll = parseRollInteraction(interaction, {
      applicationId: env.DISCORD_APPLICATION_ID,
      ...(env.DISCORD_TEST_GUILD_ID === undefined
        ? {}
        : { guildId: env.DISCORD_TEST_GUILD_ID }),
    });
  } catch (error) {
    return invalidInteraction(
      error instanceof Error ? error.message : "roll-parse-failed",
    );
  }
  if (roll === null) {
    let knowledgebase;
    try {
      knowledgebase = parseKnowledgeBaseInteraction(
        interaction,
        env.DISCORD_APPLICATION_ID,
        env.DISCORD_TEST_GUILD_ID,
      );
    } catch (error) {
      return invalidInteraction(
        error instanceof Error ? error.message : "knowledgebase-parse-failed",
      );
    }
    const links = {
      inviteUrl: env.INVITE_LINK,
      supportUrl: env.SUPPORT_SERVER_LINK,
    };
    if (knowledgebase !== null) {
      return json(buildKnowledgeBaseResponse(knowledgebase.topic, links));
    }
    let staticCommand;
    try {
      staticCommand = parseStaticInteractionCommand(
        interaction,
        env.DISCORD_APPLICATION_ID,
        env.DISCORD_TEST_GUILD_ID,
      );
    } catch (error) {
      return invalidInteraction(
        error instanceof Error ? error.message : "static-parse-failed",
      );
    }
    if (staticCommand !== null) {
      return json(
        buildStaticCommandResponse(staticCommand, links, env.WEB_APP_URL),
      );
    }
    let statusInteraction;
    try {
      statusInteraction = parseStatusCommandInteraction(
        interaction,
        env.DISCORD_APPLICATION_ID,
        env.DISCORD_TEST_GUILD_ID,
      );
    } catch (error) {
      return invalidInteraction(
        error instanceof Error ? error.message : "status-parse-failed",
      );
    }
    if (statusInteraction === null) {
      return interactionError("This command is not available yet.");
    }
    try {
      const gateway = await env.GATEWAY_STATUS.getStatusSnapshot();
      if (!isRecord(gateway) || typeof gateway.shardCount !== "number") {
        throw new Error("Gateway status response is invalid");
      }
      const statsResponse = await env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/audience-snapshot"),
      );
      if (!statsResponse.ok) throw new Error("Status stats lookup failed");
      const stats: unknown = await statsResponse.json();
      if (
        !isRecord(stats) ||
        stats.status !== "found" ||
        !isRecord(stats.snapshot)
      ) {
        throw new Error("Status stats response is invalid");
      }
      return json(
        buildStatusCommandResponse(
          statusInteraction,
          gateway as unknown as StatusGatewaySnapshot,
          stats.snapshot,
          links,
        ),
      );
    } catch {
      return json(buildStatusUnavailableResponse(links));
    }
  }
  if (roll.loggingContext === null) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "Signed roll interaction context is unavailable",
        scope: roll.guildId === null ? "dm" : "guild",
      }),
    );
  }
  const stub = env.ROLL_WORK.getByName(
    roll.id,
  ) as unknown as RollWorkAcceptanceStub;
  const payload = buildRollDeliveryPayload(roll);
  if (ctx !== undefined) {
    ctx.waitUntil(acceptDeferredRoll(stub, payload, roll));
    return json({ type: 5 });
  }
  let accepted: unknown;
  try {
    accepted = await stub.acceptDelivery(payload);
  } catch {
    return interactionError("This roll could not be accepted. Please try again.");
  }
  if (!isAcceptedRollDelivery(accepted)) {
    return interactionError("This roll could not be accepted. Please try again.");
  }
  return json({ type: 5 });
}

export default {
  fetch(request, env, ctx): Promise<Response> {
    return handleInteractionRequest(request, env, ctx);
  },
} satisfies ExportedHandler<InteractionEnv>;
