import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { command, fixture, nodeId } from './command-test-fixtures.mjs';

process.env.COMMAND_WORKER_ENABLED = 'true';
process.env.PACKAGE_UPGRADE_MAX_CONCURRENT = '3';
process.env.CONFIG_BACKUP_COMMAND_RETRY_BACKOFF_MS_1 = '30000';

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
let CommandWorkerService, CommandOrchestratorService;
try {
  ({ CommandWorkerService } = require('../src/commands/command-worker.service.ts'));
  ({ CommandOrchestratorService } = require('../src/commands/command-orchestrator.service.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

const batchId = '30000000-0000-4000-8000-000000000001';
const otherBatchId = '30000000-0000-4000-8000-000000000002';
const completedAt = new Date('2026-01-01T00:00:00Z');

function workerFixture({ overrides = {}, includeOtherBatch = false, failBatchWrite = false } = {}) {
  const failed = command({
    batchId, type: 'config_backup_now', status: 'failed', maxRetries: 1,
    runningAt: completedAt, pickedUpAt: completedAt, completedAt,
    expiresAt: new Date(Date.now() + 3_600_000), errorMessage: 'synthetic failure',
    resultJson: { marker: 'synthetic' }, payloadJson: { fixture: 'keep' }, ...overrides,
  });
  const succeeded = command({ batchId, type: 'config_backup_now', status: 'succeeded' });
  const rows = [failed, succeeded];
  if (includeOtherBatch) rows.push(command({ batchId: otherBatchId, type: 'config_backup_now' }));
  const { db, state, hooks } = fixture(rows, { rollback: true });
  state.batches.push({ id: batchId, status: 'failed', succeededCount: 1, failedCount: 1, completedAt });
  if (includeOtherBatch) state.batches.push({ id: otherBatchId, status: 'running' });
  const events = [];
  let inTransaction = false;
  const transaction = db.$transaction;
  db.$transaction = (run) => transaction(async (tx) => {
    assert.equal(inTransaction, false);
    inTransaction = true;
    try { return await run(tx); }
    finally { inTransaction = false; }
  });
  hooks.beforeUpdate = async ({ data }) => {
    if (data.status === 'pending') events.push(['retry CAS', failed.id, inTransaction]);
  };
  db.$queryRaw = async (sql, id) => {
    assert.match(sql.join('?'), /FROM job_batches[\s\S]*FOR NO KEY UPDATE/);
    assert.equal(inTransaction, true);
    events.push(['batch lock', id, inTransaction]);
    return [{ id }];
  };
  db.jobBatch.findMany = async ({ where }) => {
    assert.equal(inTransaction, false);
    return state.batches.filter(({ id, status }) =>
      where.status.in.includes(status) && !where.id?.notIn.includes(id));
  };
  const updateBatch = db.jobBatch.update;
  db.jobBatch.update = async (input) => {
    assert.equal(inTransaction, true);
    events.push(['batch update', input.where.id, inTransaction]);
    if (failBatchWrite) throw new Error('synthetic batch write failure');
    return updateBatch(input);
  };
  const createAudit = db.auditLog.create;
  db.auditLog.create = async (input) => {
    events.push(['audit', input.data.targetId, inTransaction]);
    return createAudit(input);
  };
  const worker = new CommandWorkerService(db, {
    tryAcquire: async () => true,
    release: async () => {},
  }, new CommandOrchestratorService(db));
  return { state, hooks, events, worker, failed };
}

test('worker reopens a terminal batch only once in the cycle that schedules its retry', async () => {
  const { state, events, worker, failed } = workerFixture({ includeOtherBatch: true });
  const startedAt = Date.now();
  await worker.runCycle('manual');
  const endedAt = Date.now();
  const [retried] = state.commands;
  assert.equal(retried.status, 'pending');
  assert.equal(state.batches[0].status, 'running');
  assert.equal(state.batches[0].failedCount, 0);
  assert.equal(state.batches[0].succeededCount, 1);
  assert.equal(state.batches[0].completedAt, null);
  assert.equal(retried.retryCount, 1);
  assert.equal(retried.maxRetries, failed.maxRetries);
  assert.ok(retried.nextRetryAt.getTime() >= startedAt + 30_000);
  assert.ok(retried.nextRetryAt.getTime() <= endedAt + 30_000);
  assert.equal(retried.completedAt, null);
  assert.deepEqual(retried.resultJson, { marker: 'synthetic', retry_scheduled: true, retry_attempt: 1 });
  assert.deepEqual(retried.payloadJson, failed.payloadJson);
  assert.deepEqual(state.audit, [{
    actorType: 'system', action: 'backup.config.request_retry_scheduled',
    targetType: 'node_command', targetId: failed.id,
    metadataJson: { node_id: nodeId, retry_count: 1, next_retry_at: retried.nextRetryAt.toISOString() },
  }]);
  assert.deepEqual(events, [
    ['retry CAS', failed.id, true], ['audit', failed.id, true],
    ['batch lock', batchId, true], ['batch update', batchId, true],
    ['batch lock', otherBatchId, true], ['batch update', otherBatchId, true],
  ]);
});

test('worker leaves a terminal batch intact when the command used its retry budget', async () => {
  const { state, events, worker } = workerFixture({ overrides: { retryCount: 1, maxRetries: 1 } });
  const previous = structuredClone(state);
  await worker.runCycle('manual');
  assert.deepEqual(state, previous);
  assert.deepEqual(events, []);
});

test('worker CAS loser performs no audit or batch update', async () => {
  const { state, hooks, events, worker, failed } = workerFixture();
  const before = hooks.beforeUpdate;
  hooks.beforeUpdate = async (input) => {
    await before(input);
    state.commands[0].status = 'cancelled';
  };
  await worker.runCycle('manual');
  assert.equal(state.commands[0].status, 'cancelled');
  assert.equal(state.commands[0].retryCount, failed.retryCount);
  assert.deepEqual(state.audit, []);
  assert.deepEqual(events, [['retry CAS', failed.id, true]]);
});

test('worker rolls back the retry and audit when the batch write fails', async () => {
  const { state, worker } = workerFixture({ failBatchWrite: true });
  const previous = structuredClone(state);
  await assert.rejects(worker.processRetries(), { message: 'synthetic batch write failure' });
  assert.deepEqual(state, previous);
});

test('worker schedules the eligible failure after fifty older blocked failures', async () => {
  const retryable = {
    type: 'config_backup_now',
    status: 'failed',
    maxRetries: 1,
    payloadJson: {},
    expiresAt: new Date(Date.now() + 3_600_000),
  };
  const eligible = command({ ...retryable, completedAt, resultJson: { retry_exhausted: false } });
  const older = new Date(completedAt.getTime() - 1_000);
  const blockers = [
    { count: 20, retryCount: 1 },
    { count: 15, resultJson: { retry_exhausted: true } },
    { count: 15, resultJson: { retry_scheduled: true } },
  ].flatMap(({ count, ...overrides }) => Array.from({ length: count }, () =>
    command({ ...retryable, completedAt: older, ...overrides })));

  const { db, state } = fixture([eligible, ...blockers], { rollback: true });
  await new CommandWorkerService(db, {}, {}).processRetries();

  assert.equal(state.commands[0].status, 'pending');
  assert.equal(state.commands[0].retryCount, 1);
  assert.deepEqual(state.commands.slice(1), blockers);
  assert.equal(state.audit.length, 1);
  assert.equal(state.audit[0].targetId, eligible.id);
  assert.equal(state.audit[0].action, 'backup.config.request_retry_scheduled');
});

test('worker frees a capacity-deferred upgrade without bypassing a retry backoff', async ({ mock }) => {
  const now = Date.now();
  mock.timers.enable({ apis: ['Date'], now });
  const retryAt = new Date(now + 180_000);
  const queued = {
    type: 'package_upgrade', status: 'pending', expiresAt: new Date(now + 600_000),
  };
  const retry = command({ ...queued, nextRetryAt: retryAt, retryCount: 1, resultJson: { retry_scheduled: true } });
  const deferred = command({ ...queued, nextRetryAt: new Date(now + 30_000) });
  const expired = command({ ...queued, nextRetryAt: new Date(now + 30_000), expiresAt: new Date(now - 1) });
  const { db, state } = fixture([retry, deferred, expired]);

  await new CommandWorkerService(db, {}, {}).processDeferredCommands();

  assert.deepEqual(state.commands.map((row) => row.nextRetryAt), [retryAt, new Date(now), expired.nextRetryAt]);
});

test('worker preserves a changed deferral when another writer updates it after selection', async () => {
  const now = Date.now();
  const later = new Date(now + 90_000);
  const deferred = command({ type: 'package_upgrade', nextRetryAt: new Date(now + 30_000) });
  const { db, state, hooks } = fixture([deferred]);
  hooks.beforeUpdate = async () => { state.commands[0].nextRetryAt = later; };

  await new CommandWorkerService(db, {}, {}).processDeferredCommands();

  assert.deepEqual(state.commands[0].nextRetryAt, later);
});

test('one worker instance keeps a slow cycle exclusive until its lease is released', async () => {
  const { db } = fixture();
  let enterCycle;
  let releaseCycle;
  const entered = new Promise((resolve) => { enterCycle = resolve; });
  const blocked = new Promise((resolve) => { releaseCycle = resolve; });
  let cycles = 0;
  db.jobBatch.findMany = async () => {
    cycles += 1;
    if (cycles === 1) {
      enterCycle();
      await blocked;
    }
    return [];
  };

  const events = [];
  const worker = new CommandWorkerService(db, {
    tryAcquire: async () => { events.push('acquire'); return true; },
    release: async () => { events.push('release'); },
  }, {});
  const first = worker.runCycle('startup');
  await entered;
  await worker.runCycle('interval');
  const duringFirstCycle = [...events];
  releaseCycle();
  await first;
  await worker.runCycle('manual');

  assert.deepEqual(duringFirstCycle, ['acquire']);
  assert.deepEqual(events, ['acquire', 'release', 'acquire', 'release']);
  assert.equal(cycles, 2);
});
