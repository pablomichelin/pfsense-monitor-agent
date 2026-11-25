import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { command, fixture as commandFixture, nodeId, userId } from './command-test-fixtures.mjs';

process.env.BACKUP_DRIFT_ENABLED = 'true';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const previousLoader = require.extensions['.ts'];
let BackupsIngestService, BackupsCommandService, BackupsPolicyService, BackupsDriftService, NodeCommandsService;
try {
  require.extensions['.ts'] = (module, filename) => {
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
    module._compile(outputText, filename);
  };
  ({ BackupsIngestService } = require('../src/backups/backups-ingest.service.ts'));
  ({ BackupsCommandService } = require('../src/backups/backups-command.service.ts'));
  ({ BackupsPolicyService } = require('../src/backups/backups-policy.service.ts'));
  ({ BackupsDriftService } = require('../src/backups/backups-drift.service.ts'));
  ({ NodeCommandsService } = require('../src/node-commands/node-commands.service.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

const MiB = 1024 * 1024;
const previousHash = 'a'.repeat(64);
const currentHash = 'b'.repeat(64);
const lastCheckedAt = '2026-11-24T10:00:00.000Z';
const reportedAt = new Date('2026-11-24T11:00:00.000Z');
const retainedDrift = {
  active: true, alert_key: previousHash + ':' + currentHash, detected_at: lastCheckedAt,
};
const activeDelivery = command({
  type: 'config_backup_now', status: 'running', retryCount: 1, payloadJson: {},
});
const headers = {
  nodeId, receivedAt: reportedAt, headerBackupEnabled: '1',
  headerBackupScheduleMode: 'hours', headerBackupIntervalHours: '8',
};

function policyFixture({ initial = {}, beforeLock, backups = [] } = {}) {
  let row = structuredClone(initial);
  let inTransaction = false;
  const events = [];
  const audits = [];
  let storedBackups = backups;
  function readPair({ where, orderBy, select, take }) {
    assert.deepEqual(where, { nodeId, status: 'stored', storagePath: { not: null } });
    assert.deepEqual(orderBy, [{ receivedAt: 'desc' }, { id: 'desc' }]);
    assert.equal(take, 2);
    return storedBackups
      .toSorted((a, b) => b.receivedAt - a.receivedAt || b.id.localeCompare(a.id))
      .slice(0, take)
      .map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])));
  }
  const db = {
    nodeConfigBackup: {
      findMany: async (query) => {
        assert.equal(inTransaction, false);
        return readPair(query);
      },
    },
    $transaction: async (callback) => {
      assert.equal(inTransaction, false);
      events.push('begin');
      inTransaction = true;
      let hasNodeLock = false;
      const readPolicy = () => {
        assert.equal(hasNodeLock, true);
        return { configBackupPolicyJson: structuredClone(row) };
      };
      const tx = {
        $queryRaw: async (query, id) => {
          const sql = query.join('?').replace(/\s+/g, ' ');
          if (sql.includes('FROM node_commands')) {
            assert.equal(hasNodeLock, true);
            assert.equal(id, activeDelivery.id);
            events.push('command lock');
            return [{ id }];
          }
          assert.match(sql, /FROM nodes WHERE id = \?::uuid FOR UPDATE/);
          assert.equal(id, nodeId);
          assert.equal(hasNodeLock, false);
          if (beforeLock) row = beforeLock(row);
          hasNodeLock = true;
          events.push('node lock');
          return [readPolicy()];
        },
        node: {
          findUnique: async () => {
            events.push('read policy');
            return readPolicy();
          },
          update: async ({ where, data }) => {
            assert.equal(hasNodeLock, true);
            assert.equal(where.id, nodeId);
            events.push('write policy');
            row = structuredClone(data.configBackupPolicyJson);
            return { site: { clientId: 'synthetic-client' } };
          },
        },
        nodeConfigBackup: {
          findMany: async (query) => {
            assert.equal(hasNodeLock, true);
            assert.deepEqual(query.select, { id: true });
            return readPair(query);
          },
        },
        nodeCommand: {
          findFirst: async () => activeDelivery,
          findUnique: async () => activeDelivery,
        },
        auditLog: {
          create: async ({ data }) => {
            assert.equal(hasNodeLock, true);
            audits.push(data);
          },
        },
      };
      try {
        const result = await callback(tx);
        events.push('commit');
        return result;
      } finally {
        inTransaction = false;
      }
    },
  };
  const assertOutsideTransaction = () => assert.equal(inTransaction, false);
  return {
    db, events, audits, row: () => row, assertOutsideTransaction,
    setBackups: (next) => { storedBackups = next; },
  };
}

test('scheduled upload merges into the policy visible after it locks the node', async () => {
  const f = policyFixture({
    initial: { retention_count: 60, drift_state: retainedDrift },
    beforeLock: (row) => ({
      ...row, retention_max_bytes: 350 * MiB, config_sha256: currentHash, last_checked_at: lastCheckedAt,
    }),
  });
  const service = new BackupsIngestService(f.db);
  await service.persistBackupPolicyFromHeaders(headers);

  assert.deepEqual(f.events, ['begin', 'node lock', 'write policy', 'commit']);
  assert.deepEqual(f.row().drift_state, retainedDrift);
  assert.equal(f.row().retention_count, 60);
  assert.equal(f.row().retention_max_bytes, 350 * MiB);
  assert.equal(f.row().config_sha256, currentHash);
  assert.equal(f.row().last_checked_at, lastCheckedAt);
  assert.equal(f.row().interval_hours, 8);
  assert.equal(f.row().reported_at, reportedAt.toISOString());
});

test('manual upload reuses the existing node-to-command lock order for its policy write', async () => {
  const f = policyFixture({ initial: { retention_count: 60 } });
  const commands = new BackupsCommandService(f.db, {});
  const service = new BackupsIngestService(f.db);
  await commands.withBackupDeliveryAttempt({
    nodeId, commandId: activeDelivery.id, deliveryAttempt: 1,
  }, (tx) => service.persistBackupPolicyFromHeaders(headers, tx));

  assert.deepEqual(f.events, ['begin', 'node lock', 'command lock', 'read policy', 'write policy', 'commit']);
  assert.equal(f.row().retention_count, 60);
  assert.equal(f.row().interval_hours, 8);
});

test('retention removes an explicit override and preserves schedule and drift committed before its lock', async () => {
  const f = policyFixture({
    initial: { retention_count: 60, retention_max_bytes: 350 * MiB, interval_hours: 24 },
    beforeLock: (row) => ({
      ...row, enabled: true, schedule_mode: 'hours', interval_hours: 12, drift_state: retainedDrift,
    }),
  });
  const retention = { enforceRetention: async () => {
    f.assertOutsideTransaction();
    f.events.push('retention');
    return [];
  } };
  const audit = { record: async (record) => {
    f.assertOutsideTransaction();
    f.events.push('audit');
    assert.equal(record.clientId, 'synthetic-client');
  } };
  const service = new BackupsPolicyService(f.db, retention, audit);
  const result = await service.updateRetentionPolicy({
    nodeId, userId, retention_count: null,
  });

  assert.deepEqual(f.events, ['begin', 'node lock', 'write policy', 'commit', 'retention', 'audit']);
  assert.equal(Object.hasOwn(f.row(), 'retention_count'), false);
  assert.deepEqual(result.effective, { count: 30, max_bytes: 350 * MiB, source: 'node' });
  assert.equal(f.row().interval_hours, 12);
  assert.deepEqual(f.row().drift_state, retainedDrift);
});

test('drift evaluation reads artifacts before locking and merges into the current schedule and policy', async () => {
  const f = policyFixture({
    initial: { interval_hours: 24, retention_count: 30 },
    beforeLock: (row) => ({ ...row, interval_hours: 12, retention_count: 60 }),
    backups: [
      { id: 'current-record', storagePath: 'current', configSha256: currentHash, receivedAt: new Date(2) },
      { id: 'previous-record', storagePath: 'previous', configSha256: previousHash, receivedAt: new Date(1) },
    ],
  });
  const storage = {
    decryptFromFile: async (path) => {
      f.assertOutsideTransaction();
      const name = path === 'current' ? 'changed' : 'original';
      return Buffer.from('<pfsense><system><hostname>' + name + '</hostname></system></pfsense>');
    },
  };
  const service = new BackupsDriftService(f.db, storage);
  await service.evaluateStoredBackup(nodeId, 'current-record');
  const detectedAt = f.row().drift_state.detected_at;
  assert.deepEqual(f.row().drift_state.sensitive_changed_sections, ['system']);

  await service.evaluateStoredBackup(nodeId, 'current-record');
  assert.equal(f.row().drift_state.detected_at, detectedAt);
  assert.equal(f.row().interval_hours, 12);
  assert.equal(f.row().retention_count, 60);
  assert.deepEqual(f.audits.map((record) => record.action), ['backup.config.drift_detected']);
});

function storedBackup(id, hostname, timestamp) {
  const xml = Buffer.from(
    '<pfsense><system><hostname>' + hostname + '</hostname></system>' +
    '<dhcpd><descr>' + id + '</descr></dhcpd></pfsense>',
  );
  return {
    id, xml, storagePath: id, configSha256: createHash('sha256').update(xml).digest('hex'),
    receivedAt: new Date(timestamp),
  };
}

function pauseBaselineRead(f, backups) {
  const files = new Map(backups.map((backup) => [backup.storagePath, backup.xml]));
  let pause, release;
  const started = new Promise((resolve) => { pause = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  const reads = [];
  const storage = {
    decryptFromFile: async (path) => {
      f.assertOutsideTransaction();
      reads.push(path);
      if (path === 'A') {
        pause();
        await hold;
      }
      return files.get(path);
    },
  };
  return { started, release, reads, storage };
}

for (const olderWouldRaiseDrift of [false, true]) {
  const outcome = olderWouldRaiseDrift ? 'reopen drift' : 'clear drift';
  test('drift evaluation discards late B after C commits when B would ' + outcome, async () => {
    const a = storedBackup('A', 'first', 1);
    const b = storedBackup('B', olderWouldRaiseDrift ? 'second' : 'first', 2);
    const c = storedBackup('C', 'second', 2);
    const f = policyFixture({
      initial: { retention_count: 60, interval_hours: 12, drift_state: retainedDrift },
      backups: [a, b],
    });
    const paused = pauseBaselineRead(f, [a, b, c]);
    const service = new BackupsDriftService(f.db, paused.storage);

    const older = service.evaluateStoredBackup(nodeId, b.id);
    try {
      await paused.started;
      // The timestamp tie is resolved by ID, independent of fixture row order.
      f.setBackups([b, a, c]);
      await service.evaluateStoredBackup(nodeId, c.id);
      if (olderWouldRaiseDrift) {
        assert.equal(f.row().drift_state, undefined);
      } else {
        assert.equal(f.row().drift_state.baseline_backup_id, b.id);
        assert.equal(f.row().drift_state.current_sha256, c.configSha256);
      }
    } finally {
      paused.release();
      await older;
    }

    const expectedAudit = olderWouldRaiseDrift ? [] : [c.id];
    assert.deepEqual(f.audits.map((entry) => entry.metadataJson.backup_id), expectedAudit);
    assert.equal(f.events.filter((event) => event === 'write policy').length, 1);
    assert.equal(f.row().drift_state?.current_sha256, olderWouldRaiseDrift ? undefined : c.configSha256);
    assert.equal(f.row().retention_count, 60);
    assert.equal(f.row().interval_hours, 12);

    const readCount = paused.reads.length;
    await service.evaluateStoredBackup(nodeId, b.id);
    assert.equal(paused.reads.length, readCount);
  });
}

test('drift evaluation discards a changed baseline even when the latest backup ID is unchanged', async () => {
  const a = storedBackup('A', 'first', 1);
  const b = storedBackup('B', 'second', 2);
  const initial = { drift_state: retainedDrift };
  const f = policyFixture({ initial, backups: [a, b] });
  const paused = pauseBaselineRead(f, [a, b]);
  const service = new BackupsDriftService(f.db, paused.storage);
  const evaluation = service.evaluateStoredBackup(nodeId, b.id);

  try {
    await paused.started;
    f.setBackups([b]);
  } finally {
    paused.release();
    await evaluation;
  }

  assert.deepEqual(f.row(), initial);
  assert.deepEqual(f.audits, []);
  assert.equal(f.events.includes('write policy'), false);
});

test('drift acknowledgment clears only drift and audits the state read under the lock once', async () => {
  const currentDrift = { ...retainedDrift, alert_key: 'updated-drift' };
  const f = policyFixture({
    initial: { drift_state: retainedDrift, interval_hours: 24 },
    beforeLock: (row) => row.drift_state
      ? { ...row, interval_hours: 12, retention_count: 60, drift_state: currentDrift }
      : row,
  });
  const service = new BackupsDriftService(f.db, {});
  assert.deepEqual(await service.acknowledgeDrift({ nodeId, userId }), { ok: true, cleared: true });
  assert.deepEqual(await service.acknowledgeDrift({ nodeId, userId }), { ok: true, cleared: false });

  assert.deepEqual(f.row(), { interval_hours: 12, retention_count: 60 });
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].metadataJson.previous_state.alert_key, 'updated-drift');
});

test('a timeout result cannot overwrite the successful receipt for an already committed manual backup', async () => {
  const committed = command({
    type: 'config_backup_now', status: 'succeeded', retryCount: 3,
    resultJson: { backup_uid: 'committed-artifact', sha256: currentHash, delivery_attempt: 3 },
  });
  const { db, state } = commandFixture([committed]);
  const service = new NodeCommandsService(db, {});
  const response = await service.reportCommandResult({
    nodeId, commandId: committed.id, deliveryAttempt: 3, credentialId: userId,
    status: 'failed', errorMessage: 'synthetic upload timed out after commit',
  });

  assert.deepEqual(response, {
    ok: true, command_id: committed.id, status: 'succeeded', delivery_attempt: 3,
  });
  assert.deepEqual(state.commands, [committed]);
  assert.deepEqual(state.audit, []);
});
