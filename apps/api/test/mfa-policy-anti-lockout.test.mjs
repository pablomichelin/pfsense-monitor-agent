import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessBlockingReadiness,
  describeMfaMode,
  isRoleEnforced,
  normalizeEnforcedRoles,
  resolveEffectiveMfaPolicy,
  validatePolicyUpdate,
} from '../dist/mfa-policy/mfa-policy.util.js';

test('resolveEffectiveMfaPolicy prefers env override when defined', () => {
  const stored = { enforcedRoles: ['admin'], enforcementBlocking: false };
  const env = {
    enforcedRolesDefined: true,
    enforcedRoles: ['superadmin'],
    enforcementBlockingDefined: true,
    enforcementBlocking: true,
  };

  assert.deepEqual(resolveEffectiveMfaPolicy(stored, env), {
    enforcedRoles: ['superadmin'],
    enforcementBlocking: true,
  });
});

test('resolveEffectiveMfaPolicy uses stored values without env override', () => {
  const stored = { enforcedRoles: ['operator'], enforcementBlocking: true };
  const env = {
    enforcedRolesDefined: false,
    enforcedRoles: [],
    enforcementBlockingDefined: false,
    enforcementBlocking: false,
  };

  assert.deepEqual(resolveEffectiveMfaPolicy(stored, env), stored);
});

test('assessBlockingReadiness blocks without qualified superadmin', () => {
  const result = assessBlockingReadiness({
    activeSuperadmins: [
      { mfaEnabled: false, recoveryCodesRemaining: 0 },
      { mfaEnabled: true, recoveryCodesRemaining: 0 },
    ],
  });

  assert.equal(result.ready, false);
  assert.match(result.reason ?? '', /superadmin/i);
});

test('assessBlockingReadiness accepts superadmin with MFA and recovery code', () => {
  const result = assessBlockingReadiness({
    activeSuperadmins: [
      { mfaEnabled: false, recoveryCodesRemaining: 0 },
      { mfaEnabled: true, recoveryCodesRemaining: 2 },
    ],
  });

  assert.equal(result.ready, true);
  assert.equal(result.qualifiedCount, 1);
});

test('validatePolicyUpdate rejects blocking when readiness fails', () => {
  const result = validatePolicyUpdate({
    nextEnforcedRoles: ['admin'],
    nextBlocking: true,
    allowedRoleCodes: ['superadmin', 'admin'],
    activeSuperadmins: [{ mfaEnabled: true, recoveryCodesRemaining: 0 }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /recuperacao/i);
  }
});

test('validatePolicyUpdate allows soft enforcement without blocking readiness', () => {
  const result = validatePolicyUpdate({
    nextEnforcedRoles: ['admin', 'superadmin'],
    nextBlocking: false,
    allowedRoleCodes: ['superadmin', 'admin'],
    activeSuperadmins: [{ mfaEnabled: false, recoveryCodesRemaining: 0 }],
  });

  assert.equal(result.ok, true);
});

test('normalizeEnforcedRoles deduplicates and sorts valid roles', () => {
  assert.deepEqual(
    normalizeEnforcedRoles(['admin', 'superadmin', 'admin', 'invalid'], [
      'superadmin',
      'admin',
    ]),
    ['admin', 'superadmin'],
  );
});

test('describeMfaMode reflects enforcement and blocking flags', () => {
  assert.equal(describeMfaMode({ enforcedRoles: [], enforcementBlocking: false }), 'off');
  assert.equal(
    describeMfaMode({ enforcedRoles: ['admin'], enforcementBlocking: false }),
    'soft',
  );
  assert.equal(
    describeMfaMode({ enforcedRoles: ['admin'], enforcementBlocking: true }),
    'blocking',
  );
});

test('isRoleEnforced checks membership in effective policy', () => {
  const policy = { enforcedRoles: ['admin'], enforcementBlocking: false };
  assert.equal(isRoleEnforced('admin', policy), true);
  assert.equal(isRoleEnforced('operator', policy), false);
});
