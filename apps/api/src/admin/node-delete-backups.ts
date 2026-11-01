import { Prisma } from '@prisma/client';

/**
 * Durable inventory for manual recovery/cleanup, NOT an automatic deletion queue.
 * AuditLog has no FK to Node/NodeConfigBackup, so these records survive cascade.
 * The caller must hold FOR UPDATE on every node and commit this in the same
 * transaction as the deletion. Never unlink files here: rollback cannot restore
 * them. This only covers files whose metadata was committed before the node lock;
 * ingest/retention filesystem races need a separate recoverable outbox workflow.
 */
export async function preserveNodeDeleteBackups(
  tx: Prisma.TransactionClient,
  nodes: Array<{ id: string; nodeUid: string }>,
  actorId?: string,
  actorIp?: string,
): Promise<number> {
  const nodeUids = new Map(nodes.map((node) => [node.id, node.nodeUid]));
  const backups = await tx.nodeConfigBackup.findMany({
    where: { nodeId: { in: nodes.map((node) => node.id) }, storagePath: { not: null } },
    select: {
      id: true,
      nodeId: true,
      backupUid: true,
      storagePath: true,
      encryptionVersion: true,
      configSha256: true,
      payloadSha256: true,
      sizeBytes: true,
      payloadSizeBytes: true,
      compression: true,
      receivedAt: true,
    },
    orderBy: { id: 'asc' },
  });

  // Separate rows keep large batch manifests out of a single audit JSON value.
  for (let offset = 0; offset < backups.length; offset += 100) {
    await tx.auditLog.createMany({
      data: backups.slice(offset, offset + 100).map((backup) => ({
        actorType: 'user_session',
        actorId,
        ipAddress: actorIp,
        action: 'backup.config.node_delete_cleanup_pending',
        targetType: 'node_config_backup',
        targetId: backup.id,
        metadataJson: {
          manifest_version: 1,
          cleanup_state: 'pending_manual_review',
          node_id: backup.nodeId,
          node_uid: nodeUids.get(backup.nodeId)!,
          backup_uid: backup.backupUid,
          storage_path: backup.storagePath,
          encryption_version: backup.encryptionVersion,
          config_sha256: backup.configSha256,
          payload_sha256: backup.payloadSha256,
          size_bytes: backup.sizeBytes,
          payload_size_bytes: backup.payloadSizeBytes,
          compression: backup.compression,
          received_at: backup.receivedAt.toISOString(),
        },
      })),
    });
  }
  return backups.length;
}
