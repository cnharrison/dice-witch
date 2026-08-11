import type {
  RollInteraction,
  RollLoggingContext,
} from "./roll-interaction";

const DISCORD_EPOCH_MS = 1_420_070_400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type RollDeliveryTelemetryV2 = {
  version: 2;
  handlerStartedAt: number;
  acknowledgementPreparedAt: number;
  acknowledgementType: 4 | 5 | 6;
};

function parseRollDeliveryTelemetry(
  value: unknown,
  receivedAt: number,
  deferredAt: number,
): RollDeliveryTelemetryV2 | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    typeof value.handlerStartedAt !== "number" ||
    !Number.isSafeInteger(value.handlerStartedAt) ||
    value.handlerStartedAt < receivedAt ||
    value.handlerStartedAt > deferredAt ||
    typeof value.acknowledgementPreparedAt !== "number" ||
    !Number.isSafeInteger(value.acknowledgementPreparedAt) ||
    value.acknowledgementPreparedAt < deferredAt ||
    (value.acknowledgementType !== 4 &&
      value.acknowledgementType !== 5 &&
      value.acknowledgementType !== 6)
  ) {
    throw new Error("Roll delivery telemetry is invalid");
  }
  return {
    version: 2,
    handlerStartedAt: value.handlerStartedAt,
    acknowledgementPreparedAt: value.acknowledgementPreparedAt,
    acknowledgementType: value.acknowledgementType,
  };
}

export type RollDeliveryPayload = {
  interaction: {
    id: string;
    applicationId: string;
    token: string;
  };
  request: {
    notation: string;
    repetitions: number;
  };
  message: {
    title: string | null;
    username: string;
  };
  accounting: {
    guildId: string | null;
    userId: string;
    receivedAt: number;
  };
  deferredAt: number;
  rollSeed: number;
  telemetry?: RollDeliveryTelemetryV2;
  settings?:
    | { skipDiceDelay: boolean }
    | { skipDiceDelay: boolean; hideRollResultText: boolean };
  // Present when the acknowledgement already carried the clatter, so the roll
  // reuses this seed instead of drawing its own and the two texts agree.
  renderSeed?: number;
  clatter?: { deliveredAt: number };
  logging: {
    source: "discord";
    channelId: string;
    notation: string;
    context?: RollLoggingContext;
  };
};

export function buildRollDeliveryPayload(
  interaction: RollInteraction,
  deferredAt: number,
  rollSeed: number,
  telemetry: unknown,
  acknowledgedClatter: { renderSeed: number; deliveredAt: number } | null = null,
): RollDeliveryPayload {
  if (
    !Number.isSafeInteger(rollSeed) ||
    rollSeed < 0 ||
    rollSeed > 0xffff_ffff
  ) {
    throw new Error("Roll delivery seed is invalid");
  }
  if (
    acknowledgedClatter !== null &&
    (!Number.isSafeInteger(acknowledgedClatter.renderSeed) ||
      acknowledgedClatter.renderSeed < 0 ||
      acknowledgedClatter.renderSeed > 0xffff_ffff ||
      !Number.isSafeInteger(acknowledgedClatter.deliveredAt) ||
      acknowledgedClatter.deliveredAt <= 0)
  ) {
    throw new Error("Roll delivery clatter acknowledgement is invalid");
  }
  const receivedAt = Number(
    (BigInt(interaction.id) >> 22n) + BigInt(DISCORD_EPOCH_MS),
  );
  const parsedTelemetry = parseRollDeliveryTelemetry(
    telemetry,
    receivedAt,
    deferredAt,
  );
  return {
    interaction: {
      id: interaction.id,
      applicationId: interaction.applicationId,
      token: interaction.token,
    },
    request: {
      notation: interaction.notation,
      repetitions: interaction.repetitions,
    },
    message: {
      title: interaction.title,
      username: interaction.username,
    },
    accounting: {
      guildId: interaction.guildId,
      userId: interaction.userId,
      receivedAt,
    },
    deferredAt,
    rollSeed,
    ...(parsedTelemetry === null ? {} : { telemetry: parsedTelemetry }),
    ...(acknowledgedClatter === null
      ? {}
      : {
          renderSeed: acknowledgedClatter.renderSeed,
          clatter: { deliveredAt: acknowledgedClatter.deliveredAt },
        }),
    logging: {
      source: "discord",
      channelId: interaction.channelId,
      notation: interaction.notation,
      ...(interaction.loggingContext === null
        ? {}
        : { context: interaction.loggingContext }),
    },
  };
}
