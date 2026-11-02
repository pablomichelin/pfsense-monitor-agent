import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadAdmin, makeAdmin, validateReport202Url } from './report202-admin-test-support.mjs';
const AdminService = loadAdmin();
const uid = randomUUID(), adminId = randomUUID(), clientId = randomUUID(), sessionId = randomUUID();
const now = new Date();
function fixture(fail = '') {
  let state = {
    users: [{ id: uid, email: 'person@example.invalid', displayName: 'Person', role: 'readonly', status: 'active', clientId: null, passwordHash: 'old', createdAt: now, updatedAt: now },
      { id: adminId, email: 'admin@example.invalid', role: 'superadmin', status: 'active' }],
    scopes: [{ userId: uid, clientId }], sessions: [{ id: sessionId, userId: uid, revokedAt: null }],
    challenges: [{ userId: uid, consumedAt: null }], audits: [],
  };
  const initial = structuredClone(state);
  const calls = [];
  const prisma = { $transaction: async callback => {
    const draft = structuredClone(state);
    const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
    const tx = {
      $queryRaw: async strings => { calls.push(String(strings[0])); return []; },
      role: { findUnique: async () => ({ status: 'active' }) },
      client: { findMany: async ({ where }) => where.id.in.includes(clientId) ? [{ id: clientId }] : [], findFirst: async () => ({ id: clientId }) },
      user: {
        findUnique: async ({ where }) => draft.users.find(row => matches(row, where)),
        count: async ({ where }) => draft.users.filter(row => matches(row, where)).length,
        create: async ({ data }) => { const row = { id: randomUUID(), createdAt: now, updatedAt: now, ...data }; draft.users.push(row); return row; },
        update: async ({ where, data }) => { const row = draft.users.find(row => matches(row, where)); Object.assign(row, Object.fromEntries(Object.entries(data).filter(([,v]) => v !== undefined))); return row; },
        delete: async ({ where }) => { if (fail === 'delete') throw new Error('injected delete'); draft.users = draft.users.filter(row => !matches(row, where)); },
      },
      userClientScope: {
        deleteMany: async ({ where }) => { draft.scopes = draft.scopes.filter(row => !matches(row, where)); },
        createMany: async ({ data }) => { if (fail === 'scope') throw new Error('injected scope'); draft.scopes.push(...data); },
      },
      userSession: {
        findFirst: async ({ where }) => draft.sessions.find(row => matches(row, where)),
        updateMany: async ({ where, data }) => { const rows = draft.sessions.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
      },
      mfaLoginChallenge: { updateMany: async ({ where, data }) => { draft.challenges.filter(row => matches(row, where)).forEach(row => Object.assign(row, data)); } },
      auditLog: { create: async ({ data }) => { if (fail === 'audit') throw new Error('injected audit'); draft.audits.push(data); } },
    };
    const result = await callback(tx);
    if (fail === 'commit') throw new Error('injected commit');
    state = draft;
    return result;
  } };
  return { service: makeAdmin(AdminService, prisma), state: () => state, initial, calls };
}
for (const failure of ['audit', 'commit']) {
  for (const operation of ['create', 'update', 'delete', 'scopes', 'revoke']) {
    test(`${operation}: ${failure} rolls back user/scopes/sessions/challenges/audit`, async () => {
      const f = fixture(failure);
      const run = {
        create: () => f.service.createUser({ email: 'new@example.invalid', password: 'new-password', role: 'readonly', client_ids: [clientId] }, adminId),
        update: () => f.service.updateUser(uid, { password: 'new-password', client_ids: [clientId] }, adminId),
        delete: () => f.service.deleteUser(uid, adminId),
        scopes: () => f.service.setUserClientScopes(uid, { client_ids: [clientId] }, adminId),
        revoke: () => f.service.revokeUserSession(uid, sessionId, { actorId: adminId, actorSessionId: randomUUID() }),
      }[operation];
      await assert.rejects(run, new RegExp(`injected ${failure}`));
      assert.deepEqual(f.state(), f.initial);
    });
  }
}
for (const operation of ['create', 'update', 'scopes']) {
  test(`${operation}: scope failure leaves no partial mutation`, async () => {
    const f = fixture('scope');
    await assert.rejects(() => operation === 'create'
      ? f.service.createUser({ email: 'new@example.invalid', password: 'new-password', client_ids: [clientId] }, adminId)
      : operation === 'update' ? f.service.updateUser(uid, { password: 'new-password', client_ids: [clientId] }, adminId)
      : f.service.setUserClientScopes(uid, { client_ids: [clientId] }, adminId), /injected scope/);
    assert.deepEqual(f.state(), f.initial);
  });
}
test('delete failure rolls back its preceding audit and session revocation', async () => {
  const f = fixture('delete');
  await assert.rejects(() => f.service.deleteUser(uid, adminId), /injected delete/);
  assert.deepEqual(f.state(), f.initial);
});
test('reset commits password, session revocation, consumed MFA challenge and one safe audit', async () => {
  const f = fixture();
  await f.service.updateUser(uid, { password: 'new-password' }, adminId);
  assert.equal(f.state().users[0].passwordHash, 'synthetic-hash:new-password');
  assert.ok(f.state().sessions[0].revokedAt);
  assert.ok(f.state().challenges[0].consumedAt);
  assert.equal(f.state().audits.length, 1);
  assert.equal(f.state().audits[0].metadataJson.password_rotated, true);
  assert.ok(!JSON.stringify(f.state().audits).includes('new-password'));
  assert.match(f.calls[0], /pg_advisory_xact_lock/);
});
test('ordinary identity update preserves sessions and scopes', async () => {
  const f = fixture();
  await f.service.updateUser(uid, { display_name: 'Updated' }, adminId);
  assert.deepEqual(f.state().sessions, f.initial.sessions);
  assert.deepEqual(f.state().scopes, f.initial.scopes);
});
test('last superadmin, own demotion and own deletion stay forbidden', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.updateUser(adminId, { status: 'inactive' }), /last active superadmin/);
  await assert.rejects(() => f.service.deleteUser(adminId), /last active superadmin/);
  await assert.rejects(() => f.service.updateUser(adminId, { role: 'readonly' }, adminId), /own active superadmin/);
  await assert.rejects(() => f.service.deleteUser(adminId, adminId), /own user/);
  assert.deepEqual(f.state(), f.initial);
});
test('revocation is idempotent, current session forbidden, cross-user session inaccessible', async () => {
  const f = fixture(), actor = { actorId: adminId, actorSessionId: randomUUID() };
  await assert.rejects(() => f.service.revokeUserSession(uid, sessionId, { ...actor, actorSessionId: sessionId }), /logout/);
  await assert.rejects(() => f.service.revokeUserSession(adminId, sessionId, actor), /session not found/);
  const first = await f.service.revokeUserSession(uid, sessionId, actor);
  assert.deepEqual(await f.service.revokeUserSession(uid, sessionId, actor), first);
  assert.equal(f.state().audits.length, 1);
});
test('pagination rejects bad limits and cursors before opening a transaction', async () => {
  const service = makeAdmin(AdminService, { $transaction: () => assert.fail('must validate first') });
  for (const limit of [0, 201, -1, 1.5, NaN]) {
    await assert.rejects(() => service.listUsers({ limit }), /limit/);
    await assert.rejects(() => service.listUserSessions(uid, { actorSessionId: '', limit }), /limit/);
  }
  await assert.rejects(() => service.listUsers({ cursor: 'bad' }), /cursor/);
});

test('QA URL guard accepts only explicit database/user and rejects routing bypasses', () => {
  assert.equal(validateReport202Url('postgresql://qa@db/monitor_qa').pathname, '/monitor_qa');
  for (const value of ['postgresql://qa@db/production', 'postgresql://root@db/monitor_qa',
    'postgresql://qa@db/monitor_qa?host=production', 'postgresql://qa@db/monitor_qa?schema=other',
    'postgresql://qa@db/monitor_qa?options=evil', 'https://qa@db/monitor_qa', 'invalid']) {
    assert.throws(() => validateReport202Url(value));
  }
});
test('paged users limit recovery aggregation to returned items and retain metadata', async () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ id: randomUUID(), email: `p${i}@example.invalid`,
    role: 'readonly', displayName: null, status: 'active', clientId: null, clientScopes: [{ clientId }],
    mfaEnabled: i === 0, mfaEnrolledAt: null, createdAt: now, updatedAt: now }));
  let grouped;
  const service = makeAdmin(AdminService, { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return callback({
      user: {
        count: async ({ where }) => { assert.equal(where.status, 'inactive'); assert.equal(where.OR[0].email.contains, 'needle'); return 77; },
        findFirst: async () => ({ id: uid }),
        findMany: async args => { assert.equal(args.take, 3); assert.deepEqual(args.cursor, { id: uid }); assert.equal(args.skip, 1); return rows; },
      },
      mfaRecoveryCode: { groupBy: async args => { grouped = args.where.userId.in; return [{ userId: rows[0].id, _count: { _all: 2 } }]; } },
    });
  } });
  const page = await service.listUsers({ search: ' needle ', status: 'inactive', cursor: uid, limit: 2 });
  assert.equal(page.total, 77); assert.equal(page.next_cursor, rows[1].id);
  assert.deepEqual(grouped, rows.slice(0, 2).map(row => row.id));
  assert.equal(page.items[0].mfa_recovery_codes_remaining, 2);
  assert.deepEqual(page.items[0].client_ids, [clientId]);
});
test('paged sessions retain current and historical states without returning token hashes', async () => {
  const rows = [0, 1, 2].map((i) => ({ id: randomUUID(), userId: uid, createdAt: now, expiresAt: now,
    lastSeenAt: null, revokedAt: i === 0 ? now : null, ipAddress: null, userAgent: null, sessionTokenHash: 'must-not-leak' }));
  const service = makeAdmin(AdminService, { $transaction: async callback => callback({
    user: { findUnique: async () => ({ id: uid }) },
    userSession: { count: async () => 3, findMany: async args => { assert.equal(args.take, 3); assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]); return rows; } },
  }) });
  const page = await service.listUserSessions(uid, { actorSessionId: rows[1].id, limit: 2 });
  assert.equal(page.total, 3); assert.equal(page.next_cursor, rows[1].id);
  assert.equal(page.items[1].current, true); assert.ok(page.items[0].revoked_at);
  assert.ok(!JSON.stringify(page).includes('must-not-leak'));
});
test('client and superadmin roles cannot receive detached scopes after atomic refactor', async () => {
  for (const role of ['client', 'superadmin']) {
    const service = makeAdmin(AdminService, { $transaction: async callback => callback({
      $queryRaw: async () => [], user: { findUnique: async () => ({ id: uid, role }) },
      userClientScope: { deleteMany: () => assert.fail('must reject before writes') },
    }) });
    await assert.rejects(() => service.setUserClientScopes(uid, { client_ids: [clientId] }), error => error.getStatus() === 400);
  }
});
