import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { authenticator } = require('otplib');
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (mod, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
  });
  mod._compile(outputText, filename);
};
let MfaService, NodeSecretCryptoService, appConfig;
try {
  ({ MfaService } = require('../src/auth/mfa.service.ts'));
  ({ NodeSecretCryptoService } = require('../src/common/node-secret-crypto.service.ts'));
  ({ appConfig } = require('../src/config/app-config.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

const userId = '20000000-0000-4000-8000-000000000001';
const input = { userId, email: 'mfa-fixture@example.invalid' };

function fixture({ rejectEnableWrite = false } = {}) {
  const state = {
    user: {
      id: userId, role: 'admin', mfaEnabled: false, mfaSecret: null, mfaEnrolledAt: null,
      mfaFailedAttemptCount: 2, mfaFailedWindowStart: new Date('2026-01-01T00:00:00Z'),
    },
    recoveryCodes: [{ userId, codeHash: 'previous-synthetic-entry' }],
    events: [],
  };
  let inTransaction = false;
  const db = {
    $transaction: async (run) => {
      assert.equal(inTransaction, false);
      inTransaction = true;
      let locked = false;
      const user = structuredClone(state.user);
      let recoveryCodes = structuredClone(state.recoveryCodes);
      const assertLocked = () => assert.ok(locked, 'enrollment state must be accessed after acquiring the user lock');
      const tx = {
        $queryRaw: async (sql, id) => {
          assert.match(sql.join('?'), /SELECT id FROM users WHERE id = \?::uuid FOR UPDATE/);
          assert.equal(id, userId);
          state.events.push('user lock');
          locked = true;
          return [{ id }];
        },
        user: {
          findUnique: async ({ where }) => {
            assertLocked();
            assert.deepEqual(where, { id: userId });
            state.events.push('read user');
            return structuredClone(user);
          },
          update: async ({ where, data }) => {
            assertLocked();
            assert.deepEqual(where, { id: userId });
            if (rejectEnableWrite && data.mfaEnabled) throw new Error('synthetic write failure');
            Object.assign(user, data);
            state.events.push('write user');
          },
        },
        mfaRecoveryCode: {
          deleteMany: async ({ where }) => {
            assertLocked();
            assert.deepEqual(where, { userId });
            state.events.push('delete old hashes');
            recoveryCodes = [];
          },
          createMany: async ({ data }) => {
            assertLocked();
            state.events.push('write recovery hashes');
            recoveryCodes.push(...structuredClone(data));
          },
        },
      };
      try {
        const result = await run(tx);
        state.user = user;
        state.recoveryCodes = recoveryCodes;
        state.events.push('commit');
        return result;
      } finally {
        inTransaction = false;
      }
    },
  };
  const crypto = new NodeSecretCryptoService();
  const service = new MfaService(db, crypto, {
    record: async ({ actorId, action }) => {
      assert.equal(inTransaction, false);
      assert.equal(actorId, userId);
      state.events.push(action);
    },
  }, {});
  return { state, service, crypto };
}

test('starting and restarting pending enrollment preserves the QR contract and stores only an encrypted secret', async () => {
  const { state, service, crypto } = fixture();
  const first = await service.startEnrollment(input);
  const next = await service.startEnrollment(input);
  assert.notEqual(next.secret, first.secret);
  assert.deepEqual(Object.keys(next).sort(), ['otpauth_uri', 'qr_data_url', 'secret']);
  assert.equal(new URL(next.otpauth_uri).searchParams.get('secret'), next.secret);
  assert.match(next.qr_data_url, /^data:image\/png;base64,/);
  assert.notEqual(state.user.mfaSecret, next.secret);
  assert.equal(crypto.decrypt(state.user.mfaSecret), next.secret);
  assert.equal(state.user.mfaEnabled, false);
  assert.equal(state.user.mfaEnrolledAt, null);
  assert.deepEqual(state.events, Array.from({ length: 2 }, () => [
    'user lock', 'read user', 'write user', 'commit', 'auth.mfa.enroll_start',
  ]).flat());
});

test('valid TOTP enrollment commits the enabled flag and one set of recovery hashes under the user lock', async () => {
  const { state, service } = fixture();
  const setup = await service.startEnrollment(input);
  const encryptedSecret = state.user.mfaSecret;
  const token = authenticator.generate(setup.secret);
  state.events.length = 0;
  const { recovery_codes: codes } = await service.confirmEnrollment({
    userId, code: `${token.slice(0, 3)} ${token.slice(3)}`,
  });
  assert.equal(codes.length, appConfig.mfa.recoveryCodeCount);
  assert.equal(state.user.mfaEnabled, true);
  assert.equal(state.user.mfaSecret, encryptedSecret);
  assert.ok(state.user.mfaEnrolledAt instanceof Date);
  assert.equal(state.user.mfaFailedAttemptCount, 0);
  assert.equal(state.user.mfaFailedWindowStart, null);
  assert.deepEqual(state.recoveryCodes, codes.map((code) => {
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    return { userId, codeHash: createHash('sha256').update(code.replace('-', '')).digest('hex') };
  }));
  assert.deepEqual(state.events, [
    'user lock', 'read user', 'delete old hashes', 'write recovery hashes',
    'write user', 'commit', 'auth.mfa.enabled',
  ]);

  const committed = structuredClone({ user: state.user, codes: state.recoveryCodes });
  await assert.rejects(service.startEnrollment(input), { message: 'MFA already enabled; disable it first' });
  await assert.rejects(service.confirmEnrollment({ userId, code: token }), { message: 'MFA already enabled' });
  assert.deepEqual({ user: state.user, codes: state.recoveryCodes }, committed);
});

test('invalid enrollment TOTP leaves pending state and recovery hashes intact', async () => {
  const { state, service } = fixture();
  await service.startEnrollment(input);
  const pending = structuredClone({ user: state.user, codes: state.recoveryCodes });
  state.events.length = 0;
  await assert.rejects(service.confirmEnrollment({ userId, code: '12345x' }), (error) =>
    error.getStatus() === 401 && error.message === 'invalid TOTP code');
  assert.deepEqual({ user: state.user, codes: state.recoveryCodes }, pending);
  assert.deepEqual(state.events, ['user lock', 'read user']);
});

test('a failed enable write leaves the pending enrollment and recovery hashes intact', async () => {
  const { state, service } = fixture({ rejectEnableWrite: true });
  const setup = await service.startEnrollment(input);
  const pending = structuredClone({ user: state.user, codes: state.recoveryCodes });
  state.events.length = 0;
  await assert.rejects(service.confirmEnrollment({ userId, code: authenticator.generate(setup.secret) }),
    { message: 'synthetic write failure' });
  assert.deepEqual({ user: state.user, codes: state.recoveryCodes }, pending);
  assert.deepEqual(state.events, ['user lock', 'read user', 'delete old hashes', 'write recovery hashes']);
});
