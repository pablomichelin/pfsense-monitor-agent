import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  NodeStatus,
  NodeUidStatus,
  Prisma,
} from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { appConfig } from '../config/app-config';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';
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
    private readonly nodeSecretCrypto: NodeSecretCryptoService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async ingestHeartbeat(request: HeartbeatRequest): Promise<{
    ok: true;
    server_time: string;
    node_status: NodeStatus;
  }> {
    const receivedAt = new Date();
    this.assertPayloadSize(request.rawBody);

    const { headerNodeUid, node, credential } = await this.authenticateNodeRequest({
      headerNodeUid: request.headerNodeUid,
      headerTimestamp: request.headerTimestamp,
      headerSignature: request.headerSignature,
      rawBody: request.rawBody,
      receivedAt,
    });

    if (request.body.node_uid !== headerNodeUid) {
      throw new BadRequestException('header/body node_uid mismatch');
    }

    const sentAt = this.parseIsoDate(request.body.sent_at, 'sent_at');

    const existingHeartbeat = await this.prisma.heartbeat.findUnique({
      where: {
        heartbeatId: request.body.heartbeat_id,
      },
    });

    if (existingHeartbeat) {
      await this.prisma.nodeCredential.update({
        where: {
          id: credential.id,
        },
        data: {
          lastUsedAt: receivedAt,
        },
      });

      return {
        ok: true,
        server_time: receivedAt.toISOString(),
        node_status: node.status,
      };
    }

    const nodeStatus = calculateNodeStatus({
      maintenanceMode: node.maintenanceMode,
      services: request.body.services,
      gateways: request.body.gateways,
    });
    const latencyMs = Math.max(
      0,
      receivedAt.getTime() - sentAt.getTime(),
    );
    const estimatedBootAt = new Date(
      sentAt.getTime() - request.body.uptime_sec * 1000,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.node.update({
        where: {
          id: node.id,
        },
        data: {
          hostname: request.body.hostname,
          managementIp: request.body.mgmt_ip ?? undefined,
          wanIp: request.body.wan_ip_reported ?? undefined,
          pfsenseVersion: request.body.pfsense_version,
          agentVersion: request.body.agent_version ?? undefined,
          lastBootAt: estimatedBootAt,
          lastSeenAt: receivedAt,
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

      await tx.heartbeat.create({
        data: {
          nodeId: node.id,
          receivedAt,
          sentAt,
          heartbeatId: request.body.heartbeat_id,
          latencyMs,
          pfsenseVersion: request.body.pfsense_version,
          agentVersion: request.body.agent_version ?? null,
          managementIp: request.body.mgmt_ip ?? null,
          wanIp: request.body.wan_ip_reported ?? null,
          uptimeSeconds: request.body.uptime_sec,
          cpuPercent: request.body.cpu_percent ?? null,
          memoryPercent: request.body.memory_percent ?? null,
          diskPercent: request.body.disk_percent ?? null,
          gatewaySummary: this.buildGatewaySummary(request.body.gateways),
          schemaVersion: request.body.schema_version,
          customerCode: request.body.customer_code,
          payloadJson: JSON.parse(
            JSON.stringify(request.body),
          ) as Prisma.InputJsonValue,
        },
      });

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

      await this.syncAlerts(tx, node.id, request.body, receivedAt);
    });

    this.logger.log(
      `heartbeat accepted node_uid=${headerNodeUid} status=${nodeStatus} ip=${
        request.clientIp ?? 'unknown'
      } cf_ray=${request.cfRay ?? 'n/a'}`,
    );

    this.realtimeService.publishDashboardRefresh({
      source: 'heartbeat_ingested',
      occurred_at: receivedAt.toISOString(),
      node_id: node.id,
      node_uid: headerNodeUid,
      reason: 'heartbeat_ingested',
    });

    return {
      ok: true,
      server_time: receivedAt.toISOString(),
      node_status: nodeStatus,
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
    node_uid_status: NodeUidStatus;
  }> {
    const receivedAt = new Date();
    this.assertPayloadSize(request.rawBody);

    const { headerNodeUid, node, credential } = await this.authenticateNodeRequest({
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

  private requireHeader(name: string, value?: string): string {
    if (!value) {
      throw new BadRequestException(`${name} header is required`);
    }

    return value;
  }

  private parseIsoDate(rawValue: string, fieldName: string): Date {
    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid ISO-8601 date`);
    }

    return parsed;
  }

  private assertTimestampWindow(
    timestamp: Date,
    receivedAt: Date,
  ): void {
    const differenceSeconds = Math.abs(
      receivedAt.getTime() - timestamp.getTime(),
    ) / 1000;

    if (differenceSeconds > appConfig.heartbeat.maxSkewSeconds) {
      throw new UnauthorizedException('timestamp outside allowed window');
    }
  }

  private assertPayloadSize(rawBody: Buffer): void {
    if (rawBody.byteLength > appConfig.heartbeat.maxPayloadBytes) {
      throw new PayloadTooLargeException('heartbeat payload exceeds 64 KB');
    }
  }

  private assertSignature(
    encryptedSecret: string,
    timestamp: string,
    rawBody: Buffer,
    providedSignature: string,
  ): void {
    let secret: string;

    try {
      secret = this.nodeSecretCrypto.decrypt(encryptedSecret);
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'unable to decrypt node secret',
      );
    }

    const payload = Buffer.concat([
      Buffer.from(timestamp, 'utf8'),
      Buffer.from('\n', 'utf8'),
      rawBody,
    ]);

    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    const normalizedProvided = providedSignature
      .trim()
      .toLowerCase()
      .replace(/^sha256=/, '');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(normalizedProvided, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('invalid heartbeat signature');
    }
  }

  private async authenticateNodeRequest(input: {
    headerNodeUid?: string;
    headerTimestamp?: string;
    headerSignature?: string;
    rawBody: Buffer;
    receivedAt: Date;
  }): Promise<{
    headerNodeUid: string;
    node: Awaited<ReturnType<IngestService['findNodeForAuth']>>;
    credential: NonNullable<
      Awaited<ReturnType<IngestService['findNodeForAuth']>>['credentials'][number]
    >;
  }> {
    const headerNodeUid = this.requireHeader('X-Node-Uid', input.headerNodeUid);
    const headerTimestampRaw = this.requireHeader(
      'X-Timestamp',
      input.headerTimestamp,
    );
    const headerTimestamp = this.parseIsoDate(
      headerTimestampRaw,
      'X-Timestamp',
    );
    const headerSignature = this.requireHeader(
      'X-Signature',
      input.headerSignature,
    );

    this.assertTimestampWindow(headerTimestamp, input.receivedAt);

    const node = await this.findNodeForAuth(headerNodeUid, input.receivedAt);
    const credential = node.credentials[0];
    if (!credential) {
      throw new ForbiddenException('active node credential not found');
    }

    this.assertSignature(
      credential.secretEncrypted,
      headerTimestampRaw,
      input.rawBody,
      headerSignature,
    );

    return {
      headerNodeUid,
      node,
      credential,
    };
  }

  private async findNodeForAuth(nodeUid: string, receivedAt: Date) {
    const node = await this.prisma.node.findUnique({
      where: {
        nodeUid,
      },
      include: {
        credentials: {
          where: {
            status: 'active',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!node) {
      throw new UnauthorizedException('unknown node');
    }

    if (node.nodeUidStatus === NodeUidStatus.conflict) {
      await this.ensureNodeUidConflictAlert(node.id, receivedAt);
      throw new ConflictException('node_uid conflict');
    }

    return node;
  }

  private buildGatewaySummary(
    gateways: HeartbeatDto['gateways'],
  ): Prisma.JsonObject {
    const summary = {
      total: gateways.length,
      online: 0,
      degraded: 0,
      down: 0,
      unknown: 0,
    };

    for (const gateway of gateways) {
      switch (gateway.status) {
        case 'online':
          summary.online += 1;
          break;
        case 'degraded':
          summary.degraded += 1;
          break;
        case 'down':
          summary.down += 1;
          break;
        default:
          summary.unknown += 1;
          break;
      }
    }

    return summary;
  }

  private async syncAlerts(
    tx: Prisma.TransactionClient,
    nodeId: string,
    body: HeartbeatDto,
    observedAt: Date,
  ): Promise<void> {
    const activeAlerts = new Map<string, ActiveAlert>();

    for (const service of body.services) {
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

    for (const gateway of body.gateways) {
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

  private async ensureNodeUidConflictAlert(
    nodeId: string,
    observedAt: Date,
  ): Promise<void> {
    const fingerprint = `node_uid_conflict:${nodeId}`;
    const existing = await this.prisma.alert.findUnique({
      where: {
        fingerprint,
      },
    });

    if (!existing) {
      await this.prisma.alert.create({
        data: {
          nodeId,
          fingerprint,
          type: AlertType.node_uid_conflict,
          severity: AlertSeverity.critical,
          title: 'node_uid conflict detected',
          description:
            'The server marked this node as conflicting and requires rekey or rebootstrap.',
          status: AlertStatus.open,
          openedAt: observedAt,
          metadataJson: {
            node_id: nodeId,
          },
        },
      });
      return;
    }

    await this.prisma.alert.update({
      where: {
        id: existing.id,
      },
      data: {
        severity: AlertSeverity.critical,
        title: 'node_uid conflict detected',
        description:
          'The server marked this node as conflicting and requires rekey or rebootstrap.',
        status: AlertStatus.open,
        openedAt:
          existing.status === AlertStatus.resolved ? observedAt : existing.openedAt,
        resolvedAt: null,
        resolutionNote: null,
      },
    });
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
