import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeAdmin } from './admin-node-delete.test-support.mjs';

const { TechniciansService } = await import('../dist/technicians/technicians.service.js');
const { MfaService } = await import('../dist/auth/mfa.service.js');
const hash = value => createHash('sha256').update(value).digest('hex');
const ID = '00000000-0000-4000-8000-000000000001';
const a = '00000000-0000-4000-8000-000000000002';
const b = '00000000-0000-4000-8000-000000000003';

function provisionFixture(allowReset = false) {
  let writes = 0;
  let authorizations = 0;
  const nodes = [
    { id: a, hostname: 'synthetic-create', localUsersSnapshotJson: [] },
    { id: b, hostname: 'synthetic-existing', localUsersSnapshotJson: [{ name: 'synthetictech', disabled: false }] },
  ];
  const prisma = {
    node: { findMany: async () => nodes },
    technicianNodeAccount: { upsert: async ({ where }) => {
      writes++;
      return { id: where.technicianId_nodeId.nodeId };
    } },
  };
  const policy = { assertOperationPermission: async (_, permission) => {
    authorizations++;
    assert.equal(permission, 'technicians.password_reset.run');
    if (!allowReset) throw new Error('insufficient permission');
  } };
  const service = new TechniciansService(prisma, {}, policy);
  service.assertPasswordResetEnabled = () => {};
  service.fetchLatestBackupAtByNode = async () => new Map();
  service.getNodeEligibilitySkipReason = () => null;
  const plan = (nodeIds, backupBeforeProvision) => service.planBatchProvision(
    { id: ID, loginUsername: 'synthetictech', fullName: 'Synthetic Technician' },
    nodeIds, 'only-fixture-password', 'admin_full', ID, { role: 'operator', userId: ID },
    { backupBeforeProvision },
  );
  return { plan, count: () => ({ writes, authorizations }) };
}

test('A03: mixed batch refuses reset before writing any account, including backup follow-up', async () => {
  const f = provisionFixture();
  await assert.rejects(f.plan([a, b], true), /insufficient permission/);
  assert.deepEqual(f.count(), { writes: 0, authorizations: 1 });
});

test('A03: authorized reset follows the planned command, create-only needs no reset grant', async () => {
  const denied = provisionFixture();
  const createOnly = await denied.plan([a], false);
  assert.equal(createOnly.createNodeIds.length, 1);
  assert.equal(denied.count().authorizations, 0);

  const allowed = provisionFixture(true);
  const direct = await allowed.plan([a, b], false);
  assert.equal(direct.resetNodeIds.length, 1);
  const backup = await allowed.plan([a, b], true);
  assert.equal(backup.backupQueue.length, 2);
  assert.equal(backup.backupQueue.find(x => x.node_id === b).follow_up.action, 'local_user_set_password');
  assert.equal(allowed.count().authorizations, 2);
});

test('A04: client role cannot change detached scopes and getter reports real active binding', async () => {
  let writes = 0;
  const admin = makeAdmin({
    user: { findUnique: async () => ({ id: ID, role: 'client', email: 'fixture@example.invalid', clientId: a,
      client: { id: a, name: 'Synthetic', code: 'SYN', status: 'active' } }) },
    userClientScope: { findMany: async () => { throw new Error('client must not query detached scopes'); } },
  });
  admin.replaceUserClientScopes = async () => { writes++; };
  await assert.rejects(admin.setUserClientScopes(ID, { client_ids: [] }), error => error.getStatus() === 400);
  assert.equal(writes, 0);
  const scope = await admin.listUserClientScopes(ID);
  assert.deepEqual(scope.client_ids, [a]);
  assert.deepEqual(scope.clients, [{ id: a, name: 'Synthetic', code: 'SYN' }]);
});

function mfaFixture() {
  const user = { id: ID, role: 'operator', mfaEnabled: true, mfaSecret: null,
    mfaFailedAttemptCount: 0, mfaFailedWindowStart: null };
  const challenges = new Map();
  const goodHash = hash('SYNTHETIC123');
  let recoveryConsumed = 0;
  const audits = [];
  let txQueue = Promise.resolve();
  const addChallenge = token => challenges.set(hash(token), {
    id: token, userId: ID, consumedAt: null, attemptCount: 0,
    expiresAt: new Date(Date.now() + 300_000),
  });
  const tx = {
    async $queryRaw(sql) {
      const query = Array.isArray(sql) ? sql.join('?') : sql.sql;
      assert.match(query, /FROM users .*FOR UPDATE/);
      return [{ id: ID }];
    },
    mfaLoginChallenge: {
      async findUnique({ where, select }) {
        const c = challenges.get(where.challengeTokenHash);
        if (!c) return null;
        return select ? { userId: c.userId } : { ...c, user: { ...user } };
      },
      async update({ where, data }) {
        const c = [...challenges.values()].find(item => item.id === where.id);
        Object.assign(c, data);
        return c;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const c of challenges.values()) {
          if (where.id && c.id !== where.id) continue;
          if (where.userId && c.userId !== where.userId) continue;
          if ('consumedAt' in where && c.consumedAt !== where.consumedAt) continue;
          if (where.expiresAt?.gt && c.expiresAt <= where.expiresAt.gt) continue;
          Object.assign(c, data);
          count++;
        }
        return { count };
      },
    },
    user: { async update({ data }) { Object.assign(user, data); return user; } },
    mfaRecoveryCode: { async updateMany({ where }) {
      if (where.codeHash !== goodHash || recoveryConsumed) return { count: 0 };
      recoveryConsumed++;
      return { count: 1 };
    } },
  };
  const db = { $transaction: async callback => {
    const next = txQueue.then(() => callback(tx));
    txQueue = next.catch(() => {});
    return next;
  } };
  const audit = { record: async item => { audits.push(item); } };
  const service = () => new MfaService(db, {}, audit, {});
  return { user, challenges, addChallenge, service, audits,
    consumed: () => recoveryConsumed };
}

test('A05: the fifth bad factor burns the challenge and stays burned', async () => {
  const f = mfaFixture();
  f.addChallenge('one');
  const mfa = f.service();
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(mfa.verifyLoginChallenge({ token: 'one', code: 'WRONG' }), error => error.getStatus() === 401);
  }
  await assert.rejects(mfa.verifyLoginChallenge({ token: 'one', code: 'SYNTHETIC-123' }), /MFA challenge/);
  assert.equal(f.user.mfaFailedAttemptCount, 5);
  assert.equal(f.challenges.get(hash('one')).attemptCount, 5);
  assert.equal(f.consumed(), 0);
  assert.equal(f.audits.length, 1);
});

test('A05: user budget spans parallel challenges and blocks valid factor after 12 failures', async () => {
  const f = mfaFixture();
  const mfa = f.service();
  for (const token of ['first', 'second', 'third']) {
    f.addChallenge(token);
    for (let attempt = 0; attempt < 4; attempt++) {
      await assert.rejects(mfa.verifyLoginChallenge({ token, code: 'WRONG' }));
    }
  }
  f.addChallenge('fourth');
  await assert.rejects(mfa.verifyLoginChallenge({ token: 'fourth', code: 'SYNTHETIC-123' }));
  assert.equal(f.user.mfaFailedAttemptCount, 12);
  assert.equal(f.consumed(), 0);
  assert.equal(f.audits.length, 1);
});

test('A05: concurrent recovery responses are one-shot across all challenges', async () => {
  const f = mfaFixture();
  f.addChallenge('first');
  f.addChallenge('second');
  const [one, two] = await Promise.allSettled([
    f.service().verifyLoginChallenge({ token: 'first', code: 'SYNTHETIC-123' }),
    f.service().verifyLoginChallenge({ token: 'second', code: 'SYNTHETIC-123' }),
  ]);
  assert.equal([one, two].filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(f.consumed(), 1);
  assert.equal([...f.challenges.values()].filter(item => item.consumedAt).length, 2);
});
