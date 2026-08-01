import {
  cleanDiscordChannelDirectory,
  recordDiscordChannelDirectoryMutation,
} from "./discord-channel-directory-service";
import {
  processGameDetectionMinute,
  type GameDetectionServiceEnv,
} from "./game-detection-service";
import { D1GameDetectionRepository } from "./game-detection-repository";
import {
  cleanRollLifecycleRecords,
  processRollLifecycleAlerts,
  recordRollLifecycle,
  type RollLifecycleAlertService,
} from "./roll-lifecycle-service";
import {
  D1RollAccountingRepository,
  parseAccountRollInput,
  type AccountRollInput,
} from "./roll-accounting-repository";
import { handleAppearanceRequest } from "./appearance-service";
import { handleAudienceSnapshotRequest } from "./audience-snapshot-service";
import { handleMembershipRequest } from "./membership-service";
import { handleSavedRollRequest } from "./saved-roll-service";
import { handleSessionRequest } from "./session-service";

export type DataEnv = {
  DATA: D1Database;
  AI: Ai;
  DISCORD_REST: RollLifecycleAlertService &
    GameDetectionServiceEnv["DISCORD_REST"];
};

function isConfigured(env: DataEnv): boolean {
  const data: unknown = (env as unknown as Record<string, unknown>).DATA;
  return (
    typeof data === "object" &&
    data !== null &&
    "prepare" in data &&
    typeof data.prepare === "function"
  );
}

const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

async function accountRoll(request: Request, env: DataEnv): Promise<Response> {
  let input: AccountRollInput;
  try {
    input = parseAccountRollInput(await request.json());
  } catch {
    return Response.json(
      { error: "Roll accounting request is invalid" },
      { status: 400, headers: responseHeaders },
    );
  }
  try {
    const result = await new D1RollAccountingRepository(env.DATA).account(input);
    return Response.json(result, {
      status: result.status === "conflict" ? 409 : 200,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: "Roll accounting failed" },
      { status: 500, headers: responseHeaders },
    );
  }
}

async function runMinuteMaintenance(
  env: DataEnv,
  scheduledTime: number,
): Promise<void> {
  const failures: unknown[] = [];
  try {
    await processRollLifecycleAlerts(env, scheduledTime);
  } catch (error) {
    failures.push(error);
    console.error(JSON.stringify({
      level: "error",
      message: "Roll lifecycle alert maintenance failed",
    }));
  }
  try {
    const result = await processGameDetectionMinute(env, scheduledTime);
    console.log(JSON.stringify({
      level: "info",
      message: "Game-detection maintenance completed",
      ...result,
    }));
  } catch (error) {
    failures.push(error);
    console.error(JSON.stringify({
      level: "error",
      message: "Game-detection maintenance failed",
    }));
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Data minute maintenance failed");
  }
}

async function runDailyMaintenance(
  env: DataEnv,
  scheduledTime: number,
): Promise<void> {
  const repository = new D1GameDetectionRepository(env.DATA);
  await repository.aggregateAndDeleteExpired(scheduledTime);
  await cleanRollLifecycleRecords(env, scheduledTime);
  await cleanDiscordChannelDirectory(env.DATA, scheduledTime);
}

const worker = {
  fetch(
    request: Request,
    env: DataEnv,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      if (!isConfigured(env)) {
        return Response.json(
          { error: "Data Worker is not configured" },
          { status: 503, headers: responseHeaders },
        );
      }
      return Response.json(
        { ok: true, service: "dice-witch-data" },
        { headers: responseHeaders },
      );
    }
    if (
      request.method === "POST" &&
      url.pathname === "/internal/roll-accounting"
    ) {
      return accountRoll(request, env);
    }
    if (
      request.method === "POST" &&
      url.pathname === "/internal/roll-lifecycle"
    ) {
      return recordRollLifecycle(request, env, ctx);
    }
    if (
      request.method === "POST" &&
      url.pathname === "/internal/discord-channel-context"
    ) {
      return recordDiscordChannelDirectoryMutation(request, env);
    }
    const appearanceResponse = handleAppearanceRequest(request, env.DATA);
    if (appearanceResponse !== null) return appearanceResponse;
    const audienceResponse = handleAudienceSnapshotRequest(request, env.DATA);
    if (audienceResponse !== null) return audienceResponse;
    const savedRollResponse = handleSavedRollRequest(request, env.DATA);
    if (savedRollResponse !== null) return savedRollResponse;
    const sessionResponse = handleSessionRequest(request, env.DATA);
    if (sessionResponse !== null) return sessionResponse;
    const membershipResponse = handleMembershipRequest(request, env.DATA);
    if (membershipResponse !== null) return membershipResponse;
    return Response.json(
      { error: "Not found" },
      {
        status: 404,
        headers: responseHeaders,
      },
    );
  },
  scheduled(controller, env): Promise<void> {
    if (controller.cron === "* * * * *") {
      return runMinuteMaintenance(env, controller.scheduledTime);
    }
    if (controller.cron === "0 3 * * *") {
      return runDailyMaintenance(env, controller.scheduledTime);
    }
    throw new Error(`Unsupported Data Worker cron: ${controller.cron}`);
  },
} satisfies ExportedHandler<DataEnv>;

export default worker;
