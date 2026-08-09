import type { RenderRequestV4 } from "@dice-witch/dice-v4-model";
import type { RollExecutionResult } from "../../../packages/roll-domain/src";
import {
  buildRollRenderRequestV3,
  buildRollRenderRequestV4,
  buildRollRenderRequestR20V4,
  buildRollRenderRequestR21V4,
  buildRollRenderRequestR22V4,
  buildRollRenderRequestR23V4,
  buildRollRenderRequestR24V4,
  buildRollRenderRequestR25V4,
} from "../../../packages/roll-render-model/src";
import type { RenderRequestV3 } from "../../../packages/dice-svg/src";
import {
  loadEffectiveAppearanceV2,
  loadEffectiveAppearanceV3,
  loadEffectiveAppearanceV4,
  type AppearanceDataService,
} from "./appearance";

export type RollRenderVersion = 3 | 4;
export type RollViewPolicy =
  | "r19"
  | "r20"
  | "r21"
  | "r22"
  | "r23"
  | "r24"
  | "r25";
export type EmittedRollRenderRequest = RenderRequestV3 | RenderRequestV4;

export function parseRollRenderVersion(value: unknown): RollRenderVersion {
  if (value === "3") return 3;
  if (value === "4") return 4;
  throw new Error("ROLL_RENDER_VERSION must be 3 or 4");
}

export function parseRollViewPolicy(value: unknown): RollViewPolicy {
  if (
    value === "r19" ||
    value === "r20" ||
    value === "r21" ||
    value === "r22" ||
    value === "r23" ||
    value === "r24" ||
    value === "r25"
  ) {
    return value;
  }
  throw new Error(
    "ROLL_VIEW_POLICY must be r19, r20, r21, r22, r23, r24, or r25",
  );
}

export async function buildRollRenderRequestForVersion(
  dataService: AppearanceDataService,
  version: RollRenderVersion,
  viewPolicy: RollViewPolicy,
  userId: string,
  guildId: string | null,
  outcome: RollExecutionResult,
  renderSeed: number,
): Promise<EmittedRollRenderRequest> {
  if (version === 3) {
    if (viewPolicy !== "r19") {
      throw new Error(`${viewPolicy} ROLL_VIEW_POLICY requires ROLL_RENDER_VERSION 4`);
    }
    return buildRollRenderRequestV3(
      outcome,
      renderSeed,
      await loadEffectiveAppearanceV2(dataService, userId, guildId),
    );
  }
  if (viewPolicy === "r19") {
    return buildRollRenderRequestV4(
      outcome,
      renderSeed,
      await loadEffectiveAppearanceV3(dataService, userId, guildId),
    );
  }
  const appearance = await loadEffectiveAppearanceV4(
    dataService,
    userId,
    guildId,
  );
  if (viewPolicy === "r20") {
    return buildRollRenderRequestR20V4(outcome, renderSeed, appearance);
  }
  if (viewPolicy === "r21") {
    return buildRollRenderRequestR21V4(outcome, renderSeed, appearance);
  }
  if (viewPolicy === "r22") {
    return buildRollRenderRequestR22V4(outcome, renderSeed, appearance);
  }
  if (viewPolicy === "r23") {
    return buildRollRenderRequestR23V4(outcome, renderSeed, appearance);
  }
  return viewPolicy === "r24"
    ? buildRollRenderRequestR24V4(outcome, renderSeed, appearance)
    : buildRollRenderRequestR25V4(outcome, renderSeed, appearance);
}
