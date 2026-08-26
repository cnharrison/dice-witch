import { z } from "zod";
import {
  parseDiscordChannelContextRequestV1,
  parseDiscordChannelContextResponseV1,
  type DiscordChannelContextRequestV1,
  type DiscordChannelContextResultV1,
} from "./discord-channel-context";
import {
  boundedNameSchema,
  exactEnumSchema,
  positiveSafeIntegerSchema,
  type SchemaInput,
  snowflakeSchema,
  strictObjectSchema,
  timestampSchema,
} from "./schema-primitives";

const DETECTION_ID = /^[1-9][0-9]{16,19}:[a-f0-9]{16}$/u;
const GAME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const GameIdSchema = z.string().max(100).regex(GAME_ID);
const NullableGameIdSchema = z.nullable(GameIdSchema);
const NullableNameSchema = z.nullable(boundedNameSchema(1, 100));
const GameDetectionAnnouncementV1Schema = strictObjectSchema({
  version: z.literal(1),
  detectionId: z.string().regex(DETECTION_ID),
  sessionId: snowflakeSchema,
  previousGameId: NullableGameIdSchema,
  gameId: GameIdSchema,
  gameName: boundedNameSchema(1, 100),
  confidence: exactEnumSchema(["plausible", "strong", "distinctive"]),
  detectedAt: timestampSchema,
  scope: exactEnumSchema(["guild", "dm"]),
  guildId: z.nullable(snowflakeSchema),
  channelId: snowflakeSchema,
  guildName: NullableNameSchema,
  channelName: NullableNameSchema,
  rollCount: positiveSafeIntegerSchema,
  sessionStartedAt: timestampSchema,
  sessionLastRollAt: timestampSchema,
}).superRefine((announcement, context) => {
  if (!announcement.detectionId.startsWith(`${announcement.sessionId}:`)) {
    context.addIssue({ code: "custom", message: "Detection session mismatch" });
  }
  if (
    (announcement.scope === "guild" && announcement.guildId === null) ||
    (announcement.scope === "dm" && announcement.guildId !== null)
  ) {
    context.addIssue({ code: "custom", message: "Scope identity mismatch" });
  }
  if (announcement.scope === "dm" && announcement.guildName !== null) {
    context.addIssue({ code: "custom", message: "DM guild name is invalid" });
  }
  if (announcement.previousGameId === announcement.gameId) {
    context.addIssue({ code: "custom", message: "Previous game is unchanged" });
  }
  if (announcement.sessionLastRollAt < announcement.sessionStartedAt) {
    context.addIssue({ code: "custom", message: "Session timestamps are invalid" });
  }
  if (announcement.detectedAt < announcement.sessionStartedAt) {
    context.addIssue({ code: "custom", message: "Detection timestamp is invalid" });
  }
});
export type GameDetectionAnnouncementV1 = Readonly<
  z.infer<typeof GameDetectionAnnouncementV1Schema>
>;
const GameDetectionAnnouncementIdentitySchema =
  z.custom<GameDetectionAnnouncementV1>((value) =>
    GameDetectionAnnouncementV1Schema.safeParse(value).success
  );

// Remove these compatibility aliases with the legacy Discord REST RPC after
// every Data environment uses the generic channel-context contract.
export type GameDetectionChannelContextRequestV1 =
  DiscordChannelContextRequestV1;
export type GameDetectionChannelContextResultV1 =
  DiscordChannelContextResultV1;

export const parseGameDetectionChannelContextRequestV1 =
  parseDiscordChannelContextRequestV1;
export const parseGameDetectionChannelContextResponseV1 =
  parseDiscordChannelContextResponseV1;

export function parseGameDetectionAnnouncementV1(
  value: SchemaInput,
): GameDetectionAnnouncementV1 {
  const result = GameDetectionAnnouncementIdentitySchema.safeParse(value);
  if (!result.success) {
    throw new Error("Game-detection announcement is invalid");
  }
  return result.data;
}
