import { z } from "zod";
import {
  gatewayPartitionAssignments,
  type GatewayPartitionAssignment,
} from "../../../packages/gateway-protocol/src";

const integer = z.number().int().nonnegative().refine(Number.isSafeInteger);
export const GatewayTransferRequestSchema = z.strictObject({
  generation: integer,
  shardId: integer,
  shardCount: integer.positive(),
  source: z.string().regex(/^gateway-partition-[0-9]+$/),
  target: z.string().regex(/^gateway-partition-[0-9]+$/),
});
export type GatewayTransferRequest = z.infer<typeof GatewayTransferRequestSchema>;
export type GatewayTransfer = GatewayTransferRequest & {
  epoch: number;
  startedAt: number;
  phase: "parking" | "importing" | "activating" | "verifying" | "restoring" | "complete" | "cancelled" | "superseded";
};
type PlacementRow = { shard_id: number; owner_id: string; epoch: number };

/** Synchronous journal and placement writes share the ownership transaction. */
export class GatewayPlacement {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS gateway_placement (
        generation INTEGER NOT NULL, shard_id INTEGER NOT NULL,
        shard_count INTEGER NOT NULL, owner_id TEXT NOT NULL, epoch INTEGER NOT NULL,
        PRIMARY KEY (generation, shard_id)
      );
      CREATE TABLE IF NOT EXISTS gateway_transfer (
        epoch INTEGER PRIMARY KEY AUTOINCREMENT,
        generation INTEGER NOT NULL, shardId INTEGER NOT NULL, shardCount INTEGER NOT NULL,
        source TEXT NOT NULL, target TEXT NOT NULL, phase TEXT NOT NULL, startedAt INTEGER NOT NULL
      );
    `);
  }

  active(): GatewayTransfer | null {
    return this.storage.sql.exec<GatewayTransfer>(
      "SELECT * FROM gateway_transfer WHERE phase NOT IN ('complete', 'cancelled', 'superseded') ORDER BY epoch DESC LIMIT 1",
    ).toArray()[0] ?? null;
  }

  requireIdle(): void {
    if (this.active() !== null) throw new Error("Gateway placement transfer is in progress");
  }

  get(epoch: number): GatewayTransfer {
    const transfer = this.storage.sql.exec<GatewayTransfer>(
      "SELECT * FROM gateway_transfer WHERE epoch = ?", epoch,
    ).toArray()[0];
    if (transfer === undefined) throw new Error("Gateway transfer is unavailable");
    return transfer;
  }

  begin(request: GatewayTransferRequest): GatewayTransfer {
    const parsed = GatewayTransferRequestSchema.parse(request);
    if (parsed.shardId >= parsed.shardCount || parsed.source === parsed.target) {
      throw new Error("Gateway transfer coordinates are invalid");
    }
    this.requireIdle();
    this.storage.sql.exec(
      `INSERT INTO gateway_transfer (generation, shardId, shardCount, source, target, phase, startedAt)
       VALUES (?, ?, ?, ?, ?, 'parking', ?)`,
      parsed.generation, parsed.shardId, parsed.shardCount, parsed.source, parsed.target, Date.now(),
    );
    const active = this.active();
    if (active === null) throw new Error("Gateway transfer was not persisted");
    return active;
  }

  advance(epoch: number, from: GatewayTransfer["phase"], to: GatewayTransfer["phase"]): void {
    const result = this.storage.sql.exec(
      "UPDATE gateway_transfer SET phase = ? WHERE epoch = ? AND phase = ?",
      to, epoch, from,
    );
    if (result.rowsWritten !== 1) throw new Error("Gateway transfer phase changed");
  }

  reverse(transfer: GatewayTransfer): GatewayTransfer {
    return this.storage.transactionSync(() => {
      this.advance(transfer.epoch, "verifying", "superseded");
      return this.begin({
        generation: transfer.generation, shardId: transfer.shardId, shardCount: transfer.shardCount,
        source: transfer.target, target: transfer.source,
      });
    });
  }

  commit(transfer: GatewayTransfer): void {
    this.storage.transactionSync(() => {
      const changed = this.storage.sql.exec(
        `UPDATE shard_ownership SET owner_id = ?, acquired_at = ?
         WHERE generation = ? AND shard_id = ? AND shard_count = ? AND owner_id = ?`,
        transfer.target, Date.now(), transfer.generation, transfer.shardId,
        transfer.shardCount, transfer.source,
      );
      if (changed.rowsWritten !== 1) throw new Error("Gateway transfer source no longer owns shard");
      this.storage.sql.exec(
        `INSERT INTO gateway_placement (generation, shard_id, shard_count, owner_id, epoch)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(generation, shard_id) DO UPDATE SET
         owner_id = excluded.owner_id, epoch = excluded.epoch`,
        transfer.generation, transfer.shardId, transfer.shardCount, transfer.target, transfer.epoch,
      );
      this.advance(transfer.epoch, "importing", "activating");
    });
  }

  owner(generation: number, shardId: number): string | null {
    return this.storage.sql.exec<{ owner_id: string }>(
      "SELECT owner_id FROM gateway_placement WHERE generation = ? AND shard_id = ?",
      generation, shardId,
    ).toArray()[0]?.owner_id ?? null;
  }

  assignments(generation: number, shardCount: number, capacity: number): GatewayPartitionAssignment[] {
    const overrides = new Map(this.storage.sql.exec<PlacementRow>(
      "SELECT shard_id, owner_id, epoch FROM gateway_placement WHERE generation = ? AND shard_count = ?",
      generation, shardCount,
    ).toArray().map((row) => [row.shard_id, row.owner_id]));
    const groups = new Map<string, number[]>();
    for (const assignment of gatewayPartitionAssignments(shardCount, capacity)) {
      for (let shard = assignment.firstShardId; shard <= assignment.lastShardId; shard += 1) {
        const owner = overrides.get(shard) ?? assignment.partitionName;
        const ids = groups.get(owner) ?? [];
        ids.push(shard);
        groups.set(owner, ids);
      }
    }
    return [...groups].map(([partitionName, ids]) => ({
      partitionIndex: Number(partitionName.slice("gateway-partition-".length)),
      partitionName,
      firstShardId: Math.min(...ids),
      lastShardId: Math.max(...ids),
      shardCount: ids.length,
    }));
  }

  shardIds(generation: number, shardCount: number, capacity: number, owner: string): number[] {
    const overrides = new Map(this.storage.sql.exec<PlacementRow>(
      "SELECT shard_id, owner_id, epoch FROM gateway_placement WHERE generation = ? AND shard_count = ?",
      generation, shardCount,
    ).toArray().map((row) => [row.shard_id, row.owner_id]));
    return Array.from({ length: shardCount }, (_, id) => id).filter((id) =>
      (overrides.get(id) ?? `gateway-partition-${Math.floor(id / capacity)}`) === owner,
    );
  }
}
