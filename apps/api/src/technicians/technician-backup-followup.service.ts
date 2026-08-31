import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  NodeCommand,
  NodeCommandType,
  NodeCommandStatus,
  Prisma,
  TechnicianNodeAccountStatus,
} from '@prisma/client';
import { CommandOrchestratorService } from '../commands/command-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseFollowUpTechnicianProvision,
  scrubFollowUpFromBackupPayload,
} from './technician-accounts.util';

@Injectable()
export class TechnicianBackupFollowUpService implements OnModuleInit {
  private readonly logger = new Logger(TechnicianBackupFollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: CommandOrchestratorService,
  ) {}

  onModuleInit(): void {
    void this.reconcileStuckSucceededBackups();
  }

  /** Recupera backups já succeeded cujo follow-up não rodou (ex.: via ingest). */
  async reconcileStuckSucceededBackups(): Promise<void> {
    const candidates = await this.prisma.nodeCommand.findMany({
      where: {
        type: NodeCommandType.config_backup_now,
        status: NodeCommandStatus.succeeded,
      },
      orderBy: { completedAt: 'asc' },
      take: 200,
    });

    let processed = 0;
    for (const command of candidates) {
      if (!parseFollowUpTechnicianProvision(command.payloadJson)) {
        continue;
      }

      try {
        await this.processAfterBackupSuccess(command);
        processed += 1;
      } catch (error) {
        this.logger.warn(
          `reconcile stuck backup follow-up failed command=${command.id}: ${String(error)}`,
        );
      }
    }

    if (processed > 0) {
      this.logger.log(`reconciled ${processed} stuck backup follow-up(s)`);
    }
  }

  /**
   * Claim atômico do follow-up (FOR UPDATE) para não enfileirar create/senha
   * duas vezes se a API reiniciar no meio do processAfterBackupSuccess.
   */
  private async claimFollowUp(
    commandId: string,
  ): Promise<ReturnType<typeof parseFollowUpTechnicianProvision>> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ payload_json: Prisma.JsonValue }>>(
        Prisma.sql`SELECT payload_json FROM node_commands WHERE id = ${commandId}::uuid FOR UPDATE`,
      );
      const followUp = parseFollowUpTechnicianProvision(
        rows[0]?.payload_json ?? null,
      );
      if (!followUp) {
        return null;
      }

      const scrubbed = scrubFollowUpFromBackupPayload(rows[0]?.payload_json ?? null);
      const claimed =
        scrubbed && typeof scrubbed === 'object' && !Array.isArray(scrubbed)
          ? {
              ...(scrubbed as Record<string, unknown>),
              follow_up_claimed_at: new Date().toISOString(),
            }
          : { follow_up_claimed_at: new Date().toISOString() };

      await tx.nodeCommand.update({
        where: { id: commandId },
        data: { payloadJson: claimed as Prisma.InputJsonValue },
      });

      return followUp;
    });
  }

  /**
   * Após config_backup_now succeeded: enfileira create/set_password pendente
   * armazenado em payload_json.follow_up_technician_provision.
   */
  async processAfterBackupSuccess(command: NodeCommand): Promise<void> {
    if (command.type !== NodeCommandType.config_backup_now) {
      return;
    }

    const followUp = await this.claimFollowUp(command.id);
    if (!followUp) {
      return;
    }

    const commandType =
      followUp.action === 'local_user_set_password'
        ? NodeCommandType.local_user_set_password
        : NodeCommandType.local_user_create;

    const payloadJson: Record<string, unknown> = {
      technician_id: followUp.technician_id,
      account_id: followUp.account_id,
      pfsense_username: followUp.pfsense_username,
      password: followUp.password,
    };

    if (followUp.action === 'local_user_create') {
      if (followUp.full_name) {
        payloadJson.full_name = followUp.full_name;
      }
      if (followUp.privilege_profile) {
        payloadJson.privilege_profile = followUp.privilege_profile;
      }
    }

    try {
      const provisionCommand = await this.orchestrator.enqueueCommand({
        nodeId: command.nodeId,
        type: commandType,
        requestedByUserId: followUp.requested_by_user_id,
        payloadJson: payloadJson as Prisma.InputJsonValue,
      });

      await this.prisma.technicianNodeAccount.updateMany({
        where: { id: followUp.account_id },
        data: {
          lastCommandId: provisionCommand.id,
          status:
            followUp.action === 'local_user_set_password'
              ? TechnicianNodeAccountStatus.password_reset_pending
              : TechnicianNodeAccountStatus.pending_create,
          lastError: null,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorType: 'system',
          action: 'technician.provision_after_backup',
          targetType: 'node_command',
          targetId: provisionCommand.id,
          metadataJson: {
            backup_command_id: command.id,
            node_id: command.nodeId,
            technician_id: followUp.technician_id,
            account_id: followUp.account_id,
            follow_up_action: followUp.action,
          },
        },
      });
    } catch (error) {
      this.logger.warn(
        `follow-up provision after backup failed command=${command.id}: ${String(error)}`,
      );

      await this.prisma.technicianNodeAccount.updateMany({
        where: { id: followUp.account_id },
        data: {
          status: TechnicianNodeAccountStatus.failed,
          lastError: 'provision after backup failed to enqueue',
        },
      });
    }
  }
}
