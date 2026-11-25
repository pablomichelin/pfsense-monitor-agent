import type { Prisma } from '@prisma/client';

export async function lockBackupPolicyRow(
  tx: Prisma.TransactionClient,
  nodeId: string,
): Promise<{ configBackupPolicyJson: Prisma.JsonValue } | undefined> {
  const [node] = await tx.$queryRaw<Array<{ configBackupPolicyJson: Prisma.JsonValue }>>`
    SELECT config_backup_policy_json AS "configBackupPolicyJson"
    FROM nodes WHERE id = ${nodeId}::uuid FOR UPDATE
  `;
  return node;
}
