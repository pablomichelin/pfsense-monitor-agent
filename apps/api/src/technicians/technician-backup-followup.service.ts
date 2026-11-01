import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
export class TechnicianBackupFollowUpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TechnicianBackupFollowUpService.name);
  private timer?: NodeJS.Timeout;
  private reconciling = false;
  private afterId?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: CommandOrchestratorService,
  ) {}

  onModuleInit(): void {
    void this.reconcileStuckSucceededBackups();
    this.timer = setInterval(() => { void this.reconcileStuckSucceededBackups(); }, 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The succeeded backup and its payload are a durable outbox, not a callback. */
  async reconcileStuckSucceededBackups(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const candidates = await this.prisma.nodeCommand.findMany({
        where: {
          type: NodeCommandType.config_backup_now,
          status: NodeCommandStatus.succeeded,
          payloadJson: { path: ['follow_up_technician_provision'], not: Prisma.AnyNull },
          ...(this.afterId ? { id: { gt: this.afterId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 200,
      });
      // Advance past failures too, so a blocked node cannot starve later work.
      this.afterId = candidates.length === 200 ? candidates[candidates.length - 1].id : undefined;
      for (const command of candidates) {
        try {
          await this.processAfterBackupSuccess(command);
        } catch {
          // Keep the intent and secret intact for the next reconciliation cycle.
          this.logger.warn(`backup follow-up pending retry command=${command.id}`);
        }
      }
    } catch {
      this.logger.warn('backup follow-up reconciliation unavailable; durable intents retained');
    } finally {
      this.reconciling = false;
    }
  }

  async processAfterBackupSuccess(snapshot: NodeCommand): Promise<void> {
    if (snapshot.type !== NodeCommandType.config_backup_now) return;
    await this.prisma.$transaction(async (tx) => {
      // Same lock order as enqueue: node first, then command. The payload CAS
      // serializes concurrent dispatchers. No secret is removed before enqueue
      // and account ownership have committed in this SAME transaction.
      await tx.$queryRaw`SELECT id FROM nodes WHERE id = ${snapshot.nodeId}::uuid FOR UPDATE`;
      const command = await tx.nodeCommand.findFirst({
        where: { id: snapshot.id, nodeId: snapshot.nodeId, type: NodeCommandType.config_backup_now },
      });
      if (!command || command.status !== NodeCommandStatus.succeeded) return;
      const followUp = parseFollowUpTechnicianProvision(command.payloadJson);
      if (!followUp) return;
      const scrubbed = scrubFollowUpFromBackupPayload(command.payloadJson);
      const ledger = scrubbed && typeof scrubbed === 'object' && !Array.isArray(scrubbed)
        ? scrubbed as Record<string, Prisma.InputJsonValue> : {};
      const claimed = await tx.nodeCommand.updateMany({
        where: {
          id: command.id, status: NodeCommandStatus.succeeded,
          payloadJson: { equals: command.payloadJson as Prisma.InputJsonValue },
        },
        data: { payloadJson: { ...ledger, follow_up_state: 'dispatching' } },
      });
      if (!claimed.count) return;
      // Claim only the account still waiting for THIS backup, never a newer
      // reset, revocation, or another node/technician's account.
      const owner = await tx.technicianNodeAccount.updateMany({
        where: {
          id: followUp.account_id, nodeId: command.nodeId,
          technicianId: followUp.technician_id, lastCommandId: command.id,
        },
        data: { lastError: null },
      });
      if (!owner.count) {
        await tx.nodeCommand.update({
          where: { id: command.id },
          data: { payloadJson: { ...ledger, follow_up_state: 'superseded' } },
        });
        return;
      }
      const payload: Record<string, string> = {
        technician_id: followUp.technician_id,
        account_id: followUp.account_id,
        pfsense_username: followUp.pfsense_username,
        password: followUp.password,
      };
      if (followUp.action === 'local_user_create') {
        if (followUp.full_name) payload.full_name = followUp.full_name;
        if (followUp.privilege_profile) payload.privilege_profile = followUp.privilege_profile;
      }
      const provisionCommand = await this.orchestrator.enqueueCommand({
        nodeId: command.nodeId,
        type: followUp.action === 'local_user_set_password'
          ? NodeCommandType.local_user_set_password : NodeCommandType.local_user_create,
        requestedByUserId: followUp.requested_by_user_id,
        payloadJson: payload,
      }, tx);
      const linked = await tx.technicianNodeAccount.updateMany({
        where: { id: followUp.account_id, lastCommandId: command.id },
        data: {
          lastCommandId: provisionCommand.id,
          status: followUp.action === 'local_user_set_password'
            ? TechnicianNodeAccountStatus.password_reset_pending : TechnicianNodeAccountStatus.pending_create,
          lastError: null,
        },
      });
      if (linked.count !== 1) throw new Error('backup follow-up account ownership changed');
      await tx.nodeCommand.update({
        where: { id: command.id },
        data: { payloadJson: {
          ...ledger,
          follow_up_state: 'enqueued',
          follow_up_command_id: provisionCommand.id,
          follow_up_enqueued_at: new Date().toISOString(),
        } },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'system', action: 'technician.provision_after_backup',
          targetType: 'node_command', targetId: provisionCommand.id,
          metadataJson: {
            backup_command_id: command.id, node_id: command.nodeId,
            technician_id: followUp.technician_id, account_id: followUp.account_id,
            follow_up_action: followUp.action,
          },
        },
      });
    });
  }
}
