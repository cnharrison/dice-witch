import { z } from "zod";
import {
  boundaryObjectSchema,
  type SchemaInput,
} from "../../../packages/discord-contracts/src/schema-primitives";
import {
  parseGameDetectionAnnouncementV1,
  type DiscordChannelContextRequestV1,
  type DiscordChannelContextResultV1,
  type GameDetectionAnnouncementV1,
} from "../../../packages/discord-contracts/src";
import {
  buildGameDetectionCandidateRequestV3,
  prepareGameDetectionV3,
  validateNarrationGameRankingResponseV1,
} from "../../../packages/roll-domain/src";
import { resolveDiscordChannelContextCachedV1 } from "./discord-channel-directory-service";
import { D1GameDetectionRepository } from "./game-detection-repository";

export const GAME_DETECTION_MODEL_ID = "@cf/zai-org/glm-5.2";
const MODEL_TIMEOUT_MS = 45_000;
const DEFAULT_RETRY_MS = 60_000;
const MAX_RETRY_MS = 15 * 60_000;

type DiscordAnnouncementResult =
  | { status: "delivered"; messageId: string; httpStatus: number }
  | { status: "failed"; httpStatus: number }
  | {
      status: "retryable";
      httpStatus: number | null;
      retryAfterMs: number | null;
    };

export type GameDetectionServiceEnv = Readonly<{
  DATA: D1Database;
  AI: Ai;
  DISCORD_REST: Readonly<{
    createGameDetectionAnnouncementV1(
      announcement: GameDetectionAnnouncementV1,
    ): Promise<DiscordAnnouncementResult>;
    resolveDiscordChannelContextV1(
      request: DiscordChannelContextRequestV1,
    ): Promise<DiscordChannelContextResultV1>;
  }>;
}>;

export type GameDetectionMinuteResult = Readonly<{
  ingested: number;
  skipped: number;
  backlog: boolean;
  closedSessions: number;
  interruptedJobs: number;
  interruptedAnnouncements: number;
  channelContext: "none" | "resolved" | "retrying" | "unavailable" | "failed";
  rankJob: "none" | "selected" | "abstained" | "rejected" | "failed";
  announcement: "none" | "sent" | "retrying" | "failed";
}>;

function parseJson(value: string): SchemaInput {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractModelOutput(value: SchemaInput): SchemaInput {
  const envelope = boundaryObjectSchema.safeParse(value);
  if (!envelope.success) return value;
  const nestedResult = boundaryObjectSchema.safeParse(envelope.data.result);
  const result = nestedResult.success ? nestedResult.data : envelope.data;
  if (result.response !== undefined) {
    const responseText = z.string().safeParse(result.response);
    return responseText.success ? parseJson(responseText.data) : result.response;
  }
  const choices = z.array(z.unknown()).safeParse(result.choices);
  if (choices.success) {
    const first = boundaryObjectSchema.safeParse(choices.data[0]);
    const message = first.success
      ? boundaryObjectSchema.safeParse(first.data.message)
      : null;
    if (message?.success) {
      const contentText = z.string().safeParse(message.data.content);
      return contentText.success
        ? parseJson(contentText.data)
        : message.data.content;
    }
  }
  return result;
}

function seedFor(signature: string): number {
  return (Number.parseInt(signature.slice(0, 12), 16) % 9_999_999_999) + 1;
}

function failureDetail(error: SchemaInput): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "model-timeout";
  }
  return "model-request-failed";
}

function boundedRetryDelay(retryAfterMs: number | null): number {
  return Math.min(
    Math.max(retryAfterMs ?? DEFAULT_RETRY_MS, 1_000),
    MAX_RETRY_MS,
  );
}

export async function processGameDetectionMinute(
  env: GameDetectionServiceEnv,
  now = Date.now(),
): Promise<GameDetectionMinuteResult> {
  const repository = new D1GameDetectionRepository(env.DATA);
  const interruptedJobs = await repository.failInterruptedRankJobs(now);
  const interruptedAnnouncements =
    await repository.recoverInterruptedAnnouncements(now);
  const ingestion = await repository.ingestDeliveredRolls(now);
  const pendingContext = await repository.nextPendingChannelContext(now);
  let channelContext: GameDetectionMinuteResult["channelContext"] = "none";
  if (pendingContext !== null) {
    let result: DiscordChannelContextResultV1;
    try {
      result = await resolveDiscordChannelContextCachedV1(
        env,
        {
          version: 1,
          guildId: pendingContext.guildId,
          channelId: pendingContext.channelId,
        },
        now,
      );
    } catch {
      result = { status: "retryable", httpStatus: null, retryAfterMs: null };
    }
    if (result.status === "resolved") {
      await repository.completeChannelContext(
        pendingContext.sessionId,
        {
          channelName: result.channelName,
          channelType: result.channelType,
        },
        now,
      );
      channelContext = "resolved";
    } else if (result.status === "retryable") {
      const retryDelay = boundedRetryDelay(result.retryAfterMs);
      await repository.deferChannelContext(
        pendingContext.sessionId,
        now + retryDelay,
      );
      channelContext = "retrying";
    } else if (result.status === "unavailable") {
      await repository.completeChannelContext(
        pendingContext.sessionId,
        null,
        now,
      );
      channelContext = "unavailable";
    } else {
      await repository.deferChannelContext(
        pendingContext.sessionId,
        now + DEFAULT_RETRY_MS,
      );
      channelContext = "failed";
    }
  }

  const job = ingestion.backlog ? null : await repository.claimRankJob(now);
  let rankJob: GameDetectionMinuteResult["rankJob"] = "none";

  if (job !== null) {
    const preparation = prepareGameDetectionV3({
      ranking: job.ranking,
      context: job.context,
    });
    if (preparation.state !== "prompt-ready") {
      await repository.completeRankJob(
        job,
        { status: "failed", detail: "prompt-not-ready" },
        Date.now(),
        0,
      );
      rankJob = "failed";
    } else {
      const startedAt = Date.now();
      try {
        const response = await env.AI.run(
          GAME_DETECTION_MODEL_ID,
          {
            messages: preparation.prompt.messages,
            response_format: {
              type: "json_schema",
              json_schema: preparation.prompt.responseSchema,
            },
            max_tokens: 1_024,
            temperature: 0,
            top_p: 1,
            seed: seedFor(job.candidateSignature),
            stream: false,
          },
          {
            signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
            tags: ["dice-witch:game-detection", "prompt:v3"],
          },
        );
        const validation = validateNarrationGameRankingResponseV1(
          extractModelOutput(response),
          buildGameDetectionCandidateRequestV3({
            ranking: job.ranking,
            context: job.context,
          }),
        );
        const completedAt = Date.now();
        if (validation.status === "accepted") {
          await repository.completeRankJob(
            job,
            {
              status: "accepted",
              value: validation.value,
              modelId: GAME_DETECTION_MODEL_ID,
              promptRevision: preparation.prompt.systemPromptRevision,
            },
            completedAt,
            completedAt - startedAt,
          );
          rankJob = validation.value.disposition === "select"
            ? "selected"
            : "abstained";
        } else {
          await repository.completeRankJob(
            job,
            { status: "rejected", detail: validation.reason },
            completedAt,
            completedAt - startedAt,
          );
          rankJob = "rejected";
        }
      } catch (error) {
        const completedAt = Date.now();
        await repository.completeRankJob(
          job,
          { status: "failed", detail: failureDetail(error) },
          completedAt,
          completedAt - startedAt,
        );
        rankJob = "failed";
      }
    }
  }

  const claimed = await repository.claimAnnouncement(Date.now());
  let announcement: GameDetectionMinuteResult["announcement"] = "none";
  if (claimed !== null) {
    let result: DiscordAnnouncementResult;
    try {
      const announcement = parseGameDetectionAnnouncementV1({
        version: 1,
        detectionId: claimed.detectionId,
        sessionId: claimed.sessionId,
        previousGameId: claimed.previousGameId,
        gameId: claimed.gameId,
        gameName: claimed.gameName,
        confidence: claimed.confidence,
        detectedAt: claimed.detectedAt,
        scope: claimed.scope,
        guildId: claimed.guildId,
        channelId: claimed.channelId,
        guildName: claimed.guildName,
        channelName: claimed.channelName,
        rollCount: claimed.rollCount,
        sessionStartedAt: claimed.sessionStartedAt,
        sessionLastRollAt: claimed.sessionLastRollAt,
      });
      result = await env.DISCORD_REST.createGameDetectionAnnouncementV1(
        announcement,
      );
    } catch {
      result = { status: "retryable", httpStatus: null, retryAfterMs: null };
    }
    if (result.status === "delivered") {
      await repository.markAnnouncementSent(
        claimed.detectionId,
        result.messageId,
        Date.now(),
      );
      announcement = "sent";
    } else if (result.status === "retryable") {
      const retryDelay = boundedRetryDelay(result.retryAfterMs);
      announcement = await repository.releaseAnnouncement(
        claimed.detectionId,
        `retryable-${String(result.httpStatus ?? "network")}`,
        Date.now() + retryDelay,
      );
    } else {
      await repository.markAnnouncementFailed(
        claimed.detectionId,
        `http-${String(result.httpStatus)}`,
        Date.now(),
      );
      announcement = "failed";
    }
  }

  return {
    ...ingestion,
    interruptedJobs,
    interruptedAnnouncements,
    channelContext,
    rankJob,
    announcement,
  };
}
