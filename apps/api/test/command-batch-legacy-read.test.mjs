import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { command } from './command-test-fixtures.mjs';

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
let CommandOrchestratorService;
try {
  ({ CommandOrchestratorService } = require('../src/commands/command-orchestrator.service.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

const id = '30000000-0000-4000-8000-000000000001';
const requestedAt = new Date('2026-01-01T00:00:00.000Z');
const early = new Date('2026-01-01T00:00:01.000Z');
const late = new Date('2026-01-01T00:00:02.000Z');
const item = (status, completedAt = null) => command({ batchId: id, type: 'config_backup_now', status, completedAt });

function storedBatch(status, commands, overrides = {}) {
  return {
    id, status, commands, requestedAt, label: 'Synthetic batch', commandType: 'config_backup_now',
    completedAt: null, totalCount: 3, succeededCount: 0, failedCount: 1, cancelledCount: 0, expiredCount: 0,
    ...overrides,
  };
}

function readBatch(batch) {
  const db = {
    $transaction: async () => assert.fail('legacy batch query must use only the existing read'),
    jobBatch: {
      findUnique: async ({ where }) => {
        assert.deepEqual(where, { id });
        return batch;
      },
      update: async () => assert.fail('legacy batch query must not update the batch'),
    },
  };
  return new CommandOrchestratorService(db).getBatchStatus(id);
}

test('legacy running batch projects both terminal failures and the latest recorded completion', async () => {
  const record = storedBatch('running', [item('failed', late), item('failed', early)]);
  const persistedBeforeRead = structuredClone(record);
  const { batch, nodes } = await readBatch(record);
  assert.deepEqual(batch, {
    batch_id: id, command_type: 'config_backup_now', label: 'Synthetic batch',
    requested_at: requestedAt.toISOString(), total_count: 3,
    status: 'failed', completed_at: late.toISOString(),
    succeeded_count: 0, failed_count: 2, cancelled_count: 0, expired_count: 0,
  });
  assert.deepEqual(nodes.map(({ command_id, status }) => [command_id, status]),
    record.commands.map((entry) => [entry.id, entry.status]));
  assert.deepEqual((await readBatch(record)).batch, batch);
  assert.deepEqual(record, persistedBeforeRead);
});

test('legacy pending batch uses null if no command completion has been recorded', async () => {
  const record = storedBatch('pending', [item('cancelled'), item('expired')], { completedAt: early });
  const { batch } = await readBatch(record);
  assert.equal(batch.status, 'completed');
  assert.equal(batch.completed_at, null);
  assert.equal(batch.cancelled_count, 1);
  assert.equal(batch.expired_count, 1);
});

test('legacy projection keeps persisted values for open batches with active commands, empty batches and terminal batches', async () => {
  for (const record of [
    storedBatch('running', [item('failed', late), item('pending')], { failedCount: 0 }),
    storedBatch('pending', [item('picked_up')]),
    storedBatch('running', [item('running')]),
    storedBatch('pending', []),
    storedBatch('failed', [], { completedAt: early }),
    storedBatch('failed', [item('succeeded', late)], { completedAt: early }),
  ]) {
    const { batch } = await readBatch(record);
    assert.equal(batch.status, record.status);
    assert.equal(batch.failed_count, record.failedCount);
    assert.equal(batch.succeeded_count, record.succeededCount);
    assert.equal(batch.completed_at, record.completedAt?.toISOString() ?? null);
  }
});


test('a failed legacy batch with an active retry projects running without persisting a change', async () => {
  for (const status of ['pending', 'picked_up', 'running']) {
    const retry = { ...item(status), retryCount: 1 };
    const record = storedBatch('failed', [retry, item('succeeded', early)], { completedAt: early });
    const persistedBeforeRead = structuredClone(record);
    const { batch, nodes } = await readBatch(record);

    assert.equal(batch.status, 'running', status);
    assert.equal(batch.completed_at, null);
    assert.equal(batch.failed_count, 0);
    assert.equal(batch.succeeded_count, 1);
    assert.equal(nodes[0].status, status);
    assert.deepEqual(record, persistedBeforeRead);
  }
});
