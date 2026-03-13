import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { deriveEffectiveNodeStatus } from './node-status.util';
import { ListNodesQueryDto } from './dto/list-nodes-query.dto';
import { isPfSenseVersionHomologated } from '../common/version-matrix.util';

@Injectable()
export class NodesService {
  constructor(private readonly prisma: PrismaService) {}

  async getFilters(): Promise<{
    generated_at: string;
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
    const now = new Date();

    const [clients, sites] = await Promise.all([
      this.prisma.client.findMany({
        orderBy: [{ name: 'asc' }],
        include: {
          _count: {
            select: {
              sites: true,
            },
          },
          sites: {
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
    ]);

    return {
      generated_at: now.toISOString(),
      clients: clients.map((client) => ({
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
    };
  }

  async listNodes(query: ListNodesQueryDto): Promise<{
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
      pfsense_version_homologated: boolean;
      agent_version: string | null;
      management_ip: string | null;
      wan_ip: string | null;
      open_alerts: number;
    }>;
    generated_at: string;
  }> {
    const now = new Date();
    const searchTerm = query.search?.trim();
    const where: Prisma.NodeWhereInput = {
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

    const nodes = await this.prisma.node.findMany({
      where,
      orderBy: [{ hostname: 'asc' }],
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
      },
    });

    const items = nodes
      .map((node) => {
        const effectiveStatus = deriveEffectiveNodeStatus(node, now);
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
          pfsense_version_homologated: isPfSenseVersionHomologated(node.pfsenseVersion),
          agent_version: node.agentVersion,
          management_ip: node.managementIp,
          wan_ip: node.wanIp,
          open_alerts: node.alerts.length,
        };
      })
      .filter((node) => (query.status ? node.effective_status === query.status : true));

    return {
      items,
      generated_at: now.toISOString(),
    };
  }

  async getNodeById(id: string): Promise<{
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
      pfsense_version: string | null;
      pfsense_version_homologated: boolean;
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
        heartbeats: {
          orderBy: {
            receivedAt: 'desc',
          },
          take: 1,
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

    const latestHeartbeat = node.heartbeats[0];

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
        pfsense_version: node.pfsenseVersion,
        pfsense_version_homologated: isPfSenseVersionHomologated(node.pfsenseVersion),
        agent_version: node.agentVersion,
        ha_role: node.haRole,
        last_seen_at: node.lastSeenAt?.toISOString() ?? null,
        last_boot_at: node.lastBootAt?.toISOString() ?? null,
        latest_heartbeat: latestHeartbeat
          ? {
              received_at: latestHeartbeat.receivedAt.toISOString(),
              sent_at: latestHeartbeat.sentAt.toISOString(),
              heartbeat_id: latestHeartbeat.heartbeatId,
              latency_ms: latestHeartbeat.latencyMs,
              uptime_seconds: latestHeartbeat.uptimeSeconds,
              cpu_percent: latestHeartbeat.cpuPercent,
              memory_percent: latestHeartbeat.memoryPercent,
              disk_percent: latestHeartbeat.diskPercent,
              schema_version: latestHeartbeat.schemaVersion,
              customer_code: latestHeartbeat.customerCode,
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
