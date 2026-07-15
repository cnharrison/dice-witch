import type { GenerationAction } from "./generation";
import {
  gatewayPartitionAssignments,
  gatewayPartitionForShard,
  type GatewayPartitionAssignment,
} from "./partition";

export type GatewayPartitionCommand = {
  type:
    | "suspend-generation"
    | "start-target-shards"
    | "activate-generation"
    | "retire-generation"
    | "stop-generation"
    | "resume-generation";
  generation: number;
  shardCount: number;
  assignment: GatewayPartitionAssignment;
  shardIds: number[];
};

function assignmentCommand(
  action: Exclude<GenerationAction, { type: "start-target-wave" }>,
  assignment: GatewayPartitionAssignment,
): GatewayPartitionCommand {
  return {
    type: action.type,
    generation: action.generation,
    shardCount: action.shardCount,
    assignment,
    shardIds: Array.from(
      { length: assignment.shardCount },
      (_, index) => assignment.firstShardId + index,
    ),
  };
}

export function partitionGenerationAction(
  action: GenerationAction,
  connectionCapacity: number,
): GatewayPartitionCommand[] {
  if (action.type !== "start-target-wave") {
    return gatewayPartitionAssignments(action.shardCount, connectionCapacity).map(
      (assignment) => assignmentCommand(action, assignment),
    );
  }

  const grouped = new Map<number, GatewayPartitionCommand>();
  for (const shardId of action.shardIds) {
    const assignment = gatewayPartitionForShard(
      shardId,
      action.shardCount,
      connectionCapacity,
    );
    const existing = grouped.get(assignment.partitionIndex);
    if (existing === undefined) {
      grouped.set(assignment.partitionIndex, {
        type: "start-target-shards",
        generation: action.generation,
        shardCount: action.shardCount,
        assignment,
        shardIds: [shardId],
      });
    } else {
      existing.shardIds.push(shardId);
    }
  }
  return [...grouped.values()].sort(
    (left, right) =>
      left.assignment.partitionIndex - right.assignment.partitionIndex,
  );
}
