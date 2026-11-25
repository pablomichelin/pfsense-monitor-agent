import { PackageReleaseService } from '../common/package-release.service';
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
import { RealtimeService } from '../realtime/realtime.service';
import {
  aggregateFleetMetrics,
  EffectiveNodeStatus,
} from './fleet-aggregation.util';
import { FleetQueryDto } from './dto/fleet-query.dto';

const SUMMARY_CACHE_TTL_MS = 20_000;
const CACHE_MAX_ENTRIES = 256;

type CacheEntry<T> = { data: T; expiresAt: number; revision: number };

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
  private readonly summaryCache = new Map<string, CacheEntry<DashboardSummary>>();
  private readonly fleetCache = new Map<string, CacheEntry<DashboardFleet>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly packageRelease: PackageReleaseService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async getSummary(actor: AccessActor): Promise<DashboardSummary> {
    const cacheKey = await this.buildActorCacheKey(actor, 'summary');
    const revision = this.realtimeService.getDashboardRevision();
    const cached = this.readCache(this.summaryCache, cacheKey, revision);
    if (cached) return cached;

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

    this.writeCache(this.summaryCache, cacheKey, result, revision);

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
    const revision = this.realtimeService.getDashboardRevision();
    const cached = this.readCache(this.fleetCache, cacheKey, revision);
    if (cached) return cached;

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
    const [nodes, alertGroups] = await Promise.all([
      this.prisma.node.findMany({
        where,
        select: {
          id: true,
          status: true,
          maintenanceMode: true,
          lastSeenAt: true,
          pfsenseVersion: true,
          agentVersion: true,
          configBackupPolicyJson: true,
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
              configSha256: true,
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
      this.prisma.alert.groupBy({
        by: ['nodeId', 'severity'],
        where: { node: where, status: AlertStatus.open },
        _count: { _all: true },
      }),
    ]);

    const fleetNodes = nodes
      .map((node) => ({ node, effectiveStatus: deriveEffectiveNodeStatus(node, nowDate) }))
      .filter(({ effectiveStatus }) => !query.status || effectiveStatus === query.status)
      .map(({ node, effectiveStatus }) => {
        const latestStoredBackup = node.configBackups.find(
          (backup) => backup.status === ConfigBackupStatus.stored,
        );
        const latestBackup =
          latestStoredBackup ?? node.configBackups[0] ?? null;
        const latestBackupReceivedAt = latestBackup?.receivedAt ?? null;
        const latestFailedCommand = node.nodeCommands[0];
        const latestFailedCommandAt =
          latestFailedCommand?.completedAt ??
          latestFailedCommand?.requestedAt ??
          null;

        return {
          id: node.id,
          effectiveStatus,
          backupStatus: deriveBackupVisualStatus({
            latestBackupReceivedAt,
            latestBackupSha256: latestBackup?.configSha256 ?? null,
            latestFailedCommandAt,
            backupPolicyJson: node.configBackupPolicyJson,
            timeZone: node.site.timezone,
            now: nowDate,
          }),
          pfsenseVersion: node.pfsenseVersion,
          agentVersion: node.agentVersion,
        };
      });

    const fleetNodeIds = new Set(fleetNodes.map((node) => node.id));
    let openAlerts = 0;
    let criticalAlerts = 0;
    for (const group of alertGroups) {
      if (!fleetNodeIds.has(group.nodeId)) {
        continue;
      }
      openAlerts += group._count._all;
      if (group.severity === AlertSeverity.critical) {
        criticalAlerts += group._count._all;
      }
    }

    const packageTargetVersion =
      this.packageRelease.getPublishedVersion();
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

    this.writeCache(this.fleetCache, cacheKey, result, revision);

    return result;
  }

  private readCache<T>(cache: Map<string, CacheEntry<T>>, key: string, revision: number): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    cache.delete(key);
    if (entry.revision !== revision || entry.expiresAt <= Date.now()) return undefined;
    cache.set(key, entry);
    return entry.data;
  }

  private writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, revision: number): void {
    if (revision !== this.realtimeService.getDashboardRevision()) return;
    cache.delete(key);
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(key, { data, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS, revision });
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
