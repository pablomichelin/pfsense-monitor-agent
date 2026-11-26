import type { NodeStatus, Prisma } from '@prisma/client';
import type { HeartbeatGatewayDto, HeartbeatServiceDto } from '../ingest/dto/heartbeat.dto';
import { calculateNodeStatus } from './node-status.util';

export async function calculateNodeStatusFromSnapshot(
  db: Prisma.TransactionClient,
  nodeId: string,
  current: { services?: HeartbeatServiceDto[]; gateways?: HeartbeatGatewayDto[] } = {},
): Promise<NodeStatus> {
  const [services, gateways] = await Promise.all([
    current.services ?? db.nodeServiceStatus.findMany({ where: { nodeId } }).then((rows) =>
      rows.map((service) => ({
        name: service.serviceName,
        status: service.status,
        message: service.message ?? undefined,
      })),
    ),
    current.gateways ?? db.nodeGatewayStatus.findMany({ where: { nodeId } }).then((rows) =>
      rows.map((gateway) => ({
        name: gateway.gatewayName,
        status: gateway.status,
        latency_ms: gateway.latencyMs ?? undefined,
        loss_percent: gateway.lossPercent ?? undefined,
      })),
    ),
  ]);
  return calculateNodeStatus({ maintenanceMode: false, services, gateways });
}
