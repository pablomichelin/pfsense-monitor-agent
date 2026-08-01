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
import { CommandOrchestratorService } from '../commands/command-orchestrator.service';
import { NodeCommandsService } from '../node-commands/node-commands.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePackageUpgradeBatchDto } from './dto/package-upgrade-batch.dto';
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

type PackageUpgradeBatchResultItem = {
  node_id: string;
  hostname: string | null;
  outcome: 'skipped' | 'enqueued' | 'failed';
  reason: string | null;
  command_id: string | null;
  status: string | null;
};

@Injectable()
export class PackageUpgradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeCommandsService: NodeCommandsService,
    private readonly packageReleaseService: PackageReleaseService,
    private readonly orchestrator: CommandOrchestratorService,
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

  async createUpgradeBatch(
    userId: string,
    dto: CreatePackageUpgradeBatchDto,
    ipAddress?: string,
  ) {
    if (!appConfig.packageUpgrade.enabled) {
      throw new ServiceUnavailableException('package upgrade is disabled');
    }

    const payload = this.resolvePayload();
    const uniqueNodeIds = [
      ...new Set(dto.node_ids.map((id) => id.trim()).filter((id) => id.length > 0)),
    ];

    if (uniqueNodeIds.length === 0) {
      throw new ConflictException('node_ids must not be empty');
    }

    const nodes = await this.prisma.node.findMany({
      where: { id: { in: uniqueNodeIds } },
      select: {
        id: true,
        hostname: true,
        agentVersion: true,
        lastSeenAt: true,
      },
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    const skipped: PackageUpgradeBatchResultItem[] = [];
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

      if (isAgentAlreadyAtTargetVersion(node.agentVersion, payload.target_version)) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: 'agent already at target version',
          command_id: null,
          status: null,
        });
        continue;
      }

      const remoteCapable = isAgentVersionAtLeast(
        node.agentVersion,
        appConfig.packageUpgrade.minAgentVersion,
      );

      if (!remoteCapable) {
        skipped.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'skipped',
          reason: `agent version below minimum ${appConfig.packageUpgrade.minAgentVersion}`,
          command_id: null,
          status: null,
        });
        continue;
      }

      eligibleNodeIds.push(nodeId);
      payloadByNode[nodeId] = payload;
    }

    let batchStatus: Awaited<
      ReturnType<CommandOrchestratorService['getBatchStatus']>
    > | null = null;
    const enqueueResults: PackageUpgradeBatchResultItem[] = [];

    if (eligibleNodeIds.length > 0) {
      batchStatus = await this.orchestrator.createBatch({
        commandType: NodeCommandType.package_upgrade,
        nodeIds: eligibleNodeIds,
        requestedByUserId: userId,
        label: dto.label ?? 'package_upgrade batch',
        clientId: dto.client_id,
        ipAddress,
        payloadByNode,
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

      const commandByNodeId = new Map(
        batchStatus.nodes.map((entry) => [entry.node_id, entry]),
      );

      for (const nodeId of eligibleNodeIds) {
        const node = nodeById.get(nodeId)!;
        const metadataEntry = metadataResults.find(
          (entry) => entry.node_id === nodeId,
        );
        const commandEntry = commandByNodeId.get(nodeId);

        if (metadataEntry?.ok === false) {
          enqueueResults.push({
            node_id: nodeId,
            hostname: node.hostname,
            outcome: 'failed',
            reason:
              typeof metadataEntry.error === 'string'
                ? metadataEntry.error
                : 'enqueue failed',
            command_id: null,
            status: null,
          });
          continue;
        }

        if (commandEntry) {
          enqueueResults.push({
            node_id: nodeId,
            hostname: node.hostname,
            outcome: 'enqueued',
            reason: null,
            command_id: commandEntry.command_id,
            status: commandEntry.status,
          });
          continue;
        }

        enqueueResults.push({
          node_id: nodeId,
          hostname: node.hostname,
          outcome: 'failed',
          reason: 'enqueue failed',
          command_id: null,
          status: null,
        });
      }
    }

    const results = [...skipped, ...enqueueResults];

    return {
      generated_at: new Date().toISOString(),
      published_version: payload.target_version,
      batch: batchStatus?.batch ?? null,
      results,
      summary: {
        total: uniqueNodeIds.length,
        enqueued: enqueueResults.filter((entry) => entry.outcome === 'enqueued')
          .length,
        skipped: skipped.length,
        failed: enqueueResults.filter((entry) => entry.outcome === 'failed')
          .length,
      },
    };
  }
}
