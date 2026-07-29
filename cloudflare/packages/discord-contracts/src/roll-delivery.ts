import type {
  RollInteraction,
  RollLoggingContext,
} from "./roll-interaction";

const DISCORD_EPOCH_MS = 1_420_070_400_000;

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
): RollDeliveryPayload {
  if (
    !Number.isSafeInteger(rollSeed) ||
    rollSeed < 0 ||
    rollSeed > 0xffff_ffff
  ) {
    throw new Error("Roll delivery seed is invalid");
  }
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
      receivedAt: Number(
        (BigInt(interaction.id) >> 22n) + BigInt(DISCORD_EPOCH_MS),
      ),
    },
    deferredAt,
    rollSeed,
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
