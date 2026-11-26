import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  NodeStatus,
  Prisma,
} from '@prisma/client';
import { appConfig } from '../config/app-config';
import { NodeCommandsService } from '../node-commands/node-commands.service';
import { NotificationsDispatcherService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { deriveEffectiveNodeStatus } from './node-status.util';

@Injectable()
export class NodeLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NodeLifecycleService.name);
  private timer?: NodeJS.Timeout;
  private isReconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly nodeCommandsService: NodeCommandsService,
    private readonly notificationsDispatcher: NotificationsDispatcherService,
  ) {}

  async onModuleInit(): Promise<void> {
    const run = (reason: 'startup' | 'interval') =>
      this.reconcileStatuses(reason).catch((error) => {
        this.logger.warn(`node lifecycle reconciliation failed: ${String(error)}`);
      });

    await run('startup');
    this.timer = setInterval(() => {
      void run('interval');
    }, appConfig.nodeStatus.reconcileIntervalSeconds * 1000);

    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async reconcileStatuses(reason: 'startup' | 'interval'): Promise<void> {
    if (this.isReconciling) {
      return;
    }

    this.isReconciling = true;

    const now = new Date();
    let changedNodes = 0;
    let openedAlerts = 0;
    let resolvedAlerts = 0;
    const openedAlertIds: string[] = [];

    try {
      const nodes = await this.prisma.node.findMany({
        select: {
          id: true,
          nodeUid: true,
          hostname: true,
          status: true,
          maintenanceMode: true,
          lastSeenAt: true,
          alerts: {
            where: {
              type: AlertType.heartbeat_missing,
            },
            orderBy: {
              openedAt: 'desc',
            },
            take: 1,
          },
        },
      });

      const activeUpgradeNodeIds =
        await this.nodeCommandsService.loadActivePfsenseUpgradeNodeIds(now);

      for (const node of nodes) {
        const effectiveStatus = deriveEffectiveNodeStatus(node, now);
        const heartbeatAlert = node.alerts[0];
        const isOffline = !node.maintenanceMode && effectiveStatus === NodeStatus.offline;
        const hasOpenHeartbeatAlert = !!heartbeatAlert && heartbeatAlert.status !== AlertStatus.resolved;
        const shouldKeepHeartbeatAlertOpen = isOffline && !activeUpgradeNodeIds.has(node.id);
        const shouldUpdateNodeStatus = node.status !== effectiveStatus;

        if (!shouldUpdateNodeStatus && hasOpenHeartbeatAlert === shouldKeepHeartbeatAlertOpen) {
          continue;
        }

        const committed = await this.prisma.$transaction(async (tx) => {
          const [current] = await tx.$queryRaw<Array<{
            status: NodeStatus;
            maintenance_mode: boolean;
            last_seen_at: Date | null;
          }>>`
            SELECT status, maintenance_mode, last_seen_at
            FROM nodes WHERE id = ${node.id}::uuid FOR UPDATE SKIP LOCKED
          `;
          // Leave a busy node for the next scan so the rest of the fleet can progress.
          // An already committed update can also make the scan snapshot obsolete.
          if (
            !current ||
            current.status !== node.status ||
            current.maintenance_mode !== node.maintenanceMode ||
            current.last_seen_at?.getTime() !== node.lastSeenAt?.getTime()
          ) {
            return null;
          }

          const currentUpgradeIds = isOffline
            ? await this.nodeCommandsService.loadActivePfsenseUpgradeNodeIds(now, { nodeId: node.id, db: tx })
            : undefined;
          const keepHeartbeatAlertOpen = isOffline && !currentUpgradeIds?.has(node.id);

          if (shouldUpdateNodeStatus) {
            await tx.node.update({
              where: {
                id: node.id,
              },
              data: {
                status: effectiveStatus,
              },
            });
          }

          let openedAlertId: string | null = null;
          if (keepHeartbeatAlertOpen && !hasOpenHeartbeatAlert) {
            openedAlertId = await this.openHeartbeatMissingAlert(
              tx,
              node.id,
              node.lastSeenAt,
              now,
            );
          }

          let resolved = 0;
          if (!keepHeartbeatAlertOpen && hasOpenHeartbeatAlert) {
            let resolutionNote = 'Node recovered from heartbeat timeout window';
            if (node.maintenanceMode) {
              resolutionNote = 'Heartbeat alert suppressed during maintenance';
            } else if (isOffline) {
              resolutionNote = 'Heartbeat alert suppressed during pfSense upgrade';
            }
            const result = await tx.alert.updateMany({
              where: {
                id: heartbeatAlert.id,
                status: { not: AlertStatus.resolved },
              },
              data: {
                status: AlertStatus.resolved,
                resolvedAt: now,
                resolutionNote,
              },
            });

            resolved = result.count;
          }
          return { updated: shouldUpdateNodeStatus, openedAlertId, resolved };
        });
        if (!committed) continue;
        if (committed.updated) changedNodes += 1;
        if (committed.openedAlertId) {
          openedAlerts += 1;
          openedAlertIds.push(committed.openedAlertId);
        }
        resolvedAlerts += committed.resolved;
      }
    } finally {
      this.isReconciling = false;
      if (changedNodes > 0 || openedAlerts > 0 || resolvedAlerts > 0) {
        this.realtimeService.publishDashboardRefresh({
          source: 'node_reconciled',
          occurred_at: now.toISOString(),
          reason,
        });
        this.notificationsDispatcher.dispatchForAlertIds(openedAlertIds);
        this.logger.log(
          `node lifecycle reconciliation reason=${reason} updated_nodes=${changedNodes} opened_alerts=${openedAlerts} resolved_alerts=${resolvedAlerts}`,
        );
      }
    }
  }

  private async openHeartbeatMissingAlert(
    tx: Prisma.TransactionClient,
    nodeId: string,
    lastSeenAt: Date | null,
    observedAt: Date,
  ): Promise<string | null> {
    const fingerprint = `heartbeat_missing:${nodeId}`;
    const existing = await tx.alert.findUnique({
      where: {
        fingerprint,
      },
    });

    const description = lastSeenAt
      ? `No heartbeat received for more than ${appConfig.nodeStatus.offlineAfterSeconds} seconds. Last seen at ${lastSeenAt.toISOString()}.`
      : `No heartbeat received for more than ${appConfig.nodeStatus.offlineAfterSeconds} seconds.`;

    if (!existing) {
      const created = await tx.alert.create({
        data: {
          nodeId,
          fingerprint,
          type: AlertType.heartbeat_missing,
          severity: AlertSeverity.critical,
          title: 'Heartbeat missing',
          description,
          status: AlertStatus.open,
          openedAt: observedAt,
          metadataJson: {
            node_id: nodeId,
            last_seen_at: lastSeenAt?.toISOString() ?? null,
            offline_after_seconds: appConfig.nodeStatus.offlineAfterSeconds,
          },
        },
      });

      return created.id;
    }

    if (existing.status !== AlertStatus.resolved) {
      return null;
    }

    const reopened = await tx.alert.updateMany({
      where: {
        id: existing.id,
        status: AlertStatus.resolved,
      },
      data: {
        severity: AlertSeverity.critical,
        title: 'Heartbeat missing',
        description,
        status: AlertStatus.open,
        metadataJson: {
          node_id: nodeId,
          last_seen_at: lastSeenAt?.toISOString() ?? null,
          offline_after_seconds: appConfig.nodeStatus.offlineAfterSeconds,
        },
        openedAt: observedAt,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolutionNote: null,
      },
    });

    return reopened.count === 1 ? existing.id : null;
  }
}
