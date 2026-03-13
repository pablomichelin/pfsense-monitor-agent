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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reconcileStatuses('startup');

    this.timer = setInterval(() => {
      void this.reconcileStatuses('interval');
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

      for (const node of nodes) {
        const effectiveStatus = deriveEffectiveNodeStatus(node, now);
        const heartbeatAlert = node.alerts[0];
        const shouldKeepHeartbeatAlertOpen =
          !node.maintenanceMode && effectiveStatus === NodeStatus.offline;
        const shouldOpenHeartbeatAlert =
          shouldKeepHeartbeatAlertOpen &&
          (!heartbeatAlert || heartbeatAlert.status === AlertStatus.resolved);
        const shouldResolveHeartbeatAlert =
          heartbeatAlert && heartbeatAlert.status !== AlertStatus.resolved
            ? !shouldKeepHeartbeatAlertOpen
            : false;
        const shouldUpdateNodeStatus = node.status !== effectiveStatus;

        if (
          !shouldUpdateNodeStatus &&
          !shouldOpenHeartbeatAlert &&
          !shouldResolveHeartbeatAlert
        ) {
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          if (shouldUpdateNodeStatus) {
            await tx.node.update({
              where: {
                id: node.id,
              },
              data: {
                status: effectiveStatus,
              },
            });

            changedNodes += 1;
          }

          if (shouldOpenHeartbeatAlert) {
            const opened = await this.openHeartbeatMissingAlert(
              tx,
              node.id,
              node.lastSeenAt,
              now,
            );
            if (opened) {
              openedAlerts += 1;
            }
          }

          if (shouldResolveHeartbeatAlert && heartbeatAlert) {
            await tx.alert.update({
              where: {
                id: heartbeatAlert.id,
              },
              data: {
                status: AlertStatus.resolved,
                resolvedAt: now,
                resolutionNote: 'Node recovered from heartbeat timeout window',
              },
            });

            resolvedAlerts += 1;
          }
        });

        this.realtimeService.publishDashboardRefresh({
          source: 'node_reconciled',
          occurred_at: now.toISOString(),
          node_id: node.id,
          node_uid: node.nodeUid,
          reason,
        });
      }

      if (changedNodes > 0 || openedAlerts > 0 || resolvedAlerts > 0) {
        this.logger.log(
          `node lifecycle reconciliation reason=${reason} updated_nodes=${changedNodes} opened_alerts=${openedAlerts} resolved_alerts=${resolvedAlerts}`,
        );
      }
    } finally {
      this.isReconciling = false;
    }
  }

  private async openHeartbeatMissingAlert(
    tx: Prisma.TransactionClient,
    nodeId: string,
    lastSeenAt: Date | null,
    observedAt: Date,
  ): Promise<boolean> {
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
      await tx.alert.create({
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

      return true;
    }

    const wasResolved = existing.status === AlertStatus.resolved;

    await tx.alert.update({
      where: {
        id: existing.id,
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
        openedAt: wasResolved ? observedAt : existing.openedAt,
        acknowledgedAt: wasResolved ? null : existing.acknowledgedAt,
        acknowledgedBy: wasResolved ? null : existing.acknowledgedBy,
        resolvedAt: null,
        resolutionNote: null,
      },
    });

    return wasResolved;
  }
}
