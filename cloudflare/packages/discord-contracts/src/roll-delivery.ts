import { z } from "zod";
import {
  safeIntegerSchema,
  type SchemaInput,
  seedSchema,
  strictObjectSchema,
} from "./schema-primitives";
import type { RollInteraction, RollLoggingContext } from "./roll-interaction";

const DISCORD_EPOCH_MS = 1_420_070_400_000;

const RollDeliveryTelemetryV2Schema = strictObjectSchema({
  version: z.literal(2),
  handlerStartedAt: safeIntegerSchema,
  acknowledgementPreparedAt: safeIntegerSchema,
  acknowledgementType: z.union([z.literal(4), z.literal(5), z.literal(6)]),
});
export type RollDeliveryTelemetryV2 = z.infer<
  typeof RollDeliveryTelemetryV2Schema
>;
const NullableRollDeliveryTelemetryV2Schema = z.nullable(
  RollDeliveryTelemetryV2Schema,
);

const AcknowledgedClatterSchema = strictObjectSchema({
  renderSeed: seedSchema,
  deliveredAt: safeIntegerSchema.positive(),
});
const NullableAcknowledgedClatterSchema = z.nullable(
  AcknowledgedClatterSchema,
);
type AcknowledgedClatter = z.infer<typeof AcknowledgedClatterSchema>;

function parseRollDeliveryTelemetry(
  value: SchemaInput,
  receivedAt: number,
  deferredAt: number,
): RollDeliveryTelemetryV2 | null {
  const result = NullableRollDeliveryTelemetryV2Schema.safeParse(value);
  if (!result.success) {
    throw new Error("Roll delivery telemetry is invalid");
  }
  if (result.data === null) return null;
  if (
    result.data.handlerStartedAt < receivedAt ||
    result.data.handlerStartedAt > deferredAt ||
    result.data.acknowledgementPreparedAt < deferredAt
  ) {
    throw new Error("Roll delivery telemetry is invalid");
  }
  return result.data;
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

type RollDeliveryFields = Omit<RollDeliveryPayload, "logging">;

export function buildRollDeliveryPayload(
  interaction: RollInteraction,
  deferredAt: number,
  rollSeed: number,
  telemetry: SchemaInput,
  acknowledgedClatter: AcknowledgedClatter | null = null,
): RollDeliveryPayload {
  if (!seedSchema.safeParse(rollSeed).success) {
    throw new Error("Roll delivery seed is invalid");
  }
  const parsedClatter = NullableAcknowledgedClatterSchema.safeParse(
    acknowledgedClatter,
  );
  if (!parsedClatter.success) {
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
  const fields: RollDeliveryFields = {
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
  };
  if (parsedTelemetry !== null) fields.telemetry = parsedTelemetry;
  if (parsedClatter.data !== null) {
    fields.renderSeed = parsedClatter.data.renderSeed;
    fields.clatter = { deliveredAt: parsedClatter.data.deliveredAt };
  }
  const logging: RollDeliveryPayload["logging"] = {
    source: "discord",
    channelId: interaction.channelId,
    notation: interaction.notation,
  };
  if (interaction.loggingContext !== null) {
    logging.context = interaction.loggingContext;
  }
  return { ...fields, logging };
}
