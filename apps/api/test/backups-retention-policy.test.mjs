import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRetentionPolicyJson,
  resolveRetentionPolicy,
} from '../dist/backups/backups-retention-policy.util.js';

test('resolveRetentionPolicy uses global defaults when node has no overrides', () => {
  const policy = resolveRetentionPolicy({
    enabled: true,
    schedule_mode: 'hours',
    interval_hours: 24,
  });

  assert.equal(policy.source, 'global');
  assert.equal(policy.count, 30);
  assert.equal(policy.max_bytes, 262144000);
});

test('resolveRetentionPolicy applies node overrides', () => {
  const policy = resolveRetentionPolicy({
    retention_count: 10,
    retention_max_bytes: 104857600,
  });

  assert.equal(policy.source, 'node');
  assert.equal(policy.count, 10);
  assert.equal(policy.max_bytes, 104857600);
});

test('mergeRetentionPolicyJson clears overrides when null', () => {
  const merged = mergeRetentionPolicyJson(
    {
      enabled: true,
      schedule_mode: 'hours',
      interval_hours: 12,
      retention_count: 5,
      retention_max_bytes: 104857600,
    },
    {
      retention_count: null,
      retention_max_bytes: null,
    },
  );

  assert.equal(merged.retention_count, undefined);
  assert.equal(merged.retention_max_bytes, undefined);
  assert.equal(merged.interval_hours, 12);
});
