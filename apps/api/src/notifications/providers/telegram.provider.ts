import { Injectable } from '@nestjs/common';
import {
  NotificationMessage,
  NotificationProvider,
  NotificationSendResult,
} from './notification-provider.interface';

@Injectable()
export class TelegramNotificationProvider implements NotificationProvider {
  async send(
    publicConfig: Record<string, unknown>,
    secrets: Record<string, unknown>,
    message: NotificationMessage,
  ): Promise<NotificationSendResult> {
    const chatId = String(publicConfig.chat_id ?? '').trim();
    const botToken = String(secrets.bot_token ?? '').trim();

    if (!chatId || !botToken) {
      return { ok: false, error: 'chat_id and bot_token are required' };
    }

    const text = `${message.subject}\n\n${message.body}`.slice(0, 4000);

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        return {
          ok: false,
          error: `telegram responded with status ${response.status}`,
        };
      }

      const payload = (await response.json()) as { ok?: boolean; description?: string };
      if (!payload.ok) {
        return {
          ok: false,
          error: payload.description ?? 'telegram send failed',
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'telegram request failed',
      };
    }
  }
}
