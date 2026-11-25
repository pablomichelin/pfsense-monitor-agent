import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { Logger } from '@nestjs/common';

process.env.METRIC_ROLLUPS_ENABLED = 'true';
const { NodeLifecycleService } = await import('../dist/nodes/node-lifecycle.service.js');
const { MetricsSamplerService } = await import('../dist/metrics-history/metrics-sampler.service.js');
const { MetricsRollupService } = await import('../dist/metrics-history/metrics-rollup.service.js');

const lock = { tryAcquire: async () => true, release: async () => {} };
const noRowsDeleted = { deleteMany: async () => ({ count: 0 }) };

const jobs = [
  {
    name: 'node lifecycle reconciliation',
    start: (table) => new NodeLifecycleService(
      { node: table }, {}, { loadActivePfsenseUpgradeNodeIds: async () => new Set() }, {},
    ),
  },
  {
    name: 'metric sampling',
    start: (table) => new MetricsSamplerService({ node: table }, lock, {}),
  },
  {
    name: 'hourly metric rollup',
    start: (table) => {
      const service = new MetricsRollupService({
        nodeMetricSample: table,
        nodeMetricRollupHourly: { findMany: async () => [], ...noRowsDeleted },
        nodeMetricRollupDaily: noRowsDeleted,
      }, lock);
      const hourly = service.rollupHourlyBucket.bind(service);
      service.rollupHourlyBucket = (bucket, options) => options?.fillMissingOnly ? 0 : hourly(bucket);
      return service;
    },
  },
  {
    name: 'daily metric rollup',
    timerIndex: 1,
    start: (table) => new MetricsRollupService({
      nodeMetricSample: { findMany: async () => [] },
      nodeMetricRollupHourly: { ...table, ...noRowsDeleted },
      nodeMetricRollupDaily: noRowsDeleted,
    }, lock),
  },
];

for (const { name, start, timerIndex = 0 } of jobs) {
  test(`${name} logs a rejected tick and executes another cycle`, async ({ mock }) => {
    const callbacks = [];
    mock.method(globalThis, 'setInterval', (callback) => {
      callbacks.push(callback);
      return { unref() {} };
    });
    mock.method(globalThis, 'clearInterval', () => {});
    const warn = mock.method(Logger.prototype, 'warn', () => {});
    let reads = 0;
    const provider = start({ findMany: async () => {
      reads += 1;
      if (reads === 2) throw new Error('synthetic database outage');
      return [];
    } });

    try {
      await provider.onModuleInit();
      callbacks[timerIndex]();
      await setImmediate();
      callbacks[timerIndex]();
      await setImmediate();

      assert.equal(reads, 3);
      assert.equal(warn.mock.callCount(), 1);
      assert.equal(warn.mock.calls[0].arguments[0], `${name} failed: Error: synthetic database outage`);
    } finally {
      provider.onModuleDestroy();
    }
  });
}

test('the daily cycle fills the final UTC hour before reading aggregates', async () => {
  const events = [];
  const hourlyKey = new Date();
  hourlyKey.setUTCHours(-1, 0, 0, 0);
  const prisma = {
    nodeMetricSample: {
      findMany: async ({ where }) => {
        assert.equal(where.sampledAt.gte.getTime(), hourlyKey.getTime());
        return where.nodeId
          ? [{ cpuPercent: 50, status: 'online', availabilityScore: 1 }]
          : [{ nodeId: 'synthetic-node' }];
      },
    },
    nodeMetricRollupHourly: {
      createMany: async ({ data, skipDuplicates }) => {
        assert.equal(data.nodeId, 'synthetic-node');
        assert.equal(data.bucketStart.getTime(), hourlyKey.getTime());
        assert.equal(data.sampleCount, 1);
        assert.equal(skipDuplicates, true);
        events.push('fill hourly');
        return { count: 1 };
      },
      findMany: async () => { events.push('read hourly'); return []; },
    },
    nodeMetricRollupDaily: noRowsDeleted,
  };

  await new MetricsRollupService(prisma, lock).runDailyRollupCycle('manual');
  assert.deepEqual(events, ['fill hourly', 'read hourly']);
});
