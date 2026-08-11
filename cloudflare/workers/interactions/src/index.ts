import { readWorkerSecret, type WorkerSecretSource } from "../../../packages/worker-secrets/src";
import {
  buildDiscordChannelDirectoryUpsertV1,
  buildEditOriginalResponse,
  buildInvalidRollHelpMessage,
  buildKnowledgeBaseResponse,
  buildRollClatterMessage,
  buildRollDeliveryPayload,
  buildStaticCommandResponse,
  buildStatusCommandResponse,
  buildStatusUnavailableResponse,
  DISCORD_COMPONENTS_V2_FLAG,
  parseKnowledgeBaseInteraction,
  parseRollHelperDmInteraction,
  parseRollInteraction,
  parseSaveRollInteraction,
  parseSavedRollInteraction,
  rollInteractionContextMissingReasons,
  parseStaticInteractionCommand,
  parseStatusCommandInteraction,
  parseTextResultInteraction,
  verifyDiscordRequestSignature,
  type RollDeliveryTelemetryV2,
  type RollHelperDmInteraction,
  type RollLoggingContext,
  type StatusGatewaySnapshot,
} from "../../../packages/discord-contracts/src";
import {
  executeRoll,
  parseNotationArgs,
} from "../../../packages/roll-domain/src";
import { handleSavedRollInteraction } from "./saved-roll-handler";
import {
  completeSaveRollSubmit,
  openSaveRollModal,
} from "./save-roll-handler";
import { handleTextResultInteraction } from "./text-result-handler";

export type InteractionEnv = {
  DISCORD_APPLICATION_ID: string;
  DISCORD_PUBLIC_KEY: WorkerSecretSource;
  DISCORD_TEST_GUILD_ID?: string;
  INVITE_LINK: string;
  SUPPORT_SERVER_LINK: string;
  WEB_APP_URL: string;
  ROLL_LIFECYCLE_TELEMETRY_VERSION: string;
  DATA_SERVICE: Fetcher;
  GATEWAY_STATUS: {
    getStatusSnapshot(): Promise<unknown>;
  };
  DISCORD_REST: {
    sendRollHelper(value: unknown): Promise<unknown>;
  };
  ROLL_WORK: DurableObjectNamespace;
  WEB_DELIVERY_WORK: DurableObjectNamespace;
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

// Deployed Workers clocks advance only after I/O, so these spans do not
// claim to measure CPU-only work.
function elapsedMs(startedAt: number, completedAt = Date.now()): number {
  return Math.max(0, completedAt - startedAt);
}

function invalidInteraction(reason: string): Response {
  console.warn(
    JSON.stringify({ level: "warn", message: "Invalid interaction", reason }),
  );
  return json({ error: "Invalid interaction" }, 400);
}

function componentsV2TextMessage(content: string, color = 0xe7_4c_3c) {
  return {
    flags: DISCORD_COMPONENTS_V2_FLAG,
    components: [
      {
        type: 17 as const,
        accent_color: color,
        components: [{ type: 10 as const, content }],
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

function interactionError(content: string): Response {
  return json({
    type: 4,
    data: {
      ...componentsV2TextMessage(content),
      flags: DISCORD_COMPONENTS_V2_FLAG | 64,
    },
  });
}

function randomSeed(): number {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (seed === undefined) throw new Error("Roll seed generation failed");
  return seed;
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

async function deliverRequestedRollHelper(
  interaction: RollHelperDmInteraction,
  service: InteractionEnv["DISCORD_REST"],
): Promise<void> {
  let content = "I couldn't send a DM. Use `/knowledgebase` here instead.";
  try {
    const result = await service.sendRollHelper({
      rollId: interaction.rollId,
      userId: interaction.userId,
    });
    if (isRecord(result) && result.status === "delivered") {
      content = "🧠 Knowledge base sent to your DMs";
    }
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Requested roll helper DM failed",
      }),
    );
  }
  try {
    const response = await fetch(
      buildEditOriginalResponse(
        interaction,
        componentsV2TextMessage(content, 0x1e_90_ff),
      ),
    );
    if (!response.ok) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Roll helper DM confirmation failed",
          httpStatus: response.status,
        }),
      );
    }
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Roll helper DM confirmation failed",
      }),
    );
  }
}

// Resolve settings in the long-lived Interaction Worker to avoid adding a
// cross-Worker cold start to each new Roll object. If this lookup is unavailable,
// Roll must resolve the authoritative settings before delivery.
type GuildDeliverySettings = {
  skipDiceDelay: boolean;
  hideRollResultText: boolean;
};

async function resolveGuildDeliverySettings(
  dataService: Fetcher,
  guildId: string | null,
): Promise<GuildDeliverySettings | null> {
  if (guildId === null) return null;
  try {
    const response = await dataService.fetch(
      new Request("https://data.internal/internal/guilds/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guildId, version: 2 }),
      }),
    );
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (
      !isRecord(value) ||
      value.status !== "found" ||
      !isRecord(value.settings) ||
      typeof value.settings.skipDiceDelay !== "boolean" ||
      typeof value.settings.hideRollResultText !== "boolean"
    ) {
      return null;
    }
    return {
      skipDiceDelay: value.settings.skipDiceDelay,
      hideRollResultText: value.settings.hideRollResultText,
    };
  } catch {
    return null;
  }
}

async function acceptDeferredRoll(
  stub: RollWorkAcceptanceStub,
  payload: ReturnType<typeof buildRollDeliveryPayload>,
  roll: DeferredRoll,
  dataService: Fetcher,
): Promise<void> {
  const settings = await resolveGuildDeliverySettings(
    dataService,
    payload.accounting.guildId,
  );
  const acceptanceStartedAt = Date.now();
  try {
    const accepted = await stub.acceptDelivery(
      settings === null ? payload : { ...payload, settings },
    );
    const acceptanceCompletedAt = Date.now();
    if (isAcceptedRollDelivery(accepted)) {
      const acknowledgementPreparedAt =
        payload.telemetry?.acknowledgementPreparedAt;
      try {
        console.info({
          telemetryVersion: 2,
          level: "info",
          message: "Discord roll lifecycle advanced",
          interactionId: roll.id,
          stage: "accepted",
          status: (accepted as { status: string }).status,
          timingClock: "workers-io",
          acceptanceRpcMs: elapsedMs(
            acceptanceStartedAt,
            acceptanceCompletedAt,
          ),
          acknowledgementToAcceptanceStartMs:
            acknowledgementPreparedAt === undefined
              ? null
              : elapsedMs(acknowledgementPreparedAt, acceptanceStartedAt),
          acknowledgementToAcceptanceCompleteMs:
            acknowledgementPreparedAt === undefined
              ? null
              : elapsedMs(acknowledgementPreparedAt, acceptanceCompletedAt),
        });
      } catch {
        // Observability must not turn durable acceptance into a failure.
      }
      return;
    }
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
      buildEditOriginalResponse(
        roll,
        componentsV2TextMessage(
          "This roll could not be accepted. Please try again.",
        ),
      ),
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

function cacheInteractionDisplayContext(
  context: RollLoggingContext | null,
  observedAt: number,
  dataService: Fetcher,
  ctx?: ExecutionContext,
): void {
  if (ctx === undefined) return;
  const warn = () => {
    console.warn(JSON.stringify({
      level: "warn",
      message: "Signed roll interaction context cache write failed",
    }));
  };
  try {
    const mutation = buildDiscordChannelDirectoryUpsertV1(
      context,
      "interaction",
      observedAt,
    );
    if (mutation === null) return;
    ctx.waitUntil(
      dataService.fetch(
        new Request("https://data.internal/internal/discord-channel-context", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mutation),
        }),
      ).then((response) => {
        if (!response.ok) {
          throw new Error("Discord channel context cache write failed");
        }
      }).catch(warn),
    );
  } catch {
    warn();
  }
}

function warnIncompleteDisplayContext(
  interaction: Record<string, unknown>,
  guildId: string | null,
  commandName: "library" | "roll",
): void {
  const reasons = rollInteractionContextMissingReasons(interaction, guildId);
  if (reasons.length === 0) return;
  console.warn(
    JSON.stringify({
      level: "warn",
      message: "Signed roll interaction display context is incomplete",
      scope: "guild",
      reasons,
      commandName,
    }),
  );
}

export async function handleInteractionRequest(
  request: Request,
  env: InteractionEnv,
  ctx?: ExecutionContext,
): Promise<Response> {
  const handlerStartedAt = Date.now();
  if (
    env.ROLL_LIFECYCLE_TELEMETRY_VERSION !== "1" &&
    env.ROLL_LIFECYCLE_TELEMETRY_VERSION !== "2"
  ) {
    throw new Error("Roll lifecycle telemetry version is invalid");
  }
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
  let requestedRollHelper;
  try {
    requestedRollHelper = parseRollHelperDmInteraction(
      interaction,
      env.DISCORD_APPLICATION_ID,
      env.DISCORD_TEST_GUILD_ID,
    );
  } catch (error) {
    return invalidInteraction(
      error instanceof Error ? error.message : "roll-helper-parse-failed",
    );
  }
  if (requestedRollHelper !== null) {
    const delivery = deliverRequestedRollHelper(
      requestedRollHelper,
      env.DISCORD_REST,
    );
    if (ctx === undefined) await delivery;
    else ctx.waitUntil(delivery);
    return json({ type: 6 });
  }
  const textResult = parseTextResultInteraction(interaction, {
    applicationId: env.DISCORD_APPLICATION_ID,
  });
  if (textResult !== null) {
    return json(await handleTextResultInteraction(textResult, env));
  }

  const saveRoll = parseSaveRollInteraction(interaction, {
    applicationId: env.DISCORD_APPLICATION_ID,
  });
  if (saveRoll !== null) {
    if (saveRoll.kind === "open") {
      return json(await openSaveRollModal(saveRoll, env));
    }
    const completion = completeSaveRollSubmit(saveRoll, env);
    if (ctx === undefined) await completion;
    else ctx.waitUntil(completion);
    return json({ type: 5, data: { flags: 64 } });
  }

  let savedRoll;
  try {
    savedRoll = parseSavedRollInteraction(interaction, {
      applicationId: env.DISCORD_APPLICATION_ID,
      ...(env.DISCORD_TEST_GUILD_ID === undefined
        ? {}
        : { guildId: env.DISCORD_TEST_GUILD_ID }),
    });
  } catch (error) {
    return invalidInteraction(
      error instanceof Error ? error.message : "saved-roll-parse-failed",
    );
  }
  if (savedRoll !== null) {
    warnIncompleteDisplayContext(interaction, savedRoll.guildId, "library");
    cacheInteractionDisplayContext(
      savedRoll.loggingContext,
      Date.now(),
      env.DATA_SERVICE,
      ctx,
    );
    console.info(
      JSON.stringify({
        telemetryVersion: 1,
        level: "info",
        message: "Discord roll lifecycle advanced",
        interactionId: savedRoll.id,
        stage: "received",
        commandName: "library",
      }),
    );
    return json(await handleSavedRollInteraction(savedRoll, env, ctx));
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
  warnIncompleteDisplayContext(interaction, roll.guildId, "roll");
  console.info(
    JSON.stringify({
      telemetryVersion: 1,
      level: "info",
      message: "Discord roll lifecycle advanced",
      interactionId: roll.id,
      stage: "received",
    }),
  );
  const stub = env.ROLL_WORK.getByName(
    roll.id,
  ) as unknown as RollWorkAcceptanceStub;
  const deferredAt = Date.now();
  cacheInteractionDisplayContext(
    roll.loggingContext,
    deferredAt,
    env.DATA_SERVICE,
    ctx,
  );
  let payload: ReturnType<typeof buildRollDeliveryPayload>;
  let acknowledgement: Record<string, unknown>;
  let acknowledgementTelemetry: RollDeliveryTelemetryV2;
  try {
    const rollSeed = randomSeed();
    const outcome = executeRoll({
      notation: parseNotationArgs(roll.notation),
      repetitions: roll.repetitions,
      seed: rollSeed,
      stableAppearanceIdentities: true,
      preserveOutOfRangePhysicalFaces: true,
    });
    // Discord discards the interaction after three seconds, so preparing the
    // acknowledgement must stay pure computation. Anything that waits on
    // another service belongs after the response, never before it.
    const acknowledgementType = 4;
    let clatterRenderSeed: number | null = null;
    if (outcome.outcomes.length === 0) {
      const invalidRoll = buildInvalidRollHelpMessage(outcome, roll.id);
      acknowledgement = {
        type: acknowledgementType,
        data: {
          ...invalidRoll,
          flags: invalidRoll.flags | 64,
          allowed_mentions: { parse: [] },
        },
      };
    } else {
      // The roll's Durable Object is created fresh per interaction and takes
      // about 700ms to dispatch, so a clatter posted from there lands long
      // after the acknowledgement that can carry it now.
      clatterRenderSeed = randomSeed();
      acknowledgement = {
        type: acknowledgementType,
        data: {
          ...buildRollClatterMessage(outcome, clatterRenderSeed),
          allowed_mentions: { parse: [] },
        },
      };
    }
    acknowledgementTelemetry = {
      version: 2,
      handlerStartedAt,
      acknowledgementPreparedAt: Date.now(),
      acknowledgementType,
    };
    payload = buildRollDeliveryPayload(
      roll,
      deferredAt,
      rollSeed,
      env.ROLL_LIFECYCLE_TELEMETRY_VERSION === "2"
        ? acknowledgementTelemetry
        : null,
      // The clatter reaches Discord with the acknowledgement, so both share one
      // timestamp and the recorded span between them stays truthful at zero.
      clatterRenderSeed === null
        ? null
        : {
            renderSeed: clatterRenderSeed,
            deliveredAt: acknowledgementTelemetry.acknowledgementPreparedAt,
          },
    );
  } catch {
    return interactionError("This roll could not be accepted. Please try again.");
  }
  console.info({
    telemetryVersion: 2,
    level: "info",
    message: "Discord roll lifecycle advanced",
    interactionId: roll.id,
    stage: "acknowledgement-prepared",
    interactionCreatedAt: payload.accounting.receivedAt,
    handlerStartedAt: acknowledgementTelemetry.handlerStartedAt,
    acknowledgementPreparedAt:
      acknowledgementTelemetry.acknowledgementPreparedAt,
    acknowledgementType: acknowledgementTelemetry.acknowledgementType,
    acknowledgementPreparationExceeded3Seconds:
      acknowledgementTelemetry.acknowledgementPreparedAt -
        payload.accounting.receivedAt >= 3_000,
  });
  if (ctx !== undefined) {
    ctx.waitUntil(acceptDeferredRoll(stub, payload, roll, env.DATA_SERVICE));
    return json(acknowledgement);
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
  return json(acknowledgement);
}

export default {
  fetch(request, env, ctx): Promise<Response> {
    return handleInteractionRequest(request, env, ctx);
  },
} satisfies ExportedHandler<InteractionEnv>;
