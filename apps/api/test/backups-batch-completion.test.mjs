import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { command, fixture, nodeId, userId } from './command-test-fixtures.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const previousLoader = require.extensions['.ts'];
let BackupsCommandService, BackupsIngestService, NodeCommandsService;
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
  ({ BackupsCommandService } = require('../src/backups/backups-command.service.ts'));
  ({ BackupsIngestService } = require('../src/backups/backups-ingest.service.ts'));
  ({ NodeCommandsService } = require('../src/node-commands/node-commands.service.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

test('upload A and failed report B close the backup batch with one success and one failure', { timeout: 3_000 }, async () => {
  const batchId = randomUUID();
  const configBackup = {
    batchId, type: 'config_backup_now', status: 'running', retryCount: 1, payloadJson: {},
  };
  const a = command(configBackup);
  const b = command({ ...configBackup, nodeId: '10000000-0000-4000-8000-000000000002' });
  const { db, state } = fixture([a, b], { rollback: true });
  state.node.agentVersion = '0.5.36';
  const batch = { id: batchId, status: 'running', succeededCount: 0, failedCount: 0 };
  state.batches.push(batch);

  const started = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const records = [];
  const uploadLockOrder = [];
  db.$queryRaw = async (query, id) => {
    const sql = query.join('?');
    if (sql.includes('FROM nodes ')) {
      assert.equal(id, a.nodeId);
      uploadLockOrder.push('node');
    } else if (sql.includes('FROM node_commands ')) {
      assert.equal(id, a.id);
      uploadLockOrder.push('command');
    } else {
      assert.match(sql, /FROM job_batches[\s\S]*FOR NO KEY UPDATE/);
      assert.equal(id, batchId);
      if (state.commands[0].status === 'succeeded') {
        assert.ok(state.audit.some((entry) => entry.targetId === a.id &&
          entry.action === 'backup.config.request_succeeded'));
        uploadLockOrder.push('batch');
      }
    }
    return [{ id }];
  };
  db.nodeCredential = { update: async () => {} };
  db.nodeConfigBackup = {
    findFirst: async () => null,
    create: async ({ data }) => {
      const backup = { id: randomUUID(), ...data };
      records.push(backup);
      return backup;
    },
  };
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const storage = {
    sha256Hex: sha256,
    buildStoragePath: () => ({ absolutePath: '/synthetic/artifact.enc', relativePath: 'artifact.enc' }),
    encryptToFile: async () => {
      started.resolve();
      await resume.promise;
    },
    removeFile: async () => {},
  };
  const nodeCommands = new NodeCommandsService(db, { processAfterBackupSuccess: async () => {} });
  const backupCommands = new BackupsCommandService(db, nodeCommands);
  const ingest = new BackupsIngestService(db, {
    authenticateNodeRequest: async () => ({
      node: state.node, headerNodeUid: 'synthetic', credential: { id: userId },
    }),
  }, storage, { enforceRetention: async () => [] }, backupCommands, { evaluateStoredBackup: async () => {} });

  const xml = Buffer.from('<pfsense><synthetic/></pfsense>');
  const upload = ingest.ingestConfigBackup({
    rawBody: xml,
    headerCommandId: a.id,
    headerCommandDeliveryAttempt: '1',
    headerConfigSize: String(xml.length),
    headerConfigSha256: sha256(xml),
    headerBackupId: randomUUID(),
  });
  try {
    await Promise.race([started.promise, upload]);
    const failure = await nodeCommands.reportCommandResult({
      nodeId: b.nodeId, credentialId: userId, commandId: b.id, deliveryAttempt: 1,
      status: 'failed', errorMessage: 'synthetic peer failure',
    });
    assert.equal(failure.status, 'failed');
    assert.equal(batch.status, 'running');
    assert.equal(batch.failedCount, 1);
  } finally {
    resume.resolve();
  }

  const receipt = await upload;
  assert.deepEqual(uploadLockOrder, ['node', 'command', 'batch']);
  assert.equal(batch.status, 'failed');
  assert.equal(batch.succeededCount, 1);
  assert.equal(batch.failedCount, 1);
  assert.ok(batch.completedAt instanceof Date);
  assert.equal(records.length, 1);
  assert.equal(receipt.backup_id, records[0].backupUid);
  assert.equal(state.commands[0].resultJson.backup_uid, receipt.backup_id);

  const lateReport = await nodeCommands.reportCommandResult({
    nodeId: a.nodeId, credentialId: userId, commandId: a.id, deliveryAttempt: 1,
    status: 'failed', errorMessage: 'synthetic timeout after commit',
  });
  assert.equal(lateReport.status, 'succeeded');
  assert.equal(state.commands[0].resultJson.backup_uid, receipt.backup_id);
  assert.equal(batch.succeededCount, 1);
});
