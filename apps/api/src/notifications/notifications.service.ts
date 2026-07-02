import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertSeverity,
  AlertType,
  NotificationChannelStatus,
  NotificationChannelType,
  NotificationDeliveryStatus,
  Prisma,
} from '@prisma/client';
import { appConfig } from '../config/app-config';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { maskSecretFields } from './notification-config-mask.util';
import {
  buildNotificationIdempotencyKey,
  ruleMatchesAlert,
} from './notification-rule-matcher.util';
import { EmailNotificationProvider } from './providers/email.provider';
import { NotificationMessage } from './providers/notification-provider.interface';
import { TelegramNotificationProvider } from './providers/telegram.provider';
import { WebhookNotificationProvider } from './providers/webhook.provider';
import {
  CreateNotificationChannelDto,
  CreateNotificationRuleDto,
  UpdateNotificationChannelDto,
  UpdateNotificationRuleDto,
} from './dto/notifications.dto';

@Injectable()
export class NotificationsDispatcherService {
  private readonly logger = new Logger(NotificationsDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeSecretCrypto: NodeSecretCryptoService,
    private readonly emailProvider: EmailNotificationProvider,
    private readonly webhookProvider: WebhookNotificationProvider,
    private readonly telegramProvider: TelegramNotificationProvider,
  ) {}

  private getProvider(type: NotificationChannelType) {
    switch (type) {
      case NotificationChannelType.email:
        return this.emailProvider;
      case NotificationChannelType.webhook:
        return this.webhookProvider;
      case NotificationChannelType.telegram:
        return this.telegramProvider;
      default:
        return null;
    }
  }

  dispatchForAlertIds(alertIds: string[]): void {
    if (!appConfig.notifications.enabled || alertIds.length === 0) {
      return;
    }

    for (const alertId of alertIds) {
      void this.dispatchForAlert(alertId).catch((error) => {
        this.logger.warn(
          `notification dispatch failed alert_id=${alertId} error=${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
    }
  }

  async dispatchForAlert(alertId: string): Promise<void> {
    if (!appConfig.notifications.enabled) {
      return;
    }

    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        node: {
          include: {
            site: {
              include: {
                client: true,
              },
            },
          },
        },
      },
    });

    if (!alert || alert.status === 'resolved') {
      return;
    }

    const rules = await this.prisma.notificationRule.findMany({
      where: { enabled: true },
      include: {
        channel: true,
      },
    });

    const clientId = alert.node.site.clientId;
    const matchingRules = rules.filter(
      (rule) =>
        rule.channel.status === NotificationChannelStatus.active &&
        ruleMatchesAlert(rule, {
          severity: alert.severity,
          alertType: alert.type,
          clientId,
        }),
    );

    for (const rule of matchingRules) {
      const idempotencyKey = buildNotificationIdempotencyKey(
        alert.id,
        rule.channelId,
        alert.openedAt,
      );

      const delivery = await this.prisma.notificationDelivery.upsert({
        where: { idempotencyKey },
        create: {
          alertId: alert.id,
          channelId: rule.channelId,
          idempotencyKey,
          status: NotificationDeliveryStatus.pending,
        },
        update: {},
      });

      if (delivery.status === NotificationDeliveryStatus.delivered) {
        continue;
      }

      await this.processDelivery(delivery.id);
    }
  }

  async sendTestMessage(channelId: string): Promise<{ ok: boolean; error?: string }> {
    const channel = await this.prisma.notificationChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException('notification channel not found');
    }

    const message: NotificationMessage = {
      subject: 'Monitor-Pfsense — teste de canal',
      body: 'Mensagem de teste enviada pelo controlador. Nenhum alerta real foi aberto.',
      isTest: true,
    };

    return this.sendThroughChannel(channel, message);
  }

  private async processDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        alert: {
          include: {
            node: {
              include: {
                site: {
                  include: {
                    client: true,
                  },
                },
              },
            },
          },
        },
        channel: true,
      },
    });

    if (!delivery || delivery.status === NotificationDeliveryStatus.delivered) {
      return;
    }

    if (delivery.attemptCount >= appConfig.notifications.maxAttempts) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: NotificationDeliveryStatus.failed,
          lastError: 'max attempts reached',
        },
      });
      return;
    }

    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: NotificationDeliveryStatus.sending,
        attemptCount: { increment: 1 },
      },
    });

    const alert = delivery.alert;
    const message: NotificationMessage = {
      subject: `[${alert.severity}] ${alert.title}`,
      body: [
        `Alerta: ${alert.title}`,
        `Tipo: ${alert.type}`,
        `Severidade: ${alert.severity}`,
        `Firewall: ${alert.node.displayName ?? alert.node.hostname} (${alert.node.nodeUid})`,
        `Cliente: ${alert.node.site.client.name}`,
        `Descrição: ${alert.description}`,
        `Aberto em: ${alert.openedAt.toISOString()}`,
      ].join('\n'),
      alertId: alert.id,
    };

    const result = await this.sendThroughChannel(delivery.channel, message);

    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: result.ok
        ? {
            status: NotificationDeliveryStatus.delivered,
            sentAt: new Date(),
            lastError: null,
          }
        : {
            status: NotificationDeliveryStatus.failed,
            lastError: result.error ?? 'delivery failed',
          },
    });

    if (
      !result.ok &&
      delivery.attemptCount + 1 < appConfig.notifications.maxAttempts
    ) {
      setTimeout(() => {
        void this.processDelivery(delivery.id);
      }, appConfig.notifications.retryDelayMs);
    }
  }

  private async sendThroughChannel(
    channel: {
      type: NotificationChannelType;
      configPublicJson: Prisma.JsonValue;
      secretsEncrypted: string | null;
    },
    message: NotificationMessage,
  ): Promise<{ ok: boolean; error?: string }> {
    const provider = this.getProvider(channel.type);
    if (!provider) {
      return { ok: false, error: `unsupported channel type ${channel.type}` };
    }

    const publicConfig = (channel.configPublicJson ?? {}) as Record<string, unknown>;
    const secrets = this.decryptSecrets(channel.secretsEncrypted);

    return provider.send(publicConfig, secrets, message);
  }

  private decryptSecrets(secretsEncrypted: string | null): Record<string, unknown> {
    if (!secretsEncrypted) {
      return {};
    }

    try {
      const plaintext = this.nodeSecretCrypto.decrypt(secretsEncrypted);
      return JSON.parse(plaintext) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeSecretCrypto: NodeSecretCryptoService,
    private readonly dispatcher: NotificationsDispatcherService,
  ) {}

  getStatus() {
    return {
      generated_at: new Date().toISOString(),
      enabled: appConfig.notifications.enabled,
      max_attempts: appConfig.notifications.maxAttempts,
    };
  }

  async listChannels() {
    const items = await this.prisma.notificationChannel.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    return {
      generated_at: new Date().toISOString(),
      items: items.map((item) => this.serializeChannel(item)),
    };
  }

  async createChannel(
    dto: CreateNotificationChannelDto,
    actor: { userId?: string; email?: string },
    actorIp?: string,
  ) {
    const created = await this.prisma.notificationChannel.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        status: dto.status ?? NotificationChannelStatus.active,
        configPublicJson: dto.config_public as Prisma.InputJsonValue,
        secretsEncrypted: this.encryptSecrets(dto.secrets),
      },
    });

    await this.writeAudit({
      actorId: actor.userId,
      action: 'notifications.channel.create',
      targetId: created.id,
      ipAddress: actorIp,
      metadataJson: {
        type: created.type,
        name: created.name,
      },
    });

    return this.serializeChannel(created);
  }

  async updateChannel(
    channelId: string,
    dto: UpdateNotificationChannelDto,
    actor: { userId?: string; email?: string },
    actorIp?: string,
  ) {
    const existing = await this.prisma.notificationChannel.findUnique({
      where: { id: channelId },
    });

    if (!existing) {
      throw new NotFoundException('notification channel not found');
    }

    const updated = await this.prisma.notificationChannel.update({
      where: { id: channelId },
      data: {
        name: dto.name?.trim(),
        status: dto.status,
        configPublicJson:
          dto.config_public !== undefined
            ? (dto.config_public as Prisma.InputJsonValue)
            : undefined,
        secretsEncrypted:
          dto.secrets !== undefined ? this.encryptSecrets(dto.secrets) : undefined,
      },
    });

    await this.writeAudit({
      actorId: actor.userId,
      action: 'notifications.channel.update',
      targetId: updated.id,
      ipAddress: actorIp,
      metadataJson: {
        type: updated.type,
        name: updated.name,
        status: updated.status,
      },
    });

    return this.serializeChannel(updated);
  }

  async deleteChannel(
    channelId: string,
    actor: { userId?: string; email?: string },
    actorIp?: string,
  ) {
    const existing = await this.prisma.notificationChannel.findUnique({
      where: { id: channelId },
    });

    if (!existing) {
      throw new NotFoundException('notification channel not found');
    }

    await this.prisma.notificationChannel.delete({
      where: { id: channelId },
    });

    await this.writeAudit({
      actorId: actor.userId,
      action: 'notifications.channel.delete',
      targetId: channelId,
      ipAddress: actorIp,
      metadataJson: {
        name: existing.name,
        type: existing.type,
      },
    });

    return { deleted: true, channel_id: channelId };
  }

  async testChannel(
    channelId: string,
    actor: { userId?: string; email?: string },
    actorIp?: string,
  ) {
    const result = await this.dispatcher.sendTestMessage(channelId);

    await this.writeAudit({
      actorId: actor.userId,
      action: 'notifications.channel.test',
      targetId: channelId,
      ipAddress: actorIp,
      result: result.ok ? 'success' : 'failure',
      metadataJson: {
        ok: result.ok,
        error: result.error ?? null,
      },
    });

    return {
      channel_id: channelId,
      ok: result.ok,
      error: result.error ?? null,
    };
  }

  async listRules() {
    const items = await this.prisma.notificationRule.findMany({
      include: {
        channel: true,
        client: true,
      },
      orderBy: [{ enabled: 'desc' }, { name: 'asc' }],
    });

    return {
      generated_at: new Date().toISOString(),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        enabled: item.enabled,
        severity: item.severity,
        alert_type: item.alertType,
        client_id: item.clientId,
        client_name: item.client?.name ?? null,
        channel_id: item.channelId,
        channel_name: item.channel.name,
        channel_type: item.channel.type,
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString(),
      })),
    };
  }

  async createRule(
    dto: CreateNotificationRuleDto,
    actor: { userId?: string; email?: string },
    actorIp?: string,
  ) {
    await this.assertChannelExists(dto.channel_id);
    if (dto.client_id) {
      await this.assertClientExists(dto.client_id);
    }

    const created = await this.prisma.notificationRule.create({
      data: {
        name: dto.name.trim(),
        enabled: dto.enabled ?? true,
        severity: dto.severity,
        alertType: dto.alert_type,
        clientId: dto.client_id,
        channelId: dto.channel_id,
      },
    });

    await this.writeAudit({
      actorId: actor.userId,
      action: 'notifications.rule.create',
      targetId: created.id,
      ipAddress: actorIp,
      metadataJson: {
        name: created.name,
        channel_id: created.channelId,
      },
    });

    return created;
  }

  async updateRule(
    ruleId: string,
    dto: UpdateNotificationRuleDto,
    actor: { userId?: string; email?: string },
    actorIp?: string,
  ) {
    const existing = await this.prisma.notificationRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new NotFoundException('notification rule not found');
    }

    if (dto.channel_id) {
      await this.assertChannelExists(dto.channel_id);
    }

    if (dto.client_id) {
      await this.assertClientExists(dto.client_id);
    }

    const updated = await this.prisma.notificationRule.update({
      where: { id: ruleId },
      data: {
        name: dto.name?.trim(),
        enabled: dto.enabled,
        severity: dto.severity === null ? null : dto.severity,
        alertType: dto.alert_type === null ? null : dto.alert_type,
        clientId: dto.client_id === null ? null : dto.client_id,
        channelId: dto.channel_id,
      },
    });

    await this.writeAudit({
      actorId: actor.userId,
      action: 'notifications.rule.update',
      targetId: updated.id,
      ipAddress: actorIp,
      metadataJson: {
        name: updated.name,
        enabled: updated.enabled,
      },
    });

    return updated;
  }

  async deleteRule(
    ruleId: string,
    actor: { userId?: string; email?: string },
    actorIp?: string,
  ) {
    const existing = await this.prisma.notificationRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new NotFoundException('notification rule not found');
    }

    await this.prisma.notificationRule.delete({
      where: { id: ruleId },
    });

    await this.writeAudit({
      actorId: actor.userId,
      action: 'notifications.rule.delete',
      targetId: ruleId,
      ipAddress: actorIp,
      metadataJson: {
        name: existing.name,
      },
    });

    return { deleted: true, rule_id: ruleId };
  }

  async listDeliveries(alertId?: string) {
    const items = await this.prisma.notificationDelivery.findMany({
      where: alertId ? { alertId } : undefined,
      include: {
        channel: true,
        alert: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      generated_at: new Date().toISOString(),
      items: items.map((item) => ({
        id: item.id,
        alert_id: item.alertId,
        alert_title: item.alert.title,
        channel_id: item.channelId,
        channel_name: item.channel.name,
        channel_type: item.channel.type,
        status: item.status,
        attempt_count: item.attemptCount,
        last_error: item.lastError,
        sent_at: item.sentAt?.toISOString() ?? null,
        created_at: item.createdAt.toISOString(),
      })),
    };
  }

  private serializeChannel(channel: {
    id: string;
    name: string;
    type: NotificationChannelType;
    status: NotificationChannelStatus;
    configPublicJson: Prisma.JsonValue;
    secretsEncrypted: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      status: channel.status,
      config_public: maskSecretFields(
        (channel.configPublicJson ?? {}) as Record<string, unknown>,
      ),
      has_secrets: Boolean(channel.secretsEncrypted),
      created_at: channel.createdAt.toISOString(),
      updated_at: channel.updatedAt.toISOString(),
    };
  }

  private encryptSecrets(secrets?: Record<string, unknown>): string | null {
    if (!secrets || Object.keys(secrets).length === 0) {
      return null;
    }

    return this.nodeSecretCrypto.encrypt(JSON.stringify(secrets));
  }

  private async assertChannelExists(channelId: string): Promise<void> {
    const channel = await this.prisma.notificationChannel.findUnique({
      where: { id: channelId },
      select: { id: true },
    });

    if (!channel) {
      throw new NotFoundException('notification channel not found');
    }
  }

  private async assertClientExists(clientId: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });

    if (!client) {
      throw new NotFoundException('client not found');
    }
  }

  private async writeAudit(input: {
    actorId?: string;
    action: string;
    targetId?: string;
    ipAddress?: string;
    result?: string;
    metadataJson?: Prisma.JsonObject;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: input.actorId ? 'user' : 'system',
        actorId: input.actorId,
        action: input.action,
        targetType: 'notification',
        targetId: input.targetId,
        result: input.result ?? 'success',
        ipAddress: input.ipAddress,
        metadataJson: input.metadataJson,
      },
    });
  }
}

export const NOTIFICATION_ALERT_TYPES = [
  'heartbeat_missing',
  'service_down',
  'gateway_down',
  'version_change',
  'agent_error',
  'node_uid_conflict',
  'clock_skew',
  'auth_failure_repeated',
  'certificate_expiring',
] as const satisfies readonly AlertType[];

export const NOTIFICATION_SEVERITIES = [
  'critical',
  'warning',
  'info',
] as const satisfies readonly AlertSeverity[];
