import {
  isPackageOutdated,
  PackageVersionState,
  resolvePackageVersionState,
} from '../common/package-version.util';
import { BackupVisualStatus } from '../nodes/backup-visual-status.util';

export type EffectiveNodeStatus =
  | 'online'
  | 'degraded'
  | 'offline'
  | 'maintenance'
  | 'unknown';

export type FleetNodeRecord = {
  effectiveStatus: EffectiveNodeStatus;
  backupStatus: BackupVisualStatus;
  pfsenseVersion: string | null;
  agentVersion: string | null;
};

export type FleetTotals = {
  nodes: number;
  online: number;
  degraded: number;
  offline: number;
  maintenance: number;
  unknown: number;
};

export type FleetCompliance = {
  backup_ok_count: number;
  backup_ok_percent: number | null;
  package_outdated_count: number;
  package_outdated_percent: number | null;
  package_target_version: string | null;
};

export type FleetVersionMatrixRow = {
  version: string;
  count: number;
  alignment?: PackageVersionState;
};

export type FleetVersionMatrix = {
  pfsense: FleetVersionMatrixRow[];
  package: FleetVersionMatrixRow[];
};

export function normalizePfsenseVersionLabel(
  version: string | null | undefined,
): string {
  if (!version?.trim()) {
    return 'nao informado';
  }

  const normalized = version.replace(/-RELEASE$/i, '').trim();
  return normalized || 'nao informado';
}

export function normalizePackageVersionLabel(
  version: string | null | undefined,
): string {
  if (!version?.trim()) {
    return 'nao informado';
  }

  return version.trim();
}

function percent(count: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  return Math.round((count / total) * 100);
}

function incrementMap(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mapToSortedRows(
  map: Map<string, number>,
  alignmentByVersion?: Map<string, PackageVersionState>,
): FleetVersionMatrixRow[] {
  return [...map.entries()]
    .map(([version, count]) => ({
      version,
      count,
      ...(alignmentByVersion?.has(version)
        ? { alignment: alignmentByVersion.get(version) }
        : {}),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.version.localeCompare(right.version, 'pt-BR');
    });
}

export function aggregateFleetMetrics(
  nodes: FleetNodeRecord[],
  packageTargetVersion: string | null,
): {
  totals: FleetTotals;
  compliance: FleetCompliance;
  version_matrix: FleetVersionMatrix;
} {
  const totals: FleetTotals = {
    nodes: nodes.length,
    online: 0,
    degraded: 0,
    offline: 0,
    maintenance: 0,
    unknown: 0,
  };

  let backupOkCount = 0;
  let packageOutdatedCount = 0;
  const pfsenseCounts = new Map<string, number>();
  const packageCounts = new Map<string, number>();
  const packageAlignment = new Map<string, PackageVersionState>();

  for (const node of nodes) {
    totals[node.effectiveStatus] += 1;

    if (node.backupStatus === 'ok') {
      backupOkCount += 1;
    }

    if (isPackageOutdated(node.agentVersion, packageTargetVersion)) {
      packageOutdatedCount += 1;
    }

    const pfsenseLabel = normalizePfsenseVersionLabel(node.pfsenseVersion);
    incrementMap(pfsenseCounts, pfsenseLabel);

    const packageLabel = normalizePackageVersionLabel(node.agentVersion);
    incrementMap(packageCounts, packageLabel);
    if (!packageAlignment.has(packageLabel)) {
      packageAlignment.set(
        packageLabel,
        resolvePackageVersionState(node.agentVersion, packageTargetVersion),
      );
    }
  }

  return {
    totals,
    compliance: {
      backup_ok_count: backupOkCount,
      backup_ok_percent: percent(backupOkCount, nodes.length),
      package_outdated_count: packageOutdatedCount,
      package_outdated_percent: percent(packageOutdatedCount, nodes.length),
      package_target_version: packageTargetVersion,
    },
    version_matrix: {
      pfsense: mapToSortedRows(pfsenseCounts),
      package: mapToSortedRows(packageCounts, packageAlignment),
    },
  };
}
