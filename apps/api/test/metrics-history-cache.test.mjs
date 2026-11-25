import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.METRIC_ROLLUPS_ENABLED = 'true';
const { MetricsHistoryService } = await import('../dist/metrics-history/metrics-history.service.js');

function fixture() {
  const reads = [];
  const policy = { assertNodeAccess: async () => {} };
  const prisma = { nodeMetricRollupHourly: { findMany: async ({ where }) => {
    reads.push(where.nodeId);
    return [];
  } } };
  return { reads, policy, service: new MetricsHistoryService(prisma, policy) };
}

const actor = { userId: 'qa-reader' };

test('history cache evicts inactive entries and keeps a recently used firewall', async () => {
  const { reads, service } = fixture();
  for (let i = 0; i < 256; i += 1) {
    await service.getNodeHistory(actor, `node-${i}`, '24h');
  }
  await service.getNodeHistory(actor, 'node-0', '24h');
  await service.getNodeHistory(actor, 'node-new', '24h');
  await service.getNodeHistory(actor, 'node-0', '24h');
  await service.getNodeHistory(actor, 'node-1', '24h');

  assert.equal(reads.filter((nodeId) => nodeId === 'node-0').length, 1);
  assert.equal(reads.filter((nodeId) => nodeId === 'node-1').length, 2);
});

test('history cache refreshes expired results and checks access on hits', async ({ mock }) => {
  const { reads, policy, service } = fixture();
  let now = Date.now();
  mock.method(Date, 'now', () => now);
  const authorize = mock.method(policy, 'assertNodeAccess', async () => {});
  await service.getNodeHistory(actor, 'node-0', '24h');
  await service.getNodeHistory(actor, 'node-0', '24h');
  now += 30_000;
  await service.getNodeHistory(actor, 'node-0', '24h');
  assert.equal(reads.length, 2);
  assert.equal(authorize.mock.callCount(), 3);
});
