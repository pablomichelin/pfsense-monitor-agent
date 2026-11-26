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
      message.body.replace(/\r\n|\r|\n/g, '\r\n').replace(/(^|\r\n)\./g, '$1..'),
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
      const commands: Array<{ line: string; replies: number[]; acceptsMessage?: boolean }> = [
        { line: 'EHLO monitor-pfsense', replies: [250] },
      ];

      if (input.user && input.password) {
        commands.push(
          { line: 'AUTH LOGIN', replies: [334] },
          { line: Buffer.from(input.user).toString('base64'), replies: [334] },
          { line: Buffer.from(input.password).toString('base64'), replies: [235] },
        );
      }

      commands.push(
        { line: `MAIL FROM:<${input.from}>`, replies: [250] },
        { line: `RCPT TO:<${input.to}>`, replies: [250, 251] },
        { line: 'DATA', replies: [354] },
        { line: `${input.payload}\r\n.`, replies: [250], acceptsMessage: true },
        { line: 'QUIT', replies: [221] },
      );

      let index = 0;
      let response = '';
      let expectedReplies = [220];
      let messageAccepted = false;

      const handleConnectionFailure = (error: Error) => {
        if (messageAccepted) {
          resolve();
        } else {
          reject(error);
        }
      };

      const sendNext = () => {
        const command = commands[index];
        if (!command) {
          socket.end();
          resolve();
          return;
        }

        index += 1;
        expectedReplies = command.replies;
        socket.write(`${command.line}\r\n`);
      };

      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        response += chunk;
        let endOfLine = response.indexOf('\n');
        while (endOfLine !== -1) {
          const line = response.slice(0, endOfLine).replace(/\r$/, '');
          response = response.slice(endOfLine + 1);
          endOfLine = response.indexOf('\n');
          const reply = /^(\d{3})([- ]|$)/.exec(line);
          if (!reply || !expectedReplies.includes(Number(reply[1]))) {
            socket.destroy();
            handleConnectionFailure(new Error(`smtp error: ${line}`));
            return;
          }

          if (reply[2] !== '-') {
            if (commands[index - 1]?.acceptsMessage) {
              // DATA has succeeded. A later QUIT failure must not resend the message.
              messageAccepted = true;
            }
            sendNext();
          }
        }
      });

      const handleTimeout = () => {
        socket.destroy();
        handleConnectionFailure(new Error('smtp timeout'));
      };
      const deadline = setTimeout(handleTimeout, 30_000);
      socket.setTimeout(10_000, handleTimeout);
      socket.on('error', handleConnectionFailure);
      socket.once('close', () => {
        clearTimeout(deadline);
        handleConnectionFailure(new Error('smtp connection closed before completion'));
      });
    });
  }
}
