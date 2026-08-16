import type { RenderRequestV4 } from "@dice-witch/dice-v4-model";
import type { RollExecutionResult } from "../../../packages/roll-domain/src";
import {
  buildRollRenderRequestV4,
  buildRollRenderRequestR20V4,
  buildRollRenderRequestR21V4,
  buildRollRenderRequestR22V4,
  buildRollRenderRequestR23V4,
  buildRollRenderRequestR24V4,
  buildRollRenderRequestR25V4,
  buildRollRenderRequestR26V4,
  buildRollRenderRequestR27V4,
  buildRollRenderRequestR28V4,
  buildRollRenderRequestR29V4,
  buildRollRenderRequestR30V4,
  buildRollRenderRequestR31V4,
  buildRollRenderRequestR32V4,
  buildRollRenderRequestR33V4,
  buildRollRenderRequestR34V4,
  buildRollRenderRequestR35V4,
  buildRollRenderRequestR36V4,
  buildRollRenderRequestR37V4,
  buildRollRenderRequestR38V4,
} from "../../../packages/roll-render-model/src";
import type { RenderRequestV3 } from "../../../packages/dice-svg/src";
import {
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
  | "r25"
  | "r26"
  | "r27"
  | "r28"
  | "r29"
  | "r30"
  | "r31"
  | "r32"
  | "r33"
  | "r34"
  | "r35"
  | "r36"
  | "r37"
  | "r38";
export type EmittedRollRenderRequest = RenderRequestV3 | RenderRequestV4;

const ROLL_VIEW_BUILDERS_V4 = {
  r20: buildRollRenderRequestR20V4,
  r21: buildRollRenderRequestR21V4,
  r22: buildRollRenderRequestR22V4,
  r23: buildRollRenderRequestR23V4,
  r24: buildRollRenderRequestR24V4,
  r25: buildRollRenderRequestR25V4,
  r26: buildRollRenderRequestR26V4,
  r27: buildRollRenderRequestR27V4,
  r28: buildRollRenderRequestR28V4,
  r29: buildRollRenderRequestR29V4,
  r30: buildRollRenderRequestR30V4,
  r31: buildRollRenderRequestR31V4,
  r32: buildRollRenderRequestR32V4,
  r33: buildRollRenderRequestR33V4,
  r34: buildRollRenderRequestR34V4,
  r35: buildRollRenderRequestR35V4,
  r36: buildRollRenderRequestR36V4,
  r37: buildRollRenderRequestR37V4,
  r38: buildRollRenderRequestR38V4,
} satisfies Record<
  Exclude<RollViewPolicy, "r19">,
  typeof buildRollRenderRequestR20V4
>;

export function parseRollRenderVersion(value: unknown): 4 {
  if (value === "4") return 4;
  throw new Error("ROLL_RENDER_VERSION must equal 4");
}

export function parseRollViewPolicy(value: unknown): RollViewPolicy {
  if (
    value === "r19" ||
    value === "r20" ||
    value === "r21" ||
    value === "r22" ||
    value === "r23" ||
    value === "r24" ||
    value === "r25" ||
    value === "r26" ||
    value === "r27" ||
    value === "r28" ||
    value === "r29" ||
    value === "r30" ||
    value === "r31" ||
    value === "r32" ||
    value === "r33" ||
    value === "r34" ||
    value === "r35" ||
    value === "r36" ||
    value === "r37" ||
    value === "r38"
  ) {
    return value;
  }
  throw new Error(
    "ROLL_VIEW_POLICY must be r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, or r38",
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
    throw new Error("Pending renderer V3 snapshots cannot be reconstructed");
  }
  const appearance = await loadEffectiveAppearanceV4(
    dataService,
    userId,
    guildId,
  );
  return viewPolicy === "r19"
    ? buildRollRenderRequestV4(outcome, renderSeed, appearance.recipes)
    : ROLL_VIEW_BUILDERS_V4[viewPolicy](outcome, renderSeed, appearance);
}
