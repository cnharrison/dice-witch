import { z } from "zod";
import { parseSaveRollIntent, type SaveRollIntent } from "../../../packages/discord-contracts/src";
import type { SchemaInput } from "../../../packages/discord-contracts/src/schema-primitives";
import type { SavedRollScope } from "./saved-roll-picker";

const safeIntegerSchema = z.number().refine(Number.isSafeInteger);
const nonNegativeSafeIntegerSchema = safeIntegerSchema.nonnegative();
const statusOnly = <T extends z.ZodType<string>>(status: T) =>
  z.strictObject({ status });

const RollAcceptanceSchema = z.union([
  z.strictObject({
    status: z.enum(["created", "existing"]),
    delivery: z.enum(["pending", "delivered", "failed"]),
    expiresAt: nonNegativeSafeIntegerSchema,
  }),
  statusOnly(z.enum(["conflict", "expired", "unavailable"])),
]);

export type RollAcceptance = z.output<typeof RollAcceptanceSchema>;

export function parseRollAcceptance(value: SchemaInput): RollAcceptance {
  const result = RollAcceptanceSchema.safeParse(value);
  if (!result.success) throw new Error("Roll acceptance response is invalid");
  return result.data;
}

const GuildDeliverySettingsResultSchema = z.union([
  z.strictObject({
    status: z.literal("found"),
    settings: z.strictObject({
      skipDiceDelay: z.boolean(),
      hideRollResultText: z.boolean(),
    }),
  }),
  statusOnly(z.literal("missing")),
]);

export function parseGuildDeliverySettingsResult(value: SchemaInput) {
  const result = GuildDeliverySettingsResultSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Guild settings response is invalid");
  }
  return result.data;
}

const RollHelperResultSchema = statusOnly(z.literal("delivered"));

export function parseRollHelperResult(value: SchemaInput) {
  const result = RollHelperResultSchema.safeParse(value);
  if (!result.success) throw new Error("Roll helper response is invalid");
  return result.data;
}

const GatewayShardSchema = z.strictObject({
  id: safeIntegerSchema,
  state: z.string(),
  ping: safeIntegerSchema,
});
const GatewayStatusSchema = z.strictObject({
  phase: z.string(),
  shardCount: nonNegativeSafeIntegerSchema,
  shards: z.array(GatewayShardSchema),
});

export type GatewayStatus = z.output<typeof GatewayStatusSchema>;

export function parseGatewayStatus(value: SchemaInput): GatewayStatus {
  const result = GatewayStatusSchema.safeParse(value);
  if (!result.success) throw new Error("Gateway status response is invalid");
  return result.data;
}

const AudienceSnapshotResultSchema = z.strictObject({
  status: z.literal("found"),
  snapshot: z.unknown(),
});

export function parseAudienceSnapshotResult(value: SchemaInput) {
  const result = AudienceSnapshotResultSchema.safeParse(value);
  if (!result.success) throw new Error("Status stats response is invalid");
  return result.data;
}

const SaveRollIntentResultSchema = z.union([
  z.strictObject({ status: z.literal("available"), intent: z.unknown() }),
  statusOnly(z.enum(["expired", "missing"])),
]);

export type SaveRollIntentResult =
  | { status: "available"; intent: SaveRollIntent }
  | { status: "expired" | "missing" };

export function parseSaveRollIntentResult(
  value: SchemaInput,
): SaveRollIntentResult {
  const result = SaveRollIntentResultSchema.safeParse(value);
  if (!result.success) throw new Error("Save roll intent response is invalid");
  if (result.data.status !== "available") return result.data;
  return {
    status: "available",
    intent: parseSaveRollIntent(result.data.intent),
  };
}

const TextResultLookupSchema = z.union([
  z.strictObject({
    status: z.literal("available"),
    resultText: z.string().min(1),
  }),
  statusOnly(z.enum(["expired", "missing"])),
]);

export type TextResultLookup = z.output<typeof TextResultLookupSchema>;

export function parseTextResultLookup(value: SchemaInput): TextResultLookup {
  const result = TextResultLookupSchema.safeParse(value);
  if (!result.success) throw new Error("Text result response is invalid");
  return result.data;
}

const SavedRollSelectionSchema = z.strictObject({
  scope: z.enum(["mine", "server"]),
  id: z.string(),
  revision: nonNegativeSafeIntegerSchema,
});
const PickerDetailsSchema = z.strictObject({
  status: z.enum(["created", "existing", "updated"]),
  scope: z.enum(["mine", "server"]),
  page: nonNegativeSafeIntegerSchema,
  selectedId: z.string().nullable(),
  selectedRevision: nonNegativeSafeIntegerSchema.nullable(),
});
const PickerFailureSchema = statusOnly(z.enum([
  "conflict",
  "consumed",
  "expired",
  "invalid_selection",
  "missing",
  "unauthorized",
]));
const PickerStateSchema = z.union([PickerDetailsSchema, PickerFailureSchema]);

export type PickerState = z.output<typeof PickerStateSchema>;

export function parsePickerState(value: SchemaInput): PickerState {
  const result = PickerStateSchema.safeParse(value);
  if (!result.success) throw new Error("Saved roll picker response is invalid");
  return result.data;
}

const SavedRollReservationSchema = z.union([
  z.strictObject({
    status: z.enum(["reserved", "existing"]),
    selection: SavedRollSelectionSchema,
  }),
  PickerFailureSchema,
]);

export type SavedRollReservation = z.output<
  typeof SavedRollReservationSchema
>;

export function parseSavedRollReservation(
  value: SchemaInput,
): SavedRollReservation {
  const result = SavedRollReservationSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Saved roll reservation response is invalid");
  }
  return result.data;
}

const SavedRollAcceptanceSchema = z.union([
  z.strictObject({
    status: z.enum(["created", "existing"]),
    delivery: z.enum(["pending", "delivered", "failed"]).optional(),
    expiresAt: nonNegativeSafeIntegerSchema.optional(),
    savedRoll: z.unknown().optional(),
  }),
  statusOnly(z.enum([
    "conflict",
    "expired",
    "missing",
    "stale",
    "unauthorized",
    "unavailable",
  ])),
]);

export function parseSavedRollAcceptanceStatus(value: SchemaInput): string {
  const result = SavedRollAcceptanceSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Saved roll acceptance response is invalid");
  }
  return result.data.status;
}

const CopyResultSchema = z.union([
  z.strictObject({
    status: z.literal("copied"),
    name: z.string(),
    destinationId: z.string(),
  }),
  z.strictObject({ status: z.literal("name_conflict"), name: z.string() }),
  statusOnly(z.enum([
    "cap_reached",
    "conflict",
    "expired",
    "invalid_name",
    "invalid_selection",
    "missing",
    "stale",
    "unauthorized",
    "unavailable",
  ])),
]);

export type CopyResult = z.output<typeof CopyResultSchema>;

export function parseCopyResult(value: SchemaInput): CopyResult {
  const result = CopyResultSchema.safeParse(value);
  if (!result.success) throw new Error("Saved roll copy response is invalid");
  return result.data;
}

const SaveMutationSuccessSchema = z.strictObject({
  status: z.enum(["applied", "existing"]),
  listRevision: nonNegativeSafeIntegerSchema,
  savedRoll: z.unknown(),
});
const SaveMutationRevisionSchema = z.strictObject({
  status: z.enum(["list_revision_conflict", "name_conflict"]),
  listRevision: nonNegativeSafeIntegerSchema,
});
const SaveMutationCapSchema = z.strictObject({
  status: z.literal("cap_reached"),
  listRevision: nonNegativeSafeIntegerSchema,
  limit: nonNegativeSafeIntegerSchema,
});
const SaveMutationSchema = z.union([
  SaveMutationSuccessSchema,
  SaveMutationRevisionSchema,
  SaveMutationCapSchema,
  statusOnly(z.enum([
    "applied",
    "cap_reached",
    "existing",
    "list_revision_conflict",
    "missing",
    "mutation_conflict",
    "name_conflict",
    "unauthorized",
  ])),
]);

export type SaveMutationStatus = z.output<typeof SaveMutationSchema>["status"];

export function parseSaveMutationStatus(value: SchemaInput): SaveMutationStatus {
  const result = SaveMutationSchema.safeParse(value);
  if (!result.success) throw new Error("Save roll mutation response is invalid");
  return result.data.status;
}

export type SavedRollSelection = {
  scope: SavedRollScope;
  id: string;
  revision: number;
};
