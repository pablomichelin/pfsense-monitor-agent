import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (mod, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
  });
  mod._compile(outputText, filename);
};
let IngestService, mergeBackupSchedulePolicy, parseStoredBackupPolicy, resolveBackupFreshnessAt;
try {
  ({ IngestService } = require('../src/ingest/ingest.service.ts'));
  ({ mergeBackupSchedulePolicy, parseStoredBackupPolicy, resolveBackupFreshnessAt } =
    require('../src/nodes/backup-policy.util.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

const nodeId = '10000000-0000-4000-8000-000000000001';
const sentAt = '2026-01-01T00:00:03.000Z';
const oldHash = 'a'.repeat(64);
const newHash = 'b'.repeat(64);
const evidence = {
  config_sha256: oldHash,
  last_checked_at: '2026-01-01T00:00:01.000Z',
};
const lockedPolicy = {
  enabled: true,
  schedule_mode: 'weekly',
  reported_at: '2026-01-01T00:00:02.000Z',
  ...evidence,
  retention_count: 42,
  retention_max_bytes: 500_000_000,
  drift_state: { active: true, changed_sections: ['synthetic'] },
  future_extension: { keep: ['synthetic', 17] },
};

function withHeartbeat({ lastSentAt = lockedPolicy.reported_at } = {}) {
  const state = { writes: [], locked: false, select: '' };
  const writeNode = async ({ data }) => {
    assert.equal(state.locked, true);
    state.writes.push(data);
  };
  const tx = {
    $queryRaw: async (query) => {
      state.select = query.sql;
      state.locked = true;
      return [{
        last_heartbeat_sent_at: new Date(lastSentAt),
        maintenance_mode: false,
        status: 'online',
        config_backup_policy_json: structuredClone(lockedPolicy),
      }];
    },
    node: { update: writeNode, updateMany: writeNode },
    nodeCredential: { update: async () => {} },
    nodeServiceStatus: { findMany: async () => [] },
    nodeGatewayStatus: { findMany: async () => [] },
    alert: { findMany: async () => [] },
  };
  const service = new IngestService(
    {
      $transaction: async (work) => work(tx),
      node: { findUnique: async () => null },
      site: { findUnique: async () => ({ clientId: 'synthetic-client' }) },
    },
    {
      authenticateNodeRequest: async () => ({
        headerNodeUid: 'synthetic-node',
        node: { id: nodeId, status: 'online', configBackupPolicyJson: { retention_count: 3 } },
        credential: { id: 'synthetic-credential' },
      }),
      parseIsoDate: (value) => new Date(value),
    },
    { reconcileSucceededCommands: async () => {} },
    { getPendingCommandsForNode: async () => [] },
    { publishDashboardRefresh: () => {} },
    { dispatchForAlertIds: () => {} },
  );
  const ingest = (configBackup) => service.ingestHeartbeat({
    rawBody: Buffer.alloc(0),
    body: {
      heartbeat_id: 'current', sent_at: sentAt, node_uid: 'synthetic-node',
      hostname: 'synthetic', customer_code: 'synthetic', schema_version: '1',
      pfsense_version: '2.8.1', uptime_sec: 10, config_backup: configBackup,
    },
  });
  return { state, ingest };
}

test('heartbeat writes its normalized schedule over the locked JSON and preserves other fields', async () => {
  const { state, ingest } = withHeartbeat();
  await ingest({ enabled: true, schedule_mode: 'daily', schedule_time: '07:30' });
  const policy = state.writes[0].configBackupPolicyJson;
  assert.equal(policy.retention_count, 42);
  assert.equal(policy.retention_max_bytes, 500_000_000);
  assert.deepEqual(policy.drift_state, lockedPolicy.drift_state);
  assert.deepEqual(policy.future_extension, lockedPolicy.future_extension);
  assert.equal(policy.schedule_mode, 'daily');
  assert.equal(policy.schedule_time, '07:30');
  assert.equal(policy.reported_at, sentAt);
  assert.equal(policy.config_sha256, evidence.config_sha256);
  assert.equal(policy.last_checked_at, evidence.last_checked_at);
  assert.match(state.select, /config_backup_policy_json[\s\S]*FOR UPDATE/i);
});

test('disabled schedule preserves the time of the last complete verification', async () => {
  const { state, ingest } = withHeartbeat();
  await ingest({ enabled: false });
  const policy = state.writes[0].configBackupPolicyJson;
  assert.equal(policy.enabled, false);
  assert.equal(policy.config_sha256, evidence.config_sha256);
  assert.equal(resolveBackupFreshnessAt({
    latestBackupReceivedAt: new Date('2026-01-01T00:00:00.000Z'),
    latestBackupSha256: oldHash,
    policy: parseStoredBackupPolicy(policy),
  }).toISOString(), evidence.last_checked_at);
});

test('heartbeat replaces both fields of a complete normalized verification', async () => {
  const { state, ingest } = withHeartbeat();
  await ingest({ enabled: true, config_sha256: newHash.toUpperCase(), last_checked_at: sentAt });
  const policy = state.writes[0].configBackupPolicyJson;
  assert.equal(policy.config_sha256, newHash);
  assert.equal(policy.last_checked_at, sentAt);
});

for (const [label, partial] of [
  ['hash only', { config_sha256: newHash }],
  ['timestamp only', { last_checked_at: sentAt }],
  ['timestamp and malformed hash', { config_sha256: 'invalid', last_checked_at: sentAt }],
]) {
  test(`heartbeat with ${label} cannot splice two verification reports`, async () => {
    const { state, ingest } = withHeartbeat();
    await ingest({ enabled: true, ...partial });
    const policy = state.writes[0].configBackupPolicyJson;
    assert.equal(policy.config_sha256, evidence.config_sha256);
    assert.equal(policy.last_checked_at, evidence.last_checked_at);
  });
}

test('omitted config_backup and stale report both leave the policy untouched', async () => {
  const current = withHeartbeat();
  const stale = withHeartbeat({ lastSentAt: '2026-01-01T00:00:04.000Z' });
  await current.ingest(undefined);
  await stale.ingest({ enabled: true, schedule_mode: 'monthly' });
  for (const { state } of [current, stale]) {
    assert.equal(state.writes.length, 1);
    assert.equal(Object.hasOwn(state.writes[0], 'configBackupPolicyJson'), false);
  }
});

test('schedule merge accepts only its fields and adds no retention defaults', () => {
  const reported = { enabled: false, schedule_dow: 0, retention_count: 1, future_extension: 'discard' };
  for (const existing of [null, 'invalid legacy value', ['invalid legacy value']]) {
    assert.deepEqual(mergeBackupSchedulePolicy(existing, reported), { enabled: false, schedule_dow: 0 });
  }
  assert.deepEqual(mergeBackupSchedulePolicy({ retention_count: 42, future_extension: null }, reported), {
    enabled: false,
    schedule_dow: 0,
    retention_count: 42,
    future_extension: null,
  });
});
