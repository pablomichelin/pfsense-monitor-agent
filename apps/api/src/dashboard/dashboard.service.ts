import { Injectable } from '@nestjs/common';
import {
  AlertSeverity,
  AlertStatus,
  ConfigBackupStatus,
  NodeCommandStatus,
  NodeCommandType,
  Prisma,
} from '@prisma/client';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { appConfig } from '../config/app-config';
import { deriveBackupVisualStatus } from '../nodes/backup-visual-status.util';
import { deriveEffectiveNodeStatus } from '../nodes/node-status.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  aggregateFleetMetrics,
  EffectiveNodeStatus,
  FleetNodeRecord,
} from './fleet-aggregation.util';
import { FleetQueryDto } from './dto/fleet-query.dto';

const SUMMARY_CACHE_TTL_MS = 20000;

type DashboardSummary = {
  generated_at: string;
  version: string;
  totals: {
    nodes: number;
    online: number;
    degraded: number;
    offline: number;
    maintenance: number;
    unknown: number;
    open_alerts: number;
  };
};

type DashboardFleet = DashboardSummary & {
  filters: {
    client_id: string | null;
    site_id: string | null;
    status: EffectiveNodeStatus | null;
  };
  totals: DashboardSummary['totals'] & {
    critical_alerts: number;
  };
  compliance: {
    backup_ok_count: number;
    backup_ok_percent: number | null;
    package_outdated_count: number;
    package_outdated_percent: number | null;
    package_target_version: string | null;
  };
  version_matrix: {
    pfsense: Array<{ version: string; count: number }>;
    package: Array<{
      version: string;
      count: number;
      alignment?: string;
    }>;
  };
};

@Injectable()
export class DashboardService {
  private readonly summaryCache = new Map<
    string,
    { data: DashboardSummary; expiresAt: number }
  >();
  private readonly fleetCache = new Map<
    string,
    { data: DashboardFleet; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getSummary(actor: AccessActor): Promise<DashboardSummary> {
    const cacheKey = await this.buildActorCacheKey(actor, 'summary');
    const now = Date.now();
    const cached = this.summaryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const nowDate = new Date();
    const nodeWhere = await this.accessPolicy.mergeNodeWhere(actor);
    const alertWhere = await this.accessPolicy.mergeAlertWhere(actor, {
      status: AlertStatus.open,
    });
    const [nodes, openAlerts] = await Promise.all([
      this.prisma.node.findMany({
        where: nodeWhere,
        select: {
          status: true,
          maintenanceMode: true,
          lastSeenAt: true,
        },
      }),
      this.prisma.alert.count({
        where: alertWhere,
      }),
    ]);

    const counters = {
      nodes: nodes.length,
      online: 0,
      degraded: 0,
      offline: 0,
      maintenance: 0,
      unknown: 0,
    };

    for (const node of nodes) {
      const effectiveStatus = deriveEffectiveNodeStatus(node, nowDate);
      counters[effectiveStatus] += 1;
    }

    const result: DashboardSummary = {
      generated_at: nowDate.toISOString(),
      version: appConfig.systemVersion,
      totals: {
        ...counters,
        open_alerts: openAlerts,
      },
    };

    this.summaryCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    });

    return result;
  }

  async getFleet(
    actor: AccessActor,
    query: FleetQueryDto = {},
  ): Promise<DashboardFleet> {
    const cacheKey = await this.buildActorCacheKey(
      actor,
      `fleet:${query.client_id ?? ''}:${query.site_id ?? ''}:${query.status ?? ''}`,
    );
    const nowMs = Date.now();
    const cached = this.fleetCache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs) {
      return cached.data;
    }

    const nowDate = new Date();
    await this.accessPolicy.assertRequestedClientFilter(actor, query.client_id);
    const baseWhere: Prisma.NodeWhereInput = {
      siteId: query.site_id,
      site: query.client_id
        ? {
            clientId: query.client_id,
          }
        : undefined,
    };
    const where = await this.accessPolicy.mergeNodeWhere(actor, baseWhere);
    const alertWhere = await this.accessPolicy.mergeAlertWhere(actor, {
      status: AlertStatus.open,
    });
    const criticalAlertWhere = await this.accessPolicy.mergeAlertWhere(actor, {
      status: AlertStatus.open,
      severity: AlertSeverity.critical,
    });

    const [nodes, openAlerts, criticalAlerts] = await Promise.all([
      this.prisma.node.findMany({
        where,
        include: {
          site: {
            select: {
              timezone: true,
            },
          },
          configBackups: {
            where: {
              status: {
                in: [ConfigBackupStatus.stored, ConfigBackupStatus.duplicate],
              },
            },
            orderBy: {
              receivedAt: 'desc',
            },
            take: 1,
            select: {
              receivedAt: true,
              status: true,
            },
          },
          nodeCommands: {
            where: {
              type: NodeCommandType.config_backup_now,
              status: NodeCommandStatus.failed,
            },
            orderBy: {
              requestedAt: 'desc',
            },
            take: 1,
            select: {
              completedAt: true,
              requestedAt: true,
            },
          },
        },
      }),
      this.prisma.alert.count({
        where: alertWhere,
      }),
      this.prisma.alert.count({
        where: criticalAlertWhere,
      }),
    ]);

    const fleetNodes: FleetNodeRecord[] = nodes
      .map((node) => {
        const effectiveStatus = deriveEffectiveNodeStatus(node, nowDate);
        const latestStoredBackup = node.configBackups.find(
          (backup) => backup.status === ConfigBackupStatus.stored,
        );
        const latestBackupReceivedAt =
          latestStoredBackup?.receivedAt ??
          node.configBackups[0]?.receivedAt ??
          null;
        const latestFailedCommand = node.nodeCommands[0];
        const latestFailedCommandAt =
          latestFailedCommand?.completedAt ??
          latestFailedCommand?.requestedAt ??
          null;

        return {
          effectiveStatus,
          backupStatus: deriveBackupVisualStatus({
            latestBackupReceivedAt,
            latestFailedCommandAt,
            backupPolicyJson: node.configBackupPolicyJson,
            timeZone: node.site.timezone,
            now: nowDate,
          }),
          pfsenseVersion: node.pfsenseVersion,
          agentVersion: node.agentVersion,
        };
      })
      .filter((node) =>
        query.status ? node.effectiveStatus === query.status : true,
      );

    const packageTargetVersion =
      appConfig.packageRelease.version.trim() || null;
    const aggregated = aggregateFleetMetrics(fleetNodes, packageTargetVersion);

    const result: DashboardFleet = {
      generated_at: nowDate.toISOString(),
      version: appConfig.systemVersion,
      filters: {
        client_id: query.client_id ?? null,
        site_id: query.site_id ?? null,
        status: query.status ?? null,
      },
      totals: {
        ...aggregated.totals,
        open_alerts: openAlerts,
        critical_alerts: criticalAlerts,
      },
      compliance: aggregated.compliance,
      version_matrix: aggregated.version_matrix,
    };

    this.fleetCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    });

    return result;
  }

  private async buildActorCacheKey(
    actor: AccessActor,
    suffix: string,
  ): Promise<string> {
    const allowedClientIds = await this.accessPolicy.getAllowedClientIds(actor);
    const scopeKey =
      allowedClientIds === null ? 'global' : allowedClientIds.join(',');
    return `${actor.userId}:${scopeKey}:${suffix}`;
  }
}
