import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ConfigBackupStatus,
  NodeCommandType,
  Prisma,
  Technician,
  TechnicianNodeAccountStatus,
  TechnicianStatus,
} from '@prisma/client';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { isAgentVersionAtLeast } from '../common/agent-version';
import { appConfig } from '../config/app-config';
import { CommandOrchestratorService } from '../commands/command-orchestrator.service';
import {
  parseStoredBackupPolicy,
  resolveBackupFreshnessAt,
} from '../nodes/backup-policy.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  BatchPasswordResetTechnicianDto,
  BatchProvisionTechnicianDto,
  BatchRevokeTechnicianDto,
  CreateTechnicianDto,
  DeleteTechnicianAccountDto,
  FleetRevokeTechnicianDto,
  PasswordResetTechnicianAccountDto,
  ProvisionTechnicianAccountDto,
} from './dto/technicians.dto';
import {
  buildFollowUpTechnicianProvisionPayload,
  evaluateRecentBackupSkipReason,
  parseLocalUsersSnapshot,
  type LocalUserSnapshotEntry,
  resolveTechnicianPassword,
  userAlreadyActiveInSnapshot,
  userExistsInSnapshot,
  validatePrivilegeProfile,
  validatePfsenseUsername,
  wouldViolateLastAdminGuardrail,
} from './technician-accounts.util';

/** Username gerenciável (padrão + nunca admin/root), inclusive linhas já no banco. */
function requireManagedPfsenseUsername(raw: string): string {
  return validatePfsenseUsername(raw);
}

type BatchTechnicianResultItem = {
  node_id: string;
  hostname: string | null;
  outcome: 'skipped' | 'enqueued' | 'backup_queued' | 'failed';
  reason: string | null;
  command_id: string | null;
  status: string | null;
};

type BatchRevokeResultItem = BatchTechnicianResultItem;

@Injectable()
export class TechniciansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: CommandOrchestratorService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  private assertTechnicianAccountsEnabled() {
    if (!appConfig.technicianAccounts.enabled) {
      throw new ServiceUnavailableException('technician accounts are disabled');
    }
  }

  private assertDisableEnabled() {
    this.assertTechnicianAccountsEnabled();
    if (!appConfig.technicianAccounts.disableEnabled) {
      throw new ServiceUnavailableException('technician account disable is disabled');
    }
  }

  private assertDeleteEnabled() {
    this.assertTechnicianAccountsEnabled();
    if (!appConfig.technicianAccounts.deleteEnabled) {
      throw new ServiceUnavailableException('technician account delete is disabled');
    }
  }

  private assertCreateEnabled() {
    this.assertTechnicianAccountsEnabled();
    if (!appConfig.technicianAccounts.createEnabled) {
      throw new ServiceUnavailableException('technician account create is disabled');
    }
  }

  private assertPasswordResetEnabled() {
    this.assertTechnicianAccountsEnabled();
    if (!appConfig.technicianAccounts.passwordResetEnabled) {
      throw new ServiceUnavailableException('technician account password reset is disabled');
    }
  }

  /**
   * Data efetiva do backup mais recente por node (`stored` ou `duplicate`).
   * Se o heartbeat confirma o mesmo SHA, last_checked_at conta como frescura
   * (o controlador já tem o XML atual).
   */
  private async fetchLatestBackupAtByNode(nodeIds: string[]): Promise<Map<string, Date>> {
    if (nodeIds.length === 0) {
      return new Map();
    }

    const [rows, nodes] = await Promise.all([
      this.prisma.nodeConfigBackup.findMany({
        where: {
          nodeId: { in: nodeIds },
          status: {
            in: [ConfigBackupStatus.stored, ConfigBackupStatus.duplicate],
          },
        },
        orderBy: { receivedAt: 'desc' },
        select: { nodeId: true, receivedAt: true, configSha256: true },
      }),
      this.prisma.node.findMany({
        where: { id: { in: nodeIds } },
        select: { id: true, configBackupPolicyJson: true },
      }),
    ]);

    const latestByNode = new Map<
      string,
      { receivedAt: Date; configSha256: string }
    >();
    for (const row of rows) {
      if (!latestByNode.has(row.nodeId)) {
        latestByNode.set(row.nodeId, {
          receivedAt: row.receivedAt,
          configSha256: row.configSha256,
        });
      }
    }

    const policyByNode = new Map(
      nodes.map((node) => [
        node.id,
        parseStoredBackupPolicy(node.configBackupPolicyJson),
      ]),
    );

    const map = new Map<string, Date>();
    for (const nodeId of nodeIds) {
      const latest = latestByNode.get(nodeId);
      if (!latest) {
        continue;
      }
      const freshness = resolveBackupFreshnessAt({
        latestBackupReceivedAt: latest.receivedAt,
        latestBackupSha256: latest.configSha256,
        policy: policyByNode.get(nodeId) ?? null,
      });
      if (freshness) {
        map.set(nodeId, freshness);
      }
    }
    return map;
  }

  /**
   * Guardrail de backup recente (doc 144 secao 7 item 9 / doc 154): aplicado a
   * toda escrita de usuarios locais (create/set_password/disable/delete),
   * nao so a primeira. Desligavel via
   * TECHNICIAN_ACCOUNT_REQUIRE_RECENT_BACKUP_ENABLED para operacao/lab.
   */
  private getBackupSkipReason(latestBackupAt: Date | null | undefined): string | null {
    if (!appConfig.technicianAccounts.requireRecentBackupEnabled) {
      return null;
    }

    return evaluateRecentBackupSkipReason(
      latestBackupAt ?? null,
      appConfig.technicianAccounts.requireRecentBackupMaxAgeHours,
    );
  }

  /**
   * Lista técnicos do cadastro central.
   * Default: apenas `active` (removidos não aparecem na matriz/painéis).
   * Passe `'all'` para incluir soft-deletes históricos ainda no banco.
   */
  async listTechnicians(status: TechnicianStatus | 'all' = TechnicianStatus.active) {
    const technicians = await this.prisma.technician.findMany({
      where: status === 'all' ? undefined : { status },
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
      include: {
        _count: {
          select: { nodeAccounts: true },
        },
      },
    });

    return {
      generated_at: new Date().toISOString(),
      items: technicians.map((technician) => ({
        id: technician.id,
        full_name: technician.fullName,
        login_username: technician.loginUsername,
        status: technician.status,
        notes: technician.notes,
        node_account_count: technician._count.nodeAccounts,
        created_at: technician.createdAt.toISOString(),
        revoked_at: technician.revokedAt?.toISOString() ?? null,
      })),
    };
  }

  async getTechnician(id: string) {
    const technician = await this.prisma.technician.findUnique({
      where: { id },
      include: {
        nodeAccounts: {
          include: {
            node: {
              select: {
                id: true,
                hostname: true,
                displayName: true,
                agentVersion: true,
                lastSeenAt: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!technician) {
      throw new NotFoundException('technician not found');
    }

    return {
      generated_at: new Date().toISOString(),
      technician: {
        id: technician.id,
        full_name: technician.fullName,
        login_username: technician.loginUsername,
        status: technician.status,
        notes: technician.notes,
        created_at: technician.createdAt.toISOString(),
        revoked_at: technician.revokedAt?.toISOString() ?? null,
        node_accounts: technician.nodeAccounts.map((account) => ({
          id: account.id,
          node_id: account.nodeId,
          hostname: account.node.hostname,
          display_name: account.node.displayName,
          pfsense_username: account.pfsenseUsername,
          privilege_profile: account.privilegeProfile,
          status: account.status,
          last_synced_at: account.lastSyncedAt?.toISOString() ?? null,
          last_error: account.lastError,
        })),
      },
    };
  }

  /**
   * Lista as contas de tecnico existentes em um firewall especifico — usado
   * pelo detalhe do node ("quem tem acesso a este firewall?", Fase 3 plano
   * 144) e pela pagina /admin/tecnicos.
   */
  async listNodeAccounts(nodeId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, hostname: true },
    });
    if (!node) {
      throw new NotFoundException('node not found');
    }

    const accounts = await this.prisma.technicianNodeAccount.findMany({
      where: { nodeId },
      include: {
        technician: {
          select: { id: true, fullName: true, loginUsername: true, status: true },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    return {
      generated_at: new Date().toISOString(),
      node_id: node.id,
      hostname: node.hostname,
      items: accounts.map((account) => ({
        id: account.id,
        technician_id: account.technicianId,
        technician_full_name: account.technician.fullName,
        technician_login_username: account.technician.loginUsername,
        technician_status: account.technician.status,
        pfsense_username: account.pfsenseUsername,
        privilege_profile: account.privilegeProfile,
        status: account.status,
        last_synced_at: account.lastSyncedAt?.toISOString() ?? null,
        last_error: account.lastError,
      })),
    };
  }

  /**
   * Remove o técnico do cadastro central de verdade (hard delete).
   * Não toca usuários nos pfSense — só o registro no controlador e o
   * histórico de contas por node. Soft-deletes antigos (`revoked`) também
   * podem ser apagados por este caminho (limpeza da matriz).
   */
  async revokeTechnicianFromRegistry(
    userId: string,
    technicianId: string,
    confirmLoginUsername: string,
    ipAddress?: string,
  ) {
    this.assertTechnicianAccountsEnabled();

    const technician = await this.prisma.technician.findUnique({
      where: { id: technicianId },
      include: {
        _count: { select: { nodeAccounts: true } },
      },
    });

    if (!technician) {
      throw new NotFoundException('technician not found');
    }

    const normalizedConfirm = confirmLoginUsername.trim().toLowerCase();
    if (normalizedConfirm !== technician.loginUsername.toLowerCase()) {
      throw new ConflictException('confirm_login_username does not match technician login');
    }

    const nodeAccountCount = technician._count.nodeAccounts;
    const deletedAt = new Date();

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'technician.registry_delete',
        targetType: 'technician',
        targetId: technician.id,
        ipAddress,
        metadataJson: {
          login_username: technician.loginUsername,
          full_name: technician.fullName,
          previous_status: technician.status,
          node_account_count: nodeAccountCount,
          deleted_at: deletedAt.toISOString(),
        },
      },
    });

    await this.prisma.$transaction([
      this.prisma.technicianNodeAccount.deleteMany({
        where: { technicianId: technician.id },
      }),
      this.prisma.technician.delete({
        where: { id: technician.id },
      }),
    ]);

    return {
      id: technician.id,
      full_name: technician.fullName,
      login_username: technician.loginUsername,
      status: 'deleted',
      revoked_at: deletedAt.toISOString(),
    };
  }

  async createTechnician(userId: string, dto: CreateTechnicianDto, ipAddress?: string) {
    this.assertTechnicianAccountsEnabled();

    const loginUsername = validatePfsenseUsername(dto.login_username);
    const fullName = dto.full_name.trim();
    const notes = dto.notes?.trim() || null;

    // Login e globalmente unico no cadastro (mesmo apos revogacao). Se ja existir
    // um tecnico revogado com este login (ex.: recontratacao, correcao de cadastro
    // apos remocao por engano), reativa o registro em vez de bloquear para sempre.
    const existing = await this.prisma.technician.findUnique({
      where: { loginUsername },
    });

    if (existing && existing.status === TechnicianStatus.revoked) {
      const reactivated = await this.prisma.technician.update({
        where: { id: existing.id },
        data: {
          fullName,
          notes,
          status: TechnicianStatus.active,
          revokedAt: null,
          revokedByUserId: null,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorType: 'user',
          actorId: userId,
          action: 'technician.reactivate',
          targetType: 'technician',
          targetId: reactivated.id,
          ipAddress,
          metadataJson: {
            login_username: loginUsername,
          },
        },
      });

      return {
        id: reactivated.id,
        full_name: reactivated.fullName,
        login_username: reactivated.loginUsername,
        status: reactivated.status,
      };
    }

    if (existing) {
      throw new ConflictException('login_username already registered');
    }

    let technician: Technician;
    try {
      technician = await this.prisma.technician.create({
        data: {
          fullName,
          loginUsername,
          notes,
          createdByUserId: userId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('login_username already registered');
      }
      throw error;
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'technician.create',
        targetType: 'technician',
        targetId: technician.id,
        ipAddress,
        metadataJson: {
          login_username: loginUsername,
        },
      },
    });

    return {
      id: technician.id,
      full_name: technician.fullName,
      login_username: technician.loginUsername,
      status: technician.status,
    };
  }

  async provisionNodeAccount(
    nodeId: string,
    userId: string,
    dto: ProvisionTechnicianAccountDto,
    ipAddress?: string,
  ) {
    this.assertCreateEnabled();

    const technician = await this.prisma.technician.findUnique({
      where: { id: dto.technician_id },
    });
    if (!technician) {
      throw new NotFoundException('technician not found');
    }

    const pfsenseUsername = requireManagedPfsenseUsername(technician.loginUsername);

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        hostname: true,
        agentVersion: true,
        lastSeenAt: true,
        localUsersSnapshotJson: true,
      },
    });
    if (!node) {
      throw new NotFoundException('node not found');
    }

    const password = resolveTechnicianPassword(dto.password);
    const privilegeProfile = validatePrivilegeProfile(dto.privilege_profile);

    const latestBackupAt = (await this.fetchLatestBackupAtByNode([nodeId])).get(nodeId) ?? null;
    this.assertProvisionAllowed(node, pfsenseUsername, latestBackupAt);

    const account = await this.prisma.technicianNodeAccount.upsert({
      where: {
        technicianId_nodeId: {
          technicianId: technician.id,
          nodeId,
        },
      },
      create: {
        technicianId: technician.id,
        nodeId,
        pfsenseUsername,
        privilegeProfile,
        status: TechnicianNodeAccountStatus.pending_create,
      },
      update: {
        pfsenseUsername,
        privilegeProfile,
        status: TechnicianNodeAccountStatus.pending_create,
        lastError: null,
      },
    });

    const command = await this.orchestrator.enqueueCommand({
      nodeId,
      type: NodeCommandType.local_user_create,
      requestedByUserId: userId,
      payloadJson: {
        technician_id: technician.id,
        account_id: account.id,
        pfsense_username: pfsenseUsername,
        full_name: technician.fullName,
        privilege_profile: privilegeProfile,
        password,
      },
    });

    await this.prisma.technicianNodeAccount.update({
      where: { id: account.id },
      data: { lastCommandId: command.id },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'technician.provision',
        targetType: 'technician_node_account',
        targetId: account.id,
        ipAddress,
        metadataJson: {
          command_id: command.id,
          node_id: nodeId,
          hostname: node.hostname,
          pfsense_username: pfsenseUsername,
          technician_id: technician.id,
        },
      },
    });

    return {
      command_id: command.id,
      status: command.status,
      expires_at: command.expiresAt.toISOString(),
      account_id: account.id,
      password_display_once: password,
    };
  }

  async resetNodeAccountPassword(
    nodeId: string,
    accountId: string,
    userId: string,
    dto: PasswordResetTechnicianAccountDto,
    ipAddress?: string,
  ) {
    this.assertPasswordResetEnabled();

    const account = await this.prisma.technicianNodeAccount.findFirst({
      where: { id: accountId, nodeId },
      include: {
        node: {
          select: {
            id: true,
            hostname: true,
            agentVersion: true,
            lastSeenAt: true,
            localUsersSnapshotJson: true,
          },
        },
        technician: true,
      },
    });

    if (!account) {
      throw new NotFoundException('technician node account not found');
    }

    const pfsenseUsername = requireManagedPfsenseUsername(account.pfsenseUsername);
    const password = resolveTechnicianPassword(dto.password);
    const latestBackupAt =
      (await this.fetchLatestBackupAtByNode([nodeId])).get(nodeId) ?? null;
    this.assertPasswordResetAllowed(account.node, pfsenseUsername, latestBackupAt);

    const command = await this.orchestrator.enqueueCommand({
      nodeId,
      type: NodeCommandType.local_user_set_password,
      requestedByUserId: userId,
      payloadJson: {
        technician_id: account.technicianId,
        account_id: account.id,
        pfsense_username: pfsenseUsername,
        password,
      },
    });

    await this.prisma.technicianNodeAccount.update({
      where: { id: account.id },
      data: {
        lastCommandId: command.id,
        status: TechnicianNodeAccountStatus.password_reset_pending,
        lastError: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'technician.password_reset',
        targetType: 'technician_node_account',
        targetId: account.id,
        ipAddress,
        metadataJson: {
          command_id: command.id,
          node_id: nodeId,
          hostname: account.node.hostname,
          pfsense_username: pfsenseUsername,
          technician_id: account.technicianId,
        },
      },
    });

    return {
      command_id: command.id,
      status: command.status,
      expires_at: command.expiresAt.toISOString(),
      password_display_once: password,
    };
  }

  async createBatchProvision(
    userId: string,
    dto: BatchProvisionTechnicianDto,
    ipAddress?: string,
  ) {
    this.assertCreateEnabled();

    const technician = await this.prisma.technician.findUnique({
      where: { id: dto.technician_id },
    });
    if (!technician) {
      throw new NotFoundException('technician not found');
    }

    requireManagedPfsenseUsername(technician.loginUsername);

    const uniqueNodeIds = [
      ...new Set(dto.node_ids.map((id) => id.trim()).filter((id) => id.length > 0)),
    ];

    if (uniqueNodeIds.length === 0) {
      throw new ConflictException('node_ids must not be empty');
    }

    if (uniqueNodeIds.length > appConfig.technicianAccounts.batchMaxSize) {
      throw new ConflictException(
        `batch exceeds maximum size (${appConfig.technicianAccounts.batchMaxSize})`,
      );
    }

    const password = resolveTechnicianPassword(dto.password);
    const privilegeProfile = validatePrivilegeProfile(dto.privilege_profile);
    const backupBeforeProvision = dto.backup_before_provision !== false;

    const {
      skipped,
      createNodeIds,
      resetNodeIds,
      createPayloadByNode,
      resetPayloadByNode,
      backupQueue,
      nodeById,
    } = await this.planBatchProvision(
      technician,
      uniqueNodeIds,
      password,
      privilegeProfile,
      userId,
      { backupBeforeProvision },
    );

    const upsertAccountOnEnqueued = async (
      nodeId: string,
      commandId: string | null,
      meta: Record<string, unknown> | undefined,
      status: TechnicianNodeAccountStatus,
    ) => {
      if (!meta?.ok) {
        return;
      }

      await this.prisma.technicianNodeAccount.upsert({
        where: {
          technicianId_nodeId: {
            technicianId: technician.id,
            nodeId,
          },
        },
        create: {
          technicianId: technician.id,
          nodeId,
          pfsenseUsername: technician.loginUsername,
          privilegeProfile,
          status,
          lastCommandId: String(meta.command_id ?? commandId),
        },
        update: {
          pfsenseUsername: technician.loginUsername,
          privilegeProfile,
          status,
          lastCommandId: String(meta.command_id ?? commandId),
          lastError: null,
        },
      });
    };

    const createBatch =
      createNodeIds.length > 0
        ? await this.enqueueBatchTechnicianCommand({
            userId,
            technician,
            commandType: NodeCommandType.local_user_create,
            eligibleNodeIds: createNodeIds,
            payloadByNode: createPayloadByNode,
            nodeById,
            label: dto.label ?? `technician provision batch`,
            clientId: dto.client_id,
            ipAddress,
            auditTotalNodes: uniqueNodeIds.length,
            auditAction: 'technician.batch_provision',
            onEnqueued: async (nodeId, commandId, meta) => {
              await upsertAccountOnEnqueued(
                nodeId,
                commandId,
                meta,
                TechnicianNodeAccountStatus.pending_create,
              );
            },
          })
        : { batch: null, enqueueResults: [] as BatchTechnicianResultItem[] };

    const resetBatch =
      resetNodeIds.length > 0
        ? await this.enqueueBatchTechnicianCommand({
            userId,
            technician,
            commandType: NodeCommandType.local_user_set_password,
            eligibleNodeIds: resetNodeIds,
            payloadByNode: resetPayloadByNode,
            nodeById,
            label: dto.label ?? `technician provision password sync batch`,
            clientId: dto.client_id,
            ipAddress,
            auditTotalNodes: uniqueNodeIds.length,
            auditAction: 'technician.batch_provision_password_sync',
            onEnqueued: async (nodeId, commandId, meta) => {
              await upsertAccountOnEnqueued(
                nodeId,
                commandId,
                meta,
                TechnicianNodeAccountStatus.password_reset_pending,
              );
            },
          })
        : { batch: null, enqueueResults: [] as BatchTechnicianResultItem[] };

    const backupResults: BatchTechnicianResultItem[] = [];
    if (backupQueue.length > 0) {
      for (const item of backupQueue) {
        try {
          const backupCommand = await this.orchestrator.enqueueCommand({
            nodeId: item.node_id,
            type: NodeCommandType.config_backup_now,
            requestedByUserId: userId,
            payloadJson: buildFollowUpTechnicianProvisionPayload(
              item.follow_up,
            ) as Prisma.InputJsonValue,
          });

          await this.prisma.technicianNodeAccount.update({
            where: { id: item.follow_up.account_id },
            data: {
              lastCommandId: backupCommand.id,
              lastError: null,
            },
          });

          backupResults.push({
            node_id: item.node_id,
            hostname: nodeById.get(item.node_id)?.hostname ?? null,
            outcome: 'backup_queued',
            reason: 'backup queued before provision',
            command_id: backupCommand.id,
            status: backupCommand.status,
          });
        } catch (error) {
          backupResults.push({
            node_id: item.node_id,
            hostname: nodeById.get(item.node_id)?.hostname ?? null,
            outcome: 'failed',
            reason: error instanceof Error ? error.message : 'backup enqueue failed',
            command_id: null,
            status: null,
          });
        }
      }
    }

    const results = [
      ...skipped,
      ...backupResults,
      ...createBatch.enqueueResults,
      ...resetBatch.enqueueResults,
    ];

    return {
      generated_at: new Date().toISOString(),
      batch: createBatch.batch?.batch ?? resetBatch.batch?.batch ?? null,
      batches:
        createBatch.batch?.batch && resetBatch.batch?.batch
          ? [createBatch.batch.batch, resetBatch.batch.batch]
          : undefined,
      technician: {
        id: technician.id,
        login_username: technician.loginUsername,
        full_name: technician.fullName,
      },
      results,
      password_display_once: password,
      summary: {
        total: uniqueNodeIds.length,
        enqueued: results.filter((item) => item.outcome === 'enqueued').length,
        backup_queued: results.filter((item) => item.outcome === 'backup_queued').length,
        skipped: results.filter((item) => item.outcome === 'skipped').length,
        failed: results.filter((item) => item.outcome === 'failed').length,
      },
    };
  }

  async createBatchPasswordReset(
    userId: string,
    dto: BatchPasswordResetTechnicianDto,
    ipAddress?: string,
  ) {
    this.assertPasswordResetEnabled();

    const technician = await this.prisma.technician.findUnique({
      where: { id: dto.technician_id },
    });
    if (!technician) {
      throw new NotFoundException('technician not found');
    }

    requireManagedPfsenseUsername(technician.loginUsername);

    const uniqueNodeIds = [
      ...new Set(dto.node_ids.map((id) => id.trim()).filter((id) => id.length > 0)),
    ];

    if (uniqueNodeIds.length === 0) {
      throw new ConflictException('node_ids must not be empty');
    }

    if (uniqueNodeIds.length > appConfig.technicianAccounts.batchMaxSize) {
      throw new ConflictException(
        `batch exceeds maximum size (${appConfig.technicianAccounts.batchMaxSize})`,
      );
    }

    const password = resolveTechnicianPassword(dto.password);

    const { skipped, eligibleNodeIds, payloadByNode, nodeById } =
      await this.planBatchPasswordReset(technician, uniqueNodeIds, password);

    const { batch, enqueueResults } = await this.enqueueBatchTechnicianCommand({
      userId,
      technician,
      commandType: NodeCommandType.local_user_set_password,
      eligibleNodeIds,
      payloadByNode,
      nodeById,
      label: dto.label ?? `technician password reset batch`,
      clientId: dto.client_id,
      ipAddress,
      auditTotalNodes: uniqueNodeIds.length,
      auditAction: 'technician.batch_password_reset',
      onEnqueued: async (nodeId, _commandId, meta) => {
        if (!meta?.ok) {
          return;
        }

        const account = await this.prisma.technicianNodeAccount.findUnique({
          where: {
            technicianId_nodeId: {
              technicianId: technician.id,
              nodeId,
            },
          },
        });

        if (account) {
          await this.prisma.technicianNodeAccount.update({
            where: { id: account.id },
            data: {
              lastCommandId: String(meta.command_id ?? ''),
              status: TechnicianNodeAccountStatus.password_reset_pending,
              lastError: null,
            },
          });
        }
      },
    });

    const results = [...skipped, ...enqueueResults];

    return {
      generated_at: new Date().toISOString(),
      batch: batch?.batch ?? null,
      technician: {
        id: technician.id,
        login_username: technician.loginUsername,
        full_name: technician.fullName,
      },
      results,
      password_display_once: password,
      summary: {
        total: uniqueNodeIds.length,
        enqueued: results.filter((item) => item.outcome === 'enqueued').length,
        skipped: results.filter((item) => item.outcome === 'skipped').length,
        failed: results.filter((item) => item.outcome === 'failed').length,
      },
    };
  }

  private async planBatchProvision(
    technician: Technician,
    uniqueNodeIds: string[],
    password: string,
    privilegeProfile: string,
    requestedByUserId: string,
    options: { backupBeforeProvision: boolean },
  ) {
    const pfsenseUsername = requireManagedPfsenseUsername(technician.loginUsername);
    const nodes = await this.prisma.node.findMany({
      where: { id: { in: uniqueNodeIds } },
      select: {
        id: true,
        hostname: true,
        agentVersion: true,
        lastSeenAt: true,
        localUsersSnapshotJson: true,
      },
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const backupByNode = await this.fetchLatestBackupAtByNode(uniqueNodeIds);

    const skipped: BatchTechnicianResultItem[] = [];
    const createNodeIds: string[] = [];
    const resetNodeIds: string[] = [];
    const createPayloadByNode: Record<string, Record<string, unknown>> = {};
    const resetPayloadByNode: Record<string, Record<string, unknown>> = {};
    const backupQueue: Array<{
      node_id: string;
      follow_up: Parameters<typeof buildFollowUpTechnicianProvisionPayload>[0];
    }> = [];

    for (const nodeId of uniqueNodeIds) {
      const node = nodeById.get(nodeId);
      if (!node) {
        skipped.push({
          node_id: nodeId,
          hostname: null,
          outcome: 'skipped',
          reason: 'node not found',
          command_id: null,
          status: null,
        });
        continue;
      }

      const latestBackupAt = backupByNode.get(nodeId) ?? null;
      const needsBackup =
        options.backupBeforeProvision &&
        this.getBackupSkipReason(latestBackupAt) != null;

      const skipReason = this.getNodeEligibilitySkipReason(
        node,
        true,
        latestBackupAt,
        { ignoreBackupGate: needsBackup },
      );
      if (skipReason) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: skipReason,
          command_id: null,
          status: null,
        });
        continue;
      }

      const snapshot = parseLocalUsersSnapshot(node.localUsersSnapshotJson);
      const userExists = userAlreadyActiveInSnapshot(snapshot, pfsenseUsername);

      const account = await this.prisma.technicianNodeAccount.upsert({
        where: {
          technicianId_nodeId: {
            technicianId: technician.id,
            nodeId,
          },
        },
        create: {
          technicianId: technician.id,
          nodeId,
          pfsenseUsername,
          privilegeProfile,
          status: userExists
            ? TechnicianNodeAccountStatus.password_reset_pending
            : TechnicianNodeAccountStatus.pending_create,
        },
        update: {
          pfsenseUsername,
          privilegeProfile,
          lastError: null,
          status: userExists
            ? TechnicianNodeAccountStatus.password_reset_pending
            : TechnicianNodeAccountStatus.pending_create,
        },
      });

      const basePayload = {
        technician_id: technician.id,
        account_id: account.id,
        pfsense_username: pfsenseUsername,
        password,
      };

      if (needsBackup) {
        backupQueue.push({
          node_id: nodeId,
          follow_up: {
            action: userExists ? 'local_user_set_password' : 'local_user_create',
            technician_id: technician.id,
            account_id: account.id,
            pfsense_username: pfsenseUsername,
            password,
            requested_by_user_id: requestedByUserId,
            ...(userExists
              ? {}
              : {
                  full_name: technician.fullName,
                  privilege_profile: privilegeProfile,
                }),
          },
        });
        continue;
      }

      if (userExists) {
        resetNodeIds.push(nodeId);
        resetPayloadByNode[nodeId] = basePayload;
      } else {
        createNodeIds.push(nodeId);
        createPayloadByNode[nodeId] = {
          ...basePayload,
          full_name: technician.fullName,
          privilege_profile: privilegeProfile,
        };
      }
    }

    return {
      skipped,
      createNodeIds,
      resetNodeIds,
      createPayloadByNode,
      resetPayloadByNode,
      backupQueue,
      nodeById,
    };
  }

  private async planBatchPasswordReset(
    technician: Technician,
    uniqueNodeIds: string[],
    password: string,
  ) {
    const pfsenseUsername = requireManagedPfsenseUsername(technician.loginUsername);
    const nodes = await this.prisma.node.findMany({
      where: { id: { in: uniqueNodeIds } },
      select: {
        id: true,
        hostname: true,
        agentVersion: true,
        lastSeenAt: true,
        localUsersSnapshotJson: true,
      },
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const backupByNode = await this.fetchLatestBackupAtByNode(uniqueNodeIds);

    const skipped: BatchTechnicianResultItem[] = [];
    const eligibleNodeIds: string[] = [];
    const payloadByNode: Record<string, Record<string, unknown>> = {};

    for (const nodeId of uniqueNodeIds) {
      const node = nodeById.get(nodeId);
      if (!node) {
        skipped.push({
          node_id: nodeId,
          hostname: null,
          outcome: 'skipped',
          reason: 'node not found',
          command_id: null,
          status: null,
        });
        continue;
      }

      const skipReason = this.getPasswordResetSkipReason(
        node,
        pfsenseUsername,
        backupByNode.get(nodeId) ?? null,
      );
      if (skipReason) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: skipReason,
          command_id: null,
          status: null,
        });
        continue;
      }

      eligibleNodeIds.push(nodeId);

      const account = await this.prisma.technicianNodeAccount.upsert({
        where: {
          technicianId_nodeId: {
            technicianId: technician.id,
            nodeId,
          },
        },
        create: {
          technicianId: technician.id,
          nodeId,
          pfsenseUsername,
          privilegeProfile: 'admin_full',
          status: TechnicianNodeAccountStatus.password_reset_pending,
        },
        update: {
          pfsenseUsername,
          lastError: null,
          status: TechnicianNodeAccountStatus.password_reset_pending,
        },
      });

      payloadByNode[nodeId] = {
        technician_id: technician.id,
        account_id: account.id,
        pfsense_username: pfsenseUsername,
        password,
      };
    }

    return { skipped, eligibleNodeIds, payloadByNode, nodeById };
  }

  private async enqueueBatchTechnicianCommand(input: {
    userId: string;
    technician: Technician;
    commandType: NodeCommandType;
    eligibleNodeIds: string[];
    payloadByNode: Record<string, Record<string, unknown>>;
    nodeById: Map<
      string,
      {
        id: string;
        hostname: string | null;
        agentVersion: string | null;
        lastSeenAt: Date | null;
        localUsersSnapshotJson: Prisma.JsonValue | null;
      }
    >;
    label: string;
    clientId?: string;
    ipAddress?: string;
    auditTotalNodes: number;
    auditAction: string;
    onEnqueued?: (
      nodeId: string,
      commandId: string | null,
      meta: Record<string, unknown> | undefined,
    ) => Promise<void>;
  }) {
    const enqueueResults: BatchTechnicianResultItem[] = [];

    if (input.eligibleNodeIds.length === 0) {
      return { batch: null, enqueueResults };
    }

    const batchStatus = await this.orchestrator.createBatch({
      commandType: input.commandType,
      nodeIds: input.eligibleNodeIds,
      requestedByUserId: input.userId,
      label: input.label,
      clientId: input.clientId,
      ipAddress: input.ipAddress,
      payloadByNode: input.payloadByNode,
      idempotencyPrefix: `${input.commandType}-${input.technician.id}`,
    });

    const batchRecord = await this.prisma.jobBatch.findUnique({
      where: { id: batchStatus.batch.batch_id },
      select: { metadataJson: true },
    });

    const metadataResults = Array.isArray(
      (batchRecord?.metadataJson as { results?: unknown[] } | null)?.results,
    )
      ? ((batchRecord?.metadataJson as { results: Array<Record<string, unknown>> })
          .results ?? [])
      : [];

    for (const nodeId of input.eligibleNodeIds) {
      const node = input.nodeById.get(nodeId)!;
      const meta = metadataResults.find((entry) => entry.node_id === nodeId);

      if (meta?.ok) {
        if (input.onEnqueued) {
          await input.onEnqueued(nodeId, (meta.command_id as string | undefined) ?? null, meta);
        }

        enqueueResults.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'enqueued',
          reason: null,
          command_id: (meta.command_id as string | undefined) ?? null,
          status: (meta.status as string | undefined) ?? null,
        });
      } else {
        enqueueResults.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'failed',
          reason: (meta?.error as string | undefined) ?? 'enqueue failed',
          command_id: null,
          status: null,
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: input.userId,
        action: input.auditAction,
        targetType: 'job_batch',
        targetId: batchStatus.batch.batch_id,
        ipAddress: input.ipAddress,
        metadataJson: {
          technician_id: input.technician.id,
          login_username: input.technician.loginUsername,
          command_type: input.commandType,
          total_nodes: input.auditTotalNodes,
          enqueued: enqueueResults.filter((item) => item.outcome === 'enqueued').length,
        },
      },
    });

    return { batch: batchStatus, enqueueResults };
  }

  private getNodeEligibilitySkipReason(
    node: {
      agentVersion: string | null;
      lastSeenAt: Date | null;
      localUsersSnapshotJson: Prisma.JsonValue | null;
    },
    requireSnapshot: boolean,
    latestBackupAt: Date | null,
    options?: { ignoreBackupGate?: boolean },
  ): string | null {
    const heartbeatRecent =
      node.lastSeenAt != null && Date.now() - node.lastSeenAt.getTime() < 5 * 60_000;

    if (!heartbeatRecent) {
      return 'node heartbeat is not recent';
    }

    if (
      !isAgentVersionAtLeast(
        node.agentVersion,
        appConfig.technicianAccounts.minAgentVersion,
      )
    ) {
      return `agent version below minimum ${appConfig.technicianAccounts.minAgentVersion}`;
    }

    if (!options?.ignoreBackupGate) {
      const backupSkipReason = this.getBackupSkipReason(latestBackupAt);
      if (backupSkipReason) {
        return backupSkipReason;
      }
    }

    const snapshot = parseLocalUsersSnapshot(node.localUsersSnapshotJson);
    if (requireSnapshot && !snapshot?.length) {
      return 'local users snapshot unavailable';
    }

    return null;
  }

  private getProvisionSkipReason(
    node: {
      agentVersion: string | null;
      lastSeenAt: Date | null;
      localUsersSnapshotJson: Prisma.JsonValue | null;
    },
    pfsenseUsername: string,
    latestBackupAt: Date | null,
  ): string | null {
    const eligibility = this.getNodeEligibilitySkipReason(node, true, latestBackupAt);
    if (eligibility) {
      return eligibility;
    }

    const snapshot = parseLocalUsersSnapshot(node.localUsersSnapshotJson);
    if (userAlreadyActiveInSnapshot(snapshot, pfsenseUsername)) {
      return 'user already exists on firewall';
    }

    return null;
  }

  private getPasswordResetSkipReason(
    node: {
      agentVersion: string | null;
      lastSeenAt: Date | null;
      localUsersSnapshotJson: Prisma.JsonValue | null;
    },
    pfsenseUsername: string,
    latestBackupAt: Date | null,
  ): string | null {
    const eligibility = this.getNodeEligibilitySkipReason(node, true, latestBackupAt);
    if (eligibility) {
      return eligibility;
    }

    const snapshot = parseLocalUsersSnapshot(node.localUsersSnapshotJson);
    if (!userExistsInSnapshot(snapshot, pfsenseUsername)) {
      return 'user not found on firewall';
    }

    return null;
  }

  private assertProvisionAllowed(
    node: {
      agentVersion: string | null;
      lastSeenAt: Date | null;
      localUsersSnapshotJson: Prisma.JsonValue | null;
    },
    pfsenseUsername: string,
    latestBackupAt: Date | null,
  ) {
    const skipReason = this.getProvisionSkipReason(node, pfsenseUsername, latestBackupAt);
    if (skipReason === 'user already exists on firewall') {
      throw new ConflictException(skipReason);
    }
    if (skipReason) {
      throw new ConflictException(skipReason);
    }
  }

  private assertPasswordResetAllowed(
    node: {
      agentVersion: string | null;
      lastSeenAt: Date | null;
      localUsersSnapshotJson: Prisma.JsonValue | null;
    },
    pfsenseUsername: string,
    latestBackupAt: Date | null,
  ) {
    const skipReason = this.getPasswordResetSkipReason(node, pfsenseUsername, latestBackupAt);
    if (skipReason === 'user not found on firewall') {
      throw new NotFoundException(skipReason);
    }
    if (skipReason) {
      throw new ConflictException(skipReason);
    }
  }

  async disableNodeAccount(
    nodeId: string,
    accountId: string,
    userId: string,
    ipAddress?: string,
  ) {
    this.assertDisableEnabled();
    return this.revokeOnNode({
      nodeId,
      accountId,
      userId,
      ipAddress,
      action: 'disable',
    });
  }

  async deleteNodeAccount(
    nodeId: string,
    accountId: string,
    userId: string,
    dto: DeleteTechnicianAccountDto,
    ipAddress?: string,
  ) {
    this.assertDeleteEnabled();

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, hostname: true },
    });
    if (!node) {
      throw new NotFoundException('node not found');
    }

    if (dto.confirm_hostname.trim() !== node.hostname) {
      throw new ConflictException('confirm_hostname does not match node hostname');
    }

    return this.revokeOnNode({
      nodeId,
      accountId,
      userId,
      ipAddress,
      action: 'delete',
    });
  }

  private async revokeOnNode(input: {
    nodeId: string;
    accountId: string;
    userId: string;
    ipAddress?: string;
    action: 'disable' | 'delete';
  }) {
    const account = await this.prisma.technicianNodeAccount.findFirst({
      where: {
        id: input.accountId,
        nodeId: input.nodeId,
      },
      include: {
        node: {
          select: {
            id: true,
            hostname: true,
            agentVersion: true,
            lastSeenAt: true,
            localUsersSnapshotJson: true,
          },
        },
        technician: true,
      },
    });

    if (!account) {
      throw new NotFoundException('technician node account not found');
    }

    const pfsenseUsername = requireManagedPfsenseUsername(account.pfsenseUsername);
    const snapshot = parseLocalUsersSnapshot(account.node.localUsersSnapshotJson);
    const latestBackupAt =
      (await this.fetchLatestBackupAtByNode([input.nodeId])).get(input.nodeId) ?? null;
    this.assertRevokeAllowed(
      account.node,
      pfsenseUsername,
      snapshot,
      input.action,
      latestBackupAt,
    );

    const commandType =
      input.action === 'delete'
        ? NodeCommandType.local_user_delete
        : NodeCommandType.local_user_disable;

    const command = await this.orchestrator.enqueueCommand({
      nodeId: input.nodeId,
      type: commandType,
      requestedByUserId: input.userId,
      payloadJson: {
        pfsense_username: pfsenseUsername,
        technician_id: account.technicianId,
        account_id: account.id,
      },
    });

    await this.prisma.technicianNodeAccount.update({
      where: { id: account.id },
      data: {
        lastCommandId: command.id,
        status:
          input.action === 'delete'
            ? TechnicianNodeAccountStatus.removed
            : TechnicianNodeAccountStatus.disabled,
        lastError: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: input.userId,
        action:
          input.action === 'delete' ? 'technician.delete' : 'technician.disable',
        targetType: 'technician_node_account',
        targetId: account.id,
        ipAddress: input.ipAddress,
        metadataJson: {
          command_id: command.id,
          node_id: input.nodeId,
          hostname: account.node.hostname,
          pfsense_username: pfsenseUsername,
          technician_id: account.technicianId,
        },
      },
    });

    return {
      command_id: command.id,
      status: command.status,
      expires_at: command.expiresAt.toISOString(),
      action: input.action,
    };
  }

  async createBatchRevoke(
    userId: string,
    dto: BatchRevokeTechnicianDto,
    ipAddress?: string,
  ) {
    if (dto.action === 'delete') {
      this.assertDeleteEnabled();
    } else {
      this.assertDisableEnabled();
    }

    const technician = await this.prisma.technician.findUnique({
      where: { id: dto.technician_id },
    });
    if (!technician) {
      throw new NotFoundException('technician not found');
    }

    requireManagedPfsenseUsername(technician.loginUsername);

    const uniqueNodeIds = [
      ...new Set(dto.node_ids.map((id) => id.trim()).filter((id) => id.length > 0)),
    ];

    if (uniqueNodeIds.length === 0) {
      throw new ConflictException('node_ids must not be empty');
    }

    if (uniqueNodeIds.length > appConfig.technicianAccounts.batchMaxSize) {
      throw new ConflictException(
        `batch exceeds maximum size (${appConfig.technicianAccounts.batchMaxSize})`,
      );
    }

    const { skipped, eligibleNodeIds, payloadByNode, nodeById, accountByNodeId } =
      await this.planBatchRevoke(technician, uniqueNodeIds);

    const { batch, enqueueResults } = await this.enqueueBatchRevoke({
      userId,
      technician,
      action: dto.action,
      eligibleNodeIds,
      payloadByNode,
      nodeById,
      accountByNodeId,
      label: dto.label ?? `technician ${dto.action} batch`,
      clientId: dto.client_id,
      ipAddress,
      auditTotalNodes: uniqueNodeIds.length,
    });

    const results = [...skipped, ...enqueueResults];

    return {
      generated_at: new Date().toISOString(),
      batch: batch?.batch ?? null,
      technician: {
        id: technician.id,
        login_username: technician.loginUsername,
        full_name: technician.fullName,
      },
      action: dto.action,
      results,
      summary: {
        total: uniqueNodeIds.length,
        enqueued: results.filter((item) => item.outcome === 'enqueued').length,
        skipped: results.filter((item) => item.outcome === 'skipped').length,
        failed: results.filter((item) => item.outcome === 'failed').length,
      },
    };
  }

  async createFleetRevoke(
    userId: string,
    technicianId: string,
    dto: FleetRevokeTechnicianDto,
    actor: AccessActor,
    ipAddress?: string,
  ) {
    if (dto.action === 'delete') {
      this.assertDeleteEnabled();
    } else {
      this.assertDisableEnabled();
    }

    const technician = await this.prisma.technician.findUnique({
      where: { id: technicianId },
    });
    if (!technician) {
      throw new NotFoundException('technician not found');
    }

    requireManagedPfsenseUsername(technician.loginUsername);

    await this.accessPolicy.assertRequestedClientFilter(actor, dto.client_id);

    const nodeWhere = await this.accessPolicy.mergeNodeWhere(
      actor,
      dto.client_id
        ? {
            site: {
              clientId: dto.client_id,
            },
          }
        : {},
    );

    const fleetNodes = await this.prisma.node.findMany({
      where: nodeWhere,
      select: { id: true },
      orderBy: { hostname: 'asc' },
    });

    const uniqueNodeIds = fleetNodes.map((node) => node.id);

    if (uniqueNodeIds.length === 0) {
      throw new ConflictException('no nodes in scope for fleet revoke');
    }

    const { skipped, eligibleNodeIds, payloadByNode, nodeById, accountByNodeId } =
      await this.planBatchRevoke(technician, uniqueNodeIds);

    const batchMaxSize = appConfig.technicianAccounts.batchMaxSize;
    const chunks: string[][] = [];
    for (let index = 0; index < eligibleNodeIds.length; index += batchMaxSize) {
      chunks.push(eligibleNodeIds.slice(index, index + batchMaxSize));
    }

    const batches: Array<NonNullable<Awaited<ReturnType<typeof this.enqueueBatchRevoke>>['batch']>> =
      [];
    const enqueueResults: BatchRevokeResultItem[] = [];

    for (const [chunkIndex, chunkNodeIds] of chunks.entries()) {
      const chunkPayload = Object.fromEntries(
        chunkNodeIds
          .filter((nodeId) => payloadByNode[nodeId])
          .map((nodeId) => [nodeId, payloadByNode[nodeId]!]),
      );

      const chunkResult = await this.enqueueBatchRevoke({
        userId,
        technician,
        action: dto.action,
        eligibleNodeIds: chunkNodeIds,
        payloadByNode: chunkPayload,
        nodeById,
        accountByNodeId,
        label:
          dto.label ??
          `fleet technician ${dto.action} ${technician.loginUsername} (${chunkIndex + 1}/${chunks.length || 1})`,
        clientId: dto.client_id,
        ipAddress,
        auditTotalNodes: chunkNodeIds.length,
        auditAction: 'technician.fleet_revoke',
      });

      if (chunkResult.batch) {
        batches.push(chunkResult.batch);
      }
      enqueueResults.push(...chunkResult.enqueueResults);
    }

    const results = [...skipped, ...enqueueResults];

    return {
      generated_at: new Date().toISOString(),
      batch: batches[0]?.batch ?? null,
      batches: batches.map((item) => item.batch),
      technician: {
        id: technician.id,
        login_username: technician.loginUsername,
        full_name: technician.fullName,
      },
      action: dto.action,
      results,
      summary: {
        total_scanned: uniqueNodeIds.length,
        total: uniqueNodeIds.length,
        eligible: eligibleNodeIds.length,
        enqueued: results.filter((item) => item.outcome === 'enqueued').length,
        skipped: results.filter((item) => item.outcome === 'skipped').length,
        failed: results.filter((item) => item.outcome === 'failed').length,
        batch_count: batches.length,
      },
    };
  }

  private async planBatchRevoke(technician: Technician, uniqueNodeIds: string[]) {
    const nodes = await this.prisma.node.findMany({
      where: { id: { in: uniqueNodeIds } },
      select: {
        id: true,
        hostname: true,
        agentVersion: true,
        lastSeenAt: true,
        localUsersSnapshotJson: true,
      },
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    const accounts = await this.prisma.technicianNodeAccount.findMany({
      where: {
        technicianId: technician.id,
        nodeId: { in: uniqueNodeIds },
      },
    });
    const accountByNodeId = new Map(accounts.map((account) => [account.nodeId, account]));
    const backupByNode = await this.fetchLatestBackupAtByNode(uniqueNodeIds);

    const skipped: BatchRevokeResultItem[] = [];
    const eligibleNodeIds: string[] = [];
    const payloadByNode: Record<string, Record<string, unknown>> = {};

    for (const nodeId of uniqueNodeIds) {
      const node = nodeById.get(nodeId);
      if (!node) {
        skipped.push({
          node_id: nodeId,
          hostname: null,
          outcome: 'skipped',
          reason: 'node not found',
          command_id: null,
          status: null,
        });
        continue;
      }

      const heartbeatRecent =
        node.lastSeenAt != null &&
        Date.now() - node.lastSeenAt.getTime() < 5 * 60_000;

      if (!heartbeatRecent) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: 'node heartbeat is not recent',
          command_id: null,
          status: null,
        });
        continue;
      }

      const remoteCapable = isAgentVersionAtLeast(
        node.agentVersion,
        appConfig.technicianAccounts.minAgentVersion,
      );

      if (!remoteCapable) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: `agent version below minimum ${appConfig.technicianAccounts.minAgentVersion}`,
          command_id: null,
          status: null,
        });
        continue;
      }

      const backupSkipReason = this.getBackupSkipReason(backupByNode.get(nodeId) ?? null);
      if (backupSkipReason) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: backupSkipReason,
          command_id: null,
          status: null,
        });
        continue;
      }

      const account = accountByNodeId.get(nodeId);
      let pfsenseUsername: string;
      try {
        pfsenseUsername = requireManagedPfsenseUsername(
          account?.pfsenseUsername ?? technician.loginUsername,
        );
      } catch {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: 'reserved username',
          command_id: null,
          status: null,
        });
        continue;
      }
      const snapshot = parseLocalUsersSnapshot(node.localUsersSnapshotJson);

      if (!snapshot?.length) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: 'local users snapshot unavailable',
          command_id: null,
          status: null,
        });
        continue;
      }

      if (!userExistsInSnapshot(snapshot, pfsenseUsername)) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: 'user not found on firewall',
          command_id: null,
          status: null,
        });
        continue;
      }

      if (wouldViolateLastAdminGuardrail(snapshot, pfsenseUsername)) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: 'would remove last active admin account',
          command_id: null,
          status: null,
        });
        continue;
      }

      eligibleNodeIds.push(nodeId);
      payloadByNode[nodeId] = {
        pfsense_username: pfsenseUsername,
        technician_id: technician.id,
        ...(account ? { account_id: account.id } : {}),
      };
    }

    return {
      skipped,
      eligibleNodeIds,
      payloadByNode,
      nodeById,
      accountByNodeId,
    };
  }

  private async enqueueBatchRevoke(input: {
    userId: string;
    technician: Technician;
    action: 'disable' | 'delete';
    eligibleNodeIds: string[];
    payloadByNode: Record<string, Record<string, unknown>>;
    nodeById: Map<
      string,
      {
        id: string;
        hostname: string | null;
        agentVersion: string | null;
        lastSeenAt: Date | null;
        localUsersSnapshotJson: Prisma.JsonValue | null;
      }
    >;
    accountByNodeId: Map<string, { id: string; nodeId: string; technicianId: string }>;
    label: string;
    clientId?: string;
    ipAddress?: string;
    auditTotalNodes: number;
    auditAction?: string;
  }) {
    const commandType =
      input.action === 'delete'
        ? NodeCommandType.local_user_delete
        : NodeCommandType.local_user_disable;

    let batchStatus: Awaited<
      ReturnType<CommandOrchestratorService['getBatchStatus']>
    > | null = null;
    const enqueueResults: BatchRevokeResultItem[] = [];

    if (input.eligibleNodeIds.length === 0) {
      return { batch: null, enqueueResults };
    }

    batchStatus = await this.orchestrator.createBatch({
      commandType,
      nodeIds: input.eligibleNodeIds,
      requestedByUserId: input.userId,
      label: input.label,
      clientId: input.clientId,
      ipAddress: input.ipAddress,
      payloadByNode: input.payloadByNode,
      idempotencyPrefix: `technician-${input.action}-${input.technician.id}`,
    });

    const batchRecord = await this.prisma.jobBatch.findUnique({
      where: { id: batchStatus.batch.batch_id },
      select: { metadataJson: true },
    });

    const metadataResults = Array.isArray(
      (batchRecord?.metadataJson as { results?: unknown[] } | null)?.results,
    )
      ? ((batchRecord?.metadataJson as { results: Array<Record<string, unknown>> })
          .results ?? [])
      : [];

    for (const nodeId of input.eligibleNodeIds) {
      const node = input.nodeById.get(nodeId)!;
      const meta = metadataResults.find((entry) => entry.node_id === nodeId);
      const account = input.accountByNodeId.get(nodeId);

      if (meta?.ok) {
        if (account) {
          await this.prisma.technicianNodeAccount.update({
            where: { id: account.id },
            data: {
              lastCommandId: String(meta.command_id ?? ''),
              status:
                input.action === 'delete'
                  ? TechnicianNodeAccountStatus.removed
                  : TechnicianNodeAccountStatus.disabled,
              lastError: null,
            },
          });
        }

        enqueueResults.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'enqueued',
          reason: null,
          command_id: (meta.command_id as string | undefined) ?? null,
          status: (meta.status as string | undefined) ?? null,
        });
      } else {
        enqueueResults.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'failed',
          reason: (meta?.error as string | undefined) ?? 'enqueue failed',
          command_id: null,
          status: null,
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: input.userId,
        action: input.auditAction ?? 'technician.batch_revoke',
        targetType: 'job_batch',
        targetId: batchStatus.batch.batch_id,
        ipAddress: input.ipAddress,
        metadataJson: {
          technician_id: input.technician.id,
          login_username: input.technician.loginUsername,
          action: input.action,
          total_nodes: input.auditTotalNodes,
          enqueued: enqueueResults.filter((item) => item.outcome === 'enqueued').length,
        },
      },
    });

    return { batch: batchStatus, enqueueResults };
  }

  private assertRevokeAllowed(
    node: {
      agentVersion: string | null;
      lastSeenAt: Date | null;
      localUsersSnapshotJson: Prisma.JsonValue | null;
    },
    pfsenseUsername: string,
    snapshot: LocalUserSnapshotEntry[] | null,
    action: 'disable' | 'delete',
    latestBackupAt: Date | null,
  ) {
    const heartbeatRecent =
      node.lastSeenAt != null && Date.now() - node.lastSeenAt.getTime() < 5 * 60_000;

    if (!heartbeatRecent) {
      throw new ConflictException('node heartbeat is not recent');
    }

    if (
      !isAgentVersionAtLeast(
        node.agentVersion,
        appConfig.technicianAccounts.minAgentVersion,
      )
    ) {
      throw new ConflictException(
        `agent version below minimum ${appConfig.technicianAccounts.minAgentVersion}`,
      );
    }

    const backupSkipReason = this.getBackupSkipReason(latestBackupAt);
    if (backupSkipReason) {
      throw new ConflictException(backupSkipReason);
    }

    if (!snapshot?.length) {
      throw new ConflictException('local users snapshot unavailable');
    }

    if (!userExistsInSnapshot(snapshot, pfsenseUsername)) {
      throw new NotFoundException('user not found on firewall');
    }

    if (wouldViolateLastAdminGuardrail(snapshot, pfsenseUsername)) {
      throw new ForbiddenException('would remove last active admin account');
    }

    if (action === 'delete' && !appConfig.technicianAccounts.deleteEnabled) {
      throw new ServiceUnavailableException('technician account delete is disabled');
    }

    if (action === 'disable' && !appConfig.technicianAccounts.disableEnabled) {
      throw new ServiceUnavailableException('technician account disable is disabled');
    }
  }
}
