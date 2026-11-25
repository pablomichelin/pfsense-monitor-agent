import { ConfigBackupStatus, type NodeConfigBackup } from '@prisma/client';

export function resolveBackupArtifactUid(
  backup: Pick<NodeConfigBackup, 'status' | 'backupUid' | 'metadataJson'>,
): string {
  const metadata = backup.metadataJson;
  if (backup.status === ConfigBackupStatus.duplicate &&
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const artifactUid = metadata.duplicate_of;
    if (typeof artifactUid === 'string' && artifactUid.length > 0) {
      return artifactUid;
    }
  }

  return backup.backupUid;
}
