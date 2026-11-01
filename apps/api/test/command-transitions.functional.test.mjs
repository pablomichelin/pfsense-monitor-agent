import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeCommandsService } from '../dist/node-commands/node-commands.service.js';
import { CommandOrchestratorService } from '../dist/commands/command-orchestrator.service.js';
import { CommandWorkerService } from '../dist/commands/command-worker.service.js';
import { fixture, command, nodeId, userId } from './command-test-fixtures.mjs';

const input = (row, status = 'succeeded') => ({ nodeId, credentialId: 'credential', commandId: row.id, status });
const service = (db, followUp = { processAfterBackupSuccess: async () => {} }) => new NodeCommandsService(db, followUp);
const cancelInput = (row) => ({ nodeId, commandId: row.id, cancelledByUserId: userId });

for (const result of ['succeeded', 'failed']) {
  test(`cancel wins over concurrent ${result} without account or duplicate audit writes`, async () => {
    const row = command(); const { db, state, hooks } = fixture([row]);
    const orchestrator = new CommandOrchestratorService(db);
    hooks.beforeUpdate = async ({ data }) => {
      if (data.status !== result) return;
      delete hooks.beforeUpdate;
      await orchestrator.cancelCommand(cancelInput(row));
    };
    assert.equal((await service(db).reportCommandResult(input(row, result))).status, 'cancelled');
    assert.equal(state.commands[0].status, 'cancelled');
    assert.equal(state.accountWrites.length, 0);
    assert.deepEqual(state.audit.map((entry) => entry.action), ['technician.password_reset.request_cancelled']);
  });
}

test('result wins over cancellation: cancellation reports conflict without overwriting result', async () => {
  const row = command(); const { db, state, hooks } = fixture([row]);
  hooks.beforeUpdate = async ({ data }) => {
    if (data.status !== 'cancelled') return;
    delete hooks.beforeUpdate;
    await service(db).reportCommandResult(input(row));
  };
  await assert.rejects(new CommandOrchestratorService(db).cancelCommand(cancelInput(row)), /state changed/);
  assert.equal(state.commands[0].status, 'succeeded');
  assert.equal(state.account.status, 'active');
  assert.equal(state.audit.length, 1);
});

test('two simultaneous opposite results reconcile exactly one account transition', async () => {
  const row = command(); const { db, state, hooks } = fixture([row]);
  hooks.beforeUpdate = async ({ data }) => {
    if (data.status !== 'succeeded') return;
    delete hooks.beforeUpdate;
    await service(db).reportCommandResult(input(row, 'failed'));
  };
  assert.equal((await service(db).reportCommandResult(input(row))).status, 'failed');
  assert.equal(state.account.status, 'failed');
  assert.equal(state.audit.length, 1);
  assert.equal(state.accountWrites.length, 1);
});

test('expiry CAS loser does not fail an account whose command was cancelled concurrently', async () => {
  const row = command({ expiresAt: new Date(Date.now() - 1) });
  const { db, state, hooks } = fixture([row]);
  hooks.afterFindMany = async () => {
    delete hooks.afterFindMany;
    await new CommandOrchestratorService(db).cancelCommand(cancelInput(row));
  };
  await service(db).expireStaleCommands('interval');
  assert.equal(state.commands[0].status, 'cancelled');
  assert.equal(state.accountWrites.length, 0);
  assert.equal(state.audit.length, 1);
});

test('stale expiry snapshot does not overwrite a completed result or scrub newer payload', async () => {
  const row = command({ expiresAt: new Date(Date.now() - 1) });
  const { db, state, hooks } = fixture([row]);
  hooks.afterFindMany = async () => {
    delete hooks.afterFindMany;
    Object.assign(state.commands[0], { status: 'succeeded', payloadJson: { marker: 'newer' } });
    state.account.status = 'active';
  };
  await service(db).expireStaleCommands('interval');
  assert.equal(state.commands[0].status, 'succeeded');
  assert.deepEqual(state.commands[0].payloadJson, { marker: 'newer' });
  assert.equal(state.account.status, 'active');
  assert.equal(state.audit.length, 0);
});

test('late results also use CAS: opposite late result wins once', async () => {
  const row = command({ status: 'expired', expiresAt: new Date(Date.now() - 1000), completedAt: new Date() });
  const { db, state, hooks } = fixture([row]);
  hooks.beforeUpdate = async ({ data }) => {
    if (data.status !== 'succeeded') return;
    delete hooks.beforeUpdate;
    await service(db).reportCommandResult(input(row, 'failed'));
  };
  assert.equal((await service(db).reportCommandResult(input(row))).status, 'failed');
  assert.equal(state.accountWrites.length, 1);
  assert.equal(state.audit.length, 1);
});

test('historical late result cannot change the account owned by a newer command', async () => {
  const row = command({ status: 'expired', completedAt: new Date() });
  const { db, state } = fixture([row]);
  state.account.lastCommandId = 'new-command'; state.account.status = 'password_reset_pending';
  await service(db).reportCommandResult(input(row));
  assert.equal(state.account.status, 'password_reset_pending');
});

test('backup follow-up runs once after winning result commits', async () => {
  const row = command({ type: 'config_backup_now' }); const { db, state, hooks } = fixture([row]);
  let calls = 0;
  const svc = service(db, { processAfterBackupSuccess: async () => { calls += 1; } });
  hooks.beforeUpdate = async () => { delete hooks.beforeUpdate; await svc.reportCommandResult(input(row)); };
  await svc.reportCommandResult(input(row));
  assert.equal(calls, 1); assert.equal(state.audit.length, 1);
});

test('retry worker cannot overwrite cancellation from a stale failed snapshot', async () => {
  const row = command({ status: 'failed', maxRetries: 1, type: 'config_backup_now', expiresAt: new Date(Date.now() + 3600_000) });
  const { db, state, hooks } = fixture([row]);
  hooks.beforeUpdate = async () => { delete hooks.beforeUpdate; state.commands[0].status = 'cancelled'; };
  await new CommandWorkerService(db, {}, {}).processRetries();
  assert.equal(state.commands[0].status, 'cancelled');
  assert.equal(state.commands[0].retryCount, 0);
  assert.equal(state.audit.length, 0);
});
