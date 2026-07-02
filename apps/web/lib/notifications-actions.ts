'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  createNotificationChannel,
  createNotificationRule,
  deleteNotificationChannel,
  deleteNotificationRule,
  testNotificationChannel,
  updateNotificationChannel,
  updateNotificationRule,
  type NotificationChannelItem,
  type NotificationChannelType,
  type NotificationRuleItem,
} from '@/lib/api';

export type NotificationActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; status?: number };

function mapError<T = void>(error: unknown, fallback: string): NotificationActionResult<T> {
  if (error instanceof ApiError) {
    return { ok: false, error: error.message, status: error.status };
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

function revalidateNotificationsPage() {
  revalidatePath('/admin/notificacoes');
}

function parseOptionalSecret(value: FormDataEntryValue | null): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function buildChannelPayload(formData: FormData): {
  name: string;
  type: NotificationChannelType;
  status: 'active' | 'inactive';
  config_public: Record<string, unknown>;
  secrets: Record<string, unknown>;
} {
  const type = String(formData.get('type') ?? 'webhook').trim() as NotificationChannelType;
  const config_public: Record<string, unknown> = {};
  const secrets: Record<string, unknown> = {};

  if (type === 'webhook') {
    config_public.url = String(formData.get('url') ?? '').trim();
    config_public.method = String(formData.get('method') ?? 'POST').trim().toUpperCase();
    const authHeader = parseOptionalSecret(formData.get('auth_header'));
    if (authHeader) {
      secrets.auth_header = authHeader;
    }
  }

  if (type === 'email') {
    config_public.smtp_host = String(formData.get('smtp_host') ?? '').trim();
    config_public.smtp_port = Number(formData.get('smtp_port') ?? 587);
    config_public.from = String(formData.get('from') ?? '').trim();
    config_public.to = String(formData.get('to') ?? '').trim();
    const smtpUser = parseOptionalSecret(formData.get('smtp_user'));
    const smtpPassword = parseOptionalSecret(formData.get('smtp_password'));
    if (smtpUser) {
      secrets.smtp_user = smtpUser;
    }
    if (smtpPassword) {
      secrets.smtp_password = smtpPassword;
    }
  }

  if (type === 'telegram') {
    config_public.chat_id = String(formData.get('chat_id') ?? '').trim();
    const botToken = parseOptionalSecret(formData.get('bot_token'));
    if (botToken) {
      secrets.bot_token = botToken;
    }
  }

  return {
    name: String(formData.get('name') ?? '').trim(),
    type,
    status: (String(formData.get('status') ?? 'active').trim() === 'inactive'
      ? 'inactive'
      : 'active') as 'active' | 'inactive',
    config_public,
    secrets,
  };
}

export async function createNotificationChannelAction(
  formData: FormData,
): Promise<NotificationActionResult<NotificationChannelItem>> {
  try {
    const payload = buildChannelPayload(formData);
    const data = await createNotificationChannel({
      ...payload,
      secrets: Object.keys(payload.secrets).length > 0 ? payload.secrets : undefined,
    });
    revalidateNotificationsPage();
    return { ok: true, data };
  } catch (error) {
    return mapError(error, 'Falha ao criar canal');
  }
}

export async function updateNotificationChannelAction(
  channelId: string,
  formData: FormData,
): Promise<NotificationActionResult<NotificationChannelItem>> {
  try {
    const payload = buildChannelPayload(formData);
    const data = await updateNotificationChannel(channelId, {
      name: payload.name,
      status: payload.status,
      config_public: payload.config_public,
      secrets: Object.keys(payload.secrets).length > 0 ? payload.secrets : undefined,
    });
    revalidateNotificationsPage();
    return { ok: true, data };
  } catch (error) {
    return mapError(error, 'Falha ao atualizar canal');
  }
}

export async function deleteNotificationChannelAction(
  channelId: string,
): Promise<NotificationActionResult> {
  try {
    await deleteNotificationChannel(channelId);
    revalidateNotificationsPage();
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao excluir canal');
  }
}

export async function createNotificationRuleAction(
  formData: FormData,
): Promise<NotificationActionResult> {
  try {
    const severity = String(formData.get('severity') ?? '').trim();
    const alertType = String(formData.get('alert_type') ?? '').trim();
    const clientId = String(formData.get('client_id') ?? '').trim();

    await createNotificationRule({
      name: String(formData.get('name') ?? '').trim(),
      enabled: String(formData.get('enabled') ?? 'true') === 'true',
      channel_id: String(formData.get('channel_id') ?? '').trim(),
      severity: severity || undefined,
      alert_type: alertType || undefined,
      client_id: clientId || undefined,
    });
    revalidateNotificationsPage();
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao criar regra');
  }
}

export async function updateNotificationRuleAction(
  ruleId: string,
  formData: FormData,
): Promise<NotificationActionResult> {
  try {
    const severity = String(formData.get('severity') ?? '').trim();
    const alertType = String(formData.get('alert_type') ?? '').trim();
    const clientId = String(formData.get('client_id') ?? '').trim();

    await updateNotificationRule(ruleId, {
      name: String(formData.get('name') ?? '').trim(),
      enabled: String(formData.get('enabled') ?? 'true') === 'true',
      channel_id: String(formData.get('channel_id') ?? '').trim(),
      severity: severity ? severity : null,
      alert_type: alertType ? alertType : null,
      client_id: clientId ? clientId : null,
    });
    revalidateNotificationsPage();
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao atualizar regra');
  }
}

export async function deleteNotificationRuleAction(
  ruleId: string,
): Promise<NotificationActionResult> {
  try {
    await deleteNotificationRule(ruleId);
    revalidateNotificationsPage();
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao excluir regra');
  }
}

export async function testNotificationChannelAction(channelId: string) {
  return testNotificationChannel(channelId);
}
