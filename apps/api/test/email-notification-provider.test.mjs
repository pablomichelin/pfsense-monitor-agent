import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import test from 'node:test';
import { EmailNotificationProvider } from '../dist/notifications/providers/email.provider.js';

const message = { subject: 'Synthetic alert', body: 'QA only' };

async function withSmtpServer(t, onConnection, send) {
  const connections = new Set();
  const server = createServer((socket) => {
    connections.add(socket);
    socket.once('close', () => connections.delete(socket));
    socket.on('error', () => {});
    onConnection(socket);
  });
  t.after(async () => {
    for (const socket of connections) socket.destroy();
    server.close();
    await once(server, 'close');
  });
  server.listen({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  return send({
    smtp_host: '127.0.0.1',
    smtp_port: server.address().port,
    from: 'monitor@example.test',
    to: 'qa@example.test',
  });
}

test('SMTP waits for the full greeting and every final command reply', { timeout: 2000 }, async (t) => {
  const payload = [
    'From: monitor@example.test',
    'To: qa@example.test',
    'Subject: Synthetic alert',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'QA only',
    '',
    '.',
  ].join('\r\n');
  const expected = [
    ['EHLO monitor-pfsense', ['250-qa.example.test\r\n250-AU', 'TH LOGIN\r\n250 OK\r\n']],
    ['AUTH LOGIN', ['334 VXNlcm5hbWU6\r\n']],
    ['c3ludGhldGljLXVzZXI=', ['334 UGFzc3dvcmQ6\r\n']],
    ['c3ludGhldGljLXBhc3M=', ['235 Authentication successful\r\n']],
    ['MAIL FROM:<monitor@example.test>', ['250 Sender OK\r\n']],
    ['RCPT TO:<qa@example.test>', ['250 Recipient OK\r\n']],
    ['DATA', ['354 Send data\r\n']],
    [payload, ['250 Accepted\r\n']],
    ['QUIT', ['221 Bye\r\n']],
  ];
  const received = [];
  let violation;
  const result = await withSmtpServer(t, (socket) => {
    let pendingReply = false;
    let buffered = '';
    function reply(chunks) {
      pendingReply = true;
      socket.write(chunks[0]);
      if (chunks.length === 1) {
        pendingReply = false;
        return;
      }
      setTimeout(() => {
        if (socket.destroyed || socket.writableEnded) return;
        pendingReply = false;
        socket.write(chunks[1]);
      }, 20);
    }
    socket.on('data', (data) => {
      if (pendingReply) {
        violation = 'SMTP client wrote before the final reply';
        socket.end('554 Command sent too early\r\n');
        return;
      }
      const [command, response] = expected[received.length] ?? [];
      buffered += data.toString();
      const terminator = `${command}\r\n`;
      if (command && terminator.startsWith(buffered) && buffered.length < terminator.length) return;
      if (!command || buffered !== terminator) {
        violation = 'SMTP client wrote an unexpected command or pipelined commands';
        socket.end('554 Unexpected command\r\n');
        return;
      }
      received.push(command);
      buffered = '';
      reply(response);
    });
    reply(['22', '0 qa.example.test SMTP ready\r\n']);
  }, (config) => new EmailNotificationProvider().send(config, {
    smtp_user: 'synthetic-user',
    smtp_password: 'synthetic-pass',
  }, message));

  assert.equal(violation, undefined);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(received, expected.map(([command]) => command));
});

test('SMTP reports a disconnect before the message is accepted', { timeout: 2000 }, async (t) => {
  const result = await withSmtpServer(t, (socket) => {
    socket.end('220 qa.example.test SMTP ready\r\n');
  }, (config) => new EmailNotificationProvider().send(config, {}, message));

  assert.deepEqual(result, { ok: false, error: 'smtp connection closed before completion' });
});

test('SMTP keeps the accepted delivery if the peer disconnects before the QUIT reply', { timeout: 2000 }, async (t) => {
  let accepted;
  const result = await withSmtpServer(t, (socket) => {
    let buffered = '';
    let readingMessage = false;
    socket.on('data', (chunk) => {
      buffered += chunk.toString();
      if (readingMessage) {
        if (!buffered.endsWith('\r\n.\r\n')) return;
        accepted = buffered;
        socket.end('250 Message queued\r\n');
        return;
      }
      if (!buffered.endsWith('\r\n')) return;
      const command = buffered.trimEnd();
      buffered = '';
      if (command === 'DATA') {
        readingMessage = true;
        socket.write('354 Send data\r\n');
      } else {
        socket.write('250 OK\r\n');
      }
    });
    // Keep the existing tolerance for servers using LF-only replies.
    socket.write('220 qa.example.test SMTP ready\n');
  }, (config) => new EmailNotificationProvider().send(config, {}, message));

  assert.match(accepted, /Subject: Synthetic alert/);
  assert.deepEqual(result, { ok: true });
});

test('SMTP returns the server rejection without sending another command', { timeout: 2000 }, async (t) => {
  const received = [];
  const result = await withSmtpServer(t, (socket) => {
    socket.on('data', (data) => received.push(data.toString()));
    socket.end('421 Service unavailable\r\n');
  }, (config) => new EmailNotificationProvider().send(config, {}, message));

  assert.deepEqual(result, { ok: false, error: 'smtp error: 421 Service unavailable' });
  assert.deepEqual(received, []);
});
