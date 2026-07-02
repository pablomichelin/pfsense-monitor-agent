import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigBackupStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { appConfig } from '../config/app-config';
import { BackupsStorageService } from '../backups/backups-storage.service';
import { NodeCapabilitiesService } from '../node-capabilities/node-capabilities.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApplyAliasChangeDto,
  PreviewAliasChangeDto,
} from './dto/pfsense-api.dto';
import { extractPfrestAliases, pfrestFetch } from './pfrest-client';
import {
  buildAliasPreview,
  compareAliases,
  parseAliasesFromConfigXml,
} from './pfsense-aliases.util';

@Injectable()
export class PfsenseApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilitiesService: NodeCapabilitiesService,
    private readonly storage: BackupsStorageService,
    private readonly audit: AuditService,
  ) {}

  getStatus() {
    return {
      enabled: appConfig.pfsenseApi.enabled,
      alias_read_enabled: appConfig.pfsenseApi.aliasReadEnabled,
      alias_apply_enabled: appConfig.pfsenseApi.aliasApplyEnabled,
      require_recent_backup_hours: appConfig.pfsenseApi.requireRecentBackupHours,
    };
  }

  async listAliases(nodeId: string, actorId: string, ipAddress?: string) {
    this.assertAliasReadEnabled();

    const aliases = await this.fetchAliasesFromPfrest(nodeId);

    await this.audit.record({
      actorId,
      action: 'pfsense.alias.list',
      targetType: 'node',
      targetId: nodeId,
      ipAddress,
      metadataJson: {
        count: aliases.length,
      } as Prisma.JsonObject,
    });

    return {
      source: 'pfrest',
      count: aliases.length,
      aliases,
    };
  }

  async compareAliasesWithBackup(
    nodeId: string,
    actorId: string,
    ipAddress?: string,
  ) {
    this.assertAliasReadEnabled();

    const [apiAliases, backupAliases] = await Promise.all([
      this.fetchAliasesFromPfrest(nodeId),
      this.loadLatestBackupAliases(nodeId),
    ]);

    const comparison = compareAliases({
      apiAliases,
      backupAliases,
    });

    const summary = {
      total: comparison.length,
      match: comparison.filter((entry) => entry.status === 'match').length,
      different: comparison.filter((entry) => entry.status === 'different').length,
      only_api: comparison.filter((entry) => entry.status === 'only_api').length,
      only_backup: comparison.filter((entry) => entry.status === 'only_backup')
        .length,
    };

    await this.audit.record({
      actorId,
      action: 'pfsense.alias.compare_backup',
      targetType: 'node',
      targetId: nodeId,
      ipAddress,
      metadataJson: summary as Prisma.JsonObject,
    });

    return {
      summary,
      backup_received_at: backupAliases.length > 0 ? await this.latestBackupReceivedAt(nodeId) : null,
      items: comparison,
    };
  }

  private async fetchAliasesFromPfrest(nodeId: string) {
    const { baseUrl, credential } =
      await this.capabilitiesService.resolveActiveCredential(nodeId);
    const secret = this.capabilitiesService.decryptCredentialSecret(credential);

    const response = await pfrestFetch({
      baseUrl,
      path: '/api/v2/firewall/aliases',
      authMethod: credential.authMethod,
      secret,
      timeoutMs: appConfig.pfsenseVault.testTimeoutMs,
    });

    if (!response.ok) {
      throw new BadRequestException(
        response.error ?? `pfREST aliases failed (${response.status})`,
      );
    }

    return extractPfrestAliases(response.json);
  }

  async previewAliasChange(
    nodeId: string,
    dto: PreviewAliasChangeDto,
    actorId: string,
    ipAddress?: string,
  ) {
    this.assertAliasManageEnabled();

    const preview = buildAliasPreview(dto);

    await this.audit.record({
      actorId,
      action: 'pfsense.alias.preview',
      targetType: 'node',
      targetId: nodeId,
      ipAddress,
      metadataJson: {
        name: dto.name,
        type: dto.type,
      } as Prisma.JsonObject,
    });

    return {
      preview,
      apply_allowed: appConfig.pfsenseApi.aliasApplyEnabled,
    };
  }

  async applyAliasChange(
    nodeId: string,
    dto: ApplyAliasChangeDto,
    actorId: string,
    ipAddress?: string,
  ) {
    this.assertAliasApplyEnabled();

    if (dto.confirm_name.trim() !== dto.name.trim()) {
      throw new BadRequestException('confirm_name must match alias name');
    }

    await this.assertRecentBackup(nodeId);

    const { baseUrl, credential } =
      await this.capabilitiesService.resolveActiveCredential(nodeId);
    const secret = this.capabilitiesService.decryptCredentialSecret(credential);
    const payload = buildAliasPreview(dto);

    const before = await pfrestFetch({
      baseUrl,
      path: `/api/v2/firewall/alias/${encodeURIComponent(dto.name.trim())}`,
      authMethod: credential.authMethod,
      secret,
      timeoutMs: appConfig.pfsenseVault.testTimeoutMs,
    });

    const method = before.ok ? 'PATCH' : 'POST';
    const path =
      method === 'PATCH'
        ? `/api/v2/firewall/alias/${encodeURIComponent(dto.name.trim())}`
        : '/api/v2/firewall/alias';

    const response = await pfrestFetch({
      baseUrl,
      path,
      method,
      authMethod: credential.authMethod,
      secret,
      timeoutMs: appConfig.pfsenseVault.testTimeoutMs,
      body: payload,
    });

    if (!response.ok) {
      await this.audit.record({
        actorId,
        action: 'pfsense.alias.apply_failure',
        targetType: 'node',
        targetId: nodeId,
        result: 'failure',
        ipAddress,
        metadataJson: {
          name: dto.name,
          status: response.status,
          error: response.error,
        } as Prisma.JsonObject,
      });

      throw new BadRequestException(
        response.error ?? `pfREST alias apply failed (${response.status})`,
      );
    }

    await this.audit.record({
      actorId,
      action: 'pfsense.alias.apply_success',
      targetType: 'node',
      targetId: nodeId,
      ipAddress,
      metadataJson: {
        name: dto.name,
        method,
        status: response.status,
      } as Prisma.JsonObject,
    });

    return {
      applied: true,
      method,
      status: response.status,
      message:
        'Alias enviado via pfREST. Valide no pfSense e aplique manualmente se necessário.',
    };
  }

  private async loadLatestBackupAliases(nodeId: string) {
    const backup = await this.prisma.nodeConfigBackup.findFirst({
      where: {
        nodeId,
        status: ConfigBackupStatus.stored,
        storagePath: { not: null },
      },
      orderBy: { receivedAt: 'desc' },
    });

    if (!backup?.storagePath) {
      return [];
    }

    const xmlBytes = await this.storage.decryptFromFile(backup.storagePath);
    return parseAliasesFromConfigXml(xmlBytes.toString('utf8'));
  }

  private async latestBackupReceivedAt(nodeId: string): Promise<string | null> {
    const backup = await this.prisma.nodeConfigBackup.findFirst({
      where: {
        nodeId,
        status: ConfigBackupStatus.stored,
      },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    });

    return backup?.receivedAt.toISOString() ?? null;
  }

  private async assertRecentBackup(nodeId: string): Promise<void> {
    const backup = await this.prisma.nodeConfigBackup.findFirst({
      where: {
        nodeId,
        status: ConfigBackupStatus.stored,
      },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    });

    if (!backup) {
      throw new BadRequestException('Recent stored backup required before apply');
    }

    const maxAgeMs =
      appConfig.pfsenseApi.requireRecentBackupHours * 60 * 60 * 1000;
    if (Date.now() - backup.receivedAt.getTime() > maxAgeMs) {
      throw new BadRequestException(
        `Backup older than ${appConfig.pfsenseApi.requireRecentBackupHours}h — run a fresh backup first`,
      );
    }
  }

  private assertAliasReadEnabled(): void {
    if (!appConfig.pfsenseApi.enabled || !appConfig.pfsenseApi.aliasReadEnabled) {
      throw new ForbiddenException('pfREST alias read is disabled');
    }
  }

  private assertAliasManageEnabled(): void {
    this.assertAliasReadEnabled();
    if (!appConfig.pfsenseApi.enabled) {
      throw new ForbiddenException('pfREST API integration is disabled');
    }
  }

  private assertAliasApplyEnabled(): void {
    this.assertAliasManageEnabled();
    if (!appConfig.pfsenseApi.aliasApplyEnabled) {
      throw new ForbiddenException('pfREST alias apply pilot is disabled');
    }
  }
}
