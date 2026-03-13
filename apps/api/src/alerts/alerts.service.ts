import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAlertsQueryDto } from './dto/list-alerts-query.dto';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAlerts(query: ListAlertsQueryDto): Promise<{
    generated_at: string;
    totals: {
      open: number;
      acknowledged: number;
      resolved: number;
      critical: number;
      warning: number;
      info: number;
    };
    items: Array<{
      id: string;
      type: AlertType;
      severity: AlertSeverity;
      status: AlertStatus;
      title: string;
      description: string;
      opened_at: string;
      acknowledged_at: string | null;
      acknowledged_by: string | null;
      resolved_at: string | null;
      resolution_note: string | null;
      metadata_json: Prisma.JsonValue | null;
      node: {
        id: string;
        node_uid: string;
        hostname: string;
        display_name: string | null;
        management_ip: string | null;
        pfsense_version: string | null;
      };
      client: {
        id: string;
        name: string;
        code: string;
      };
      site: {
        id: string;
        name: string;
        code: string;
      };
    }>;
  }> {
    const now = new Date();
    const searchTerm = query.search?.trim();
    const where: Prisma.AlertWhereInput = {
      status: query.status as AlertStatus | undefined,
      severity: query.severity as AlertSeverity | undefined,
      type: query.type as AlertType | undefined,
      nodeId: query.node_id,
      node: {
        siteId: query.site_id,
        site: query.client_id
          ? {
              clientId: query.client_id,
            }
          : undefined,
      },
      OR: searchTerm
        ? [
            {
              title: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
            {
              node: {
                hostname: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            },
            {
              node: {
                displayName: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            },
            {
              node: {
                nodeUid: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            },
            {
              node: {
                site: {
                  name: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
              },
            },
            {
              node: {
                site: {
                  client: {
                    name: {
                      contains: searchTerm,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            },
          ]
        : undefined,
    };

    const alerts = await this.prisma.alert.findMany({
      where,
      orderBy: [{ status: 'asc' }, { severity: 'asc' }, { openedAt: 'desc' }],
      include: {
        node: {
          include: {
            site: {
              include: {
                client: true,
              },
            },
          },
        },
      },
    });

    const totals = {
      open: 0,
      acknowledged: 0,
      resolved: 0,
      critical: 0,
      warning: 0,
      info: 0,
    };

    for (const alert of alerts) {
      totals[alert.status] += 1;
      totals[alert.severity] += 1;
    }

    return {
      generated_at: now.toISOString(),
      totals,
      items: alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        title: alert.title,
        description: alert.description,
        opened_at: alert.openedAt.toISOString(),
        acknowledged_at: alert.acknowledgedAt?.toISOString() ?? null,
        acknowledged_by: alert.acknowledgedBy,
        resolved_at: alert.resolvedAt?.toISOString() ?? null,
        resolution_note: alert.resolutionNote,
        metadata_json: (alert.metadataJson as Prisma.JsonValue | null) ?? null,
        node: {
          id: alert.node.id,
          node_uid: alert.node.nodeUid,
          hostname: alert.node.hostname,
          display_name: alert.node.displayName,
          management_ip: alert.node.managementIp,
          pfsense_version: alert.node.pfsenseVersion,
        },
        client: {
          id: alert.node.site.client.id,
          name: alert.node.site.client.name,
          code: alert.node.site.client.code,
        },
        site: {
          id: alert.node.site.id,
          name: alert.node.site.name,
          code: alert.node.site.code,
        },
      })),
    };
  }

  async acknowledgeAlert(
    alertId: string,
    actor: { userId?: string; email?: string },
    actorIp?: string,
  ): Promise<{
    alert_id: string;
    status: 'acknowledged';
    acknowledged_at: string;
    acknowledged_by: string;
  }> {
    const alert = await this.prisma.alert.findUnique({
      where: {
        id: alertId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!alert) {
      throw new NotFoundException('alert not found');
    }

    if (alert.status === AlertStatus.resolved) {
      throw new ConflictException('resolved alert cannot be acknowledged');
    }

    const acknowledgedAt = new Date();
    const acknowledgedBy = actor.email?.trim() || actor.userId || 'unknown';

    await this.prisma.alert.update({
      where: {
        id: alertId,
      },
      data: {
        status: AlertStatus.acknowledged,
        acknowledgedAt,
        acknowledgedBy,
      },
    });

    await this.writeAuditLog({
      actorId: actor.userId,
      action: 'alert.acknowledge',
      targetType: 'alert',
      targetId: alertId,
      ipAddress: actorIp,
      metadataJson: {
        acknowledged_by: acknowledgedBy,
      },
    });

    return {
      alert_id: alertId,
      status: AlertStatus.acknowledged,
      acknowledged_at: acknowledgedAt.toISOString(),
      acknowledged_by: acknowledgedBy,
    };
  }

  async resolveAlert(
    alertId: string,
    input: { resolution_note?: string },
    actor: { userId?: string; email?: string },
    actorIp?: string,
  ): Promise<{
    alert_id: string;
    status: 'resolved';
    resolved_at: string;
    resolution_note: string | null;
  }> {
    const alert = await this.prisma.alert.findUnique({
      where: {
        id: alertId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!alert) {
      throw new NotFoundException('alert not found');
    }

    if (alert.status === AlertStatus.resolved) {
      throw new ConflictException('alert already resolved');
    }

    const resolvedAt = new Date();
    const resolutionNote = input.resolution_note?.trim() || null;

    await this.prisma.alert.update({
      where: {
        id: alertId,
      },
      data: {
        status: AlertStatus.resolved,
        resolvedAt,
        resolutionNote,
      },
    });

    await this.writeAuditLog({
      actorId: actor.userId,
      action: 'alert.resolve',
      targetType: 'alert',
      targetId: alertId,
      ipAddress: actorIp,
      metadataJson: {
        resolution_note: resolutionNote,
        resolved_by: actor.email?.trim() || actor.userId || 'unknown',
      },
    });

    return {
      alert_id: alertId,
      status: AlertStatus.resolved,
      resolved_at: resolvedAt.toISOString(),
      resolution_note: resolutionNote,
    };
  }

  private async writeAuditLog(input: {
    actorId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    ipAddress?: string;
    metadataJson?: Prisma.JsonObject;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: input.actorId ? 'user' : 'system',
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
