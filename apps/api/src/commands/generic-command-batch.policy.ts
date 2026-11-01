import { BadRequestException } from '@nestjs/common';
import { NodeCommandType } from '@prisma/client';

// This HTTP contract has no payload, confirmation or operation-specific gates.
// Internal batch producers still use the orchestrator after their own gates.
export const GENERIC_BATCH_COMMAND_TYPES = [NodeCommandType.config_backup_now] as const;

export function assertGenericBatchCommandType(type: NodeCommandType): void {
  if ((GENERIC_BATCH_COMMAND_TYPES as readonly NodeCommandType[]).includes(type)) return;
  throw new BadRequestException(
    type === NodeCommandType.pfsense_upgrade
      ? 'pfsense_upgrade requires POST /api/v1/nodes/:id/pfsense-upgrade/request with its feature, backup and maintenance gates'
      : 'command type requires its dedicated operation endpoint with payload, confirmation and feature gates',
  );
}
