import { NodeCommand, NodeCommandType, Prisma } from '@prisma/client';
import { getCommandDefinition } from '../commands/command-registry';

/** Called in the transaction that wins the command's terminal transition. */
export async function restoreCommandMaintenance(
  tx: Prisma.TransactionClient,
  command: NodeCommand,
  restoredAt: Date,
): Promise<void> {
  if (
    command.type !== NodeCommandType.pfsense_upgrade &&
    command.type !== NodeCommandType.node_reboot
  ) return;

  // Read persisted metadata, never overwrite a newer scrub/restore with a snapshot.
  const current = await tx.nodeCommand.findUnique({ where: { id: command.id } });
  const payload = current?.payloadJson;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  if (payload.maintenance_mode_toggled !== true || payload.maintenance_restored_at) return;

  // A successful reboot is only scheduled by the agent; keep maintenance until
  // the operator finishes the reboot window. Fail/cancel/timeout compensate it.
  if (command.type === NodeCommandType.node_reboot && current.status === 'succeeded') return;

  const maintenanceModeBefore = payload.maintenance_mode_before === true;
  const claimed = await tx.nodeCommand.updateMany({
    where: { id: command.id, payloadJson: { equals: payload } },
    data: { payloadJson: { ...payload, maintenance_restored_at: restoredAt.toISOString() } },
  });
  if (claimed.count === 0) return;

  await tx.node.update({
    where: { id: command.nodeId },
    data: { maintenanceMode: maintenanceModeBefore },
  });
  await tx.auditLog.create({
    data: {
      actorType: 'system',
      action: `${getCommandDefinition(command.type).auditPrefix}.maintenance_restored`,
      targetType: 'node_command',
      targetId: command.id,
      metadataJson: { node_id: command.nodeId, maintenance_mode: maintenanceModeBefore },
    },
  });
}
