import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NOTIFICATIONS_ENABLED = 'true';
process.env.NOTIFICATIONS_MAX_ATTEMPTS = '3';
process.env.NOTIFICATIONS_RETRY_DELAY_MS = '600';
const { NotificationsDispatcherService } = await import('../dist/notifications/notifications.service.js');

test('matching rules for the same channel start one delivery and preserve retry delay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clientId = 'synthetic-client';
  const alert = {
    id: 'synthetic-alert', type: 'agent_error', severity: 'warning', status: 'open',
    title: 'Synthetic alert', description: 'QA only', openedAt: new Date(),
    node: { hostname: 'qa.example.test', site: { clientId, client: { name: 'QA' } } },
  };
  const channel = { type: 'webhook', status: 'active', secretsEncrypted: null };
  const rule = { enabled: true, severity: null, alertType: null, clientId, channel };
  const rules = [
    { ...rule, channelId: 'shared' },
    { ...rule, channelId: 'shared', severity: 'warning' },
    { ...rule, channelId: 'other' },
  ];
  const deliveries = new Map();
  const retryFinished = Promise.withResolvers();
  const prisma = {
    alert: { findUnique: async () => alert },
    notificationRule: { findMany: async () => rules },
    notificationDelivery: {
      upsert: async ({ create }) => {
        const id = create.channelId;
        if (!deliveries.has(id)) {
          deliveries.set(id, {
            ...create, id, alert, attemptCount: 0,
            channel: { ...channel, configPublicJson: { id } },
          });
        }
        return { ...deliveries.get(id) };
      },
      findUnique: async ({ where }) => ({ ...deliveries.get(where.id) }),
      update: async ({ where, data }) => {
        const delivery = deliveries.get(where.id);
        delivery.status = data.status;
        delivery.attemptCount += data.attemptCount?.increment ?? 0;
        if (where.id === 'shared' && data.status === 'delivered') retryFinished.resolve();
      },
    },
  };
  const sends = [];
  const webhook = {
    async send({ id }) {
      sends.push(id);
      return id === 'shared' && sends.filter((sent) => sent === 'shared').length === 1
        ? { ok: false, error: 'synthetic temporary failure' }
        : { ok: true };
    },
  };
  const dispatcher = new NotificationsDispatcherService(prisma, {}, {}, webhook, {});

  await dispatcher.dispatchForAlert(alert.id);
  assert.deepEqual(sends, ['shared', 'other']);
  assert.equal(deliveries.get('shared').status, 'failed');
  assert.equal(deliveries.get('other').status, 'delivered');
  t.mock.timers.tick(599);
  assert.deepEqual(sends, ['shared', 'other']);
  t.mock.timers.tick(1);
  await retryFinished.promise;
  assert.deepEqual(sends, ['shared', 'other', 'shared']);
  assert.equal(deliveries.get('shared').attemptCount, 2);
});
