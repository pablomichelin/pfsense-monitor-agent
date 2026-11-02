import './report202-auth-source-support.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { request } from 'node:http';
import { createHmac } from 'node:crypto';
const require = createRequire(import.meta.url);
const { FastifyAdapter } = require('@nestjs/platform-fastify');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { registerJsonBodyParser } = require('../src/auth/json-body-parser.ts');
const { PasswordLoginLimitService, passwordLoginKeys, loginIpKey } = require('../src/auth/password-login-limit.service.ts');
const { AuthService } = require('../src/auth/auth.service.ts');
const { hashPassword } = require('../src/auth/password-hash.ts');
const { resolveLoginClientIp } = require('../src/auth/login-client-ip.ts');
const { listOwnSessions } = require('../src/auth/own-sessions.ts');
const { ListOwnSessionsQueryDto } = require('../src/auth/dto/list-own-sessions-query.dto.ts');

function send(port, method, chunks, headers = { 'transfer-encoding': 'chunked' }) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/echo', method,
      headers: { 'content-type': 'application/json', ...headers } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('R202-08 real HTTP chunked/empty JSON preserves exact raw bytes and HMAC', async t => {
  const adapter = new FastifyAdapter({ bodyLimit: 128 });
  registerJsonBodyParser(adapter);
  adapter.registerParserMiddleware('', true); // Nest initialization must not replace it.
  const app = adapter.getInstance();
  const hmac = bytes => createHmac('sha256', 'synthetic-hmac-only').update(bytes).digest('hex');
  app.route({ method: ['POST', 'DELETE', 'PUT'], url: '/echo', handler: req => ({
    body: req.body, raw: req.rawBody.toString('base64'), hmac: hmac(req.rawBody),
    chunked: req.headers['transfer-encoding'] === 'chunked',
  }) });
  await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => app.close());
  const port = app.server.address().port;
  const bytes = Buffer.from('{ "name": "ação", "n": 17 }');
  for (const method of ['POST', 'DELETE', 'PUT']) {
    const reply = await send(port, method, [bytes.subarray(0, 13), bytes.subarray(13, 16), bytes.subarray(16)]);
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.body, { name: 'ação', n: 17 });
    assert.equal(reply.body.raw, bytes.toString('base64'));
    assert.equal(reply.body.hmac, hmac(bytes));
    assert.equal(reply.body.chunked, true);
  }
  for (const method of ['POST', 'DELETE']) {
    for (const headers of [{ 'transfer-encoding': 'chunked' }, { 'content-length': '0' }, {}]) {
      const reply = await send(port, method, [], headers);
      assert.equal(reply.status, 200);
      assert.deepEqual(reply.body.body, {});
      assert.equal(reply.body.raw, '');
      assert.equal(reply.body.hmac, hmac(Buffer.alloc(0)));
    }
  }
  const fixed = await send(port, 'POST', [bytes], { 'content-length': String(bytes.length) });
  assert.equal(fixed.body.hmac, hmac(bytes));
  for (const text of ['{', ' ', '{"__proto__":{"polluted":true}}', '{"constructor":{"prototype":{"bad":1}}}']) {
    assert.equal((await send(port, 'POST', [text])).status, 400);
  }
  assert.equal((await send(port, 'PUT', [])).status, 400);
  assert.equal((await send(port, 'POST', ['{"large":"', 'x'.repeat(150), '"}'])).status, 413);
});

// Behavioral stand-in only; actual SQL, locks and competing connections belong to the PG harness.
function budgetFixture() {
  const rows = new Map();
  let now = 0, calls = 0;
  let tail = Promise.resolve();
  const prisma = { $transaction: callback => {
    const result = tail.then(async () => {
      calls++;
      const saved = structuredClone(rows);
      const tx = {
        $queryRaw: async (strings, ...values) => {
          if (strings.join('').includes('pg_advisory_xact_lock')) return [{ locked: 1 }];
          assert.match(strings.join(''), /ON CONFLICT/);
          const [key, seconds, cap] = values;
          let row = rows.get(key);
          if (!row || row.start <= now - seconds * 1000) row = { start: now, attempts: 1 };
          else row = { ...row, attempts: Math.min(row.attempts + 1, cap) };
          rows.set(key, row);
          return [{ attempts: row.attempts }];
        },
        $executeRaw: async () => 0,
      };
      try { return await callback(tx); }
      catch (error) { rows.clear(); for (const pair of saved) rows.set(...pair); throw error; }
    });
    tail = result.catch(() => {});
    return result;
  } };
  const make = () => {
    const limiter = new PasswordLoginLimitService(prisma);
    limiter.logger = { warn() {}, error() {} };
    return limiter;
  };
  return { make, rows, advance: n => { now += n; }, calls: () => calls };
}

test('R202-17 key canonicalization, IPv6 /64, mapped IPv4 and spoofed headers', () => {
  assert.deepEqual(passwordLoginKeys(' Person@Example.Invalid ', '::ffff:192.0.2.1'),
    passwordLoginKeys('person@example.invalid', '192.0.2.1'));
  assert.equal(loginIpKey('2001:0db8:0000:0001::a'), loginIpKey('2001:db8:0:1:ffff::b'));
  assert.equal(loginIpKey('::ffff:c000:201'), '192.0.2.1');
  assert.equal(loginIpKey('garbage'), 'unknown');
  assert.equal(resolveLoginClientIp({ headers: { 'cf-connecting-ip': '192.0.2.9' },
    ip: '192.0.2.9', socket: { remoteAddress: '198.51.100.1' } }), '198.51.100.1');
});

test('R202-17 shared budget admits 10 account/IP attempts and does not lock other origins/accounts', async () => {
  const f = budgetFixture();
  const a = f.make(), b = f.make();
  const replies = await Promise.allSettled(Array.from({ length: 18 }, (_, i) =>
    (i % 2 ? a : b).consume('fixture@example.invalid', '192.0.2.1')));
  assert.equal(replies.filter(x => x.status === 'fulfilled').length, 10);
  assert.ok(replies.filter(x => x.status === 'rejected').every(x => x.reason.getStatus() === 429));
  await a.consume('fixture@example.invalid', '192.0.2.2');
  await b.consume('someone-else@example.invalid', '192.0.2.1');
  const key = passwordLoginKeys('fixture@example.invalid', '192.0.2.1')[1];
  f.advance(299999);
  await assert.rejects(a.consume('fixture@example.invalid', '192.0.2.1'), e => e.getStatus() === 429);
  assert.equal(f.rows.get(key).start, 0); // Denials never extend the window.
  f.advance(1);
  await b.consume('fixture@example.invalid', '192.0.2.1');
  assert.equal(f.rows.get(key).attempts, 1);
});

test('R202-17 rotating emails cannot evade the IP ceiling; DB errors fail closed', async () => {
  const f = budgetFixture(), limiter = f.make();
  for (let i = 0; i < 60; i++) await limiter.consume(`user${i}@example.invalid`, '192.0.2.3');
  await assert.rejects(limiter.consume('new@example.invalid', '192.0.2.3'), e => e.getStatus() === 429);
  const broken = new PasswordLoginLimitService({ $transaction: async () => { throw Error('synthetic'); } });
  broken.logger = { error() {} };
  await assert.rejects(broken.consume('x@example.invalid', '192.0.2.1'), e => e.getStatus() === 503);
});

test('R202-17 login boundary reserves before DB/password; generic errors, session and MFA preserved', async () => {
  const f = budgetFixture();
  let reads = 0, user = null, sessions = 0, challenges = 0;
  const prisma = { user: { findUnique: async () => { reads++; return user; } } };
  prisma.$transaction = async callback => callback({
    $queryRaw: async () => [{ locked: 1 }], user: prisma.user,
    auditLog: { create: async () => ({}) },
  });
  const auth = new AuthService(prisma, { record: async () => {} }, {
    isEnforcementRequired: () => false,
    createLoginChallenge: async () => { challenges++; return { token: 'synthetic', expiresAt: new Date() }; },
  }, f.make());
  auth.logger = { warn() {} };
  auth.createSession = async () => { sessions++; return { kind: 'session' }; };
  const input = { email: 'user@example.invalid', password: 'synthetic-password', ipAddress: '192.0.2.8' };
  const failure = async value => {
    try { await auth.login(value); assert.fail('must reject'); } catch (e) { return e.getResponse(); }
  };
  const unknown = await failure(input);
  user = { id: 'user', email: input.email, displayName: 'Synthetic', role: 'operator',
    status: 'inactive', passwordHash: hashPassword(input.password), mfaEnabled: false };
  assert.deepEqual(await failure(input), unknown);
  user.status = 'active';
  assert.equal((await auth.login(input)).kind, 'session');
  user.mfaEnabled = true;
  assert.equal((await auth.login(input)).kind, 'mfa_challenge');
  assert.equal(sessions, 1); assert.equal(challenges, 1);
  for (let i = 0; i < 6; i++) await failure({ ...input, password: 'wrong-password' });
  const before = reads;
  const limited = await failure(input);
  assert.equal(limited.statusCode, 429);
  assert.equal(reads, before);
  assert.equal((await auth.login({ ...input, ipAddress: '192.0.2.9' })).kind, 'mfa_challenge');
});

test('R202-18 stale password and completed MFA cannot issue sessions/challenges after reset', async () => {
  const base = { id: 'synthetic', email: 'race@example.invalid', role: 'operator', status: 'active',
    displayName: 'Fixture', passwordHash: hashPassword('previous-password'), mfaEnabled: false, mfaSecret: null };
  for (const kind of ['password-session', 'password-challenge', 'completed-mfa']) {
    let user = { ...base, mfaEnabled: kind !== 'password-session' };
    let writes = 0;
    const locks = [];
    const tx = { $queryRaw: async strings => { locks.push(strings.join('')); return []; },
      user: { findUnique: async () => ({ ...user }) },
      userSession: { create: async () => { writes++; } }, auditLog: { create: async () => { writes++; } } };
    const prisma = { user: tx.user, $transaction: async callback => {
      // Reset commits after password/MFA validation and before the issuing transaction.
      user = { ...user, passwordHash: hashPassword('replacement-password') };
      return callback(tx);
    } };
    const auth = new AuthService(prisma, {}, {
      isEnforcementRequired: () => false,
      verifyLoginChallenge: async () => ({ ...user }),
      createLoginChallenge: async () => { writes++; return { token: 'must-not-issue' }; },
    }, { consume: async () => {} });
    const run = kind === 'completed-mfa'
      ? auth.completeMfaLogin({ mfaToken: 'fixture', code: '123456' })
      : auth.login({ email: user.email, password: 'previous-password' });
    await assert.rejects(run, error => error.getStatus() === 401);
    assert.equal(writes, 0);
    assert.match(locks[0], /pg_advisory_xact_lock\(20261102, 20201\)/);
    assert.match(locks[1], /FOR UPDATE/);
  }
});

test('R202-18 unchanged completed MFA and password logins issue session and audit in one transaction', async () => {
  const user = { id: 'synthetic', email: 'safe@example.invalid', role: 'operator', status: 'active',
    displayName: 'Fixture', passwordHash: hashPassword('valid-password'), mfaEnabled: false, mfaSecret: null };
  let sessions = 0, audits = 0;
  const tx = { $queryRaw: async () => [], user: { findUnique: async () => ({ ...user }) },
    userSession: { create: async () => { sessions++; } }, auditLog: { create: async () => { audits++; } } };
  const auth = new AuthService({ user: tx.user, $transaction: async callback => callback(tx) }, {}, {
    isEnforcementRequired: () => false, verifyLoginChallenge: async () => ({ ...user }),
  }, { consume: async () => {} });
  assert.equal((await auth.login({ email: user.email, password: 'valid-password' })).kind, 'session');
  user.mfaEnabled = true;
  assert.equal((await auth.completeMfaLogin({ mfaToken: 'fixture', code: '123456' })).kind, 'session');
  assert.equal(sessions, 2); assert.equal(audits, 2);
});

test('R202-13 DTO rejects excessive/invalid pagination and normalizes query', async () => {
  for (const input of [{ per_page: '1000' }, { page: '0' }, { page: '1.5' }, { view: 'other' }, { q: 'x'.repeat(201) }]) {
    assert.ok((await validate(plainToInstance(ListOwnSessionsQueryDto, input))).length);
  }
  const valid = plainToInstance(ListOwnSessionsQueryDto, { per_page: '10', page: '2', q: ' Firefox ' });
  assert.equal((await validate(valid)).length, 0);
  assert.equal(valid.q, 'Firefox');
});

test('R202-13 snapshot, filter-before-limit, actor scope, stable sort and response contract', async () => {
  const actor = { userId: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002' };
  const seen = [];
  const prisma = { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return callback({ $queryRaw: async sql => {
      seen.push(sql);
      if (seen.length === 1) return [{ total: 11n, active_count: 7n }];
      return [{ id: actor.sessionId, created_at: new Date(0), last_seen_at: null,
        expires_at: new Date(1000), revoked_at: new Date(500), ip_address: null, user_agent: 'fixture' }];
    } });
  } };
  const result = await listOwnSessions(prisma, actor, { view: 'history', q: '%_Firefox', page: 99, per_page: 10 });
  assert.deepEqual({ ...result, items: undefined }, { items: undefined, total: 11, active_count: 7, page: 2, total_pages: 2, per_page: 10 });
  assert.equal(result.items[0].current, true);
  assert.equal(result.items[0].revoked_at, new Date(500).toISOString());
  for (const sql of seen) {
    assert.ok(sql.values.includes(actor.userId));
    assert.ok(sql.values.includes('%_firefox'));
    assert.match(sql.sql, /POSITION/);
    assert.match(sql.sql, /NOT \(revoked_at IS NULL/);
  }
  assert.match(seen[1].sql, /WHERE.*[\s\S]*ORDER BY[\s\S]*coalesce\(last_seen_at, created_at\) DESC, id DESC[\s\S]*LIMIT/);
  assert.deepEqual(seen[1].values.slice(-2), [10, 10]);
  await assert.rejects(listOwnSessions(prisma, actor, { per_page: 1000 }), e => e.getStatus() === 400);
});
