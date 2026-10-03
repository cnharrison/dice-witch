import { WorkerEntrypoint } from "cloudflare:workers";
import { gatewayPartitionAssignments } from "../../packages/gateway-protocol/src";
import { GATEWAY_COORDINATOR_NAME, type GatewayEnv } from "../../workers/gateway/src/environment";
import { GatewayCoordinator as ProductionGatewayCoordinator } from "../../workers/gateway/src/gateway-coordinator";
import { GatewayPartition as ProductionGatewayPartition } from "../../workers/gateway/src/gateway-partition";

function benchmarkNamespace<T extends GatewayEnv["GATEWAY_COORDINATOR"] | GatewayEnv["GATEWAY_PARTITION"]>(namespace: T, capacity: string): T {
  return new Proxy(namespace, {
    get(target, property): unknown {
      if (property === "getByName") return (name: string, options?: DurableObjectNamespaceGetDurableObjectOptions) => target.getByName(`memory-capacity-${capacity}:${name}`, options);
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function benchmarkEnv(env: GatewayEnv): GatewayEnv {
  const capacity = env.GATEWAY_FLEET_CONNECTION_CAPACITY;
  return { ...env, GATEWAY_COORDINATOR: benchmarkNamespace(env.GATEWAY_COORDINATOR, capacity), GATEWAY_PARTITION: benchmarkNamespace(env.GATEWAY_PARTITION, capacity) };
}

export class GatewayCoordinator extends ProductionGatewayCoordinator {
  constructor(ctx: DurableObjectState, env: GatewayEnv) {
    super(ctx, benchmarkEnv(env));
  }
}

export class GatewayPartition extends ProductionGatewayPartition {
  constructor(ctx: DurableObjectState, env: GatewayEnv) {
    super(ctx, benchmarkEnv(env));
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/recover") return new Response(null, { status: 404 });
    await this.alarm();
    return Response.json({ status: "ok" });
  }
}

export class FixtureDiscordRest extends WorkerEntrypoint {
  logGuildLifecycle() {
    return { status: "delivered" as const };
  }
}

export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    env = benchmarkEnv(env);
    const url = new URL(request.url);
    const capacity = Number(env.GATEWAY_FLEET_CONNECTION_CAPACITY);
    const assignments = gatewayPartitionAssignments(24, capacity);
    const index = Number(url.searchParams.get("partition"));
    const assignment = assignments[index];
    if (assignment === undefined) throw new Error("Invalid fixture partition");
    const partition = env.GATEWAY_PARTITION.getByName(assignment.partitionName);
    const coordinator = env.GATEWAY_COORDINATOR.getByName(GATEWAY_COORDINATOR_NAME);
    switch (url.pathname) {
      case "/start":
        await coordinator.initializeFleet(1, 24, capacity);
        {
          const shardParameter = url.searchParams.get("shard");
          const shard = Number(shardParameter);
          if (shardParameter !== null && (!Number.isSafeInteger(shard) || String(shard) !== shardParameter || shard < assignment.firstShardId || shard > assignment.lastShardId)) throw new Error("Invalid benchmark shard");
          const target = {
            generation: 1,
            shardCount: 24,
            assignment,
            shardIds: shardParameter === null ? Array.from({ length: assignment.shardCount }, (_, i) => assignment.firstShardId + i) : [shard],
          };
          await partition.executeFleetCommand({ type: "start-target-shards", ...target });
          await partition.executeFleetCommand({ type: "activate-generation", ...target });
        }
        break;
      case "/status":
        return Response.json(await partition.fleetStatus());
      case "/inventory":
        return Response.json(await partition.fleetGuildInventory());
      case "/recover":
        await partition.fetch(new Request("http://benchmark.local/recover"));
        break;
      case "/stop":
        await partition.shutdownFleet();
        break;
      default:
        return new Response(null, { status: 404 });
    }
    return Response.json({ status: "ok" });
  },
} satisfies ExportedHandler<GatewayEnv>;
