import { PackageReleaseService } from '../common/package-release.service';
import { BackupFleetQueryDto, FleetScopeQueryDto } from './dto/backup-fleet-query.dto';
import { BackupFleetItem, bootstrapBucket, compareBackupFleetItems } from './backup-fleet.util';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AlertStatus,
  ConfigBackupStatus,
  NodeCommandStatus,
  NodeCommandType,
  NodeCriticality,
  Prisma,
} from '@prisma/client';
import { deriveBackupVisualStatus } from './backup-visual-status.util';
import { resolveRemoteAccessUrl } from '../common/remote-access-url';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { deriveEffectiveNodeStatus } from './node-status.util';
import {
  LIST_NODES_SORT_FIELDS,
  compareListNodes,
  decodeNodeCursor,
  encodeNodeCursor,
  nodeListFingerprint,
  NodePageCollector,
  type ListNodesSortBy,
} from './list-nodes-sort.util';
import { appConfig } from '../config/app-config';
import {
  LIST_NODES_DEFAULT_LIMIT,
  LIST_NODES_MAX_LIMIT,
  ListNodesQueryDto,
} from './dto/list-nodes-query.dto';

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
  tags: Array<{
    id: string;
    name: string;
    client_id: string;
    client_name: string;
    node_count: number;
  }>;
  groups: Array<{
    id: string;
    name: string;
    client_id: string;
    client_name: string;
    member_count: number;
  }>;
  criticality_options: NodeCriticality[];
  expiresAt: number;
};

@Injectable()
export class NodesService {
  private filtersBaseCache: FiltersBaseCache | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly packageRelease: PackageReleaseService,
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
    tags: Array<{
      id: string;
      name: string;
      client_id: string;
      client_name: string;
      node_count: number;
    }>;
    groups: Array<{
      id: string;
      name: string;
      client_id: string;
      client_name: string;
      member_count: number;
    }>;
    criticality_options: NodeCriticality[];
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
      tags: base.tags.filter(
        (tag) => allowedSet === null || allowedSet.has(tag.client_id),
      ),
      groups: base.groups.filter(
        (group) => allowedSet === null || allowedSet.has(group.client_id),
      ),
      criticality_options: base.criticality_options,
    };
  }

  private async getFiltersBase(): Promise<FiltersBaseCache> {
    const now = Date.now();
    if (this.filtersBaseCache && this.filtersBaseCache.expiresAt > now) {
      return this.filtersBaseCache;
    }

    const [clients, sites, tags, groups, inactiveClientCount] = await Promise.all([
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
      this.prisma.tag.findMany({
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
              nodeTags: true,
            },
          },
        },
      }),
      this.prisma.nodeGroup.findMany({
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
              members: true,
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
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        client_id: tag.clientId,
        client_name: tag.client.name,
        node_count: tag._count.nodeTags,
      })),
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        client_id: group.clientId,
        client_name: group.client.name,
        member_count: group._count.members,
      })),
      criticality_options: [
        NodeCriticality.critical,
        NodeCriticality.standard,
        NodeCriticality.lab,
      ],
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
      remote_access_url: string | null;
      open_alerts: number;
      backup_status: 'ok' | 'late' | 'failed' | 'never';
      latest_backup_received_at: string | null;
      cpu_percent: number | null;
      memory_percent: number | null;
      disk_percent: number | null;
      uptime_seconds: number | null;
      criticality: NodeCriticality;
      tags: Array<{ id: string; name: string }>;
    }>;
    total: number;
    bootstrap_summary: { pending: number; active: number; blocked: number; total: number };
    limit: number;
    next_cursor: string | null;
    previous_cursor: string | null;
    generated_at: string;
  }> {
    const searchTerm = query.search?.trim();
    await this.accessPolicy.assertRequestedClientFilter(actor, query.client_id);

    if (query.tag_id) {
      const tag = await this.prisma.tag.findUnique({
        where: { id: query.tag_id },
        select: { clientId: true },
      });
      if (!tag) {
        throw new NotFoundException('tag not found');
      }
      await this.accessPolicy.assertClientAccess(actor, tag.clientId);
    }

    if (query.group_id) {
      const group = await this.prisma.nodeGroup.findUnique({
        where: { id: query.group_id },
        select: { clientId: true },
      });
      if (!group) {
        throw new NotFoundException('group not found');
      }
      await this.accessPolicy.assertClientAccess(actor, group.clientId);
    }

    const baseWhere: Prisma.NodeWhereInput = {
      siteId: query.site_id,
      criticality: query.criticality,
      site: query.client_id
        ? {
            clientId: query.client_id,
          }
        : undefined,
      nodeTags: query.tag_id
        ? {
            some: {
              tagId: query.tag_id,
            },
          }
        : undefined,
      groupMembers: query.group_id
        ? {
            some: {
              groupId: query.group_id,
            },
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

    const limit = query.limit ?? LIST_NODES_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > LIST_NODES_MAX_LIMIT) {
      throw new BadRequestException('limit must be an integer between 1 and 1000');
    }
    const targetPackageVersion = this.packageRelease.getPublishedVersion();
    const sortOrder = query.sort_order ?? 'asc';
    const sortBy: ListNodesSortBy =
      query.sort_by &&
      (LIST_NODES_SORT_FIELDS as readonly string[]).includes(query.sort_by)
        ? query.sort_by
        : 'name';
    const fingerprint = nodeListFingerprint([
      actor.userId, actor.role, query.client_id ?? null, query.site_id ?? null,
      query.tag_id ?? null, query.group_id ?? null, query.criticality ?? null,
      searchTerm || null, query.status ?? null, query.preset ?? null,
      sortBy, sortOrder, targetPackageVersion, query.bootstrap_bucket ?? null,
    ]);
    const cursor = decodeNodeCursor(query.cursor, fingerprint);
    const now = new Date();
    // The classifier remains authoritative. Scan a consistent DB snapshot in small
    // chunks and retain one sorted page only; no take-before-filter truncation.
    return this.prisma.$transaction(async (tx) => {
      const collector = new NodePageCollector<Awaited<ReturnType<NodesService['listNodes']>>['items'][number]>(
        limit, (a, b) => compareListNodes(a, b, sortBy, sortOrder), cursor,
      );
      const bootstrapSummary = { pending: 0, active: 0, blocked: 0, total: 0 };
      let lastId: string | undefined;
      for (;;) {
        const nodes = await tx.node.findMany({
          where,
          orderBy: { id: 'asc' },
          take: 250,
          ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
      include: {
        site: {
          include: {
            client: true,
          },
        },
        nodeTags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            tag: {
              name: 'asc',
            },
          },
        },
        _count: { select: { alerts: { where: { status: AlertStatus.open } } } },
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
    });

    const items = nodes
      .map((node) => {
        const effectiveStatus = deriveEffectiveNodeStatus(node, now);
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
        const backupStatus = deriveBackupVisualStatus({
          latestBackupReceivedAt,
          latestBackupSha256: latestBackup?.configSha256 ?? null,
          latestFailedCommandAt,
          backupPolicyJson: node.configBackupPolicyJson,
          timeZone: node.site.timezone,
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
          remote_access_url: resolveRemoteAccessUrl(
            node.remoteAccessUrl,
            node.wanIp,
            node.managementIp,
          ),
          open_alerts: node._count.alerts,
          backup_status: backupStatus,
          latest_backup_received_at: latestBackupReceivedAt?.toISOString() ?? null,
          cpu_percent: node.cpuPercent ?? null,
          memory_percent: node.memoryPercent ?? null,
          disk_percent: node.diskPercent ?? null,
          uptime_seconds: node.uptimeSeconds ?? null,
          criticality: node.criticality,
          tags: node.nodeTags.map((entry) => ({
            id: entry.tag.id,
            name: entry.tag.name,
          })),
        };
      })
      .filter((node) => (query.status ? node.effective_status === query.status : true))
      .filter((node) => {
        if (!query.preset) {
          return true;
        }
        if (query.preset === 'offline') {
          return node.effective_status === 'offline';
        }
        if (query.preset === 'degraded') {
          return node.effective_status === 'degraded';
        }
        if (query.preset === 'backup-late') {
          return node.backup_status === 'late' || node.backup_status === 'failed';
        }
        if (query.preset === 'no-backup') {
          return node.backup_status === 'never';
        }
        if (query.preset === 'package-outdated') {
          return Boolean(
            targetPackageVersion && node.agent_version !== targetPackageVersion,
          );
        }
        return (
          node.effective_status === 'offline' ||
          node.effective_status === 'degraded' ||
          node.open_alerts > 0 ||
          node.backup_status !== 'ok' ||
          Boolean(targetPackageVersion && node.agent_version !== targetPackageVersion)
        );
      });

      for (const item of items) {
        const bucket = bootstrapBucket(item);
        bootstrapSummary[bucket] += 1;
        bootstrapSummary.total += 1;
        if (!query.bootstrap_bucket || bucket === query.bootstrap_bucket) collector.add(item);
      }
      if (nodes.length < 250) break;
      lastId = nodes[nodes.length - 1].id;
    }
    const { items, total } = collector;
    const first = items[0] ?? cursor?.anchor;
    const last = items[items.length - 1] ?? cursor?.anchor;
    return {
      items,
      total,
      bootstrap_summary: bootstrapSummary,
      limit,
      next_cursor: collector.hasNext && last ? encodeNodeCursor(last, 'after', fingerprint, now.toISOString()) : null,
      previous_cursor: collector.hasPrevious && first ? encodeNodeCursor(first, 'before', fingerprint, now.toISOString()) : null,
      generated_at: now.toISOString(),
    };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 60_000 });
  }

  private async fleetWhere(actor: AccessActor, query: FleetScopeQueryDto): Promise<Prisma.NodeWhereInput> {
    await this.accessPolicy.assertRequestedClientFilter(actor, query.client_id);
    const search = query.search?.trim();
    return this.accessPolicy.mergeNodeWhere(actor, {
      siteId: query.site_id,
      site: query.client_id ? { clientId: query.client_id } : undefined,
      OR: search ? [
        { hostname: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { nodeUid: { contains: search, mode: 'insensitive' } },
        { site: { name: { contains: search, mode: 'insensitive' } } },
        { site: { client: { name: { contains: search, mode: 'insensitive' } } } },
      ] : undefined,
    });
  }

  async getBackupFleet(actor: AccessActor, query: BackupFleetQueryDto) {
    const where = await this.fleetWhere(actor, query);
    const perPage = query.per_page ?? 25;
    const requestedPage = query.page ?? 1;
    if (![10, 25, 50].includes(perPage) || !Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > 1000000) {
      throw new BadRequestException('invalid backup pagination');
    }
    // One snapshot per HTTP response. A later navigation/refresh takes a new
    // snapshot; generated_at identifies when this response was calculated.
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const summary = { ok: 0, late: 0, failed: 0, never: 0, total: 0 };
      const matches: BackupFleetItem[] = [];
      let lastId: string | undefined;
      for (;;) {
        const nodes = await tx.node.findMany({
          where, orderBy: { id: 'asc' }, take: 250,
          ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
          // No health, alerts, tags, credentials or full telemetry on this path.
          select: {
            id: true, hostname: true, displayName: true, configBackupPolicyJson: true,
            site: { select: { id: true, name: true, code: true, timezone: true,
              client: { select: { id: true, name: true, code: true } } } },
            configBackups: {
              where: { status: { in: [ConfigBackupStatus.stored, ConfigBackupStatus.duplicate] } },
              orderBy: { receivedAt: 'desc' }, take: 1,
              select: { receivedAt: true, configSha256: true },
            },
            nodeCommands: {
              where: { type: NodeCommandType.config_backup_now, status: NodeCommandStatus.failed },
              orderBy: { requestedAt: 'desc' }, take: 1,
              select: { completedAt: true, requestedAt: true },
            },
          },
        });
        for (const node of nodes) {
          const backup = node.configBackups[0];
          const failed = node.nodeCommands[0];
          const status = deriveBackupVisualStatus({
            latestBackupReceivedAt: backup?.receivedAt ?? null,
            latestBackupSha256: backup?.configSha256 ?? null,
            latestFailedCommandAt: failed?.completedAt ?? failed?.requestedAt ?? null,
            backupPolicyJson: node.configBackupPolicyJson, timeZone: node.site.timezone, now,
          });
          summary[status] += 1;
          summary.total += 1;
          if (query.backup_status && status !== query.backup_status) continue;
          matches.push({
            id: node.id, hostname: node.hostname, display_name: node.displayName,
            client: node.site.client,
            site: { id: node.site.id, name: node.site.name, code: node.site.code },
            backup_status: status, latest_backup_received_at: backup?.receivedAt.toISOString() ?? null,
          });
        }
        if (nodes.length < 250) break;
        lastId = nodes[nodes.length - 1].id;
      }
      matches.sort((a, b) => compareBackupFleetItems(a, b, query.sort_by ?? 'backup_priority', query.sort_order ?? 'asc'));
      const totalPages = Math.max(1, Math.ceil(matches.length / perPage));
      const page = Math.min(requestedPage, totalPages);
      return {
        items: matches.slice((page - 1) * perPage, page * perPage),
        summary, total: matches.length, page, per_page: perPage, total_pages: totalPages,
        generated_at: now.toISOString(),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 60_000 });
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
      criticality: NodeCriticality;
      tags: Array<{ id: string; name: string }>;
      client: { id: string; name: string; code: string };
      site: { id: string; name: string; code: string; city: string | null; state: string | null; timezone: string | null };
      management_ip: string | null;
      wan_ip: string | null;
      remote_access_url: string | null;
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
      certificates: Array<{
        cert_key: string;
        subject: string;
        issuer: string | null;
        usage: string | null;
        not_before: string;
        not_after: string;
        days_until_expiry: number;
        observed_at: string;
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
        nodeTags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            tag: {
              name: 'asc',
            },
          },
        },
        certificates: {
          orderBy: [{ notAfter: 'asc' }, { subject: 'asc' }],
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
        criticality: node.criticality,
        tags: node.nodeTags.map((entry) => ({
          id: entry.tag.id,
          name: entry.tag.name,
        })),
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
        remote_access_url: resolveRemoteAccessUrl(
          node.remoteAccessUrl,
          node.wanIp,
          node.managementIp,
        ),
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
        certificates: node.certificates.map((certificate) => ({
          cert_key: certificate.certKey,
          subject: certificate.subject,
          issuer: certificate.issuer,
          usage: certificate.usageDescriptor,
          not_before: certificate.notBefore.toISOString(),
          not_after: certificate.notAfter.toISOString(),
          days_until_expiry: Math.ceil(
            (certificate.notAfter.getTime() - now.getTime()) /
              (24 * 60 * 60 * 1000),
          ),
          observed_at: certificate.observedAt.toISOString(),
        })),
      },
    };
  }
}
