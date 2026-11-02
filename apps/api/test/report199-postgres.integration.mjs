import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

// Runs only against a disposable PG17 container and an explicit sentinel.
// Never inherit production credentials or fall back to DATABASE_URL.
const urlString = process.env.REPORT199_PG_URL;
process.env.DATABASE_URL = 'postgresql://never:never@127.0.0.1:1/never_connect';
process.env.AUTH_BOOTSTRAP_EMAIL = 'report199@example.invalid';
process.env.AUTH_BOOTSTRAP_PASSWORD = 'synthetic-test-only';
process.env.NODE_SECRET_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
process.env.BACKUP_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
process.env.TRUST_PROXY = 'false';
const appRequire = createRequire('/app/package.json');
const hash = x => createHash('sha256').update(x).digest('hex');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('Report 199: PG17 independent transactions, MFA and historical scrub', {
  skip: !urlString, timeout: 120_000,
}, async t => {
  const url = new URL(urlString);
  assert.equal(url.hostname, 'db');
  assert.equal(url.username, 'qa');
  assert.equal(url.pathname, '/monitor_qa');
  assert.ok(!url.searchParams.has('host') && !url.searchParams.has('schema'));
  const { PrismaClient } = appRequire('@prisma/client');
  const a = new PrismaClient({ datasourceUrl: url.toString() });
  const b = new PrismaClient({ datasourceUrl: url.toString() });
  const observer = new PrismaClient({ datasourceUrl: url.toString() });
  let client, clientForDelete, role, user;
  t.after(async () => {
    try {
      if (user) await a.user.deleteMany({ where: { id: user.id } });
      if (role) await a.role.deleteMany({ where: { code: role.code } });
      if (client) await a.client.deleteMany({ where: { id: client.id } });
      if (clientForDelete) await a.client.deleteMany({ where: { id: clientForDelete.id } });
    } finally {
      await Promise.allSettled([a.$disconnect(), b.$disconnect(), observer.$disconnect()]);
    }
  });

  const [identity] = await a.$queryRaw`
    SELECT current_database() AS db, current_user AS usr,
      current_setting('server_version_num') AS version, inet_server_addr()::text AS address`;
  assert.equal(identity.db, 'monitor_qa');
  assert.equal(identity.usr, 'qa');
  assert.equal(Math.floor(Number(identity.version) / 10000), 17);
  assert.match(identity.address, /^10\.77\.19\./);
  const guard = await a.$queryRaw`SELECT purpose FROM public.report199_qa_sentinel WHERE id = 1`;
  assert.deepEqual(guard.map(row => row.purpose), ['pfs-report199-qa-only-20261102']);

  const { AdminService } = appRequire('/app/dist/admin/admin.service.js');
  const { MfaService } = appRequire('/app/dist/auth/mfa.service.js');
  const makeAdmin = db => new AdminService(db, { encrypt: () => 'qa-encrypted-only' }, {}, {},
    { invalidateFiltersCache: () => {} }, {}, {}, {}, {});
  const prefix = `R199${randomUUID().slice(0, 8)}`;

  // C01: lock the client and its sites through the real service. A concurrent
  // INSERT with a foreign key to that site must wait until the DELETE commits.
  clientForDelete = await a.client.create({ data: { name: prefix, code: `${prefix}D` } });
  const doomedSite = await a.site.create({ data: {
    clientId: clientForDelete.id, name: 'QA doomed site', code: 'DOOM',
  } });
  const siteLocked = deferred();
  const releaseDelete = deferred();
  const wrapped = new Proxy(a, {
    get(target, prop) {
      if (prop === '$transaction') return (callback, options) => target.$transaction(
        async tx => callback(new Proxy(tx, {
          get(inner, key) {
            if (key === '$queryRaw') return async (strings, ...values) => {
              const result = await inner.$queryRaw(strings, ...values);
              if (String(strings[0]).includes('FROM sites WHERE')) {
                siteLocked.resolve();
                await releaseDelete.promise;
              }
              return result;
            };
            const value = Reflect.get(inner, key);
            return typeof value === 'function' ? value.bind(inner) : value;
          },
        })), options);
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const deletePromise = makeAdmin(wrapped).deleteClient(clientForDelete.id);
  await siteLocked.promise;
  const inserting = deferred();
  const insertPromise = b.$transaction(async tx => {
    const [row] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
    inserting.resolve(Number(row.pid));
    return tx.node.create({ data: {
      siteId: doomedSite.id, nodeUid: `${prefix}-late`, hostname: 'qa-late-node',
    } });
  });
  const insertResult = insertPromise.then(() => ({ ok: true }), error => ({ ok: false, error }));
  const insertPid = await inserting.promise;
  let blocked = false;
  try {
    for (let n = 0; n < 30; n++) {
      const [activity] = await observer.$queryRaw`
        SELECT wait_event_type AS "waitType", pg_blocking_pids(${insertPid}::integer) AS blockers
        FROM pg_stat_activity WHERE pid = ${insertPid}::integer`;
      if (activity?.waitType === 'Lock' && activity.blockers?.length) { blocked = true; break; }
      await delay(50);
    }
  } finally {
    releaseDelete.resolve();
  }
  assert.equal(blocked, true, 'late node insert must wait on site parent lock');
  const deleted = await deletePromise;
  assert.equal(deleted.ok, true);
  assert.equal((await insertResult).ok, false, 'node insert must fail after parent deletion');
  assert.equal(await a.node.count({ where: { siteId: doomedSite.id } }), 0);
  clientForDelete = null;

  // C02: both service calls begin with a node-row lock; partial unique index
  // enforces the invariant even if a future writer neglects the lock.
  client = await a.client.create({ data: { name: prefix, code: `${prefix}A` } });
  const site = await a.site.create({ data: { clientId: client.id, name: 'QA active', code: 'ACTV' } });
  const node = await a.node.create({ data: {
    siteId: site.id, nodeUid: `${prefix}-node`, hostname: 'qa-node',
  } });
  await a.nodeCredential.create({ data: {
    nodeId: node.id, secretHint: 'test', secretHash: 'test',
    secretEncrypted: 'test', status: 'active',
  } });
  const rotated = await Promise.all([
    makeAdmin(a).rotateNodeSecret(node.id),
    makeAdmin(b).rotateNodeSecret(node.id),
  ]);
  assert.equal(rotated.length, 2);
  assert.equal(await a.nodeCredential.count({ where: { nodeId: node.id, status: 'active' } }), 1);
  assert.equal(await a.nodeCredential.count({ where: { nodeId: node.id, status: 'rotated' } }), 2);
  await assert.rejects(a.nodeCredential.create({ data: {
    nodeId: node.id, secretHint: 'bad', secretHash: 'bad',
    secretEncrypted: 'bad', status: 'active',
  } }), error => error.code === 'P2002');

  // A05: concurrent invalid factors are serialized by the user row and capped;
  // extra challenge tokens cannot reset the per-user 15-minute budget.
  role = await a.role.create({ data: { code: `${prefix}R`, label: 'QA Role' } });
  user = await a.user.create({ data: {
    email: `${prefix.toLowerCase()}@example.invalid`, role: role.code, mfaEnabled: true,
  } });
  const audits = [];
  const mfaA = new MfaService(a, {}, { record: async event => { audits.push(event); } }, {});
  const mfaB = new MfaService(b, {}, { record: async event => { audits.push(event); } }, {});
  const createChallenge = token => a.mfaLoginChallenge.create({ data: {
    userId: user.id, challengeTokenHash: hash(token), expiresAt: new Date(Date.now() + 300_000),
  } });
  const verify = (service, token, code) => service.verifyLoginChallenge({ token, code });
  await createChallenge('qa-one');
  await Promise.all(Array.from({ length: 8 }, (_, i) =>
    verify(i % 2 ? mfaA : mfaB, 'qa-one', 'INVALID').then(
      () => { throw new Error('invalid factor unexpectedly succeeded'); },
      error => { assert.equal(error.getStatus(), 401); },
    )));
  const lockedChallenge = await a.mfaLoginChallenge.findUnique({ where: { challengeTokenHash: hash('qa-one') } });
  assert.equal(lockedChallenge.attemptCount, 5);
  await createChallenge('qa-two');
  await createChallenge('qa-three');
  for (const token of ['qa-two', 'qa-three']) {
    for (let i = 0; i < (token === 'qa-two' ? 5 : 2); i++) {
      await assert.rejects(verify(mfaA, token, 'INVALID'));
    }
  }
  const lockedUser = await a.user.findUnique({ where: { id: user.id } });
  assert.equal(lockedUser.mfaFailedAttemptCount, 12);
  assert.equal(audits.length, 3); // Each challenge cap plus the user cap.

  // A06: only the old failed record is scrubbed, with exactly one audit.
  const historical = await a.nodeCommand.create({ data: {
    nodeId: node.id, type: 'local_user_create', status: 'failed',
    expiresAt: new Date('2026-08-03T00:00:00Z'),
    createdAt: new Date('2026-08-01T12:00:00Z'),
    payloadJson: { password: 'synthetic-only-secret', account_id: 'qa-account' },
  } });
  const scrub = readFileSync('/app/prisma/maintenance/20261102_scrub_terminal_local_user_password.sql', 'utf8');
  await a.$executeRawUnsafe(scrub);
  await a.$executeRawUnsafe(scrub);
  const record = await a.nodeCommand.findUnique({ where: { id: historical.id } });
  assert.deepEqual(record.payloadJson, { account_id: 'qa-account' });
  assert.equal(await a.auditLog.count({ where: {
    action: 'security.historical_command_password_scrub', targetId: historical.id,
  } }), 1);
});
