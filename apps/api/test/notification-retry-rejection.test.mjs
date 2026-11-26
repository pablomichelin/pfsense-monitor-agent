import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

process.env.NOTIFICATIONS_ENABLED = 'true';
process.env.NOTIFICATIONS_MAX_ATTEMPTS = '2';
process.env.NOTIFICATIONS_RETRY_DELAY_MS = '5';
const { NotificationsDispatcherService } = await import('../dist/notifications/notifications.service.js');

test('a failed deferred delivery read is reported and does not escape the timer', async () => {
  let reads = 0;
  let sends = 0;
  const warned = Promise.withResolvers();
  const delivery = {
    id: 'qa-delivery', status: 'pending', attemptCount: 0, updatedAt: new Date(),
    channelId: 'qa-channel',
    channel: { type: 'webhook', status: 'active', configPublicJson: {}, secretsEncrypted: null },
    alert: {
      id: 'qa-alert', severity: 'warning', title: 'Synthetic alert', type: 'agent_error',
      description: 'QA', openedAt: new Date(), status: 'open',
      node: { hostname: 'qa.example.test', nodeUid: 'qa', site: { client: { name: 'QA' } } },
    },
  };
  delivery.idempotencyKey = `${delivery.alert.id}:${delivery.channelId}:${delivery.alert.openedAt.toISOString()}`;
  const prisma = {
    notificationDelivery: {
      findUnique: async () => {
        reads++;
        if (reads === 2) throw new Error('synthetic transient read failure');
        return { ...delivery };
      },
      updateMany: async ({ data }) => {
        delivery.status = data.status;
        delivery.attemptCount += data.attemptCount?.increment ?? 0;
        delivery.updatedAt = new Date();
        return { count: 1 };
      },
    },
  };
  const provider = { send: async () => ({ ok: ++sends > 1 }) };
  const dispatcher = new NotificationsDispatcherService(prisma, {}, {}, provider, {});
  dispatcher.logger.warn = (message) => warned.resolve(message);

  await dispatcher.processDelivery(delivery.id);
  const message = await Promise.race([warned.promise, delay(250, null, { ref: false })]);
  assert.match(message, /notification delivery retry failed.*qa-delivery/);
  assert.equal(reads, 2);
  assert.equal(sends, 1);
  await delay(6);
  await dispatcher.processDelivery(delivery.id);
  assert.equal(sends, 2);
});
