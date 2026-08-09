import type { RenderRequestV4 } from "@dice-witch/dice-v4-model";
import type { RollExecutionResult } from "../../../packages/roll-domain/src";
import {
  buildRollRenderRequestV3,
  buildRollRenderRequestV4,
  buildRollRenderRequestR20V4,
} from "../../../packages/roll-render-model/src";
import type { RenderRequestV3 } from "../../../packages/dice-svg/src";
import {
  loadEffectiveAppearanceV2,
  loadEffectiveAppearanceV3,
  loadEffectiveAppearanceV4,
  type AppearanceDataService,
} from "./appearance";

export type RollRenderVersion = 3 | 4;
export type RollViewPolicy = "r19" | "r20";
export type EmittedRollRenderRequest = RenderRequestV3 | RenderRequestV4;

export function parseRollRenderVersion(value: unknown): RollRenderVersion {
  if (value === "3") return 3;
  if (value === "4") return 4;
  throw new Error("ROLL_RENDER_VERSION must be 3 or 4");
}

export function parseRollViewPolicy(value: unknown): RollViewPolicy {
  if (value === "r19" || value === "r20") return value;
  throw new Error("ROLL_VIEW_POLICY must be r19 or r20");
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
      throw new Error("ROLL_VIEW_POLICY r20 requires ROLL_RENDER_VERSION 4");
    }
    return buildRollRenderRequestV3(
      outcome,
      renderSeed,
      await loadEffectiveAppearanceV2(dataService, userId, guildId),
    );
  }
  return viewPolicy === "r20"
    ? buildRollRenderRequestR20V4(
        outcome,
        renderSeed,
        await loadEffectiveAppearanceV4(dataService, userId, guildId),
      )
    : buildRollRenderRequestV4(
        outcome,
        renderSeed,
        await loadEffectiveAppearanceV3(dataService, userId, guildId),
      );
}
