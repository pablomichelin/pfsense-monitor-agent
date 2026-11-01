import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandOrchestratorService } from '../dist/commands/command-orchestrator.service.js';
import { OperationalActionsService } from '../dist/operational-actions/operational-actions.service.js';
import { NodeCommandsService, toAgentCommandPayload } from '../dist/node-commands/node-commands.service.js';
import { getCommandDefinition } from '../dist/commands/command-registry.js';
import { appConfig } from '../dist/config/app-config.js';
import { fixture, command, nodeId, userId } from './command-test-fixtures.mjs';

appConfig.operationalActions.enabled = true;
appConfig.operationalActions.nodeRebootEnabled = true;
const reboot = (db) => new OperationalActionsService(db, new CommandOrchestratorService(db));
const resultService = (db) => new NodeCommandsService(db, { processAfterBackupSuccess: async () => {} });
const rebootPayload = { delay_seconds: 60, maintenance_mode_before: false, maintenance_mode_toggled: true };

for (const type of ['local_user_create', 'local_user_set_password', 'config_backup_now']) {
  test(`${type}: fixed idempotency key never silently aliases a new secret to an active command`, async () => {
    const payload = type === 'config_backup_now'
      ? { follow_up_technician_provision: { password: 'Synthetic-new-pass!' } }
      : { pfsense_username: 'synthetic', password: 'Synthetic-new-pass!', technician_id: userId };
    const row = command({ type, idempotencyKey: 'fixed-prefix', payloadJson: payload });
    const { db, state } = fixture([row]); const svc = new CommandOrchestratorService(db);
    await assert.rejects(svc.enqueueCommand({ nodeId, type, payloadJson: payload, idempotencyKey: 'fixed-prefix' }), /already exists/);
    state.commands[0].status = 'succeeded';
    const next = await svc.enqueueCommand({ nodeId, type, payloadJson: payload, idempotencyKey: 'fixed-prefix' });
    assert.notEqual(next.id, row.id);
    assert.equal(next.idempotencyKey, undefined);
    assert.equal(state.commands.length, 2);
  });
}

test('non-secret command retains active-request deduplication', async () => {
  const row = command({ type: 'service_restart', idempotencyKey: 'request-id', payloadJson: { service: 'unbound' } });
  const { db, state } = fixture([row]);
  const existing = await new CommandOrchestratorService(db).enqueueCommand({ nodeId, type: row.type, idempotencyKey: 'request-id', payloadJson: row.payloadJson });
  assert.equal(existing.id, row.id); assert.equal(state.commands.length, 1);
});

test('default consecutive password batches generate new commands without password-derived keys', async () => {
  const { db, state } = fixture(); const svc = new CommandOrchestratorService(db);
  const request = (password) => ({ commandType: 'local_user_set_password', nodeIds: [nodeId], requestedByUserId: userId, payloadByNode: { [nodeId]: { pfsense_username: 'synthetic', password } } });
  await svc.createBatch(request('Synthetic-first-pass!'));
  state.commands[0].status = 'succeeded';
  await svc.createBatch(request('Synthetic-second-pass!'));
  assert.equal(state.commands.length, 2);
  assert.notEqual(state.commands[0].batchId, state.commands[1].batchId);
  assert.ok(state.commands.every((row) => row.idempotencyKey === undefined));
  assert.equal(state.commands[1].payloadJson.password, 'Synthetic-second-pass!');
});

test('enqueue failure rolls maintenance back together with the command', async () => {
  const { db, state, hooks } = fixture([], { rollback: true });
  hooks.beforeCreate = async () => { throw new Error('synthetic enqueue failure'); };
  await assert.rejects(reboot(db).requestNodeReboot(nodeId, userId, { confirm_hostname: 'synthetic-fw' }), /enqueue failure/);
  assert.equal(state.node.maintenanceMode, false);
  assert.equal(state.commands.length, 0);
  assert.equal(state.audit.length, 0);
});

test('enqueue conflict restores the previous state and leaves the preexisting command intact', async () => {
  const old = command({ type: 'node_reboot', payloadJson: rebootPayload });
  const { db, state } = fixture([old], { rollback: true });
  await assert.rejects(reboot(db).requestNodeReboot(nodeId, userId, { confirm_hostname: 'synthetic-fw' }), /already exists/);
  assert.equal(state.node.maintenanceMode, false);
  assert.equal(state.commands[0].id, old.id);
});

test('reboot metadata survives enqueue normalization but is excluded from agent payload', async () => {
  const { db, state } = fixture();
  await reboot(db).requestNodeReboot(nodeId, userId, { confirm_hostname: 'synthetic-fw' });
  const row = state.commands[0];
  assert.equal(state.node.maintenanceMode, true);
  assert.equal(row.payloadJson.maintenance_mode_toggled, true);
  assert.equal(row.payloadJson.maintenance_mode_before, false);
  assert.deepEqual(toAgentCommandPayload(row.type, row.payloadJson), { delay_seconds: 60 });
  const upgrade = getCommandDefinition('pfsense_upgrade').validatePayload({ target_version: '2.8.1', ...rebootPayload });
  assert.equal(upgrade.maintenance_mode_toggled, true);
});

for (const terminal of ['failed', 'cancelled', 'expired']) {
  test(`reboot ${terminal} restores maintenance exactly once`, async () => {
    const { db, state } = fixture();
    const response = await reboot(db).requestNodeReboot(nodeId, userId, { confirm_hostname: 'synthetic-fw' });
    const svc = resultService(db);
    if (terminal === 'failed') await svc.reportCommandResult({ nodeId, commandId: response.command_id, credentialId: 'credential', status: 'failed' });
    if (terminal === 'cancelled') await new CommandOrchestratorService(db).cancelCommand({ nodeId, commandId: response.command_id, cancelledByUserId: userId });
    if (terminal === 'expired') {
      state.commands[0].expiresAt = new Date(Date.now() - 1000);
      await svc.expireStaleCommands('interval');
    }
    assert.equal(state.node.maintenanceMode, false);
    assert.equal(state.commands[0].status, terminal);
    assert.ok(state.commands[0].payloadJson.maintenance_restored_at);
    await svc.restoreMaintenanceModeIfNeeded(state.commands[0], new Date());
    assert.equal(state.nodeWrites.filter((write) => write.maintenanceMode === false).length, 1);
    assert.equal(state.audit.filter((entry) => entry.action === 'node.reboot.maintenance_restored').length, 1);
  });
}

test('failure preserves maintenance that was already enabled before the request', async () => {
  const { db, state } = fixture(); state.node.maintenanceMode = true;
  const response = await reboot(db).requestNodeReboot(nodeId, userId, { confirm_hostname: 'synthetic-fw' });
  await resultService(db).reportCommandResult({ nodeId, commandId: response.command_id, credentialId: 'credential', status: 'failed' });
  assert.equal(state.node.maintenanceMode, true);
  assert.equal(state.nodeWrites.length, 0);
});

test('successful scheduling keeps reboot maintenance for the reboot window', async () => {
  const { db, state } = fixture();
  const response = await reboot(db).requestNodeReboot(nodeId, userId, { confirm_hostname: 'synthetic-fw' });
  await resultService(db).reportCommandResult({ nodeId, commandId: response.command_id, credentialId: 'credential', status: 'succeeded' });
  assert.equal(state.node.maintenanceMode, true);
  assert.equal(state.commands[0].payloadJson.maintenance_restored_at, undefined);
});

test('expiry cannot compensate a reboot that a concurrent result already completed', async () => {
  const row = command({ type: 'node_reboot', expiresAt: new Date(Date.now() - 1), payloadJson: rebootPayload });
  const { db, state, hooks } = fixture([row]); state.node.maintenanceMode = true;
  hooks.afterFindMany = async () => { delete hooks.afterFindMany; state.commands[0].status = 'succeeded'; };
  await resultService(db).expireStaleCommands('interval');
  assert.equal(state.node.maintenanceMode, true);
  assert.equal(state.nodeWrites.length, 0);
});

test('HA rejection happens before maintenance or command writes', async () => {
  const { db, state } = fixture([], { rollback: true }); state.node.haRole = 'MASTER';
  await assert.rejects(reboot(db).requestNodeReboot(nodeId, userId, { confirm_hostname: 'synthetic-fw' }), /HA/);
  assert.equal(state.commands.length, 0); assert.equal(state.nodeWrites.length, 0);
});
