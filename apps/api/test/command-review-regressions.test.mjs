import './synthetic-env.mjs';
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { NodeCommandType } from '@prisma/client';
import { appConfig } from '../dist/config/app-config.js';
import { CommandBatchesController } from '../dist/commands/commands.controller.js';
import { CreateCommandBatchDto } from '../dist/commands/dto/commands.dto.js';
import { BackupsCommandService } from '../dist/backups/backups-command.service.js';
import { command, nodeId, userId } from './command-test-fixtures.mjs';

// New focused group. Compile with the parent's final candidate before running.
test('generic HTTP batches cannot bypass dedicated gates; backup batches keep permission and client scope', async () => {
  const calls = []; let resolvedClient = 'client-a'; let clientDenied = false; let permissionDenied = false;
  const controller = new CommandBatchesController({
    createBatch: async (input) => { calls.push(['enqueue', input]); return { accepted: true }; },
  }, {
    assertRequestedClientFilter: async (_actor, clientId) => {
      calls.push(['client', clientId]);
      if (clientDenied) throw new Error('client out of scope');
    },
    assertNodeAccess: async (_actor, id) => { calls.push(['node', id]); return resolvedClient; },
  }, {
    assertPermission: async (_role, permission) => {
      calls.push(['permission', permission]);
      if (permissionDenied) throw new Error('insufficient permission');
    },
  });
  const request = { auth: { userId, role: 'synthetic' }, headers: {}, ip: '127.0.0.1' };
  const body = { node_ids: [nodeId], client_id: 'client-a' };
  const before = appConfig.pfsenseUpgrade.enabled;
  try {
    for (const enabled of [false, true]) {
      appConfig.pfsenseUpgrade.enabled = enabled;
      for (const type of Object.values(NodeCommandType).filter((type) => type !== 'config_backup_now')) {
        // No payload and a smuggled payload must both go through the dedicated endpoint.
        for (const extras of [{}, { payload: { target_version: '2.8.1' } }]) {
          await assert.rejects(controller.createBatch({ ...body, command_type: type, ...extras }, request), /requires.*endpoint|requires POST/);
        }
        const dto = Object.assign(new CreateCommandBatchDto(), { node_ids: [nodeId], command_type: type });
        assert.ok((await validate(dto)).some((error) => error.property === 'command_type'));
      }
    }
    assert.deepEqual(calls, []);
    await controller.createBatch({ ...body, command_type: 'config_backup_now' }, request);
    assert.deepEqual(calls.slice(0, 3), [['permission', 'backups.run'], ['client', 'client-a'], ['node', nodeId]]);
    assert.equal(calls[3][1].clientId, 'client-a');
    for (const variant of ['wrong-client', 'scope-denied', 'permission-denied']) {
      calls.length = 0;
      resolvedClient = variant === 'wrong-client' ? 'client-b' : 'client-a';
      clientDenied = variant === 'scope-denied'; permissionDenied = variant === 'permission-denied';
      await assert.rejects(controller.createBatch({ ...body, command_type: 'config_backup_now' }, request), /client|permission/);
      assert.equal(calls.some(([kind]) => kind === 'enqueue'), false);
    }
  } finally { appConfig.pfsenseUpgrade.enabled = before; }
});

function backupFixture({ status = 'running', rival, backups = [], auditFails = false } = {}) {
  const row = command({ type: 'config_backup_now', status });
  const state = { row, audit: [], followUps: 0, committed: 0 };
  const input = { nodeId, commandId: row.id, duplicate: false, sha256: 'a'.repeat(64) };
  const recorded = backups.map((backup) => ({ nodeId, commandId: row.id, configSha256: input.sha256, status: 'stored', ...backup }));
  let inTransaction = false;
  const race = () => { if (rival) { state.row.status = rival; rival = undefined; } };
  const matches = (value, where) => Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return expected.some((clause) => matches(value, clause));
    if (key === 'configBackups') return recorded.some((backup) => matches(backup, expected.some));
    if (expected && typeof expected === 'object' && 'in' in expected) return expected.in.includes(value[key]);
    return value[key] === expected;
  });
  const tx = {
    nodeCommand: {
      // Support the old path too: rival commits after its stale read. Baseline
      // then overwrites it via update(id); the fixed atomic predicate cannot.
      findFirst: async ({ where }) => { const result = matches(state.row, where) ? structuredClone(state.row) : null; race(); return result; },
      update: async ({ data }) => { Object.assign(state.row, data); return structuredClone(state.row); },
      updateMany: async ({ where, data }) => {
        assert.equal(inTransaction, true);
        race();
        if (!matches(state.row, where)) return { count: 0 };
        Object.assign(state.row, data); return { count: 1 };
      },
      findUnique: async () => structuredClone(state.row),
    },
    nodeConfigBackup: { findFirst: async ({ where }) => recorded.find((backup) => matches(backup, where)) ?? null },
    auditLog: { create: async ({ data }) => {
      assert.equal(inTransaction, true);
      if (auditFails) throw new Error('synthetic audit failure');
      state.audit.push(data);
    } },
  };
  const db = { ...tx, $transaction: async (fn) => {
    const snapshot = structuredClone({ row: state.row, audit: state.audit });
    inTransaction = true;
    try { const result = await fn(tx); state.committed += 1; return result; }
    catch (error) { Object.assign(state, snapshot); throw error; }
    finally { inTransaction = false; }
  } };
  const svc = new BackupsCommandService(db, { handleBackupCommandSucceeded: async () => {
    assert.equal(inTransaction, false);
    assert.ok(state.committed > 0);
    assert.equal(state.row.status, 'succeeded');
    state.followUps += 1;
  } });
  return { svc, state, input };
}

test('backup upload CAS preserves terminal winners, proves expired backups, and commits audit before one follow-up', async () => {
  for (const rival of ['cancelled', 'failed', 'succeeded']) {
    const { svc, state, input } = backupFixture({ rival });
    await svc.markCommandSucceeded(input);
    assert.equal(state.row.status, rival);
    assert.equal(state.audit.length, 0);
    assert.equal(state.followUps, 0);
  }
  for (const backups of [[], [{ status: 'failed' }], [{ nodeId: 'other-node' }], [{ commandId: 'other-command' }], [{ configSha256: 'b'.repeat(64) }]]) {
    const { svc, state, input } = backupFixture({ status: 'expired', backups });
    await svc.markCommandSucceeded(input);
    assert.equal(state.row.status, 'expired');
    assert.equal(state.audit.length, 0); assert.equal(state.followUps, 0);
  }
  for (const options of [
    { status: 'running' },
    { status: 'expired', backups: [{ status: 'stored' }] },
    { status: 'expired', backups: [{ status: 'duplicate' }] },
    { rival: 'expired', backups: [{ status: 'stored' }] },
  ]) {
    const { svc, state, input } = backupFixture(options);
    await svc.markCommandSucceeded(input);
    await svc.markCommandSucceeded(input);
    assert.equal(state.row.status, 'succeeded');
    assert.equal(state.audit.length, 1);
    assert.equal(state.audit[0].action, 'backup.config.request_succeeded');
    assert.equal(state.followUps, 1);
  }
  const { svc, state, input } = backupFixture({ auditFails: true });
  await assert.rejects(svc.markCommandSucceeded(input), /audit failure/);
  assert.equal(state.row.status, 'running');
  assert.equal(state.audit.length, 0); assert.equal(state.followUps, 0);
});
