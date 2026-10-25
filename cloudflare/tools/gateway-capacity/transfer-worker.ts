import { WorkerEntrypoint } from "cloudflare:workers";
import { gatewayPartitionAssignments } from "../../packages/gateway-protocol/src";
import { GATEWAY_COORDINATOR_NAME, type GatewayEnv } from "../../workers/gateway/src/environment";
import { GatewayTransferRequestSchema } from "../../workers/gateway/src/gateway-placement";
export { GatewayCoordinator } from "../../workers/gateway/src/gateway-coordinator";
export { GatewayPartition } from "../../workers/gateway/src/gateway-partition";

export class FixtureDiscordRest extends WorkerEntrypoint {
  logGuildLifecycle() { return { status: "delivered" as const }; }
}

export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const url = new URL(request.url);
    const coordinator = env.GATEWAY_COORDINATOR.getByName(GATEWAY_COORDINATOR_NAME);
    switch (url.pathname) {
      case "/start": {
        await coordinator.initializeFleet(1, 25, 6);
        for (const assignment of gatewayPartitionAssignments(25, 6)) {
          const partition = env.GATEWAY_PARTITION.getByName(assignment.partitionName);
          const command = { generation: 1, shardCount: 25, assignment,
            shardIds: Array.from({ length: assignment.shardCount }, (_, i) => assignment.firstShardId + i) };
          await partition.executeFleetCommand({ ...command, type: "activate-generation" });
          await partition.executeFleetCommand({ ...command, type: "start-target-shards" });
        }
        break;
      }
      case "/status": return Response.json(await coordinator.fleetSnapshot());
      case "/inventory": return Response.json(await coordinator.activeGuildInventory());
      case "/transfer": return Response.json(await coordinator.beginTransfer(GatewayTransferRequestSchema.parse(await request.json())));
      case "/continue": return Response.json(await coordinator.continueTransfer(Number(url.searchParams.get("epoch"))));
      case "/rollback": return Response.json(await coordinator.rollbackTransfer(Number(url.searchParams.get("epoch"))));
      case "/recover":
        // The runtime's persisted alarms perform recovery after an ungraceful restart.
        return Response.json(await coordinator.fleetSnapshot());
      case "/stop": await coordinator.stopFleet(); break;
      default: return new Response(null, { status: 404 });
    }
    return Response.json({ status: "ok" });
  },
} satisfies ExportedHandler<GatewayEnv>;
