import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { Logger } from '@nestjs/common';

process.env.METRIC_ROLLUPS_ENABLED = 'true';
const { NodeLifecycleService } = await import('../dist/nodes/node-lifecycle.service.js');
const { MetricsSamplerService } = await import('../dist/metrics-history/metrics-sampler.service.js');
const { MetricsRollupService } = await import('../dist/metrics-history/metrics-rollup.service.js');
const { deriveEffectiveNodeStatus } = await import('../dist/nodes/node-status.util.js');

const lock = { tryAcquire: async () => true, release: async () => {} };
const noRowsDeleted = { deleteMany: async () => ({ count: 0 }) };

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

for (const key of ['sampler', 'hourly', 'daily']) {
  test(`${key} metric cycle stays exclusive through acquisition and release`, async () => {
    const acquiring = deferred();
    const release = deferred();
    const startedRelease = deferred();
    let acquisitions = 0;
    let releases = 0;
    let firstAcquisitionReturned = false;
    const lease = {
      tryAcquire: async () => {
        if (++acquisitions === 1) {
          await acquiring.promise;
          firstAcquisitionReturned = true;
        }
        return firstAcquisitionReturned;
      },
      release: async () => {
        if (++releases === 1) {
          startedRelease.resolve();
          await release.promise;
        }
      },
    };
    const sampler = new MetricsSamplerService({ node: { findMany: async () => [] } }, lease, {});
    const rollup = new MetricsRollupService({
      nodeMetricRollupHourly: noRowsDeleted,
      nodeMetricRollupDaily: noRowsDeleted,
    }, lease);
    rollup.rollupHourlyBucket = async () => 0;
    rollup.rollupDailyBucket = async () => 0;
    const run = key === 'sampler' ? () => sampler.runSamplingCycle('manual') :
      key === 'hourly' ? () => rollup.runHourlyRollupCycle('manual') : () => rollup.runDailyRollupCycle('manual');

    const first = run();
    const whileAcquiring = run();
    acquiring.resolve();
    await startedRelease.promise;
    const whileReleasing = run();
    await setImmediate();
    const whileLocked = [acquisitions, releases];
    release.resolve();
    await Promise.all([first, whileAcquiring, whileReleasing]);
    assert.deepEqual(whileLocked, [1, 1]);

    await run();
    assert.deepEqual([acquisitions, releases], [2, 2]);
  });
}

test('a firewall without a heartbeat stops reporting maintenance when the mode is disabled', () => {
  const neverSeen = { status: 'maintenance', maintenanceMode: true, lastSeenAt: null };
  assert.equal(deriveEffectiveNodeStatus(neverSeen), 'maintenance');
  assert.equal(deriveEffectiveNodeStatus({ ...neverSeen, maintenanceMode: false }), 'unknown');
  assert.equal(deriveEffectiveNodeStatus({ ...neverSeen, maintenanceMode: false, status: 'online' }), 'unknown');
});

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

test('metric sampling writes bounded batches in one transaction and verifies existing firewalls', async () => {
  const nodes = Array.from({ length: 501 }, (_, index) => ({
    id: `synthetic-node-${index}`, status: 'online', maintenanceMode: false, lastSeenAt: new Date(),
    cpuPercent: 25, memoryPercent: null, diskPercent: null, lastLatencyMs: 7,
  }));
  const writes = [];
  let transactions = 0;
  const sampler = new MetricsSamplerService({
    node: { findMany: async ({ orderBy }) => {
      assert.deepEqual(orderBy, { id: 'asc' });
      return nodes;
    } },
    nodeMetricSample: noRowsDeleted,
    $executeRaw: (query, sampledAt, values) => {
      const statement = query.join(' ');
      assert.match(statement, /JOIN nodes ON nodes.id = input.node_id/);
      assert.match(statement, /FOR KEY SHARE OF nodes/);
      const rowCount = values.values.length / 7;
      writes.push({ sampledAt, rowCount });
      return rowCount;
    },
    $transaction: async (batch) => { transactions += 1; return batch; },
  }, lock, { rollupHourlyBucket: async () => {} });

  await sampler.runSamplingCycle('manual');
  assert.equal(transactions, 1);
  assert.deepEqual(writes.map(({ rowCount }) => rowCount), [500, 1]);
  assert.equal(writes[0].sampledAt, writes[1].sampledAt);
});

test('node reconciliation dispatches committed alerts even when a later node update rolls back', async () => {
  const lastSeenAt = new Date('2025-01-01T00:00:00Z');
  const nodes = ['first', 'second'].map(id => ({
    id, nodeUid: id, status: 'online', maintenanceMode: false, lastSeenAt, alerts: [],
  }));
  let transactions = 0;
  const committedAlerts = [];
  const notifications = [];
  const refreshes = [];
  const lifecycle = new NodeLifecycleService({
    node: { findMany: async () => nodes },
    $transaction: async (work) => {
      const index = transactions++;
      const alertId = `alert-${nodes[index].id}`;
      const result = await work({
        $queryRaw: async () => [{ status: 'online', maintenance_mode: false, last_seen_at: lastSeenAt }],
        node: { update: async () => {} },
        alert: { findUnique: async () => null, create: async () => ({ id: alertId }) },
      });
      if (index === 1) throw new Error('synthetic transaction failed before commit');
      committedAlerts.push(alertId);
      return result;
    },
  }, {
    publishDashboardRefresh: event => refreshes.push(event.source),
  }, {
    loadActivePfsenseUpgradeNodeIds: async () => new Set(),
  }, {
    dispatchForAlertIds: ids => notifications.push(...ids),
  });

  await assert.rejects(lifecycle.reconcileStatuses('interval'), /synthetic transaction failed/);
  assert.deepEqual(committedAlerts, ['alert-first']);
  assert.deepEqual(notifications, committedAlerts);
  assert.deepEqual(refreshes, ['node_reconciled']);
});

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
