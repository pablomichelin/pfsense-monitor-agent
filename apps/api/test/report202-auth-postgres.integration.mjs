import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run only inside the isolated QA runner, after its owner prepared schema/sentinel.
// No migrations, schema creation, public ports, production fallback or fixed subnet.
const urlString = process.env.REPORT202_PG_URL;
process.env.DATABASE_URL = 'postgresql://never:never@127.0.0.1:1/never_connect';
process.env.AUTH_BOOTSTRAP_EMAIL = 'report202@example.invalid';
process.env.AUTH_BOOTSTRAP_PASSWORD = 'Synthetic-report202-password';
process.env.AUTH_BOOTSTRAP_LOGIN_ENABLED = 'true';
process.env.NODE_SECRET_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
process.env.BACKUP_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
process.env.TRUST_PROXY = 'false';
process.env.TRUSTED_PROXY_IPS = '';
const apiRoot = process.env.REPORT202_API_ROOT || fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(apiRoot, 'package.json'));
const hash = value => createHash('sha256').update(value).digest('hex');
const gate = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('R202 auth: PG17 budgets, rollback, own-session pagination and password reset race', {
  skip: !urlString, timeout: 120000,
}, async t => {
  const runCase = (name, body) => t.test(name, {
    skip: Boolean(process.env.REPORT202_AUTH_CASE && !name.includes(process.env.REPORT202_AUTH_CASE)),
  }, body);
  const url = new URL(urlString);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, 'db');
  assert.equal(url.username, 'qa');
  assert.equal(url.pathname, '/monitor_qa');
  assert.equal(url.search, '');
  const { PrismaClient, Prisma } = require('@prisma/client');
  const a = new PrismaClient({ datasourceUrl: url.toString() });
  const b = new PrismaClient({ datasourceUrl: url.toString() });
  const observer = new PrismaClient({ datasourceUrl: url.toString() });
  const userIds = [], keys = new Set();
  let role;
  t.after(async () => {
    try {
      if (userIds.length) {
        await a.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
        await a.user.deleteMany({ where: { id: { in: userIds } } });
      }
      if (role) await a.role.delete({ where: { code: role.code } });
      if (keys.size) await a.$executeRaw(Prisma.sql`
        DELETE FROM password_login_rate_limits WHERE rate_key IN (${Prisma.join([...keys])})`);
    } finally {
      await Promise.allSettled([a.$disconnect(), b.$disconnect(), observer.$disconnect()]);
    }
  });
  const [identity] = await a.$queryRaw`SELECT current_database() AS db, current_user AS usr,
    current_setting('server_version_num') AS version`;
  assert.equal(identity.db, 'monitor_qa'); assert.equal(identity.usr, 'qa');
  assert.equal(Math.floor(Number(identity.version) / 10000), 17);
  const sentinel = await a.$queryRaw`SELECT purpose FROM public.report202_qa_sentinel WHERE id = 1`;
  assert.deepEqual(sentinel.map(row => row.purpose), ['pfs-report202-qa-only-20261102']);
  const [table] = await a.$queryRaw`SELECT to_regclass('public.password_login_rate_limits')::text AS name`;
  assert.equal(table.name, 'password_login_rate_limits', 'QA owner must prepare migration before this harness');

  const { PasswordLoginLimitService, passwordLoginKeys } = require('./dist/auth/password-login-limit.service.js');
  const { AuthService } = require('./dist/auth/auth.service.js');
  const { MfaService } = require('./dist/auth/mfa.service.js');
  const { hashPassword } = require('./dist/auth/password-hash.js');
  const { listOwnSessions } = require('./dist/auth/own-sessions.js');
  const prefix = `r202-${randomUUID()}`;
  const ip = `2001:db8:${Math.floor(Math.random() * 65536).toString(16)}:202::1`;
  const otherIp = `2001:db8:${Math.floor(Math.random() * 65536).toString(16)}:203::1`;
  const track = (email, address = ip) => {
    for (const key of passwordLoginKeys(email, address)) keys.add(key);
    return [email, address];
  };
  const makeLimiter = db => {
    const service = new PasswordLoginLimitService(db);
    service.logger = { warn() {}, error() {} };
    return service;
  };
  role = await a.role.create({ data: { code: prefix, label: 'R202 isolated auth fixture' } });
  const makeUser = async (label, extra = {}) => {
    const user = await a.user.create({ data: { email: `${label}-${prefix}@example.invalid`,
      displayName: 'R202 synthetic', role: role.code, passwordHash: hashPassword('synthetic-old-password'), ...extra } });
    userIds.push(user.id);
    return user;
  };

  await runCase('independent connections admit exactly 10 account/IP attempts; other origins stay usable', async () => {
    const args = track(`${prefix}@example.invalid`);
    const results = await Promise.allSettled(Array.from({ length: 18 }, (_, i) =>
      makeLimiter(i % 2 ? a : b).consume(...args)));
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 10);
    assert.ok(results.filter(x => x.status === 'rejected').every(x => x.reason.getStatus() === 429));
    await makeLimiter(a).consume(...track(args[0], otherIp));
    await makeLimiter(b).consume(...track(`other-${prefix}@example.invalid`));
    // Restart/new instance uses the same committed budget.
    await assert.rejects(makeLimiter(observer).consume(...args), e => e.getStatus() === 429);
    const key = passwordLoginKeys(...args)[1];
    const [before] = await a.$queryRaw`SELECT window_start FROM password_login_rate_limits WHERE rate_key = ${key}`;
    await assert.rejects(makeLimiter(b).consume(...args), e => e.getStatus() === 429);
    const [after] = await a.$queryRaw`SELECT window_start FROM password_login_rate_limits WHERE rate_key = ${key}`;
    assert.equal(after.window_start.getTime(), before.window_start.getTime());
    const pairKeys = passwordLoginKeys(...args);
    await a.$executeRaw(Prisma.sql`UPDATE password_login_rate_limits SET window_start = clock_timestamp() - interval '301 seconds'
      WHERE rate_key IN (${Prisma.join(pairKeys)})`);
    await makeLimiter(b).consume(...args);
  });

  await runCase('IP ceiling survives rotating accounts; failed reservation rolls back both keys', async () => {
    const address = `2001:db8:abcd:${Math.floor(Math.random() * 65536).toString(16)}::1`;
    for (let i = 0; i < 60; i++) await makeLimiter(i % 2 ? a : b).consume(...track(`${prefix}-${i}@example.invalid`, address));
    await assert.rejects(makeLimiter(observer).consume(...track(`last-${prefix}@example.invalid`, address)), e => e.getStatus() === 429);
    const rollbackArgs = track(`rollback-${prefix}@example.invalid`, '198.51.100.202');
    const broken = { $transaction: (callback, options) => a.$transaction(tx => callback(new Proxy(tx, {
      get(target, prop) {
        if (prop === '$executeRaw') return async () => { throw Error('injected cleanup failure'); };
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    })), options) };
    await assert.rejects(makeLimiter(broken).consume(...rollbackArgs), e => e.getStatus() === 503);
    const rollbackKeys = passwordLoginKeys(...rollbackArgs);
    const rows = await observer.$queryRaw(Prisma.sql`SELECT rate_key FROM password_login_rate_limits
      WHERE rate_key IN (${Prisma.join(rollbackKeys)})`);
    assert.equal(rows.length, 0);
    await makeLimiter(b).consume(...rollbackArgs);
  });

  await runCase('own sessions filter before pagination, retain revoked history, scope and current session', async () => {
    const user = await makeUser('sessions'), other = await makeUser('other');
    const currentId = randomUUID();
    const now = Date.now();
    const data = Array.from({ length: 56 }, (_, i) => {
      const id = i === 0 ? currentId : randomUUID();
      return { id, userId: i >= 52 ? other.id : user.id,
        sessionTokenHash: hash(`${prefix}-session-${id}`), csrfTokenHash: hash(`${prefix}-csrf-${id}`),
        createdAt: new Date(now - (1000 - i) * 1000), lastSeenAt: new Date(now - (1000 - i) * 1000),
        expiresAt: new Date(now + (i >= 47 && i < 52 ? -60000 : 3600000)),
        revokedAt: i >= 35 && i < 47 ? new Date(now - 1000) : null,
        ipAddress: '192.0.2.202', userAgent: i === 0 ? 'Literal%_fixture' : i % 3 === 0 ? 'Agent-Mark' : 'Other-Agent' };
    });
    await a.userSession.createMany({ data });
    const actor = { userId: user.id, sessionId: currentId };
    const first = await listOwnSessions(a, actor, { per_page: 10 });
    assert.equal(first.total, 35); assert.equal(first.active_count, 35);
    assert.equal(first.items[0].id, currentId); assert.equal(first.items[0].current, true);
    const second = await listOwnSessions(b, actor, { page: 2, per_page: 10 });
    assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 20);
    const history = await listOwnSessions(a, actor, { view: 'history', per_page: 25 });
    assert.equal(history.total, 17); assert.equal(history.active_count, 35);
    assert.equal(history.items.filter(row => row.revoked_at).length, 12);
    const all = await listOwnSessions(a, actor, { view: 'all', per_page: 50, page: 999 });
    assert.equal(all.total, 52); assert.equal(all.page, 2); assert.equal(all.items.length, 2);
    const search = await listOwnSessions(a, actor, { view: 'all', q: '%_' });
    assert.equal(search.total, 1); assert.equal(search.items[0].id, currentId);
    const noMatch = await listOwnSessions(a, actor, { q: 'absent-synthetic-query', page: 999 });
    assert.equal(noMatch.total, 0); assert.equal(noMatch.page, 1); assert.equal(noMatch.total_pages, 1);
    const auth = new AuthService(a, { record: async () => {} }, {}, { consume: async () => {} });
    await assert.rejects(auth.revokeSession(currentId, actor), e => e.getStatus() === 403);
    await auth.revokeSession(second.items[0].id, actor);
    assert.equal((await listOwnSessions(a, actor)).active_count, 34);
    const foreign = data.find(row => row.userId === other.id);
    await assert.rejects(auth.revokeSession(foreign.id, actor), e => e.getStatus() === 401);
  });

  for (const mode of ['password-session', 'password-challenge', 'completed-mfa']) {
    await runCase(`reset commits after verification: ${mode} is fenced across connections`, async () => {
      const user = await makeUser(mode, { mfaEnabled: mode !== 'password-session' });
      const reached = gate(), resume = gate();
      const wrapped = new Proxy(a, { get(target, prop) {
        if (prop === '$transaction') return async (callback, options) => {
          reached.resolve(); await resume.promise;
          return target.$transaction(callback, options);
        };
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      const mfa = new MfaService(a, {}, {}, { isEnforcementRequired: () => false });
      mfa.verifyLoginChallenge = async () => ({ ...user }); // Already-verified MFA boundary.
      const auth = new AuthService(wrapped, {}, mfa, { consume: async () => {} });
      const login = mode === 'completed-mfa'
        ? auth.completeMfaLogin({ mfaToken: 'synthetic', code: '123456' })
        : auth.login({ email: user.email, password: 'synthetic-old-password' });
      const rejected = assert.rejects(login, error => error.getStatus() === 401);
      try {
        await reached.promise;
        await b.$transaction(async tx => {
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(20261102, 20201)`;
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
          await tx.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('new-synthetic-password') } });
          await tx.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
          await tx.mfaLoginChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
        });
      } finally { resume.resolve(); }
      await rejected;
      assert.equal(await observer.userSession.count({ where: { userId: user.id } }), 0);
      assert.equal(await observer.mfaLoginChallenge.count({ where: { userId: user.id } }), 0);
      assert.equal(await observer.auditLog.count({ where: { actorId: user.id } }), 0);
      // Unchanged credentials still work through the real issuing transaction.
      const normal = new AuthService(a, {}, mfa, { consume: async () => {} });
      const result = await normal.login({ email: user.email, password: 'new-synthetic-password' });
      assert.equal(result.kind, user.mfaEnabled ? 'mfa_challenge' : 'session');
    });
  }
});
