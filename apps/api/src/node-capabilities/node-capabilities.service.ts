import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NodeCredentialEventType,
  NodeExternalCredentialStatus,
  NodeExternalCredentialType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { appConfig } from '../config/app-config';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  RotatePfrestCredentialDto,
  UpsertPfrestCredentialDto,
} from './dto/node-capabilities.dto';
import { buildSecretHint } from './capability-sync.util';
import { probePfrestConnection } from './pfrest-probe.util';

@Injectable()
export class NodeCapabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeSecretCrypto: NodeSecretCryptoService,
    private readonly audit: AuditService,
  ) {}

  getStatus() {
    return {
      enabled: appConfig.nodeCapabilities.enabled,
      vault_enabled: appConfig.pfsenseVault.enabled,
      test_timeout_ms: appConfig.pfsenseVault.testTimeoutMs,
    };
  }

  async getNodeCapabilities(nodeId: string) {
    const [capability, activeCredential] = await Promise.all([
      this.prisma.nodeCapability.findUnique({ where: { nodeId } }),
      this.prisma.nodeExternalCredential.findFirst({
        where: {
          nodeId,
          credentialType: NodeExternalCredentialType.pfrest_api,
          status: NodeExternalCredentialStatus.active,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!capability && !activeCredential) {
      return {
        capability: null,
        credential: null,
      };
    }

    return {
      capability: capability
        ? {
            pfrest_enabled: capability.pfrestEnabled,
            pfrest_version: capability.pfrestVersion,
            api_base_url: capability.apiBaseUrl,
            access_mode: capability.accessMode,
            auth_method: capability.authMethod,
            modules:
              (capability.capabilitiesJson as { modules?: string[] } | null)
                ?.modules ?? [],
            last_reported_at: capability.lastReportedAt?.toISOString() ?? null,
            last_probe_at: capability.lastProbeAt?.toISOString() ?? null,
            last_success_at: capability.lastSuccessAt?.toISOString() ?? null,
            last_error: capability.lastError,
            observed_at: capability.observedAt.toISOString(),
          }
        : null,
      credential: activeCredential
        ? {
            id: activeCredential.id,
            auth_method: activeCredential.authMethod,
            secret_hint: activeCredential.secretHint,
            scope_description: activeCredential.scopeDescription,
            last_tested_at: activeCredential.lastTestedAt?.toISOString() ?? null,
            last_test_result: activeCredential.lastTestResult,
            rotated_at: activeCredential.rotatedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async upsertPfrestCredential(
    nodeId: string,
    actorId: string,
    dto: UpsertPfrestCredentialDto,
    ipAddress?: string,
    eventType: NodeCredentialEventType = NodeCredentialEventType.created,
  ) {
    this.assertVaultEnabled();

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, site: { select: { clientId: true } } },
    });
    if (!node) {
      throw new NotFoundException('Node not found');
    }

    const secretHint = buildSecretHint(dto.secret);
    const secretEncrypted = this.nodeSecretCrypto.encrypt(dto.secret.trim());

    const credential = await this.prisma.$transaction(async (tx) => {
      await tx.nodeExternalCredential.updateMany({
        where: {
          nodeId,
          credentialType: NodeExternalCredentialType.pfrest_api,
          status: NodeExternalCredentialStatus.active,
        },
        data: {
          status: NodeExternalCredentialStatus.rotated,
          rotatedAt: new Date(),
        },
      });

      const created = await tx.nodeExternalCredential.create({
        data: {
          nodeId,
          credentialType: NodeExternalCredentialType.pfrest_api,
          authMethod: dto.auth_method,
          secretHint,
          secretEncrypted,
          scopeDescription: dto.scope_description?.trim() || null,
          createdBy: actorId,
        },
      });

      if (dto.api_base_url?.trim()) {
        await tx.nodeCapability.upsert({
          where: { nodeId },
          create: {
            nodeId,
            apiBaseUrl: dto.api_base_url.trim().slice(0, 512),
            observedAt: new Date(),
          },
          update: {
            apiBaseUrl: dto.api_base_url.trim().slice(0, 512),
            observedAt: new Date(),
          },
        });
      }

      await tx.nodeCredentialEvent.create({
        data: {
          nodeId,
          credentialId: created.id,
          eventType,
          actorId,
          result: 'success',
        },
      });

      return created;
    });

    await this.audit.record({
      actorId,
      clientId: node.site.clientId,
      action:
        eventType === NodeCredentialEventType.rotated
          ? 'pfsense.credentials.rotate'
          : 'pfsense.credentials.create',
      targetType: 'node_external_credential',
      targetId: credential.id,
      ipAddress,
      metadataJson: {
        node_id: nodeId,
        auth_method: dto.auth_method,
        secret_hint: secretHint,
      } as Prisma.JsonObject,
    });

    return {
      id: credential.id,
      auth_method: credential.authMethod,
      secret_hint: credential.secretHint,
      scope_description: credential.scopeDescription,
    };
  }

  async rotatePfrestCredential(
    nodeId: string,
    actorId: string,
    dto: RotatePfrestCredentialDto,
    ipAddress?: string,
  ) {
    const result = await this.upsertPfrestCredential(
      nodeId,
      actorId,
      dto,
      ipAddress,
      NodeCredentialEventType.rotated,
    );

    return result;
  }

  async revokePfrestCredential(
    nodeId: string,
    actorId: string,
    ipAddress?: string,
  ) {
    this.assertVaultEnabled();

    const active = await this.prisma.nodeExternalCredential.findFirst({
      where: {
        nodeId,
        credentialType: NodeExternalCredentialType.pfrest_api,
        status: NodeExternalCredentialStatus.active,
      },
    });

    if (!active) {
      throw new NotFoundException('Active pfREST credential not found');
    }

    await this.prisma.$transaction([
      this.prisma.nodeExternalCredential.update({
        where: { id: active.id },
        data: {
          status: NodeExternalCredentialStatus.revoked,
          revokedAt: new Date(),
        },
      }),
      this.prisma.nodeCredentialEvent.create({
        data: {
          nodeId,
          credentialId: active.id,
          eventType: NodeCredentialEventType.revoked,
          actorId,
          result: 'success',
        },
      }),
    ]);

    await this.audit.record({
      actorId,
      action: 'pfsense.credentials.revoke',
      targetType: 'node_external_credential',
      targetId: active.id,
      ipAddress,
      metadataJson: { node_id: nodeId } as Prisma.JsonObject,
    });

    return { revoked: true };
  }

  async testPfrestCredential(
    nodeId: string,
    actorId: string,
    ipAddress?: string,
  ) {
    this.assertVaultEnabled();

    const { baseUrl, credential } = await this.resolveActiveCredential(nodeId);
    if (!baseUrl) {
      throw new BadRequestException('api_base_url not configured for node');
    }

    const secret = this.nodeSecretCrypto.decrypt(credential.secretEncrypted);
    const probe = await probePfrestConnection({
      baseUrl,
      authMethod: credential.authMethod,
      secret,
      timeoutMs: appConfig.pfsenseVault.testTimeoutMs,
    });

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.nodeExternalCredential.update({
        where: { id: credential.id },
        data: {
          lastTestedAt: now,
          lastTestResult: probe.message,
        },
      }),
      this.prisma.nodeCapability.upsert({
        where: { nodeId },
        create: {
          nodeId,
          lastProbeAt: now,
          lastSuccessAt: probe.ok ? now : undefined,
          lastError: probe.ok ? null : probe.message,
          observedAt: now,
        },
        update: {
          lastProbeAt: now,
          lastSuccessAt: probe.ok ? now : undefined,
          lastError: probe.ok ? null : probe.message,
          pfrestVersion: probe.version ?? undefined,
        },
      }),
      this.prisma.nodeCredentialEvent.create({
        data: {
          nodeId,
          credentialId: credential.id,
          eventType: probe.ok
            ? NodeCredentialEventType.test_success
            : NodeCredentialEventType.test_failure,
          actorId,
          result: probe.ok ? 'success' : 'failure',
          metadataJson: {
            status: probe.status,
            latency_ms: probe.latencyMs,
            message: probe.message,
          } as Prisma.JsonObject,
        },
      }),
    ]);

    await this.audit.record({
      actorId,
      action: probe.ok
        ? 'pfsense.credentials.test_success'
        : 'pfsense.credentials.test_failure',
      targetType: 'node_external_credential',
      targetId: credential.id,
      result: probe.ok ? 'success' : 'failure',
      ipAddress,
      metadataJson: {
        node_id: nodeId,
        status: probe.status,
        latency_ms: probe.latencyMs,
      } as Prisma.JsonObject,
    });

    return {
      ok: probe.ok,
      status: probe.status,
      latency_ms: probe.latencyMs,
      message: probe.message,
      version: probe.version ?? null,
    };
  }

  async resolveActiveCredential(nodeId: string) {
    const [capability, credential] = await Promise.all([
      this.prisma.nodeCapability.findUnique({ where: { nodeId } }),
      this.prisma.nodeExternalCredential.findFirst({
        where: {
          nodeId,
          credentialType: NodeExternalCredentialType.pfrest_api,
          status: NodeExternalCredentialStatus.active,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!credential) {
      throw new BadRequestException('pfREST credential not configured');
    }

    const baseUrl = capability?.apiBaseUrl?.trim();
    if (!baseUrl) {
      throw new BadRequestException('api_base_url not configured for node');
    }

    return { baseUrl, capability, credential };
  }

  decryptCredentialSecret(credential: { secretEncrypted: string }): string {
    return this.nodeSecretCrypto.decrypt(credential.secretEncrypted);
  }

  private assertVaultEnabled(): void {
    if (!appConfig.pfsenseVault.enabled) {
      throw new ForbiddenException('PFSENSE vault integration is disabled');
    }
  }
}
