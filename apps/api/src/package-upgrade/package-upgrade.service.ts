import {
  ConflictException,
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
import { PackageReleaseService } from '../common/package-release.service';
import { appConfig } from '../config/app-config';
import { NodeCommandsService } from '../node-commands/node-commands.service';
import { PrismaService } from '../prisma/prisma.service';
import { PackageUpgradeRequestDto } from './dto/package-upgrade-request.dto';
import {
  isAgentAlreadyAtTargetVersion,
  normalizePackageUpgradePayload,
} from './package-upgrade.util';

const ACTIVE_STATUSES: NodeCommandStatus[] = [
  NodeCommandStatus.pending,
  NodeCommandStatus.picked_up,
  NodeCommandStatus.running,
];

@Injectable()
export class PackageUpgradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeCommandsService: NodeCommandsService,
    private readonly packageReleaseService: PackageReleaseService,
  ) {}

  async getStatus(nodeId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        hostname: true,
        agentVersion: true,
        lastSeenAt: true,
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    const release = this.packageReleaseService.getPackageRelease();

    const activeCommand = await this.prisma.nodeCommand.findFirst({
      where: {
        nodeId,
        type: NodeCommandType.package_upgrade,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { requestedAt: 'desc' },
    });

    const lastResult = await this.prisma.nodeCommand.findFirst({
      where: {
        nodeId,
        type: NodeCommandType.package_upgrade,
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

    const agentVersionSupported = isAgentVersionAtLeast(
      node.agentVersion,
      appConfig.packageUpgrade.minAgentVersion,
    );

    const updateAvailable =
      node.agentVersion != null &&
      !isAgentAlreadyAtTargetVersion(node.agentVersion, release.version);

    return {
      enabled: appConfig.packageUpgrade.enabled,
      hostname: node.hostname,
      agent_version: node.agentVersion,
      agent_version_supported: agentVersionSupported,
      min_agent_version: appConfig.packageUpgrade.minAgentVersion,
      published_version: release.version,
      published_sha256: release.sha256,
      published_artifact_url: release.artifact_url,
      update_available: updateAvailable,
      last_seen_at: node.lastSeenAt?.toISOString() ?? null,
      active_command: activeCommand
        ? {
            command_id: activeCommand.id,
            status: activeCommand.status,
            requested_at: activeCommand.requestedAt.toISOString(),
            picked_up_at: activeCommand.pickedUpAt?.toISOString() ?? null,
            running_at: activeCommand.runningAt?.toISOString() ?? null,
            expires_at: activeCommand.expiresAt.toISOString(),
            payload_json: activeCommand.payloadJson,
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
    };
  }

  resolvePayload(dto?: PackageUpgradeRequestDto) {
    const release = this.packageReleaseService.getPackageRelease();

    return normalizePackageUpgradePayload({
      target_version: dto?.target_version ?? release.version,
      artifact_url: dto?.artifact_url ?? release.artifact_url,
      sha256: dto?.sha256 ?? release.sha256,
    });
  }

  async requestUpgrade(
    nodeId: string,
    userId: string,
    dto: PackageUpgradeRequestDto,
    ipAddress?: string,
  ) {
    if (!appConfig.packageUpgrade.enabled) {
      throw new ServiceUnavailableException('package upgrade is disabled');
    }

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        hostname: true,
        agentVersion: true,
        lastSeenAt: true,
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

    const payload = this.resolvePayload(dto);

    if (
      isAgentAlreadyAtTargetVersion(node.agentVersion, payload.target_version)
    ) {
      throw new ConflictException('agent already at target version');
    }

    const remoteCapable = isAgentVersionAtLeast(
      node.agentVersion,
      appConfig.packageUpgrade.minAgentVersion,
    );

    if (!remoteCapable) {
      throw new ConflictException(
        `agent version too old for remote package upgrade (requires ${appConfig.packageUpgrade.minAgentVersion}+)`,
      );
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        this.nodeCommandsService.getCommandExpireMinutes(
          NodeCommandType.package_upgrade,
        ) *
          60_000,
    );

    const command = await this.prisma.$transaction(
      async (tx) => {
        const activeCommand = await tx.nodeCommand.findFirst({
          where: {
            nodeId,
            type: NodeCommandType.package_upgrade,
            status: { in: ACTIVE_STATUSES },
          },
        });

        if (activeCommand) {
          throw new ConflictException(
            'package upgrade already pending for this node',
          );
        }

        const maxConcurrent = appConfig.packageUpgrade.maxConcurrentGlobal;
        if (maxConcurrent > 0) {
          const globalActive = await tx.nodeCommand.count({
            where: {
              type: NodeCommandType.package_upgrade,
              status: { in: ACTIVE_STATUSES },
            },
          });

          if (globalActive >= maxConcurrent) {
            throw new ConflictException(
              'global package upgrade concurrency limit reached',
            );
          }
        }

        return tx.nodeCommand.create({
          data: {
            nodeId,
            type: NodeCommandType.package_upgrade,
            status: NodeCommandStatus.pending,
            requestedByUserId: userId,
            expiresAt,
            payloadJson: payload as Prisma.InputJsonValue,
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
        action: 'package.upgrade.request',
        targetType: 'node',
        targetId: nodeId,
        ipAddress,
        metadataJson: {
          command_id: command.id,
          target_version: payload.target_version,
          artifact_url: payload.artifact_url,
          sha256_prefix: payload.sha256.slice(0, 12),
        },
      },
    });

    return {
      command_id: command.id,
      status: command.status,
      expires_at: command.expiresAt.toISOString(),
      target_version: payload.target_version,
      artifact_url: payload.artifact_url,
      sha256: payload.sha256,
    };
  }
}
