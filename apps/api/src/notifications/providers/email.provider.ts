import { Injectable } from '@nestjs/common';
import { connect } from 'node:net';
import {
  NotificationMessage,
  NotificationProvider,
  NotificationSendResult,
} from './notification-provider.interface';

@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  async send(
    publicConfig: Record<string, unknown>,
    secrets: Record<string, unknown>,
    message: NotificationMessage,
  ): Promise<NotificationSendResult> {
    const host = String(publicConfig.smtp_host ?? '').trim();
    const port = Number(publicConfig.smtp_port ?? 587);
    const from = String(publicConfig.from ?? '').trim();
    const to = String(publicConfig.to ?? '').trim();

    if (!host || !from || !to) {
      return { ok: false, error: 'smtp_host, from and to are required' };
    }

    const payload = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${message.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      message.body,
      '',
    ].join('\r\n');

    const user = String(secrets.smtp_user ?? '').trim();
    const password = String(secrets.smtp_password ?? '');

    try {
      await this.sendSmtp({
        host,
        port,
        from,
        to,
        payload,
        user: user || undefined,
        password: password || undefined,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'smtp send failed',
      };
    }
  }

  private sendSmtp(input: {
    host: string;
    port: number;
    from: string;
    to: string;
    payload: string;
    user?: string;
    password?: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: input.host, port: input.port });
      const commands: string[] = ['EHLO monitor-pfsense'];

      if (input.user && input.password) {
        commands.push(
          'AUTH LOGIN',
          Buffer.from(input.user).toString('base64'),
          Buffer.from(input.password).toString('base64'),
        );
      }

      commands.push(
        `MAIL FROM:<${input.from}>`,
        `RCPT TO:<${input.to}>`,
        'DATA',
        `${input.payload}\r\n.`,
        'QUIT',
      );

      let index = 0;

      const sendNext = () => {
        const command = commands[index];
        if (!command) {
          socket.end();
          resolve();
          return;
        }

        index += 1;
        socket.write(`${command}\r\n`);
      };

      socket.on('data', (chunk) => {
        const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          const code = Number(line.slice(0, 3));
          if (!Number.isFinite(code) || code >= 400) {
            socket.destroy();
            reject(new Error(`smtp error: ${line}`));
            return;
          }
        }

        sendNext();
      });

      socket.on('error', (error) => {
        reject(error);
      });

      socket.setTimeout(10_000, () => {
        socket.destroy();
        reject(new Error('smtp timeout'));
      });

      socket.on('connect', () => {
        // servidor envia greeting 220 antes do primeiro comando
      });

      // primeiro comando apos greeting inicial
      socket.once('data', () => {
        sendNext();
      });
    });
  }
}
