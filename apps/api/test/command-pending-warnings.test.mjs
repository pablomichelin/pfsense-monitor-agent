import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NodeCommandsService } from '../dist/node-commands/node-commands.service.js';

test('pending warnings rotate across pages and wait until an attempt is eligible', async ({ mock }) => {
  const now = Date.parse('2026-11-25T22:00:00Z');
  mock.timers.enable({ apis: ['Date'], now });
  const command = (id, nextRetryAt = null) => ({
    id, nodeId: 'qa-node', type: 'package_upgrade', status: 'pending',
    requestedAt: new Date(now - 300_000), expiresAt: new Date(now + 120_000), nextRetryAt,
  });
  const waiting = command('deferred', new Date(now + 60_000));
  const recentlyReady = command('recently-ready', new Date(now - 30_000));
  const active = Array.from({ length: 51 }, (_, i) => command(`command-${i + 1}`));
  const queries = [];
  const db = { nodeCommand: { findMany: async ({ where, take }) => {
    queries.push(where);
    const readyBefore = where.OR?.find((option) => option.nextRetryAt?.lte)?.nextRetryAt.lte;
    return [waiting, recentlyReady, ...active].filter((row) =>
      row.requestedAt <= where.requestedAt.lte &&
      row.expiresAt > where.expiresAt.gt &&
      !where.id?.notIn.includes(row.id) &&
      (!readyBefore || !row.nextRetryAt || row.nextRetryAt <= readyBefore)).slice(0, take);
  } } };
  const worker = new NodeCommandsService(db, {});
  const warning = mock.method(worker.logger, 'warn', () => {});
  const warnedIds = () => warning.mock.calls.map((call) => /command=(\S+)/.exec(call.arguments[0])[1]);

  await worker.warnStuckPendingCommands();
  assert.deepEqual(warnedIds(), active.slice(0, 50).map((row) => row.id));
  await worker.warnStuckPendingCommands();
  assert.deepEqual(warnedIds(), active.map((row) => row.id));

  mock.timers.tick(60_000);
  await worker.warnStuckPendingCommands();
  assert.ok(warnedIds().includes('recently-ready'));
  assert.ok(!warnedIds().includes('deferred'));
  mock.timers.tick(60_000);
  await worker.warnStuckPendingCommands();
  assert.equal(queries.at(-1).id?.notIn.length ?? 0, 0);
});
