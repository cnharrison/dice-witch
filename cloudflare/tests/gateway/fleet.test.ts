import { describe, expect, it } from "vitest";
import {
  createGenerationMachine,
  partitionGenerationAction,
  planGenerationIncrease,
  transitionGeneration,
  type GenerationAction,
  type GenerationMachine,
} from "../../packages/gateway-protocol/src";

function onlyAction(actions: GenerationAction[]): GenerationAction {
  const action = actions[0];
  if (actions.length !== 1 || action === undefined) {
    throw new Error("Expected exactly one generation action");
  }
  return action;
}

describe("Gateway fleet generation commands", () => {
  it("creates a second partition when automatic growth crosses 24 shards", () => {
    const planned = planGenerationIncrease({
      currentGeneration: 1,
      currentShardCount: 24,
      recommendedShardCount: 25,
      remainingIdentifies: 25,
      identifyResetAt: 1_720_086_400_000,
      maxConcurrency: 1,
      partitionCapacity: 25,
    });
    if (planned.outcome !== "planned") {
      throw new Error("Expected automatic growth to be planned");
    }

    let machine: GenerationMachine = createGenerationMachine(1, 24);
    let transition = transitionGeneration(machine, {
      type: "plan",
      plan: planned.plan,
    });
    const suspend = partitionGenerationAction(
      onlyAction(transition.actions),
      24,
    );
    expect(suspend).toHaveLength(1);
    expect(suspend[0]?.type).toBe("suspend-generation");
    expect(suspend[0]?.assignment.partitionName).toBe("gateway-partition-0");
    expect(suspend[0]?.shardIds).toEqual(
      Array.from({ length: 24 }, (_, shardId) => shardId),
    );

    machine = transition.machine;
    transition = transitionGeneration(machine, { type: "active-suspended" });
    machine = transition.machine;
    for (let shardId = 0; shardId < 25; shardId += 1) {
      const commands = partitionGenerationAction(
        onlyAction(transition.actions),
        24,
      );
      expect(commands).toHaveLength(1);
      expect(commands[0]?.type).toBe("start-target-shards");
      expect(commands[0]?.assignment.partitionName).toBe(
        shardId === 24 ? "gateway-partition-1" : "gateway-partition-0",
      );
      expect(commands[0]?.shardIds).toEqual([shardId]);
      transition = transitionGeneration(machine, {
        type: "target-shard-ready",
        shardId,
      });
      machine = transition.machine;
    }

    expect(machine).toEqual(createGenerationMachine(2, 25));
    const finalCommands = transition.actions.flatMap((action) =>
      partitionGenerationAction(action, 24),
    );
    expect(
      finalCommands.map(({ type, assignment }) => [
        type,
        assignment.partitionName,
      ]),
    ).toEqual([
      ["activate-generation", "gateway-partition-0"],
      ["activate-generation", "gateway-partition-1"],
      ["retire-generation", "gateway-partition-0"],
    ]);
  });

  it("rolls back every target partition when the new partition fails", () => {
    const plan = {
      currentGeneration: 1,
      currentShardCount: 24,
      targetGeneration: 2,
      targetShardCount: 25,
      identifyWaves: [Array.from({ length: 25 }, (_, shardId) => shardId)],
    };
    let machine = createGenerationMachine(1, 24);
    machine = transitionGeneration(machine, { type: "plan", plan }).machine;
    machine = transitionGeneration(machine, { type: "active-suspended" }).machine;
    for (let shardId = 0; shardId < 24; shardId += 1) {
      machine = transitionGeneration(machine, {
        type: "target-shard-ready",
        shardId,
      }).machine;
    }

    const failed = transitionGeneration(machine, {
      type: "target-shard-failed",
      shardId: 24,
      reason: "gateway-fatal",
    });
    const commands = failed.actions.flatMap((action) =>
      partitionGenerationAction(action, 24),
    );
    expect(
      commands.map(({ type, assignment }) => [type, assignment.partitionName]),
    ).toEqual([
      ["stop-generation", "gateway-partition-0"],
      ["stop-generation", "gateway-partition-1"],
      ["resume-generation", "gateway-partition-0"],
    ]);
  });
});
