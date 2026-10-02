import { WorkerEntrypoint } from "cloudflare:workers";
import { gatewayPartitionAssignments } from "../../packages/gateway-protocol/src";
import { GATEWAY_COORDINATOR_NAME, type GatewayEnv } from "../../workers/gateway/src/environment";
export { GatewayCoordinator } from "../../workers/gateway/src/gateway-coordinator";
import { GatewayPartition as ProductionGatewayPartition } from "../../workers/gateway/src/gateway-partition";

export class GatewayPartition extends ProductionGatewayPartition {
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
          const target = {
            generation: 1,
            shardCount: 24,
            assignment,
            shardIds: Array.from({ length: assignment.shardCount }, (_, i) => assignment.firstShardId + i),
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
