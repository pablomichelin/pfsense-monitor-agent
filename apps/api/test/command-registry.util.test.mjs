import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRetryCommand,
  computeRetryBackoffMs,
  normalizeCommandHistoryLimit,
  shouldDeferForConcurrency,
} from '../dist/commands/command-registry.util.js';

test('computeRetryBackoffMs uses schedule index', () => {
  const definition = {
    retryBackoffMs: [30_000, 120_000],
  };

  assert.equal(computeRetryBackoffMs(definition, 1), 30_000);
  assert.equal(computeRetryBackoffMs(definition, 2), 120_000);
  assert.equal(computeRetryBackoffMs(definition, 5), 120_000);
});

test('shouldDeferForConcurrency respects global limit', () => {
  assert.equal(
    shouldDeferForConcurrency({ activeGlobalCount: 2, maxConcurrentGlobal: 2 }),
    true,
  );
  assert.equal(
    shouldDeferForConcurrency({ activeGlobalCount: 1, maxConcurrentGlobal: 2 }),
    false,
  );
  assert.equal(
    shouldDeferForConcurrency({ activeGlobalCount: 99, maxConcurrentGlobal: 0 }),
    false,
  );
});

test('canRetryCommand only for failed with remaining retries', () => {
  assert.equal(
    canRetryCommand({ status: 'failed', retryCount: 0, maxRetries: 2 }),
    true,
  );
  assert.equal(
    canRetryCommand({ status: 'failed', retryCount: 2, maxRetries: 2 }),
    false,
  );
  assert.equal(
    canRetryCommand({ status: 'succeeded', retryCount: 0, maxRetries: 2 }),
    false,
  );
});

test('normalizeCommandHistoryLimit clamps range', () => {
  assert.equal(normalizeCommandHistoryLimit(undefined), 25);
  assert.equal(normalizeCommandHistoryLimit(5), 5);
  assert.equal(normalizeCommandHistoryLimit(500), 100);
  assert.equal(normalizeCommandHistoryLimit(0), 1);
});
