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
import { NodeCommandsService } from '../node-commands/node-commands.service';
import { NotificationsDispatcherService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  HeartbeatDto,
  HeartbeatGatewayDto,
  HeartbeatServiceDto,
} from './dto/heartbeat.dto';
import {
  buildGatewayAlert,
  buildServiceAlert,
  calculateNodeStatus,
  isGatewayProblem,
  isServiceProblem,
  mapGatewayStatus,
  mapServiceStatus,
} from '../nodes/node-status.util';
import {
  normalizeBackupSchedulePolicy,
  toStoredBackupPolicyJson,
} from '../nodes/backup-policy.util';
import {
  normalizeHeartbeatCertificates,
  syncCertificateExpirationAlerts,
  syncNodeCertificates,
} from '../certificates/certificate-sync.util';
import {
  normalizeHeartbeatCapabilities,
  syncNodeCapabilities,
} from '../node-capabilities/capability-sync.util';
import {
  isPfsenseForceCheckPending,
  isPfsenseUpdateBranchTarget,
} from '../pfsense-upgrade/pfsense-update-check.util';

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
    private readonly nodeCommandsService: NodeCommandsService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsDispatcher: NotificationsDispatcherService,
  ) {}

  async ingestHeartbeat(request: HeartbeatRequest): Promise<{
    ok: true;
    server_time: string;
    node_status: NodeStatus;
    commands?: Array<{
      id: string;
      type: NodeCommandType;
      expires_at: string;
      payload?: Record<string, unknown>;
    }>;
    force_update_check?: boolean;
    force_repo_repair?: boolean;
    force_set_update_branch?: string;
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
      await this.prisma.node.update({
        where: {
          id: node.id,
        },
        data: {
          lastSeenAt: receivedAt,
        },
      });

      await this.prisma.nodeCredential.update({
        where: {
          id: credential.id,
        },
        data: {
          lastUsedAt: receivedAt,
        },
      });

      await this.backupsCommandService.reconcileSucceededCommands(node.id);

      // C7: replay do mesmo heartbeat_id NAO reentrega comandos pendentes
      // (evita dupla execucao). Comandos seguem na proxima telemetria nova.
      return {
        ok: true,
        server_time: receivedAt.toISOString(),
        node_status: node.status,
      };
    }

    const servicesProvided = request.body.services != null;
    const gatewaysProvided = request.body.gateways != null;
    const services = request.body.services ?? [];
    const gateways = request.body.gateways ?? [];

    const nodeStatus = await this.resolveHeartbeatNodeStatus({
      nodeId: node.id,
      maintenanceMode: node.maintenanceMode,
      persistedStatus: node.status,
      servicesProvided,
      gatewaysProvided,
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

    const updateCheckProvided =
      request.body.pfsense_update_checked_at != null ||
      request.body.pfsense_update_available !== undefined ||
      request.body.pfsense_update_check_error != null ||
      request.body.pfsense_update_error_class != null ||
      request.body.pfsense_update_log_snippet != null ||
      request.body.pfsense_firmware_branch != null;

    const haDetectedProvided = request.body.ha_detected !== undefined;
    const configBackupProvided = request.body.config_backup != null;
    const certificatesProvided = request.body.certificates != null;
    const capabilitiesProvided = request.body.capabilities != null;
    const localUsersProvided = request.body.local_users != null;
    const normalizedBackupPolicy = configBackupProvided
      ? normalizeBackupSchedulePolicy(request.body.config_backup)
      : null;

    let staleSkipped = false;
    const openedAlertIds =
      (await this.prisma.$transaction(async (tx) => {
      // C3: trava a linha do node e aplica CAS por sent_at para impedir que um
      // heartbeat antigo (fora de ordem) sobrescreva um snapshot mais novo.
      const lockedRows = await tx.$queryRaw<
        Array<{
          last_heartbeat_id: string | null;
          last_heartbeat_sent_at: Date | null;
        }>
      >(Prisma.sql`SELECT last_heartbeat_id, last_heartbeat_sent_at FROM nodes WHERE id = ${node.id}::uuid FOR UPDATE`);

      const lockedHeartbeatId = lockedRows[0]?.last_heartbeat_id ?? null;
      const lockedSentAt = lockedRows[0]?.last_heartbeat_sent_at ?? null;

      const alreadyApplied = lockedHeartbeatId === request.body.heartbeat_id;
      const isStale =
        lockedSentAt !== null && sentAt.getTime() <= lockedSentAt.getTime();

      if (alreadyApplied || isStale) {
        // Aplicado por outra requisicao concorrente ou telemetria mais antiga:
        // atualiza apenas presenca/uso da credencial, preserva o snapshot novo.
        staleSkipped = true;
        await tx.node.update({
          where: { id: node.id },
          data: { lastSeenAt: receivedAt },
        });
        await tx.nodeCredential.update({
          where: { id: credential.id },
          data: { lastUsedAt: receivedAt },
        });
        return;
      }

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
          ...(updateCheckProvided
            ? {
                pfsenseUpdateAvailable: request.body.pfsense_update_available ?? null,
                pfsenseUpdateTargetVersion:
                  request.body.pfsense_update_target_version?.trim() || null,
                pfsenseUpdateCheckedAt: request.body.pfsense_update_checked_at
                  ? this.nodeRequestAuth.parseIsoDate(
                      request.body.pfsense_update_checked_at,
                      'pfsense_update_checked_at',
                    )
                  : sentAt,
                pfsenseUpdateCheckError:
                  request.body.pfsense_update_check_error?.trim() || null,
                pfsenseUpdateErrorClass:
                  request.body.pfsense_update_error_class?.trim() || null,
                pfsenseUpdateLogSnippet:
                  request.body.pfsense_update_log_snippet?.trim() || null,
                pfsenseFirmwareBranch:
                  request.body.pfsense_firmware_branch?.trim() || null,
                pfsenseFirmwareBranchDescr:
                  request.body.pfsense_firmware_branch_descr?.trim() || null,
                pfsenseUpdateBranches:
                  request.body.pfsense_update_branches?.trim() || null,
              }
            : {}),
          ...(haDetectedProvided
            ? { haDetectedFromAgent: request.body.ha_detected ?? null }
            : {}),
          ...(normalizedBackupPolicy
            ? {
                configBackupPolicyJson: toStoredBackupPolicyJson(
                  normalizedBackupPolicy,
                  sentAt,
                ),
              }
            : {}),
          ...(localUsersProvided
            ? {
                localUsersSnapshotJson: request.body
                  .local_users as unknown as Prisma.InputJsonValue,
              }
            : {}),
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

      let certificateAlertIds: string[] = [];
      if (
        appConfig.certificates.enabled &&
        certificatesProvided &&
        request.body.certificates != null
      ) {
        let normalizedCertificates;
        try {
          normalizedCertificates = normalizeHeartbeatCertificates(
            request.body.certificates,
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'invalid certificate payload';
          throw new BadRequestException(message);
        }
        await syncNodeCertificates(
          tx,
          node.id,
          normalizedCertificates,
          sentAt,
        );
        certificateAlertIds = await syncCertificateExpirationAlerts(
          tx,
          node.id,
          normalizedCertificates,
          receivedAt,
        );
      }

      if (
        appConfig.nodeCapabilities.enabled &&
        capabilitiesProvided &&
        request.body.capabilities != null
      ) {
        const normalizedCapabilities = normalizeHeartbeatCapabilities(
          request.body.capabilities,
        );
        await syncNodeCapabilities(
          tx,
          node.id,
          normalizedCapabilities,
          sentAt,
        );
      }

      const heartbeatAlertIds = await this.syncAlerts(tx, node.id, request.body, receivedAt, {
        syncServices: servicesProvided,
        syncGateways: gatewaysProvided,
      });

      return [...heartbeatAlertIds, ...certificateAlertIds];
    })) ?? [];

    this.notificationsDispatcher.dispatchForAlertIds(openedAlertIds);

    const heartbeatLogMessage =
      `heartbeat accepted node_uid=${headerNodeUid} status=${nodeStatus} ip=${
        request.clientIp ?? 'unknown'
      } cf_ray=${request.cfRay ?? 'n/a'}`;
    if (nodeStatus === NodeStatus.online) {
      this.logger.debug(heartbeatLogMessage);
    } else {
      this.logger.warn(heartbeatLogMessage);
    }

    if (staleSkipped) {
      // C3/C7: telemetria antiga ou duplicada — nao publica refresh nem entrega comandos.
      return {
        ok: true,
        server_time: receivedAt.toISOString(),
        node_status: node.status,
      };
    }

    // D1: inclui client_id para que a stream SSE filtre por escopo do usuario.
    const siteForScope = await this.prisma.site.findUnique({
      where: { id: node.siteId },
      select: { clientId: true },
    });

    this.realtimeService.publishDashboardRefresh({
      source: 'heartbeat_ingested',
      occurred_at: receivedAt.toISOString(),
      node_id: node.id,
      node_uid: headerNodeUid,
      client_id: siteForScope?.clientId ?? undefined,
      reason: 'heartbeat_ingested',
    });

    await this.backupsCommandService.reconcileSucceededCommands(node.id);
    const commands =
      await this.nodeCommandsService.getPendingCommandsForNode(node.id);
    const forceFlags = await this.resolvePfsenseUpdateForceFlags(node.id);

    return {
      ok: true,
      server_time: receivedAt.toISOString(),
      node_status: nodeStatus,
      ...(commands.length > 0 ? { commands } : {}),
      ...(forceFlags.forceSetUpdateBranch
        ? { force_set_update_branch: forceFlags.forceSetUpdateBranch }
        : {}),
      ...(forceFlags.forceRepoRepair ? { force_repo_repair: true } : {}),
      ...(forceFlags.forceUpdateCheck ? { force_update_check: true } : {}),
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

  private async resolvePfsenseUpdateForceFlags(nodeId: string): Promise<{
    forceUpdateCheck: boolean;
    forceRepoRepair: boolean;
    forceSetUpdateBranch: string | null;
  }> {
    const row = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        pfsenseUpdateForceCheckAt: true,
        pfsenseRepoRepairRequestedAt: true,
        pfsenseUpdateBranchRequestedAt: true,
        pfsenseUpdateBranchTarget: true,
        pfsenseUpdateCheckedAt: true,
      },
    });

    const branchPending = isPfsenseForceCheckPending(
      row?.pfsenseUpdateBranchRequestedAt,
      row?.pfsenseUpdateCheckedAt,
    );
    const forceSetUpdateBranch =
      branchPending &&
      isPfsenseUpdateBranchTarget(row?.pfsenseUpdateBranchTarget)
        ? row.pfsenseUpdateBranchTarget
        : null;

    const forceRepoRepair =
      !forceSetUpdateBranch &&
      isPfsenseForceCheckPending(
        row?.pfsenseRepoRepairRequestedAt,
        row?.pfsenseUpdateCheckedAt,
      );

    return {
      forceSetUpdateBranch,
      forceRepoRepair,
      forceUpdateCheck:
        !forceSetUpdateBranch &&
        !forceRepoRepair &&
        isPfsenseForceCheckPending(
          row?.pfsenseUpdateForceCheckAt,
          row?.pfsenseUpdateCheckedAt,
        ),
    };
  }

  private assertPayloadSize(rawBody: Buffer): void {
    if (rawBody.byteLength > appConfig.heartbeat.maxPayloadBytes) {
      throw new PayloadTooLargeException('heartbeat payload exceeds 64 KB');
    }
  }

  private async resolveHeartbeatNodeStatus(input: {
    nodeId: string;
    maintenanceMode: boolean;
    persistedStatus: NodeStatus;
    servicesProvided: boolean;
    gatewaysProvided: boolean;
    services: HeartbeatServiceDto[];
    gateways: HeartbeatGatewayDto[];
  }): Promise<NodeStatus> {
    if (input.maintenanceMode) {
      return NodeStatus.maintenance;
    }

    // Heartbeat light: recalcular a partir do ultimo snapshot persistido em vez de
    // preservar offline/degraded do lifecycle (comunicacao recente = node vivo).
    let services = input.services;
    let gateways = input.gateways;

    if (!input.servicesProvided || !input.gatewaysProvided) {
      const [persistedServices, persistedGateways] = await Promise.all([
        input.servicesProvided
          ? Promise.resolve([])
          : this.prisma.nodeServiceStatus.findMany({
              where: { nodeId: input.nodeId },
            }),
        input.gatewaysProvided
          ? Promise.resolve([])
          : this.prisma.nodeGatewayStatus.findMany({
              where: { nodeId: input.nodeId },
            }),
      ]);

      if (!input.servicesProvided) {
        services = persistedServices.map((service) => ({
          name: service.serviceName,
          status: service.status,
          message: service.message ?? undefined,
        }));
      }

      if (!input.gatewaysProvided) {
        gateways = persistedGateways.map((gateway) => ({
          name: gateway.gatewayName,
          status: gateway.status,
          latency_ms: gateway.latencyMs ?? undefined,
          loss_percent: gateway.lossPercent ?? undefined,
        }));
      }
    }

    return calculateNodeStatus({
      maintenanceMode: input.maintenanceMode,
      services,
      gateways,
    });
  }

  private async syncAlerts(
    tx: Prisma.TransactionClient,
    nodeId: string,
    body: HeartbeatDto,
    observedAt: Date,
    options: {
      syncServices: boolean;
      syncGateways: boolean;
    },
  ): Promise<string[]> {
    const activeAlerts = new Map<string, ActiveAlert>();
    const notifyAlertIds: string[] = [];

    if (options.syncServices) {
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
    }

    if (options.syncGateways) {
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
        const created = await tx.alert.create({
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
        notifyAlertIds.push(created.id);
        continue;
      }

      const wasResolved = existing.status === AlertStatus.resolved;

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
          openedAt: wasResolved ? observedAt : existing.openedAt,
          acknowledgedAt: wasResolved ? null : existing.acknowledgedAt,
          acknowledgedBy: wasResolved ? null : existing.acknowledgedBy,
          resolvedAt: null,
          resolutionNote: null,
        },
      });

      if (wasResolved) {
        notifyAlertIds.push(existing.id);
      }
    }

    // C-SA: matriz de resolucao por tipo de alerta no ingest de heartbeat.
    // - service_down/gateway_down: so podem ser resolvidos quando o respectivo
    //   conjunto FOI enviado neste heartbeat. Em heartbeat parcial/light (sem
    //   services/gateways no payload) NAO resolvemos nem abrimos esses alertas —
    //   o estado anterior e preservado, evitando "recovery" falso.
    // - heartbeat_missing: a propria chegada do heartbeat e a recuperacao, entao
    //   pode ser resolvido aqui (independe de services/gateways).
    // - node_uid_conflict: NUNCA e resolvido pelo ingest. Seu ciclo de vida e
    //   governado pela autenticacao do node e pelo rekey/rebootstrap; resolver via
    //   heartbeat mascararia um conflito ainda nao tratado.
    for (const existing of existingAlerts) {
      if (existing.type === AlertType.node_uid_conflict) {
        continue;
      }

      if (
        existing.type !== AlertType.heartbeat_missing &&
        activeAlerts.has(existing.fingerprint)
      ) {
        continue;
      }

      if (
        existing.type === AlertType.service_down &&
        !options.syncServices
      ) {
        continue;
      }

      if (
        existing.type === AlertType.gateway_down &&
        !options.syncGateways
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

    return notifyAlertIds;
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
