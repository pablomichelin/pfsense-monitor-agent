import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAdmin } from './report202-admin-test-support.mjs';

const AdminService = loadAdmin();
const actor = { userId: 'qa-user', role: 'qa-role' };

function fixture(rows, scopes = null, matchingCount = 0, nodes = []) {
  const auditReads = [];
  const userReads = [];
  const db = {
    client: { findMany: async () => [] },
    node: { findMany: async ({ where }) => nodes.filter(node => where.id.in.includes(node.id)) },
    user: { findMany: async ({ where, take }) => {
      if (!where.email) return [];
      userReads.push({ where, take });
      const matches = Array.from({ length: matchingCount }, (_, index) => ({ id: `qa-actor-${index}` }));
      return take === undefined ? matches : matches.slice(0, take);
    } },
    auditLog: { findMany: async (query) => {
      auditReads.push(query);
      const matching = rows.filter((row) => query.where.actorId?.in.includes(row.actorId) ?? true);
      return matching.slice(query.skip, query.skip + query.take);
    } },
  };
  const admin = new AdminService(db, {}, {}, { getAllowedClientIds: async () => scopes }, {}, {}, {}, {}, {});
  return { admin, userReads, auditReads };
}

const event = (id, extra = {}) => ({
  id, actorType: 'user_session', actorId: null, actorRole: null, action: 'qa.changed',
  targetType: 'synthetic', targetId: null, clientId: null, result: 'success',
  ipAddress: null, metadataJson: null, createdAt: new Date('2026-11-26T00:00:00Z'),
  ...extra,
});

test('audit identifies full final pages and orders equal timestamps consistently', async () => {
  const { admin, auditReads } = fixture([event('qa-2'), event('qa-1')]);
  const first = await admin.listAuditLogs(actor, { limit: 1, offset: 0 });
  const last = await admin.listAuditLogs(actor, { limit: 1, offset: 1 });
  assert.deepEqual(first.items.map(item => item.id), ['qa-2']);
  assert.deepEqual(last.items.map(item => item.id), ['qa-1']);
  assert.equal(first.has_more, true);
  assert.equal(last.has_more, false);
  assert.deepEqual(auditReads[0].orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
});

test('audit determines whether there is another visible event after applying client scope', async () => {
  const { admin } = fixture([
    event('allowed-first', { targetType: 'client', targetId: 'visible' }),
    event('outside', { targetType: 'client', targetId: 'outside' }),
    event('allowed-second', { targetType: 'client', targetId: 'visible' }),
  ], ['visible']);
  const first = await admin.listAuditLogs(actor, { limit: 1 });
  const last = await admin.listAuditLogs(actor, { limit: 1, offset: 1 });
  assert.deepEqual(first.items.map(item => item.id), ['allowed-first']);
  assert.deepEqual(last.items.map(item => item.id), ['allowed-second']);
  assert.equal(first.has_more, true);
  assert.equal(last.has_more, false);
});

test('audit searches events of every user whose email matches before applying page limits', async () => {
  const { admin, userReads } = fixture([event('older-match', { actorId: 'qa-actor-59' })], null, 60);
  const result = await admin.listAuditLogs(actor, { actor_email: 'qa-staff', limit: 50 });
  assert.deepEqual(result.items.map(item => item.id), ['older-match']);
  assert.equal(userReads[0].take, undefined);
});

test('audit resolves command event scope even without a direct firewall event in the same batch', async () => {
  const allowed = 'a0000000-0000-4000-8000-000000000021';
  const denied = 'b0000000-0000-4000-8000-000000000022';
  const command = (id, nodeId) => event(id, {
    targetType: 'node_command', metadataJson: { node_id: nodeId },
  });
  const { admin } = fixture([
    command('allowed-command', allowed.toUpperCase()),
    command('outside-command', denied),
    command('old-invalid-identifier', 'legacy-text-id'),
  ], ['visible'], 0, [
    { id: allowed, site: { clientId: 'visible' } },
    { id: denied, site: { clientId: 'outside' } },
  ]);
  const result = await admin.listAuditLogs(actor, { limit: 25 });
  assert.deepEqual(result.items.map(item => item.id), ['allowed-command']);
});
