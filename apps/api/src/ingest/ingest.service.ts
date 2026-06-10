import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  NodeCommandType,
  NodeStatus,
  Prisma,
} from '@prisma/client';
import { appConfig } from '../config/app-config';
import { NodeRequestAuthService } from '../common/node-request-auth.service';
import { BackupsCommandService } from '../backups/backups-command.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { HeartbeatDto } from './dto/heartbeat.dto';
import {
  buildGatewayAlert,
  buildServiceAlert,
  calculateNodeStatus,
  isGatewayProblem,
  isServiceProblem,
  mapGatewayStatus,
  mapServiceStatus,
} from '../nodes/node-status.util';

interface HeartbeatRequest {
  body: HeartbeatDto;
  rawBody: Buffer;
  headerNodeUid?: string;
  headerTimestamp?: string;
  headerSignature?: string;
  clientIp?: string;
  cfRay?: string;
}

interface ActiveAlert {
  fingerprint: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadataJson?: Prisma.JsonObject;
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeRequestAuth: NodeRequestAuthService,
    private readonly backupsCommandService: BackupsCommandService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async ingestHeartbeat(request: HeartbeatRequest): Promise<{
    ok: true;
    server_time: string;
    node_status: NodeStatus;
    commands?: Array<{
      id: string;
      type: NodeCommandType;
      expires_at: string;
    }>;
  }> {
    const receivedAt = new Date();
    this.assertPayloadSize(request.rawBody);

    const { headerNodeUid, node, credential } =
      await this.nodeRequestAuth.authenticateNodeRequest({
        headerNodeUid: request.headerNodeUid,
        headerTimestamp: request.headerTimestamp,
        headerSignature: request.headerSignature,
        rawBody: request.rawBody,
        receivedAt,
      });

    if (request.body.node_uid !== headerNodeUid) {
      throw new BadRequestException('header/body node_uid mismatch');
    }

    const sentAt = this.nodeRequestAuth.parseIsoDate(
      request.body.sent_at,
      'sent_at',
    );

    if (node.lastHeartbeatId === request.body.heartbeat_id) {
      await this.prisma.nodeCredential.update({
        where: {
          id: credential.id,
        },
        data: {
          lastUsedAt: receivedAt,
        },
      });

      await this.backupsCommandService.reconcileSucceededCommands(node.id);
      const commands =
        await this.backupsCommandService.getPendingCommandsForNode(node.id);

      return {
        ok: true,
        server_time: receivedAt.toISOString(),
        node_status: node.status,
        ...(commands.length > 0 ? { commands } : {}),
      };
    }

    const services = request.body.services ?? [];
    const gateways = request.body.gateways ?? [];
    const nodeStatus = calculateNodeStatus({
      maintenanceMode: node.maintenanceMode,
      services,
      gateways,
    });
    const latencyMs = Math.max(0, receivedAt.getTime() - sentAt.getTime());
    const estimatedBootAt = new Date(
      sentAt.getTime() - request.body.uptime_sec * 1000,
    );

    let managementIp = (request.body.mgmt_ip ?? '').trim() || undefined;
    let wanIp = (request.body.wan_ip_reported ?? '').trim() || undefined;
    const ifaces = request.body.interfaces as
      | Array<{ name?: string; ip?: string }>
      | undefined;
    if (ifaces?.length) {
      if (!managementIp) {
        const lan = ifaces.find(
          (i) =>
            (i?.name ?? '').toLowerCase() === 'lan' &&
            (i?.ip ?? '').trim() !== '',
        );
        if (lan?.ip) managementIp = (lan.ip as string).trim();
      }
      if (!wanIp) {
        const wan = ifaces.find(
          (i) =>
            (i?.name ?? '').toLowerCase() === 'wan' &&
            (i?.ip ?? '').trim() !== '',
        );
        if (wan?.ip) wanIp = (wan.ip as string).trim();
      }
    }

    const networkInterfaces = Array.isArray(request.body.interfaces)
      ? (JSON.parse(
          JSON.stringify(request.body.interfaces),
        ) as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    await this.prisma.$transaction(async (tx) => {
      await tx.node.update({
        where: {
          id: node.id,
        },
        data: {
          hostname: request.body.hostname,
          ...(node.displayName == null && request.body.hostname
            ? { displayName: request.body.hostname }
            : {}),
          ...(managementIp !== undefined ? { managementIp } : {}),
          ...(wanIp !== undefined ? { wanIp } : {}),
          pfsenseVersion: request.body.pfsense_version,
          agentVersion: request.body.agent_version ?? undefined,
          lastBootAt: estimatedBootAt,
          lastSeenAt: receivedAt,
          lastHeartbeatId: request.body.heartbeat_id,
          lastHeartbeatSentAt: sentAt,
          lastLatencyMs: latencyMs,
          uptimeSeconds: request.body.uptime_sec,
          cpuPercent: request.body.cpu_percent ?? null,
          memoryPercent: request.body.memory_percent ?? null,
          diskPercent: request.body.disk_percent ?? null,
          schemaVersion: request.body.schema_version,
          customerCode: request.body.customer_code,
          networkInterfacesJson: networkInterfaces,
          status: nodeStatus,
        },
      });

      await tx.nodeCredential.update({
        where: {
          id: credential.id,
        },
        data: {
          lastUsedAt: receivedAt,
        },
      });

      if (request.body.services != null) {
        const bodyServiceNames = request.body.services.map((s) => s.name);
        for (const service of request.body.services) {
          await tx.nodeServiceStatus.upsert({
            where: {
              nodeId_serviceName: {
                nodeId: node.id,
                serviceName: service.name,
              },
            },
            create: {
              nodeId: node.id,
              serviceName: service.name,
              status: mapServiceStatus(service.status),
              message: service.message ?? null,
              observedAt: sentAt,
            },
            update: {
              status: mapServiceStatus(service.status),
              message: service.message ?? null,
              observedAt: sentAt,
            },
          });
        }
        if (bodyServiceNames.length > 0) {
          await tx.nodeServiceStatus.deleteMany({
            where: {
              nodeId: node.id,
              serviceName: { notIn: bodyServiceNames },
            },
          });
        } else {
          await tx.nodeServiceStatus.deleteMany({
            where: { nodeId: node.id },
          });
        }
      }

      if (request.body.gateways != null) {
        const bodyGatewayNames = request.body.gateways.map((g) => g.name);
        for (const gateway of request.body.gateways) {
          await tx.nodeGatewayStatus.upsert({
            where: {
              nodeId_gatewayName: {
                nodeId: node.id,
                gatewayName: gateway.name,
              },
            },
            create: {
              nodeId: node.id,
              gatewayName: gateway.name,
              status: mapGatewayStatus(gateway.status),
              lossPercent: gateway.loss_percent ?? null,
              latencyMs: gateway.latency_ms ?? null,
              observedAt: sentAt,
            },
            update: {
              status: mapGatewayStatus(gateway.status),
              lossPercent: gateway.loss_percent ?? null,
              latencyMs: gateway.latency_ms ?? null,
              observedAt: sentAt,
            },
          });
        }
        if (bodyGatewayNames.length > 0) {
          await tx.nodeGatewayStatus.deleteMany({
            where: {
              nodeId: node.id,
              gatewayName: { notIn: bodyGatewayNames },
            },
          });
        } else {
          await tx.nodeGatewayStatus.deleteMany({
            where: { nodeId: node.id },
          });
        }
      }

      await this.syncAlerts(tx, node.id, request.body, receivedAt);
    });

    const heartbeatLogMessage =
      `heartbeat accepted node_uid=${headerNodeUid} status=${nodeStatus} ip=${
        request.clientIp ?? 'unknown'
      } cf_ray=${request.cfRay ?? 'n/a'}`;
    if (nodeStatus === NodeStatus.online) {
      this.logger.debug(heartbeatLogMessage);
    } else {
      this.logger.warn(heartbeatLogMessage);
    }

    this.realtimeService.publishDashboardRefresh({
      source: 'heartbeat_ingested',
      occurred_at: receivedAt.toISOString(),
      node_id: node.id,
      node_uid: headerNodeUid,
      reason: 'heartbeat_ingested',
    });

    await this.backupsCommandService.reconcileSucceededCommands(node.id);
    const commands =
      await this.backupsCommandService.getPendingCommandsForNode(node.id);

    return {
      ok: true,
      server_time: receivedAt.toISOString(),
      node_status: nodeStatus,
      ...(commands.length > 0 ? { commands } : {}),
    };
  }

  async testConnection(request: {
    rawBody: Buffer;
    headerNodeUid?: string;
    headerTimestamp?: string;
    headerSignature?: string;
    clientIp?: string;
    cfRay?: string;
  }): Promise<{
    ok: true;
    message: 'connection validated';
    server_time: string;
    node_status: NodeStatus;
    node_uid_status: string;
  }> {
    const receivedAt = new Date();
    this.assertPayloadSize(request.rawBody);

    const { headerNodeUid, node, credential } =
      await this.nodeRequestAuth.authenticateNodeRequest({
        headerNodeUid: request.headerNodeUid,
        headerTimestamp: request.headerTimestamp,
        headerSignature: request.headerSignature,
        rawBody: request.rawBody,
        receivedAt,
      });

    await this.prisma.nodeCredential.update({
      where: {
        id: credential.id,
      },
      data: {
        lastUsedAt: receivedAt,
      },
    });

    await this.writeAuditLog({
      actorType: 'node_credential',
      actorId: credential.id,
      action: 'ingest.test_connection',
      targetType: 'node',
      targetId: node.id,
      ipAddress: request.clientIp,
      metadataJson: {
        node_uid: headerNodeUid,
        node_status: node.status,
        node_uid_status: node.nodeUidStatus,
        cf_ray: request.cfRay ?? null,
      },
    });

    this.logger.log(
      `connection test validated node_uid=${headerNodeUid} status=${node.status} ip=${
        request.clientIp ?? 'unknown'
      } cf_ray=${request.cfRay ?? 'n/a'}`,
    );

    return {
      ok: true,
      message: 'connection validated',
      server_time: receivedAt.toISOString(),
      node_status: node.status,
      node_uid_status: node.nodeUidStatus,
    };
  }

  private assertPayloadSize(rawBody: Buffer): void {
    if (rawBody.byteLength > appConfig.heartbeat.maxPayloadBytes) {
      throw new PayloadTooLargeException('heartbeat payload exceeds 64 KB');
    }
  }

  private async syncAlerts(
    tx: Prisma.TransactionClient,
    nodeId: string,
    body: HeartbeatDto,
    observedAt: Date,
  ): Promise<void> {
    const activeAlerts = new Map<string, ActiveAlert>();

    for (const service of body.services ?? []) {
      if (!isServiceProblem(service)) {
        continue;
      }

      const details = buildServiceAlert(service);
      if (!details) {
        continue;
      }

      const fingerprint = `service_down:${nodeId}:${service.name}`;
      activeAlerts.set(fingerprint, {
        fingerprint,
        type: AlertType.service_down,
        severity: details.severity,
        title: details.title,
        description: details.description,
        metadataJson: {
          service_name: service.name,
          service_status: service.status,
        },
      });
    }

    for (const gateway of body.gateways ?? []) {
      if (!isGatewayProblem(gateway)) {
        continue;
      }

      const details = buildGatewayAlert(gateway);
      if (!details) {
        continue;
      }

      const fingerprint = `gateway_down:${nodeId}:${gateway.name}`;
      activeAlerts.set(fingerprint, {
        fingerprint,
        type: AlertType.gateway_down,
        severity: details.severity,
        title: details.title,
        description: details.description,
        metadataJson: {
          gateway_name: gateway.name,
          gateway_status: gateway.status,
          latency_ms: gateway.latency_ms ?? null,
          loss_percent: gateway.loss_percent ?? null,
        },
      });
    }

    const existingAlerts = await tx.alert.findMany({
      where: {
        nodeId,
        type: {
          in: [
            AlertType.service_down,
            AlertType.gateway_down,
            AlertType.heartbeat_missing,
            AlertType.node_uid_conflict,
          ],
        },
      },
    });

    const existingByFingerprint = new Map(
      existingAlerts.map((alert) => [alert.fingerprint, alert]),
    );

    for (const alert of activeAlerts.values()) {
      const existing = existingByFingerprint.get(alert.fingerprint);

      if (!existing) {
        await tx.alert.create({
          data: {
            nodeId,
            fingerprint: alert.fingerprint,
            type: alert.type,
            severity: alert.severity,
            title: alert.title,
            description: alert.description,
            status: AlertStatus.open,
            metadataJson: alert.metadataJson,
            openedAt: observedAt,
          },
        });
        continue;
      }

      await tx.alert.update({
        where: {
          id: existing.id,
        },
        data: {
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          status: AlertStatus.open,
          metadataJson: alert.metadataJson,
          openedAt:
            existing.status === AlertStatus.resolved
              ? observedAt
              : existing.openedAt,
          acknowledgedAt:
            existing.status === AlertStatus.resolved
              ? null
              : existing.acknowledgedAt,
          acknowledgedBy:
            existing.status === AlertStatus.resolved
              ? null
              : existing.acknowledgedBy,
          resolvedAt: null,
          resolutionNote: null,
        },
      });
    }

    for (const existing of existingAlerts) {
      if (
        existing.type !== AlertType.heartbeat_missing &&
        existing.type !== AlertType.node_uid_conflict &&
        activeAlerts.has(existing.fingerprint)
      ) {
        continue;
      }

      if (existing.status === AlertStatus.resolved) {
        continue;
      }

      await tx.alert.update({
        where: {
          id: existing.id,
        },
        data: {
          status: AlertStatus.resolved,
          resolvedAt: observedAt,
          resolutionNote: 'Recovered via heartbeat ingestion',
        },
      });
    }
  }

  private async writeAuditLog(input: {
    actorType: string;
    actorId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    ipAddress?: string;
    metadataJson?: Record<string, string | null>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ipAddress: input.ipAddress,
        metadataJson: input.metadataJson,
      },
    });
  }
}
