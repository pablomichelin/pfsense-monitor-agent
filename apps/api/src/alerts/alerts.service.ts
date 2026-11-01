import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  Prisma,
} from '@prisma/client';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListAlertsQueryDto } from './dto/list-alerts-query.dto';

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async listAlerts(actor: AccessActor, query: ListAlertsQueryDto): Promise<{
    generated_at: string;
    total: number;
    page: number;
    limit: number;
    total_pages: number;
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
    await this.accessPolicy.assertRequestedClientFilter(actor, query.client_id);
    if (query.node_id) {
      await this.accessPolicy.assertNodeAccess(actor, query.node_id);
    }
    const baseWhere: Prisma.AlertWhereInput = {
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
    const where = await this.accessPolicy.mergeAlertWhere(actor, baseWhere);

    // Legacy callers receive the original complete list. New UI opts in explicitly.
    const paginated = query.page != null || query.limit != null;
    const limit = query.limit ?? 500;
    const requestedPage = query.page ?? 1;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000
      || !Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > 1000000) {
      throw new BadRequestException('Invalid page or limit');
    }
    return this.prisma.$transaction(async (tx) => {
      // Aggregates and rows share both the RBAC predicate and a DB snapshot.
      const counts = await tx.alert.groupBy({
        by: ['status', 'severity'], where, _count: { _all: true },
      });
      const totals = { open: 0, acknowledged: 0, resolved: 0, critical: 0, warning: 0, info: 0 };
      let total = 0;
      for (const group of counts) {
        totals[group.status] += group._count._all;
        totals[group.severity] += group._count._all;
        total += group._count._all;
      }
      const totalPages = paginated ? Math.max(1, Math.ceil(total / limit)) : 1;
      const page = Math.min(requestedPage, totalPages);
      const alerts = await tx.alert.findMany({
      where,
      orderBy: query.sort_by === 'attention'
        ? [{ severity: 'asc' }, { openedAt: 'asc' }, { id: 'asc' }]
        : [{ status: 'asc' }, { severity: 'asc' }, { openedAt: 'desc' }, { id: 'asc' }],
      ...(paginated ? { take: limit, skip: (page - 1) * limit } : {}),
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

    return {
      generated_at: now.toISOString(),
      total, page, limit: paginated ? limit : total, total_pages: totalPages,
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async acknowledgeAlert(
    accessActor: AccessActor,
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
        nodeId: true,
      },
    });

    if (!alert) {
      throw new NotFoundException('alert not found');
    }

    try {
      await this.accessPolicy.assertNodeAccess(accessActor, alert.nodeId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException('alert out of scope');
      }
      throw error;
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
    accessActor: AccessActor,
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
        nodeId: true,
      },
    });

    if (!alert) {
      throw new NotFoundException('alert not found');
    }

    try {
      await this.accessPolicy.assertNodeAccess(accessActor, alert.nodeId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException('alert out of scope');
      }
      throw error;
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
