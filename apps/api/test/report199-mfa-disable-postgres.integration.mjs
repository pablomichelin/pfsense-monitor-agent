import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// Independent QA-only follow-up for the MFA disable transaction. It never
// falls back to the production DATABASE_URL.
const urlString = process.env.REPORT199_PG_URL;
process.env.DATABASE_URL = 'postgresql://never:never@127.0.0.1:1/never_connect';
process.env.AUTH_BOOTSTRAP_EMAIL = 'report199@example.invalid';
process.env.AUTH_BOOTSTRAP_PASSWORD = 'synthetic-test-only';
process.env.NODE_SECRET_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
process.env.BACKUP_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
process.env.TRUST_PROXY = 'false';
const appRequire = createRequire('/app/package.json');
const hash = x => createHash('sha256').update(x).digest('hex');

test('Report 199 MFA disable: rollback, invalidation and concurrent recovery-code use', {
  skip: !urlString, timeout: 60_000,
}, async t => {
  const url = new URL(urlString);
  assert.equal(url.hostname, 'db');
  assert.equal(url.username, 'qa');
  assert.equal(url.pathname, '/monitor_qa');
  assert.ok(!url.searchParams.has('host') && !url.searchParams.has('schema'));
  const { PrismaClient } = appRequire('@prisma/client');
  const a = new PrismaClient({ datasourceUrl: url.toString() });
  const b = new PrismaClient({ datasourceUrl: url.toString() });
  const users = [];
  let role;
  t.after(async () => {
    try {
      await a.user.deleteMany({ where: { id: { in: users } } });
      if (role) await a.role.deleteMany({ where: { code: role.code } });
    } finally {
      await Promise.allSettled([a.$disconnect(), b.$disconnect()]);
    }
  });
  const [identity] = await a.$queryRaw`
    SELECT current_database() AS db, current_user AS usr,
      current_setting('server_version_num') AS version, inet_server_addr()::text AS address`;
  assert.equal(identity.db, 'monitor_qa');
  assert.equal(identity.usr, 'qa');
  assert.equal(Math.floor(Number(identity.version) / 10000), 17);
  assert.match(identity.address, /^10\.77\.19\./);
  const sentinel = await a.$queryRaw`SELECT purpose FROM public.report199_qa_sentinel WHERE id = 1`;
  assert.deepEqual(sentinel.map(x => x.purpose), ['pfs-report199-qa-only-20261102']);

  const { MfaService } = appRequire('/app/dist/auth/mfa.service.js');
  const audits = [];
  const audit = { record: async event => { audits.push(event.action); } };
  const original = new MfaService(a, {}, audit, {});
  const concurrent = new MfaService(b, {}, audit, {});
  const prefix = randomUUID().slice(0, 8);
  role = await a.role.create({ data: { code: `R199D${prefix}`, label: 'QA MFA Disable' } });
  const makeUser = async (code, token) => {
    const user = await a.user.create({
      data: { email: `r199d-${randomUUID()}@example.invalid`, role: role.code, mfaEnabled: true },
    });
    users.push(user.id);
    await a.mfaRecoveryCode.create({ data: {
      userId: user.id, codeHash: hash(code.replace(/[^a-z0-9]/gi, '').toUpperCase()),
    } });
    await a.mfaLoginChallenge.create({ data: {
      userId: user.id, challengeTokenHash: hash(token), expiresAt: new Date(Date.now() + 300000),
    } });
    return user.id;
  };

  const firstCode = 'ABCDE-FGHIJ';
  const first = await makeUser(firstCode, 'disable-rollback');
  const injected = new Proxy(a, {
    get(target, key) {
      if (key === '$transaction') return (callback, options) => target.$transaction(
        tx => callback(new Proxy(tx, {
          get(inner, name) {
            if (name === 'user') return new Proxy(inner.user, {
              get(delegate, method) {
                if (method === 'update') return async () => { throw new Error('QA injected update failure'); };
                const value = Reflect.get(delegate, method);
                return typeof value === 'function' ? value.bind(delegate) : value;
              },
            });
            const value = Reflect.get(inner, name);
            return typeof value === 'function' ? value.bind(inner) : value;
          },
        })), options);
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await assert.rejects(
    new MfaService(injected, {}, audit, {}).disable({ userId: first, code: firstCode }),
    /QA injected update failure/,
  );
  assert.equal((await a.user.findUnique({ where: { id: first } })).mfaEnabled, true);
  assert.equal(await a.mfaRecoveryCode.count({ where: { userId: first, usedAt: null } }), 1);
  assert.equal(await a.mfaLoginChallenge.count({ where: { userId: first } }), 1);

  for (let i = 0; i < 12; i++) {
    await assert.rejects(
      original.disable({ userId: first, code: 'INVALID' }),
      error => error.getStatus() === 401,
    );
  }
  assert.equal((await a.user.findUnique({ where: { id: first } })).mfaFailedAttemptCount, 12);
  await assert.rejects(
    original.disable({ userId: first, code: firstCode }),
    error => error.getStatus() === 401,
    'a valid factor cannot bypass the active user attempt budget',
  );
  assert.equal(await a.mfaRecoveryCode.count({ where: { userId: first, usedAt: null } }), 1);
  // Advance the window in QA only, without waiting 15 real minutes.
  await a.user.update({ where: { id: first }, data: {
    mfaFailedWindowStart: new Date(Date.now() - 16 * 60 * 1000),
  } });
  await original.disable({ userId: first, code: firstCode });
  const disabled = await a.user.findUnique({ where: { id: first } });
  assert.equal(disabled.mfaEnabled, false);
  assert.equal(disabled.mfaFailedAttemptCount, 0);
  assert.equal(await a.mfaRecoveryCode.count({ where: { userId: first } }), 0);
  assert.equal(await a.mfaLoginChallenge.count({ where: { userId: first } }), 0);

  const secondCode = 'KLMNO-PQRST';
  const secondToken = 'disable-race';
  const second = await makeUser(secondCode, secondToken);
  const outcomes = await Promise.allSettled([
    original.disable({ userId: second, code: secondCode }),
    concurrent.verifyLoginChallenge({ token: secondToken, code: secondCode }),
  ]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(x => x.status === 'rejected').length, 1);
  const recoveryCount = await a.mfaRecoveryCode.count({
    where: { userId: second, usedAt: null },
  });
  assert.equal(recoveryCount, 0, 'one recovery code cannot authorize both operations');
  assert.ok(audits.includes('auth.mfa.disabled'));
});
