export type GenerationPlan = {
  currentGeneration: number;
  currentShardCount: number;
  targetGeneration: number;
  targetShardCount: number;
  identifyWaves: number[][];
};

export type GenerationPlanInput = {
  currentGeneration: number;
  currentShardCount: number;
  recommendedShardCount: number;
  remainingIdentifies: number;
  identifyResetAt: number;
  maxConcurrency: number;
  partitionCapacity: number;
};

export type GenerationPlanResult =
  | { outcome: "no-change" }
  | {
      outcome: "postponed";
      requiredIdentifies: number;
      remainingIdentifies: number;
      retryAt: number;
    }
  | { outcome: "planned"; plan: GenerationPlan };

export type GenerationPhase =
  | "idle"
  | "suspending-active"
  | "starting-target"
  | "rolling-back";

export type GenerationMachine = {
  phase: GenerationPhase;
  activeGeneration: number;
  activeShardCount: number;
  target: null | {
    plan: GenerationPlan;
    currentWaveIndex: number;
    readyShardIds: number[];
    failure: null | { shardId: number; reason: string };
  };
};

export type GenerationEvent =
  | { type: "plan"; plan: GenerationPlan }
  | { type: "active-suspended" }
  | { type: "target-shard-ready"; shardId: number }
  | { type: "target-shard-failed"; shardId: number; reason: string }
  | { type: "rollback-ready" };

export type GenerationAction =
  | { type: "suspend-generation"; generation: number; shardCount: number }
  | {
      type: "start-target-wave";
      generation: number;
      shardIds: number[];
      shardCount: number;
    }
  | { type: "activate-generation"; generation: number; shardCount: number }
  | { type: "retire-generation"; generation: number; shardCount: number }
  | { type: "stop-generation"; generation: number; shardCount: number }
  | { type: "resume-generation"; generation: number; shardCount: number };

export type GenerationTransition = {
  machine: GenerationMachine;
  actions: GenerationAction[];
};

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function requirePositiveInteger(value: number, name: string): void {
  requireNonNegativeInteger(value, name);
  if (value === 0) throw new Error(`${name} must be positive`);
}

export function planIdentifyWaves(
  shardCount: number,
  maxConcurrency: number,
): number[][] {
  requirePositiveInteger(shardCount, "Identify shard count");
  requirePositiveInteger(maxConcurrency, "Identify max concurrency");
  const waves: number[][] = [];
  for (let firstShard = 0; firstShard < shardCount; firstShard += maxConcurrency) {
    const wave: number[] = [];
    const end = Math.min(firstShard + maxConcurrency, shardCount);
    for (let shardId = firstShard; shardId < end; shardId += 1) {
      wave.push(shardId);
    }
    waves.push(wave);
  }
  return waves;
}

function planGeneration(
  input: GenerationPlanInput,
  allowDecrease: boolean,
): GenerationPlanResult {
  requireNonNegativeInteger(input.currentGeneration, "Current generation");
  requirePositiveInteger(input.currentShardCount, "Current shard count");
  requirePositiveInteger(input.recommendedShardCount, "Recommended shard count");
  requireNonNegativeInteger(input.remainingIdentifies, "Remaining Identifies");
  requireNonNegativeInteger(input.identifyResetAt, "Identify reset timestamp");
  requirePositiveInteger(input.maxConcurrency, "Identify max concurrency");
  requirePositiveInteger(input.partitionCapacity, "Partition capacity");
  if (
    input.currentShardCount > input.partitionCapacity ||
    input.recommendedShardCount > input.partitionCapacity
  ) {
    throw new Error("Recommended shard count exceeds the measured partition capacity");
  }

  if (
    input.recommendedShardCount === input.currentShardCount ||
    (!allowDecrease && input.recommendedShardCount < input.currentShardCount)
  ) {
    return { outcome: "no-change" };
  }
  if (input.remainingIdentifies < input.recommendedShardCount) {
    return {
      outcome: "postponed",
      requiredIdentifies: input.recommendedShardCount,
      remainingIdentifies: input.remainingIdentifies,
      retryAt: input.identifyResetAt,
    };
  }
  if (input.currentGeneration === Number.MAX_SAFE_INTEGER) {
    throw new Error("Target generation exceeds the safe integer range");
  }
  return {
    outcome: "planned",
    plan: {
      currentGeneration: input.currentGeneration,
      currentShardCount: input.currentShardCount,
      targetGeneration: input.currentGeneration + 1,
      targetShardCount: input.recommendedShardCount,
      identifyWaves: planIdentifyWaves(
        input.recommendedShardCount,
        input.maxConcurrency,
      ),
    },
  };
}

export function planGenerationIncrease(
  input: GenerationPlanInput,
): GenerationPlanResult {
  return planGeneration(input, false);
}

export function planForcedGenerationReplacement(
  input: GenerationPlanInput,
): GenerationPlanResult {
  return planGeneration(input, true);
}

export function createGenerationMachine(
  activeGeneration: number,
  activeShardCount: number,
): GenerationMachine {
  requireNonNegativeInteger(activeGeneration, "Active generation");
  requirePositiveInteger(activeShardCount, "Active shard count");
  return {
    phase: "idle",
    activeGeneration,
    activeShardCount,
    target: null,
  };
}

function validatePlan(machine: GenerationMachine, plan: GenerationPlan): void {
  requireNonNegativeInteger(plan.currentGeneration, "Plan current generation");
  requirePositiveInteger(plan.currentShardCount, "Plan current shard count");
  requireNonNegativeInteger(plan.targetGeneration, "Plan target generation");
  requirePositiveInteger(plan.targetShardCount, "Plan target shard count");
  if (
    plan.currentGeneration !== machine.activeGeneration ||
    plan.currentShardCount !== machine.activeShardCount ||
    plan.targetGeneration <= machine.activeGeneration ||
    plan.targetShardCount === machine.activeShardCount
  ) {
    throw new Error("Gateway generation plan does not replace the active generation");
  }
  const shardIds = plan.identifyWaves.flat();
  if (
    plan.identifyWaves.length === 0 ||
    plan.identifyWaves.some((wave) => wave.length === 0) ||
    shardIds.length !== plan.targetShardCount ||
    shardIds.some((shardId, index) => shardId !== index)
  ) {
    throw new Error("Gateway generation plan does not contain every target shard");
  }
}

function requireTarget(machine: GenerationMachine): NonNullable<GenerationMachine["target"]> {
  if (machine.target === null) {
    throw new Error("Gateway generation target is unavailable");
  }
  return machine.target;
}

export function transitionGeneration(
  machine: GenerationMachine,
  event: GenerationEvent,
): GenerationTransition {
  switch (event.type) {
    case "plan": {
      if (machine.phase !== "idle" || machine.target !== null) {
        throw new Error("Gateway generation change is already in progress");
      }
      validatePlan(machine, event.plan);
      return {
        machine: {
          ...machine,
          phase: "suspending-active",
          target: {
            plan: event.plan,
            currentWaveIndex: -1,
            readyShardIds: [],
            failure: null,
          },
        },
        actions: [
          {
            type: "suspend-generation",
            generation: machine.activeGeneration,
            shardCount: machine.activeShardCount,
          },
        ],
      };
    }
    case "active-suspended": {
      if (machine.phase !== "suspending-active") {
        throw new Error("Active Gateway generation is not being suspended");
      }
      const target = requireTarget(machine);
      const firstWave = target.plan.identifyWaves[0];
      if (firstWave === undefined) {
        throw new Error("Gateway generation has no Identify wave");
      }
      return {
        machine: {
          ...machine,
          phase: "starting-target",
          target: { ...target, currentWaveIndex: 0 },
        },
        actions: [
          {
            type: "start-target-wave",
            generation: target.plan.targetGeneration,
            shardIds: firstWave,
            shardCount: target.plan.targetShardCount,
          },
        ],
      };
    }
    case "target-shard-ready": {
      if (machine.phase !== "starting-target") {
        throw new Error("Target Gateway generation is not starting");
      }
      const target = requireTarget(machine);
      const currentWave = target.plan.identifyWaves[target.currentWaveIndex];
      if (currentWave === undefined || !currentWave.includes(event.shardId)) {
        throw new Error("Ready shard is not in the current Identify wave");
      }
      const readyShardIds = target.readyShardIds.includes(event.shardId)
        ? target.readyShardIds
        : [...target.readyShardIds, event.shardId].sort((left, right) => left - right);
      const currentWaveReady = currentWave.every((shardId) =>
        readyShardIds.includes(shardId),
      );
      if (!currentWaveReady) {
        return {
          machine: { ...machine, target: { ...target, readyShardIds } },
          actions: [],
        };
      }
      const nextWaveIndex = target.currentWaveIndex + 1;
      const nextWave = target.plan.identifyWaves[nextWaveIndex];
      if (nextWave !== undefined) {
        return {
          machine: {
            ...machine,
            target: {
              ...target,
              currentWaveIndex: nextWaveIndex,
              readyShardIds,
            },
          },
          actions: [
            {
              type: "start-target-wave",
              generation: target.plan.targetGeneration,
              shardIds: nextWave,
              shardCount: target.plan.targetShardCount,
            },
          ],
        };
      }
      return {
        machine: createGenerationMachine(
          target.plan.targetGeneration,
          target.plan.targetShardCount,
        ),
        actions: [
          {
            type: "activate-generation",
            generation: target.plan.targetGeneration,
            shardCount: target.plan.targetShardCount,
          },
          {
            type: "retire-generation",
            generation: target.plan.currentGeneration,
            shardCount: target.plan.currentShardCount,
          },
        ],
      };
    }
    case "target-shard-failed": {
      if (machine.phase !== "starting-target") {
        throw new Error("Target Gateway generation is not starting");
      }
      const target = requireTarget(machine);
      requireNonNegativeInteger(event.shardId, "Failed shard ID");
      if (event.shardId >= target.plan.targetShardCount || event.reason.length === 0) {
        throw new Error("Target Gateway shard failure is invalid");
      }
      return {
        machine: {
          ...machine,
          phase: "rolling-back",
          target: {
            ...target,
            failure: { shardId: event.shardId, reason: event.reason },
          },
        },
        actions: [
          {
            type: "stop-generation",
            generation: target.plan.targetGeneration,
            shardCount: target.plan.targetShardCount,
          },
          {
            type: "resume-generation",
            generation: machine.activeGeneration,
            shardCount: machine.activeShardCount,
          },
        ],
      };
    }
    case "rollback-ready":
      if (machine.phase !== "rolling-back") {
        throw new Error("Gateway generation is not rolling back");
      }
      return {
        machine: createGenerationMachine(
          machine.activeGeneration,
          machine.activeShardCount,
        ),
        actions: [],
      };
  }
}

export type GenerationDispatchRoute = {
  generation: number;
  shardId: number;
};

export function routeGenerationDispatch(
  active: { activeGeneration: number; activeShardCount: number },
  source: { generation: number; shardId: number; shardCount: number },
): GenerationDispatchRoute {
  if (
    source.generation !== active.activeGeneration ||
    source.shardCount !== active.activeShardCount ||
    !Number.isSafeInteger(source.shardId) ||
    source.shardId < 0 ||
    source.shardId >= source.shardCount
  ) {
    throw new Error("Dispatch came from a stale or mixed Gateway generation");
  }
  return { generation: source.generation, shardId: source.shardId };
}
