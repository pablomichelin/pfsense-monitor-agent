import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NOTIFICATIONS_ENABLED = 'true';
process.env.NOTIFICATIONS_MAX_ATTEMPTS = '3';
process.env.NOTIFICATIONS_RETRY_DELAY_MS = '600';
const { NotificationsDispatcherService } = await import('../dist/notifications/notifications.service.js');

test('matching rules for the same channel start one delivery and preserve retry delay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
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
  const update = async ({ where, data }) => {
    const delivery = deliveries.get(where.id);
    if ((where.status && delivery.status !== where.status) ||
        (where.attemptCount !== undefined && delivery.attemptCount !== where.attemptCount) ||
        (where.updatedAt && delivery.updatedAt > where.updatedAt.lte)) {
      return { count: 0 };
    }
    delivery.status = data.status;
    delivery.attemptCount += data.attemptCount?.increment ?? 0;
    delivery.updatedAt = new Date();
    if (where.id === 'shared' && data.status === 'delivered') retryFinished.resolve();
    return { count: 1 };
  };
  const prisma = {
    alert: { findUnique: async () => alert },
    notificationRule: { findMany: async () => rules },
    notificationDelivery: {
      upsert: async ({ create }) => {
        const id = create.channelId;
        if (!deliveries.has(id)) {
          deliveries.set(id, {
            ...create, id, alert, attemptCount: 0, updatedAt: new Date(),
            channel: { ...channel, configPublicJson: { id } },
          });
        }
        return { ...deliveries.get(id) };
      },
      findUnique: async ({ where }) => ({ ...deliveries.get(where.id) }),
      update,
      updateMany: update,
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
  await dispatcher.dispatchForAlert(alert.id);
  assert.deepEqual(sends, ['shared', 'other'], 'redispatch may not bypass a scheduled retry');
  t.mock.timers.tick(599);
  assert.deepEqual(sends, ['shared', 'other']);
  t.mock.timers.tick(1);
  await retryFinished.promise;
  assert.deepEqual(sends, ['shared', 'other', 'shared']);
  assert.equal(deliveries.get('shared').attemptCount, 2);
});

test('two dispatchers that read the same pending snapshot claim one attempt', async () => {
  const current = {
    id: 'qa-delivery', status: 'pending', attemptCount: 0, updatedAt: new Date(),
    channelId: 'qa-channel',
    channel: { type: 'webhook', status: 'active', configPublicJson: {}, secretsEncrypted: null },
    alert: {
      id: 'qa-alert', severity: 'warning', title: 'Synthetic concurrent alert', type: 'agent_error',
      description: 'QA only', openedAt: new Date(), status: 'open',
      node: { hostname: 'qa.example.test', nodeUid: 'qa', site: { client: { name: 'QA' } } },
    },
  };
  current.idempotencyKey = `${current.alert.id}:${current.channelId}:${current.alert.openedAt.toISOString()}`;
  let reads = 0;
  let sent = 0;
  const bothRead = Promise.withResolvers();
  const prisma = {
    notificationDelivery: {
      findUnique: async () => {
        const snapshot = { ...current };
        if (++reads === 2) bothRead.resolve();
        await bothRead.promise;
        return snapshot;
      },
      updateMany: async ({ where, data }) => {
        if (current.status !== where.status || current.attemptCount !== where.attemptCount) {
          return { count: 0 };
        }
        current.status = data.status;
        current.attemptCount += data.attemptCount?.increment ?? 0;
        return { count: 1 };
      },
    },
  };
  const provider = { send: async () => { sent++; return { ok: true }; } };
  const a = new NotificationsDispatcherService(prisma, {}, {}, provider, {});
  const b = new NotificationsDispatcherService(prisma, {}, {}, provider, {});
  await Promise.all([a.processDelivery(current.id), b.processDelivery(current.id)]);
  assert.equal(sent, 1);
  assert.equal(current.attemptCount, 1);
  assert.equal(current.status, 'delivered');
});

for (const [reason, alertStatus, channelStatus, reopened] of [
  ['alert resolved', 'resolved', 'active', false],
  ['channel inactive', 'open', 'inactive', false],
  ['alert occurrence replaced', 'open', 'active', true],
]) {
  test('retry suppresses delivery when ' + reason, async () => {
    const originallyOpened = new Date('2026-11-25T09:00:00Z');
    const delivery = {
      id: 'qa-delivery', status: 'failed', attemptCount: 1, updatedAt: new Date(0),
      channelId: 'qa-channel', idempotencyKey: `qa-alert:qa-channel:${originallyOpened.toISOString()}`,
      channel: { type: 'webhook', status: channelStatus, configPublicJson: {}, secretsEncrypted: null },
      alert: {
        id: 'qa-alert', severity: 'warning', title: 'Synthetic alert', type: 'agent_error',
        status: alertStatus, description: 'QA only',
        openedAt: reopened ? new Date('2026-11-25T10:00:00Z') : originallyOpened,
        node: { hostname: 'qa.example.test', nodeUid: 'qa', site: { client: { name: 'QA' } } },
      },
    };
    const changes = [];
    let sends = 0;
    const prisma = { notificationDelivery: {
      findUnique: async () => delivery,
      updateMany: async ({ data }) => { changes.push(data); return { count: 1 }; },
    } };
    const provider = { send: async () => { sends += 1; return { ok: true }; } };
    const dispatcher = new NotificationsDispatcherService(prisma, {}, {}, provider, {});
    await dispatcher.processDelivery(delivery.id);
    assert.equal(sends, 0);
    assert.deepEqual(changes, [{ status: 'failed', lastError: reason }]);
  });
}
