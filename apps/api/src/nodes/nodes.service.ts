import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AlertStatus,
  ConfigBackupStatus,
  NodeCommandStatus,
  NodeCommandType,
  Prisma,
} from '@prisma/client';
import { deriveBackupVisualStatus } from './backup-visual-status.util';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { deriveEffectiveNodeStatus } from './node-status.util';
import { LIST_NODES_DEFAULT_LIMIT, ListNodesQueryDto } from './dto/list-nodes-query.dto';

const FILTERS_CACHE_TTL_MS = 120_000;

type FiltersBaseCache = {
  clientsWithCount: Array<{
    id: string;
    name: string;
    code: string;
    status: string;
    site_count: number;
    node_count: number;
  }>;
  sites: Array<{
    id: string;
    name: string;
    code: string;
    client_id: string;
    client_name: string;
    city: string | null;
    state: string | null;
    timezone: string | null;
    status: string;
    node_count: number;
  }>;
  inactiveClientCount: number;
  expiresAt: number;
};

@Injectable()
export class NodesService {
  private filtersBaseCache: FiltersBaseCache | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  invalidateFiltersCache(): void {
    this.filtersBaseCache = null;
  }

  async getFilters(actor: AccessActor): Promise<{
    generated_at: string;
    inactive_client_count: number;
    clients: Array<{
      id: string;
      name: string;
      code: string;
      status: string;
      site_count: number;
      node_count: number;
    }>;
    sites: Array<{
      id: string;
      name: string;
      code: string;
      client_id: string;
      client_name: string;
      city: string | null;
      state: string | null;
      timezone: string | null;
      status: string;
      node_count: number;
    }>;
  }> {
    const base = await this.getFiltersBase();
    const allowedClientIds = await this.accessPolicy.getAllowedClientIds(actor);
    const allowedSet =
      allowedClientIds === null ? null : new Set(allowedClientIds);

    return {
      generated_at: new Date().toISOString(),
      inactive_client_count: base.inactiveClientCount,
      clients: base.clientsWithCount.filter(
        (client) => allowedSet === null || allowedSet.has(client.id),
      ),
      sites: base.sites.filter(
        (site) => allowedSet === null || allowedSet.has(site.client_id),
      ),
    };
  }

  private async getFiltersBase(): Promise<FiltersBaseCache> {
    const now = Date.now();
    if (this.filtersBaseCache && this.filtersBaseCache.expiresAt > now) {
      return this.filtersBaseCache;
    }

    const [clients, sites, inactiveClientCount] = await Promise.all([
      this.prisma.client.findMany({
        where: { status: 'active' },
        orderBy: [{ name: 'asc' }],
        include: {
          _count: {
            select: {
              sites: true,
            },
          },
          sites: {
            where: { status: 'active' },
            select: {
              _count: {
                select: {
                  nodes: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.site.findMany({
        where: {
          status: 'active',
          client: { status: 'active' },
        },
        orderBy: [{ client: { name: 'asc' } }, { name: 'asc' }],
        include: {
          client: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              nodes: true,
            },
          },
        },
      }),
      this.prisma.client.count({ where: { status: 'inactive' } }),
    ]);

    const base: FiltersBaseCache = {
      clientsWithCount: clients.map((client) => ({
        id: client.id,
        name: client.name,
        code: client.code,
        status: client.status,
        site_count: client._count.sites,
        node_count: client.sites.reduce(
          (total, site) => total + site._count.nodes,
          0,
        ),
      })),
      sites: sites.map((site) => ({
        id: site.id,
        name: site.name,
        code: site.code,
        client_id: site.client.id,
        client_name: site.client.name,
        city: site.city,
        state: site.state,
        timezone: site.timezone,
        status: site.status,
        node_count: site._count.nodes,
      })),
      inactiveClientCount,
      expiresAt: now + FILTERS_CACHE_TTL_MS,
    };

    this.filtersBaseCache = base;
    return base;
  }

  async listNodes(actor: AccessActor, query: ListNodesQueryDto): Promise<{
    items: Array<{
      id: string;
      node_uid: string;
      hostname: string;
      display_name: string | null;
      client: { id: string; name: string; code: string };
      site: { id: string; name: string; code: string };
      effective_status:
        | 'online'
        | 'degraded'
        | 'offline'
        | 'maintenance'
        | 'unknown';
      observed_status: string;
      node_uid_status: string;
      maintenance_mode: boolean;
      last_seen_at: string | null;
      pfsense_version: string | null;
      agent_version: string | null;
      management_ip: string | null;
      wan_ip: string | null;
      open_alerts: number;
      backup_status: 'ok' | 'late' | 'failed' | 'never';
      latest_backup_received_at: string | null;
      cpu_percent: number | null;
      memory_percent: number | null;
      disk_percent: number | null;
      uptime_seconds: number | null;
    }>;
    generated_at: string;
  }> {
    const now = new Date();
    const searchTerm = query.search?.trim();
    await this.accessPolicy.assertRequestedClientFilter(actor, query.client_id);
    const baseWhere: Prisma.NodeWhereInput = {
      siteId: query.site_id,
      site: query.client_id
        ? {
            clientId: query.client_id,
          }
        : undefined,
      OR: searchTerm
        ? [
            {
              hostname: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
            {
              displayName: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
            {
              nodeUid: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
            {
              site: {
                name: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            },
            {
              site: {
                client: {
                  name: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
              },
            },
          ]
        : undefined,
    };
    const where = await this.accessPolicy.mergeNodeWhere(actor, baseWhere);

    const limit = Math.min(query.limit ?? LIST_NODES_DEFAULT_LIMIT, 1000);
    const sortOrder = query.sort_order ?? 'asc';
    const sortBy = query.sort_by ?? 'name';
    const nullsLast = 'last' as const;
    const orderBy: Prisma.NodeOrderByWithRelationInput[] = [
      { site: { client: { name: sortOrder } } },
      ...(sortBy === 'name'
        ? [
            { displayName: { sort: sortOrder, nulls: nullsLast } },
            { hostname: sortOrder },
          ]
        : sortBy === 'agent_version'
          ? [{ agentVersion: { sort: sortOrder, nulls: nullsLast } }]
          : [{ pfsenseVersion: { sort: sortOrder, nulls: nullsLast } }]),
    ];
    const nodes = await this.prisma.node.findMany({
      where,
      orderBy,
      take: limit,
      include: {
        site: {
          include: {
            client: true,
          },
        },
        alerts: {
          where: {
            status: AlertStatus.open,
          },
          select: {
            id: true,
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
    });

    const items = nodes
      .map((node) => {
        const effectiveStatus = deriveEffectiveNodeStatus(node, now);
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
        const backupStatus = deriveBackupVisualStatus({
          latestBackupReceivedAt,
          latestFailedCommandAt,
          now,
        });

        return {
          id: node.id,
          node_uid: node.nodeUid,
          hostname: node.hostname,
          display_name: node.displayName,
          client: {
            id: node.site.client.id,
            name: node.site.client.name,
            code: node.site.client.code,
          },
          site: {
            id: node.site.id,
            name: node.site.name,
            code: node.site.code,
          },
          effective_status: effectiveStatus,
          observed_status: node.status,
          node_uid_status: node.nodeUidStatus,
          maintenance_mode: node.maintenanceMode,
          last_seen_at: node.lastSeenAt?.toISOString() ?? null,
          pfsense_version: node.pfsenseVersion,
          agent_version: node.agentVersion,
          management_ip: node.managementIp,
          wan_ip: node.wanIp,
          open_alerts: node.alerts.length,
          backup_status: backupStatus,
          latest_backup_received_at: latestBackupReceivedAt?.toISOString() ?? null,
          cpu_percent: node.cpuPercent ?? null,
          memory_percent: node.memoryPercent ?? null,
          disk_percent: node.diskPercent ?? null,
          uptime_seconds: node.uptimeSeconds ?? null,
        };
      })
      .filter((node) => (query.status ? node.effective_status === query.status : true));

    return {
      items,
      generated_at: now.toISOString(),
    };
  }

  async getNodeById(actor: AccessActor, id: string): Promise<{
    generated_at: string;
    node: {
      id: string;
      node_uid: string;
      node_uid_status: string;
      hostname: string;
      display_name: string | null;
      effective_status: string;
      observed_status: string;
      maintenance_mode: boolean;
      client: { id: string; name: string; code: string };
      site: { id: string; name: string; code: string; city: string | null; state: string | null; timezone: string | null };
      management_ip: string | null;
      wan_ip: string | null;
      network_interfaces: Array<{ name: string; ip: string; role?: string }> | null;
      pfsense_version: string | null;
      agent_version: string | null;
      ha_role: string | null;
      last_seen_at: string | null;
      last_boot_at: string | null;
      latest_heartbeat: {
        received_at: string;
        sent_at: string;
        heartbeat_id: string;
        latency_ms: number | null;
        uptime_seconds: number | null;
        cpu_percent: number | null;
        memory_percent: number | null;
        disk_percent: number | null;
        schema_version: string;
        customer_code: string;
      } | null;
      services: Array<{
        name: string;
        status: string;
        message: string | null;
        observed_at: string;
      }>;
      gateways: Array<{
        name: string;
        status: string;
        loss_percent: number | null;
        latency_ms: number | null;
        observed_at: string;
      }>;
      recent_alerts: Array<{
        id: string;
        type: string;
        severity: string;
        status: string;
        title: string;
        description: string;
        opened_at: string;
        resolved_at: string | null;
      }>;
    };
  }> {
    const now = new Date();
    const node = await this.prisma.node.findUnique({
      where: {
        id,
      },
      include: {
        site: {
          include: {
            client: true,
          },
        },
        services: {
          orderBy: {
            serviceName: 'asc',
          },
        },
        gateways: {
          orderBy: {
            gatewayName: 'asc',
          },
        },
        alerts: {
          orderBy: {
            openedAt: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    const allowedClientIds = await this.accessPolicy.getAllowedClientIds(actor);
    if (
      allowedClientIds !== null &&
      !allowedClientIds.includes(node.site.client.id)
    ) {
      throw new ForbiddenException('node out of scope');
    }

    return {
      generated_at: now.toISOString(),
      node: {
        id: node.id,
        node_uid: node.nodeUid,
        node_uid_status: node.nodeUidStatus,
        hostname: node.hostname,
        display_name: node.displayName,
        effective_status: deriveEffectiveNodeStatus(node, now),
        observed_status: node.status,
        maintenance_mode: node.maintenanceMode,
        client: {
          id: node.site.client.id,
          name: node.site.client.name,
          code: node.site.client.code,
        },
        site: {
          id: node.site.id,
          name: node.site.name,
          code: node.site.code,
          city: node.site.city,
          state: node.site.state,
          timezone: node.site.timezone,
        },
        management_ip: node.managementIp,
        wan_ip: node.wanIp,
        network_interfaces:
          (node.networkInterfacesJson as Array<{ name: string; ip: string; role?: string }> | null) ?? null,
        pfsense_version: node.pfsenseVersion,
        agent_version: node.agentVersion,
        ha_role: node.haRole,
        last_seen_at: node.lastSeenAt?.toISOString() ?? null,
        last_boot_at: node.lastBootAt?.toISOString() ?? null,
        latest_heartbeat: node.lastHeartbeatId && node.lastSeenAt
          ? {
              received_at: node.lastSeenAt.toISOString(),
              sent_at: node.lastHeartbeatSentAt?.toISOString() ?? node.lastSeenAt.toISOString(),
              heartbeat_id: node.lastHeartbeatId,
              latency_ms: node.lastLatencyMs ?? null,
              uptime_seconds: node.uptimeSeconds ?? null,
              cpu_percent: node.cpuPercent ?? null,
              memory_percent: node.memoryPercent ?? null,
              disk_percent: node.diskPercent ?? null,
              schema_version: node.schemaVersion ?? 'unknown',
              customer_code: node.customerCode ?? 'unknown',
            }
          : null,
        services: node.services.map((service) => ({
          name: service.serviceName,
          status: service.status,
          message: service.message,
          observed_at: service.observedAt.toISOString(),
        })),
        gateways: node.gateways.map((gateway) => ({
          name: gateway.gatewayName,
          status: gateway.status,
          loss_percent: gateway.lossPercent,
          latency_ms: gateway.latencyMs,
          observed_at: gateway.observedAt.toISOString(),
        })),
        recent_alerts: node.alerts.map((alert) => ({
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          status: alert.status,
          title: alert.title,
          description: alert.description,
          opened_at: alert.openedAt.toISOString(),
          resolved_at: alert.resolvedAt?.toISOString() ?? null,
        })),
      },
    };
  }
}
