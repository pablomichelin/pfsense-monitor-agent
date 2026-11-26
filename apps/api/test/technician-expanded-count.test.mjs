import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { TechniciansService } from '../dist/technicians/technicians.service.js';

test('expanded technician summary counts the returned accounts, with legacy scoped count intact', async () => {
  const scope = { site: { clientId: 'synthetic-visible-client' } };
  const calls = [];
  const technician = {
    id: 'synthetic-technician',
    fullName: 'Synthetic technician',
    loginUsername: 'synthetic',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    notes: 'global note',
    _count: { nodeAccounts: 1 },
    nodeAccounts: ['first', 'second'].map((id) => ({
      id, nodeId: id, node: { hostname: id, displayName: null },
    })),
  };
  const service = new TechniciansService({
    technician: { findMany: async (query) => { calls.push(query); return [technician]; } },
  }, {}, { hasGlobalClientScope: () => false, mergeNodeWhere: async () => scope });
  const actor = { userId: 'synthetic-user', role: 'readonly' };
  const expanded = (await service.listTechnicians(actor, 'active', true)).items[0];
  assert.deepEqual(expanded.node_accounts.map(account => account.node_id), ['first', 'second']);
  assert.equal(expanded.node_account_count, expanded.node_accounts.length);
  assert.equal(expanded.notes, null);
  assert.deepEqual(calls[0].include.nodeAccounts.where, { node: scope });
  assert.equal(Object.hasOwn(calls[0].include, '_count'), false);

  const legacy = (await service.listTechnicians(actor)).items[0];
  assert.equal(legacy.node_account_count, 1);
  assert.equal(Object.hasOwn(legacy, 'node_accounts'), false);
  assert.deepEqual(calls[1].include._count.select.nodeAccounts.where, { node: scope });
});
