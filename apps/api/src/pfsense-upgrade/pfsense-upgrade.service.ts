import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  NodeCommandStatus,
  NodeCommandType,
  Prisma,
} from '@prisma/client';
import { isAgentVersionAtLeast } from '../common/agent-version';
import { appConfig } from '../config/app-config';
import { NodeCommandsService } from '../node-commands/node-commands.service';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateBackupGate } from './backup-gate.util';
import {
  isPfsenseForceCheckPending,
  PFSENSE_REPO_REPAIR_COOLDOWN_MS,
  PFSENSE_UPDATE_FORCE_CHECK_COOLDOWN_MS,
  PFSENSE_UPDATE_REFRESH_MIN_AGENT,
  PFSENSE_UPDATE_REPAIR_MIN_AGENT,
} from './pfsense-update-check.util';
import { isMajorBranchBump } from './pfsense-version.util';
import { PfsenseUpgradeRequestDto } from './dto/pfsense-upgrade-request.dto';

const ACTIVE_STATUSES: NodeCommandStatus[] = [
  NodeCommandStatus.pending,
  NodeCommandStatus.picked_up,
  NodeCommandStatus.running,
];

@Injectable()
export class PfsenseUpgradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeCommandsService: NodeCommandsService,
  ) {}

  async getStatus(nodeId: string, canRunUpgrade: boolean) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        hostname: true,
        pfsenseVersion: true,
        agentVersion: true,
        haRole: true,
        haDetectedFromAgent: true,
        lastSeenAt: true,
        maintenanceMode: true,
        pfsenseUpdateAvailable: true,
        pfsenseUpdateTargetVersion: true,
        pfsenseUpdateCheckedAt: true,
        pfsenseUpdateCheckError: true,
        pfsenseUpdateForceCheckAt: true,
        pfsenseUpdateErrorClass: true,
        pfsenseUpdateLogSnippet: true,
        pfsenseRepoRepairRequestedAt: true,
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    const activeCommand = await this.prisma.nodeCommand.findFirst({
      where: {
        nodeId,
        type: NodeCommandType.pfsense_upgrade,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { requestedAt: 'desc' },
    });

    const lastResult = await this.prisma.nodeCommand.findFirst({
      where: {
        nodeId,
        type: NodeCommandType.pfsense_upgrade,
        status: {
          in: [
            NodeCommandStatus.succeeded,
            NodeCommandStatus.failed,
            NodeCommandStatus.expired,
          ],
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    const backupGate = await evaluateBackupGate(
      this.prisma,
      nodeId,
      canRunUpgrade,
    );

    return {
      enabled: appConfig.pfsenseUpgrade.enabled,
      hostname: node.hostname,
      pfsense_version: node.pfsenseVersion,
      agent_version: node.agentVersion,
      agent_version_supported: isAgentVersionAtLeast(
        node.agentVersion,
        appConfig.pfsenseUpgrade.minAgentVersion,
      ),
      min_agent_version: appConfig.pfsenseUpgrade.minAgentVersion,
      ha_blocked:
        Boolean(node.haRole?.trim()) || node.haDetectedFromAgent === true,
      ha_role: node.haRole,
      ha_detected_from_agent: node.haDetectedFromAgent,
      update_available: node.pfsenseUpdateAvailable,
      target_version: node.pfsenseUpdateTargetVersion,
      update_checked_at: node.pfsenseUpdateCheckedAt?.toISOString() ?? null,
      update_check_error: node.pfsenseUpdateCheckError,
      update_error_class: node.pfsenseUpdateErrorClass,
      update_log_snippet: node.pfsenseUpdateLogSnippet,
      refresh_check_supported: isAgentVersionAtLeast(
        node.agentVersion,
        PFSENSE_UPDATE_REFRESH_MIN_AGENT,
      ),
      refresh_check_min_agent_version: PFSENSE_UPDATE_REFRESH_MIN_AGENT,
      repair_supported: isAgentVersionAtLeast(
        node.agentVersion,
        PFSENSE_UPDATE_REPAIR_MIN_AGENT,
      ),
      repair_min_agent_version: PFSENSE_UPDATE_REPAIR_MIN_AGENT,
      force_check_pending: isPfsenseForceCheckPending(
        node.pfsenseUpdateForceCheckAt,
        node.pfsenseUpdateCheckedAt,
      ),
      force_check_requested_at:
        node.pfsenseUpdateForceCheckAt?.toISOString() ?? null,
      repair_pending: isPfsenseForceCheckPending(
        node.pfsenseRepoRepairRequestedAt,
        node.pfsenseUpdateCheckedAt,
      ),
      repair_requested_at:
        node.pfsenseRepoRepairRequestedAt?.toISOString() ?? null,
      last_seen_at: node.lastSeenAt?.toISOString() ?? null,
      maintenance_mode: node.maintenanceMode,
      active_command: activeCommand
        ? {
            command_id: activeCommand.id,
            status: activeCommand.status,
            requested_at: activeCommand.requestedAt.toISOString(),
            picked_up_at: activeCommand.pickedUpAt?.toISOString() ?? null,
            running_at: activeCommand.runningAt?.toISOString() ?? null,
            expires_at: activeCommand.expiresAt.toISOString(),
          }
        : null,
      last_result: lastResult
        ? {
            command_id: lastResult.id,
            status: lastResult.status,
            completed_at: lastResult.completedAt?.toISOString() ?? null,
            result_json: lastResult.resultJson,
            error_message: lastResult.errorMessage,
          }
        : null,
      backup_gate: backupGate,
    };
  }

  async requestRefreshCheck(
    nodeId: string,
    userId: string,
    ipAddress?: string,
  ) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        agentVersion: true,
        pfsenseUpdateForceCheckAt: true,
        pfsenseUpdateCheckedAt: true,
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    if (
      !isAgentVersionAtLeast(
        node.agentVersion,
        PFSENSE_UPDATE_REFRESH_MIN_AGENT,
      )
    ) {
      throw new ConflictException(
        'agent version too old for repo refresh check',
      );
    }

    const pending = isPfsenseForceCheckPending(
      node.pfsenseUpdateForceCheckAt,
      node.pfsenseUpdateCheckedAt,
    );
    if (
      pending &&
      node.pfsenseUpdateForceCheckAt != null &&
      Date.now() - node.pfsenseUpdateForceCheckAt.getTime() <
        PFSENSE_UPDATE_FORCE_CHECK_COOLDOWN_MS
    ) {
      throw new ConflictException('refresh already requested');
    }

    const requestedAt = new Date();
    await this.prisma.node.update({
      where: { id: nodeId },
      data: { pfsenseUpdateForceCheckAt: requestedAt },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'pfsense.upgrade.refresh_check',
        targetType: 'node',
        targetId: nodeId,
        ipAddress,
        metadataJson: {
          requested_at: requestedAt.toISOString(),
          agent_version: node.agentVersion,
        },
      },
    });

    return {
      ok: true,
      pending: true,
      requested_at: requestedAt.toISOString(),
    };
  }

  async requestRepoRepair(
    nodeId: string,
    userId: string,
    ipAddress?: string,
  ) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        agentVersion: true,
        pfsenseRepoRepairRequestedAt: true,
        pfsenseUpdateCheckedAt: true,
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    if (
      !isAgentVersionAtLeast(node.agentVersion, PFSENSE_UPDATE_REPAIR_MIN_AGENT)
    ) {
      throw new ConflictException('agent version too old for repo repair');
    }

    const pending = isPfsenseForceCheckPending(
      node.pfsenseRepoRepairRequestedAt,
      node.pfsenseUpdateCheckedAt,
    );
    if (
      pending &&
      node.pfsenseRepoRepairRequestedAt != null &&
      Date.now() - node.pfsenseRepoRepairRequestedAt.getTime() <
        PFSENSE_REPO_REPAIR_COOLDOWN_MS
    ) {
      throw new ConflictException('repo repair already requested');
    }

    const requestedAt = new Date();
    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        pfsenseRepoRepairRequestedAt: requestedAt,
        pfsenseUpdateForceCheckAt: requestedAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'pfsense.upgrade.repair_repo',
        targetType: 'node',
        targetId: nodeId,
        ipAddress,
        metadataJson: {
          requested_at: requestedAt.toISOString(),
          agent_version: node.agentVersion,
        },
      },
    });

    return {
      ok: true,
      pending: true,
      requested_at: requestedAt.toISOString(),
    };
  }

  async requestUpgrade(
    nodeId: string,
    userId: string,
    dto: PfsenseUpgradeRequestDto,
    ipAddress?: string,
  ) {
    if (!appConfig.pfsenseUpgrade.enabled) {
      throw new ServiceUnavailableException('pfSense upgrade is disabled');
    }

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        hostname: true,
        pfsenseVersion: true,
        agentVersion: true,
        haRole: true,
        haDetectedFromAgent: true,
        lastSeenAt: true,
        maintenanceMode: true,
        pfsenseUpdateAvailable: true,
        pfsenseUpdateTargetVersion: true,
        pfsenseUpdateCheckedAt: true,
        pfsenseUpdateCheckError: true,
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    const heartbeatRecent =
      node.lastSeenAt != null &&
      Date.now() - node.lastSeenAt.getTime() < 5 * 60_000;

    if (!heartbeatRecent) {
      throw new ConflictException('node heartbeat is not recent');
    }

    if (node.pfsenseUpdateAvailable !== true) {
      throw new ConflictException('no pfSense update available');
    }

    const checkedRecent =
      node.pfsenseUpdateCheckedAt != null &&
      Date.now() - node.pfsenseUpdateCheckedAt.getTime() <
        7 * 24 * 60 * 60_000;

    if (!checkedRecent) {
      throw new ConflictException('update check is stale');
    }

    if (Boolean(node.haRole?.trim()) || node.haDetectedFromAgent === true) {
      throw new ForbiddenException('upgrade blocked on HA node');
    }

    if (
      !isAgentVersionAtLeast(
        node.agentVersion,
        appConfig.pfsenseUpgrade.minAgentVersion,
      )
    ) {
      throw new ConflictException('agent version too old');
    }

    if (
      isMajorBranchBump(node.pfsenseVersion, node.pfsenseUpdateTargetVersion)
    ) {
      throw new ConflictException('major branch upgrade not supported remotely');
    }

    const backupGate = await evaluateBackupGate(this.prisma, nodeId, true);

    if (
      backupGate.requires_recent_backup &&
      !backupGate.has_recent_backup &&
      !dto.acknowledge_no_recent_backup
    ) {
      throw new ConflictException({
        code: 'no_recent_backup',
        last_backup_at: backupGate.last_backup_at,
      });
    }

    const enableMaintenance = dto.enable_maintenance_mode ?? true;
    const maintenanceModeBefore = node.maintenanceMode;
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        this.nodeCommandsService.getCommandExpireMinutes(
          NodeCommandType.pfsense_upgrade,
        ) *
          60_000,
    );

    const command = await this.prisma.$transaction(
      async (tx) => {
        const activeCommand = await tx.nodeCommand.findFirst({
          where: {
            nodeId,
            type: NodeCommandType.pfsense_upgrade,
            status: { in: ACTIVE_STATUSES },
          },
        });

        if (activeCommand) {
          throw new ConflictException('upgrade already pending for this node');
        }

        const maxConcurrent = appConfig.pfsenseUpgrade.maxConcurrentGlobal;
        if (maxConcurrent > 0) {
          const globalActive = await tx.nodeCommand.count({
            where: {
              type: NodeCommandType.pfsense_upgrade,
              status: { in: ACTIVE_STATUSES },
            },
          });

          if (globalActive >= maxConcurrent) {
            throw new ConflictException('global upgrade concurrency limit reached');
          }
        }

        if (enableMaintenance && !maintenanceModeBefore) {
          await tx.node.update({
            where: { id: nodeId },
            data: { maintenanceMode: true },
          });
        }

        return tx.nodeCommand.create({
          data: {
            nodeId,
            type: NodeCommandType.pfsense_upgrade,
            status: NodeCommandStatus.pending,
            requestedByUserId: userId,
            expiresAt,
            payloadJson: {
              target_version: node.pfsenseUpdateTargetVersion,
              maintenance_mode_before: maintenanceModeBefore,
              maintenance_mode_toggled:
                enableMaintenance && !maintenanceModeBefore,
              maintenance_restored_at: null,
              backup_acknowledged_without_recent:
                backupGate.requires_recent_backup &&
                !backupGate.has_recent_backup &&
                dto.acknowledge_no_recent_backup === true,
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'pfsense.upgrade.request',
        targetType: 'node',
        targetId: nodeId,
        ipAddress,
        metadataJson: {
          command_id: command.id,
          target_version: node.pfsenseUpdateTargetVersion,
          enable_maintenance_mode: enableMaintenance,
        },
      },
    });

    if (
      backupGate.requires_recent_backup &&
      !backupGate.has_recent_backup &&
      dto.acknowledge_no_recent_backup
    ) {
      await this.prisma.auditLog.create({
        data: {
          actorType: 'user',
          actorId: userId,
          action: 'pfsense.upgrade.request_without_recent_backup',
          targetType: 'node',
          targetId: nodeId,
          ipAddress,
          metadataJson: {
            command_id: command.id,
            last_backup_at: backupGate.last_backup_at,
          },
        },
      });
    }

    return {
      command_id: command.id,
      status: command.status,
      expires_at: command.expiresAt.toISOString(),
      target_version: node.pfsenseUpdateTargetVersion,
    };
  }
}
