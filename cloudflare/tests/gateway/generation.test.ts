import { describe, expect, it } from "vitest";
import {
  createGenerationMachine,
  planForcedGenerationReplacement,
  planGenerationIncrease,
  routeGenerationDispatch,
  transitionGeneration,
} from "../../packages/gateway-protocol/src";

describe("generation planning", () => {
  it("builds complete ordered Identify waves", () => {
    expect(
      planGenerationIncrease({
        currentGeneration: 7,
        currentShardCount: 4,
        recommendedShardCount: 5,
        remainingIdentifies: 5,
        identifyResetAt: 1_720_086_400_000,
        maxConcurrency: 2,
        partitionCapacity: 5,
      }),
    ).toEqual({
      outcome: "planned",
      plan: {
        currentGeneration: 7,
        currentShardCount: 4,
        targetGeneration: 8,
        targetShardCount: 5,
        identifyWaves: [
          [0, 1],
          [2, 3],
          [4],
        ],
      },
    });
  });

  it("does not create a partial generation when Identify budget is insufficient", () => {
    expect(
      planGenerationIncrease({
        currentGeneration: 7,
        currentShardCount: 4,
        recommendedShardCount: 5,
        remainingIdentifies: 4,
        identifyResetAt: 1_720_086_400_000,
        maxConcurrency: 2,
        partitionCapacity: 5,
      }),
    ).toEqual({
      outcome: "postponed",
      requiredIdentifies: 5,
      remainingIdentifies: 4,
      retryAt: 1_720_086_400_000,
    });
  });

  it("does nothing for the current or a lower recommendation", () => {
    for (const recommendedShardCount of [3, 4]) {
      expect(
        planGenerationIncrease({
          currentGeneration: 7,
          currentShardCount: 4,
          recommendedShardCount,
          remainingIdentifies: 10,
          identifyResetAt: 1_720_086_400_000,
          maxConcurrency: 2,
          partitionCapacity: 5,
        }),
      ).toEqual({ outcome: "no-change" });
    }
  });

  it("plans an operator-forced downshard as a complete new generation", () => {
    expect(
      planForcedGenerationReplacement({
        currentGeneration: 8,
        currentShardCount: 2,
        recommendedShardCount: 1,
        remainingIdentifies: 1,
        identifyResetAt: 1_720_086_400_000,
        maxConcurrency: 1,
        partitionCapacity: 2,
      }),
    ).toEqual({
      outcome: "planned",
      plan: {
        currentGeneration: 8,
        currentShardCount: 2,
        targetGeneration: 9,
        targetShardCount: 1,
        identifyWaves: [[0]],
      },
    });
  });

  it("rejects a recommendation above the explicit partition capacity", () => {
    expect(() =>
      planGenerationIncrease({
        currentGeneration: 7,
        currentShardCount: 4,
        recommendedShardCount: 6,
        remainingIdentifies: 10,
        identifyResetAt: 1_720_086_400_000,
        maxConcurrency: 2,
        partitionCapacity: 5,
      }),
    ).toThrow("exceeds the measured partition capacity");
  });
});

describe("generation transitions", () => {
  const plan = {
    currentGeneration: 7,
    currentShardCount: 2,
    targetGeneration: 8,
    targetShardCount: 3,
    identifyWaves: [
      [0, 1],
      [2],
    ],
  };

  it("activates only after every ordered wave is Ready", () => {
    let machine = createGenerationMachine(7, 2);
    let transition = transitionGeneration(machine, { type: "plan", plan });
    expect(transition.actions).toEqual([
      { type: "suspend-generation", generation: 7, shardCount: 2 },
    ]);

    machine = transition.machine;
    transition = transitionGeneration(machine, { type: "active-suspended" });
    expect(transition.actions).toEqual([
      { type: "start-target-wave", generation: 8, shardIds: [0, 1], shardCount: 3 },
    ]);

    machine = transition.machine;
    transition = transitionGeneration(machine, {
      type: "target-shard-ready",
      shardId: 0,
    });
    expect(transition.actions).toEqual([]);

    machine = transition.machine;
    transition = transitionGeneration(machine, {
      type: "target-shard-ready",
      shardId: 1,
    });
    expect(transition.actions).toEqual([
      { type: "start-target-wave", generation: 8, shardIds: [2], shardCount: 3 },
    ]);

    machine = transition.machine;
    transition = transitionGeneration(machine, {
      type: "target-shard-ready",
      shardId: 2,
    });
    expect(transition.machine).toMatchObject({
      phase: "idle",
      activeGeneration: 8,
      activeShardCount: 3,
      target: null,
    });
    expect(transition.actions).toEqual([
      { type: "activate-generation", generation: 8, shardCount: 3 },
      { type: "retire-generation", generation: 7, shardCount: 2 },
    ]);
  });

  it("stops a failed target and resumes the complete prior generation", () => {
    let machine = createGenerationMachine(7, 2);
    machine = transitionGeneration(machine, { type: "plan", plan }).machine;
    machine = transitionGeneration(machine, { type: "active-suspended" }).machine;

    const failed = transitionGeneration(machine, {
      type: "target-shard-failed",
      shardId: 1,
      reason: "gateway-fatal",
    });
    expect(failed.machine).toMatchObject({
      phase: "rolling-back",
      activeGeneration: 7,
      activeShardCount: 2,
    });
    expect(failed.actions).toEqual([
      { type: "stop-generation", generation: 8, shardCount: 3 },
      { type: "resume-generation", generation: 7, shardCount: 2 },
    ]);

    const restored = transitionGeneration(failed.machine, {
      type: "rollback-ready",
    });
    expect(restored.machine).toEqual(createGenerationMachine(7, 2));
    expect(restored.actions).toEqual([]);
  });

  it("rejects a plan containing an empty Identify wave", () => {
    const machine = createGenerationMachine(7, 2);
    expect(() =>
      transitionGeneration(machine, {
        type: "plan",
        plan: {
          ...plan,
          identifyWaves: [[0], [], [1, 2]],
        },
      }),
    ).toThrow("does not contain every target shard");
  });

  it("rejects Ready events outside the current wave", () => {
    let machine = createGenerationMachine(7, 2);
    machine = transitionGeneration(machine, { type: "plan", plan }).machine;
    machine = transitionGeneration(machine, { type: "active-suspended" }).machine;

    expect(() =>
      transitionGeneration(machine, {
        type: "target-shard-ready",
        shardId: 2,
      }),
    ).toThrow("not in the current Identify wave");
  });
});

describe("generation dispatch routing", () => {
  it("routes only the active generation and expected shard coordinates", () => {
    expect(
      routeGenerationDispatch(
        { activeGeneration: 8, activeShardCount: 3 },
        { generation: 8, shardId: 2, shardCount: 3 },
      ),
    ).toEqual({ generation: 8, shardId: 2 });

    expect(() =>
      routeGenerationDispatch(
        { activeGeneration: 8, activeShardCount: 3 },
        { generation: 7, shardId: 1, shardCount: 2 },
      ),
    ).toThrow("stale or mixed Gateway generation");
  });
});
