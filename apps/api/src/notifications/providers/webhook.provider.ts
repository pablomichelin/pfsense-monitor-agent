import { Injectable } from '@nestjs/common';
import {
  NotificationMessage,
  NotificationProvider,
  NotificationSendResult,
} from './notification-provider.interface';

@Injectable()
export class WebhookNotificationProvider implements NotificationProvider {
  async send(
    publicConfig: Record<string, unknown>,
    secrets: Record<string, unknown>,
    message: NotificationMessage,
  ): Promise<NotificationSendResult> {
    const url = String(publicConfig.url ?? '').trim();
    if (!url) {
      return { ok: false, error: 'webhook url is required' };
    }

    const method = String(publicConfig.method ?? 'POST').trim().toUpperCase();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    const authHeader = String(secrets.auth_header ?? '').trim();
    if (authHeader) {
      headers.authorization = authHeader;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          subject: message.subject,
          body: message.body,
          alert_id: message.alertId ?? null,
          test: message.isTest ?? false,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `webhook responded with status ${response.status}`,
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'webhook request failed',
      };
    }
  }
}
