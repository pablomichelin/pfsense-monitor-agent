import { Injectable } from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import { appConfig } from '../config/app-config';
import { isPfSenseVersionHomologated } from '../common/version-matrix.util';
import { PrismaService } from '../prisma/prisma.service';
import { deriveEffectiveNodeStatus } from '../nodes/node-status.util';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<{
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
      versions_out_of_matrix: number;
    };
    version_matrix: {
      homologated_pfsense_versions: string[];
    };
  }> {
    const now = new Date();
    const nodes = await this.prisma.node.findMany({
      select: {
        status: true,
        maintenanceMode: true,
        lastSeenAt: true,
        pfsenseVersion: true,
      },
    });

    const counters = {
      nodes: nodes.length,
      online: 0,
      degraded: 0,
      offline: 0,
      maintenance: 0,
      unknown: 0,
      versions_out_of_matrix: 0,
    };

    for (const node of nodes) {
      const effectiveStatus = deriveEffectiveNodeStatus(node, now);
      counters[effectiveStatus] += 1;
      if (!isPfSenseVersionHomologated(node.pfsenseVersion)) {
        counters.versions_out_of_matrix += 1;
      }
    }

    const openAlerts = await this.prisma.alert.count({
      where: {
        status: AlertStatus.open,
      },
    });

    return {
      generated_at: now.toISOString(),
      version: appConfig.systemVersion,
      totals: {
        ...counters,
        open_alerts: openAlerts,
      },
      version_matrix: {
        homologated_pfsense_versions: appConfig.versionMatrix.homologatedPfSenseVersions,
      },
    };
  }
}
