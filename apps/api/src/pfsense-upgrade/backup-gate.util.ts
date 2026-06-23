import { ConfigBackupStatus } from '@prisma/client';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

export interface BackupGateEvaluation {
  requires_recent_backup: boolean;
  require_recent_backup_hours: number;
  has_recent_backup: boolean;
  last_backup_at: string | null;
  can_override_no_recent_backup: boolean;
}

export async function evaluateBackupGate(
  prisma: PrismaService,
  nodeId: string,
  canOverride: boolean,
): Promise<BackupGateEvaluation> {
  const requireHours = appConfig.pfsenseUpgrade.requireRecentBackupHours;
  const requiresRecentBackup = requireHours > 0;

  const lastBackup = await prisma.nodeConfigBackup.findFirst({
    where: {
      nodeId,
      status: ConfigBackupStatus.stored,
    },
    orderBy: {
      receivedAt: 'desc',
    },
    select: {
      receivedAt: true,
    },
  });

  const lastBackupAt = lastBackup?.receivedAt ?? null;
  const hasRecentBackup =
    !requiresRecentBackup ||
    (lastBackupAt != null &&
      lastBackupAt.getTime() >= Date.now() - requireHours * 60 * 60_000);

  return {
    requires_recent_backup: requiresRecentBackup,
    require_recent_backup_hours: requireHours,
    has_recent_backup: hasRecentBackup,
    last_backup_at: lastBackupAt?.toISOString() ?? null,
    can_override_no_recent_backup: canOverride,
  };
}
