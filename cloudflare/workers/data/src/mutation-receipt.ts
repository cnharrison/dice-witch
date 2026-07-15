const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

export type MutationReceipt = {
  entityType: "guild" | "user" | "membership";
  entityKey: string;
  operation: "upsert";
  payloadJson: string;
  occurredAt: number;
};

export type MutationReceiptRow = {
  entity_type: string;
  entity_key: string;
  operation: string;
  payload_json: string;
  occurred_at: number;
};

export function validateSnowflake(value: string, name: string): string {
  if (!SNOWFLAKE.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

export function validateMutationMetadata(
  mutationId: string,
  occurredAt: number,
): void {
  if (
    typeof mutationId !== "string" ||
    mutationId.length === 0 ||
    mutationId.length > 255
  ) {
    throw new Error("Mutation id is invalid");
  }
  if (!Number.isSafeInteger(occurredAt) || occurredAt < 0) {
    throw new Error("Mutation timestamp is invalid");
  }
}

export function matchesMutationReceipt(
  row: MutationReceiptRow,
  receipt: MutationReceipt,
): boolean {
  return (
    row.entity_type === receipt.entityType &&
    row.entity_key === receipt.entityKey &&
    row.operation === receipt.operation &&
    row.payload_json === receipt.payloadJson &&
    row.occurred_at === receipt.occurredAt
  );
}

export async function readMutationReceipt(
  db: D1Database,
  mutationId: string,
): Promise<MutationReceiptRow | null> {
  return db
    .withSession("first-primary")
    .prepare(
      `SELECT entity_type, entity_key, operation, payload_json, occurred_at
       FROM mutation_receipts
       WHERE mutation_id = ?`,
    )
    .bind(mutationId)
    .first<MutationReceiptRow>();
}
