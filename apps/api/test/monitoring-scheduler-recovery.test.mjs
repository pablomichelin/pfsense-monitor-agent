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

  test(`${name} schedules subsequent ticks when the startup cycle fails`, async ({ mock }) => {
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
      if (reads === 1) throw new Error('synthetic startup read failure');
      return [];
    } });

    try {
      await provider.onModuleInit();
      callbacks[timerIndex]();
      await setImmediate();

      assert.equal(reads, 2);
      assert.equal(warn.mock.callCount(), 1);
      assert.equal(warn.mock.calls[0].arguments[0], `${name} failed: Error: synthetic startup read failure`);
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
          ? [{ nodeId: 'synthetic-node', cpuPercent: 50, status: 'online', availabilityScore: 1 }]
          : [{ nodeId: 'synthetic-node' }];
      },
    },
    nodeMetricRollupHourly: {
      findMany: async () => { events.push('read hourly'); return []; },
    },
    nodeMetricRollupDaily: noRowsDeleted,
    $executeRaw: async (_query, table, rows, conflict) => {
      assert.equal(table.text, 'node_metric_rollups_hourly');
      assert.equal(rows.values[0], 'synthetic-node');
      assert.equal(rows.values[1].getTime(), hourlyKey.getTime());
      assert.equal(rows.values[2], 1);
      assert.equal(conflict.text, 'DO NOTHING');
      events.push('fill hourly');
      return 1;
    },
  };

  await new MetricsRollupService(prisma, lock).runDailyRollupCycle('manual');
  assert.deepEqual(events, ['fill hourly', 'read hourly']);
});

test('daily availability counts only hourly rows with a measured availability', async () => {
  const measurements = [
    [{ sampleCount: 12, availabilityPct: 100 }, { sampleCount: 12, availabilityPct: null }],
    [{ sampleCount: 12, availabilityPct: null }],
    [{ sampleCount: 12, availabilityPct: 0 }, { sampleCount: 12, availabilityPct: null }],
  ];
  for (const [index, hourly] of measurements.entries()) {
    const writes = [];
    const service = new MetricsRollupService({
      nodeMetricRollupHourly: {
        findMany: async ({ where }) => where.nodeId
          ? hourly.map((row) => ({ ...row, nodeId: 'synthetic-node' }))
          : [{ nodeId: 'synthetic-node' }],
      },
      $executeRaw: async (_query, table, rows) => {
        assert.equal(table.text, 'node_metric_rollups_daily');
        writes.push(rows.values);
        return 1;
      },
    }, lock);

    const bucket = new Date('2026-01-01T00:00:00Z');
    assert.equal(await service.rollupDailyBucket(bucket), 1);
    const [[nodeId, bucketStart, sampleCount, ...measures]] = writes;
    assert.equal(nodeId, 'synthetic-node');
    assert.deepEqual(bucketStart, bucket);
    assert.equal(sampleCount, hourly.reduce((sum, row) => sum + row.sampleCount, 0));
    assert.equal(measures.at(-1), [100, null, 0][index]);
  }
});
