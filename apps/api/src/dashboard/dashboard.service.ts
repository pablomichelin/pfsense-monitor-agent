import { Injectable } from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { deriveEffectiveNodeStatus } from '../nodes/node-status.util';

const SUMMARY_CACHE_TTL_MS = 20000;

@Injectable()
export class DashboardService {
  private summaryCache: {
    data: {
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
    expiresAt: number;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getSummary(actor: AccessActor): Promise<{
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
  }> {
    const now = Date.now();
    if (this.summaryCache && this.summaryCache.expiresAt > now) {
      return this.summaryCache.data;
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

    const result = {
      generated_at: nowDate.toISOString(),
      version: appConfig.systemVersion,
      totals: {
        ...counters,
        open_alerts: openAlerts,
      },
    };

    this.summaryCache = {
      data: result,
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    };

    return result;
  }
}
