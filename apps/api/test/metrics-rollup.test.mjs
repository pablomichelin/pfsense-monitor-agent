import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateMetricSamples,
  computeAvailabilityPercent,
  computeAvailabilityScore,
  computeNumericStats,
  resolveHistoryWindow,
  truncateToDayUtc,
  truncateToHourUtc,
} from '../dist/metrics-history/metrics-rollup.util.js';

test('computeNumericStats ignores null values', () => {
  const stats = computeNumericStats([10, null, 20, undefined, 30]);
  assert.equal(stats.count, 3);
  assert.equal(stats.min, 10);
  assert.equal(stats.max, 30);
  assert.equal(stats.avg, 20);
});

test('computeAvailabilityScore treats online/degraded/maintenance as available', () => {
  assert.equal(computeAvailabilityScore('online'), 1);
  assert.equal(computeAvailabilityScore('degraded'), 1);
  assert.equal(computeAvailabilityScore('maintenance'), 1);
  assert.equal(computeAvailabilityScore('offline'), 0);
  assert.equal(computeAvailabilityScore('unknown'), 0);
});

test('aggregateMetricSamples is idempotent for same input', () => {
  const samples = [
    {
      cpuPercent: 10,
      memoryPercent: 40,
      diskPercent: 55,
      latencyMs: 20,
      status: 'online',
    },
    {
      cpuPercent: 30,
      memoryPercent: 60,
      diskPercent: 65,
      latencyMs: 40,
      status: 'offline',
    },
  ];

  const first = aggregateMetricSamples(samples);
  const second = aggregateMetricSamples(samples);

  assert.deepEqual(first, second);
  assert.equal(first.sampleCount, 2);
  assert.equal(first.cpu.avg, 20);
  assert.equal(first.memory.max, 60);
  assert.equal(first.latency.min, 20);
  assert.equal(first.availabilityPct, 50);
});

test('computeAvailabilityPercent uses availabilityScore when present', () => {
  const pct = computeAvailabilityPercent([
    { cpuPercent: null, memoryPercent: null, diskPercent: null, latencyMs: null, status: 'offline', availabilityScore: 1 },
    { cpuPercent: null, memoryPercent: null, diskPercent: null, latencyMs: null, status: 'online', availabilityScore: 0 },
  ]);
  assert.equal(pct, 50);
});

test('truncate helpers use UTC boundaries', () => {
  const date = new Date('2026-07-02T15:47:22.000Z');
  const hour = truncateToHourUtc(date);
  const day = truncateToDayUtc(date);

  assert.equal(hour.toISOString(), '2026-07-02T15:00:00.000Z');
  assert.equal(day.toISOString(), '2026-07-02T00:00:00.000Z');
});

test('resolveHistoryWindow maps periods to granularity', () => {
  const now = new Date('2026-07-02T12:00:00.000Z');

  const h24 = resolveHistoryWindow('24h', now);
  assert.equal(h24.granularity, 'hourly');
  assert.equal(h24.from.toISOString(), '2026-07-01T12:00:00.000Z');

  const d7 = resolveHistoryWindow('7d', now);
  assert.equal(d7.granularity, 'hourly');
  assert.equal(d7.from.toISOString(), '2026-06-25T12:00:00.000Z');

  const d30 = resolveHistoryWindow('30d', now);
  assert.equal(d30.granularity, 'daily');
  assert.equal(d30.from.toISOString(), '2026-06-02T12:00:00.000Z');
});
