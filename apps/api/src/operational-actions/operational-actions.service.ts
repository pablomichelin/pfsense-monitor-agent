import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NodeCommandStatus, NodeCommandType } from '@prisma/client';
import { isAgentVersionAtLeast } from '../common/agent-version';
import { CommandOrchestratorService } from '../commands/command-orchestrator.service';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBackupBatchDto,
  NodeRebootRequestDto,
  ServiceRestartRequestDto,
} from './dto/operational-actions.dto';
import {
  SERVICE_RESTART_ALLOWLIST,
  confirmationMatchesHostname,
  evaluateHaRebootGate,
  evaluateRebootMaintenanceGate,
  validateNodeRebootPayload,
  validateServiceRestartPayload,
} from './operational-actions.util';

const ACTIVE_STATUSES: NodeCommandStatus[] = [
  NodeCommandStatus.pending,
  NodeCommandStatus.picked_up,
  NodeCommandStatus.running,
];

@Injectable()
export class OperationalActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: CommandOrchestratorService,
  ) {}

  private assertOperationalActionsEnabled(): void {
    if (!appConfig.operationalActions.enabled) {
      throw new ServiceUnavailableException('operational actions are disabled');
    }
  }

  private assertServiceRestartEnabled(): void {
    this.assertOperationalActionsEnabled();
    if (!appConfig.operationalActions.serviceRestartEnabled) {
      throw new ServiceUnavailableException('service restart is disabled');
    }
  }

  private assertNodeRebootEnabled(): void {
    this.assertOperationalActionsEnabled();
    if (!appConfig.operationalActions.nodeRebootEnabled) {
      throw new ServiceUnavailableException('node reboot is disabled');
    }
  }

  private async assertNodeReady(nodeId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        hostname: true,
        agentVersion: true,
        lastSeenAt: true,
        maintenanceMode: true,
        haRole: true,
        haDetectedFromAgent: true,
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

    if (
      !isAgentVersionAtLeast(
        node.agentVersion,
        appConfig.operationalActions.minAgentVersion,
      )
    ) {
      throw new ConflictException(
        `agent version below minimum ${appConfig.operationalActions.minAgentVersion}`,
      );
    }

    return node;
  }

  async getStatus(nodeId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        hostname: true,
        agentVersion: true,
        maintenanceMode: true,
        haRole: true,
        haDetectedFromAgent: true,
        lastSeenAt: true,
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    const agentSupported = isAgentVersionAtLeast(
      node.agentVersion,
      appConfig.operationalActions.minAgentVersion,
    );

    const activeServiceRestart = await this.prisma.nodeCommand.findFirst({
      where: {
        nodeId,
        type: NodeCommandType.service_restart,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { requestedAt: 'desc' },
    });

    const activeReboot = await this.prisma.nodeCommand.findFirst({
      where: {
        nodeId,
        type: NodeCommandType.node_reboot,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return {
      enabled: appConfig.operationalActions.enabled,
      service_restart_enabled: appConfig.operationalActions.serviceRestartEnabled,
      node_reboot_enabled: appConfig.operationalActions.nodeRebootEnabled,
      min_agent_version: appConfig.operationalActions.minAgentVersion,
      agent_version: node.agentVersion,
      agent_version_supported: agentSupported,
      hostname: node.hostname,
      maintenance_mode: node.maintenanceMode,
      ha_role: node.haRole,
      ha_detected_from_agent: node.haDetectedFromAgent,
      last_seen_at: node.lastSeenAt?.toISOString() ?? null,
      allowed_services: [...SERVICE_RESTART_ALLOWLIST],
      reboot_default_delay_seconds:
        appConfig.operationalActions.rebootDefaultDelaySeconds,
      active_service_restart: activeServiceRestart
        ? {
            command_id: activeServiceRestart.id,
            status: activeServiceRestart.status,
            payload_json: activeServiceRestart.payloadJson,
          }
        : null,
      active_reboot: activeReboot
        ? {
            command_id: activeReboot.id,
            status: activeReboot.status,
            payload_json: activeReboot.payloadJson,
          }
        : null,
    };
  }

  async requestServiceRestart(
    nodeId: string,
    userId: string,
    dto: ServiceRestartRequestDto,
    ipAddress?: string,
  ) {
    this.assertServiceRestartEnabled();
    const node = await this.assertNodeReady(nodeId);
    const payload = validateServiceRestartPayload({ service: dto.service });

    const command = await this.orchestrator.enqueueCommand({
      nodeId,
      type: NodeCommandType.service_restart,
      requestedByUserId: userId,
      payloadJson: payload,
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'service.restart.request',
        targetType: 'node',
        targetId: nodeId,
        ipAddress,
        metadataJson: {
          command_id: command.id,
          service: payload.service,
          hostname: node.hostname,
        },
      },
    });

    return {
      command_id: command.id,
      status: command.status,
      expires_at: command.expiresAt.toISOString(),
      service: payload.service,
    };
  }

  async requestNodeReboot(
    nodeId: string,
    userId: string,
    dto: NodeRebootRequestDto,
    ipAddress?: string,
  ) {
    this.assertNodeRebootEnabled();
    const node = await this.assertNodeReady(nodeId);

    if (!confirmationMatchesHostname(node.hostname, dto.confirm_hostname)) {
      throw new BadRequestException(
        'confirm_hostname must match node hostname or CONFIRMAR',
      );
    }

    const payload = validateNodeRebootPayload({
      delay_seconds:
        dto.delay_seconds ?? appConfig.operationalActions.rebootDefaultDelaySeconds,
      enable_maintenance_mode: dto.enable_maintenance_mode ?? true,
      acknowledge_ha_risk: dto.acknowledge_ha_risk ?? false,
    });

    const maintenanceGate = evaluateRebootMaintenanceGate({
      maintenanceMode: node.maintenanceMode,
      enableMaintenanceMode: payload.enable_maintenance_mode,
    });

    if (!maintenanceGate.allowed) {
      throw new ConflictException(
        'node must be in maintenance mode or enable_maintenance_mode must be true',
      );
    }

    const haGate = evaluateHaRebootGate({
      haRole: node.haRole,
      haDetectedFromAgent: node.haDetectedFromAgent ?? undefined,
      acknowledgeHaRisk: payload.acknowledge_ha_risk,
    });

    if (haGate.blocked) {
      throw new ForbiddenException(haGate.reason ?? 'HA reboot blocked');
    }

    if (maintenanceGate.willEnableMaintenance) {
      await this.prisma.node.update({
        where: { id: nodeId },
        data: { maintenanceMode: true },
      });
    }

    const command = await this.orchestrator.enqueueCommand({
      nodeId,
      type: NodeCommandType.node_reboot,
      requestedByUserId: userId,
      payloadJson: {
        delay_seconds: payload.delay_seconds,
        maintenance_mode_before: node.maintenanceMode,
        maintenance_mode_toggled: maintenanceGate.willEnableMaintenance,
        acknowledge_ha_risk: payload.acknowledge_ha_risk,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'node.reboot.request',
        targetType: 'node',
        targetId: nodeId,
        ipAddress,
        metadataJson: {
          command_id: command.id,
          hostname: node.hostname,
          delay_seconds: payload.delay_seconds,
          ha_role: node.haRole,
          acknowledge_ha_risk: payload.acknowledge_ha_risk,
          maintenance_mode_toggled: maintenanceGate.willEnableMaintenance,
        },
      },
    });

    return {
      command_id: command.id,
      status: command.status,
      expires_at: command.expiresAt.toISOString(),
      delay_seconds: payload.delay_seconds,
      maintenance_mode_enabled: maintenanceGate.willEnableMaintenance,
    };
  }

  async createBackupBatch(
    userId: string,
    dto: CreateBackupBatchDto,
    ipAddress?: string,
  ) {
    return this.orchestrator.createBatch({
      commandType: NodeCommandType.config_backup_now,
      nodeIds: dto.node_ids,
      requestedByUserId: userId,
      label: dto.label ?? 'config_backup_now batch',
      clientId: dto.client_id,
      ipAddress,
    });
  }
}
