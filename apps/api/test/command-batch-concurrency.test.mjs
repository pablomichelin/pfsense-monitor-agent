import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { command, fixture, userId } from './command-test-fixtures.mjs';

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
let NodeCommandsService, CommandOrchestratorService;
try {
  ({ NodeCommandsService } = require('../src/node-commands/node-commands.service.ts'));
  ({ CommandOrchestratorService } = require('../src/commands/command-orchestrator.service.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

const batchId = '30000000-0000-4000-8000-000000000001';
const batchCommand = (overrides = {}) => command({
  batchId, type: 'table_search', status: 'running', payloadJson: {}, ...overrides,
});

// Model Read Committed: each read sees committed rows and local writes. An
// implicit lock at UPDATE serializes writes, but cannot refresh a prior read.
function batchFixture(rows, { overlap = false } = {}) {
  const state = {
    rows: new Map(rows.map((row) => [row.id, structuredClone(row)])),
    summary: { status: 'running', completedAt: null },
    snapshots: [], events: [],
  };
  const secondWaiting = Promise.withResolvers();
  const queue = [];
  let owner;

  async function lockBatch(tx) {
    if (owner === tx) return;
    if (!owner) {
      owner = tx;
      return;
    }
    const waiting = Promise.withResolvers();
    queue.push({ tx, resume: waiting.resolve });
    secondWaiting.resolve();
    await waiting.promise;
  }

  const db = {
    $transaction: async (work) => {
      const writes = new Map();
      let summary;
      const read = (id) => structuredClone(writes.get(id) ?? state.rows.get(id) ?? null);
      const tx = {
        $queryRaw: async (sql, id) => {
          assert.equal(id, batchId);
          assert.match(sql.join('?'), /FROM job_batches[\s\S]*FOR NO KEY UPDATE/);
          await lockBatch(tx);
          state.events.push('lock');
          return [{ id }];
        },
        node: { findUnique: async () => ({ agentVersion: '0.5.35' }) },
        nodeCommand: {
          findFirst: async ({ where }) => {
            const row = read(where.id);
            return row?.nodeId === where.nodeId ? row : null;
          },
          findUnique: async ({ where }) => read(where.id),
          findMany: async ({ where, select }) => {
            assert.deepEqual(where, { batchId });
            assert.deepEqual(select, { status: true });
            const snapshot = [...state.rows.keys()].map((id) => ({ status: read(id).status }));
            state.snapshots.push(snapshot.map(({ status }) => status));
            state.events.push('count');
            return snapshot;
          },
          updateMany: async ({ where, data }) => {
            const row = read(where.id);
            const matches = typeof where.status === 'string'
              ? row.status === where.status
              : where.status.in.includes(row.status);
            if (!matches) return { count: 0 };
            writes.set(row.id, { ...row, ...data });
            return { count: 1 };
          },
          update: async ({ where, data }) => {
            writes.set(where.id, { ...read(where.id), ...data });
          },
        },
        auditLog: { create: async () => {} },
        jobBatch: { update: async ({ where, data }) => {
          assert.equal(where.id, batchId);
          await lockBatch(tx);
          if (overlap) await secondWaiting.promise;
          state.events.push('write');
          summary = data;
        } },
      };
      try {
        const result = await work(tx);
        for (const [id, row] of writes) state.rows.set(id, row);
        if (summary) state.summary = summary;
        return result;
      } finally {
        if (owner === tx) {
          const next = queue.shift();
          owner = next?.tx;
          next?.resume();
        }
      }
    },
  };
  const service = new NodeCommandsService(db, {});
  const report = (row, status) => service.reportCommandResult({
    nodeId: row.nodeId, credentialId: userId, commandId: row.id,
    deliveryAttempt: row.retryCount, status,
  });
  return { db, state, report };
}

test('concurrent results publish both terminal commands in the batch summary', { timeout: 2_000 }, async () => {
  const first = batchCommand();
  const second = batchCommand({ nodeId: '10000000-0000-4000-8000-000000000002' });
  const { state, report } = batchFixture([first, second], { overlap: true });
  const results = await Promise.all([report(first, 'succeeded'), report(second, 'failed')]);
  assert.deepEqual(results.map(({ status }) => status), ['succeeded', 'failed']);
  assert.equal(state.summary.status, 'failed', JSON.stringify(state.snapshots));
  assert.equal(state.summary.succeededCount, 1);
  assert.equal(state.summary.failedCount, 1);
  assert.ok(state.summary.completedAt instanceof Date);
  assert.deepEqual(state.events, ['lock', 'count', 'write', 'lock', 'count', 'write']);
});

test('standalone reconciler keeps the existing cancelled and expired accounting', async () => {
  const { db, state } = batchFixture([batchCommand({ status: 'cancelled' }), batchCommand({ status: 'expired' })]);
  await new CommandOrchestratorService(db).reconcileBatchStatus(batchId);
  assert.equal(state.summary.status, 'completed');
  assert.equal(state.summary.cancelledCount, 1);
  assert.equal(state.summary.expiredCount, 1);
  assert.ok(state.summary.completedAt instanceof Date);
  assert.deepEqual(state.events, ['lock', 'count', 'write']);
});

test('a batch still has an active status when a command is pending', async () => {
  const { db, state } = batchFixture([batchCommand({ status: 'failed' }), batchCommand({ status: 'pending' })]);
  await new CommandOrchestratorService(db).reconcileBatchStatus(batchId);
  assert.equal(state.summary.status, 'running');
  assert.equal(state.summary.failedCount, 1);
  assert.equal(state.summary.completedAt, null);
  assert.deepEqual(state.events, ['lock', 'count', 'write']);
});


test('cancellation rolls back the command and audit if batch reconciliation fails', async () => {
  const row = batchCommand({ status: 'pending' });
  const { db, state } = fixture([row], { rollback: true });
  db.jobBatch.update = async () => { throw new Error('synthetic batch update failure'); };
  const orchestrator = new CommandOrchestratorService(db);

  await assert.rejects(orchestrator.cancelCommand({
    nodeId: row.nodeId, commandId: row.id, cancelledByUserId: userId,
  }), /synthetic batch update failure/);

  assert.equal(state.commands[0].status, 'pending');
  assert.equal(state.commands[0].completedAt, null);
  assert.deepEqual(state.audit, []);
});

test('expiry updates the command before locking and counting the batch in the same transaction', async () => {
  const row = batchCommand({ expiresAt: new Date(Date.now() - 1_000) });
  const peer = batchCommand({ status: 'pending' });
  const { db, state, hooks } = fixture([row, peer], { rollback: true });
  state.batches.push({ id: batchId, status: 'running', expiredCount: 0, completedAt: null });
  const events = [];
  let transactionCount = 0;
  const transaction = db.$transaction;
  db.$transaction = (work) => {
    transactionCount += 1;
    return transaction(work);
  };
  hooks.beforeUpdate = ({ data }) => {
    if (data.status === 'expired') events.push(['command', transactionCount]);
  };
  db.$queryRaw = async (sql, id) => {
    assert.equal(id, batchId);
    assert.match(sql.join('?'), /FROM job_batches[\s\S]*FOR NO KEY UPDATE/);
    events.push(['batch', transactionCount]);
    return [{ id }];
  };
  const findMany = db.nodeCommand.findMany;
  db.nodeCommand.findMany = (query) => {
    if (query.where.batchId) events.push(['count', transactionCount]);
    return findMany(query);
  };

  await new NodeCommandsService(db, {}).expireStaleCommands('interval');

  assert.deepEqual(events, [['command', 1], ['batch', 1], ['count', 1]]);
  assert.equal(state.commands[0].status, 'expired');
  assert.equal(state.commands[1].status, 'pending');
  assert.equal(state.batches[0].status, 'running');
  assert.equal(state.batches[0].expiredCount, 1);
  assert.equal(state.batches[0].completedAt, null);
});

test('expiry rolls back after batch write failure and the next scan can complete it', async () => {
  const row = batchCommand({ status: 'pending', expiresAt: new Date(Date.now() - 1_000) });
  const { db, state } = fixture([row], { rollback: true });
  state.batches.push({ id: batchId, status: 'running', expiredCount: 0, completedAt: null });
  db.$queryRaw = async () => [{ id: batchId }];
  const updateBatch = db.jobBatch.update;
  db.jobBatch.update = async () => { throw new Error('synthetic batch update failure'); };
  const service = new NodeCommandsService(db, {});

  await assert.rejects(service.expireStaleCommands('interval'), /synthetic batch update failure/);
  assert.equal(state.commands[0].status, 'pending');
  assert.equal(state.commands[0].completedAt, null);
  assert.deepEqual(state.audit, []);
  assert.equal(state.batches[0].expiredCount, 0);

  db.jobBatch.update = updateBatch;
  await service.expireStaleCommands('interval');
  assert.equal(state.commands[0].status, 'expired');
  assert.equal(state.audit.length, 1);
  assert.equal(state.batches[0].status, 'completed');
  assert.equal(state.batches[0].expiredCount, 1);
  assert.ok(state.batches[0].completedAt instanceof Date);
});

test('expiry skips batch aggregation when another command transition wins', async () => {
  const row = batchCommand({ expiresAt: new Date(Date.now() - 1_000) });
  const { db, state, hooks } = fixture([row], { rollback: true });
  hooks.afterFindMany = () => {
    state.commands[0].status = 'succeeded';
    delete hooks.afterFindMany;
  };
  db.$queryRaw = async () => assert.fail('lost expiry CAS must not lock batch');

  await new NodeCommandsService(db, {}).expireStaleCommands('interval');

  assert.equal(state.commands[0].status, 'succeeded');
  assert.deepEqual(state.audit, []);
});
