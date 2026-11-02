import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadAdmin, makeAdmin } from './report202-admin-test-support.mjs';
const AdminService = loadAdmin();
const uid = randomUUID(), inactiveId = randomUUID(), activeId = randomUUID(), otherInactiveId = randomUUID();
const actorId = randomUUID();
function fixture({ role = 'client', clientId = inactiveId, failAudit = false } = {}) {
  let state = {
    user: { id: uid, email: 'client@example.invalid', displayName: 'Before', role, clientId,
      passwordHash: 'old', status: 'active', updatedAt: new Date() },
    scopes: [{ userId: uid, clientId: inactiveId }], audits: [], sessions: [{ revokedAt: null }],
  };
  const calls = [];
  const service = makeAdmin(AdminService, { $transaction: async callback => {
    const draft = structuredClone(state);
    const result = await callback({
      $queryRaw: async () => [],
      role: { findUnique: async () => ({ status: 'active' }) },
      user: {
        findUnique: async ({ where }) => where.id === uid ? draft.user : where.id === actorId ? { role: 'superadmin' } : null,
        update: async ({ data }) => { Object.assign(draft.user, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))); return draft.user; },
      },
      client: {
        findFirst: async ({ where }) => { calls.push('validate-binding'); assert.equal(where.status, 'active'); return where.id === activeId ? { id: activeId } : null; },
        findMany: async ({ where }) => { calls.push('validate-scopes'); assert.equal(where.status, 'active'); return where.id.in.includes(activeId) ? [{ id: activeId }] : []; },
      },
      userClientScope: {
        deleteMany: async () => { calls.push('replace-scopes'); draft.scopes = []; },
        createMany: async ({ data }) => { draft.scopes.push(...data); },
      },
      userSession: { updateMany: async ({ data }) => { draft.sessions.forEach(s => Object.assign(s, data)); } },
      mfaLoginChallenge: { updateMany: async () => ({ count: 0 }) },
      auditLog: { create: async ({ data }) => { if (failAudit) throw new Error('audit failed'); draft.audits.push(data); } },
    });
    state = draft;
    return result;
  } });
  return { service, state: () => structuredClone(state), calls };
}
for (const [label, payload] of [
  ['omitted scope fields', { display_name: 'After', email: 'updated@example.invalid' }],
  ['same role and binding', { display_name: 'After', role: 'client', client_id: inactiveId }],
  ['same singleton client_ids', { display_name: 'After', client_ids: [inactiveId] }],
  ['same complete scope payload', { display_name: 'After', role: 'client', client_id: inactiveId, client_ids: [inactiveId] }],
  ['password reset', { password: 'new-synthetic-password' }],
]) {
  test(`R202-16 preserves inactive binding for ${label}`, async () => {
    const f = fixture(), before = f.state();
    await f.service.updateUser(uid, payload, actorId);
    assert.equal(f.state().user.clientId, inactiveId);
    assert.deepEqual(f.state().scopes, before.scopes);
    assert.deepEqual(f.calls, [], 'no active-client validation or scope rewriting for unchanged binding');
    assert.equal(f.state().audits.length, 1);
    if (payload.password) assert.ok(f.state().sessions[0].revokedAt);
    else assert.equal(f.state().user.displayName, 'After');
  });
}
for (const [label, options, payload] of [
  ['new inactive client', {}, { client_id: otherInactiveId }],
  ['cleared scopes', {}, { client_ids: [] }],
  ['conflicting scope list', {}, { client_ids: [otherInactiveId] }],
  ['multiple scope ids', {}, { client_ids: [inactiveId, activeId] }],
  ['transition to client role', { role: 'readonly' }, { role: 'client', client_id: inactiveId }],
  ['transition out of client role with inactive scopes', {}, { role: 'readonly', client_ids: [inactiveId] }],
  ['missing legacy binding', { clientId: null }, { display_name: 'After' }],
]) {
  test(`R202-16 still rejects ${label}`, async () => {
    const f = fixture(options), before = f.state();
    await assert.rejects(() => f.service.updateUser(uid, payload, actorId), error => error.getStatus() === 400);
    assert.deepEqual(f.state(), before);
  });
}
test('R202-16 accepts changed binding only after active-client validation', async () => {
  const f = fixture();
  await f.service.updateUser(uid, { client_id: activeId, client_ids: [activeId] }, actorId);
  assert.equal(f.state().user.clientId, activeId);
  assert.deepEqual(f.state().scopes.map(scope => scope.clientId), [activeId]);
  assert.deepEqual(f.calls, ['validate-binding', 'validate-scopes', 'replace-scopes']);
});
test('R202-16 identity change with inactive binding rolls back on audit failure', async () => {
  const f = fixture({ failAudit: true }), before = f.state();
  await assert.rejects(() => f.service.updateUser(uid, { display_name: 'After' }, actorId), /audit failed/);
  assert.deepEqual(f.state(), before);
});
