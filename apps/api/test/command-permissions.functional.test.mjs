import './synthetic-env.mjs';
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { CommandPermissionsGuard } from '../dist/commands/command-permissions.guard.js';
import { NodeCommandsController, CommandBatchesController } from '../dist/commands/commands.controller.js';
import { getCommandPermission } from '../dist/commands/command-registry.js';
import { fixture, command, nodeId, userId } from './command-test-fixtures.mjs';

function setup(Controller, method, request, rows = []) {
  const { db } = fixture(rows);
  const checked = [];
  const permissions = {
    allowed: true,
    assertPermission: async (role, permission) => {
      checked.push(permission);
      if (!permissions.allowed) throw new Error('insufficient permission');
    },
    hasPermission: async (_role, permission) => { checked.push(permission); return permissions.allowed; },
  };
  const context = { getHandler: () => Controller.prototype[method], getClass: () => Controller, switchToHttp: () => ({ getRequest: () => request }) };
  return { guard: new CommandPermissionsGuard(new Reflector(), permissions, db), context, checked, permissions };
}
const auth = { userId, role: 'synthetic-operator' };

for (const type of ['config_backup_now', 'package_upgrade', 'node_reboot', 'local_user_set_password']) {
  test(`cancel requires stored ${type} permission and passes default-deny with explicit metadata`, async () => {
    const row = command({ type });
    const { guard, context, checked } = setup(NodeCommandsController, 'cancelCommand', { auth, params: { nodeId, commandId: row.id }, body: { command_type: 'config_backup_now' } }, [row]);
    assert.equal(await guard.canActivate(context), true);
    assert.deepEqual(checked, [getCommandPermission(type)]);
  });
  test(`batch ${type} requires its specific permission`, async () => {
    const { guard, context, checked } = setup(CommandBatchesController, 'createBatch', { auth, params: {}, body: { command_type: type } });
    assert.equal(await guard.canActivate(context), true);
    assert.deepEqual(checked, [getCommandPermission(type)]);
  });
}

test('missing action permission is denied even with a valid session', async () => {
  const { guard, context, permissions } = setup(CommandBatchesController, 'createBatch', { auth, params: {}, body: { command_type: 'node_reboot' } });
  permissions.allowed = false;
  await assert.rejects(guard.canActivate(context), /insufficient permission/);
});

test('unknown command type cannot bypass the permission registry before DTO validation', async () => {
  const { guard, context } = setup(CommandBatchesController, 'createBatch', { auth, params: {}, body: { command_type: '__proto__' } });
  await assert.rejects(guard.canActivate(context), /invalid command permission/);
});

test('cancel lookup is bound to both node and command', async () => {
  const row = command();
  const { guard, context } = setup(NodeCommandsController, 'cancelCommand', { auth, params: { nodeId: 'other-node', commandId: row.id } }, [row]);
  await assert.rejects(guard.canActivate(context), /command not found/);
});

test('unmarked methods retain default-deny', async () => {
  class Unmarked { action() {} }
  const { guard, context } = setup(Unmarked, 'action', { auth, params: {} });
  await assert.rejects(guard.canActivate(context), /insufficient permission/);
});

test('static history permission still uses the original PermissionsGuard contract', async () => {
  const { guard, context, checked } = setup(NodeCommandsController, 'listHistory', { auth, params: {} });
  assert.equal(await guard.canActivate(context), true);
  assert.deepEqual(checked, ['firewalls.view']);
});

test('cancel controller denies out-of-scope nodes before cancellation', async () => {
  let calls = 0;
  const controller = new NodeCommandsController({ cancelCommand: async () => { calls += 1; } }, { assertNodeAccess: async () => { throw new Error('node out of scope'); } }, {});
  await assert.rejects(controller.cancelCommand(nodeId, 'command', { auth }), /out of scope/);
  assert.equal(calls, 0);
});

test('batch controller checks client and every node before enqueueing', async () => {
  const checks = []; let calls = 0;
  const controller = new CommandBatchesController({ createBatch: async () => { calls += 1; } }, {
    assertRequestedClientFilter: async (_actor, id) => { checks.push(id); },
    assertNodeAccess: async (_actor, id) => { checks.push(id); if (id === 'forbidden') throw new Error('node out of scope'); },
  }, { assertPermission: async () => {} });
  await assert.rejects(controller.createBatch({ command_type: 'config_backup_now', node_ids: [nodeId, 'forbidden'], client_id: 'client' }, { auth }), /out of scope/);
  assert.deepEqual(checks, ['client', nodeId, 'forbidden']);
  assert.equal(calls, 0);
});
