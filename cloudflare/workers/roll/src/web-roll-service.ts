import { WorkerEntrypoint } from "cloudflare:workers";
import { renderDiceToPng } from "../../../packages/dice-svg/src";
import {
  buildRollClatterMessage,
  buildRollErrorMessage,
  buildRollResultMessage,
} from "../../../packages/discord-contracts/src";
import {
  executeRoll,
  parseNotationArgs,
} from "../../../packages/roll-domain/src";
import { buildRollRenderRequest } from "../../../packages/roll-render-model/src";
type WebRollEnv = RollBindings;

export type WebRollResult =
  | { status: "invalid"; message: string }
  | {
      status: "rolled";
      message: string;
      diceArray: Array<
        Array<{
          sides: number | "%" | "F";
          rolled: number;
          value: number;
          icon: string[];
          color: string;
          secondaryColor: string;
          textColor: string;
        }>
      >;
      resultArray: Array<{ output: string; results: number }>;
      discord: {
        payload: unknown;
        clatter: string;
        filename: string;
        png: Uint8Array;
      };
    };

type WebRollRequest = {
  notation: string;
  repetitions: number;
  username: string;
  title: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

function validateRequest(value: unknown): WebRollRequest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["notation", "repetitions", "title", "username"]) ||
    typeof value.notation !== "string" ||
    value.notation.length < 1 ||
    value.notation.length > 6_000 ||
    typeof value.repetitions !== "number" ||
    !Number.isSafeInteger(value.repetitions) ||
    value.repetitions < 1 ||
    value.repetitions > 50 ||
    typeof value.username !== "string" ||
    value.username.length < 1 ||
    value.username.length > 32 ||
    (value.title !== null &&
      (typeof value.title !== "string" ||
        value.title.length < 1 ||
        value.title.length > 256))
  ) {
    throw new Error("Web roll request is invalid");
  }
  return {
    notation: value.notation,
    repetitions: value.repetitions,
    username: value.username,
    title: value.title,
  };
}

function randomSeed(): number {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (seed === undefined) throw new Error("Roll seed generation failed");
  return seed;
}

export async function executeWebRoll(value: unknown): Promise<WebRollResult> {
  const request = validateRequest(value);
  const outcome = executeRoll({
    notation: parseNotationArgs(request.notation),
    repetitions: request.repetitions,
    seed: randomSeed(),
  });
  if (outcome.outcomes.length === 0) {
    return {
      status: "invalid",
      message: buildRollErrorMessage(outcome).content ?? "Invalid dice notation",
    };
  }

  const renderRequest = buildRollRenderRequest(outcome, randomSeed());
  const rendered = await renderDiceToPng(renderRequest);
  const filename = "dice-witch-roll.png";
  const clatter = buildRollClatterMessage(outcome, outcome.seed).content;
  if (clatter === undefined) throw new Error("Roll clatter is unavailable");
  return {
    status: "rolled",
    message: "Roll processed successfully",
    diceArray: renderRequest.groups.map((group) =>
      group.map((die) => ({
        sides: die.sides,
        rolled: die.rolled,
        value: die.rolled,
        icon: die.icons,
        color: die.color,
        secondaryColor: die.secondaryColor,
        textColor: die.textColor,
      })),
    ),
    resultArray: outcome.outcomes.map(({ output, total }) => ({
      output,
      results: total,
    })),
    discord: {
      payload: buildRollResultMessage(outcome, {
        source: "web",
        title: request.title,
        username: request.username,
        filename,
      }),
      clatter,
      filename,
      png: rendered.png,
    },
  };
}

export class WebRollService extends WorkerEntrypoint<WebRollEnv> {
  execute(value: unknown): Promise<WebRollResult> {
    return executeWebRoll(value);
  }
}
