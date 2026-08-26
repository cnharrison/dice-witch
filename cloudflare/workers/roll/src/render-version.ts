import type { RenderRequestV4 } from "@dice-witch/dice-v4-model";
import { z } from "zod";
import type { SchemaInput } from "../../../packages/discord-contracts/src/schema-primitives";
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
  buildRollRenderRequestR39V4,
  buildRollRenderRequestR40V4,
  buildRollRenderRequestR41V4,
  buildRollRenderRequestR42V4,
} from "../../../packages/roll-render-model/src";
import type { RenderRequestV3 } from "../../../packages/dice-svg/src";
import {
  loadEffectiveAppearanceV4,
  type AppearanceDataService,
} from "./appearance";

const ROLL_VIEW_POLICIES = [
  "r19",
  "r20",
  "r21",
  "r22",
  "r23",
  "r24",
  "r25",
  "r26",
  "r27",
  "r28",
  "r29",
  "r30",
  "r31",
  "r32",
  "r33",
  "r34",
  "r35",
  "r36",
  "r37",
  "r38",
  "r39",
  "r40",
  "r41",
  "r42",
] as const;
const RollRenderVersionSchema = z.literal("4");
const RollViewPolicySchema = z.enum(ROLL_VIEW_POLICIES);

export type RollRenderVersion = 3 | 4;
export type RollViewPolicy = z.infer<typeof RollViewPolicySchema>;
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
  r39: buildRollRenderRequestR39V4,
  r40: buildRollRenderRequestR40V4,
  r41: buildRollRenderRequestR41V4,
  r42: buildRollRenderRequestR42V4,
} satisfies Record<
  Exclude<RollViewPolicy, "r19">,
  typeof buildRollRenderRequestR20V4
>;

export function parseRollRenderVersion(value: SchemaInput): 4 {
  const result = RollRenderVersionSchema.safeParse(value);
  if (result.success) return 4;
  throw new Error("ROLL_RENDER_VERSION must equal 4");
}

export function parseRollViewPolicy(value: SchemaInput): RollViewPolicy {
  const result = RollViewPolicySchema.safeParse(value);
  if (result.success) return result.data;
  throw new Error(
    "ROLL_VIEW_POLICY must be r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39, r40, r41, or r42",
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
